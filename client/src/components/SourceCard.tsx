import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Clock } from "lucide-react";
import { StarRating } from "./StarRating";
import { ToneBadge } from "./ToneBadge";
import { cn } from "@/lib/utils";

interface SourceCardProps {
  source: {
    id: number;
    name: string;
    domain: string;
    reliability_score: number;
    summary: string;
    relazioni_rating: number;
    lavoro_rating: number;
    salute_rating: number;
    tone_analysis: 'positive' | 'neutral' | 'negative';
    original_url: string;
    scraped_at: string;
  };
  className?: string;
}

export function SourceCard({ source, className }: SourceCardProps) {
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffHours < 1) return 'Meno di 1h fa';
    if (diffHours === 1) return '1h fa';
    return `${diffHours}h fa`;
  };

  const getSourceInitial = (name: string) => {
    return name.charAt(0).toUpperCase();
  };

  const getReliabilityLabel = (score: number) => {
    if (score >= 4) return { label: 'Molto Affidabile', color: 'bg-green-100 text-green-600' };
    if (score >= 3) return { label: 'Affidabile', color: 'bg-green-100 text-green-600' };
    if (score >= 2) return { label: 'Moderato', color: 'bg-yellow-100 text-yellow-600' };
    return { label: 'Basso', color: 'bg-red-100 text-red-600' };
  };

  const reliability = getReliabilityLabel(source.reliability_score);

  return (
    <Card className={cn("bg-card border border-border", className)} data-testid={`source-card-${source.id}`}>
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gradient-to-br from-orange-100 to-red-100 rounded-lg flex items-center justify-center">
              <span className="text-orange-600 font-bold text-sm">
                {getSourceInitial(source.name)}
              </span>
            </div>
            <div>
              <h3 className="font-semibold text-card-foreground" data-testid={`source-name-${source.id}`}>
                {source.name}
              </h3>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-muted-foreground">{source.domain}</span>
                <Badge className={cn("text-xs", reliability.color)}>
                  {reliability.label}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <ToneBadge tone={source.tone_analysis} size="sm" />
            <div className="flex items-center text-xs text-muted-foreground">
              <Clock className="w-3 h-3 mr-1" />
              {formatTimeAgo(source.scraped_at)}
            </div>
          </div>
        </div>

        {/* Summary */}
        <p className="text-card-foreground mb-4 leading-relaxed" data-testid={`source-summary-${source.id}`}>
          {source.summary}
        </p>

        {/* Ratings */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-1">Relazioni</p>
            <StarRating rating={source.relazioni_rating} size="sm" />
            <span className="text-sm font-medium text-card-foreground mt-1 block">
              {source.relazioni_rating}
            </span>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-1">Lavoro</p>
            <StarRating rating={source.lavoro_rating} size="sm" />
            <span className="text-sm font-medium text-card-foreground mt-1 block">
              {source.lavoro_rating}
            </span>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-1">Benessere</p>
            <StarRating rating={source.salute_rating} size="sm" />
            <span className="text-sm font-medium text-card-foreground mt-1 block">
              {source.salute_rating}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <a 
            href={source.original_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-500 hover:text-orange-600 text-sm flex items-center space-x-1 transition-colors"
            data-testid={`source-link-${source.id}`}
          >
            <ExternalLink className="w-3 h-3" />
            <span>Leggi originale</span>
          </a>
          <span className="text-sm text-muted-foreground">
            Aggiornato: {new Date(source.scraped_at).toLocaleTimeString('it-IT', { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
