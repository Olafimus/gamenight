import type { RouteObject } from "react-router-dom";
import { RulesetEditPage } from "./RulesetEditPage";
import { RulesetsPage } from "./RulesetsPage";

export const rulesetRoutes: RouteObject[] = [
  { path: "rulesets", element: <RulesetsPage /> },
  { path: "rulesets/:id", element: <RulesetEditPage /> },
];
