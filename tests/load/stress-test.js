import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 500 },
    { duration: '5m', target: 500 },
    { duration: '2m', target: 2000 },
    { duration: '5m', target: 2000 },
    { duration: '2m', target: 5000 },
    { duration: '5m', target: 5000 },
    { duration: '2m', target: 10000 },
    { duration: '5m', target: 10000 },
    { duration: '2m', target: 15000 },
    { duration: '5m', target: 15000 },
    { duration: '10m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.05'],
  },
};

export default function () {
  // Stress multiple critical endpoints, not just health
  const base = __ENV.BASE_URL || 'http://localhost:8000';
  const endpoints = [
    `${base}/health`,
    `${base}/api/v1/deals?page=1&limit=20`,
    `${base}/api/v1/contacts?page=1&limit=20`,
    `${base}/api/v1/accounts?page=1&limit=20`,
  ];
  const url = endpoints[Math.floor(Math.random() * endpoints.length)];
  const res = http.get(url);
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 2000ms': (r) => r.timings.duration < 2000,
  });
}
