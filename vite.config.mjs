import { createHash } from 'node:crypto';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Production HTML only. Lets the first screen paint before the full stylesheet,
 * and sends a Content-Security-Policy that still allows the inline boot script.
 */
function productionHtmlPlugin() {
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'self' blob:",
    "script-src 'self' __INLINE_HASHES__",
    "script-src-attr 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://vimeo.com https://api.stripe.com https://checkout.stripe.com",
    "frame-src 'self' blob: https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://checkout.stripe.com https://js.stripe.com https://hooks.stripe.com",
    "media-src 'self' blob: https://player.vimeo.com",
    "worker-src 'self' blob:",
    "form-action 'self' https://checkout.stripe.com",
    "manifest-src 'self'",
  ].join('; ');

  return {
    name: 'gorythm-production-html',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const hashes = [];
        for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
          const digest = createHash('sha256').update(match[1], 'utf8').digest('base64');
          hashes.push(`'sha256-${digest}'`);
        }
        const policy = csp.replace('__INLINE_HASHES__', hashes.join(' '));
        let out = html.replace(
          /<link rel="stylesheet" crossorigin href="([^"]+)">/g,
          '<link rel="preload" href="$1" as="style" crossorigin><link rel="stylesheet" crossorigin href="$1" media="print" onload="this.media=\'all\'"><noscript><link rel="stylesheet" href="$1"></noscript>'
        );
        if (!out.includes('http-equiv="Content-Security-Policy"')) {
          out = out.replace('</head>', `  <meta http-equiv="Content-Security-Policy" content="${policy}">\n  </head>`);
        }
        return out;
      },
    },
  };
}

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
    plugins: [react(), productionHtmlPlugin()],
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
