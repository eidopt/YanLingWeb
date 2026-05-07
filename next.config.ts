import type { NextConfig } from 'next';
import path from 'path';

interface NextWebpackConfig {
  resolve: {
    alias?: Record<string, unknown>;
  };
}

const nextConfig: NextConfig = {
  output: 'standalone',
  env: {
    BACKEND_URL: process.env.BACKEND_URL ?? 'http://localhost:4000',
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
