import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 100 },
    { duration: '1m', target: 100 },
    { duration: '10s', target: 1400 },
    { duration: '3m', target: 1400 },
    { duration: '10s', target: 100 },
    { duration: '3m', target: 100 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.1'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const LOAD_TEST_EMAILS = (__ENV.LOAD_TEST_EMAILS || 'test1@nexus.com,test2@nexus.com').split(',');
const LOAD_TEST_PASSWORD = __ENV.LOAD_TEST_PASSWORD || 'changeme-in-production';

export function setup() {
  const tokens = [];
  for (const email of LOAD_TEST_EMAILS) {
    const loginRes = http.post(`${BASE_URL}/api/v1/auth/login`, {
      email: email.trim(),
      password: LOAD_TEST_PASSWORD,
    });
    if (loginRes.status === 200) {
      try {
        tokens.push(JSON.parse(loginRes.body).accessToken);
      } catch { /* ignore */ }
    }
  }
  return { tokens };
}

export default function (data) {
  const token = data.tokens[Math.floor(Math.random() * data.tokens.length)];
  const params = token
    ? { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    : {};

  const endpoints = [
    { url: `${BASE_URL}/health`, method: 'GET' },
    { url: `${BASE_URL}/api/v1/deals?page=1&limit=20`, method: 'GET' },
    { url: `${BASE_URL}/api/v1/contacts?page=1&limit=20`, method: 'GET' },
    { url: `${BASE_URL}/api/v1/accounts?page=1&limit=20`, method: 'GET' },
    { url: `${BASE_URL}/api/v1/deals`, method: 'POST', body: JSON.stringify({ name: 'Spike Test Deal', stage: 'prospecting', amount: 1000 }) },
    { url: `${BASE_URL}/api/v1/activities`, method: 'POST', body: JSON.stringify({ type: 'call', subject: 'Spike test activity' }) },
  ];

  const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
  const res = http.request(endpoint.method, endpoint.url, endpoint.body || null, params);

  check(res, {
    'status is 2xx': (r) => r.status >= 200 && r.status < 300,
    'response time < 2000ms': (r) => r.timings.duration < 2000,
  });

  sleep(Math.random() * 0.5 + 0.1);
}
