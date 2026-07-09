import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const responseTime = new Trend('response_time');

// Test configuration — scaled for Black Friday 10k concurrent user simulation
export const options = {
  stages: [
    { duration: '2m', target: 500 },    // Ramp up to 500 users
    { duration: '5m', target: 500 },    // Soak at 500 users
    { duration: '3m', target: 2000 },   // Ramp up to 2k users
    { duration: '5m', target: 2000 },   // Soak at 2k users
    { duration: '5m', target: 5000 },   // Ramp up to 5k users
    { duration: '10m', target: 5000 },  // Soak at 5k users
    { duration: '5m', target: 10000 },  // Ramp up to 10k users
    { duration: '10m', target: 10000 }, // Peak load: 10k users
    { duration: '5m', target: 0 },      // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'], // 95% of requests should be below 1000ms at scale
    http_req_failed: ['rate<0.05'],    // Error rate should be below 5%
    errors: ['rate<0.05'],
  },
};

// Base URL for the API
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000'; // Kong proxy

// Test data — credentials injected via env vars (never commit real passwords)
const LOAD_TEST_EMAILS = (__ENV.LOAD_TEST_EMAILS || 'test1@nexus.com,test2@nexus.com,test3@nexus.com').split(',');
const LOAD_TEST_PASSWORD = __ENV.LOAD_TEST_PASSWORD || 'changeme-in-production';
const testUsers = LOAD_TEST_EMAILS.map((email) => ({ email: email.trim(), password: LOAD_TEST_PASSWORD }));

let authTokens = [];

export function setup() {
  // Pre-authenticate test users
  for (const user of testUsers) {
    const loginRes = http.post(`${BASE_URL}/api/v1/auth/login`, {
      email: user.email,
      password: user.password,
    });

    if (loginRes.status === 200) {
      const responseBody = JSON.parse(loginRes.body);
      authTokens.push(responseBody.accessToken);
    }
  }

  console.log(`Authenticated ${authTokens.length} test users`);
  return { authTokens };
}

export default function (data) {
  const token = data.authTokens[Math.floor(Math.random() * data.authTokens.length)];

  const params = {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };

  // Test scenarios with different weights
  const scenarios = [
    { weight: 40, action: testDealsAPI },
    { weight: 20, action: testContactsAPI },
    { weight: 15, action: testAccountsAPI },
    { weight: 10, action: testQuotesAPI },
    { weight: 10, action: testAnalyticsAPI },
    { weight: 5, action: testGraphQLAPI },
  ];

  // Weighted random selection
  const totalWeight = scenarios.reduce((sum, s) => sum + s.weight, 0);
  let random = Math.random() * totalWeight;

  for (const scenario of scenarios) {
    random -= scenario.weight;
    if (random <= 0) {
      scenario.action(params);
      break;
    }
  }

  sleep(Math.random() * 2 + 1); // Random sleep between 1-3 seconds
}

function testDealsAPI(params) {
  const startTime = new Date().getTime();

  const response = http.get(`${BASE_URL}/api/v1/deals?page=1&limit=20`, params);
  const duration = new Date().getTime() - startTime;

  responseTime.add(duration);

  const checkResult = check(response, {
    'deals API status is 200': (r) => r.status === 200,
    'deals API response time < 500ms': (r) => r.timings.duration < 500,
    'deals API has data': (r) => JSON.parse(r.body).data !== undefined,
  });

  errorRate.add(!checkResult);
}

function testContactsAPI(params) {
  const startTime = new Date().getTime();

  const response = http.get(`${BASE_URL}/api/v1/contacts?page=1&limit=20`, params);
  const duration = new Date().getTime() - startTime;

  responseTime.add(duration);

  const checkResult = check(response, {
    'contacts API status is 200': (r) => r.status === 200,
    'contacts API response time < 500ms': (r) => r.timings.duration < 500,
  });

  errorRate.add(!checkResult);
}

function testAccountsAPI(params) {
  const startTime = new Date().getTime();

  const response = http.get(`${BASE_URL}/api/v1/accounts?page=1&limit=20`, params);
  const duration = new Date().getTime() - startTime;

  responseTime.add(duration);

  const checkResult = check(response, {
    'accounts API status is 200': (r) => r.status === 200,
    'accounts API response time < 500ms': (r) => r.timings.duration < 500,
  });

  errorRate.add(!checkResult);
}

function testQuotesAPI(params) {
  const startTime = new Date().getTime();

  const response = http.get(`${BASE_URL}/api/v1/quotes?page=1&limit=20`, params);
  const duration = new Date().getTime() - startTime;

  responseTime.add(duration);

  const checkResult = check(response, {
    'quotes API status is 200': (r) => r.status === 200,
    'quotes API response time < 500ms': (r) => r.timings.duration < 500,
  });

  errorRate.add(!checkResult);
}

function testAnalyticsAPI(params) {
  const startTime = new Date().getTime();

  const response = http.get(`${BASE_URL}/api/v1/analytics/pipeline`, params);
  const duration = new Date().getTime() - startTime;

  responseTime.add(duration);

  const checkResult = check(response, {
    'analytics API status is 200': (r) => r.status === 200,
    'analytics API response time < 1000ms': (r) => r.timings.duration < 1000,
  });

  errorRate.add(!checkResult);
}

function testGraphQLAPI(params) {
  const startTime = new Date().getTime();

  const query = `
    query GetDeals($limit: Int) {
      deals(limit: $limit) {
        id
        name
        stage
        amount
      }
    }
  `;

  const response = http.post(`${BASE_URL}/graphql`, JSON.stringify({
    query,
    variables: { limit: 10 }
  }), {
    ...params,
    headers: {
      ...params.headers,
      'Content-Type': 'application/json',
    }
  });

  const duration = new Date().getTime() - startTime;

  responseTime.add(duration);

  const checkResult = check(response, {
    'GraphQL API status is 200': (r) => r.status === 200,
    'GraphQL API response time < 1000ms': (r) => r.timings.duration < 1000,
    'GraphQL response has no errors': (r) => {
      const body = JSON.parse(r.body);
      return !body.errors || body.errors.length === 0;
    },
  });

  errorRate.add(!checkResult);
}

export function teardown(data) {
  console.log('Load test completed');
  console.log(`Total authenticated users: ${data.authTokens.length}`);
}