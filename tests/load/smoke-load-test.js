import http from 'k6/http';
import { check, sleep } from 'k6';

// Smoke test — light load to verify basic functionality after deploy
export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

export default function () {
  // Health checks for critical services (no auth required for /health)
  const services = [
    { name: 'auth', path: '/health', port: 3000 },
    { name: 'crm', path: '/health', port: 3001 },
    { name: 'billing', path: '/health', port: 3011 },
    { name: 'gateway', path: '/health', port: 4000 },
  ];

  for (const svc of services) {
    const res = http.get(`${BASE_URL}${svc.path}`);
    check(res, {
      [`${svc.name} health is 200`]: (r) => r.status === 200,
    });
  }

  sleep(1);
}
