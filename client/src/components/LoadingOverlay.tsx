import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2 } from "lucide-react";

interface LoadingOverlayProps {
  isVisible: boolean;
  title?: string;
  message?: string;
  progress?: number;
  total?: number;
}

export function LoadingOverlay({ 
  isVisible, 
  title = "Aggiornamento in corso...", 
  message = "Scaricamento dati da fonti multiple",
  progress = 0,
  total = 100
}: LoadingOverlayProps) {
  if (!isVisible) return null;

  const percentage = total > 0 ? Math.min(100, Math.max(0, (progress / total) * 100)) : 0;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 fade-in"
      data-testid="loading-overlay"
    >
      <Card className="w-full max-w-sm mx-4">
        <CardContent className="p-8">
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
        </CardContent>
      </Card>
    </div>
  );
}
