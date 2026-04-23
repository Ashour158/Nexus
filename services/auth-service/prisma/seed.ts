import { PrismaClient } from '../../../node_modules/.prisma/auth-client/index.js';
import { ROLE_PERMISSIONS } from '@nexus/service-utils';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'default' },
    create: { slug: 'default', name: 'Default Org', plan: 'starter' },
    update: {},
  });

  const roleNames = Object.keys(ROLE_PERMISSIONS) as (keyof typeof ROLE_PERMISSIONS)[];
  for (const name of roleNames) {
    const perms = ROLE_PERMISSIONS[name];
    await prisma.role.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name } },
      create: {
        tenantId: tenant.id,
        name,
        description: `${String(name)} (system)`,
        permissions: perms,
        isSystem: true,
      },
      update: { permissions: perms },
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
