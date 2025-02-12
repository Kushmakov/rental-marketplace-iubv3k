import { defineConfig } from 'cypress'; // ^13.0.0

export default defineConfig({
  // E2E Testing Configuration
  e2e: {
    baseUrl: 'http://localhost:3000',
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    
    // Viewport configuration matching design specifications
    viewportWidth: 1280,
    viewportHeight: 720,
    
    // Request timeout configurations
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,
    responseTimeout: 10000,
    
    // Performance and resource optimizations
    video: false,
    screenshotOnRunFailure: true,
    
    // Test retry configuration
    retries: {
      runMode: 2, // Retry failed tests twice in CI
      openMode: 0  // No retries in interactive mode
    },
    
    // Additional e2e specific settings
    experimentalStudio: false,
    numTestsKeptInMemory: 50,
    experimentalSessionAndOrigin: true
  },

  // Component Testing Configuration
  component: {
    devServer: {
      framework: 'next',
      bundler: 'webpack',
      webpackConfig: {
        // Webpack will be configured automatically by Next.js
        devServer: {
          port: 3001
        }
      }
    },
    specPattern: 'src/**/*.cy.tsx',
    supportFile: 'cypress/support/component.ts',
    indexHtmlFile: 'cypress/support/component-index.html'
  },

  // Environment Variables
  env: {
    apiUrl: 'http://localhost:8000',
    coverage: false,
    codeCoverage: {
      url: 'http://localhost:3000/__coverage__',
      exclude: [
        'cypress/**/*.*',
        'src/**/*.test.*',
        'src/**/*.spec.*',
        'src/**/*.cy.*'
      ]
    }
  },

  // Global Configuration Options
  experimentalWebKitSupport: true,
  chromeWebSecurity: false,
  watchForFileChanges: true,
  testIsolation: true,
  includeShadowDom: true,
  
  // Reporter Configuration
  reporter: 'cypress-multi-reporters',
  reporterOptions: {
    configFile: 'reporter-config.json'
  },

  // Screenshot Configuration
  screenshotsFolder: 'cypress/screenshots',
  trashAssetsBeforeRuns: true,

  // Performance Optimization
  numTestsKeptInMemory: 50,
  experimentalMemoryManagement: true,
  
  // Browser Launch Options
  browsers: [
    {
      name: 'chrome',
      family: 'chromium',
      channel: 'stable',
      displayName: 'Chrome',
      version: 'latest'
    },
    {
      name: 'electron',
      family: 'chromium',
      displayName: 'Electron',
      version: 'latest'
    }
  ],

  // Download Behavior
  downloadsFolder: 'cypress/downloads',
  
  // Viewport Configuration
  viewportDefaults: {
    mobile: [375, 667],
    tablet: [768, 1024],
    desktop: [1280, 720],
    'desktop-xl': [1920, 1080]
  }
});