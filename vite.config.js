import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      // leapjs 依赖 Node.js events 模块，需要浏览器 polyfill
      events: 'events',
    },
  },
});
