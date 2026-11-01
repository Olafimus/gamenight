export interface Env {
  databaseUrl: string;
  jwtSecret: string;
  port: number;
  production: boolean;
  /** COOKIE_SECURE=true|false overrides; undefined = secure only if the request arrived via HTTPS (trust proxy). */
  cookieSecure?: boolean;
}

export function loadEnv(): Env {
  const production = process.env.NODE_ENV === "production";
  if (production && !process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET must be set when NODE_ENV=production");
  }
  return {
    databaseUrl: process.env.DATABASE_URL ?? "postgres://scheisse:scheisse@localhost:5433/scheisse",
    jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
    port: Number(process.env.PORT ?? 3001),
    production,
    cookieSecure: process.env.COOKIE_SECURE === "true" ? true : process.env.COOKIE_SECURE === "false" ? false : undefined,
  };
}
