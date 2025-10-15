import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RefreshCw, CalendarDays } from "lucide-react";
import { ZodiacCard } from "@/components/ZodiacCard";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { AppHeader } from "@/components/AppHeader";
import { useToast } from "@/hooks/use-toast";
import { useHomeFavorites } from "@/hooks/use-favorites";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import iconImage from "@assets/icon.png";

interface ZodiacSign {
  id: number;
  name_italian: string;
  name_english: string;
  date_range: string;
  symbol: string;
}

interface HoroscopeAggregate {
  avgRelazioni: number;
  avgLavoro: number;
  avgBenessere: number;
  overallAverage: number;
  majorityTone?: "positive" | "neutral" | "negative";
}

export default function Home() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [refreshProgress, setRefreshProgress] = useState({
    current: 0,
    total: 0,
  });
  const [refreshDismissed, setRefreshDismissed] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize hook for favorites only
  const { homeFavorites, isHomeFavorite, toggleHomeFavorite, hasFavorites } =
    useHomeFavorites();

  // Get date string for API calls using local date (avoid timezone issues)
  const selectedDateString = selectedDate.toLocaleDateString("en-CA"); // YYYY-MM-DD format in local timezone

  // Get date range for calendar (90 days back) - use day boundaries
  const today = new Date();
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const earliestStart = new Date(todayStart);
  earliestStart.setDate(earliestStart.getDate() - 90);

  // Fetch zodiac signs
  const { data: zodiacSigns = [], isLoading: signsLoading } = useQuery<
    ZodiacSign[]
  >({
    queryKey: ["/api/zodiac-signs"],
  });

  // Fetch aggregates for all signs
  const { data: aggregatesData = {}, isLoading: aggregatesLoading } = useQuery<
    Record<string, HoroscopeAggregate>
  >({
    queryKey: ["/api/horoscopes/aggregates", selectedDateString],
    queryFn: async () => {
      const results: Record<string, HoroscopeAggregate> = {};

      for (const sign of zodiacSigns) {
        try {
          const response = await fetch(
            `/api/horoscopes/aggregate?date=${selectedDateString}&sign=${sign.name_english}`,
          );
          if (response.ok) {
            results[sign.name_english] = await response.json();
          }
        } catch (error) {
          console.error(
            `Failed to fetch aggregate for ${sign.name_english}:`,
            error,
          );
        }
      }

      return results;
    },
    enabled: zodiacSigns.length > 0,
  });

  // Refresh all data mutation
  const refreshAllMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        "POST",
        `/api/refresh/all?date=${selectedDateString}`,
      );
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Aggiornamento avviato",
        description: `${data.jobsEnqueued} aggiornamenti in corso`,
      });

      // Poll for updates (simplified - in production you might use WebSocket)
      setRefreshProgress({ current: 0, total: data.jobsEnqueued });
      setRefreshDismissed(false);

      pollIntervalRef.current = setInterval(async () => {
        // Don't update progress if user dismissed the overlay
        if (refreshDismissed) return;

        try {
          const statusResponse = await fetch("/api/refresh/status");
          if (statusResponse.ok) {
            const status = await statusResponse.json();
            const completed = status.summary.completed + status.summary.failed;
            setRefreshProgress({
              current: completed,
              total: data.jobsEnqueued,
            });

            if (completed >= data.jobsEnqueued) {
              if (pollIntervalRef.current)
                clearInterval(pollIntervalRef.current);
              if (timeoutRef.current) clearTimeout(timeoutRef.current);
              setRefreshProgress({ current: 0, total: 0 });
              setRefreshDismissed(false);

              // Invalidate cache to refresh data
              queryClient.invalidateQueries({
                queryKey: ["/api/horoscopes/aggregates"],
              });

              toast({
                title: "Aggiornamento completato",
                description: `${status.summary.completed} successi, ${status.summary.failed} errori`,
              });
            }
          }
        } catch (error) {
          console.error("Error polling status:", error);
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          setRefreshProgress({ current: 0, total: 0 });
          setRefreshDismissed(false);
        }
      }, 3000);

      // Stop polling after 5 minutes
      timeoutRef.current = setTimeout(
        () => {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          setRefreshProgress({ current: 0, total: 0 });
          setRefreshDismissed(false);
        },
        5 * 60 * 1000,
      );
    },
    onError: (error) => {
      toast({
        title: "Errore",
        description: "Impossibile avviare l'aggiornamento",
        variant: "destructive",
      });
    },
  });

  const handleSignClick = (signName: string) => {
    navigate(`/sign/${signName}`);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("it-IT", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      setCalendarOpen(false);
      // Invalidate queries to fetch new data for selected date
      queryClient.invalidateQueries({
        queryKey: ["/api/horoscopes/aggregates"],
      });
    }
  };

  // Cleanup intervals/timeouts on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const isLoading = signsLoading || aggregatesLoading;
  const isRefreshing =
    !refreshDismissed &&
    (refreshAllMutation.isPending || refreshProgress.total > 0);

  const handleDismissRefresh = () => {
    setRefreshDismissed(true);
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  };

  return (
    <div className="min-h-screen text-foreground">
      {/* Header */}
      <AppHeader>
        <div className="flex items-center gap-3">
          {/* Logo con animazione pulse subtle */}
          <img 
            src={iconImage} 
            alt="Logo" 
            className="w-12 h-12 transition-transform hover:scale-110 duration-300 header-logo-glow"
          />
          <div className="header-text">
            {/* Titolo con effetto glow */}
            <h1 className="text-lg font-semibold transition-all duration-300 header-title">
              Confronta Oroscopo
            </h1>
            <p className="text-xs mt-0.5 header-subtitle">
              Tutti gli Oroscopi, una sola App
            </p>
          </div>
        </div>
      </AppHeader>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* Date Selector */}
        <div className="mb-4 flex justify-center">
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <button
                className="bg-white dark:bg-gray-800 rounded-full px-6 py-3 flex items-center gap-3 shadow-md hover:shadow-lg transition-shadow border border-gray-200 dark:border-gray-700 min-w-[280px] justify-center"
                data-testid="date-selector-trigger"
              >
                <CalendarDays className="w-5 h-5 text-[#E1B64E]" />
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {formatDate(selectedDate)}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <div className="p-3 border-b border-border">
                <h4 className="text-sm font-medium">Seleziona Data</h4>
                <p className="text-xs text-muted-foreground">
                  Ultimi 60 giorni disponibili
                </p>
              </div>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleDateSelect}
                disabled={(date) => date < earliestStart || date > todayStart}
                toDate={todayStart}
                defaultMonth={selectedDate}
                className="border-0"
                data-testid="date-calendar"
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Favorites Section */}
        {hasFavorites && (
          <div className="mb-8">
            <div className="flex items-center space-x-2 mb-4">
              <h2 className="text-lg font-bold text-[#E1B64E]">
                I tuoi Segni Preferiti
              </h2>
              <span
                className="px-2 py-1 rounded-full text-xs font-medium"
                style={{ backgroundColor: "#FEF9E7", color: "#E1B64E" }}
              >
                {homeFavorites.size}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {zodiacSigns
                .filter((sign) => isHomeFavorite(sign.name_english))
                .map((sign) => (
                  <ZodiacCard
                    key={`fav-${sign.id}`}
                    sign={sign}
                    aggregate={aggregatesData[sign.name_english]}
                    onClick={() => handleSignClick(sign.name_english)}
                    isFavorite={true}
                    onToggleFavorite={() =>
                      toggleHomeFavorite(sign.name_english)
                    }
                    className="ring-2 ring-red-200 border-red-300"
                  />
                ))}
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 12 }, (_, i) => (
              <div
                key={i}
                className="bg-card border border-border rounded-lg p-6 animate-pulse"
              >
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-10 h-10 bg-muted rounded-full"></div>
                  <div>
                    <div className="h-4 bg-muted rounded w-20 mb-1"></div>
                    <div className="h-3 bg-muted rounded w-24"></div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-3 bg-muted rounded"></div>
                  <div className="h-3 bg-muted rounded w-3/4"></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Zodiac Grid */}
        {!isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {zodiacSigns
              .filter((sign) => !isHomeFavorite(sign.name_english))
              .sort((a, b) => a.id - b.id)
              .map((sign) => (
                <ZodiacCard
                  key={sign.id}
                  sign={sign}
                  aggregate={aggregatesData[sign.name_english]}
                  onClick={() => handleSignClick(sign.name_english)}
                  isFavorite={isHomeFavorite(sign.name_english)}
                  onToggleFavorite={() => toggleHomeFavorite(sign.name_english)}
                />
              ))}
          </div>
        )}

        {/* Refresh Button */}
        <div className="mt-8 mb-8 flex justify-center">
          <Button
            onClick={() => refreshAllMutation.mutate()}
            disabled={isRefreshing}
            className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-lg hover:shadow-xl transition-all"
            data-testid="button-refresh-all"
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`}
            />
            Aggiorna Tutti i Dati
          </Button>
        </div>
      </main>

      {/* Loading Overlay */}
      <LoadingOverlay
        isVisible={isRefreshing}
        title="Aggiornamento in corso..."
        message="Aggiornamento previsioni in corso"
        progress={refreshProgress.current}
        total={refreshProgress.total}
        onDismiss={handleDismissRefresh}
      />

      {/* Bottom spacing for mobile navigation */}
      <div className="h-5 md:h-0"></div>
    </div>
  );
}