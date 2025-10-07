import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
} from "lucide-react";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useFavorites } from "@/hooks/use-favorites";
import { apiRequest } from "@/lib/queryClient";
import { ZODIAC_SIGNS_EN_IT } from "@shared/constants";

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
    // No logo_url or invalid, try domain favicon
    return `https://${source.domain}/favicon.ico`;
  };

  const initialSrc = currentSrc || getInitialSrc();

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.target as HTMLImageElement;
    const currentUrl = img.src;

    // Remove error handler to prevent loops
    img.onerror = null;

    if (currentUrl.includes("favicon.ico")) {
      // If favicon also failed, try Google's favicon service
      const googleFaviconUrl = `https://www.google.com/s2/favicons?sz=64&domain=${source.domain}`;
      if (currentUrl !== googleFaviconUrl) {
        img.src = googleFaviconUrl;
        img.onerror = () => setImgFailed(true);
        return;
      }
    } else if (currentUrl !== `https://${source.domain}/favicon.ico`) {
      // First fallback: try domain favicon
      img.src = `https://${source.domain}/favicon.ico`;
      img.onerror = () => setImgFailed(true);
      return;
    }

    // All image sources failed
    setImgFailed(true);
  };

  // Show letter placeholder only if all images failed
  if (imgFailed) {
    return (
      <div className="relative group">
        <div
          className="w-6 h-6 bg-gradient-to-br from-orange-100 to-red-100 rounded border border-border hover:border-orange-300 transition-colors"
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

export default function SignDetail({ sign }: SignDetailProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTab, setSelectedTab] = useState<'daily' | 'weekly'>('daily');
  const [refreshProgress, setRefreshProgress] = useState({
    current: 0,
    total: 0,
  });
  const [refreshDismissed, setRefreshDismissed] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Favorites functionality
  const { isFavorite, toggleFavorite, reorderSources, hasFavorites } =
    useFavorites(sign);

  // Share functionality
  const handleShare = async () => {
    const currentUrl = window.location.href;
    const today = new Date().toLocaleDateString("it-IT", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const shareData = {
      title: `Oroscopo ${zodiacSign?.name_italian} - ${today}`,
      text: `Scopri l'oroscopo di oggi per ${zodiacSign?.name_italian} da fonti multiple italiane`,
      url: currentUrl,
    };

    try {
      // Check if Web Share API is supported
      if (navigator.share) {
        await navigator.share(shareData);
        toast({
          title: "Condiviso!",
          description: "L'oroscopo è stato condiviso con successo.",
        });
      } else {
        // Fallback: copy URL to clipboard
        await navigator.clipboard.writeText(currentUrl);
        toast({
          title: "Link copiato!",
          description: "Il link dell'oroscopo è stato copiato negli appunti.",
        });
      }
    } catch (error) {
      // If sharing is cancelled or clipboard fails, show a fallback
      if (error instanceof Error && error.name !== "AbortError") {
        toast({
          title: "Errore",
          description: "Non è stato possibile condividere l'oroscopo.",
          variant: "destructive",
        });
      }
    }
  };
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const today = new Date().toISOString().split("T")[0];
  
  // Calculate week start date (Monday) for weekly horoscopes
  const getWeekStartDate = (date: Date = new Date()): string => {
    const dayOfWeek = date.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(date);
    monday.setDate(date.getDate() - daysToMonday);
    return monday.toISOString().split('T')[0];
  };
  
  const weekStartDate = getWeekStartDate();

  // Fetch zodiac sign details
  const { data: zodiacSign } = useQuery<ZodiacSign>({
    queryKey: ["/api/zodiac-signs", sign],
    queryFn: async () => {
      const response = await fetch("/api/zodiac-signs");
      const signs = await response.json();
      return signs.find((s: ZodiacSign) => s.name_english === sign);
    },
  });

  // Fetch horoscope data for this sign (daily or weekly based on selected tab)
  const {
    data: horoscopes = [],
    isLoading: horoscopesLoading,
    error: horoscopesError,
  } = useQuery<HoroscopeData[]>({
    queryKey: [selectedTab === 'daily' ? '/api/horoscopes' : '/api/weekly-horoscopes', selectedTab === 'daily' ? today : weekStartDate, sign],
    queryFn: async () => {
      let response;
      if (selectedTab === 'daily') {
        response = await fetch(`/api/horoscopes?date=${today}&sign=${sign}`);
      } else {
        response = await fetch(`/api/weekly-horoscopes?weekStartDate=${weekStartDate}&sign=${sign}`);
      }
      if (!response.ok) throw new Error("Failed to fetch horoscopes");
      return response.json();
    },
  });

  // Collapse/expand functionality with localStorage persistence
  const [collapsedCards, setCollapsedCards] = useState<Record<number, boolean>>(
    {},
  );

  // Load collapsed state from localStorage on mount
  useEffect(() => {
    if (!horoscopes || horoscopes.length === 0) return;

    const loadCollapsedState = () => {
      const savedState: Record<number, boolean> = {};
      horoscopes.forEach((horoscope) => {
        const key = `signDetail_collapsed_${horoscope.source.id}`;
        const saved = localStorage.getItem(key);
        if (saved !== null) {
          savedState[horoscope.source.id] = saved === "true";
        }
      });
      setCollapsedCards(savedState);
    };

    loadCollapsedState();
  }, [horoscopes]);

  // Toggle collapse state and save to localStorage
  const toggleCollapse = (sourceId: number) => {
    setCollapsedCards((prev) => {
      const newState = !prev[sourceId];
      localStorage.setItem(
        `signDetail_collapsed_${sourceId}`,
        newState.toString(),
      );
      return { ...prev, [sourceId]: newState };
    });
  };

  // Fetch aggregates for this sign (daily or weekly based on selected tab)
  const { data: aggregate } = useQuery<HoroscopeAggregate>({
    queryKey: [selectedTab === 'daily' ? '/api/horoscopes/aggregate' : '/api/weekly-horoscopes/aggregate', selectedTab === 'daily' ? today : weekStartDate, sign],
    queryFn: async () => {
      let response;
      if (selectedTab === 'daily') {
        response = await fetch(`/api/horoscopes/aggregate?date=${today}&sign=${sign}`);
      } else {
        response = await fetch(`/api/weekly-horoscopes/aggregate?weekStartDate=${weekStartDate}&sign=${sign}`);
      }
      if (!response.ok) throw new Error("Failed to fetch aggregate");
      return response.json();
    },
  });

  // Refresh this sign mutation
  const refreshSignMutation = useMutation({
    mutationFn: async () => {
      let response;
      if (selectedTab === 'daily') {
        const italianSign = ZODIAC_SIGNS_EN_IT[sign] || sign;
        response = await apiRequest("POST", `/api/refresh/sign/${italianSign}?date=${today}`);
      } else {
        // Weekly endpoint expects English sign name
        response = await apiRequest("POST", `/api/refresh/weekly?weekStartDate=${weekStartDate}&sign=${sign}`);
      }
      return response.json();
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

              // Invalidate cache to refresh data
              const queryKeyPrefix = selectedTab === 'daily' ? '/api/horoscopes' : '/api/weekly-horoscopes';
              const queryKeyAggregatePrefix = selectedTab === 'daily' ? '/api/horoscopes/aggregate' : '/api/weekly-horoscopes/aggregate';
              const dateParam = selectedTab === 'daily' ? today : weekStartDate;
              
              queryClient.invalidateQueries({
                queryKey: [queryKeyPrefix, dateParam, sign],
              });
              queryClient.invalidateQueries({
                queryKey: [queryKeyAggregatePrefix, dateParam, sign],
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
          <CardContent className="pt-6">
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

  const handleTabChange = (value: string) => {
    setSelectedTab(value as 'daily' | 'weekly');
    // React Query automatically refetches when query keys change (based on selectedTab)
    // No manual invalidation needed
  };

  // Check if we're in a loading state
  const isLoading = horoscopesLoading || !zodiacSign || !aggregate;

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
  if (horoscopesError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-4">
            Errore nel caricamento dell'oroscopo
          </p>
          <Button onClick={() => navigate("/")}>Torna alla Home</Button>
        </div>
      </div>
    );
  }

  const currentSign = zodiacSign; // Renamed for clarity with the fetched sign data

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/")}
                data-testid="button-back"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center space-x-4">
                <div
                  className={`w-12 h-12 bg-gradient-to-br ${colorClass} rounded-full flex items-center justify-center`}
                >
                  <span className="text-white font-bold text-xl">
                    {currentSign.symbol}
                  </span>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-card-foreground">
                    {currentSign.name_italian}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {currentSign.date_range}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tab Selector */}
        <div className="mb-6">
          <Tabs value={selectedTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid w-full sm:w-[400px] grid-cols-2" data-testid="horoscope-type-tabs">
              <TabsTrigger 
                value="daily" 
                data-testid="tab-daily"
                className="data-[state=active]:!bg-[#F0C169] data-[state=active]:text-black"
              >
                Giornaliero
              </TabsTrigger>
              <TabsTrigger 
                value="weekly" 
                data-testid="tab-weekly"
                className="data-[state=active]:!bg-[#F0C169] data-[state=active]:text-black"
              >
                Settimanale
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Overview Cards */}
        {aggregate && (
          <div className="grid grid-cols-3 md:grid-cols-4 gap-2 md:gap-4 mb-8">
            <Card>
              <CardContent className="p-2 md:p-4">
                <div className="flex flex-col md:flex-row items-center md:justify-between">
                  <div className="text-center md:text-left">
                    <p className="text-xs md:text-sm text-muted-foreground font-bold">
                      Relazioni
                    </p>
                    <p className="text-lg md:text-2xl font-bold text-card-foreground">
                      {aggregate.avgRelazioni !== null
                        ? aggregate.avgRelazioni.toFixed(1)
                        : "N/A"}
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
                    <p className="text-xs md:text-sm text-muted-foreground font-bold">
                      Lavoro
                    </p>
                    <p className="text-lg md:text-2xl font-bold text-card-foreground">
                      {aggregate.avgLavoro !== null
                        ? aggregate.avgLavoro.toFixed(1)
                        : "N/A"}
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
                    <p className="text-xs md:text-sm text-muted-foreground font-bold">
                      Benessere
                    </p>
                    <p className="text-lg md:text-2xl font-bold text-card-foreground">
                      {aggregate.avgBenessere !== null
                        ? aggregate.avgBenessere.toFixed(1)
                        : "N/A"}
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
                  <span className="text-xs md:text-sm text-muted-foreground font-bold">
                    Media Generale
                  </span>
                  <span className="text-lg md:text-2xl font-bold text-orange-500">
                    {aggregate.overallAverage?.toFixed(1) || "N/A"}
                  </span>
                  <div className="flex">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`w-3 h-3 md:w-4 md:h-4 ${
                          i < Math.round(aggregate.overallAverage || 0)
                            ? "text-orange-500 fill-orange-500"
                            : "text-gray-300"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Individual Source Cards */}
        {!horoscopesLoading && horoscopes.length > 0 ? (
          <div className="space-y-4 mb-8">
            <h2 className="text-xl font-semibold text-[#F0C169] mb-4">
              {selectedTab === 'daily' ? 'Tutti gli Oroscopi di oggi' : 'Tutti gli Oroscopi della settimana'}
            </h2>
            {(() => {
              // First sort alphabetically, then reorder to pin favorites
              const sortedHoroscopes = [...horoscopes].sort((a, b) =>
                a.source.name.localeCompare(b.source.name),
              );
              return reorderSources(sortedHoroscopes);
            })().map((horoscope) => {
              const isCollapsed = collapsedCards[horoscope.source.id] ?? true;

              return (
                <Card key={horoscope.id} className="relative">
                  <CardContent className="p-6">
                    {/* Source Header */}
                    <div className="flex items-center justify-between mb-4">
                      <div 
                        className="flex items-center space-x-3 cursor-pointer flex-1"
                        onClick={() => toggleCollapse(horoscope.source.id)}
                      >
                        <SourceIcon
                          source={horoscope.source}
                          data-testid={`individual-source-icon-${horoscope.source.id}`}
                        />
                        <div>
                          <h3 className="font-semibold text-card-foreground">
                            {horoscope.source.name}
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            {horoscope.source.domain}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {/* Tone Badge */}
                        <div
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            horoscope.tone_analysis === "positive"
                              ? "bg-green-100 text-green-800"
                              : horoscope.tone_analysis === "negative"
                                ? "bg-red-100 text-red-800"
                                : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {horoscope.tone_analysis === "positive"
                            ? "Positivo"
                            : horoscope.tone_analysis === "negative"
                              ? "Negativo"
                              : "Neutrale"}
                        </div>
                        {/* Favorite Toggle Button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleFavorite(horoscope.source.id)}
                          className="p-1 h-8 w-8 hover:bg-pink-50 dark:hover:bg-pink-900/20"
                          data-testid={`button-favorite-${horoscope.source.id}`}
                          title={
                            isFavorite(horoscope.source.id)
                              ? "Rimuovi dai preferiti"
                              : "Aggiungi ai preferiti"
                          }
                        >
                          <Heart
                            className={`w-4 h-4 transition-colors ${
                              isFavorite(horoscope.source.id)
                                ? "fill-pink-500 text-pink-500"
                                : "text-gray-400 hover:text-pink-500"
                            }`}
                          />
                        </Button>
                        {/* Share Button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleShare}
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
                          onClick={() => toggleCollapse(horoscope.source.id)}
                          className="p-1 h-8 w-8 hover:bg-gray-50 dark:hover:bg-gray-800"
                          data-testid={`button-collapse-${horoscope.source.id}`}
                          title={
                            isCollapsed ? "Espandi scheda" : "Comprimi scheda"
                          }
                        >
                          <ChevronDown
                            className={`w-4 h-4 text-gray-400 hover:text-gray-600 transition-all duration-200 ${
                              isCollapsed ? "rotate-180" : "rotate-0"
                            }`}
                          />
                        </Button>
                      </div>
                    </div>

                    {/* Collapsible Content */}
                    <div
                      className={`overflow-hidden transition-all duration-300 ease-in-out ${
                        isCollapsed
                          ? "max-h-0 opacity-0"
                          : "max-h-[1000px] opacity-100"
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
                          className="inline-flex items-center text-sm font-bold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
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
                            <span className="text-sm text-muted-foreground">
                              Relazioni
                            </span>
                          </div>
                          <div className="text-lg font-bold text-card-foreground">
                            {horoscope.relazioni_rating === 0
                              ? "N/A"
                              : `${horoscope.relazioni_rating}/5`}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center space-x-2 mb-1">
                            <Briefcase className="w-4 h-4 text-blue-500" />
                            <span className="text-sm text-muted-foreground">
                              Lavoro
                            </span>
                          </div>
                          <div className="text-lg font-bold text-card-foreground">
                            {horoscope.lavoro_rating === 0
                              ? "N/A"
                              : `${horoscope.lavoro_rating}/5`}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center space-x-2 mb-1">
                            <Leaf className="w-4 h-4 text-green-500" />
                            <span className="text-sm text-muted-foreground">
                              Benessere
                            </span>
                          </div>
                          <div className="text-lg font-bold text-card-foreground">
                            {horoscope.salute_rating === 0
                              ? "N/A"
                              : `${horoscope.salute_rating}/5`}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : !horoscopesLoading ? (
          /* No data state */
          <Card className="mb-8">
            <CardContent className="p-8">
              <h3 className="text-lg font-semibold mb-2">
                Nessun dato disponibile
              </h3>
              <p className="text-muted-foreground mb-4">
                {selectedTab === 'daily' 
                  ? 'Non ci sono previsioni disponibili per oggi. Prova ad aggiornare i dati.'
                  : 'Non ci sono previsioni settimanali disponibili. Prova ad aggiornare i dati.'}
              </p>
            </CardContent>
          </Card>
        ) : null}

        {/* Refresh Button - Always visible */}
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
            {selectedTab === 'daily' ? 'Aggiorna Previsioni' : 'Aggiorna Previsioni Settimanali'}
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
    </div>
  );
}
