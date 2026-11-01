import type { RouteObject } from "react-router-dom";
import { AccountPage } from "./AccountPage";
import { AuthPage } from "./AuthPage";

export const authRoutes: RouteObject[] = [
  { path: "login", element: <AuthPage mode="login" /> },
  { path: "register", element: <AuthPage mode="register" /> },
  { path: "account", element: <AccountPage /> },
];
