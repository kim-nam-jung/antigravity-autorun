const esbuild = require('esbuild');

Promise.all([
  // VS Code Extension
  esbuild.build({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'out/extension.js',
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    sourcemap: true,
    minify: false,
  }),
  // Injected browser script
  esbuild.build({
    entryPoints: ['src/injected/clickObserver.ts'],
    bundle: true,
    outfile: 'out/injected/clickObserver.js',
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    sourcemap: false,
    minify: true,
  })
]).catch((e) => {
  console.error(e);
  process.exit(1);
});
