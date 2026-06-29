#!/usr/bin/env tsx
/**
 * Health check script for all services.
 */
import { readFileSync } from 'node:fs';

const services = [
  { name: 'auth-service', url: 'http://localhost:3000/health' },
  { name: 'crm-service', url: 'http://localhost:3001/health' },
  { name: 'finance-service', url: 'http://localhost:3002/health' },
  { name: 'notification-service', url: 'http://localhost:3003/health' },
  { name: 'metadata-service', url: 'http://localhost:3004/health' },
  { name: 'realtime-service', url: 'http://localhost:3005/health' },
  { name: 'analytics-service', url: 'http://localhost:3006/health' },
  { name: 'workflow-service', url: 'http://localhost:3007/health' },
  { name: 'comm-service', url: 'http://localhost:3009/health' },
  { name: 'storage-service', url: 'http://localhost:3010/health' },
  { name: 'graphql-gateway', url: 'http://localhost:4000/health' },
];

async function checkHealth(): Promise<void> {
  console.log('=== Nexus CRM Health Check ===\n');
  let allHealthy = true;

  for (const svc of services) {
    try {
      const res = await fetch(svc.url, { signal: AbortSignal.timeout(5000) });
      const status = res.ok ? '✅ HEALTHY' : '❌ UNHEALTHY';
      console.log(`${svc.name.padEnd(25)} ${status} (${res.status})`);
      if (!res.ok) allHealthy = false;
    } catch (err) {
      console.log(`${svc.name.padEnd(25)} ❌ ERROR (${(err as Error).message})`);
      allHealthy = false;
    }
  }

  console.log('\n' + (allHealthy ? '✅ All services healthy' : '❌ Some services unhealthy'));
  process.exit(allHealthy ? 0 : 1);
}

checkHealth();
