import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const isSingleFile = process.env.SINGLE_FILE === '1';

export default defineConfig({
  base: './',
  plugins: isSingleFile ? [viteSingleFile()] : [],
  server: {
    host: '127.0.0.1',
    port: 5188,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4188,
    strictPort: true,
  },
  build: {
    outDir: isSingleFile ? 'dist-single' : 'dist',
    sourcemap: !isSingleFile,
    assetsInlineLimit: isSingleFile ? 100_000_000 : 4096,
    chunkSizeWarningLimit: 1200,
  },
});
