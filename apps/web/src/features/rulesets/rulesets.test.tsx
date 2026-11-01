import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../ui";
import { RulesetEditPage } from "./RulesetEditPage";
import { RulesetsPage } from "./RulesetsPage";

vi.mock("../../lib/auth", () => ({ useAuth: () => ({ user: { id: "u1", username: "anna", displayName: null }, loading: false }) }));

const post = vi.fn();
vi.mock("../../lib/api", async (orig) => {
  const real = await orig<typeof import("../../lib/api")>();
  return {
    ...real,
    apiGet: () => Promise.reject(new Error("offline")),
    apiPost: (path: string, body: unknown) => {
      post(path, body);
      return Promise.resolve({ ...(body as object), id: "new-id" });
    },
  };
});

const renderAt = (url: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/rulesets" element={<RulesetsPage />} />
            <Route path="/rulesets/:id" element={<RulesetEditPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );

afterEach(() => post.mockReset());

describe("rulesets", () => {
  it("lists the built-in rulesets of a game with a summary", async () => {
    renderAt("/rulesets?game=wizard");
    expect(await screen.findByRole("heading", { name: "Nicht aufgehen" })).toBeInTheDocument();
    expect(screen.getAllByText("Stiche eintragen").length).toBeGreaterThan(0);
  });

  it("copies a trick ruleset, validates and saves", async () => {
    renderAt("/rulesets/new?base=wizard.standard");
    const name = await screen.findByLabelText("Name");
    expect(name).toHaveValue("Standard (eigene)");
    fireEvent.change(name, { target: { value: "Hausregel" } });
    // min > max is reported and blocks saving
    const min = screen.getByText("Spieler min.").parentElement!.querySelector("input")!;
    fireEvent.change(min, { target: { value: "7" } });
    expect(screen.getByRole("alert")).toHaveTextContent("min > max");
    expect(screen.getByRole("button", { name: "Speichern" })).toBeDisabled();
    fireEvent.change(min, { target: { value: "3" } });
    fireEvent.click(screen.getByText(/darf nicht aufgehen/));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await vi.waitFor(() => expect(post).toHaveBeenCalled());
    const [path, body] = post.mock.calls[0]!;
    expect(path).toBe("/rulesets");
    expect(body).toMatchObject({ kind: "trick-bidding", gameId: "wizard", name: "Hausregel", rules: { bidding: { sumRule: "notEqualCards" } } });
  });

  it("edits a score sheet: adds a column", async () => {
    renderAt("/rulesets/new?base=kniffel.standard");
    fireEvent.click(await screen.findByRole("button", { name: "Spalte hinzufügen" }));
    expect(screen.getAllByLabelText("Spaltenname")).toHaveLength(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
