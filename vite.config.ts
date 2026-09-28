import { qwikVite } from '@builder.io/qwik/optimizer';
import { defineConfig } from 'vite';

const API_PORT = 4173;
const WEB_PORT = 5173;

export default defineConfig(({ isPreview }) => ({
  plugins: [
    // qwikVite() runs the Qwik optimizer for dev and build. `csr: true` keeps the
    // app client-rendered from index.html so Elysia can serve the static dist/.
    // Preview only serves the built files, so the plugin is skipped there (its
    // preview middleware expects an SSR build).
    ...(isPreview ? [] : [qwikVite({ csr: true })]),
  ],
  server: {
    host: true,
    port: WEB_PORT,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://localhost:${API_PORT}`,
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: true,
    port: WEB_PORT,
    strictPort: true,
  },
}));
