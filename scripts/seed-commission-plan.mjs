/**
 * Seed a default commission plan on prod via the real API (server-side
 * validation, not a raw DB write). This is the "plan-configuration decision"
 * that was blocking the commission engine: the engine computes per-rep
 * commission on every deal.won, but produces nothing until a plan with at least
 * one rule exists.
 *
 * Default chosen: "Standard Sales Commission", REVENUE basis, a flat 5% for all
 * reps plus a 7% accelerator tier above $100k. Sensible, legible, editable in
 * the UI.
 */
const BASE = process.argv[2] ?? 'https://159-65-32-72.sslip.io';
const EMAIL = process.env.SEED_EMAIL ?? 'admin@demo.com';
const PASSWORD = process.env.SEED_PASSWORD ?? 'Demo1234!';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function main() {
  // 1. Authenticate.
  const loginRes = await fetch(`${BASE}/bff/auth/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const login = await loginRes.json();
  const token = login?.data?.accessToken ?? login?.accessToken ?? login?.data?.token;
  if (!token) throw new Error(`login failed: ${JSON.stringify(login).slice(0, 200)}`);
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // 2. Don't double-seed: if a plan already exists, stop.
  const existingRes = await fetch(`${BASE}/bff/incentive/commission/plans`, { headers: auth });
  const existing = await existingRes.json();
  const plans = Array.isArray(existing?.data) ? existing.data : (existing?.data?.items ?? []);
  if (plans.length > 0) {
    console.log(`plan(s) already exist (${plans.length}); not seeding. First: ${plans[0]?.name}`);
    return;
  }

  // 3. Create the plan.
  const planRes = await fetch(`${BASE}/bff/incentive/commission/plans`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      name: 'Standard Sales Commission',
      description: 'Default plan: 5% of won revenue, 7% above $100k. Edit under Commissions → Plans.',
      isActive: true,
      basis: 'REVENUE',
    }),
  });
  const plan = await planRes.json();
  const planId = plan?.data?.id ?? plan?.id;
  if (!planId) throw new Error(`plan create failed (${planRes.status}): ${JSON.stringify(plan).slice(0, 200)}`);
  console.log(`created plan ${planId}`);

  // 4. Base rule: 5% for everyone (no role/owner/product scope = applies to all).
  const baseRule = await fetch(`${BASE}/bff/incentive/commission/plans/${planId}/rules`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ ratePercent: 5, priority: 0 }),
  });
  console.log(`base rule 5%: ${baseRule.status}`);

  // 5. Accelerator: 7% on the portion/deals at or above $100k (higher priority wins).
  const tierRule = await fetch(`${BASE}/bff/incentive/commission/plans/${planId}/rules`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ ratePercent: 7, tierMinAmount: 100000, priority: 10 }),
  });
  console.log(`accelerator rule 7% >= $100k: ${tierRule.status}`);

  console.log('COMMISSION PLAN SEEDED');
}

main().catch((e) => {
  console.error('SEED FAILED:', e.message);
  process.exit(1);
});
