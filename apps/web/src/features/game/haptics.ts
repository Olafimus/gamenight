/** Short vibration feedback where supported (mostly Android); silently ignored elsewhere. */
export function haptic(ms = 10): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(ms);
  } catch {
    /* ignore */
  }
}
