import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ToneBadgeProps {
  tone: 'positive' | 'neutral' | 'negative';
  size?: "sm" | "md" | "lg";
  className?: string;
}

const toneConfig = {
  positive: {
    label: 'Positivo',
    className: 'bg-green-500 hover:bg-green-600 text-white',
  },
  neutral: {
    label: 'Neutrale', 
    className: 'bg-amber-500 hover:bg-amber-600 text-white',
  },
  negative: {
    label: 'Negativo',
    className: 'bg-red-500 hover:bg-red-600 text-white',
  },
};

export function ToneBadge({ tone, size = "md", className }: ToneBadgeProps) {
  const config = toneConfig[tone];
  
  const sizeClasses = {
    sm: "px-2 py-1 text-xs",
    md: "px-3 py-1 text-sm",
    lg: "px-4 py-2 text-base"
  };

  return (
    <Badge 
      className={cn(
        config.className,
        sizeClasses[size],
        "font-medium rounded-full",
        className
      )}
      data-testid={`tone-badge-${tone}`}
    >
      {config.label}
    </Badge>
  );
}
