import type { Config } from '@jest/types'; // v29.6.0

const config: Config.InitialOptions = {
  // Use ts-jest as the default preset for TypeScript testing
  preset: 'ts-jest',

  // Set Node.js as the test environment
  testEnvironment: 'node',

  // Test file pattern matching
  testMatch: [
    '**/test/**/*.test.ts'
  ],

  // Module path aliases for microservices architecture
  moduleNameMapper: {
    '^@common/(.*)$': '<rootDir>/packages/common/src/$1',
    '^@database/(.*)$': '<rootDir>/packages/database/src/$1',
    '^@auth/(.*)$': '<rootDir>/packages/auth-service/src/$1',
    '^@listing/(.*)$': '<rootDir>/packages/listing-service/src/$1',
    '^@payment/(.*)$': '<rootDir>/packages/payment-service/src/$1',
    '^@notification/(.*)$': '<rootDir>/packages/notification-service/src/$1'
  },

  // Coverage collection configuration
  collectCoverage: true,
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: [
    'text',
    'lcov',
    'json-summary'
  ],

  // Strict coverage thresholds for quality assurance
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },

  // Test setup and teardown configurations
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  globalSetup: '<rootDir>/jest.global-setup.ts',
  globalTeardown: '<rootDir>/jest.global-teardown.ts',

  // Test execution configuration
  testTimeout: 30000,
  verbose: true,
  roots: ['<rootDir>/packages'],
  moduleFileExtensions: ['ts', 'js', 'json'],

  // TypeScript transformation configuration
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },

  // Mock behavior configuration
  clearMocks: true,
  restoreMocks: true,

  // Handle asynchronous operations
  detectOpenHandles: true,
  forceExit: true
};

export default config;