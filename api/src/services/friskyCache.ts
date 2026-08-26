// src/services/friskyCache.ts
//
// The metadata cache: what VK cannot tell us about a mix, and where it comes
// from.
//
// VK carries audio and a name. frisky.fm carries the tracklist, the genres, the
// show and the artist. Neither knows the other's ids, so the two are joined on
// artist + month + title words (helper/friskyMatch.ts) and the result is kept
// in Postgres:
//
//   1. a playlist request writes its rows to `vk_tracks` (NEVER the audio urls —
//      those are signed per token/device and are always re-read from VK) and
//      merges whatever frisky data is already cached into the response;
//   2. rows nothing is known about are picked up by the background worker,
//      which pages the artist's mixes off frisky and matches them;
//   3. the next refresh — or the next tab switch — serves the merged version,
//      and the sockets are told so the app can refresh itself.
//
// Every part of this is optional. With no Postgres, or FRISKY_API_ENABLED=false,
// `remember()` and `enrich()` are no-ops and the playlist is served exactly as
// it was before: VK data, nothing added.
import {In, IsNull, LessThan, Not} from "typeorm";
import {initDataSource} from "@/configurations/typeorm.config";
import {frisky as cfg} from "@/configurations/frisky";
import {db} from "@/configurations/playback";
import {FriskyArtist} from "@/db/entities/FriskyArtist";
import {FriskyMix} from "@/db/entities/FriskyMix";
import {VkTrack} from "@/db/entities/VkTrack";
import {airDateOf, artistKey, bestMatch, partNumber, periodMs, periodOf, titleKey} from "@/helper/friskyMatch";
import {fetchArtist, fetchArtistMixes, fetchArtistPage, FriskyArtistDto, FriskyMixDto} from "@/services/friskyApi";
import {TrackItem} from "@/__genedated__/openapi/vk";

export const isFriskyCacheEnabled = (): boolean => db.enabled && cfg.enabled;

/** A VK audio row as it arrives, BEFORE `cleanupData` rewrites artist and title. */
export interface RawVkItem {
  id?: number;
  owner_id?: number;
  artist?: string;
  title?: string;
  duration?: number;
  date?: number;
  album?: {thumb?: {photo_300?: string}} | null;
}

const trackIdOf = (ownerId: number | string, audioId: number | string): string => `${ownerId}_${audioId}`;

// ---------------------------------------------------------------------------
// writing the playlist down
// ---------------------------------------------------------------------------

/**
 * Remember a page of the playlist.
 *
 * Called with the RAW VK items: `cleanupData` strips the "August 2026" out of
 * the title, and that month is half of what identifies the mix on the frisky
 * side. The rows are copied synchronously here because cleanup mutates the very
 * objects that were passed in — by the time the write runs, they are cleaned.
 *
 * Never awaited by a request: a slow or missing database must not delay a
 * playlist.
 */
export const remember = (items: RawVkItem[] | undefined | null): void => {
  if (!isFriskyCacheEnabled() || !items?.length) return;

  const rows = items
    .filter((item) => item?.id !== undefined && item?.owner_id !== undefined)
    .map((item) => {
      const period = periodOf(item.title, item.artist);
      return {
        trackId: trackIdOf(item.owner_id!, item.id!),
        ownerId: String(item.owner_id),
        audioId: String(item.id),
        artist: item.artist ?? null,
        title: item.title ?? null,
        duration: item.duration ?? null,
        date: item.date === undefined ? null : String(item.date),
        artwork: item.album?.thumb?.photo_300 ?? null,
        artistKey: artistKey(item.artist),
        titleKey: titleKey(item.title, item.artist),
        periodYear: period.year,
        periodMonth: period.month,
        periodDay: period.day,
        part: partNumber(item.title),
        lastSeen: new Date(),
      };
    });

  void persist(rows);
};

/**
 * Upsert without touching the match columns.
 *
 * A row that is already matched must keep its mix: the same track comes back on
 * every refresh, and re-inserting it wholesale would reset `frisky_mix_id` and
 * send the worker round the loop forever.
 */
const persist = async (rows: Array<Partial<VkTrack>>): Promise<void> => {
  const ds = await initDataSource();
  if (!ds || rows.length === 0) return;
  try {
    await ds
      .getRepository(VkTrack)
      .createQueryBuilder()
      .insert()
      .into(VkTrack)
      .values(rows)
      .orUpdate(
        [
          "artist", "title", "duration", "date", "artwork",
          "artist_key", "title_key", "period_year", "period_month", "period_day", "part", "last_seen",
        ],
        ["track_id"],
      )
      .execute();
  } catch (error) {
    console.error("==frisky: could not write the playlist cache:", (error as Error)?.message ?? error);
  }
};

// ---------------------------------------------------------------------------
// reading it back into a response
// ---------------------------------------------------------------------------

const genreList = (genres: string[] | null | undefined) =>
  (genres ?? []).map((name, index) => ({id: index + 1, name}));

const trackList = (tracks: Array<{title?: string; artist?: string}> | null | undefined) =>
  (tracks ?? []).map((track, index) => ({
    id: index + 1,
    title: track.title ?? "",
    artist: track.artist ?? "",
  }));

/**
 * Merge everything already known about these tracks into the VK response.
 *
 * Additive only: a field VK filled stays as VK filled it (the artwork it serves
 * is the one the app has been showing all along), and a track with nothing
 * cached is returned untouched. What was hardcoded in `formatPlaylist`
 * — one "Unknown Genre", one placeholder tracklist row — is replaced by the
 * real thing when there is one, and by an empty list when there is not.
 */
export const enrich = async (items: TrackItem[]): Promise<TrackItem[]> => {
  if (!isFriskyCacheEnabled() || items.length === 0) return items;

  const ds = await initDataSource();
  if (!ds) return items;

  try {
    const ids = items.map((item) => trackIdOf(item.owner_id, item.id));
    const rows = await ds.getRepository(VkTrack).find({where: {trackId: In(ids)}});
    const mixIds = [...new Set(rows.map((row) => row.friskyMixId).filter((id): id is number => !!id))];
    if (mixIds.length === 0) return items;

    const mixes = await ds.getRepository(FriskyMix).find({where: {id: In(mixIds)}});
    const mixById = new Map(mixes.map((mix) => [mix.id, mix]));

    const artistIds = [...new Set(mixes.map((mix) => mix.artistId).filter((id): id is number => !!id))];
    const artists = artistIds.length
      ? await ds.getRepository(FriskyArtist).find({where: {id: In(artistIds)}})
      : [];
    const artistById = new Map(artists.map((artist) => [artist.id, artist]));

    const rowByTrack = new Map(rows.map((row) => [row.trackId, row]));

    return items.map((item) => {
      const row = rowByTrack.get(trackIdOf(item.owner_id, item.id));
      const mix = row?.friskyMixId ? mixById.get(row.friskyMixId) : undefined;
      if (!mix) return item;
      const artist = mix.artistId ? artistById.get(mix.artistId) : undefined;

      return {
        ...item,
        // VK's own cover wins: it is what the list has been rendering
        artwork: item.artwork || mix.artwork || artist?.photoUrl || undefined,
        genre_list: genreList(mix.genre?.length ? mix.genre : artist?.genre),
        track_list: trackList(mix.trackList),
        multipart: row?.part !== null && row?.part !== undefined,
        frisky: {
          mix_id: mix.id,
          url: mix.url ?? null,
          show_id: mix.showId ?? null,
          show_title: mix.showTitle ?? null,
          artist_id: mix.artistId ?? null,
          artist_url: artist?.url ?? null,
          artist_photo: artist?.photoUrl ?? null,
          biography: artist?.biography ?? null,
          reach: mix.reach === null || mix.reach === undefined ? null : Number(mix.reach),
          part: row?.part ?? null,
        },
      } as TrackItem;
    });
  } catch (error) {
    console.error("==frisky: could not read the metadata cache:", (error as Error)?.message ?? error);
    return items;
  }
};

// ---------------------------------------------------------------------------
// filling it, in the background
// ---------------------------------------------------------------------------

const photoOf = (dto: FriskyArtistDto): {url: string | null; thumb: string | null} => ({
  url: dto.photo?.url ?? dto.hero?.url ?? null,
  thumb: dto.photo?.thumb_url ?? null,
});

const artistRow = (dto: FriskyArtistDto): Partial<FriskyArtist> => {
  const photo = photoOf(dto);
  return {
    id: dto.id,
    title: dto.title ?? null,
    key: artistKey(dto.title),
    url: dto.url ?? null,
    genre: dto.genre ?? null,
    biography: dto.biography ?? null,
    homeCity: dto.home_city ?? null,
    photoUrl: photo.url,
    photoThumbUrl: photo.thumb,
    links: {
      facebook: dto.facebook_url ?? null,
      twitter: dto.twitter_url ?? null,
      website: dto.website_url ?? null,
      instagram: dto.instagram_username ?? null,
    },
    reach: dto.reach === undefined ? null : String(dto.reach),
    fetchedAt: new Date(),
  };
};

/**
 * `artist` is the record the mixes were pulled for, and it is what the title key
 * is built against: frisky writes the artist INTO the title
 * ("Tech Coast Tribal - 06 May 2016 - El Reyalto") while VK keeps it in its own
 * field, so the name has to come out of both sides or every mix by one artist
 * would look alike.
 */
const mixRow = (dto: FriskyMixDto, artist: FriskyArtist): Partial<FriskyMix> => {
  // the slug carries the exact day, the title only the month — the slug wins
  const air = airDateOf(dto.url);
  const period = air.year !== null ? air : periodOf(dto.title);
  const airMs = periodMs(air);
  return {
    id: dto.id,
    title: dto.title ?? null,
    url: dto.url ?? null,
    artistId: dto.artist_id?.id ?? artist.id,
    artistKey: artist.key,
    artistTitle: artist.title ?? null,
    titleKey: titleKey(dto.title, artist.title),
    periodYear: period.year,
    periodMonth: period.month,
    periodDay: period.day,
    airDate: airMs === null ? null : new Date(airMs),
    showId: dto.show_id?.id ?? null,
    // "Tech Coast Tribal - August 2026 - El Reyalto": frisky puts the show name
    // first and gives the mix only a reference to the show record, so reading
    // the prefix is a whole HTTP call cheaper than resolving /v3/shows/{id}
    showTitle: String(dto.title ?? "").split(" - ")[0].trim() || null,
    episodeId: dto.episode_id?.id ?? null,
    genre: dto.genre ?? null,
    trackList: dto.track_list ?? null,
    artwork: dto.image?.url ?? null,
    reach: dto.reach === undefined ? null : String(dto.reach),
    favoriteCount: dto.favorite_count ?? null,
    fetchedAt: new Date(),
  };
};

/**
 * Page the whole artist directory into Postgres.
 *
 * frisky has no artist search, so "which frisky artist is this VK track by" can
 * only be answered from a local copy of the list. It is a few thousand rows and
 * changes by a handful a month, hence the week-long TTL.
 */
export const syncArtistDirectory = async (force = false): Promise<number> => {
  const ds = await initDataSource();
  if (!ds) return 0;

  const repository = ds.getRepository(FriskyArtist);
  if (!force) {
    const newest = await repository
      .createQueryBuilder("artist")
      .select("MAX(artist.fetched_at)", "at")
      .getRawOne<{at: Date | null}>();
    const at = newest?.at ? new Date(newest.at).getTime() : 0;
    if (at && Date.now() - at < cfg.artistIndexTtlMs) return 0;
  }

  let written = 0;
  for (let offset = 0; ; offset += cfg.pageSize) {
    const page = await fetchArtistPage(offset);
    if (page.length === 0) break;
    const rows = page.filter((dto) => dto?.id !== undefined).map(artistRow);
    if (rows.length) {
      await repository.upsert(rows as FriskyArtist[], ["id"]);
      written += rows.length;
    }
    if (page.length < cfg.pageSize) break;
  }
  if (written) console.log(`==frisky: artist directory synced (${written} artists)`);
  return written;
};

/**
 * Page one artist's mixes in.
 *
 * `artist_key` is stamped from the artist row rather than parsed out of the mix
 * title: frisky writes the artist at the END of the title, sometimes with a
 * different spelling than the artist record, and the artist id is unambiguous.
 */
export const syncArtistMixes = async (artist: FriskyArtist, force = false): Promise<number> => {
  const ds = await initDataSource();
  if (!ds) return 0;

  const syncedAt = artist.mixesSyncedAt ? new Date(artist.mixesSyncedAt).getTime() : 0;
  if (!force && syncedAt && Date.now() - syncedAt < cfg.artistMixesTtlMs) return 0;

  const repository = ds.getRepository(FriskyMix);
  let written = 0;
  for (let offset = 0; ; offset += cfg.pageSize) {
    const page = await fetchArtistMixes(artist.id, offset);
    if (page.length === 0) break;
    const rows = page.filter((dto) => dto?.id !== undefined).map((dto) => mixRow(dto, artist));
    if (rows.length) {
      await repository.upsert(rows as FriskyMix[], ["id"]);
      written += rows.length;
    }
    if (page.length < cfg.pageSize) break;
  }

  await ds.getRepository(FriskyArtist).update({id: artist.id}, {mixesSyncedAt: new Date()});
  if (written) console.log(`==frisky: ${written} mixes cached for ${artist.title ?? artist.id}`);
  return written;
};

/** Refresh one artist record (bio, photo, genres) when it is only a directory stub. */
const ensureArtistDetail = async (artist: FriskyArtist): Promise<FriskyArtist> => {
  if (artist.biography || artist.photoUrl) return artist;
  const ds = await initDataSource();
  const dto = await fetchArtist(artist.id);
  if (!ds || !dto) return artist;
  const row = artistRow(dto);
  await ds.getRepository(FriskyArtist).upsert(row as FriskyArtist, ["id"]);
  return {...artist, ...row} as FriskyArtist;
};

/**
 * Resolve one artist's worth of pending tracks.
 *
 * Everything is keyed by artist because that is the only way to ask frisky for
 * a narrow set of mixes — `?artists_id=` is the one filter that works. One
 * artist therefore costs one page of mixes, however many of their shows are
 * waiting.
 */
const resolveArtist = async (key: string, rows: VkTrack[]): Promise<string[]> => {
  const ds = await initDataSource();
  if (!ds) return [];

  const repository = ds.getRepository(VkTrack);
  const artist = await ds.getRepository(FriskyArtist).findOne({where: {key}});

  if (!artist) {
    // frisky has never heard of them: a VK upload by a guest, or a spelling the
    // directory does not use. Marked so the worker moves on, retried later.
    await repository.update({trackId: In(rows.map((row) => row.trackId))}, {matchState: "unmatched", matchedAt: new Date()});
    return [];
  }

  const detailed = await ensureArtistDetail(artist);
  await syncArtistMixes(detailed);

  const mixes = await ds.getRepository(FriskyMix).find({where: {artistKey: key}});
  const candidates = mixes.map((mix) => ({
    id: mix.id,
    titleKey: mix.titleKey ?? "",
    year: mix.periodYear ?? null,
    month: mix.periodMonth ?? null,
    airMs: mix.airDate ? new Date(mix.airDate).getTime() : null,
  }));

  const matchedIds: string[] = [];
  for (const row of rows) {
    const match = bestMatch(
      {
        titleKey: row.titleKey ?? "",
        year: row.periodYear ?? null,
        month: row.periodMonth ?? null,
        // VK's upload time is the only day-level fact this side has, and it is
        // what separates the four weekly episodes of one month
        refMs: row.date ? Number(row.date) * 1000 : null,
      },
      candidates,
    );
    if (match) {
      await repository.update(
        {trackId: row.trackId},
        {friskyMixId: match.id, matchScore: match.score, matchState: "matched", matchedAt: new Date()},
      );
      matchedIds.push(row.trackId);
    } else {
      await repository.update({trackId: row.trackId}, {matchState: "unmatched", matchedAt: new Date()});
    }
  }
  return matchedIds;
};

type EnrichedHandler = (trackIds: string[]) => void;
let onEnrichedHandler: EnrichedHandler = () => undefined;

/** Told after every batch that gained metadata, so the sockets can say so. */
export const onEnriched = (handler: EnrichedHandler): void => {
  onEnrichedHandler = handler;
};

let running = false;

/**
 * One pass: take the tracks nothing is known about and try to resolve them.
 *
 * Returns the track ids that gained metadata. Only ever one pass at a time —
 * a refresh, the timer and the boot-time kick can all ask for one at once, and
 * frisky.fm should see one caller, not three.
 */
export const runOnce = async (): Promise<string[]> => {
  if (!isFriskyCacheEnabled() || running) return [];
  running = true;
  try {
    const ds = await initDataSource();
    if (!ds) return [];

    await syncArtistDirectory();

    const retryBefore = new Date(Date.now() - cfg.retryAfterMs);
    const repository = ds.getRepository(VkTrack);
    const pending = await repository.find({
      where: [
        {matchState: "pending", artistKey: Not(IsNull())},
        {matchState: "unmatched", matchedAt: LessThan(retryBefore)},
      ],
      order: {lastSeen: "DESC"},
      take: cfg.batchSize,
    });
    if (pending.length === 0) return [];

    const byArtist = new Map<string, VkTrack[]>();
    for (const row of pending) {
      const key = row.artistKey ?? "";
      if (!key) continue;
      const bucket = byArtist.get(key);
      if (bucket) bucket.push(row);
      else byArtist.set(key, [row]);
    }

    const matched: string[] = [];
    for (const [key, rows] of byArtist) {
      matched.push(...(await resolveArtist(key, rows)));
    }

    if (matched.length) {
      console.log(`==frisky: ${matched.length} tracks enriched`);
      try {
        onEnrichedHandler(matched);
      } catch (error) {
        console.error("==frisky: enrich handler failed:", (error as Error)?.message ?? error);
      }
    }
    return matched;
  } catch (error) {
    console.error("==frisky: worker pass failed:", (error as Error)?.message ?? error);
    return [];
  } finally {
    running = false;
  }
};

let timer: NodeJS.Timeout | null = null;

/** Nudge the worker without waiting for it — what a playlist request does. */
export const kick = (): void => {
  if (!isFriskyCacheEnabled() || running) return;
  void runOnce();
};

export const startFriskyWorker = (): void => {
  if (!isFriskyCacheEnabled() || timer) {
    if (!isFriskyCacheEnabled()) {
      console.warn("==frisky: metadata cache is off (needs DB_HOST and FRISKY_API_ENABLED)");
    }
    return;
  }
  // the first pass may page the whole artist directory in — let the API serve
  // requests before that starts
  setTimeout(() => void runOnce(), cfg.workerStartDelayMs).unref?.();
  timer = setInterval(() => void runOnce(), cfg.workerIntervalMs);
  timer.unref?.();
  console.log(`==frisky: metadata worker every ${Math.round(cfg.workerIntervalMs / 1000)}s`);
};

export const stopFriskyWorker = (): void => {
  if (timer) clearInterval(timer);
  timer = null;
};
