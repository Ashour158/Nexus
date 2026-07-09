// Seeds a demo tenant + SUPER_ADMIN role + a login-ready admin user.
// Run inside the auth-service container (has the generated client):
//   node /prisma-mig/seed-demo.mjs
// Credentials: admin@demo.com / Demo1234!
import { PrismaClient } from '/app/node_modules/.prisma/auth-client/index.js';

const prisma = new PrismaClient();

// scrypt hash of "Demo1234!" in cost$salt$hash (base64url) form — matches
// @nexus/security verifyPassword (default node scrypt params).
const PW_HASH =
  '16384$Ot9lWnkRV3MoxQsm1WhIR2iXto8mzCPvOmnje-uAxoc$7vmUG-M3ba4iA4zUKFb5srfD8r7U26EUbfocfkvFHfmy6xfcAYs43Wt9iNC2QniSdFym9cUnT_r9mIe3lEIsow';

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: { slug: 'demo', name: 'Demo Company', isActive: true },
  });

  let role = await prisma.role.findFirst({
    where: { tenantId: tenant.id, name: 'SUPER_ADMIN' },
  });
  if (!role) {
    role = await prisma.role.create({
      data: {
        tenantId: tenant.id,
        name: 'SUPER_ADMIN',
        description: 'Full access (demo)',
        permissions: [],
        isSystem: true,
      },
    });
  }

  const user = await prisma.user.upsert({
    where: { keycloakId: 'local:admin@demo.com' },
    update: { passwordHash: PW_HASH, isActive: true, emailVerified: true, tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      email: 'admin@demo.com',
      keycloakId: 'local:admin@demo.com',
      firstName: 'Demo',
      lastName: 'Admin',
      passwordHash: PW_HASH,
      emailVerified: true,
      isActive: true,
    },
  });

  const link = await prisma.userRole.findFirst({
    where: { userId: user.id, roleId: role.id },
  });
  if (!link) {
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }

  console.log(`SEED_OK tenant=${tenant.slug} user=${user.email} role=${role.name}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('SEED_FAIL', e);
    process.exit(1);
  });
