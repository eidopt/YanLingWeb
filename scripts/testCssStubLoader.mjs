/**
 * Test-only module loader hook that stubs `.css` and `.module.css` imports
 * with an empty default export. Used by `tsx --test` specs that import
 * React components whose CSS modules are not handled by the Node runtime.
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('.css') || specifier.endsWith('.scss')) {
    return {
      url: new URL(specifier, context.parentURL || `file://${process.cwd()}/`).href,
      shortCircuit: true,
      format: 'module',
    };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.css') || url.endsWith('.scss')) {
    return {
      format: 'module',
      shortCircuit: true,
      source: 'export default new Proxy({}, { get: (_, key) => typeof key === "string" ? key : undefined });',
    };
  }
  return nextLoad(url, context);
}
