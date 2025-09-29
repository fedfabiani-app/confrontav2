import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  rating: number;
  maxRating?: number;
  size?: "sm" | "md" | "lg";
  showValue?: boolean;
  className?: string;
}

export function StarRating({ 
  rating, 
  maxRating = 5, 
  size = "md", 
  showValue = false,
  className 
}: StarRatingProps) {
  const sizeClasses = {
    sm: "w-3 h-3",
    md: "w-4 h-4", 
    lg: "w-5 h-5"
  };

  const textSizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base"
  };

  return (
    <div className={cn("flex items-center space-x-1", className)}>
      <div className="flex space-x-1">
        {Array.from({ length: maxRating }, (_, index) => (
          <Star
            key={index}
            className={cn(
              sizeClasses[size],
              index < rating 
                ? "fill-amber-400 text-amber-400" 
                : "fill-gray-300 text-gray-300"
            )}
            data-testid={`star-${index + 1}`}
          />
        ))}
      </div>
      {showValue && (
        <span className={cn("ml-1 text-muted-foreground font-medium", textSizeClasses[size])}>
          {rating.toFixed(1)}
        </span>
      )}
    </div>
  );
}
