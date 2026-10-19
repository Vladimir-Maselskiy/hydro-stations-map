import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { testApiPlugin } from './api-middleware.js';

export default defineConfig({
  plugins: [testApiPlugin(), vue()],
  server: {
    host: '127.0.0.1',
  },
});
