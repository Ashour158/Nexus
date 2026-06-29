import type { FastifyInstance } from 'fastify';
import type { AuthPrisma } from '../prisma.js';
import { createSamlStrategy } from '../lib/saml.strategy.js';

export async function registerSsoRoutes(app: FastifyInstance, prisma: AuthPrisma): Promise<void> {
  await app.register(
    async (r) => {
      r.get('/auth/saml/metadata', async (req, reply) => {
        const qTenant = (req.query as { tenant?: string }).tenant;
        const tenantId = String(req.headers['x-tenant-id'] ?? qTenant ?? 'default');
        const base = process.env.APP_URL || 'http://localhost:3000';
        const callbackUrl = `${base}/api/v1/auth/saml/callback/${tenantId}`;
        const issuer = `nexus-crm-${tenantId}`;
        const metadata = `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${issuer}">
  <SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${callbackUrl}" index="1" />
  </SPSSODescriptor>
</EntityDescriptor>`;
        reply.header('Content-Type', 'application/xml');
        return reply.send(metadata);
      });

      r.get('/auth/saml/login/:tenantId', async (req, reply) => {
        const { tenantId } = req.params as { tenantId: string };
        const ssoConfig = await prisma.ssoConfiguration.findFirst({
          where: { tenantId, isActive: true },
        });
        if (!ssoConfig) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'SSO not configured for this tenant', requestId: req.id } });

        const callbackUrl = `${process.env.APP_URL || 'http://localhost:3000'}/api/v1/auth/saml/callback/${tenantId}`;
        const strategy = createSamlStrategy(prisma, tenantId, {
          entryPoint: ssoConfig.entryPoint,
          issuer: ssoConfig.issuer,
          cert: ssoConfig.certificate,
          callbackUrl,
        });
        void strategy;
        return reply.redirect(ssoConfig.entryPoint);
      });

      r.post('/auth/saml/callback/:tenantId', async (req, reply) => {
        const { tenantId } = req.params as { tenantId: string };
        const ssoConfig = await prisma.ssoConfiguration.findFirst({ where: { tenantId, isActive: true } });
        if (!ssoConfig) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'SSO not configured', requestId: req.id } });

        const body = (req.body ?? {}) as Record<string, unknown>;
        const email = String(body.email ?? body.nameID ?? '').trim().toLowerCase();
        if (!email) {
          reply.redirect('/login?error=sso_failed');
          return;
        }

        let user = await prisma.user.findFirst({ where: { tenantId, email } });
        if (!user) {
          user = await prisma.user.create({
            data: {
              tenantId,
              email,
              firstName: email.split('@')[0] || 'User',
              lastName: '',
              keycloakId: `saml:${tenantId}:${email}`,
              ssoProvider: ssoConfig.provider || 'saml',
              emailVerified: true,
            },
          });
        }

        const token = app.jwt.sign(
          { userId: user.id, email: user.email, tenantId },
          { expiresIn: '8h' }
        );
        // SECURITY FIX: Do not pass JWT in URL parameter (leaks to browser history, server logs, Referer headers)
        // Instead, set as httpOnly cookie with short expiry and redirect
        (reply as any).setCookie('sso_token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 300, // 5 minutes — enough for frontend to exchange for session
          path: '/',
        });
        reply.redirect('/auth/sso/exchange');
      });

      r.get('/sso/config', async (req, reply) => {
        const jwt = (req as any).user as { tenantId: string };
        const tenantId = jwt.tenantId;
        const config = await prisma.ssoConfiguration.findFirst({ where: { tenantId } });
        if (!config) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'SSO configuration not found', requestId: req.id } });
        return reply.send({ success: true, data: { ...config, certificate: config.certificate ? '***' : null } });
      });

      r.post('/sso/config', async (req, reply) => {
        const jwt = (req as any).user as { tenantId: string };
        const tenantId = jwt.tenantId;
        const body = req.body as { entryPoint: string; issuer: string; certificate: string; provider?: string };
        const existing = await prisma.ssoConfiguration.findFirst({ where: { tenantId } });
        const config = existing
          ? await prisma.ssoConfiguration.update({
              where: { tenantId },
              data: {
                entryPoint: body.entryPoint,
                issuer: body.issuer,
                certificate: body.certificate,
                provider: body.provider ?? 'saml',
              },
            })
          : await prisma.ssoConfiguration.create({
              data: {
                tenantId,
                entryPoint: body.entryPoint,
                issuer: body.issuer,
                certificate: body.certificate,
                provider: body.provider ?? 'saml',
                isActive: false,
              },
            });
        return reply.send({ success: true, data: { ...config, certificate: '***' } });
      });

      r.get('/auth/sso/exchange', async (req, reply) => {
        const token = (req as any).cookies?.sso_token;
        if (!token) {
          return reply.status(401).send({ success: false, error: { code: 'NO_SSO_TOKEN', message: 'No SSO token found. Please log in again.' } });
        }
        // Clear the one-time SSO cookie
        (reply as any).clearCookie('sso_token', { path: '/' });
        return reply.send({ success: true, data: { token } });
      });

      r.patch('/sso/config/toggle', async (req, reply) => {
        const jwt = (req as any).user as { tenantId: string };
        const tenantId = jwt.tenantId;
        const config = await prisma.ssoConfiguration.findFirst({ where: { tenantId } });
        if (!config) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'SSO not configured yet', requestId: req.id } });
        const next = !config.isActive;
        await prisma.ssoConfiguration.update({
          where: { tenantId },
          data: { isActive: next },
        });
        return reply.send({ success: true, data: { isActive: next } });
      });
    },
    { prefix: '/api/v1' }
  );
}
