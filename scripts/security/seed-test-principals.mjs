// Seed a 2nd tenant + admin AND a non-admin viewer in the demo tenant, for the
// MT-02 / SEC-06 isolation + RBAC test. Run inside nexus-auth.
import { PrismaClient } from '/app/node_modules/.prisma/auth-client/index.js';
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
const scryptAsync = promisify(scrypt);
const prisma = new PrismaClient();

async function hash(pw){ const salt=randomBytes(32); const d=await scryptAsync(pw,salt,64);
  return `${2**14}$${salt.toString('base64url')}$${d.toString('base64url')}`; }
const rid=(p)=>p+'_'+randomBytes(8).toString('hex');

(async()=>{
  const demo = await prisma.tenant.findFirst({ where: { slug: { not: '' } }, orderBy: { createdAt: 'asc' } });
  console.log('demo tenant', demo.id, demo.name);

  // ---- Non-admin VIEWER in the demo tenant (RBAC test) ----
  let viewerRole = await prisma.role.findFirst({ where: { tenantId: demo.id, name: 'VIEWER_TEST' } });
  if (!viewerRole) viewerRole = await prisma.role.create({ data: {
    tenantId: demo.id, name: 'VIEWER_TEST', description: 'read-only test role',
    permissions: ['deals:read','accounts:read','contacts:read','quotes:read'], isSystem: false } });
  let viewer = await prisma.user.findFirst({ where: { tenantId: demo.id, email: 'viewer@demo.com' } });
  if (!viewer) {
    viewer = await prisma.user.create({ data: {
      tenantId: demo.id, email: 'viewer@demo.com', keycloakId: rid('kc'),
      passwordHash: await hash('Viewer1234!'), firstName: 'View', lastName: 'Only', emailVerified: true, isActive: true } });
    await prisma.userRole.create({ data: { userId: viewer.id, roleId: viewerRole.id } });
  }
  console.log('viewer@demo.com', viewer.id, '(role VIEWER_TEST)');

  // ---- Tenant B + its own admin (isolation test) ----
  let tb = await prisma.tenant.findFirst({ where: { slug: 'rival-corp' } });
  if (!tb) tb = await prisma.tenant.create({ data: { slug: 'rival-corp', name: 'Rival Corp', isActive: true } });
  let tbAdminRole = await prisma.role.findFirst({ where: { tenantId: tb.id, name: 'ADMIN' } });
  if (!tbAdminRole) tbAdminRole = await prisma.role.create({ data: {
    tenantId: tb.id, name: 'ADMIN', description: 'tenant B admin', permissions: ['*'], isSystem: true } });
  let tbAdmin = await prisma.user.findFirst({ where: { tenantId: tb.id, email: 'admin@rival.com' } });
  if (!tbAdmin) {
    tbAdmin = await prisma.user.create({ data: {
      tenantId: tb.id, email: 'admin@rival.com', keycloakId: rid('kc'),
      passwordHash: await hash('Rival1234!'), firstName: 'Rival', lastName: 'Admin', emailVerified: true, isActive: true } });
    await prisma.userRole.create({ data: { userId: tbAdmin.id, roleId: tbAdminRole.id } });
  }
  console.log('admin@rival.com', tbAdmin.id, 'tenantB', tb.id);
  console.log('SEED-OK');
  await prisma.$disconnect();
})().catch(e=>{console.log('FATAL',e.message);process.exit(1);});
