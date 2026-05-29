import type { NextConfig } from 'next';
import path from 'path';

interface NextWebpackConfig {
  resolve: {
    alias?: Record<string, unknown>;
  };
}

const hostedSiteScriptSrc =
  process.env.NODE_ENV === 'development'
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://esm.sh"
    : "script-src 'self' 'unsafe-inline' https://esm.sh";

const hostedSiteContentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  hostedSiteScriptSrc,
  "script-src-elem 'self' 'unsafe-inline' https://esm.sh",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: http: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' http://localhost:4000 http://127.0.0.1:4000 https:",
  "media-src 'self' data: blob: http: https:",
  "worker-src 'self' blob:",
].join('; ');

const hostedSiteSecurityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: hostedSiteContentSecurityPolicy,
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
    key: 'Referrer-Policy',
    value: 'no-referrer',
  },
  {
    key: 'Permissions-Policy',
    value: [
      'camera=()',
      'microphone=()',
      'geolocation=()',
      'payment=()',
      'usb=()',
      'serial=()',
      'clipboard-read=()',
      'clipboard-write=()',
      'fullscreen=(self)',
    ].join(', '),
  },
  {
    key: 'Cross-Origin-Opener-Policy',
    value: 'same-origin',
  },
  {
    key: 'Cross-Origin-Resource-Policy',
    value: 'same-origin',
  },
  {
    key: 'Origin-Agent-Cluster',
    value: '?1',
  },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  images: { unoptimized: true },
  env: {
    BACKEND_URL: process.env.BACKEND_URL ?? 'http://localhost:4000',
  },
  headers() {
    return Promise.resolve([
      {
        source: '/sites/:path*',
        headers: hostedSiteSecurityHeaders,
      },
    ]);
  },
  webpack(config: NextWebpackConfig) {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@shared': path.resolve(__dirname, 'shared'),
    };
    return config;
  },
};

export default nextConfig;
