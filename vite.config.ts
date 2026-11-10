import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // GitHub Pages serves a project site from /<repo>/. CI sets BASE; dev and local builds stay at /.
  base: process.env.BASE ?? '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'Workout Companion',
        short_name: 'Workout',
        description: 'Offline-first workout companion: import a program, follow it set by set.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#0b0b0d',
        theme_color: '#0b0b0d',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Every SVG is precached with a content revision, so art changes reach the
        // phone on the next visit. A runtime CacheFirst image cache would pin the
        // old art to a stable URL for a year, which is how a phone ends up showing
        // drawings that no longer exist.
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,ico,woff2,webmanifest,md}'],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'mcp/**/*.test.ts'],
  },
});
