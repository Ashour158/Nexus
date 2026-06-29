-- Add scoring fields to leads table

ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "confidence" DOUBLE PRECISION;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "routingDecision" JSONB;
