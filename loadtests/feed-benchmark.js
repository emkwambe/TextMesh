/**
 * TextMesh Feed Performance Benchmark
 *
 * Focused load test for feed performance optimization.
 * Tests various feed scenarios and measures latency percentiles.
 *
 * Usage:
 *   k6 run feed-benchmark.js
 *   k6 run feed-benchmark.js --out json=results.json
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Custom metrics for detailed feed analysis
const forYouLatency = new Trend('feed_for_you_latency', true);
const followingLatency = new Trend('feed_following_latency', true);
const trendingLatency = new Trend('feed_trending_latency', true);
const paginationLatency = new Trend('feed_pagination_latency', true);
const cacheHitRate = new Rate('cache_hit_rate');
const feedErrors = new Counter('feed_errors');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api';

// Load test users from shared array (more efficient for large datasets)
const testUsers = new SharedArray('users', function() {
  // In production, load from a file:
  // return JSON.parse(open('./test-users.json'));
  return Array.from({ length: 100 }, (_, i) => ({
    id: `user-${i}`,
    accessToken: `test-token-${i}`,
    followingCount: randomIntBetween(10, 500),
  }));
});

export const options = {
  scenarios: {
    // Constant load for baseline measurement
    baseline: {
      executor: 'constant-arrival-rate',
      rate: 100,          // 100 requests per second
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 50,
      maxVUs: 200,
      exec: 'feedBaseline',
    },

    // Ramp up to find saturation point
    saturation: {
      executor: 'ramping-arrival-rate',
      startRate: 50,
      timeUnit: '1s',
      stages: [
        { target: 100, duration: '1m' },
        { target: 200, duration: '1m' },
        { target: 300, duration: '1m' },
        { target: 400, duration: '1m' },
        { target: 500, duration: '1m' },
      ],
      preAllocatedVUs: 100,
      maxVUs: 500,
      exec: 'feedSaturation',
      startTime: '6m',
    },

    // Cache warming test
    cacheTest: {
      executor: 'per-vu-iterations',
      vus: 50,
      iterations: 20,
      exec: 'cacheEfficiency',
      startTime: '12m',
    },
  },

  thresholds: {
    // Feed-specific latency thresholds
    feed_for_you_latency: ['p(50)<100', 'p(95)<300', 'p(99)<500'],
    feed_following_latency: ['p(50)<150', 'p(95)<400', 'p(99)<600'],
    feed_trending_latency: ['p(50)<100', 'p(95)<250', 'p(99)<400'],
    feed_pagination_latency: ['p(50)<100', 'p(95)<300', 'p(99)<500'],

    // Error rates
    http_req_failed: ['rate<0.01'],
    feed_errors: ['count<100'],

    // Cache efficiency
    cache_hit_rate: ['rate>0.8'],
  },
};

function getHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

function getRandomUser() {
  return testUsers[randomIntBetween(0, testUsers.length - 1)];
}

// Baseline feed performance test
export function feedBaseline() {
  const user = getRandomUser();
  const headers = getHeaders(user.accessToken);

  group('For You Feed', () => {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/feed/for-you?limit=20`, { headers });
    const latency = Date.now() - start;

    forYouLatency.add(latency);

    const success = check(res, {
      'for-you returns 200': (r) => r.status === 200,
      'for-you has posts': (r) => {
        try {
          return r.json('posts').length > 0;
        } catch {
          return false;
        }
      },
      'for-you latency < 500ms': () => latency < 500,
    });

    if (!success) {
      feedErrors.add(1);
    }

    // Check for cache header
    if (res.headers['X-Cache'] === 'HIT') {
      cacheHitRate.add(1);
    } else {
      cacheHitRate.add(0);
    }
  });

  sleep(0.1);
}

// Saturation test - push feed to limits
export function feedSaturation() {
  const user = getRandomUser();
  const headers = getHeaders(user.accessToken);

  // Rotate between different feed types
  const feedTypes = ['for-you', 'following', 'trending'];
  const feedType = feedTypes[randomIntBetween(0, feedTypes.length - 1)];

  const start = Date.now();
  const res = http.get(`${BASE_URL}/feed/${feedType}?limit=20`, { headers });
  const latency = Date.now() - start;

  switch (feedType) {
    case 'for-you':
      forYouLatency.add(latency);
      break;
    case 'following':
      followingLatency.add(latency);
      break;
    case 'trending':
      trendingLatency.add(latency);
      break;
  }

  check(res, {
    [`${feedType} returns 200 or 429`]: (r) => r.status === 200 || r.status === 429,
  });

  if (res.status !== 200 && res.status !== 429) {
    feedErrors.add(1);
  }
}

// Cache efficiency test
export function cacheEfficiency() {
  const user = getRandomUser();
  const headers = getHeaders(user.accessToken);

  group('Cache Warming', () => {
    // First request - cache miss expected
    const res1 = http.get(`${BASE_URL}/feed/for-you?limit=20`, { headers });

    // Second request - cache hit expected
    sleep(0.1);
    const res2 = http.get(`${BASE_URL}/feed/for-you?limit=20`, { headers });

    if (res2.headers['X-Cache'] === 'HIT') {
      cacheHitRate.add(1);
    } else {
      cacheHitRate.add(0);
    }
  });

  group('Pagination Performance', () => {
    let cursor = null;

    // Test pagination across 5 pages
    for (let page = 0; page < 5; page++) {
      const url = cursor
        ? `${BASE_URL}/feed/for-you?limit=20&cursor=${cursor}`
        : `${BASE_URL}/feed/for-you?limit=20`;

      const start = Date.now();
      const res = http.get(url, { headers });
      paginationLatency.add(Date.now() - start);

      check(res, {
        [`page ${page + 1} loads`]: (r) => r.status === 200,
      });

      if (res.status === 200) {
        try {
          cursor = res.json('cursor');
          if (!cursor) break; // No more pages
        } catch {
          break;
        }
      } else {
        feedErrors.add(1);
        break;
      }

      sleep(0.05);
    }
  });

  sleep(0.5);
}

// Default function
export default function() {
  feedBaseline();
}

// Custom summary for detailed analysis
export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    metrics: {
      forYou: {
        p50: data.metrics.feed_for_you_latency?.values?.['p(50)'] || 0,
        p95: data.metrics.feed_for_you_latency?.values?.['p(95)'] || 0,
        p99: data.metrics.feed_for_you_latency?.values?.['p(99)'] || 0,
        avg: data.metrics.feed_for_you_latency?.values?.avg || 0,
      },
      following: {
        p50: data.metrics.feed_following_latency?.values?.['p(50)'] || 0,
        p95: data.metrics.feed_following_latency?.values?.['p(95)'] || 0,
        p99: data.metrics.feed_following_latency?.values?.['p(99)'] || 0,
        avg: data.metrics.feed_following_latency?.values?.avg || 0,
      },
      trending: {
        p50: data.metrics.feed_trending_latency?.values?.['p(50)'] || 0,
        p95: data.metrics.feed_trending_latency?.values?.['p(95)'] || 0,
        p99: data.metrics.feed_trending_latency?.values?.['p(99)'] || 0,
        avg: data.metrics.feed_trending_latency?.values?.avg || 0,
      },
      cacheHitRate: data.metrics.cache_hit_rate?.values?.rate || 0,
      totalRequests: data.metrics.http_reqs?.values?.count || 0,
      errorRate: data.metrics.http_req_failed?.values?.rate || 0,
    },
    thresholds: data.thresholds,
  };

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'feed-benchmark-results.json': JSON.stringify(summary, null, 2),
  };
}

function textSummary(data, options) {
  const lines = [
    '═══════════════════════════════════════════════════════════════',
    '                  TextMesh Feed Benchmark Results              ',
    '═══════════════════════════════════════════════════════════════',
    '',
    'Feed Latency (milliseconds):',
    '─────────────────────────────────────────────────────────────────',
    `  For You:    p50=${Math.round(data.metrics.feed_for_you_latency?.values?.['p(50)'] || 0)}ms  p95=${Math.round(data.metrics.feed_for_you_latency?.values?.['p(95)'] || 0)}ms  p99=${Math.round(data.metrics.feed_for_you_latency?.values?.['p(99)'] || 0)}ms`,
    `  Following:  p50=${Math.round(data.metrics.feed_following_latency?.values?.['p(50)'] || 0)}ms  p95=${Math.round(data.metrics.feed_following_latency?.values?.['p(95)'] || 0)}ms  p99=${Math.round(data.metrics.feed_following_latency?.values?.['p(99)'] || 0)}ms`,
    `  Trending:   p50=${Math.round(data.metrics.feed_trending_latency?.values?.['p(50)'] || 0)}ms  p95=${Math.round(data.metrics.feed_trending_latency?.values?.['p(95)'] || 0)}ms  p99=${Math.round(data.metrics.feed_trending_latency?.values?.['p(99)'] || 0)}ms`,
    '',
    'Cache Performance:',
    '─────────────────────────────────────────────────────────────────',
    `  Hit Rate: ${Math.round((data.metrics.cache_hit_rate?.values?.rate || 0) * 100)}%`,
    '',
    'Request Statistics:',
    '─────────────────────────────────────────────────────────────────',
    `  Total Requests: ${data.metrics.http_reqs?.values?.count || 0}`,
    `  Error Rate: ${((data.metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2)}%`,
    `  Feed Errors: ${data.metrics.feed_errors?.values?.count || 0}`,
    '',
    '═══════════════════════════════════════════════════════════════',
  ];

  return lines.join('\n');
}
