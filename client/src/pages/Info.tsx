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
      <header className="sticky top-0 z-40 border-b" 
        style={{
          background: 'rgba(30, 20, 64, 0.6)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)', // Per Safari
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate('/')}
                data-testid="button-back-info"
                className="text-white hover:bg-white/20 border border-white/30"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-white">
                  Informazioni & Metodologia
                </h1>
                <p className="text-xs text-gray-300">
                  Come funziona l'app
                </p>
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
          <h2 className="text-3xl font-bold text-[#E1B64E] mb-4">Confronta Oroscopo</h2>
          <p className="text-lg text-white max-w-2xl mx-auto">
            La piattaforma italiana per previsioni astrologiche intelligenti. Aggrega e confronta tutti i migliori Oroscopi in un'unica App.
          </p>
        </div>

        

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
                    Tutti i contenuti generati sono originali e non violano il diritto d'autore. Tutte le fonti sono citate e gli estratti riportati sono da considerasi “estratti molto brevi”, in ottemperanza alla Delibera AGCOM N. 3/23/CONS.
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full mt2-"></div>
                <div>
                  <strong className="text-sm">Dati Sicuri:</strong>
                  <p className="text-sm text-muted-foreground">
                    Tutti i dati vengono raccolti o memorizzati in modo sicuro e rispettoso della privacy e della normativa GDPR.
                  </p>
                </div>
              </div>
                          </CardContent>
          </Card>

                 </div>


        np

       
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
      <div className="h-5 md:h-0"></div>
    </div>
  );
}
