/**
 * TextMesh API Load Testing Suite
 *
 * Comprehensive k6 load tests for the TextMesh platform.
 * Tests authentication, feed, posts, and user interactions.
 *
 * Usage:
 *   k6 run api-load-test.js
 *   k6 run api-load-test.js --vus 100 --duration 5m
 *   k6 run api-load-test.js -e BASE_URL=https://api.textmesh.com
 */

import http from 'k6/http';
import { check, group, sleep, fail } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomString, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Custom metrics
const errorRate = new Rate('errors');
const authLatency = new Trend('auth_latency', true);
const feedLatency = new Trend('feed_latency', true);
const postLatency = new Trend('post_latency', true);
const searchLatency = new Trend('search_latency', true);
const postsCreated = new Counter('posts_created');
const likesCreated = new Counter('likes_created');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api';

// Test scenarios
export const options = {
  scenarios: {
    // Smoke test - verify system works
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '30s',
      tags: { test_type: 'smoke' },
      exec: 'smokeTest',
    },

    // Load test - normal traffic patterns
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },   // Ramp up to 50 users
        { duration: '5m', target: 50 },   // Stay at 50
        { duration: '2m', target: 100 },  // Ramp up to 100
        { duration: '5m', target: 100 },  // Stay at 100
        { duration: '2m', target: 0 },    // Ramp down
      ],
      tags: { test_type: 'load' },
      exec: 'loadTest',
      startTime: '35s', // Start after smoke test
    },

    // Stress test - find breaking point
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 100 },
        { duration: '2m', target: 200 },
        { duration: '2m', target: 300 },
        { duration: '2m', target: 400 },
        { duration: '2m', target: 500 },
        { duration: '2m', target: 0 },
      ],
      tags: { test_type: 'stress' },
      exec: 'stressTest',
      startTime: '20m', // Start after load test
    },

    // Spike test - sudden traffic burst
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 50 },
        { duration: '30s', target: 50 },
        { duration: '10s', target: 500 }, // Sudden spike
        { duration: '1m', target: 500 },
        { duration: '10s', target: 50 },
        { duration: '30s', target: 50 },
        { duration: '10s', target: 0 },
      ],
      tags: { test_type: 'spike' },
      exec: 'spikeTest',
      startTime: '35m', // Start after stress test
    },

    // Soak test - extended duration
    soak: {
      executor: 'constant-vus',
      vus: 100,
      duration: '30m',
      tags: { test_type: 'soak' },
      exec: 'soakTest',
      startTime: '40m', // Start after spike test
    },
  },

  thresholds: {
    // HTTP request thresholds
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],

    // Custom metric thresholds
    errors: ['rate<0.05'],
    auth_latency: ['p(95)<300'],
    feed_latency: ['p(95)<400'],
    post_latency: ['p(95)<300'],
    search_latency: ['p(95)<500'],
  },
};

// Shared data
const testUsers = [];

// Setup function - runs once before tests
export function setup() {
  console.log('Setting up load test...');

  // Create test users
  for (let i = 0; i < 100; i++) {
    const user = {
      email: `loadtest_${randomString(8)}@test.textmesh.com`,
      password: 'TestPass123!',
      username: `loadtest_${randomString(8)}`,
      displayName: `Load Test User ${i}`,
    };

    const res = http.post(`${BASE_URL}/auth/register`, JSON.stringify(user), {
      headers: { 'Content-Type': 'application/json' },
    });

    if (res.status === 201) {
      const data = res.json();
      testUsers.push({
        ...user,
        id: data.user.id,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });
    }
  }

  console.log(`Created ${testUsers.length} test users`);
  return { users: testUsers };
}

// Teardown function - runs once after tests
export function teardown(data) {
  console.log('Cleaning up load test...');
  // Optionally delete test users
}

// Helper functions
function getAuthHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

function getRandomUser(data) {
  return data.users[randomIntBetween(0, data.users.length - 1)];
}

// Smoke test scenario
export function smokeTest(data) {
  const user = getRandomUser(data);

  group('Authentication', () => {
    // Login
    const loginStart = Date.now();
    const loginRes = http.post(`${BASE_URL}/auth/login`, JSON.stringify({
      email: user.email,
      password: user.password,
    }), { headers: { 'Content-Type': 'application/json' } });

    authLatency.add(Date.now() - loginStart);

    check(loginRes, {
      'login successful': (r) => r.status === 200,
      'has access token': (r) => r.json('accessToken') !== undefined,
    });

    errorRate.add(loginRes.status !== 200);
  });

  group('Feed', () => {
    const feedStart = Date.now();
    const feedRes = http.get(`${BASE_URL}/feed/for-you`, {
      headers: getAuthHeaders(user.accessToken),
    });

    feedLatency.add(Date.now() - feedStart);

    check(feedRes, {
      'feed loads': (r) => r.status === 200,
      'feed has posts': (r) => r.json('posts') !== undefined,
    });

    errorRate.add(feedRes.status !== 200);
  });

  sleep(1);
}

// Load test scenario - simulates normal user behavior
export function loadTest(data) {
  const user = getRandomUser(data);

  group('Browse Feed', () => {
    // Load for-you feed
    const feedStart = Date.now();
    const feedRes = http.get(`${BASE_URL}/feed/for-you?limit=20`, {
      headers: getAuthHeaders(user.accessToken),
    });
    feedLatency.add(Date.now() - feedStart);

    check(feedRes, {
      'feed loads': (r) => r.status === 200,
    });
    errorRate.add(feedRes.status !== 200);

    if (feedRes.status === 200) {
      const posts = feedRes.json('posts') || [];

      // Randomly interact with posts
      posts.slice(0, 5).forEach((post) => {
        if (Math.random() < 0.3) {
          // Like the post
          const likeRes = http.post(`${BASE_URL}/posts/${post.id}/like`, null, {
            headers: getAuthHeaders(user.accessToken),
          });
          if (likeRes.status === 200) {
            likesCreated.add(1);
          }
        }

        if (Math.random() < 0.1) {
          // View post detail
          http.get(`${BASE_URL}/posts/${post.id}`, {
            headers: getAuthHeaders(user.accessToken),
          });
        }
      });
    }

    sleep(randomIntBetween(2, 5));
  });

  group('Create Post', () => {
    if (Math.random() < 0.2) { // 20% of users create posts
      const postData = {
        content: `Load test post ${randomString(20)} #loadtest`,
        visibility: 'public',
      };

      const postStart = Date.now();
      const postRes = http.post(`${BASE_URL}/posts`, JSON.stringify(postData), {
        headers: getAuthHeaders(user.accessToken),
      });
      postLatency.add(Date.now() - postStart);

      check(postRes, {
        'post created': (r) => r.status === 201,
      });

      if (postRes.status === 201) {
        postsCreated.add(1);
      }
      errorRate.add(postRes.status !== 201);
    }

    sleep(randomIntBetween(1, 3));
  });

  group('Search', () => {
    if (Math.random() < 0.3) { // 30% of users search
      const searchTerms = ['hello', 'world', 'test', 'textmesh', 'social'];
      const term = searchTerms[randomIntBetween(0, searchTerms.length - 1)];

      const searchStart = Date.now();
      const searchRes = http.get(`${BASE_URL}/search?q=${term}&type=posts`, {
        headers: getAuthHeaders(user.accessToken),
      });
      searchLatency.add(Date.now() - searchStart);

      check(searchRes, {
        'search works': (r) => r.status === 200,
      });
      errorRate.add(searchRes.status !== 200);
    }

    sleep(randomIntBetween(1, 2));
  });

  group('Notifications', () => {
    if (Math.random() < 0.4) {
      const notifRes = http.get(`${BASE_URL}/notifications`, {
        headers: getAuthHeaders(user.accessToken),
      });

      check(notifRes, {
        'notifications load': (r) => r.status === 200,
      });
      errorRate.add(notifRes.status !== 200);
    }

    sleep(randomIntBetween(1, 2));
  });
}

// Stress test scenario - push the system
export function stressTest(data) {
  const user = getRandomUser(data);

  // Rapid-fire requests to test system limits
  group('Rapid Feed Requests', () => {
    for (let i = 0; i < 5; i++) {
      const feedRes = http.get(`${BASE_URL}/feed/for-you?limit=50`, {
        headers: getAuthHeaders(user.accessToken),
      });

      check(feedRes, {
        'feed loads under stress': (r) => r.status === 200,
      });
      errorRate.add(feedRes.status !== 200);
    }
  });

  group('Concurrent Post Creation', () => {
    const postData = {
      content: `Stress test post ${randomString(50)} #stresstest`,
      visibility: 'public',
    };

    const postRes = http.post(`${BASE_URL}/posts`, JSON.stringify(postData), {
      headers: getAuthHeaders(user.accessToken),
    });

    check(postRes, {
      'post created under stress': (r) => r.status === 201 || r.status === 429,
    });

    if (postRes.status === 201) {
      postsCreated.add(1);
    }
    errorRate.add(postRes.status !== 201 && postRes.status !== 429);
  });

  sleep(0.5);
}

// Spike test scenario - sudden traffic burst
export function spikeTest(data) {
  const user = getRandomUser(data);

  group('Spike Traffic', () => {
    // Simulate viral moment - everyone hitting the feed
    const feedRes = http.get(`${BASE_URL}/feed/trending`, {
      headers: getAuthHeaders(user.accessToken),
    });

    check(feedRes, {
      'feed survives spike': (r) => r.status === 200 || r.status === 429,
    });

    // Multiple rapid interactions
    if (feedRes.status === 200) {
      const posts = feedRes.json('posts') || [];
      posts.slice(0, 3).forEach((post) => {
        http.post(`${BASE_URL}/posts/${post.id}/like`, null, {
          headers: getAuthHeaders(user.accessToken),
        });
      });
    }
  });

  sleep(0.2);
}

// Soak test scenario - extended duration test
export function soakTest(data) {
  const user = getRandomUser(data);

  // Normal usage pattern over extended time
  group('Extended Usage', () => {
    // Browse feed
    const feedRes = http.get(`${BASE_URL}/feed/following`, {
      headers: getAuthHeaders(user.accessToken),
    });

    check(feedRes, {
      'feed stable over time': (r) => r.status === 200,
    });
    errorRate.add(feedRes.status !== 200);

    // Create occasional post
    if (Math.random() < 0.05) {
      const postData = {
        content: `Soak test ${randomString(30)}`,
        visibility: 'public',
      };

      http.post(`${BASE_URL}/posts`, JSON.stringify(postData), {
        headers: getAuthHeaders(user.accessToken),
      });
    }

    // Check profile
    if (Math.random() < 0.1) {
      http.get(`${BASE_URL}/users/me`, {
        headers: getAuthHeaders(user.accessToken),
      });
    }
  });

  sleep(randomIntBetween(3, 8));
}

// Default function (required by k6)
export default function(data) {
  loadTest(data);
}
