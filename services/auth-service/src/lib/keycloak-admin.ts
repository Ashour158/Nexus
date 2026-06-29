import {
  ConflictError,
  createHttpClient,
  NexusError,
  ServiceUnavailableError,
  withResilience,
} from '@nexus/service-utils';

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

function createAdminClient(token: string) {
  const base = keycloakBase();
  const realm = targetRealm();
  return createHttpClient({
    baseURL: `${base}/admin/realms/${realm}`,
    headers: { Authorization: `Bearer ${token}` },
    timeoutMs: 10000,
    maxRetries: 3,
    circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30000 },
  });
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
  const tokenClient = createHttpClient({
    baseURL: `${base}/realms/${tokenRealm}`,
    timeoutMs: 10000,
    maxRetries: 3,
    circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30000 },
  });
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });
  try {
    const json = await tokenClient.post<{ access_token?: string }>(
      '/protocol/openid-connect/token',
      body.toString(),
      { 'Content-Type': 'application/x-www-form-urlencoded' }
    );
    if (!json.access_token) {
      throw new ServiceUnavailableError('Keycloak Admin token: missing access_token');
    }
    return json.access_token;
  } catch (err) {
    if (err instanceof NexusError) {
      throw new ServiceUnavailableError(`Keycloak Admin token: HTTP ${err.statusCode}`);
    }
    throw err;
  }
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
  const res = await withResilience(
    () =>
      fetch(url, {
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
      }),
    {
      timeoutMs: 10000,
      maxRetries: 3,
      circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30000 },
    }
  );
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
  const token = await getKeycloakAdminAccessToken();
  const client = createAdminClient(token);
  try {
    await client.delete(`/users/${encodeURIComponent(keycloakUserId)}`);
  } catch (err) {
    if (err instanceof NexusError && err.statusCode === 404) {
      return;
    }
    throw new ServiceUnavailableError(
      `Keycloak delete user: HTTP ${err instanceof NexusError ? err.statusCode : 'unknown'}`
    );
  }
}

/**
 * Sets a user's password in Keycloak (best-effort; ignores 404).
 */
export async function setKeycloakUserPassword(
  keycloakUserId: string,
  password: string,
  temporary = false
): Promise<void> {
  const token = await getKeycloakAdminAccessToken();
  const client = createAdminClient(token);
  try {
    await client.put(`/users/${encodeURIComponent(keycloakUserId)}/reset-password`, {
      type: 'password',
      value: password,
      temporary,
    });
  } catch (err) {
    if (err instanceof NexusError && err.statusCode === 404) {
      return;
    }
    if (err instanceof NexusError) {
      throw new ServiceUnavailableError(`Keycloak set password: HTTP ${err.statusCode}`);
    }
    throw err;
  }
}

/**
 * Enables or disables a user in Keycloak (best-effort; ignores 404).
 */
export async function setKeycloakRealmUserEnabled(
  keycloakUserId: string,
  enabled: boolean
): Promise<void> {
  const token = await getKeycloakAdminAccessToken();
  const client = createAdminClient(token);
  try {
    const user = await client.get<Record<string, unknown>>(
      `/users/${encodeURIComponent(keycloakUserId)}`
    );
    await client.put(`/users/${encodeURIComponent(keycloakUserId)}`, { ...user, enabled });
  } catch (err) {
    if (err instanceof NexusError && err.statusCode === 404) {
      return;
    }
    if (err instanceof NexusError) {
      throw new ServiceUnavailableError(`Keycloak get user: HTTP ${err.statusCode}`);
    }
    throw err;
  }
}
