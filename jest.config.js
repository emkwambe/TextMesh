/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/services', '<rootDir>/packages'],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.spec.ts',
  ],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.base.json',
    }],
  },
  moduleNameMapper: {
    '^@textmesh/(.*)$': '<rootDir>/packages/$1/src',
  },
  collectCoverageFrom: [
    'services/**/src/**/*.ts',
    'packages/**/src/**/*.ts',
    '!**/__tests__/**',
    '!**/node_modules/**',
    '!**/dist/**',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  coverageReporters: ['text', 'lcov', 'html'],
  coverageDirectory: '<rootDir>/coverage',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testTimeout: 30000,
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
  projects: [
    {
      displayName: 'auth-service',
      testMatch: ['<rootDir>/services/auth-service/**/*.test.ts'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          tsconfig: '<rootDir>/services/auth-service/tsconfig.json',
        }],
      },
    },
    {
      displayName: 'post-service',
      testMatch: ['<rootDir>/services/post-service/**/*.test.ts'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          tsconfig: '<rootDir>/services/post-service/tsconfig.json',
        }],
      },
    },
    {
      displayName: 'feed-service',
      testMatch: ['<rootDir>/services/feed-service/**/*.test.ts'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          tsconfig: '<rootDir>/services/feed-service/tsconfig.json',
        }],
      },
    },
    {
      displayName: 'user-service',
      testMatch: ['<rootDir>/services/user-service/**/*.test.ts'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          tsconfig: '<rootDir>/services/user-service/tsconfig.json',
        }],
      },
    },
  ],
};
