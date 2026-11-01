import { runMigrations } from "../src/db/migrate";

export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://scheisse:scheisse@localhost:5433/scheisse_test";
  await runMigrations(url);
}
