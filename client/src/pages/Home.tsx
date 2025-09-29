import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { RefreshCw, Star } from "lucide-react";
import { ZodiacCard } from "@/components/ZodiacCard";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

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
  majorityTone?: 'positive' | 'neutral' | 'negative';
}

export default function Home() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [refreshProgress, setRefreshProgress] = useState({ current: 0, total: 0 });
  
  const today = new Date().toISOString().split('T')[0];

  // Fetch zodiac signs
  const { data: zodiacSigns = [], isLoading: signsLoading } = useQuery<ZodiacSign[]>({
    queryKey: ['/api/zodiac-signs'],
  });

  // Fetch aggregates for all signs
  const { data: aggregatesData = {}, isLoading: aggregatesLoading } = useQuery<Record<string, HoroscopeAggregate>>({
    queryKey: ['/api/horoscopes/aggregates', today],
    queryFn: async () => {
      const results: Record<string, HoroscopeAggregate> = {};
      
      for (const sign of zodiacSigns) {
        try {
          const response = await fetch(`/api/horoscopes/aggregate?date=${today}&sign=${sign.name_english}`);
          if (response.ok) {
            results[sign.name_english] = await response.json();
          }
        } catch (error) {
          console.error(`Failed to fetch aggregate for ${sign.name_english}:`, error);
        }
      }
      
      return results;
    },
    enabled: zodiacSigns.length > 0,
  });

  // Refresh all data mutation
  const refreshAllMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/refresh/all?date=${today}`);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Aggiornamento avviato",
        description: `${data.jobsEnqueued} lavori in coda per tutte le fonti`,
      });
      
      // Poll for updates (simplified - in production you might use WebSocket)
      setRefreshProgress({ current: 0, total: data.jobsEnqueued });
      
      const pollInterval = setInterval(async () => {
        try {
          const statusResponse = await fetch('/api/refresh/status');
          if (statusResponse.ok) {
            const status = await statusResponse.json();
            const completed = status.summary.completed + status.summary.failed;
            setRefreshProgress({ current: completed, total: data.jobsEnqueued });
            
            if (completed >= data.jobsEnqueued) {
              clearInterval(pollInterval);
              setRefreshProgress({ current: 0, total: 0 });
              
              // Invalidate cache to refresh data
              queryClient.invalidateQueries({ queryKey: ['/api/horoscopes/aggregates'] });
              
              toast({
                title: "Aggiornamento completato",
                description: `${status.summary.completed} successi, ${status.summary.failed} errori`,
              });
            }
          }
        } catch (error) {
          console.error('Error polling status:', error);
          clearInterval(pollInterval);
          setRefreshProgress({ current: 0, total: 0 });
        }
      }, 3000);
      
      // Stop polling after 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        setRefreshProgress({ current: 0, total: 0 });
      }, 5 * 60 * 1000);
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

  const formatDate = () => {
    const date = new Date();
    return date.toLocaleDateString('it-IT', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const isLoading = signsLoading || aggregatesLoading;
  const isRefreshing = refreshAllMutation.isPending || refreshProgress.total > 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-red-500 rounded-lg flex items-center justify-center">
                <Star className="text-white w-4 h-4" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-card-foreground">Oroscopo Italiano</h1>
                <p className="text-xs text-muted-foreground">Confronta previsioni da fonti multiple</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-muted-foreground">{formatDate()}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Refresh Section */}
        <div className="mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-card-foreground mb-2">Oroscopo di Oggi</h2>
            <p className="text-muted-foreground">Previsioni aggregate da 14 fonti autorevoli italiane</p>
          </div>
          <Button
            onClick={() => refreshAllMutation.mutate()}
            disabled={isRefreshing}
            className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-lg hover:shadow-xl transition-all"
            data-testid="button-refresh-all"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Aggiorna Tutti i Dati
          </Button>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className="bg-card border border-border rounded-lg p-6 animate-pulse">
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
            {zodiacSigns.map((sign) => (
              <ZodiacCard
                key={sign.id}
                sign={sign}
                aggregate={aggregatesData[sign.name_english]}
                onClick={() => handleSignClick(sign.name_english)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Loading Overlay */}
      <LoadingOverlay
        isVisible={isRefreshing}
        title="Aggiornamento in corso..."
        message="Scaricamento dati da 14 fonti"
        progress={refreshProgress.current}
        total={refreshProgress.total}
      />

      {/* Bottom spacing for mobile navigation */}
      <div className="h-20 md:h-0"></div>
    </div>
  );
}
