import type { Config } from 'jest';

/**
 * Creates a comprehensive Jest configuration for the Next.js web application
 * with support for TypeScript, React testing, code coverage, and CI integration.
 * 
 * @version jest ^29.6.0
 */
const createJestConfig = async (): Promise<Config> => {
  const config: Config = {
    // Use jsdom environment for browser-like testing
    testEnvironment: 'jsdom',

    // Define root directory for tests
    roots: ['<rootDir>/src'],

    // Supported file extensions for test modules
    moduleFileExtensions: [
      'ts',
      'tsx',
      'js',
      'jsx',
      'json'
    ],

    // Test file patterns
    testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.[jt]sx?$',

    // Configure TypeScript and Next.js transforms
    transform: {
      '^.+\\.(ts|tsx)$': [
        'babel-jest',
        {
          presets: ['next/babel']
        }
      ]
    },

    // Module name mapping for path aliases and assets
    moduleNameMapper: {
      // Path alias mapping
      '^@/(.*)$': '<rootDir>/src/$1',
      
      // Style file mocks
      '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
      
      // Asset file mocks
      '\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/src/__mocks__/fileMock.js'
    },

    // Test setup files
    setupFilesAfterEnv: [
      '<rootDir>/src/setupTests.ts'
    ],

    // Paths to ignore during testing
    testPathIgnorePatterns: [
      '<rootDir>/node_modules/',
      '<rootDir>/.next/',
      '<rootDir>/cypress/'
    ],

    // Coverage collection configuration
    collectCoverageFrom: [
      'src/**/*.{ts,tsx}',
      '!src/**/*.d.ts',
      '!src/**/*.stories.{ts,tsx}',
      '!src/**/*.test.{ts,tsx}',
      '!src/**/__tests__/**',
      '!src/**/__mocks__/**'
    ],

    // Coverage thresholds enforcement
    coverageThreshold: {
      global: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80
      }
    },

    // Watch plugins for interactive mode
    watchPlugins: [
      'jest-watch-typeahead/filename',
      'jest-watch-typeahead/testname'
    ]
  };

  return config;
};

// Export the configuration for Jest to use
export default createJestConfig();