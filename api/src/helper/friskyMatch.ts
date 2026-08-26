// src/helper/friskyMatch.ts
//
// How a VK audio row is recognised as a frisky.fm mix.
//
// The two sides describe the same broadcast in different words:
//
//   frisky.fm  "Tech Coast Tribal - 06 May 2016 - El Reyalto"
//   VK (old)   artist "FRISKY | El Reyalto"  title "May 2016 - Tech Coast Tribal (Part 1) [vk.com/feelin_frisky]"
//   VK (new)   artist "El Reyalto"           title "FRISKY | Tech Coast Tribal May 2016 - Part 1"
//
// There is no shared id anywhere — VK ids belong to VK, frisky ids to frisky —
// so the join is on what the two do share: the ARTIST, the MONTH the show
// aired, and the words of the show title. The day is deliberately ignored: VK
// carries one upload per show, frisky dates it exactly, and no artist has two
// different shows in the same month often enough for the day to be needed.
//
// Part numbers are stripped before matching. "Part 1" and "Part 2" of a show
// are two VK rows and ONE frisky mix, and both must resolve to it.

/** Words that carry no signal and would only inflate the similarity score. */
const STOPWORDS = new Set(["frisky", "radio", "the", "a", "an", "and", "with", "feat", "ft", "vk", "com", "mix", "show", "at", "on", "of", "part", "pt", "episode", "ep"]);

const MONTHS: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

const friskyPrefixRegex = /\s*FRISKY\s*\|\s*/gi;
const vkSuffixRegex = /\[vk\.com\/[^\]]*]/gi;
/** "(Part 2)", "- Part 2", "Part 2" — all three spellings VK uses */
const partRegex = /(?:[-–—]\s*)?\(?\s*\bpart\s+(\d+)\s*\)?/i;

/** lowercase, accent-free, punctuation-free — "El Reyalto" and "el reyalto!" agree */
export const normalize = (value: string | null | undefined): string =>
  (value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** The identity of an artist across the two APIs: their name with nothing else in it. */
export const artistKey = (artist: string | null | undefined): string =>
  normalize(String(artist ?? "").replace(friskyPrefixRegex, " ")).replace(/\s+/g, "");

/** Which part of a multipart show this row is, or null when it is not one. */
export const partNumber = (title: string | null | undefined): number | null => {
  const match = String(title ?? "").match(partRegex);
  return match ? Number(match[1]) : null;
};

export type Period = { year: number | null; month: number | null; day: number | null };

/**
 * `el-reyalto-at-08-14-2026`, and `fady-ferraye-at-05-26-20261` for the second
 * mix of the same day.
 *
 * The trailing digits are a COLLISION COUNTER, not a part number and not part of
 * the year: frisky reuses a slug and appends 1, 2, ... 16. They were read as a
 * broken date at first, which is why every mix of a long-running show lost its
 * date and the month tie-break had nothing to work with.
 */
const urlDateRegex = /-at-(\d{2})-(\d{2})-((?:19|20)\d{2})\d*$/;

/**
 * The day a mix aired, from its `url` slug.
 *
 * This is the fallback. An episode's `air_start` is the authoritative date and is
 * used when the search result carried the episode; the slug is what is left when
 * it did not. Returns null for anything that carries no date at all.
 */
export const airDateOf = (url: string | null | undefined): Period => {
  const match = String(url ?? "").match(urlDateRegex);
  if (!match) return {year: null, month: null, day: null};
  return {year: Number(match[3]), month: Number(match[1]), day: Number(match[2])};
};

/** A period as milliseconds (UTC noon, so a timezone can never shift the day). */
export const periodMs = (period: Period): number | null =>
  period.year === null ? null : Date.UTC(period.year, (period.month ?? 1) - 1, period.day ?? 15, 12);

/**
 * The month a show aired, read out of a title in any of the spellings the two
 * APIs use ("06 May 2016", "May 2016", "2016-05-06").
 */
export const periodOf = (...parts: Array<string | null | undefined>): Period => {
  const text = normalize(parts.filter(Boolean).join(" "));
  const iso = text.match(/\b(\d{4})\s(\d{1,2})\s(\d{1,2})\b/);
  if (iso) return {year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3])};

  const words = text.split(" ");
  let month: number | null = null;
  let year: number | null = null;
  let day: number | null = null;
  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    if (month === null && MONTHS[word] !== undefined) {
      month = MONTHS[word];
      // "06 May 2016": the day sits immediately before the month name
      const before = Number(words[index - 1]);
      if (Number.isInteger(before) && before >= 1 && before <= 31) day = before;
    }
    // 1970..2099 — a bare "2016" is a year, "1234" in a test title is not
    if (/^(19[7-9]\d|20\d\d)$/.test(word)) year = Number(word);
  }
  return {year, month, day};
};

/**
 * The words of a title that actually identify the show.
 *
 * The artist is removed because frisky repeats it in the title while VK keeps
 * it in its own field, and a name shared by both sides would make every mix of
 * that artist look alike. Dates, part numbers and stopwords go for the same
 * reason: they are either matched separately or carry nothing.
 */
export const titleTokens = (title: string | null | undefined, artist?: string | null): Set<string> => {
  const withoutArtist = normalize(
    String(title ?? "")
      .replace(friskyPrefixRegex, " ")
      .replace(vkSuffixRegex, " ")
      .replace(partRegex, " "),
  );
  const artistWords = new Set(normalize(String(artist ?? "").replace(friskyPrefixRegex, " ")).split(" ").filter(Boolean));

  const tokens = new Set<string>();
  for (const word of withoutArtist.split(" ")) {
    if (!word) continue;
    if (STOPWORDS.has(word)) continue;
    if (artistWords.has(word)) continue;
    if (MONTHS[word] !== undefined) continue;
    if (/^\d{1,4}$/.test(word)) continue; // day or year — periodOf() owns those
    tokens.add(word);
  }
  return tokens;
};

/** A stable, storable form of the token set: sorted and space joined. */
export const titleKey = (title: string | null | undefined, artist?: string | null): string =>
  [...titleTokens(title, artist)].sort().join(" ");

const jaccard = (left: Set<string>, right: Set<string>): number => {
  if (left.size === 0 && right.size === 0) return 1;
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  return shared / (left.size + right.size - shared);
};

export type MatchCandidate = {
  id: number;
  titleKey: string;
  year: number | null;
  month: number | null;
  /** exact air date in ms, when the mix slug carried one */
  airMs?: number | null;
};

export type MatchQuery = {
  titleKey: string;
  year: number | null;
  month: number | null;
  /** VK's upload time in ms — the only day-level fact the VK side has */
  refMs?: number | null;
};

/** Below this the two titles are simply different shows. */
export const MATCH_THRESHOLD = 0.34;

/**
 * The month is evidence, never proof.
 *
 * An artist can air two different shows in one month, and one of them being the
 * only one frisky lists does not make it the one VK uploaded. So the titles
 * must overlap at least this much before the month is allowed to vouch for
 * anything — without it, "Deep Blue Sessions August 2026" matched
 * "Tech Coast Tribal - August 2026" on the month alone.
 */
export const MIN_TITLE_SIMILARITY = 0.2;

/**
 * The best mix for a VK track among the candidates of the SAME artist, or null.
 *
 * A same-month candidate wins over a better-worded one from another month: the
 * month is the hard fact, the wording is not. When the month is unknown on one
 * of the sides the title has to carry the match on its own, which is why the
 * threshold applies to every case.
 */
export const bestMatch = (query: MatchQuery, candidates: MatchCandidate[]): { id: number; score: number } | null => {
  const wanted = new Set(query.titleKey.split(" ").filter(Boolean));
  let best: { id: number; score: number; distance: number } | null = null;

  for (const candidate of candidates) {
    const samePeriod =
      query.year !== null && candidate.year !== null && query.year === candidate.year &&
      (query.month === null || candidate.month === null || query.month === candidate.month);
    const differentPeriod =
      query.year !== null && candidate.year !== null &&
      (query.year !== candidate.year ||
        (query.month !== null && candidate.month !== null && query.month !== candidate.month));

    // a mix from another month is not this show, however alike the titles read
    if (differentPeriod) continue;

    const similarity = jaccard(wanted, new Set(candidate.titleKey.split(" ").filter(Boolean)));
    // titles that share nothing are different shows, month or no month
    if (similarity < MIN_TITLE_SIMILARITY) continue;
    // past that, the month is evidence in its own right: a same-month candidate
    // is allowed to win on a weaker title than a same-artist one from elsewhere
    const score = samePeriod ? similarity * 0.5 + 0.5 : similarity;
    if (score < MATCH_THRESHOLD) continue;

    // A weekly show has four indistinguishable mixes a month — same artist, same
    // title, same month — and VK names none of them. The upload time is the only
    // thing left to tell them apart, so the nearest air date wins the tie.
    const distance =
      query.refMs && candidate.airMs ? Math.abs(query.refMs - candidate.airMs) : Number.POSITIVE_INFINITY;

    if (!best || score > best.score || (score === best.score && distance < best.distance)) {
      best = {id: candidate.id, score, distance};
    }
  }

  return best ? {id: best.id, score: best.score} : null;
};
