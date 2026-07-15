import { useCallback, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { motion, useReducedMotion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";

const THRESHOLD = 80;
const MAX_PULL = 120;

async function hardReload() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    await reg?.update();
  } catch {
    // best-effort only — always fall through to reload below
  }
  window.location.reload();
}

interface PullIndicatorProps {
  pullDistance: number;
  isRefreshing: boolean;
}

function PullIndicator({ pullDistance, isRefreshing }: PullIndicatorProps) {
  const prefersReducedMotion = useReducedMotion();
  const progress = Math.min(1, pullDistance / THRESHOLD);
  const visible = pullDistance > 0 || isRefreshing;

  return (
    <motion.div
      className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none"
      initial={false}
      animate={{
        height: isRefreshing ? THRESHOLD : pullDistance,
        opacity: visible ? 1 : 0,
      }}
      transition={
        prefersReducedMotion
          ? { duration: 0 }
          : { type: "spring", stiffness: 300, damping: 30 }
      }
    >
      <div className="flex items-end justify-center pb-2 h-full">
        <div
          className="refresh-button flex items-center justify-center w-8 h-8 rounded-full"
          style={{
            transform: prefersReducedMotion
              ? undefined
              : `rotate(${isRefreshing ? 0 : progress * 360}deg)`,
          }}
        >
          <RefreshCw
            className={`w-4 h-4 text-white ${
              isRefreshing && !prefersReducedMotion ? "animate-spin" : ""
            }`}
          />
        </div>
      </div>
    </motion.div>
  );
}

interface PullToRefreshProps {
  children: React.ReactNode;
}

export function PullToRefresh({ children }: PullToRefreshProps) {
  const isNative = Capacitor.isNativePlatform();

  return isNative ? (
    <PullToRefreshNative>{children}</PullToRefreshNative>
  ) : (
    <>{children}</>
  );
}

function PullToRefreshNative({ children }: { children: React.ReactNode }) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    void hardReload();
  }, []);

  const { pullDistance } = usePullToRefresh({
    onRefresh,
    threshold: THRESHOLD,
    maxPull: MAX_PULL,
    disabled: isRefreshing,
  });

  return (
    <>
      <PullIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      {children}
    </>
  );
}
