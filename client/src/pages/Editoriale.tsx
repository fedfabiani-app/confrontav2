import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface Source {
  id: number;
  name: string;
  domain: string;
  logo_url: string | null;
}

export default function Editoriale() {
  
  const { data: dailySources = [] } = useQuery<Source[]>({
    queryKey: ["/api/sources"],
    queryFn: async () => {
      const res = await fetch("/api/sources");
      return res.json();
    },
  });

  const { data: weeklySources = [] } = useQuery<Source[]>({
    queryKey: ["/api/weekly-sources"],
    queryFn: async () => {
      const res = await fetch("/api/weekly-sources");
      return res.json();
    },
  });

  const [, navigate] = useLocation();

return (
  <div className="min-h-screen bg-background text-foreground">
    {/* Header */}
    <header className="sticky top-0 z-40 border-b" 
      style={{
        background: 'rgba(30, 20, 64, 0.6)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
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
              data-testid="button-back-editoriale"
              className="text-white hover:bg-white/20 border border-white/30"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-white">
                Editori e Fonti
              </h1>
              <p className="text-xs text-gray-300">
                Le fonti dei nostri oroscopi
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
        <section className="mt-12 p-6 bg-foreground/5 rounded-lg border border-border">
          <h3 className="font-semibold text-white mb-3">Attributions e Disclaimer</h3>
          <p className="text-sm text-white text-foreground/80 leading-relaxed">
            Confronta Oroscopo aggrega oroscopi da fonti pubbliche per fornire un servizio comparativo. I diritti d'autore dei contenuti degli oroscopi rimangono presso gli editori originali. Questa App non rivendica la proprietà intellettuale dei testi degli oroscopi, ma esclusivamente del sistema di aggregazione e confronto. Per questioni relative agli oroscopi aggregati, un editore può contattarci attraverso il form di contatto.
          </p>
        </section>

       <section>
  <h2 className="text-xl text-white font-bold mb-6">Oroscopi Giornalieri</h2>
  <div className="space-y-2">
    {dailySources.map((source) => (
      <a
        key={source.id}
        href={`https://${source.domain}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-white hover:text-blue-600 hover:underline flex items-center gap-2"
      >
        {source.name}
        <ExternalLink className="w-3 h-3" />
      </a>
    ))}
  </div>
</section>

<section>
  <h2 className="text-xl text-white font-bold mb-6">Oroscopi Settimanali</h2>
  <div className="space-y-2">
    {weeklySources.map((source) => (
      <a
        key={source.id}
        href={`https://${source.domain}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-white hover:text-blue-600 hover:underline flex items-center gap-2"
      >
        {source.name}
        <ExternalLink className="w-3 h-3" />
      </a>
    ))}
  </div>
</section>
       
  </main>
    </div>
  );
}