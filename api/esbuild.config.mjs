// esbuild.config.mjs
import { build } from 'esbuild';

await build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    minify: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    outfile: 'dist/index.js',
    metafile: true,
    mainFields: ['module', 'main'],
    resolveExtensions: ['.js', '.ts', '.json'],
    external: [],
});