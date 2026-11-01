import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";

afterEach(() => vi.useRealTimers());

describe("Modal", () => {
  it("a closed dialog stops taking input at once and is removed even if its exit animation hangs", () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    const ui = (open: boolean) => (
      <Modal open={open} onClose={() => undefined} title="Eintrag">
        <button onClick={onClick}>25</button>
      </Modal>
    );
    const { rerender } = render(ui(true));
    const backdrop = screen.getByRole("dialog").parentElement!;
    expect(backdrop.style.pointerEvents).toBe("");

    rerender(ui(false));
    // fake timers keep the exit animation from finishing – like the hang on phones
    expect(backdrop.style.pointerEvents).toBe("none");
    expect(backdrop.inert).toBe(true);

    act(() => void vi.advanceTimersByTime(1000));
    expect(backdrop.isConnected).toBe(false);
    expect(screen.queryByRole("button", { name: "25" })).not.toBeInTheDocument();
  });
});
