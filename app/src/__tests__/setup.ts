/**
 * Globals the bundler defines and node does not.
 *
 * `__DEV__` is injected by Metro; `src/constants` reads it while the module is
 * still evaluating, so it has to exist before the first import.
 */
;(globalThis as {__DEV__?: boolean}).__DEV__ = true

/** React needs this before `act` will run outside a test renderer's own harness. */
;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

/**
 * react-test-renderer prints a deprecation notice through `console.error` on
 * every `create`. It is the only renderer that works here — the testing-library
 * wrapper needs a DOM these tests deliberately do not have — and one banner per
 * file buries the output that matters.
 */
const error = console.error
console.error = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('react-test-renderer is deprecated')) return
  error(...args)
}
