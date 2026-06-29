import { Strategy as SamlStrategy, type Profile, type VerifiedCallback } from '@node-saml/passport-saml';
import type { AuthPrisma } from '../prisma.js';

export function createSamlStrategy(
  prisma: AuthPrisma,
  tenantId: string,
  config: { entryPoint: string; issuer: string; cert: string; callbackUrl: string }
): SamlStrategy {
  return new SamlStrategy(
    {
      entryPoint: config.entryPoint,
      issuer: config.issuer,
      cert: config.cert,
      callbackUrl: config.callbackUrl,
      identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    },
    async (profile: Profile | null | undefined, done: VerifiedCallback) => {
      try {
        const profileAny = (profile ?? {}) as unknown as Record<string, unknown>;
        const email =
          String(profileAny.nameID ?? profileAny.email ?? '').trim().toLowerCase();
        if (!email) return done(new Error('No email in SAML response'));

        let user = await prisma.user.findFirst({ where: { tenantId, email } });
        if (!user) {
          const first =
            String(
              profileAny['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname'] ??
                email.split('@')[0]
            ) || 'User';
          const last = String(
            profileAny['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname'] ?? ''
          );
          user = await prisma.user.create({
            data: {
              tenantId,
              email,
              firstName: first,
              lastName: last,
              keycloakId: `saml:${tenantId}:${email}`,
              ssoProvider: 'saml',
              emailVerified: true,
            },
          });
        }

        return done(null, user);
      } catch (err) {
        return done(err as Error);
      }
    }
  );
}
