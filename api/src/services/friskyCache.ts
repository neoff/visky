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
//   2. rows nothing is known about are picked up by the background worker, which
//      asks `/v3/search` for the show and matches what comes back — one call per
//      show, not per track;
//   3. the next refresh — or the next tab switch — serves the merged version,
//      and the sockets are told so the app can refresh itself.
//
// Every part of this is optional. With no Postgres, or FRISKY_API_ENABLED=false,
// `remember()` and `enrich()` are no-ops and the playlist is served exactly as
// it was before: VK data, nothing added.
import {DataSource, In, IsNull, LessThan, Not} from "typeorm";
import {initDataSource} from "@/configurations/typeorm.config";
import {frisky as cfg} from "@/configurations/frisky";
import {db} from "@/configurations/playback";
import {FriskyArtist} from "@/db/entities/FriskyArtist";
import {FriskyMix} from "@/db/entities/FriskyMix";
import {FriskyShow} from "@/db/entities/FriskyShow";
import {VkTrack} from "@/db/entities/VkTrack";
import {airDateOf, artistKey, bestMatch, partNumber, periodMs, periodOf, titleKey} from "@/helper/friskyMatch";
import {
  fetchArtist,
  FriskyArtistDto,
  FriskyEpisodeDto,
  FriskyMixDto,
  FriskySearchResult,
  FriskyShowDto,
  fetchArtistMixes,
  fetchShow,
  search,
} from "@/services/friskyApi";
import {TrackItem} from "@/__genedated__/openapi/vk";

export const isFriskyCacheEnabled = (): boolean => db.enabled && cfg.enabled;

/** The Frisky Radio group: the owner every original upload belongs to. */
export const FRISKY_OWNER_ID = -42311167;

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
 * Is this "tracklist" just a divider?
 *
 * frisky sometimes fills the second piece of a broadcast with a single row
 * reading "Part 2" instead of leaving it empty — a label for a human reading the
 * page, and nonsense in a tracklist. Treated as empty so a sibling that carries
 * the real thing wins.
 */
export const isPartMarker = (tracks: Array<{title?: string; artist?: string}> | null | undefined): boolean =>
  !!tracks?.length && tracks.every((track) => /^\s*part\s*\d*\s*$/i.test(track.title ?? ""));

export const usableTrackList = (
  tracks: Array<{title?: string; artist?: string}> | null | undefined,
): Array<{title?: string; artist?: string}> => (!tracks?.length || isPartMarker(tracks) ? [] : tracks);

/**
 * The row a track's METADATA is really about.
 *
 * `audio.add` COPIES a track into the user's library under a new VK id, so a
 * favourite and the group's original share no `track_id` at all. The favourites
 * tab looked itself up by id, found only the bare row it had just written for
 * the copy, and served VK's answer untouched: no cover, no tracklist, no show.
 *
 * The match keys — artist, the words of the title, the month — are the identity
 * the two copies DO share, so the original is found by those and everything
 * below is read off it.
 */
const twinScore = (
  candidate: VkTrack,
  wantedTitle: string,
  wantedPeriod: {year: number | null; month: number | null},
  wantedPart: number | null,
): number => {
  // a different show is never the same broadcast, whatever else agrees
  if (!wantedTitle || candidate.titleKey !== wantedTitle) return 0;

  let score = 1;
  if (wantedPeriod.year !== null && candidate.periodYear !== null && candidate.periodYear !== undefined) {
    if (candidate.periodYear !== wantedPeriod.year) return 0;
    score += 1;
    if (wantedPeriod.month !== null && candidate.periodMonth !== null && candidate.periodMonth !== undefined) {
      if (candidate.periodMonth !== wantedPeriod.month) return 0;
      score += 1;
    }
  }
  // Part 1 and Part 2 are one episode, so a mismatch is not fatal — but the
  // right piece is still the better source
  if (wantedPart !== null && wantedPart !== undefined && candidate.part === wantedPart) score += 1;
  // the group's own row is the original; a copy of a copy knows no more
  if (String(candidate.ownerId) === String(FRISKY_OWNER_ID)) score += 0.5;
  return score;
};

const resolveTwins = async (
  ds: DataSource,
  items: TrackItem[],
  rowByTrack: Map<string, VkTrack>,
): Promise<Map<string, VkTrack>> => {
  const needy = items.filter(
    (item) => !rowByTrack.get(trackIdOf(item.owner_id, item.id))?.friskyMixId,
  );
  if (needy.length === 0) return new Map();

  const keys = new Set<string>();
  for (const item of needy) {
    const key = rowByTrack.get(trackIdOf(item.owner_id, item.id))?.artistKey || artistKey(item.artist);
    if (key) keys.add(key);
  }
  if (keys.size === 0) return new Map();

  // one query for the whole page: every matched row by these artists
  const candidates = await ds.getRepository(VkTrack).find({
    where: {artistKey: In([...keys]), friskyMixId: Not(IsNull())},
  });
  if (candidates.length === 0) return new Map();

  const byArtist = new Map<string, VkTrack[]>();
  for (const candidate of candidates) {
    const bucket = byArtist.get(candidate.artistKey ?? "");
    if (bucket) bucket.push(candidate);
    else byArtist.set(candidate.artistKey ?? "", [candidate]);
  }

  const twins = new Map<string, VkTrack>();
  for (const item of needy) {
    const trackId = trackIdOf(item.owner_id, item.id);
    const own = rowByTrack.get(trackId);
    const bucket = byArtist.get(own?.artistKey || artistKey(item.artist));
    if (!bucket?.length) continue;

    // The row is preferred over the item: it was written from the RAW VK track,
    // and by the time the app sees a title the cleanup has taken the month out
    // of it — which is half of what tells two mixes of a weekly show apart.
    const wantedTitle = own?.titleKey || titleKey(item.title, item.artist);
    const wantedPeriod = own
      ? {year: own.periodYear ?? null, month: own.periodMonth ?? null}
      : periodOf(item.title, item.artist);
    const wantedPart = own?.part ?? partNumber(item.title);

    let best: {row: VkTrack; score: number} | null = null;
    for (const candidate of bucket) {
      const score = twinScore(candidate, wantedTitle, wantedPeriod, wantedPart);
      if (score > 0 && (!best || score > best.score)) best = {row: candidate, score};
    }
    if (best) twins.set(trackId, best.row);
  }
  return twins;
};

/**
 * The cover the cache holds, when the response has none.
 *
 * A library copy arrives from VK without an album thumb far more often than the
 * group's own upload does, and that is exactly the row the Favorites tab is
 * made of — this is why that tab was a column of placeholders.
 */
const withCachedArtwork = (item: TrackItem, own?: VkTrack, meta?: VkTrack): TrackItem => {
  const artwork = item.artwork || own?.artwork || meta?.artwork;
  return artwork ? {...item, artwork} : item;
};

/**
 * Merge everything already known about these tracks into the VK response.
 *
 * Everything is read off the EPISODE, not off one mix. A broadcast is cut into
 * pieces on both sides — VK caps a track at an hour, frisky splits for its own
 * reasons — and the tracklist usually sits on exactly one of those pieces
 * (episode 7486 has fourteen mixes, and one of them carries all 25 tracks). So
 * Part 1 and Part 2 of a VK show resolve to one episode and are served the same
 * tracklist, which is what they are: one show.
 *
 * Additive only: a field VK filled stays as VK filled it (the artwork it serves
 * is the one the app has been showing all along), and a track with nothing
 * cached is returned untouched.
 */
export const enrich = async (items: TrackItem[]): Promise<TrackItem[]> => {
  if (!isFriskyCacheEnabled() || items.length === 0) return items;

  const ds = await initDataSource();
  if (!ds) return items;

  try {
    const ids = items.map((item) => trackIdOf(item.owner_id, item.id));
    const rows = await ds.getRepository(VkTrack).find({where: {trackId: In(ids)}});
    const rowByTrack = new Map(rows.map((row) => [row.trackId, row]));
    // the group's original for every row that carries no match of its own
    const twinByTrack = await resolveTwins(ds, items, rowByTrack);

    /** this track's own row, and the row its metadata comes from */
    const sourceOf = (item: TrackItem): {own?: VkTrack; meta?: VkTrack} => {
      const trackId = trackIdOf(item.owner_id, item.id);
      const own = rowByTrack.get(trackId);
      return {own, meta: own?.friskyMixId ? own : twinByTrack.get(trackId) ?? own};
    };

    const metaRows = items.map((item) => sourceOf(item).meta);
    const mixIds = [...new Set(metaRows.map((row) => row?.friskyMixId).filter((id): id is number => !!id))];
    const episodeIds = [...new Set(metaRows.map((row) => row?.friskyEpisodeId).filter((id): id is number => !!id))];
    // nothing is matched yet, but the cache may still hold the cover
    if (mixIds.length === 0) {
      return items.map((item) => {
        const {own, meta} = sourceOf(item);
        return withCachedArtwork(item, own, meta);
      });
    }

    // the matched mixes AND every sibling piece of their episodes
    const repository = ds.getRepository(FriskyMix);
    const mixes = await repository.find({
      where: episodeIds.length ? [{id: In(mixIds)}, {episodeId: In(episodeIds)}] : {id: In(mixIds)},
    });
    const mixById = new Map(mixes.map((mix) => [mix.id, mix]));
    const byEpisode = new Map<number, FriskyMix[]>();
    for (const mix of mixes) {
      if (!mix.episodeId) continue;
      const bucket = byEpisode.get(mix.episodeId);
      if (bucket) bucket.push(mix);
      else byEpisode.set(mix.episodeId, [mix]);
    }

    const artistIds = [...new Set(mixes.map((mix) => mix.artistId).filter((id): id is number => !!id))];
    const artists = artistIds.length
      ? await ds.getRepository(FriskyArtist).find({where: {id: In(artistIds)}})
      : [];
    const artistById = new Map(artists.map((artist) => [artist.id, artist]));

    // where the artwork actually lives — a mix has no image of its own
    const showIds = [...new Set(mixes.map((mix) => mix.showId).filter((id): id is number => !!id))];
    const shows = showIds.length
      ? await ds.getRepository(FriskyShow).find({where: {id: In(showIds)}})
      : [];
    const showById = new Map(shows.map((show) => [show.id, show]));

    return items.map((item) => {
      const {own, meta} = sourceOf(item);
      const mix = meta?.friskyMixId ? mixById.get(meta.friskyMixId) : undefined;
      if (!mix) return withCachedArtwork(item, own, meta);

      const episodeId = meta?.friskyEpisodeId ?? mix.episodeId ?? null;
      // the matched piece first, so its own data wins a tie with a sibling's
      const pieces = [mix, ...(episodeId ? byEpisode.get(episodeId) ?? [] : []).filter((s) => s.id !== mix.id)];
      const artist = mix.artistId ? artistById.get(mix.artistId) : undefined;

      // the longest real tracklist anywhere in the episode
      const tracks = pieces
        .map((piece) => usableTrackList(piece.trackList))
        .reduce((best, current) => (current.length > best.length ? current : best), [] as Array<{title?: string; artist?: string}>);
      const genres = pieces.find((piece) => piece.genre?.length)?.genre ?? artist?.genre;
      const show = mix.showId ? showById.get(mix.showId) : undefined;
      // An episode carries the show's cover; a mix carries no image at all. The
      // artist's PHOTO is deliberately NOT in this chain — falling through to it
      // put a picture of the DJ where the programme's cover belongs, which is
      // what the list was showing for every mix paged in by artist. The photo is
      // still served, as `frisky.artist_photo`, for a UI that wants the person.
      const artwork =
        pieces.find((piece) => piece.artwork)?.artwork || show?.imageUrl || show?.albumArtUrl || show?.thumbUrl;
      // this track's own part, then the original's — a copy of Part 2 is Part 2
      const part = own?.part ?? meta?.part ?? null;

      return {
        ...item,
        // VK's own cover wins: it is what the list has been rendering. Then the
        // cache, which is where a library copy finds the group's cover.
        artwork: item.artwork || own?.artwork || meta?.artwork || artwork || undefined,
        genre_list: genreList(genres),
        track_list: trackList(tracks),
        multipart: part !== null,
        frisky: {
          mix_id: mix.id,
          episode_id: episodeId,
          url: mix.url ?? null,
          show_id: mix.showId ?? null,
          show_title: show?.title ?? mix.showTitle ?? null,
          show_artwork: show?.imageUrl ?? null,
          air_start: mix.airStart ? new Date(mix.airStart).toISOString() : null,
          artist_id: mix.artistId ?? null,
          artist_url: artist?.url ?? null,
          artist_photo: artist?.photoUrl ?? null,
          biography: artist?.biography ?? null,
          reach: mix.reach === null || mix.reach === undefined ? null : Number(mix.reach),
          part,
        },
      } as TrackItem;
    });
  } catch (error) {
    console.error("==frisky: could not read the metadata cache:", (error as Error)?.message ?? error);
    return items;
  }
};

/**
 * The identity of a show, as both copies of it spell it.
 *
 * Artist plus the words of the title, with the month, the part number and the
 * group's advert taken out — the same keys `remember()` writes down, so a row
 * in the cache and a raw VK track can be compared without either being cleaned.
 */
export const showKey = (item: {artist?: string | null; title?: string | null}): string =>
  `${artistKey(item.artist)}|${titleKey(item.title, item.artist)}`;

/**
 * Every show the Frisky Radio group has uploaded, as show keys.
 *
 * Which of the user's own audio came from the group cannot be read off the
 * track: `audio.add` keeps the group's words and gives the copy the USER's
 * owner id, so the owner says nothing. The cache holds the group's own rows —
 * so the question becomes "does a group row describe this show", which is what
 * this set answers.
 *
 * Empty when there is no database, and the caller must treat that as "I cannot
 * tell", never as "nothing is frisky".
 */
const FRISKY_KEYS_TTL_MS = 5 * 60_000;
let friskyKeys: {at: number; keys: Set<string>} | null = null;

export const friskyShowKeys = async (): Promise<Set<string>> => {
  if (!isFriskyCacheEnabled()) return new Set();
  if (friskyKeys && Date.now() - friskyKeys.at < FRISKY_KEYS_TTL_MS) return friskyKeys.keys;

  const ds = await initDataSource();
  if (!ds) return new Set();

  try {
    const rows = await ds.getRepository(VkTrack).find({
      where: {ownerId: String(FRISKY_OWNER_ID)},
      select: {trackId: true, artistKey: true, titleKey: true},
    });
    const keys = new Set(rows.map((row) => `${row.artistKey ?? ""}|${row.titleKey ?? ""}`));
    friskyKeys = {at: Date.now(), keys};
    return keys;
  } catch (error) {
    console.error("==frisky: could not read the group's keys:", (error as Error)?.message ?? error);
    return new Set();
  }
};

/** test seam — the key set is module state, like every other cache here */
export const __resetFriskyShowKeys = (): void => {
  friskyKeys = null;
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
 * "Hurly Burly - May 2026 - Fady Ferraye" — show first, artist last.
 *
 * The artist has to come out of the title before the title key is built: frisky
 * writes it in, VK keeps it in its own field, and a name left on one side only
 * would make every show by that artist look alike. When the search answered with
 * the artist record the name comes from there; this is the fallback, and it
 * holds across every mix title seen.
 */
const splitMixTitle = (title: string | null | undefined): {show: string | null; artist: string | null} => {
  const parts = String(title ?? "").split(" - ").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return {show: parts[0] ?? null, artist: null};
  return {show: parts[0], artist: parts[parts.length - 1]};
};

/** What one search answer knows about the mixes in it, indexed for the ingest. */
interface IngestContext {
  artistById: Map<number, FriskyArtistDto>;
  episodeById: Map<number, FriskyEpisodeDto>;
}

const mixRow = (dto: FriskyMixDto, context: IngestContext): Partial<FriskyMix> => {
  const fromTitle = splitMixTitle(dto.title);
  const artistId = dto.artist_id?.id ?? null;
  const artistTitle = (artistId ? context.artistById.get(artistId)?.title : null) ?? fromTitle.artist;

  const episodeId = dto.episode_id?.id ?? null;
  const episode = episodeId ? context.episodeById.get(episodeId) : undefined;

  // the episode states the air date; the slug only approximates it and the title
  // gives the month at best
  const airStartMs = episode?.air_start ? Date.parse(episode.air_start) : NaN;
  const slug = airDateOf(dto.url);
  const airMs = Number.isFinite(airStartMs) ? airStartMs : periodMs(slug);
  const period = Number.isFinite(airStartMs)
    ? {
        year: new Date(airStartMs).getUTCFullYear(),
        month: new Date(airStartMs).getUTCMonth() + 1,
        day: new Date(airStartMs).getUTCDate(),
      }
    : slug.year !== null
      ? slug
      : periodOf(dto.title);

  return {
    id: dto.id,
    title: dto.title ?? null,
    url: dto.url ?? null,
    artistId,
    artistKey: artistKey(artistTitle),
    artistTitle: artistTitle ?? null,
    titleKey: titleKey(dto.title, artistTitle),
    periodYear: period.year,
    periodMonth: period.month,
    periodDay: period.day,
    airDate: airMs === null || Number.isNaN(airMs) ? null : new Date(airMs),
    airStart: Number.isFinite(airStartMs) ? new Date(airStartMs) : null,
    showId: dto.show_id?.id ?? null,
    showTitle: fromTitle.show,
    episodeId,
    episodeTitle: episode?.title ?? null,
    genre: dto.genre?.length ? dto.genre : episode?.genre ?? null,
    trackList: dto.track_list ?? null,
    artwork: dto.image?.url ?? episode?.image?.url ?? episode?.thumbnail?.url ?? null,
    reach: dto.reach === undefined ? null : String(dto.reach),
    favoriteCount: dto.favorite_count ?? null,
    fetchedAt: new Date(),
  };
};

/**
 * Write one search answer down: the artists it named, and every mix in it with
 * its episode's air date folded in.
 *
 * Returns the mixes as match candidates, so the caller does not have to read
 * back what it just wrote.
 */
const ingest = async (result: FriskySearchResult): Promise<FriskyMix[]> => {
  const ds = await initDataSource();
  if (!ds) return [];

  const context: IngestContext = {
    artistById: new Map(result.Artists.filter((dto) => dto?.id !== undefined).map((dto) => [dto.id, dto])),
    episodeById: new Map(result.Episodes.filter((dto) => dto?.id !== undefined).map((dto) => [dto.id, dto])),
  };

  const artists = result.Artists.filter((dto) => dto?.id !== undefined).map(artistRow);
  if (artists.length) await ds.getRepository(FriskyArtist).upsert(artists as FriskyArtist[], ["id"]);

  // free artwork: the search already matched the shows
  const shows = result.Shows.filter((dto) => dto?.id !== undefined).map(showRow);
  if (shows.length) await ds.getRepository(FriskyShow).upsert(shows as FriskyShow[], ["id"]);

  const mixes = result.Mixes.filter((dto) => dto?.id !== undefined).map((dto) => mixRow(dto, context));
  if (mixes.length) await ds.getRepository(FriskyMix).upsert(mixes as FriskyMix[], ["id"]);

  return mixes as FriskyMix[];
};

/**
 * Page an artist's WHOLE run of mixes.
 *
 * `/search` answers with at most `searchLimit` hits per model, and a weekly show
 * that has run for a decade has hundreds — the month a VK track needs is very
 * often not in that answer. Search finds the artist; this makes the pool
 * complete. `/mixes` carries no episode records, so the air dates here come from
 * the slug; the search pass fills in `air_start` for the ones it saw.
 *
 * Guarded by `mixes_synced_at`: once a day per artist, however many of their
 * shows are waiting.
 */
const syncArtistMixes = async (artistId: number, force = false): Promise<number> => {
  const ds = await initDataSource();
  if (!ds) return 0;

  const artists = ds.getRepository(FriskyArtist);
  const artist = await artists.findOne({where: {id: artistId}});
  const syncedAt = artist?.mixesSyncedAt ? new Date(artist.mixesSyncedAt).getTime() : 0;
  if (!force && syncedAt && Date.now() - syncedAt < cfg.artistMixesTtlMs) return 0;

  const context: IngestContext = {
    artistById: new Map(artist?.title ? [[artistId, {id: artistId, title: artist.title}]] : []),
    episodeById: new Map(),
  };

  const repository = ds.getRepository(FriskyMix);
  let written = 0;
  for (let offset = 0; ; offset += cfg.pageSize) {
    const page = await fetchArtistMixes(artistId, offset);
    if (page.length === 0) break;
    const rows = page.filter((dto) => dto?.id !== undefined).map((dto) => mixRow(dto, context));
    if (rows.length) {
      // NOT a plain upsert: `/mixes` carries no episode records, so every row
      // built here has a null `air_start` and `episode_title`. Overwriting with
      // those would wipe the authoritative air date that the `/search` pass just
      // wrote — which is exactly what happened, and left every mix dateless.
      await repository
        .createQueryBuilder()
        .insert()
        .into(FriskyMix)
        .values(rows)
        .orUpdate(
          [
            "title", "url", "artist_id", "artist_key", "artist_title", "title_key",
            "period_year", "period_month", "period_day", "air_date",
            "show_id", "show_title", "episode_id", "genre", "track_list",
            "artwork", "reach", "favorite_count", "fetched_at",
          ],
          ["id"],
        )
        .execute();
      written += rows.length;
    }
    if (page.length < cfg.pageSize) break;
  }

  if (artist) await artists.update({id: artistId}, {mixesSyncedAt: new Date()});
  if (written) console.log(`==frisky: ${written} mixes cached for ${artist?.title ?? artistId}`);
  return written;
};

const showRow = (dto: FriskyShowDto): Partial<FriskyShow> => ({
  id: dto.id,
  title: dto.title ?? null,
  url: dto.url ?? null,
  summary: dto.summary ?? null,
  channel: dto.channel ?? null,
  genre: dto.genre ?? null,
  artistId: dto.artist_id?.id ?? null,
  imageUrl: dto.image?.url ?? null,
  thumbUrl: dto.thumbnail?.url ?? dto.image?.thumb_url ?? null,
  albumArtUrl: dto.album_art?.url ?? null,
  fetchedAt: new Date(),
});

/**
 * Make sure the show behind these mixes is cached — it is where the artwork is.
 *
 * A search answers with the shows it matched, but mixes paged in through
 * `/mixes?artists_id=` bring only a show REFERENCE, and those are the ones that
 * had nothing to draw with.
 */
const ensureShows = async (showIds: Array<number | null | undefined>): Promise<number> => {
  const ds = await initDataSource();
  if (!ds) return 0;
  const wanted = [...new Set(showIds.filter((id): id is number => !!id))];
  if (wanted.length === 0) return 0;

  const repository = ds.getRepository(FriskyShow);
  const known = new Set((await repository.find({where: {id: In(wanted)}})).map((show) => show.id));
  let written = 0;
  for (const id of wanted) {
    if (known.has(id)) continue;
    const dto = await fetchShow(id);
    if (dto) {
      await repository.upsert(showRow(dto) as FriskyShow, ["id"]);
      written++;
    }
  }
  // what was actually written, not what was asked for: the two backfill queries
  // can name the same show, and frisky can answer with nothing
  return written;
};

/** Fill in an artist frisky named but did not describe (no bio, no photo). */
const ensureArtistDetail = async (artistId: number | null | undefined): Promise<void> => {
  if (!artistId) return;
  const ds = await initDataSource();
  if (!ds) return;
  const existing = await ds.getRepository(FriskyArtist).findOne({where: {id: artistId}});
  if (existing?.biography || existing?.photoUrl) return;
  const dto = await fetchArtist(artistId);
  if (dto) await ds.getRepository(FriskyArtist).upsert(artistRow(dto) as FriskyArtist, ["id"]);
};

/**
 * A group of VK rows that are the same show by the same artist — Part 1 and
 * Part 2, and every month of it that is still unresolved.
 */
interface ShowGroup {
  artistKey: string;
  titleKey: string;
  artist: string | null;
  rows: VkTrack[];
}

/**
 * What to ask `/search` for.
 *
 * The artist and the show words together: the artist alone answers with their
 * whole run of shows, the show title alone can be shared by several artists over
 * the years ("Hurly Burly" has been hosted by five), and frisky matches the query
 * against every model at once.
 */
const searchQuery = (group: ShowGroup): string =>
  [group.artist ?? "", group.titleKey].join(" ").replace(/\s+/g, " ").trim();

/**
 * Resolve one show's worth of pending tracks.
 *
 * One search per show, not per track: Part 1, Part 2 and every unresolved month
 * of the same programme are answered by the same call.
 */
const resolveShow = async (group: ShowGroup): Promise<string[]> => {
  const ds = await initDataSource();
  if (!ds) return [];

  const repository = ds.getRepository(VkTrack);
  const query = searchQuery(group);
  if (!query) return [];

  const result = await search(query);
  const found = await ingest(result);

  // Which frisky artist this is. The search answers with the artist record and
  // with mixes that name one; either will do, as long as the name is the name VK
  // used — a search for "hurly burly" also returns the four OTHER artists who
  // have hosted that show over the years.
  const artistId =
    found.find((mix) => mix.artistKey === group.artistKey)?.artistId ??
    result.Artists.find((dto) => artistKey(dto.title) === group.artistKey)?.id ??
    null;

  if (artistId) {
    await ensureArtistDetail(artistId);
    // search alone is not enough coverage for a long-running show
    await syncArtistMixes(artistId);
  }

  // everything cached for this artist, which now includes their whole run
  const cached = group.artistKey
    ? await ds.getRepository(FriskyMix).find({where: {artistKey: group.artistKey}})
    : [];
  const pool = new Map<number, FriskyMix>();
  for (const mix of [...found, ...cached]) pool.set(mix.id, mix);

  const candidates = [...pool.values()]
    // a mix by a different artist that merely shares a word is not this show
    .filter((mix) => !group.artistKey || !mix.artistKey || mix.artistKey === group.artistKey)
    .map((mix) => ({
      id: mix.id,
      titleKey: mix.titleKey ?? "",
      year: mix.periodYear ?? null,
      month: mix.periodMonth ?? null,
      airMs: mix.airDate ? new Date(mix.airDate).getTime() : null,
    }));

  const matched: string[] = [];
  const matchedShowIds: Array<number | null | undefined> = [];
  for (const row of group.rows) {
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

    if (!match) {
      await repository.update({trackId: row.trackId}, {matchState: "unmatched", matchedAt: new Date()});
      continue;
    }

    const mix = pool.get(match.id);
    await repository.update(
      {trackId: row.trackId},
      {
        friskyMixId: match.id,
        friskyEpisodeId: mix?.episodeId ?? null,
        matchScore: match.score,
        matchState: "matched",
        matchedAt: new Date(),
      },
    );
    matched.push(row.trackId);
    matchedShowIds.push(mix?.showId);
  }

  // the artwork lives on the show; a mix only references it
  await ensureShows(matchedShowIds);

  return matched;
};

// ---------------------------------------------------------------------------
// the artist directory
// ---------------------------------------------------------------------------

/** What the Artists tab shows for one DJ. */
export interface ArtistCard {
  /** `artistKey` of their name — how the app asks for their shows */
  key: string;
  /** their own spelling, from frisky when it is known and from VK otherwise */
  name: string;
  /** how many of the group's uploads are theirs */
  shows: number;
  photo: string | null;
  genres: string[];
  homeCity: string | null;
  biography: string | null;
}

/**
 * The artists among a set of VK artist keys.
 *
 * The keys come from the VK catalogue — that is the only side that knows which
 * artists the group actually carries — and the directory mirrored in
 * `frisky_artists` is what turns each one into a face, a home city and a list of
 * genres. `key` is the join column on both sides (helper/friskyMatch.artistKey).
 *
 * A KEY THE DIRECTORY DOES NOT HAVE IS DROPPED, and that is the point of this
 * function rather than an accident of the join. Fifteen years of uploads are not
 * tagged consistently: on a large minority of the group's rows the `artist`
 * field holds the SHOW ("Artist of the Week", "Tech Coast Tribal") or the group
 * itself ("Feelin FRISKY"), not the person who played. Those keys are also the
 * highest-counting ones — a weekly show has far more episodes than any one DJ
 * has sets — so counting the raw field and ordering by it puts the mis-tagged
 * rows at the top of the screen and the residents below them. frisky.fm's own
 * directory is the only thing that knows which of the two a string is.
 *
 * With no database, or with the cache switched off, nothing can be told apart,
 * so every key comes back as a bare card with the VK spelling of the name. A
 * list of names with no photos beats an empty tab; a list of show titles
 * presented as people does not.
 */
export const artistCards = async (
  counted: Map<string, {name: string; shows: number}>,
): Promise<ArtistCard[]> => {
  const bare = (): ArtistCard[] =>
    [...counted.entries()].map(([key, {name, shows}]) => ({
      key,
      name,
      shows,
      photo: null,
      genres: [],
      homeCity: null,
      biography: null,
    }));

  if (!isFriskyCacheEnabled() || counted.size === 0) return bare();

  try {
    const ds = await initDataSource();
    if (!ds) return bare();
    const known = await ds.getRepository(FriskyArtist).find({where: {key: In([...counted.keys()])}});
    const byKey = new Map(known.map((row) => [row.key, row]));

    // Nothing mirrored yet — the worker fills the directory as it matches
    // shows, and on a cold cache it has nothing to say about anyone. Serving
    // every key unfiltered is better than serving none at all.
    if (byKey.size === 0) {
      console.info(`artist directory: empty, serving ${counted.size} keys unfiltered`);
      return bare();
    }
    if (byKey.size < counted.size) {
      // the gap is the mis-tagged rows, and it is expected to be large
      console.info(`artist directory: ${byKey.size} of ${counted.size} keys are known artists`);
    }

    const cards: ArtistCard[] = [];
    for (const [key, {name, shows}] of counted) {
      const row = byKey.get(key);
      if (!row) continue;
      cards.push({
        key,
        name: row.title?.trim() || name,
        shows,
        // the thumbnail is what a list row wants; the full photo is the fallback
        photo: row.photoThumbUrl ?? row.photoUrl ?? null,
        genres: row.genre ?? [],
        homeCity: row.homeCity ?? null,
        biography: row.biography ?? null,
      });
    }
    return cards;
  } catch (error) {
    // the directory is an enrichment, never the reason a tab fails to open
    console.error("artist directory lookup failed:", error);
    return bare();
  }
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

    // Shows referenced by cached mixes but not cached themselves. The artwork the
    // list draws lives on the show, and a mix paged in through `/mixes?artists_id=`
    // brings only a reference — so without this the rows matched before shows were
    // a table would render with no cover at all.
    // Two cheap queries instead of one expensive one.
    //
    // The first is driven by `vk_tracks` — a hundred rows — and joins to the mix
    // by primary key, so it costs an index lookup per track. The second is a
    // plain GROUP BY with a PK-lookup NOT EXISTS. The version this replaces
    // ordered 5030 mix rows by a correlated subquery over `vk_tracks` with an OR
    // in it, which no index can serve; it ran every 60s from every replica, and
    // during a rollout — when two of them overlap — both pods missed a 3s health
    // probe on a handler that only calls fs.statSync.
    const visibleShows = await ds.query<Array<{show_id: number}>>(`
      SELECT DISTINCT m.show_id
      FROM vk_tracks t
      JOIN frisky_mixes m ON m.id = t.frisky_mix_id
      WHERE m.show_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM frisky_shows s WHERE s.id = m.show_id)
      LIMIT $1
    `, [cfg.batchSize]);

    const showBudget = cfg.batchSize - visibleShows.length;
    const archiveShows = showBudget > 0
      ? await ds.query<Array<{show_id: number}>>(`
          SELECT m.show_id
          FROM frisky_mixes m
          WHERE m.show_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM frisky_shows s WHERE s.id = m.show_id)
          GROUP BY m.show_id
          ORDER BY m.show_id DESC
          LIMIT $1
        `, [showBudget])
      : [];

    // what is on a screen first, the archive with whatever budget is left
    const orphanShows = [...visibleShows, ...archiveShows];

    if (orphanShows.length) {
      const written = await ensureShows(orphanShows.map((row) => row.show_id));
      if (written) console.log(`==frisky: ${written} shows backfilled`);
    }

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
    // not `return []` before the backfill above: a cache with everything matched
    // and no shows is exactly the state that needs it
    if (pending.length === 0) return [];

    // grouped by SHOW, not by track and not by artist: Part 1, Part 2 and every
    // unresolved month of the same programme are answered by one search
    const groups = new Map<string, ShowGroup>();
    for (const row of pending) {
      const key = `${row.artistKey ?? ""}|${row.titleKey ?? ""}`;
      if (key === "|") continue;
      const bucket = groups.get(key);
      if (bucket) bucket.rows.push(row);
      else {
        groups.set(key, {
          artistKey: row.artistKey ?? "",
          titleKey: row.titleKey ?? "",
          // the artist as VK spells it, which is what the search is asked for
          artist: (row.artist ?? "").replace(/^\s*FRISKY\s*\|\s*/i, "").trim() || null,
          rows: [row],
        });
      }
    }

    const matched: string[] = [];
    for (const group of groups.values()) {
      matched.push(...(await resolveShow(group)));
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
  // let the API serve requests before the first pass starts talking to frisky
  setTimeout(() => void runOnce(), cfg.workerStartDelayMs).unref?.();
  timer = setInterval(() => void runOnce(), cfg.workerIntervalMs);
  timer.unref?.();
  console.log(`==frisky: metadata worker every ${Math.round(cfg.workerIntervalMs / 1000)}s`);
};

export const stopFriskyWorker = (): void => {
  if (timer) clearInterval(timer);
  timer = null;
};
