/**
 * The version of visky the App Store is offering right now.
 *
 * WHY THIS EXISTS. `GET /api/version` used to answer with the api's own build
 * number, and the clients put up "a new version is in the App Store" whenever
 * it was newer than theirs. So deploying the api told every installed client
 * about a release that was nowhere near a store — the api went to 1.6.0 and the
 * App Store still held 1.5.59. A server deploy must never reach the listener.
 *
 * Builds from 1.6.0 on ask Apple themselves (app/src/helpers/network.tsx). The
 * ones already installed ask this route and cannot be changed, so the route now
 * answers what they actually meant to ask: the number in the store. It is a
 * mirror of Apple's public lookup and adds nothing of its own.
 *
 * Android gets no answer. Google Play has no public lookup, and naming a
 * version the Play listing may not carry is the same lie in another store.
 */

/** Which store listing a client's update notice would send it to. */
export type StoreKind = 'ios' | 'mac' | 'none';

const LOOKUP_URL = 'https://itunes.apple.com/lookup';
const BUNDLE_ID = 'com.envarg.visky';

/** Apple's lookup changes once per release; there is no need to ask it on every launch. */
const TTL_MS = 15 * 60_000;
const LOOKUP_TIMEOUT_MS = 5_000;

const cache = new Map<StoreKind, {version: string | null; at: number}>();

export const __resetStoreVersion = (): void => cache.clear();

/**
 * Tell the client apart from its User-Agent — the only thing an installed build
 * sends with this request.
 *
 *   iOS app      `visky/13 CFNetwork/… Darwin/…`  (React Native's fetch)
 *   macOS app    `Mozilla/5.0 (Macintosh; …) AppleWebKit/…`  (the Tauri webview)
 *   Android app  `okhttp/4.…`
 *
 * Anything unrecognised gets no version, which on the client means no notice.
 */
export const storeKindFor = (userAgent: string | undefined): StoreKind => {
    const ua = userAgent ?? '';
    if (/okhttp|android/i.test(ua)) return 'none';
    if (/Macintosh/.test(ua) && /AppleWebKit/.test(ua)) return 'mac';
    if (/CFNetwork|Darwin|iPhone|iPad/.test(ua)) return 'ios';
    return 'none';
};

const lookup = async (kind: Exclude<StoreKind, 'none'>): Promise<string | null> => {
    const query = new URLSearchParams({bundleId: BUNDLE_ID, country: 'us'});
    // the Mac listing is a separate entity of the same app
    if (kind === 'mac') query.set('entity', 'desktopSoftware');
    const response = await fetch(`${LOOKUP_URL}?${query}`, {
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {results?: Array<{version?: unknown}>};
    const version = body?.results?.[0]?.version;
    return typeof version === 'string' && /^\d+(\.\d+)*$/.test(version) ? version : null;
};

/** The store's version for this kind of client, or null when there is nothing true to say. */
export const storeVersion = async (kind: StoreKind): Promise<string | null> => {
    if (kind === 'none') return null;
    const cached = cache.get(kind);
    if (cached && Date.now() - cached.at < TTL_MS) return cached.version;
    try {
        const version = await lookup(kind);
        cache.set(kind, {version, at: Date.now()});
        return version;
    } catch (error) {
        // not cached: Apple being slow for a moment should not silence the
        // notice for a quarter of an hour
        console.warn('==version: the App Store lookup failed', (error as Error)?.message ?? error);
        return null;
    }
};
