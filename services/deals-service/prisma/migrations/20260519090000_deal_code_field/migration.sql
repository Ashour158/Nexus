-- Deal coding integration field added after the initial deal baseline.

ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "code" TEXT;

