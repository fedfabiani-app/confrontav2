import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Loader2, X } from "lucide-react";
import { useEffect } from "react";

interface LoadingOverlayProps {
  isVisible: boolean;
  title?: string;
  message?: string;
  progress?: number;
  total?: number;
  onDismiss?: () => void;
}

export function LoadingOverlay({ 
  isVisible, 
  title = "Aggiornamento in corso...", 
  message = "Scaricamento dati da fonti multiple",
  progress = 0,
  total = 100,
  onDismiss
}: LoadingOverlayProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onDismiss) {
        onDismiss();
      }
    };

    if (isVisible) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isVisible, onDismiss]);

  if (!isVisible) return null;

  const percentage = total > 0 ? Math.min(100, Math.max(0, (progress / total) * 100)) : 0;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 fade-in"
      data-testid="loading-overlay"
    >
      <Card className="w-full max-w-sm mx-4">
        <CardContent className="p-8 relative">
          {onDismiss && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              className="absolute top-2 right-2 h-8 w-8 p-0"
              data-testid="button-dismiss-overlay"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
          
          <div className="flex items-center space-x-4 mb-6">
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
            <div>
              <h3 className="font-semibold text-card-foreground" data-testid="loading-title">
                {title}
              </h3>
              <p className="text-sm text-muted-foreground" data-testid="loading-message">
                {message}
              </p>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Progresso</span>
              <span className="text-card-foreground font-medium" data-testid="loading-progress">
                {progress}/{total}
              </span>
            </div>
            <Progress 
              value={percentage} 
              className="w-full"
              data-testid="loading-progress-bar"
            />
            <div className="text-xs text-muted-foreground text-center">
              {percentage.toFixed(0)}% completato
            </div>
          </div>
          
          {onDismiss && (
            <div className="mt-4 text-xs text-muted-foreground text-center">
              Premi ESC o clicca X per continuare a navigare
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
