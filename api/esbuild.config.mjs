// esbuild.config.mjs
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

// The number the whole release carries (scripts/sync-version.sh). The runtime
// image holds dist/index.js and no package.json, so it has to travel inside
// the bundle — see src/constants/appVersion.ts.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

await build({
    define: {
        'process.env.APP_VERSION': JSON.stringify(version),
    },
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