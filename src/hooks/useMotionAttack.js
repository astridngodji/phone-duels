import { useEffect, useRef, useCallback } from 'react';

// Lower threshold = easier to trigger. 15 m/s2 is a firm flick.
const SWING_THRESHOLD = 15;
// Minimum time between two registered attacks (ms).
const COOLDOWN_MS = 500;

/**
 * Detects a fast phone swing using the DeviceMotion API and calls onAttack.
 *
 * The core problem this hook solves carefully:
 *   addEventListener only runs once (when permission is granted).
 *   The handler must therefore read the latest values of `enabled` and
 *   `onAttack` through refs, not through the closure, otherwise it goes
 *   stale and stops working for one or both players.
 */
export function useMotionAttack({ onAttack, enabled }) {
  // Store latest values in refs so the event handler always reads fresh data.
  const enabledRef = useRef(enabled);
  const onAttackRef = useRef(onAttack);
  const lastAttackTime = useRef(0);
  const prevAccel = useRef({ x: 0, y: 0, z: 0 });
  const isListening = useRef(false);

  // Keep refs in sync with props on every render.
  enabledRef.current = enabled;
  onAttackRef.current = onAttack;

  // Stable handler created once via useRef — never recreated across renders.
  // Reads enabledRef and onAttackRef so it always has current values.
  const handleMotion = useRef((e) => {
    // Skip if motion attacks are not currently active.
    if (!enabledRef.current) return;

    // Prefer raw acceleration without gravity; fall back to with-gravity.
    const accel = e.acceleration || e.accelerationIncludingGravity;
    if (!accel) return;

    const x = accel.x || 0;
    const y = accel.y || 0;
    const z = accel.z || 0;

    // Compute delta from the previous reading — a sharp movement = large delta.
    const dx = x - prevAccel.current.x;
    const dy = y - prevAccel.current.y;
    const dz = z - prevAccel.current.z;

    prevAccel.current = { x, y, z };

    const magnitude = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (magnitude > SWING_THRESHOLD) {
      const now = Date.now();
      if (now - lastAttackTime.current > COOLDOWN_MS) {
        lastAttackTime.current = now;
        onAttackRef.current?.();
      }
    }
  }).current;

  /**
   * Call this once when the user taps "Enable Motion".
   * On iOS 13+ this MUST be called from inside a user gesture handler.
   * Returns true if the listener was successfully attached.
   */
  const requestPermission = useCallback(async () => {
    // Already listening — idempotent.
    if (isListening.current) return true;

    try {
      if (
        typeof DeviceMotionEvent !== 'undefined' &&
        typeof DeviceMotionEvent.requestPermission === 'function'
      ) {
        // iOS 13+: must request permission explicitly.
        const result = await DeviceMotionEvent.requestPermission();
        if (result !== 'granted') return false;
      } else if (typeof DeviceMotionEvent === 'undefined') {
        // DeviceMotion not supported at all.
        return false;
      }

      // Attach the stable handler once. It stays for the page lifetime.
      window.addEventListener('devicemotion', handleMotion, { passive: true });
      isListening.current = true;
      return true;
    } catch (err) {
      console.error('Motion permission error:', err);
      return false;
    }
  }, [handleMotion]);

  // Cleanup on unmount only.
  useEffect(() => {
    return () => {
      if (isListening.current) {
        window.removeEventListener('devicemotion', handleMotion);
        isListening.current = false;
      }
    };
  }, [handleMotion]);

  return { requestPermission };
}
