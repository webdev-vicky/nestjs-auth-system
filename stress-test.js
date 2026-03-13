import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const signInDuration = new Trend('sign_in_duration');
const getMeDuration = new Trend('get_me_duration');

export const options = {
  stages: [
    { duration: '30s', target: 20 },   // ramp up to 20 users
    { duration: '1m',  target: 50 },   // ramp up to 50 users
    { duration: '1m',  target: 100 },  // ramp up to 100 users
    { duration: '30s', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],  // 95% of requests under 2s
    errors: ['rate<0.1'],               // error rate under 10%
  },
};

const BASE_URL = 'http://localhost:8080';

export function setup() {
  // Sign up a test user for the stress test
  const res = http.post(`${BASE_URL}/auth/sign-up`, JSON.stringify({
    email: 'stresstest@example.com',
    password: 'StressTest1!',
    passwordConfirm: 'StressTest1!',
    role: 'user',
  }), { headers: { 'Content-Type': 'application/json' } });

  // Sign in to get a token
  const signIn = http.post(`${BASE_URL}/auth/sign-in`, JSON.stringify({
    email: 'stresstest@example.com',
    password: 'StressTest1!',
  }), { headers: { 'Content-Type': 'application/json' } });

  return { token: signIn.json('accessToken') };
}

export default function (data) {
  const headers = { 'Content-Type': 'application/json' };

  // Test 1: Sign-in endpoint
  const signInStart = Date.now();
  const signInRes = http.post(`${BASE_URL}/auth/sign-in`, JSON.stringify({
    email: 'stresstest@example.com',
    password: 'StressTest1!',
  }), { headers });
  signInDuration.add(Date.now() - signInStart);

  const signInOk = check(signInRes, {
    'sign-in status 200 or 201': (r) => r.status === 200 || r.status === 201,
    'sign-in has accessToken': (r) => r.json('accessToken') !== undefined,
  });
  errorRate.add(!signInOk);

  const token = signInRes.json('accessToken') || data.token;

  sleep(0.5);

  // Test 2: /users/me endpoint
  const getMeStart = Date.now();
  const getMeRes = http.get(`${BASE_URL}/users/me`, {
    headers: { ...headers, Authorization: `Bearer ${token}` },
  });
  getMeDuration.add(Date.now() - getMeStart);

  const getMeOk = check(getMeRes, {
    '/users/me status 200': (r) => r.status === 200,
    '/users/me has email': (r) => r.json('email') !== undefined,
  });
  errorRate.add(!getMeOk);

  sleep(1);
}
