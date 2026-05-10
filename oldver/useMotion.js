import { useEffect, useRef, useCallback } from "react";

/**
 * Detects sharp "swing" gestures via DeviceMotion API.
 * onSwing(magnitude) fires when acceleration exceeds threshold.
 */
export function useMotion({ onSwing, threshold = 18, cooldownMs = 700 }) {
  const lastFire = useRef(0);
  const enabled = useRef(false);

  const request = useCallback(async () => {
    // iOS 13+ requires explicit permission
    if (typeof DeviceMotionEvent !== "undefined" &&
        typeof DeviceMotionEvent.requestPermission === "function") {
      try {
        const perm = await DeviceMotionEvent.requestPermission();
        enabled.current = perm === "granted";
      } catch { enabled.current = false; }
    } else {
      enabled.current = true; // Android / desktop
    }
    return enabled.current;
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (!enabled.current) return;
      const a = e.acceleration || e.accelerationIncludingGravity;
      if (!a) return;
      const mag = Math.sqrt((a.x || 0) ** 2 + (a.y || 0) ** 2 + (a.z || 0) ** 2);
      const now = Date.now();
      if (mag >= threshold && now - lastFire.current > cooldownMs) {
        lastFire.current = now;
        onSwing(mag);
      }
    };
    window.addEventListener("devicemotion", handler);
    return () => window.removeEventListener("devicemotion", handler);
  }, [onSwing, threshold, cooldownMs]);

  return { requestPermission: request };
}
