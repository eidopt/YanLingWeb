import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  // --- Ignored paths ---
  globalIgnores([
    '.next/**',
    '.workbuddy/**',
    'dist',
    'dist-electron',
    'next-env.d.ts',
    'output/**',
    'release',
    'node_modules',
    'backend/**',
  ]),

  // Register the plugin globally so Next's build-time ESLint integration can
  // detect it when it resolves the config file itself.
  {
    plugins: {
      '@next/next': nextPlugin,
    },
  },

  // --- Base TypeScript rules ---
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      ecmaVersion: 2023,
      globals: {
        ...globals.browser,
        ...globals.es2023,
      },
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.electron.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // TypeScript
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],

      // General JS quality
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'object-shorthand': 'error',

      // Style
      semi: ['error', 'always'],
      curly: ['error', 'all'],
      'max-len': [
        'error',
        {
          code: 120,
          ignoreUrls: true,
          ignoreRegExpLiterals: true,
          ignoreTemplateLiterals: false,
          ignoreStrings: false,
          ignoreComments: true,
        },
      ],
    },
  },

  // --- React ---
  {
    files: ['**/*.{tsx,jsx}'],
    plugins: {
      react: reactPlugin,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactPlugin.configs['jsx-runtime'].rules,
      'react/prop-types': 'off',
      'react/display-name': 'warn',
      'react/jsx-curly-brace-presence': ['error', { props: 'never', children: 'never' }],
      'react/self-closing-comp': 'error',
      'react/jsx-boolean-value': ['error', 'never'],
      'react/no-array-index-key': 'warn',
      'react/no-danger': 'error',
    },
  },

  // --- React Hooks ---
  {
    files: ['**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
  },

  // --- Shared import boundary (frontend) ---
  // Defense-in-depth alongside scripts/check-shared-boundaries.cjs. The regex
  // guard only inspects `@shared/agent/...` specifiers; this rule additionally
  // catches deep RELATIVE imports that reach into backend-only/implementation
  // shared segments (e.g. `../../shared/agent/validation/foo`).
  // Frontend (src/**) may import shared ONLY from the public surfaces:
  //   @shared/agent/browser, @shared/agent/contracts/*, @shared/agent/tools/*,
  //   @shared/theme-layout/*, @shared/types/*.
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                // Backend-only / implementation segments via the alias.
                '@shared/agent/runtime',
                '@shared/agent/runtime/**',
                '@shared/agent/compiler',
                '@shared/agent/compiler/**',
                '@shared/agent/context',
                '@shared/agent/context/**',
                '@shared/agent/validation',
                '@shared/agent/validation/**',
                '@shared/agent/prompts',
                '@shared/agent/prompts/**',
                '@shared/agent/skills',
                '@shared/agent/skills/**',
                '@shared/agent/specs',
                '@shared/agent/specs/**',
                '@shared/agent/template',
                '@shared/agent/template/**',
                '@shared/agent/editor',
                '@shared/agent/editor/**',
                '@shared/agent/fixtures',
                '@shared/agent/fixtures/**',
                '@shared/agent/testing',
                '@shared/agent/testing/**',
                '@shared/agent/types',
                '@shared/agent/types/**',
                // Same segments reached via deep RELATIVE paths that bypass the alias.
                '**/shared/agent/runtime',
                '**/shared/agent/runtime/**',
                '**/shared/agent/compiler',
                '**/shared/agent/compiler/**',
                '**/shared/agent/context',
                '**/shared/agent/context/**',
                '**/shared/agent/validation',
                '**/shared/agent/validation/**',
                '**/shared/agent/prompts',
                '**/shared/agent/prompts/**',
                '**/shared/agent/skills',
                '**/shared/agent/skills/**',
                '**/shared/agent/specs',
                '**/shared/agent/specs/**',
                '**/shared/agent/template',
                '**/shared/agent/template/**',
                '**/shared/agent/editor',
                '**/shared/agent/editor/**',
                '**/shared/agent/fixtures',
                '**/shared/agent/fixtures/**',
                '**/shared/agent/testing',
                '**/shared/agent/testing/**',
                '**/shared/agent/types',
                '**/shared/agent/types/**',
              ],
              message:
                'Frontend code may import shared only from @shared/agent/browser, ' +
                '@shared/agent/contracts/*, @shared/agent/tools/*, @shared/theme-layout/*, ' +
                'or @shared/types/*. Backend-only/implementation shared segments are off-limits, ' +
                'including via deep relative paths.',
            },
          ],
        },
      ],
    },
  },

  // --- Next.js ---
  {
    name: 'next/core-web-vitals',
    files: ['src/app/**/*.{ts,tsx}', 'next.config.ts'],
    settings: {
      next: {
        rootDir: import.meta.dirname,
      },
    },
    rules: nextPlugin.flatConfig.coreWebVitals.rules,
  },

  // --- Import sorting ---
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'simple-import-sort/imports': [
        'error',
        {
          groups: [['^\\u0000', '^']],
        },
      ],
      'simple-import-sort/exports': 'error',
    },
  },

  // --- Electron main process ---
  {
    files: ['electron/**/*.{ts,js}', 'vite.electron.config.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
]);
