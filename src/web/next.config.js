/** @type {import('next').NextConfig} */

// next v13.4.0
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' *.stripe.com *.mapbox.com",
      "style-src 'self' 'unsafe-inline' *.mapbox.com",
      "img-src 'self' data: blob: *.projectx.com *.s3.amazonaws.com *.storage.googleapis.com",
      "connect-src 'self' *.projectx.com *.stripe.com *.mapbox.com",
      "frame-src 'self' *.stripe.com",
      "font-src 'self' data:",
    ].join('; '),
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(self), interest-cohort=()',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
]

const nextConfig = {
  reactStrictMode: true,
  
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_STRIPE_PUBLIC_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY,
    NEXT_PUBLIC_MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_ANALYTICS_ID: process.env.NEXT_PUBLIC_ANALYTICS_ID,
  },

  images: {
    domains: [
      'storage.googleapis.com',
      's3.amazonaws.com',
      'cdn.projectx.com',
      'images.projectx.com'
    ],
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 60,
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    loader: 'default',
    path: '/_next/image',
    disableStaticImages: false,
  },

  webpack: (config, { dev, isServer }) => {
    // Optimize module resolution
    config.resolve.modules.push('src')
    
    // Add performance budgets
    config.performance = {
      maxEntrypointSize: 512000,
      maxAssetSize: 512000,
      hints: dev ? false : 'warning',
    }

    // Enable SWC minification
    config.optimization = {
      ...config.optimization,
      minimize: !dev,
    }

    // Configure source maps
    if (!dev) {
      config.devtool = 'source-map'
    }

    // Add compression plugins for production
    if (!dev && !isServer) {
      const CompressionPlugin = require('compression-webpack-plugin')
      config.plugins.push(
        new CompressionPlugin({
          algorithm: 'gzip',
          test: /\.(js|css|html|svg)$/,
          threshold: 10240,
          minRatio: 0.8,
        })
      )
    }

    return config
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },

  async redirects() {
    return [
      {
        source: '/home',
        destination: '/',
        permanent: true,
      },
      {
        source: '/properties/:path*',
        has: [
          {
            type: 'host',
            value: 'old.projectx.com',
          },
        ],
        destination: 'https://projectx.com/properties/:path*',
        permanent: true,
      },
      {
        source: '/http://:path*',
        destination: 'https://:path*',
        permanent: true,
      },
    ]
  },

  experimental: {
    optimizeCss: true,
    scrollRestoration: true,
    serverActions: true,
    instrumentationHook: true,
  },

  poweredByHeader: false,
  generateEtags: true,
  compress: true,
  productionBrowserSourceMaps: true,
}

module.exports = withBundleAnalyzer(nextConfig)