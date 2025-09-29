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
    avgRelazioni: number;
    avgLavoro: number;
    avgBenessere: number;
    overallAverage: number;
    majorityTone?: 'positive' | 'neutral' | 'negative';
  };
  summary?: string;
  onClick?: () => void;
  className?: string;
}

const signColors = {
  ariete: 'from-red-500 to-pink-500',
  toro: 'from-green-500 to-emerald-500',
  gemelli: 'from-yellow-500 to-orange-500',
  cancro: 'from-blue-500 to-cyan-500',
  leone: 'from-orange-500 to-red-500',
  vergine: 'from-green-600 to-blue-500',
  bilancia: 'from-pink-500 to-purple-500',
  scorpione: 'from-red-600 to-black',
  sagittario: 'from-purple-500 to-indigo-500',
  capricorno: 'from-gray-600 to-gray-800',
  acquario: 'from-blue-400 to-cyan-400',
  pesci: 'from-blue-500 to-purple-500',
};

export function ZodiacCard({ sign, aggregate, summary, onClick, className }: ZodiacCardProps) {
  const colorClass = signColors[sign.name_english as keyof typeof signColors] || 'from-gray-500 to-gray-700';
  
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
                <StarRating rating={Math.round(aggregate.avgRelazioni)} size="sm" />
                <span className="text-xs text-muted-foreground ml-1">
                  {aggregate.avgRelazioni.toFixed(1)}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Lavoro</span>
              <div className="flex items-center space-x-1">
                <StarRating rating={Math.round(aggregate.avgLavoro)} size="sm" />
                <span className="text-xs text-muted-foreground ml-1">
                  {aggregate.avgLavoro.toFixed(1)}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Benessere</span>
              <div className="flex items-center space-x-1">
                <StarRating rating={Math.round(aggregate.avgBenessere)} size="sm" />
                <span className="text-xs text-muted-foreground ml-1">
                  {aggregate.avgBenessere.toFixed(1)}
                </span>
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
                {aggregate.overallAverage.toFixed(1)}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
