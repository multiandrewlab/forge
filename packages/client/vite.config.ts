import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

const apiProxy = {
  '/api': {
    target: 'http://localhost:3001',
    changeOrigin: true,
  },
  '/ws': {
    target: 'ws://localhost:3001',
    ws: true,
  },
};

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  // Sandbox workers use dynamic imports (`import('quickjs-emscripten')`,
  // `import('esbuild-wasm')`) which require code-splitting. Vite's default
  // worker.format is 'iife' and doesn't support code-splitting.
  worker: {
    format: 'es',
  },
  server: {
    port: 3000,
    proxy: apiProxy,
  },
  preview: {
    port: 4173,
    proxy: apiProxy,
  },
});
