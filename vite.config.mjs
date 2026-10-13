import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Frontend build configuration (replaces Create React App).
 *
 * - Both `VITE_*` and the legacy `REACT_APP_*` variables are exposed to the client, so existing
 *   `.env` files and hosting dashboards keep working. Prefer `VITE_*` for new settings.
 * - The production bundle is written to `build/` so nginx / deploy paths stay unchanged.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiUrl = env.VITE_API_URL || env.REACT_APP_API_URL || 'http://localhost:5000';
  const proxyApiToLocalBackend = /localhost|127\.0\.0\.1/.test(apiUrl);

  return {
    plugins: [react()],
    envPrefix: ['VITE_', 'REACT_APP_'],
    server: {
      port: 3000,
      // Dev only: forward /api to the local backend (same behaviour as the old setupProxy.js).
      proxy: proxyApiToLocalBackend
        ? { '/api': { target: apiUrl, changeOrigin: true } }
        : undefined,
    },
    preview: { port: 3000 },
    build: {
      outDir: 'build',
      emptyOutDir: true,
      // Same inline threshold Create React App used for small images (bytes).
      assetsInlineLimit: 10000,
      // Keep hashed bundles under /static/ so the existing nginx long-cache rule keeps matching.
      rolldownOptions: {
        output: {
          entryFileNames: 'static/js/[name]-[hash].js',
          chunkFileNames: 'static/js/[name]-[hash].js',
          assetFileNames: 'static/[ext]/[name]-[hash][extname]',
        },
      },
    },
    css: {
      preprocessorOptions: {
        scss: {
          // Existing styles use `@import`; migrating them to `@use` is a separate task.
          silenceDeprecations: ['import', 'global-builtin', 'color-functions'],
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/setupTests.js'],
      include: ['src/**/*.test.{js,jsx}'],
      css: false,
    },
  };
});
