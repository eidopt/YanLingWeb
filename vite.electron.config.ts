import { builtinModules } from 'module';
import path from 'path';
import { defineConfig } from 'vite';

// Builds the Electron main process and preload scripts.
// Output format is CJS (.cjs) to avoid conflict with "type": "module" in package.json.
export default defineConfig({
  build: {
    outDir: 'dist-electron',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'electron/main.ts'),
        preload: path.resolve(__dirname, 'electron/preload.ts'),
      },
      output: {
        format: 'cjs',
        entryFileNames: '[name].cjs',
      },
      // Electron and all Node.js built-ins must stay external —
      // they are provided at runtime by the Electron/Node environment.
      external: [
        'electron',
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
      ],
    },
  },
});
