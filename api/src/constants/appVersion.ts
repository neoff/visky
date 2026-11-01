/**
 * The version this api IS, which is the version every client should be on.
 *
 * `scripts/sync-version.sh` writes api/package.json's number into every
 * frontend, so one number describes the whole release — see that script for why
 * the api owns it. The clients ask for it through `GET /api/version` and
 * compare it with their own.
 *
 * Baked in at build time (esbuild `define`, see esbuild.config.mjs) because the
 * shipped image contains `dist/index.js` and no package.json to read at
 * runtime. The require is the dev path, where this module runs from source.
 */
const baked = process.env.APP_VERSION

export const appVersion: string =
  baked && baked.length > 0
    ? baked
    : (() => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          return require('../../package.json').version as string
        } catch {
          return '0.0.0'
        }
      })()
