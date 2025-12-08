// Jest setup file
// Configure environment variables for testing

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-key-12345';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-12345';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/textmesh_test';
process.env.REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6379/1';

// Extend Jest timeout for integration tests
jest.setTimeout(30000);

// Global test utilities
global.delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Clean up handlers
afterAll(async () => {
  // Give time for async operations to complete
  await new Promise(resolve => setTimeout(resolve, 500));
});

// Console mocking for cleaner test output
const originalConsole = { ...console };

beforeAll(() => {
  // Suppress console.log in tests unless DEBUG is set
  if (!process.env.DEBUG) {
    console.log = jest.fn();
    console.info = jest.fn();
  }
});

afterAll(() => {
  console.log = originalConsole.log;
  console.info = originalConsole.info;
});
