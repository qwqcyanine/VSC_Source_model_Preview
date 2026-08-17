// Build script: bundles the extension (cjs, vscode external) and the
// webview viewer (iife, three bundled) with esbuild.
const esbuild = require('esbuild');

const isWatch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const base = {
  bundle: true,
  sourcemap: true,
  logLevel: 'info',
  target: 'es2022',
};

async function run() {
  if (isWatch) {
    const ctx1 = await esbuild.context({
      ...base,
      entryPoints: ['src/extension.ts'],
      outfile: 'out/extension.js',
      format: 'cjs',
      platform: 'node',
      external: ['vscode'],
    });
    const ctx2 = await esbuild.context({
      ...base,
      entryPoints: ['src/webview/viewer.ts'],
      outfile: 'media/viewer.js',
      format: 'iife',
      platform: 'browser',
    });
    await ctx1.watch();
    await ctx2.watch();
    console.log('watching...');
  } else {
    await Promise.all([
      esbuild.build({
        ...base,
        entryPoints: ['src/extension.ts'],
        outfile: 'out/extension.js',
        format: 'cjs',
        platform: 'node',
        external: ['vscode'],
      }),
      esbuild.build({
        ...base,
        entryPoints: ['src/webview/viewer.ts'],
        outfile: 'media/viewer.js',
        format: 'iife',
        platform: 'browser',
      }),
    ]);
    console.log('build complete');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
