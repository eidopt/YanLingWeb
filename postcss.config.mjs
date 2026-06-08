export default {
  plugins: [
    './scripts/postcssCustomMediaFromTheme.cjs',
    'next/dist/compiled/postcss-flexbugs-fixes',
    [
      'next/dist/compiled/postcss-preset-env',
      {
        autoprefixer: {
          flexbox: 'no-2009',
        },
        browsers: ['defaults'],
        features: {
          'custom-properties': false,
        },
        stage: 3,
      },
    ],
  ],
};
