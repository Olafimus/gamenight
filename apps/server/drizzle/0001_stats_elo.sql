ALTER TABLE "match_results" ADD COLUMN "correct_rounds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "match_results" ADD COLUMN "finished_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "match_results" mr SET
  "finished_at" = COALESCE(m."finished_at", m."updated_at"),
  "correct_rounds" = (
    SELECT count(*)::int FROM jsonb_array_elements(m."state"->'rounds') r
    WHERE r->'correct'->>mr."player_id" = 'true'
  )
FROM "matches" m WHERE m."id" = mr."match_id";
