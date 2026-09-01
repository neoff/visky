/**
 * app.json stays the source of truth; this only adds what has to be decided at
 * BUILD time rather than written down.
 *
 * `experiments.baseUrl` is the one that matters: the web player is served from
 * a sub-path (frisky.envarg.com/player), and Expo bakes that prefix into every
 * asset URL and into expo-router's own path handling. Get it wrong and the page
 * loads a white screen while requesting /_expo/... from the API container.
 *
 * It is env-driven and NOT in app.json on purpose — the desktop build serves the
 * same bundle from the root of a visky:// origin, where a prefix would break it.
 */
module.exports = ({config}) => {
  const baseUrl = process.env.EXPO_WEB_BASE_URL

  if (!baseUrl) return config

  return {
    ...config,
    experiments: {
      ...(config.experiments ?? {}),
      baseUrl,
    },
  }
}
