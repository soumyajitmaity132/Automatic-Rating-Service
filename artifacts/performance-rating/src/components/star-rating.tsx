import { Star } from "lucide-react";
import { useState } from "react";
import { clsx } from "clsx";

interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  readOnly?: boolean;
  size?: "sm" | "md" | "lg";
}

export function StarRating({ value, onChange, readOnly = false, size = "md" }: StarRatingProps) {
  const [hoverValue, setHoverValue] = useState<number | null>(null);

  const sizes = {
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-6 h-6",
  };

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => {
        const isFilled = (hoverValue ?? value) >= star;
        return (
          <button
            key={star}
            type="button"
            disabled={readOnly}
            onClick={() => onChange?.(star)}
            onMouseEnter={() => !readOnly && setHoverValue(star)}
            onMouseLeave={() => !readOnly && setHoverValue(null)}
            className={clsx(
              "transition-all duration-200 focus:outline-none",
              readOnly ? "cursor-default" : "cursor-pointer hover:scale-110",
              isFilled ? "text-amber-400 drop-shadow-[0_0_2px_rgba(251,191,36,0.5)]" : "text-muted-foreground/30"
            )}
          >
            <Star className={clsx(sizes[size], isFilled ? "fill-current" : "")} />
          </button>
        );
      })}
    </div>
  );
}
