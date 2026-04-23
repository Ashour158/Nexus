import { ConflictError, ServiceUnavailableError } from '@nexus/service-utils';

function keycloakBase(): string {
  const base = process.env.KEYCLOAK_URL?.replace(/\/$/, '');
  if (!base) {
    throw new ServiceUnavailableError('Keycloak');
  }
  return base;
}

function targetRealm(): string {
  return process.env.KEYCLOAK_REALM ?? 'nexus';
}

/**
 * Obtains an access token for the Keycloak Admin API (client credentials).
 * Uses `KEYCLOAK_ADMIN_CLIENT_ID`, `KEYCLOAK_ADMIN_CLIENT_SECRET`, and optionally
 * `KEYCLOAK_ADMIN_TOKEN_REALM` (defaults to `KEYCLOAK_REALM`).
 */
export async function getKeycloakAdminAccessToken(): Promise<string> {
  const base = keycloakBase();
  const clientId = process.env.KEYCLOAK_ADMIN_CLIENT_ID;
  const clientSecret = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new ServiceUnavailableError(
      'Keycloak Admin (set KEYCLOAK_ADMIN_CLIENT_ID and KEYCLOAK_ADMIN_CLIENT_SECRET)'
    );
  }
  const tokenRealm = process.env.KEYCLOAK_ADMIN_TOKEN_REALM ?? targetRealm();
  const tokenUrl = `${base}/realms/${tokenRealm}/protocol/openid-connect/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new ServiceUnavailableError(`Keycloak Admin token: HTTP ${res.status}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new ServiceUnavailableError('Keycloak Admin token: missing access_token');
  }
  return json.access_token;
}

/**
 * Creates a user in Keycloak and returns the Keycloak user id (UUID).
 */
export async function createKeycloakRealmUser(input: {
  email: string;
  firstName: string;
  lastName: string;
  username?: string;
}): Promise<string> {
  const base = keycloakBase();
  const realm = targetRealm();
  const token = await getKeycloakAdminAccessToken();
  const url = `${base}/admin/realms/${realm}/users`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username: input.username ?? input.email,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      enabled: true,
      emailVerified: false,
    }),
  });
  if (res.status === 409) {
    throw new ConflictError('User', 'email');
  }
  if (!res.ok) {
    const detail = await res.text();
    throw new ServiceUnavailableError(`Keycloak create user: HTTP ${res.status} ${detail}`);
  }
  const location = res.headers.get('Location');
  if (!location) {
    throw new ServiceUnavailableError('Keycloak create user: missing Location header');
  }
  const segments = location.split('/').filter(Boolean);
  const id = segments[segments.length - 1];
  if (!id) {
    throw new ServiceUnavailableError('Keycloak create user: could not parse user id');
  }
  return id;
}

/**
 * Deletes a user from Keycloak (compensating transaction).
 */
export async function deleteKeycloakRealmUser(keycloakUserId: string): Promise<void> {
  const base = keycloakBase();
  const realm = targetRealm();
  const token = await getKeycloakAdminAccessToken();
  const url = `${base}/admin/realms/${realm}/users/${encodeURIComponent(keycloakUserId)}`;
  const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok && res.status !== 404) {
    throw new ServiceUnavailableError(`Keycloak delete user: HTTP ${res.status}`);
  }
}

/**
 * Enables or disables a user in Keycloak (best-effort; ignores 404).
 */
export async function setKeycloakRealmUserEnabled(
  keycloakUserId: string,
  enabled: boolean
): Promise<void> {
  const base = keycloakBase();
  const realm = targetRealm();
  const token = await getKeycloakAdminAccessToken();
  const url = `${base}/admin/realms/${realm}/users/${encodeURIComponent(keycloakUserId)}`;
  const getRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (getRes.status === 404) {
    return;
  }
  if (!getRes.ok) {
    throw new ServiceUnavailableError(`Keycloak get user: HTTP ${getRes.status}`);
  }
  const user = (await getRes.json()) as Record<string, unknown>;
  const putRes = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...user, enabled }),
  });
  if (!putRes.ok) {
    throw new ServiceUnavailableError(`Keycloak update user: HTTP ${putRes.status}`);
  }
}
