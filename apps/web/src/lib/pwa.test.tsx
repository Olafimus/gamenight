import { act, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OfflineBanner } from "../components/PwaStatus";
import { isIosSafari, useInstall, useOnline } from "./pwa";

describe("pwa helpers", () => {
  it("useOnline reacts to offline/online events", () => {
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);
    act(() => void window.dispatchEvent(new Event("offline")));
    expect(result.current).toBe(false);
    act(() => void window.dispatchEvent(new Event("online")));
    expect(result.current).toBe(true);
  });

  it("OfflineBanner only shows when offline", () => {
    render(<OfflineBanner />);
    expect(screen.queryByText(/Offline/)).toBeNull();
    act(() => void window.dispatchEvent(new Event("offline")));
    expect(screen.getByText(/Offline/)).toBeInTheDocument();
    act(() => void window.dispatchEvent(new Event("online")));
  });

  it("useInstall exposes the prompt after beforeinstallprompt", () => {
    const { result } = renderHook(() => useInstall());
    expect(result.current.kind).toBe("none");
    act(() => void window.dispatchEvent(new Event("beforeinstallprompt")));
    expect(result.current.kind).toBe("prompt");
  });

  it("detects iOS Safari only", () => {
    expect(isIosSafari("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Version/17 Mobile/15E148 Safari/604.1")).toBe(true);
    expect(isIosSafari("Mozilla/5.0 (iPhone) AppleWebKit/605 CriOS/120 Mobile/15E148 Safari/604.1")).toBe(false);
    expect(isIosSafari("Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537")).toBe(false);
  });
});
