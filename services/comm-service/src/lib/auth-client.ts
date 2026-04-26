import { serviceAuthHeaders } from './http.js';

export async function fetchUserEmail(
  tenantId: string,
  userId: string
): Promise<string | undefined> {
  const base = (process.env.AUTH_SERVICE_URL ?? 'http://localhost:3010/api/v1').replace(/\/$/, '');
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(`${base}/users/${userId}`, {
      headers: serviceAuthHeaders(tenantId),
      signal: controller.signal,
    }).finally(() => clearTimeout(t));
    if (!res.ok) return undefined;
    const json = (await res.json()) as { data?: { email?: string } };
    return json.data?.email;
  } catch {
    return undefined;
  }
}
