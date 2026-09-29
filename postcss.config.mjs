// No PostCSS plugins. Keep this file: without it Next.js falls back to its
// default pipeline (postcss-flexbugs-fixes + postcss-preset-env), which
// rewrites rules such as `flex: 1 1 0` and adds vendor prefixes. With it,
// app/globals.css ships as written (only minified).
const config = {
  plugins: {},
};

export default config;
