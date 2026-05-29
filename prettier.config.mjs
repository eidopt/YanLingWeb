import backendEslintConfig from './backend/eslint.config.mjs';
import rootEslintConfig from './eslint.config.js';

function readMaxLen(config, fallback) {
  for (const entry of config) {
    const maxLenRule = entry.rules?.['max-len'];
    if (!Array.isArray(maxLenRule)) {
      continue;
    }

    const options = maxLenRule[1];
    if (options && typeof options === 'object' && typeof options.code === 'number') {
      return options.code;
    }
  }

  return fallback;
}

const rootPrintWidth = readMaxLen(rootEslintConfig, 120);
const backendPrintWidth = readMaxLen(backendEslintConfig, 100);

export default {
  printWidth: rootPrintWidth,
  singleQuote: true,
  trailingComma: 'all',
  semi: true,
  overrides: [
    {
      files: ['backend/src/**/*.ts'],
      options: {
        printWidth: backendPrintWidth,
      },
    },
  ],
};
