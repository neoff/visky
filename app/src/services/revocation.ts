/**
 * "This installation has been signed out from another device."
 *
 * A module-level callback rather than a store or a context, because of who has
 * to be able to raise it. The two places that learn about a revocation are the
 * axios layer (a 401 carrying `device_revoked`) and the playback socket (a
 * `revoked` frame) — neither is a React component, both are singletons created
 * before any provider mounts, and both may fire while the app is in the
 * background with no tree rendered at all.
 *
 * `SessionProvider` registers the one handler there is, and it clears the
 * session. Nothing else should register: a second registration replaces the
 * first, which is deliberate — a session can only be dropped once, and the
 * provider that owns it is the only thing that can do it.
 */

type Handler = () => void

let handler: Handler | null = null

/** Raised at most once per session; see `reset`. */
let raised = false

export const onSessionRevoked = (next: Handler | null): void => {
  handler = next
}

/**
 * Called by the provider when a session is established, so the NEXT sign-in on
 * this launch can be revoked too. Without it the guard below would swallow the
 * second revocation of the same process.
 */
export const resetRevocation = (): void => {
  raised = false
}

/**
 * Tell the app its credentials are no longer welcome.
 *
 * Idempotent on purpose: a revoked device usually finds out several times at
 * once — the socket is cut, and the three or four requests already in flight
 * all come back 401 — and signing out four times would fight the navigation
 * that the first one started.
 */
export const sessionRevoked = (from: string): void => {
  if (raised) return
  raised = true
  console.warn(`==session: this device was signed out from another device (${from})`)
  handler?.()
}

/** Does this response body mean the account has signed this device out? */
export const isRevokedResponse = (status: number | undefined, body: unknown): boolean =>
  status === 401 && (body as {errCode?: string} | undefined)?.errCode === 'device_revoked'
