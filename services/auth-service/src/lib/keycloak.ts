import * as jose from 'jose';
import { ServiceUnavailableError } from '@nexus/service-utils';

export interface KeycloakClaims {
  sub: string;
  email?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  tenant_id?: string;
  [key: string]: unknown;
}

export async function verifyKeycloakAccessToken(accessToken: string): Promise<KeycloakClaims> {
  const base = process.env.KEYCLOAK_URL;
  const realm = process.env.KEYCLOAK_REALM ?? 'nexus';
  if (!base) {
    throw new ServiceUnavailableError('Keycloak');
  }
  const issuer = `${base.replace(/\/$/, '')}/realms/${realm}`;
  const jwks = jose.createRemoteJWKSet(new URL(`${issuer}/protocol/openid-connect/certs`));

  const verifyOpts: jose.JWTVerifyOptions = { issuer };
  const aud = process.env.KEYCLOAK_CLIENT_ID;
  if (aud && process.env.KEYCLOAK_SKIP_AUDIENCE !== '1') {
    verifyOpts.audience = aud;
  }

  const { payload } = await jose.jwtVerify(accessToken, jwks, verifyOpts);
  return payload as KeycloakClaims;
}
