-- Add a terminal DEAD state for outbound webhook deliveries whose retry
-- budget (max ~5 attempts) has been exhausted. Distinct from FAILED, which
-- marks a single non-retryable hard failure (inactive sub, decrypt/SSRF block).
ALTER TYPE "DeliveryStatus" ADD VALUE IF NOT EXISTS 'DEAD';
