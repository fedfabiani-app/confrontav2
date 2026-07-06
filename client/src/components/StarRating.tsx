import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  rating: number;
  maxRating?: number;
  size?: "sm" | "md" | "lg" | "xl";
  showValue?: boolean;
  className?: string;
  color?: string;
}

const sizeClasses = {
  sm: "w-3 h-3",
  md: "w-4 h-4",
  lg: "w-5 h-5",
  xl: "w-6 h-6",
} as const;

const textSizeClasses = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
  xl: "text-lg",
} as const;

// full = Math.floor(valore); frazione >= 0.75 arrotonda a piena in più,
// frazione in [0.25, 0.75) è mezza stella, frazione < 0.25 è vuota.
function getStarFill(rating: number, maxRating: number): { fullStars: number; hasHalf: boolean } {
  const clamped = Math.max(0, Math.min(rating, maxRating));
  const wholePart = Math.floor(clamped);
  const frac = clamped - wholePart;

  if (frac >= 0.75) {
    return { fullStars: Math.min(wholePart + 1, maxRating), hasHalf: false };
  }
  if (frac >= 0.25) {
    return { fullStars: wholePart, hasHalf: true };
  }
  return { fullStars: wholePart, hasHalf: false };
}

export function StarRating({
  rating,
  maxRating = 5,
  size = "md",
  showValue = false,
  className,
  color = "#E1B64E",
}: StarRatingProps) {
  const { fullStars, hasHalf } = getStarFill(rating, maxRating);

  return (
    <div className={cn("flex items-center space-x-1", className)}>
      <div className="flex space-x-1">
        {Array.from({ length: maxRating }, (_, index) => {
          const isFull = index < fullStars;
          const isHalf = !isFull && index === fullStars && hasHalf;
          return (
            <div
              key={index}
              className={cn("relative", sizeClasses[size])}
              data-testid={`star-${index + 1}`}
            >
              <Star className={cn(sizeClasses[size], "fill-gray-300 text-gray-300")} />
              {(isFull || isHalf) && (
                <Star
                  className={cn("absolute inset-0", sizeClasses[size])}
                  style={{
                    fill: color,
                    color,
                    clipPath: isHalf ? "inset(0 50% 0 0)" : undefined,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
      {showValue && (
        <span className={cn("ml-1 text-muted-foreground font-medium", textSizeClasses[size])}>
          {rating.toFixed(1)}
        </span>
      )}
    </div>
  );
}
