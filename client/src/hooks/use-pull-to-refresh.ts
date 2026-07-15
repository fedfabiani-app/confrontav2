import { useEffect, useRef, useState } from "react";

interface UsePullToRefreshOptions {
  onRefresh: () => void;
  threshold?: number;
  maxPull?: number;
  disabled?: boolean;
}

interface UsePullToRefreshResult {
  pullDistance: number;
  isPulling: boolean;
}

const RESISTANCE = 0.5;

export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  maxPull = 120,
  disabled = false,
}: UsePullToRefreshOptions): UsePullToRefreshResult {
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const startYRef = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);
  const firedRef = useRef(false);

  useEffect(() => {
    if (disabled) return;

    const reset = () => {
      startYRef.current = null;
      pullDistanceRef.current = 0;
      setIsPulling(false);
      setPullDistance(0);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || window.scrollY > 0) return;
      startYRef.current = e.touches[0].clientY;
      firedRef.current = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startYRef.current === null) return;

      if (window.scrollY > 0) {
        reset();
        return;
      }

      const deltaY = e.touches[0].clientY - startYRef.current;
      if (deltaY <= 0) {
        reset();
        return;
      }

      e.preventDefault();
      const distance = Math.min(maxPull, deltaY * RESISTANCE);
      pullDistanceRef.current = distance;
      setIsPulling(true);
      setPullDistance(distance);
    };

    const onTouchEnd = () => {
      if (startYRef.current === null) return;
      if (pullDistanceRef.current >= threshold && !firedRef.current) {
        firedRef.current = true;
        onRefresh();
        return;
      }
      reset();
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [disabled, threshold, maxPull, onRefresh]);

  return { pullDistance, isPulling };
}
