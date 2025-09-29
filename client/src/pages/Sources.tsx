import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ExternalLink, Activity, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

interface Source {
  id: number;
  name: string;
  domain: string;
  logo_url?: string;
  base_url: string;
  url_pattern: string;
  reliability_score: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function Sources() {
  const [, navigate] = useLocation();

  const { data: sources = [], isLoading } = useQuery<Source[]>({
    queryKey: ['/api/sources'],
  });

  const getReliabilityLabel = (score: number) => {
    if (score >= 4) return { label: 'Molto Affidabile', color: 'bg-green-500 text-white' };
    if (score >= 3) return { label: 'Affidabile', color: 'bg-green-400 text-white' };
    if (score >= 2) return { label: 'Moderato', color: 'bg-yellow-500 text-white' };
    return { label: 'Basso', color: 'bg-red-500 text-white' };
  };

  const getSourceInitial = (name: string) => {
    return name.charAt(0).toUpperCase();
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
                onClick={() => navigate('/')}
                data-testid="button-back-home"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-card-foreground">Fonti Oroscopo</h1>
                <p className="text-xs text-muted-foreground">Gestione delle fonti autorevoli</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-card-foreground mb-2">Fonti Disponibili</h2>
          <p className="text-muted-foreground">
            Elenco completo delle {sources.length} fonti italiane utilizzate per il confronto delle previsioni astrologiche
          </p>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }, (_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-muted rounded-lg"></div>
                    <div className="flex-1">
                      <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                      <div className="h-3 bg-muted rounded w-1/2"></div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="h-3 bg-muted rounded"></div>
                    <div className="h-3 bg-muted rounded w-2/3"></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Sources Grid */}
        {!isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sources.map((source) => {
              const reliability = getReliabilityLabel(source.reliability_score);
              
              return (
                <Card key={source.id} className="bg-card border border-border" data-testid={`source-card-${source.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-orange-100 to-red-100 rounded-lg flex items-center justify-center">
                          <span className="text-orange-600 font-bold text-sm">
                            {getSourceInitial(source.name)}
                          </span>
                        </div>
                        <div>
                          <CardTitle className="text-sm font-semibold text-card-foreground">
                            {source.name}
                          </CardTitle>
                          <p className="text-xs text-muted-foreground">{source.domain}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {source.is_active ? (
                          <div className="flex items-center space-x-1" data-testid={`source-status-active-${source.id}`}>
                            <Activity className="w-3 h-3 text-green-500" />
                            <span className="text-xs text-green-600">Attiva</span>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-1" data-testid={`source-status-inactive-${source.id}`}>
                            <AlertCircle className="w-3 h-3 text-red-500" />
                            <span className="text-xs text-red-600">Inattiva</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent>
                    <div className="space-y-4">
                      {/* Reliability Score */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Affidabilità</span>
                        <div className="flex items-center space-x-2">
                          <Badge className={reliability.color}>
                            {reliability.label}
                          </Badge>
                          <span className="text-sm font-medium text-card-foreground">
                            {source.reliability_score.toFixed(1)}/5.0
                          </span>
                        </div>
                      </div>

                      {/* URL Pattern */}
                      <div>
                        <span className="text-sm text-muted-foreground block mb-1">Schema URL</span>
                        <code className="text-xs bg-muted p-2 rounded block break-all">
                          {source.url_pattern}
                        </code>
                      </div>

                      {/* Base URL */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Sito Web</span>
                        <a 
                          href={source.base_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-orange-500 hover:text-orange-600 text-sm flex items-center space-x-1 transition-colors"
                          data-testid={`source-link-${source.id}`}
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Visita</span>
                        </a>
                      </div>

                      {/* Last Updated */}
                      <div className="pt-2 border-t border-border">
                        <span className="text-xs text-muted-foreground">
                          Aggiornato: {new Date(source.updated_at).toLocaleDateString('it-IT')}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && sources.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nessuna fonte disponibile</h3>
              <p className="text-muted-foreground">
                Non ci sono fonti configurate nel sistema. Contatta l'amministratore.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Statistics */}
        {!isLoading && sources.length > 0 && (
          <div className="mt-8 pt-8 border-t border-border">
            <h3 className="text-lg font-semibold text-card-foreground mb-4">Statistiche Fonti</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-card-foreground">{sources.length}</div>
                  <div className="text-sm text-muted-foreground">Totale Fonti</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-green-500">
                    {sources.filter(s => s.is_active).length}
                  </div>
                  <div className="text-sm text-muted-foreground">Fonti Attive</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-orange-500">
                    {(sources.reduce((sum, s) => sum + s.reliability_score, 0) / sources.length).toFixed(1)}
                  </div>
                  <div className="text-sm text-muted-foreground">Affidabilità Media</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-blue-500">
                    {sources.filter(s => s.reliability_score >= 4).length}
                  </div>
                  <div className="text-sm text-muted-foreground">Molto Affidabili</div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>

      {/* Bottom spacing for mobile navigation */}
      <div className="h-20 md:h-0"></div>
    </div>
  );
}
