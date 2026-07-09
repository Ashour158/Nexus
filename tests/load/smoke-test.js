import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10,
  duration: '1m',
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const LOAD_TEST_EMAILS = (__ENV.LOAD_TEST_EMAILS || 'test1@nexus.com').split(',');
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
  const token = data.tokens[0];
  const params = token
    ? { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    : {};

  const endpoints = [
    { url: `${BASE_URL}/health`, method: 'GET', weight: 20 },
    { url: `${BASE_URL}/api/v1/deals?page=1&limit=20`, method: 'GET', weight: 25 },
    { url: `${BASE_URL}/api/v1/contacts?page=1&limit=20`, method: 'GET', weight: 25 },
    { url: `${BASE_URL}/api/v1/accounts?page=1&limit=20`, method: 'GET', weight: 20 },
    { url: `${BASE_URL}/api/v1/activities?page=1&limit=20`, method: 'GET', weight: 10 },
  ];

  const totalWeight = endpoints.reduce((sum, e) => sum + e.weight, 0);
  let random = Math.random() * totalWeight;
  const endpoint = endpoints.find((e) => {
    random -= e.weight;
    return random <= 0;
  }) || endpoints[0];

  const res = http.request(endpoint.method, endpoint.url, null, params);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(Math.random() * 0.5 + 0.5);
}
