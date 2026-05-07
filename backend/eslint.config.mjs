import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const localRules = {
  rules: {
    'typescript-semicolon': {
      meta: {
        type: 'layout',
        docs: {
          description: 'Require semicolons after TypeScript type declarations and members',
        },
        fixable: 'code',
        schema: [],
        messages: {
          missingSemicolon: 'Missing semicolon.',
        },
      },
      create(context) {
        const sourceCode = context.sourceCode;

        function requireSemicolon(node) {
          const lastToken = sourceCode.getLastToken(node);

          if (!lastToken || lastToken.value === ';') {
            return;
          }

          context.report({
            node,
            messageId: 'missingSemicolon',
            fix(fixer) {
              if (lastToken.value === ',') {
                return fixer.replaceText(lastToken, ';');
              }

              return fixer.insertTextAfter(lastToken, ';');
            },
          });
        }

        return {
          TSCallSignatureDeclaration: requireSemicolon,
          TSConstructSignatureDeclaration: requireSemicolon,
          TSIndexSignature: requireSemicolon,
          TSMethodSignature: requireSemicolon,
          TSPropertySignature: requireSemicolon,
          TSTypeAliasDeclaration: requireSemicolon,
        };
      },
    },
  },
};

export default defineConfig([
  globalIgnores(['dist', 'node_modules']),

  // --- Base TypeScript rules (Node / NestJS) ---
  {
    files: ['src/**/*.ts'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: {
        ...globals.node,
        ...globals.es2023,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      local: localRules,
    },
    rules: {
      // TypeScript
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // NestJS uses emitDecoratorMetadata — 'import type' breaks DI reflection
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-import-type-side-effects': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],

      // General JS quality
      'no-console': 'off', // NestJS bootstrap and Logger use console intentionally
      'no-debugger': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'object-shorthand': 'error',

      // Style
      semi: ['error', 'always', { omitLastInOneLineBlock: false }],
      'local/typescript-semicolon': 'error',
      curly: ['error', 'all'],
      'max-len': [
        'error',
        {
          code: 100,
          ignoreUrls: true,
          ignoreRegExpLiterals: true,
          ignoreTemplateLiterals: false,
          ignoreStrings: false,
          ignoreComments: true,
        },
      ],
    },
  },

  // --- Import sorting ---
  {
    files: ['src/**/*.ts'],
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
    },
  },
]);
