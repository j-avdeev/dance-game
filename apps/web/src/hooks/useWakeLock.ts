import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Keeps the screen awake while tracking.
 *
 * The phone is propped up 2-3 m away and untouched for a whole song, so the
 * screen would otherwise lock and suspend the camera mid-game. The lock is
 * released by the browser whenever the page is hidden, so it must be
 * re-acquired on visibilitychange rather than only once.
 */

export type WakeLockState = {
  /** Whether a lock is currently held. */
  active: boolean;
  /** False when the browser has no Wake Lock support; not an error. */
  supported: boolean;
};

export function useWakeLock(enabled: boolean): WakeLockState {
  const supported = typeof navigator !== "undefined" && "wakeLock" in navigator;
  const [active, setActive] = useState(false);
  const sentinelRef = useRef<WakeLockSentinel | undefined>(undefined);

  const release = useCallback(async () => {
    const sentinel = sentinelRef.current;
    sentinelRef.current = undefined;
    setActive(false);
    if (sentinel && !sentinel.released) {
      try {
        await sentinel.release();
      } catch {
        // Already released by the browser; nothing to do.
      }
    }
  }, []);

  const acquire = useCallback(async () => {
    if (!supported || sentinelRef.current || document.visibilityState !== "visible") {
      return;
    }
    try {
      const sentinel = await navigator.wakeLock.request("screen");
      sentinelRef.current = sentinel;
      setActive(true);
      sentinel.addEventListener("release", () => {
        sentinelRef.current = undefined;
        setActive(false);
      });
    } catch (error) {
      // Denied or unavailable (low battery, unsupported). Tracking still works;
      // the screen may simply dim, so this is a warning rather than a failure.
      console.warn("[wake-lock] could not acquire", error);
      setActive(false);
    }
  }, [supported]);

  useEffect(() => {
    if (!enabled) {
      void release();
      return;
    }

    void acquire();

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === "visible") {
        void acquire();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void release();
    };
  }, [enabled, acquire, release]);

  return { active, supported };
}
