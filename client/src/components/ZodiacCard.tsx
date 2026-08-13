import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Heart, ChevronDown, ChevronUp } from "lucide-react";

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
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

  export function ZodiacCard({
  sign, 
  aggregate, 
  summary, 
  onClick, 
  className,
  isFavorite = false,
  onToggleFavorite,
  isCollapsed = false,
  onToggleCollapse
}: ZodiacCardProps) {
  const handleCardClick = (e: React.MouseEvent) => {
    // Don't trigger card click if clicking on control buttons
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    onClick?.();
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleFavorite?.();
  };

  const handleCollapseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleCollapse?.();
  };
  
  return (
    <Card 
      className={cn(
        "zodiac-card bg-card border-2 border-border cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-1",
        onClick && "hover:shadow-lg",
        isFavorite && "ring-2 ring-red-200 border-red-300",
        className
      )}
      onClick={handleCardClick}
      data-testid={`zodiac-card-${sign.name_english}`}
    >
          <CardContent className="p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-3">
            <img
              src={`/icons/zodiac/${sign.name_english.toLowerCase()}.svg`}
              alt={sign.name_italian}
              className="w-10 h-10 object-contain"
              draggable={false}
            />
            <div>
              <h3 className="font-semibold text-card-foreground" data-testid={`sign-name-${sign.name_english}`}>
                {sign.name_italian}
              </h3>
              <p className="text-xs text-muted-foreground">{sign.date_range}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {/* Control Buttons */}
            <div className="flex items-center space-x-1">
              {onToggleFavorite && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleFavoriteClick}
                  className="p-1 h-8 w-8 hover:bg-white/5"
                  data-testid={`button-favorite-${sign.name_english}`}
                  title={isFavorite ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
                >
                  <Heart 
                    className={cn(
                      "w-4 h-4",
                      isFavorite ? "text-red-500 fill-red-500" : "text-muted-foreground"
                    )} 
                  />
                </Button>
              )}
              {onToggleCollapse && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCollapseClick}
                  className="p-1 h-8 w-8 hover:bg-white/5"
                  data-testid={`button-collapse-${sign.name_english}`}
                  title={isCollapsed ? 'Espandi dettagli' : 'Comprimi dettagli'}
                >
                  {isCollapsed ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
        
        {/* Collapsible Content */}
        <div 
          className={cn(
            "overflow-hidden transition-all duration-300 ease-in-out",
            isCollapsed ? "max-h-0 opacity-0" : "max-h-[500px] opacity-100"
          )}
        >
          {/* Summary */}
          {summary && (
            <p className="text-sm text-card-foreground line-clamp-3" data-testid={`sign-summary-${sign.name_english}`}>
              {summary}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
