import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { ZodiacCard } from "@/components/ZodiacCard";
import { AppHeader } from "@/components/AppHeader";
import { useHomeFavorites } from "@/hooks/use-favorites";
import { useAccess } from "@/hooks/use-access";
import { UpgradeBanner } from "@/components/UpgradeBanner";
import { PremiumGateOverlay } from "@/components/PremiumGateOverlay";
import { useLocation } from "wouter";
import iconImage from "@assets/icon.webp";

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
  const [location, navigate] = useLocation();
  const queryClient = useQueryClient();

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

  // Initialize hook for favorites only
  const { homeFavorites, isHomeFavorite, toggleHomeFavorite, hasFavorites } =
    useHomeFavorites();

  const { canAccessDate, canAccessDateWithOverlay } = useAccess();
  const [premiumOverlay, setPremiumOverlay] = useState<{ date: string } | null>(null);

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
      const entries = await Promise.all(
        zodiacSigns.map(async (sign) => {
          try {
            const response = await fetch(
              `/api/horoscopes/aggregate?date=${selectedDateString}&sign=${sign.name_english}`,
            );
            if (response.ok) {
              return [sign.name_english, await response.json()] as const;
            }
          } catch (error) {
            console.error(
              `Failed to fetch aggregate for ${sign.name_english}:`,
              error,
            );
          }
          return null;
        }),
      );

      return Object.fromEntries(
        entries.filter((e): e is [string, HoroscopeAggregate] => e !== null),
      );
    },
    enabled: zodiacSigns.length > 0,
  });

  const handleSignClick = (signName: string) => {
    const dateParam = selectedDate.toLocaleDateString('en-CA');
    navigate(`/sign/${signName}?date=${dateParam}`);
  };

  const formatDate = (date: Date) => {
    const weekday = date.toLocaleDateString("it-IT", { weekday: "long" });
    const day = date.getDate();
    const month = date.toLocaleDateString("it-IT", { month: "long" });
    const year = date.getFullYear();
    return { line1: `${weekday} ${day}`, line2: `${month} ${year}` };
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    const access = canAccessDateWithOverlay(date);
    if (access.canAccess) {
      setSelectedDate(date);
      setCalendarOpen(false);
      const dateParam = date.toLocaleDateString('en-CA');
      navigate(`/?date=${dateParam}`, { replace: true });
      queryClient.invalidateQueries({ queryKey: ["/api/horoscopes/aggregates"] });
    } else if (access.showOverlay) {
      setCalendarOpen(false);
      setPremiumOverlay({
        date: date.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }),
      });
    } else {
      setCalendarOpen(false);
    }
  };

  const isLoading = signsLoading || aggregatesLoading;

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
          <div className="flex items-center justify-between gap-6 bg-indigo-950 border border-indigo-800 rounded-full px-4 py-3 shadow-md w-full max-w-md">
            <button
              onClick={() => {
                const prevDate = new Date(selectedDate);
                prevDate.setDate(prevDate.getDate() - 1);
                handleDateSelect(prevDate);
              }}
              className="p-1 rounded-full transition-colors flex-shrink-0 hover:bg-indigo-800"
              aria-label="Giorno precedente"
            >
              <ChevronLeft size={24} className="text-indigo-100" />
            </button>

            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <button
                  className="flex items-center justify-center gap-3 flex-1"
                  data-testid="date-selector-trigger"
                >
                  <CalendarDays className="w-5 h-5 flex-shrink-0 text-[var(--header-gold)]" />
                  <span className="font-semibold text-indigo-100 text-base text-center leading-tight">
                    {formatDate(selectedDate).line1}<br />{formatDate(selectedDate).line2}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="center">
                <div className="p-3 border-b border-border">
                  <h4 className="text-sm font-medium">Seleziona Data</h4>
                  <p className="text-xs text-muted-foreground">
                    Ultimi 30 giorni disponibili
                  </p>
                </div>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={handleDateSelect}
                  disabled={(date) => {
                    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                    const diffDays = Math.round((todayStart.getTime() - d.getTime()) / 86_400_000);
                    return date > todayStart || diffDays > 29;
                  }}
                  toDate={todayStart}
                  defaultMonth={selectedDate}
                  className="border-0"
                  data-testid="date-calendar"
                />
              </PopoverContent>
            </Popover>

            <button
              onClick={() => {
                const nextDate = new Date(selectedDate);
                nextDate.setDate(nextDate.getDate() + 1);
                nextDate.setHours(0, 0, 0, 0);
                if (nextDate <= todayStart) {
                  handleDateSelect(nextDate);
                }
              }}
              className="p-1 rounded-full transition-colors flex-shrink-0 hover:bg-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Giorno successivo"
              disabled={selectedDate >= todayStart}
            >
              <ChevronRight size={24} className="text-indigo-100" />
            </button>
          </div>
        </div>

      <UpgradeBanner context="history" />

{/* Favorites Section */}
{hasFavorites && (
  <div className="mb-8 mt-4">
    <div className="flex items-center space-x-2 mb-4">
      <h2 className="text-lg font-bold text-[var(--header-gold)]">
        I tuoi Segni Preferiti
      </h2>
      <span
        className="px-2 py-1 rounded-full text-xs font-medium"
        style={{ backgroundColor: "#FEF9E7", color: "var(--header-gold)" }}
      >
        {homeFavorites.size}
      </span>
    </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
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
        
        <div className="mb-4">
          <UpgradeBanner context="sync"/>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {Array.from({ length: 12 }, (_, i) => (
              <div
                key={i}
                className="bg-card border border-border rounded-lg p-4 animate-pulse"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
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
      </main>

      {/* Bottom spacing for mobile navigation */}
      <div className="h-2 md:h-0"></div>

      {premiumOverlay && (
        <PremiumGateOverlay
          type="daily"
          date={premiumOverlay.date}
          onClose={() => setPremiumOverlay(null)}
        />
      )}
    </div>
  );
}