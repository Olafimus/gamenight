CREATE TABLE IF NOT EXISTS "rulesets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"game_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"rules" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_results" ADD COLUMN "game_id" text DEFAULT 'scheisse' NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "game_id" text DEFAULT 'scheisse' NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "ruleset_id" text DEFAULT 'scheisse.standard' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rulesets" ADD CONSTRAINT "rulesets_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rulesets_owner_idx" ON "rulesets" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matches_game_id_idx" ON "matches" USING btree ("game_id");--> statement-breakpoint
-- Data: v1 states (Scheisse only, no "kind") get the Scheisse standard rules snapshot (same as upgradeMatchState() in @gamenight/shared).
UPDATE "matches" SET "state" = '{"kind":"trick-bidding","gameId":"scheisse","ruleset":{"id":"scheisse.standard","name":"Standard"},"rules":{"players":{"min":2,"max":10},"winner":"highest","deck":{"sizes":[32,52,64],"defaultSize":32},"rounds":{"schedule":"pyramid","fixedCards":null,"fixedRounds":null,"allowMaxCards":true},"bidding":{"sumRule":"free"},"entry":"hit","tricksMustSumToCards":false,"scoring":{"hitBase":10,"hitPerTrick":1,"missBase":-10,"missPerTrickDiff":0}}}'::jsonb || "state" WHERE NOT ("state" ? 'kind');
