import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const SERVER_PORT = Number(process.env.PORT ?? 3000);

/**
 * The client lives in `src/client`. In development Vite serves it on :5173
 * and proxies `/api` (REST + Server-Sent Events) to the Node server.
 */
export default defineConfig({
  root: 'src/client',
  plugins: [react()],
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': { target: `http://localhost:${SERVER_PORT}`, changeOrigin: true },
    },
  },
  test: {
    root: '.',
    include: ['tests/**/*.test.ts'],
  },
});
