import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeft,
  RefreshCw,
  Heart,
  Briefcase,
  Leaf,
  Star,
} from "lucide-react";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
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
  avgRelazioni: number;
  avgLavoro: number;
  avgBenessere: number;
  overallAverage: number;
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

export default function SignDetail({ sign }: SignDetailProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [refreshProgress, setRefreshProgress] = useState({
    current: 0,
    total: 0,
  });
  const [refreshDismissed, setRefreshDismissed] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const today = new Date().toISOString().split("T")[0];

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
  const { data: horoscopes = [], isLoading: horoscopesLoading } = useQuery<
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
  });

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
  });

  // Refresh this sign mutation
  const refreshSignMutation = useMutation({
    mutationFn: async () => {
      const italianSign = ZODIAC_SIGNS_EN_IT[sign] || sign;
      const response = await apiRequest(
        "POST",
        `/api/refresh/sign/${italianSign}?date=${today}`,
      );
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
              queryClient.invalidateQueries({
                queryKey: ["/api/horoscopes", today, sign],
              });
              queryClient.invalidateQueries({
                queryKey: ["/api/horoscopes/aggregate", today, sign],
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
                    {zodiacSign.symbol}
                  </span>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-card-foreground">
                    {zodiacSign.name_italian}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {zodiacSign.date_range}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Overview Cards */}
        {aggregate && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Relazioni</p>
                    <p className="text-2xl font-bold text-card-foreground">
                      {aggregate.avgRelazioni.toFixed(1)}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-pink-100 rounded-full flex items-center justify-center">
                    <Heart className="text-pink-500 w-6 h-6" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Lavoro</p>
                    <p className="text-2xl font-bold text-card-foreground">
                      {aggregate.avgLavoro.toFixed(1)}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                    <Briefcase className="text-blue-500 w-6 h-6" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Benessere</p>
                    <p className="text-2xl font-bold text-card-foreground">
                      {aggregate.avgBenessere.toFixed(1)}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                    <Leaf className="text-green-500 w-6 h-6" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Media Generale
                    </p>
                    <p className="text-2xl font-bold text-orange-500">
                      {aggregate.overallAverage.toFixed(1)}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                    <Star className="text-orange-500 w-6 h-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Individual Source Cards */}
        {!horoscopesLoading && horoscopes.length > 0 && (
          <div className="space-y-4 mb-8">
            <h2 className="text-xl font-semibold text-card-foreground mb-4">Previsioni per Fonte</h2>
            {horoscopes.map((horoscope) => (
              <Card key={horoscope.id} className="relative">
                <CardContent className="p-6">
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
                    <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                      horoscope.tone_analysis === 'positive' ? 'bg-green-100 text-green-800' :
                      horoscope.tone_analysis === 'negative' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {horoscope.tone_analysis === 'positive' ? 'Positivo' :
                       horoscope.tone_analysis === 'negative' ? 'Negativo' : 'Neutrale'}
                    </div>
                  </div>

                  {/* Horoscope Content */}
                  <p className="text-card-foreground leading-relaxed mb-4">
                    {horoscope.summary}
                  </p>

                  {/* Ratings */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="flex items-center justify-center space-x-2 mb-1">
                        <Heart className="w-4 h-4 text-pink-500" />
                        <span className="text-sm text-muted-foreground">Relazioni</span>
                      </div>
                      <div className="text-lg font-bold text-card-foreground">
                        {horoscope.relazioni_rating}/5
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center space-x-2 mb-1">
                        <Briefcase className="w-4 h-4 text-blue-500" />
                        <span className="text-sm text-muted-foreground">Lavoro</span>
                      </div>
                      <div className="text-lg font-bold text-card-foreground">
                        {horoscope.lavoro_rating}/5
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center space-x-2 mb-1">
                        <Leaf className="w-4 h-4 text-green-500" />
                        <span className="text-sm text-muted-foreground">Benessere</span>
                      </div>
                      <div className="text-lg font-bold text-card-foreground">
                        {horoscope.salute_rating}/5
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* No data state */}
        {!horoscopesLoading && horoscopes.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <h3 className="text-lg font-semibold mb-2">
                Nessun dato disponibile
              </h3>
              <p className="text-muted-foreground mb-4">
                Non ci sono previsioni disponibili per oggi. Prova ad aggiornare
                i dati.
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
        title={`Aggiornando ${zodiacSign.name_italian}...`}
        message="Aggiornamento previsioni in corso"
        progress={refreshProgress.current}
        total={refreshProgress.total}
        onDismiss={handleDismissRefresh}
      />

      {/* Bottom spacing for mobile navigation */}
      <div className="h-20 md:h-0"></div>
    </div>
  );
}
