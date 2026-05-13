import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ArrowLeft,
  RefreshCw,
  Heart,
  Briefcase,
  Leaf,
  Star,
  ExternalLink,
  Share,
  ChevronDown,
  Loader2,
  CalendarDays,
} from "lucide-react";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { AppHeader } from "@/components/AppHeader";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useFavorites } from "@/hooks/use-favorites";
import { apiRequest } from "@/lib/queryClient";
import { ZODIAC_SIGNS_EN_IT } from "@shared/constants";
import { useAccess } from '../hooks/use-access';
import { WeekNavigator } from '@/components/WeekNavigator';
import { CompatibilityWidget } from '@/components/CompatibilityWidget';
import { UpgradeBanner } from '@/components/UpgradeBanner';

interface SignDetailProps {
  sign: string;
}

interface ZodiacSign {
  id: number;
  name_italian: string;
  name_english: string;
  date_range: string;
  symbol: string;
}

interface HoroscopeData {
  id: number;
  superquote: string | null;
  summary: string;
  relazioni_rating: number;
  lavoro_rating: number;
  salute_rating: number;
  tone_analysis: "positive" | "neutral" | "negative";
  original_url: string;
  scraped_at: string;
  source: {
    id: number;
    name: string;
    domain: string;
    logo_url: string | null;
    reliability_score: number;
  };
}

interface HoroscopeAggregate {
  avgRelazioni: number | null;
  avgLavoro: number | null;
  avgBenessere: number | null;
  overallAverage: number | null;
  majorityTone?: "positive" | "neutral" | "negative";
}

const signColors = {
  ariete: "from-red-500 to-pink-500",
  toro: "from-green-500 to-emerald-500",
  gemelli: "from-yellow-500 to-orange-500",
  cancro: "from-blue-500 to-cyan-500",
  leone: "from-orange-500 to-red-500",
  vergine: "from-green-600 to-blue-500",
  bilancia: "from-pink-500 to-purple-500",
  scorpione: "from-red-600 to-black",
  sagittario: "from-purple-500 to-indigo-500",
  capricorno: "from-gray-600 to-gray-800",
  acquario: "from-blue-400 to-cyan-400",
  pesci: "from-blue-500 to-purple-500",
};

interface SourceIconProps {
  source: {
    id: number;
    name: string;
    domain: string;
    logo_url: string | null;
  };
  "data-testid"?: string;
}

function SourceIcon({ source, "data-testid": dataTestId }: SourceIconProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const [currentSrc, setCurrentSrc] = useState<string | null>(null);

  // Initialize source URL with HTTPS normalization, fallback to domain favicon
  const getInitialSrc = () => {
    if (source.logo_url) {
      try {
        const url = new URL(source.logo_url, "https://");
        return url.toString().replace(/^http:/, "https:");
      } catch {
        // Invalid logo_url, fallback to domain favicon
      }
    }
    // No logo_url or invalid: use Google favicon service (always HTTPS, no redirects)
    return `https://www.google.com/s2/favicons?sz=64&domain=${source.domain}`;
  };

  const initialSrc = currentSrc || getInitialSrc();

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.target as HTMLImageElement;
    const currentUrl = img.src;

    img.onerror = null;

    // Google favicon failed → last resort: direct favicon.ico
    if (currentUrl.includes('google.com/s2/favicons')) {
      img.src = `https://${source.domain}/favicon.ico`;
      img.onerror = () => setImgFailed(true);
      return;
    }

    // All sources failed
    setImgFailed(true);
  };

  // Show letter placeholder only if all images failed
  if (imgFailed) {
    return (
      <div className="relative group">
        <div
          className="w-6 h-6 bg-gradient-to-br from-orange-100 to-red-100 rounded flex items-center justify-center border border-border hover:border-orange-300 transition-colors"
          data-testid={dataTestId}
          title={source.name}
        >
          <span className="text-orange-600 font-bold text-xs">
            {source.name.charAt(0)}
          </span>
        </div>

        {/* Tooltip */}
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
          {source.name}
        </div>
      </div>
    );
  }

  return (
    <div className="relative group">
      <img
        src={initialSrc}
        alt={source.name}
        className="w-6 h-6 rounded object-contain bg-white p-0.5 border border-border hover:border-orange-300 transition-colors"
        data-testid={dataTestId}
        title={source.name}
        onError={handleImageError}
        referrerPolicy="no-referrer"
        loading="lazy"
        width={24}
        height={24}
      />

      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
        {source.name}
      </div>
    </div>
  );
}

function SignDetail({ sign }: SignDetailProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [refreshProgress, setRefreshProgress] = useState({
    current: 0,
    total: 0,
  });
  const [refreshDismissed, setRefreshDismissed] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Daily/Weekly view state
  const [viewType, setViewType] = useState<"daily" | "weekly">("daily");
  const [weekOffset, setWeekOffset] = useState(0);
  const { canAccessDate, canAccessWeeksBack, maxWeeksBack } = useAccess();

  // Initialize date from URL parameter or use today
  const getInitialDate = (): Date => {
    const params = new URLSearchParams(window.location.search);
    const dateParam = params.get('date');
    if (dateParam) {
      const parsedDate = new Date(dateParam);
      if (!isNaN(parsedDate.getTime())) {
        return parsedDate;
      }
    }
    return new Date();
  };

  const [selectedDate, setSelectedDate] = useState<Date>(getInitialDate());
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Helper function to get Monday of current week
  const getMondayOfWeek = (date: Date = new Date()): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  };

  // Helper function to format date in Italian
  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('it-IT', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Helper function to format week range in Italian
  const formatWeekRange = (startDate: Date): string => {
    const monthsIt = [
      'gen', 'feb', 'mar', 'apr', 'mag', 'giu',
      'lug', 'ago', 'set', 'ott', 'nov', 'dic'
    ];

    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);

    const startDay = startDate.getDate();
    const startMonth = monthsIt[startDate.getMonth()];
    const endDay = endDate.getDate();
    const endMonth = monthsIt[endDate.getMonth()];
    const year = endDate.getFullYear();

    if (startDate.getMonth() === endDate.getMonth()) {
      return `${startDay} ${startMonth} - ${endDay} ${endMonth} ${year}`;
    } else {
      return `${startDay} ${startMonth} - ${endDay} ${endMonth} ${year}`;
    }
  };

  const today = selectedDate.toLocaleDateString('en-CA'); // YYYY-MM-DD format in local timezone
  const weeklyBaseDate = new Date();
  weeklyBaseDate.setDate(weeklyBaseDate.getDate() - weekOffset * 7);
  const currentWeekMonday = getMondayOfWeek(weeklyBaseDate);
  // Use local date string to avoid timezone conversion issues
  const weekStartDate = `${currentWeekMonday.getFullYear()}-${String(currentWeekMonday.getMonth() + 1).padStart(2, '0')}-${String(currentWeekMonday.getDate()).padStart(2, '0')}`;
  const weekRangeText = formatWeekRange(currentWeekMonday);

  // Get date range for calendar (90 days back) - use day boundaries
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const earliestStart = new Date(todayStart);
  earliestStart.setDate(earliestStart.getDate() - 90);

  // Favorites functionality
  const { isFavorite, toggleFavorite, reorderSources, hasFavorites } = useFavorites(sign);

  // Share functionality
  const handleShare = async () => {
    const currentUrl = window.location.href;
    const displayDate = selectedDate.toLocaleDateString('it-IT', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const shareData = {
      title: `Oroscopo ${zodiacSign?.name_italian} - ${displayDate}`,
      text: `Scopri l'oroscopo di oggi per ${zodiacSign?.name_italian} su Confronta Oroscopo`,
      url: currentUrl
    };

    try {
      // Check if Web Share API is supported
      if (navigator.share) {
        await navigator.share(shareData);
        toast({
          title: "Condiviso!",
          description: "L'oroscopo è stato condiviso con successo."
        });
      } else {
        // Fallback: copy URL to clipboard
        await navigator.clipboard.writeText(currentUrl);
        toast({
          title: "Link copiato!",
          description: "Il link dell'oroscopo è stato copiato negli appunti."
        });
      }
    } catch (error) {
      // If sharing is cancelled or clipboard fails, show a fallback
      if (error instanceof Error && error.name !== 'AbortError') {
        toast({
          title: "Errore",
          description: "Non è stato possibile condividere l'oroscopo.",
          variant: "destructive"
        });
      }
    }
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      setCalendarOpen(false);

      // Update URL with selected date
      const dateParam = date.toLocaleDateString('en-CA');
      navigate(`/sign/${sign}?date=${dateParam}`, { replace: true });

      // Invalidate queries to fetch new data for selected date
      if (viewType === "daily") {
        queryClient.invalidateQueries({ queryKey: ["/api/horoscopes", today, sign] });
        queryClient.invalidateQueries({ queryKey: ["/api/horoscopes/aggregate", today, sign] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/weekly-horoscopes", weekStartDate, sign] });
        queryClient.invalidateQueries({ queryKey: ["/api/weekly-horoscopes/aggregate", weekStartDate, sign] });
      }
    }
  };

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch zodiac sign details
  const { data: zodiacSign } = useQuery<ZodiacSign>({
    queryKey: ["/api/zodiac-signs", sign],
    queryFn: async () => {
      const response = await fetch("/api/zodiac-signs");
      const signs = await response.json();
      return signs.find((s: ZodiacSign) => s.name_english === sign);
    },
  });

  // Fetch horoscope data for this sign
  const { data: horoscopes = [], isLoading: horoscopesLoading, error: horoscopesError } = useQuery<
    HoroscopeData[]
  >({
    queryKey: ["/api/horoscopes", today, sign],
    queryFn: async () => {
      const response = await fetch(
        `/api/horoscopes?date=${today}&sign=${sign}`,
      );
      if (!response.ok) throw new Error("Failed to fetch horoscopes");
      return response.json();
    },
    enabled: viewType === "daily",
  });

  // Collapse/expand functionality with sessionStorage persistence
  const [collapsedCards, setCollapsedCards] = useState<Record<number, boolean>>({});

  // Load collapsed state from sessionStorage on mount
  useEffect(() => {
    if (!horoscopes || horoscopes.length === 0) return;

    const loadCollapsedState = () => {
      const savedState: Record<number, boolean> = {};
      horoscopes.forEach(horoscope => {
        const key = `signDetail_collapsed_${horoscope.source.id}`;
        const saved = sessionStorage.getItem(key);
        if (saved !== null) {
          savedState[horoscope.source.id] = saved === 'true';
        }
      });
      setCollapsedCards(savedState);
    };

    loadCollapsedState();
  }, [horoscopes]);

  // Toggle collapse state and save to sessionStorage
  const toggleCollapse = (sourceId: number) => {
    setCollapsedCards(prev => {
      const newState = !prev[sourceId];
      sessionStorage.setItem(`signDetail_collapsed_${sourceId}`, newState.toString());
      return { ...prev, [sourceId]: newState };
    });
  };

  // Fetch aggregates for this sign
  const { data: aggregate } = useQuery<HoroscopeAggregate>({
    queryKey: ["/api/horoscopes/aggregate", today, sign],
    queryFn: async () => {
      const response = await fetch(
        `/api/horoscopes/aggregate?date=${today}&sign=${sign}`,
      );
      if (!response.ok) throw new Error("Failed to fetch aggregate");
      return response.json();
    },
    enabled: viewType === "daily",
  });

  // Fetch weekly horoscope data
  const { data: weeklyHoroscopes = [], isLoading: weeklyHoroscopesLoading, error: weeklyHoroscopesError } = useQuery<
    HoroscopeData[]
  >({
    queryKey: ["/api/weekly-horoscopes", weekStartDate, sign],
    queryFn: async () => {
      const response = await fetch(
        `/api/weekly-horoscopes?weekStartDate=${weekStartDate}&sign=${sign}`,
      );
      if (!response.ok) throw new Error("Failed to fetch weekly horoscopes");
      return response.json();
    },
    enabled: viewType === "weekly",
  });

  // Fetch weekly aggregates
  const { data: weeklyAggregate } = useQuery<HoroscopeAggregate>({
    queryKey: ["/api/weekly-horoscopes/aggregate", weekStartDate, sign],
    queryFn: async () => {
      const response = await fetch(
        `/api/weekly-horoscopes/aggregate?weekStartDate=${weekStartDate}&sign=${sign}`,
      );
      if (!response.ok) throw new Error("Failed to fetch weekly aggregate");
      return response.json();
    },
    enabled: viewType === "weekly",
  });

  // Refresh this sign mutation
  const refreshSignMutation = useMutation({
    mutationFn: async () => {
      const italianSign = ZODIAC_SIGNS_EN_IT[sign] || sign;

      if (viewType === "daily") {
        const response = await apiRequest(
          "POST",
          `/api/refresh/sign/${italianSign}?date=${today}`,
        );
        return response.json();
      } else {
        const response = await apiRequest(
          "POST",
          `/api/refresh-weekly/sign/${italianSign}?weekStartDate=${weekStartDate}`,
        );
        return response.json();
      }
    },
    onSuccess: (data) => {
      toast({
        title: "Aggiornamento avviato",
        description: `${data.jobsEnqueued} lavori in coda per ${zodiacSign?.name_italian}`,
      });

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

              // Invalidate cache to refresh data based on viewType
              if (viewType === "daily") {
                queryClient.invalidateQueries({
                  queryKey: ["/api/horoscopes", today, sign],
                });
                queryClient.invalidateQueries({
                  queryKey: ["/api/horoscopes/aggregate", today, sign],
                });
              } else {
                queryClient.invalidateQueries({
                  queryKey: ["/api/weekly-horoscopes", weekStartDate, sign],
                });
                queryClient.invalidateQueries({
                  queryKey: ["/api/weekly-horoscopes/aggregate", weekStartDate, sign],
                });
              }

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

  if (!zodiacSign) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6 text-center">
            <h2 className="text-xl font-bold mb-2">Segno non trovato</h2>
            <p className="text-muted-foreground mb-4">
              Il segno zodiacale richiesto non esiste.
            </p>
            <Button onClick={() => navigate("/")} data-testid="button-go-home">
              Torna alla Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const colorClass =
    signColors[sign as keyof typeof signColors] || "from-gray-500 to-gray-700";
  const isRefreshing =
    !refreshDismissed &&
    (refreshSignMutation.isPending || refreshProgress.total > 0);

  const handleDismissRefresh = () => {
    setRefreshDismissed(true);
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  };

  // Check if we're in a loading state
  const isLoading = viewType === "daily"
    ? (horoscopesLoading || !zodiacSign || !aggregate)
    : (weeklyHoroscopesLoading || !zodiacSign || !weeklyAggregate);

  // Early return for loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Caricamento oroscopo...</p>
        </div>
      </div>
    );
  }

  // Early return for error state
  const currentError = viewType === "daily" ? horoscopesError : weeklyHoroscopesError;
  if (currentError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-4">Errore nel caricamento dell'oroscopo</p>
          <Button onClick={() => navigate('/')}>Torna alla Home</Button>
        </div>
      </div>
    );
  }

  const currentHoroscopes = viewType === "daily" ? horoscopes : weeklyHoroscopes;
  const currentSign = zodiacSign; // Renamed for clarity with the fetched sign data

  return (
    <div className="min-h-screen text-foreground">
      {/* Header */}
      <AppHeader>
        <div className="flex items-center space-x-3 relative z-10">
          {/* Bottone Back con effetto glow */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const dateParam = selectedDate.toLocaleDateString('en-CA');
              navigate(`/?date=${dateParam}`);
            }}
            data-testid="button-back"
            className="text-white hover:bg-white/20 border border-white/30 transition-all duration-300 hover:border-[#E1B64E] hover:shadow-lg"
            style={{
              boxShadow: '0 0 15px rgba(225, 182, 78, 0.2)'
            }}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>

          <div className="flex items-center space-x-4">
            {/* Simbolo zodiacale con glow e animazione */}
            <div
              className={`w-12 h-12 bg-gradient-to-br ${colorClass} rounded-full flex items-center justify-center transition-transform hover:scale-110 duration-300`}
              style={{
                boxShadow: '0 0 20px rgba(225, 182, 78, 0.4), 0 0 40px rgba(225, 182, 78, 0.2)',
                border: '2px solid rgba(225, 182, 78, 0.3)'
              }}
            >
              <span className="text-white font-bold text-xl">
                {currentSign.symbol}
              </span>
            </div>

            <div>
              {/* Nome segno con effetto glow */}
              <h1 className="text-xl font-bold transition-all duration-300 header-title">
                {currentSign.name_italian}
              </h1>
              {/* Date range con glow subtle */}
              <p className="text-sm header-subtitle">
                {currentSign.date_range}
              </p>
            </div>
          </div>
        </div>
      </AppHeader>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Daily/Weekly Toggle Selector */}
          <div className="flex flex-col items-center mb-4 space-y-4">
            <div className="inline-flex bg-gray-200 dark:bg-gray-800 rounded-full p-1 w-full max-w-md">
              <button
                onClick={() => setViewType("daily")}
                className={`flex-1 py-2 px-6 rounded-full font-medium transition-all ${
                  viewType === "daily"
                    ? "bg-[#E1B64E] dark:bg-gray-700 text-gray-900 dark:text-white shadow-md"
                    : "text-gray-600 dark:text-gray-400"
                }`}
                data-testid="button-daily-view"
              >
                Giornaliero
              </button>
              <button
                onClick={() => setViewType("weekly")}
                className={`flex-1 py-2 px-6 rounded-full font-medium transition-all ${
                  viewType === "weekly"
                    ? "bg-[#E1B64E] dark:bg-gray-700 text-gray-900 dark:text-white shadow-md"
                    : "text-gray-600 dark:text-gray-400"
                }`}
                data-testid="button-weekly-view"
              >
                Settimanale
              </button>
            </div>

            {/* Date Selector for Daily View */}
            {viewType === "daily" && (
              <div className="w-full max-w-md">
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger asChild>
                    <button
                      className="w-full bg-white dark:bg-gray-800 rounded-full px-6 py-3 flex items-center justify-center gap-3 shadow-md hover:shadow-lg transition-shadow border border-gray-200 dark:border-gray-700"
                      data-testid="date-selector-daily"
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
                      <p className="text-xs text-muted-foreground">Ultimi 90 giorni disponibili</p>
                    </div>
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={handleDateSelect}
                      disabled={(date) => date < earliestStart || date > todayStart || !canAccessDate(date)}
                      toDate={todayStart}
                      defaultMonth={selectedDate}
                      className="border-0"
                      data-testid="date-calendar-daily"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {/* Week Navigator for Weekly View */}
            {viewType === "weekly" && (
              <div className="w-full max-w-md space-y-3">
                <WeekNavigator
                  weekOffset={weekOffset}
                  onOffsetChange={setWeekOffset}
                  maxWeeksBack={maxWeeksBack}
                />
                <UpgradeBanner context="weeks" />
              </div>
            )}
          </div>

        {/* Overview Cards */}
        {(viewType === "daily" ? aggregate : weeklyAggregate) && (
          <div className="grid grid-cols-3 md:grid-cols-4 gap-2 md:gap-4 mb-8">
                    <Card>
                      <CardContent className="p-2 md:p-4">
                <div className="flex flex-col md:flex-row items-center md:justify-between">
                  <div className="text-center md:text-left">
                    <p className="text-xs md:text-sm text-muted-foreground font-bold">Relazioni</p>
                    <p className="text-lg md:text-2xl font-bold text-card-foreground">
                      {(viewType === "daily" ? aggregate?.avgRelazioni : weeklyAggregate?.avgRelazioni) !== null ? (viewType === "daily" ? aggregate?.avgRelazioni : weeklyAggregate?.avgRelazioni)?.toFixed(1) : 'N/A'}
                    </p>
                  </div>
                  <div className="w-8 h-8 md:w-12 md:h-12 bg-pink-100 rounded-full flex items-center justify-center mt-1 md:mt-0">
                    <Heart className="text-pink-500 w-4 h-4 md:w-6 md:h-6" />
                  </div>
                </div>
              </CardContent>
            </Card>

                   <Card>
                     <CardContent className="p-2 md:p-4">
                <div className="flex flex-col md:flex-row items-center md:justify-between">
                  <div className="text-center md:text-left">
                    <p className="text-xs md:text-sm text-muted-foreground font-bold">Lavoro</p>
                    <p className="text-lg md:text-2xl font-bold text-card-foreground">
                      {(viewType === "daily" ? aggregate?.avgLavoro : weeklyAggregate?.avgLavoro) !== null ? (viewType === "daily" ? aggregate?.avgLavoro : weeklyAggregate?.avgLavoro)?.toFixed(1) : 'N/A'}
                    </p>
                  </div>
                  <div className="w-8 h-8 md:w-12 md:h-12 bg-blue-100 rounded-full flex items-center justify-center mt-1 md:mt-0">
                    <Briefcase className="text-blue-500 w-4 h-4 md:w-6 md:h-6" />
                  </div>
                </div>
              </CardContent>
            </Card>

                <Card>
                  <CardContent className="p-2 md:p-4">
                <div className="flex flex-col md:flex-row items-center md:justify-between">
                  <div className="text-center md:text-left">
                    <p className="text-xs md:text-sm text-muted-foreground font-bold">Benessere</p>
                    <p className="text-lg md:text-2xl font-bold text-card-foreground">
                      {(viewType === "daily" ? aggregate?.avgBenessere : weeklyAggregate?.avgBenessere) !== null ? (viewType === "daily" ? aggregate?.avgBenessere : weeklyAggregate?.avgBenessere)?.toFixed(1) : 'N/A'}
                    </p>
                  </div>
                  <div className="w-8 h-8 md:w-12 md:h-12 bg-green-100 rounded-full flex items-center justify-center mt-1 md:mt-0">
                    <Leaf className="text-green-500 w-4 h-4 md:w-6 md:h-6" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="col-span-3 md:col-span-1">
              <CardContent className="p-2 md:p-4">
                <div className="flex items-center justify-center gap-3 md:gap-4">
                  <span className="text-xs md:text-sm text-muted-foreground font-bold">Media Generale</span>
                  <span className="text-lg md:text-2xl font-bold text-orange-500">
                    {(viewType === "daily" ? aggregate?.overallAverage : weeklyAggregate?.overallAverage)?.toFixed(1) || 'N/A'}
                  </span>
                  <div className="flex">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`w-3 h-3 md:w-4 md:h-4 ${
                          i < Math.round((viewType === "daily" ? aggregate?.overallAverage : weeklyAggregate?.overallAverage) || 0)
                            ? 'text-orange-500 fill-orange-500'
                            : 'text-gray-300'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
       <div className="mb-8">
  <CompatibilityWidget currentSign={sign} />
        </div>
        {/* Individual Source Cards */}
        {!((viewType === "daily" ? horoscopesLoading : weeklyHoroscopesLoading)) &&
         (viewType === "daily" ? horoscopes : weeklyHoroscopes).length > 0 && (
          <div className="space-y-4 mb-8">
            {(() => {
            // First sort alphabetically, then reorder to pin favorites
            const currentHoroscopes = viewType === "daily" ? horoscopes : weeklyHoroscopes;
            const sortedHoroscopes = [...currentHoroscopes].sort((a, b) =>
              a.source.name.localeCompare(b.source.name)
            );
            return reorderSources(sortedHoroscopes);
          })().map((horoscope) => {
            const isCollapsed = collapsedCards[horoscope.source.id] ?? true;

            return (
              <Card
                key={horoscope.id}
                className="relative cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => toggleCollapse(horoscope.source.id)}
              >
                <CardContent className="p-4">
                  {/* Source Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <SourceIcon
                        source={horoscope.source}
                        data-testid={`individual-source-icon-${horoscope.source.id}`}
                      />
                      <div>
                        <h3 className="font-semibold text-card-foreground">{horoscope.source.name}</h3>
                        <p className="text-xs text-muted-foreground">{horoscope.source.domain}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">

                      {/* Favorite Toggle Button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(horoscope.source.id);
                        }}
                        className="p-1 h-8 w-8 hover:bg-pink-50 dark:hover:bg-pink-900/20"
                        data-testid={`button-favorite-${horoscope.source.id}`}
                        title={isFavorite(horoscope.source.id) ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
                      >
                        <Heart
                          className={`w-4 h-4 transition-colors ${
                            isFavorite(horoscope.source.id)
                              ? 'fill-pink-500 text-pink-500'
                              : 'text-gray-400 hover:text-pink-500'
                          }`}
                        />
                      </Button>
                      {/* Share Button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleShare();
                        }}
                        className="p-1 h-8 w-8 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                        data-testid={`button-share-${horoscope.source.id}`}
                        title="Condividi questo oroscopo"
                        aria-label="Condividi"
                      >
                        <Share className="w-4 h-4 text-gray-400 hover:text-blue-500 transition-colors" />
                      </Button>
                      {/* Collapse Toggle Button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCollapse(horoscope.source.id);
                        }}
                        className="p-1 h-8 w-8 hover:bg-gray-50 dark:hover:bg-gray-800"
                        data-testid={`button-collapse-${horoscope.source.id}`}
                        title={isCollapsed ? 'Espandi scheda' : 'Comprimi scheda'}
                      >
                        <ChevronDown
                          className={`w-4 h-4 text-gray-400 hover:text-gray-600 transition-all duration-200 ${
                            isCollapsed ? 'rotate-180' : 'rotate-0'
                          }`}
                        />
                      </Button>
                    </div>
                  </div>

                  {/* SUPERQUOTE - Always visible */}
                  {horoscope.superquote && (
                    <>
                      <div className="px-4 py-3 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30 border-l-4" style={{ borderLeftColor: '#E1B64E' }}>
                        <p className="text-sm font-italic text-gray-800 dark:text-gray-200 italic">
                          "{horoscope.superquote}"
                        </p>
                      </div>
                      <div className="border-t border-gray-200 dark:border-gray-700 my-3"></div>
                    </>
                  )}

                  {/* Collapsible Content */}
                  <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[1000px] opacity-100'
                    }`}
                  >
                    {/* Horoscope Content */}
                    <p className="text-card-foreground leading-relaxed mb-4">
                      {horoscope.summary}
                    </p>

                    {/* Read More Link */}
                    <div className="mb-4 text-right">
                      <a
                        href={horoscope.original_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-sm font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                        data-testid={`link-read-more-${horoscope.source.id}`}
                      >
                        Leggi tutto
                        <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
                    </div>

                    {/* Ratings */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center">
                        <div className="flex items-center justify-center space-x-2 mb-1">
                          <Heart className="w-4 h-4 text-pink-500" />
                          <span className="text-sm text-muted-foreground">Relazioni</span>
                        </div>
                        <div className="text-lg font-bold text-card-foreground">
                          {horoscope.relazioni_rating === 0 ? 'N/A' : `${horoscope.relazioni_rating}/5`}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center justify-center space-x-2 mb-1">
                          <Briefcase className="w-4 h-4 text-blue-500" />
                          <span className="text-sm text-muted-foreground">Lavoro</span>
                        </div>
                        <div className="text-lg font-bold text-card-foreground">
                          {horoscope.lavoro_rating === 0 ? 'N/A' : `${horoscope.lavoro_rating}/5`}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center justify-center space-x-2 mb-1">
                          <Leaf className="w-4 h-4 text-green-500" />
                          <span className="text-sm text-muted-foreground">Benessere</span>
                        </div>
                        <div className="text-lg font-bold text-card-foreground">
                          {horoscope.salute_rating === 0 ? 'N/A' : `${horoscope.salute_rating}/5`}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
            })}
          </div>
        )}

      {/* No data state */}
      {!((viewType === "daily" ? horoscopesLoading : weeklyHoroscopesLoading)) &&
       (!currentHoroscopes || currentHoroscopes.length === 0) && (
        <Card>
          <CardContent className="p-8 text-center">
            <h3 className="text-lg font-semibold mb-2">
              Nessun dato disponibile
            </h3>
            <p className="text-muted-foreground mb-4">
              {viewType === "daily"
                ? "Non ci sono previsioni disponibili per oggi. Prova ad aggiornare i dati."
                : "Non ci sono previsioni disponibili per questa settimana. Prova ad aggiornare i dati."}
            </p>
            <Button
              onClick={() => refreshSignMutation.mutate()}
              className="bg-gradient-to-r from-orange-500 to-red-500 text-white"
              data-testid="button-refresh-empty"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Aggiorna Dati
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Refresh Button */}
      <div className="flex justify-center mt-8">
        <Button
          onClick={() => refreshSignMutation.mutate()}
          disabled={isRefreshing}
          className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-lg hover:shadow-xl transition-all"
          data-testid="button-refresh-sign"
        >
          <RefreshCw
            className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`}
          />
          Aggiorna Previsioni
        </Button>
      </div>
    </main>

    {/* Loading Overlay */}
    <LoadingOverlay
      isVisible={isRefreshing}
      title={`Aggiornando ${currentSign.name_italian}...`}
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

export default SignDetail;