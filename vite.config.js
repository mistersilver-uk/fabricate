import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: resolve(__dirname, 'src/main.js'),
      formats: ['es'],
      fileName: 'main'
    },
    rollupOptions: {
      external: [],
      output: {
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  }
});
