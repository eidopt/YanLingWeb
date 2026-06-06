const fs = require('node:fs');
const path = require('node:path');

const THEME_LIBRARY_PATH = path.resolve(process.cwd(), 'src/styles/theme-library.css');

function readViewportDefinitions() {
  const css = fs.readFileSync(THEME_LIBRARY_PATH, 'utf8');
  const definitions = new Map();
  const customMediaPattern = /@custom-media\s+(--app-viewport-[a-z-]+)\s+([^;]+);/g;

  for (const match of css.matchAll(customMediaPattern)) {
    definitions.set(match[1], match[2].trim());
  }

  return definitions;
}

module.exports = () => ({
  postcssPlugin: 'custom-media-from-theme-library',
  Once(root) {
    const definitions = readViewportDefinitions();

    root.walkAtRules((rule) => {
      if (rule.name === 'custom-media') {
        rule.remove();
        return;
      }

      if (rule.name !== 'media') {
        return;
      }

      rule.params = rule.params.replace(/\(--app-viewport-[a-z-]+\)/g, (token) => {
        const name = token.slice(1, -1);
        return definitions.get(name) ?? token;
      });
    });
  },
});

module.exports.postcss = true;
