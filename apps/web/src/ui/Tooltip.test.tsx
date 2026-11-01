import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { IconButton } from "./IconButton";
import { InfoTip, Tooltip } from "./Tooltip";

// jsdom has no PointerEvent; provide one that carries pointerType.
class TestPointerEvent extends MouseEvent {
  pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerType = init.pointerType ?? "";
  }
}

beforeEach(() => {
  vi.stubGlobal("PointerEvent", TestPointerEvent);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Tooltip", () => {
  it("shows on hover after the delay and links via aria-describedby", () => {
    render(
      <Tooltip content="Hilfe">
        <button type="button">Knopf</button>
      </Tooltip>,
    );
    const btn = screen.getByRole("button", { name: "Knopf" });
    fireEvent.pointerEnter(btn, { pointerType: "mouse" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    act(() => void vi.advanceTimersByTime(450));
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("Hilfe");
    expect(btn).toHaveAttribute("aria-describedby", tip.id);
    fireEvent.pointerLeave(btn, { pointerType: "mouse" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows on focus and closes with Escape", () => {
    render(
      <Tooltip content="Hilfe">
        <button type="button">Knopf</button>
      </Tooltip>,
    );
    act(() => screen.getByRole("button").focus());
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("opens on touch long-press without breaking normal taps", () => {
    const onClick = vi.fn();
    render(
      <Tooltip content="Lang gedrückt">
        <button type="button" onClick={onClick}>
          Knopf
        </button>
      </Tooltip>,
    );
    const btn = screen.getByRole("button");
    // normal tap
    fireEvent.pointerDown(btn, { pointerType: "touch", clientX: 5, clientY: 5 });
    act(() => void vi.advanceTimersByTime(100));
    fireEvent.pointerUp(btn, { pointerType: "touch" });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("tooltip")).toBeNull();
    // long press
    fireEvent.pointerDown(btn, { pointerType: "touch", clientX: 5, clientY: 5 });
    act(() => void vi.advanceTimersByTime(500));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Lang gedrückt");
    fireEvent.pointerUp(btn, { pointerType: "touch" });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
    // tap outside closes
    fireEvent.pointerDown(document.body, { pointerType: "touch" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("InfoTip opens on click", () => {
    render(<InfoTip content="Erklärung" label="Info" />);
    fireEvent.click(screen.getByRole("button", { name: "Info" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Erklärung");
  });
});

describe("IconButton tooltip", () => {
  it("shows its label by default and can opt out", () => {
    render(
      <MemoryRouter>
        <IconButton label="Speichern">x</IconButton>
        <IconButton label="Still" tooltip={false}>
          y
        </IconButton>
      </MemoryRouter>,
    );
    act(() => screen.getByRole("button", { name: "Speichern" }).focus());
    expect(screen.getByRole("tooltip")).toHaveTextContent("Speichern");
    act(() => screen.getByRole("button", { name: "Speichern" }).blur());
    act(() => screen.getByRole("button", { name: "Still" }).focus());
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
