import { Card, CardContent } from "@/components/ui/card";
import { StarRating } from "./StarRating";
import { ToneBadge } from "./ToneBadge";
import { cn } from "@/lib/utils";

interface ZodiacCardProps {
  sign: {
    id: number;
    name_italian: string;
    name_english: string;
    date_range: string;
    symbol: string;
  };
  aggregate?: {
    avgRelazioni: number | null;
    avgLavoro: number | null;
    avgBenessere: number | null;
    overallAverage: number | null;
    majorityTone?: 'positive' | 'neutral' | 'negative';
  };
  summary?: string;
  onClick?: () => void;
  className?: string;
}

const signColors = {
  ariete: 'from-red-300 to-red-500',
  toro: 'from-yellow-300 to-orange-500',
  gemelli: 'from-green-400 to-green-600',
  cancro: 'from-blue-300 to-blue-500',
  leone: 'from-red-300 to-red-500',
  vergine: 'from-yellow-300 to-orange-500',
  bilancia: 'from-green-400 to-green-600',
  scorpione: 'from-blue-300 to-blue-500',
  sagittario: 'from-red-300 to-red-500',
  capricorno: 'from-yellow-300 to-orange-500',
  acquario: 'from-green-400 to-green-600',
  pesci: 'from-blue-300 to-blue-500',
};

  export function ZodiacCard({ sign, aggregate, summary, onClick, className }: ZodiacCardProps) {
    // Debug: verifica cosa contiene sign
    console.log('Sign data:', sign.name_english, sign.name_italian);

    // Prova con name_italian in minuscolo
    const signKey = sign.name_italian.toLowerCase();
    const colorClass = signColors[signKey as keyof typeof signColors] || 'from-gray-500 to-gray-700';

    console.log('Sign key:', signKey, 'Color class:', colorClass);
  
  return (
    <Card 
      className={cn(
        "zodiac-card bg-card border border-border cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-1",
        onClick && "hover:shadow-lg",
        className
      )}
      onClick={onClick}
      data-testid={`zodiac-card-${sign.name_english}`}
    >
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className={cn("w-10 h-10 bg-gradient-to-br rounded-full flex items-center justify-center", colorClass)}>
              <span className="text-white font-bold text-lg">{sign.symbol}</span>
            </div>
            <div>
              <h3 className="font-semibold text-card-foreground" data-testid={`sign-name-${sign.name_english}`}>
                {sign.name_italian}
              </h3>
              <p className="text-xs text-muted-foreground">{sign.date_range}</p>
            </div>
          </div>
          {aggregate?.majorityTone && (
            <ToneBadge tone={aggregate.majorityTone} size="sm" />
          )}
        </div>
        
        {/* Summary */}
        {summary && (
          <p className="text-sm text-card-foreground mb-4 line-clamp-3" data-testid={`sign-summary-${sign.name_english}`}>
            {summary}
          </p>
        )}
        
        {/* Ratings */}
        {aggregate && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Relazioni</span>
              <div className="flex items-center space-x-1">
                {aggregate.avgRelazioni !== null ? (
                  <>
                    <StarRating rating={Math.round(aggregate.avgRelazioni)} size="sm" />
                    <span className="text-xs text-muted-foreground ml-1">
                      {aggregate.avgRelazioni.toFixed(1)}
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">N/A</span>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Lavoro</span>
              <div className="flex items-center space-x-1">
                {aggregate.avgLavoro !== null ? (
                  <>
                    <StarRating rating={Math.round(aggregate.avgLavoro)} size="sm" />
                    <span className="text-xs text-muted-foreground ml-1">
                      {aggregate.avgLavoro.toFixed(1)}
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">N/A</span>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Benessere</span>
              <div className="flex items-center space-x-1">
                {aggregate.avgBenessere !== null ? (
                  <>
                    <StarRating rating={Math.round(aggregate.avgBenessere)} size="sm" />
                    <span className="text-xs text-muted-foreground ml-1">
                      {aggregate.avgBenessere.toFixed(1)}
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">N/A</span>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Overall Average */}
        {aggregate && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-card-foreground">Media Generale</span>
              <span className="text-lg font-bold text-orange-500" data-testid={`overall-average-${sign.name_english}`}>
                {aggregate.overallAverage !== null ? aggregate.overallAverage.toFixed(1) : 'N/A'}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
