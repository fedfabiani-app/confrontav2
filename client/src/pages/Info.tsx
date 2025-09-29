import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Star, Brain, Globe, Shield, Clock } from "lucide-react";
import { useLocation } from "wouter";

export default function Info() {
  const [, navigate] = useLocation();

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
                data-testid="button-back-info"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-card-foreground">Informazioni & Metodologia</h1>
                <p className="text-xs text-muted-foreground">Come funziona l'app</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Star className="text-white w-8 h-8" />
          </div>
          <h2 className="text-3xl font-bold text-card-foreground mb-4">Oroscopo Italiano</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            La piattaforma italiana per previsioni astrologiche intelligenti, 
            utilizzando intelligenza artificiale per analisi approfondite e sintesi copyright-safe.
          </p>
        </div>

        {/* How It Works */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Brain className="w-5 h-5 text-orange-500" />
              <span>Come Funziona</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Globe className="w-6 h-6 text-blue-500" />
                </div>
                <h3 className="font-semibold mb-2">1. Raccolta Dati</h3>
                <p className="text-sm text-muted-foreground">
                  Raccolta automatica delle migliori previsioni astrologiche 
                  per tutti i segni zodiacali.
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Brain className="w-6 h-6 text-green-500" />
                </div>
                <h3 className="font-semibold mb-2">2. Analisi AI</h3>
                <p className="text-sm text-muted-foreground">
                  OpenAI analizza ogni previsione per estrarre valutazioni numeriche 
                  su Relazioni, Lavoro e Benessere (1-5 stelle).
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Star className="w-6 h-6 text-purple-500" />
                </div>
                <h3 className="font-semibold mb-2">3. Aggregazione</h3>
                <p className="text-sm text-muted-foreground">
                  Calcolo di medie ponderate e analisi del tono generale per fornire 
                  una visione completa e bilanciata.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Features */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Shield className="w-5 h-5 text-green-500" />
                <span>Sicurezza e Privacy</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                <div>
                  <strong className="text-sm">Copyright-Safe:</strong>
                  <p className="text-sm text-muted-foreground">
                    Tutti i contenuti sono rielaborati dall'AI per garantire originalità
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                <div>
                  <strong className="text-sm">Dati Sicuri:</strong>
                  <p className="text-sm text-muted-foreground">
                    Nessun dato personale viene raccolto o memorizzato
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                <div>
                  <strong className="text-sm">Uso Rispettoso:</strong>
                  <p className="text-sm text-muted-foreground">
                    Rispetto dei robots.txt e limiti di velocità per ogni sito
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Clock className="w-5 h-5 text-blue-500" />
                <span>Aggiornamenti</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start space-x-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                <div>
                  <strong className="text-sm">Aggiornamento Manuale:</strong>
                  <p className="text-sm text-muted-foreground">
                    Controllo completo sui tempi di aggiornamento dei dati
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                <div>
                  <strong className="text-sm">Monitoraggio Jobs:</strong>
                  <p className="text-sm text-muted-foreground">
                    Sistema di code avanzato con retry automatico e gestione errori
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                <div>
                  <strong className="text-sm">Cache Intelligente:</strong>
                  <p className="text-sm text-muted-foreground">
                    PWA con supporto offline per consultare dati recenti
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>


        {/* Rating System */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Sistema di Valutazione</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">Categorie Analizzate</h4>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-pink-500 rounded-full"></div>
                  <span className="text-sm"><strong>Relazioni:</strong> Amore, famiglia, amicizie</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                  <span className="text-sm"><strong>Lavoro:</strong> Carriera, finanze, progetti</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm"><strong>Benessere:</strong> Salute, energia, umore</span>
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="font-semibold mb-2">Scala di Valutazione</h4>
              <div className="flex items-center space-x-4 text-sm">
                <span>1 ⭐ = Molto Negativo</span>
                <span>2 ⭐ = Negativo</span>
                <span>3 ⭐ = Neutrale</span>
                <span>4 ⭐ = Positivo</span>
                <span>5 ⭐ = Molto Positivo</span>
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Analisi del Tono</h4>
              <div className="flex space-x-4">
                <Badge className="bg-green-500 text-white">Positivo</Badge>
                <Badge className="bg-amber-500 text-white">Neutrale</Badge>
                <Badge className="bg-red-500 text-white">Negativo</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Technical Info */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Specifiche Tecniche</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div>
                <strong>Frontend:</strong> React + TypeScript, PWA
              </div>
              <div>
                <strong>Backend:</strong> Node.js + Express, Prisma ORM
              </div>
              <div>
                <strong>Database:</strong> MySQL con indici ottimizzati
              </div>
              <div>
                <strong>AI:</strong> OpenAI GPT-5 per analisi semantica
              </div>
              <div>
                <strong>Web Scraping:</strong> Cheerio + Axios con rate limiting
              </div>
              <div>
                <strong>Cache:</strong> Service Worker + React Query
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Disclaimer */}
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="p-6">
            <h3 className="font-semibold text-amber-800 dark:text-amber-200 mb-2">
              Disclaimer
            </h3>
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Questa applicazione è fornita esclusivamente a scopo di intrattenimento. 
              Le previsioni astrologiche non devono essere considerate come consigli professionali 
              per decisioni importanti nella vita. I contenuti sono rielaborati 
              per garantire originalità e rispetto del copyright.
            </p>
          </CardContent>
        </Card>

      </main>

      {/* Bottom spacing for mobile navigation */}
      <div className="h-20 md:h-0"></div>
    </div>
  );
}
