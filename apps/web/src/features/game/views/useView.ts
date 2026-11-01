import { useEffect, useState } from "react";
import { useGameStore, type GameView } from "../store";

export interface Viewport {
  width: number;
  height: number;
}

const read = (): Viewport =>
  typeof window === "undefined" ? { width: 390, height: 844 } : { width: window.innerWidth, height: window.innerHeight };

export function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>(read);
  useEffect(() => {
    const on = () => setVp(read());
    window.addEventListener("resize", on);
    window.addEventListener("orientationchange", on);
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("orientationchange", on);
    };
  }, []);
  return vp;
}

export const SPLIT_MIN_WIDTH = 900;

/** Default view by screen: phone -> compact, tablet portrait -> table, wide landscape -> split. */
export function defaultView({ width, height }: Viewport): GameView {
  if (width >= SPLIT_MIN_WIDTH && width > height) return "split";
  if (width >= 600) return "table";
  return "compact";
}

/** Resolves the stored choice against the current screen (split needs >= 900px). */
export function resolveView(choice: GameView | null, vp: Viewport): GameView {
  const v = choice ?? defaultView(vp);
  return v === "split" && vp.width < SPLIT_MIN_WIDTH ? "compact" : v;
}

export function useEffectiveView(): GameView {
  const choice = useGameStore((s) => s.view);
  const vp = useViewport();
  return resolveView(choice, vp);
}
