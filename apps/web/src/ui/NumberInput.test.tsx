import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NumberInput } from "./NumberInput";
import { formatRelative } from "./RelativeTime";

function Harness({ max = 5, initial = 2 }: { max?: number; initial?: number | null }) {
  const [v, setV] = useState<number | null>(initial);
  return <NumberInput label="Ansage" value={v} onChange={setV} min={0} max={max} />;
}

describe("NumberInput", () => {
  it("steps up and down within bounds", () => {
    render(<Harness max={3} initial={2} />);
    const input = screen.getByLabelText("Ansage") as HTMLInputElement;
    fireEvent.click(screen.getByRole("button", { name: "Ansage erhöhen" }));
    expect(input.value).toBe("3");
    expect(screen.getByRole("button", { name: "Ansage erhöhen" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Ansage verringern" }));
    fireEvent.click(screen.getByRole("button", { name: "Ansage verringern" }));
    fireEvent.click(screen.getByRole("button", { name: "Ansage verringern" }));
    expect(input.value).toBe("0");
    expect(screen.getByRole("button", { name: "Ansage verringern" })).toBeDisabled();
  });

  it("clamps typed values and allows empty", () => {
    render(<Harness max={4} initial={1} />);
    const input = screen.getByLabelText("Ansage") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "9" } });
    expect(input.value).toBe("4");
    fireEvent.change(input, { target: { value: "" } });
    expect(input.value).toBe("");
  });
});

describe("formatRelative", () => {
  it("formats German relative times", () => {
    const now = Date.now();
    expect(formatRelative(now - 10_000, now)).toBe("gerade eben");
    expect(formatRelative(now - 5 * 60_000, now)).toMatch(/^vor 5 Min/);
  });
});
