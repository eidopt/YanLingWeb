export function generateIndexHtml(title: string): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

export function generateMainTsx(): string {
  return `import React from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`;
}

export function generatePackageJson(projectName: string): string {
  return `${JSON.stringify(
    {
      name: projectName,
      private: true,
      version: '0.0.0',
      type: 'module',
      scripts: {
        dev: 'vite',
        build: 'vite build',
        preview: 'vite preview',
      },
      dependencies: {
        vite: 'latest',
        typescript: 'latest',
        react: 'latest',
        'react-dom': 'latest',
      },
      devDependencies: {
        '@types/react': 'latest',
        '@types/react-dom': 'latest',
      },
    },
    null,
    2,
  )}
`;
}

export function generateTsConfig(): string {
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        useDefineForClassFields: true,
        lib: ['DOM', 'DOM.Iterable', 'ES2022'],
        allowJs: false,
        skipLibCheck: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true,
        forceConsistentCasingInFileNames: true,
        module: 'ESNext',
        moduleResolution: 'Bundler',
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: 'react-jsx',
      },
      include: ['src'],
      references: [],
    },
    null,
    2,
  )}
`;
}

export function generateViteConfig(): string {
  return `import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
`;
}
