/**
 * The Favorites tab's artwork, and where it comes from.
 *
 * "на странице избранного, у нас же это все есть в базе, давай подтягивать
 * картинки и все остальное из базы, т.е. из апи мы берем только ID."
 *
 * `audio.add` COPIES a track into the user's library under a new VK id, so a
 * favourite and the group's original share no `track_id`. `enrich` looked
 * itself up by that id, found only the bare row it had just written for the
 * copy, and handed the tab back VK's answer: a column of placeholder covers and
 * no tracklists. The copy is resolved to the original through the match keys
 * instead — which is what these tests pin.
 */
jest.mock('@/configurations/playback', () => ({db: {enabled: true}}));
jest.mock('@/configurations/frisky', () => ({
  frisky: {enabled: true, baseUrl: '', timeoutMs: 1, concurrency: 1},
}));

const rows: Record<string, any[]> = {};
jest.mock('@/configurations/typeorm.config', () => ({
  initDataSource: async () => ({
    getRepository: (entity: {name: string}) => ({
      find: async () => rows[entity.name] ?? [],
    }),
  }),
}));

import {enrich} from '@/services/friskyCache';

const FRISKY_OWNER = -42311167;
const USER = 777;

/** the group's own upload, matched to a mix by the background worker */
const ORIGINAL = {
  trackId: `${FRISKY_OWNER}_11`,
  ownerId: String(FRISKY_OWNER),
  audioId: '11',
  artistKey: 'elreyalto',
  titleKey: 'coast tech tribal',
  periodYear: 2024,
  periodMonth: 3,
  part: 1,
  artwork: 'https://vk/original.jpg',
  friskyMixId: 7,
  friskyEpisodeId: 70,
  matchState: 'matched',
};

/** the user's copy of it: another id, the same words, nothing matched */
const COPY = {
  ...ORIGINAL,
  trackId: `${USER}_99`,
  ownerId: String(USER),
  audioId: '99',
  artwork: null,
  friskyMixId: null,
  friskyEpisodeId: null,
  matchState: 'pending',
};

const MIX = {
  id: 7,
  episodeId: 70,
  showId: 3,
  artistId: 2,
  title: 'Tech Coast Tribal - March 2024 - El Reyalto',
  trackList: [{title: 'Opening', artist: 'Someone'}],
  genre: ['progressive'],
};
const SHOW = {id: 3, title: 'Tech Coast Tribal', imageUrl: 'https://frisky/show.jpg'};
const ARTIST = {id: 2, title: 'El Reyalto', photoUrl: 'https://frisky/dj.jpg'};

/** the track as the API is about to serve it: the user's copy, cleaned */
const item = () => ({
  id: 99,
  owner_id: USER,
  artist: 'El Reyalto',
  title: 'Tech Coast Tribal (Part 1)',
  url: 'https://example.com',
} as any);

beforeEach(() => {
  rows.VkTrack = [COPY, ORIGINAL];
  rows.FriskyMix = [MIX];
  rows.FriskyShow = [SHOW];
  rows.FriskyArtist = [ARTIST];
});

describe('a favourite, which is a copy of a frisky track', () => {
  it('is served the original\'s cover and tracklist', async () => {
    const [enriched] = await enrich([item()]);

    expect(enriched.artwork).toBe('https://vk/original.jpg');
    expect(enriched.track_list).toEqual([{id: 1, title: 'Opening', artist: 'Someone'}]);
    expect(enriched.frisky?.mix_id).toBe(7);
    expect(enriched.frisky?.show_title).toBe('Tech Coast Tribal');
    // the part is the COPY's own: a copy of Part 1 is still Part 1
    expect(enriched.frisky?.part).toBe(1);
  });

  it('falls back to the show cover when no VK row carries one', async () => {
    rows.VkTrack = [COPY, {...ORIGINAL, artwork: null}];

    const [enriched] = await enrich([item()]);

    expect(enriched.artwork).toBe('https://frisky/show.jpg');
  });

  it('keeps the cover VK sent, when VK sent one', async () => {
    const [enriched] = await enrich([{...item(), artwork: 'https://vk/fresh.jpg'}]);

    expect(enriched.artwork).toBe('https://vk/fresh.jpg');
  });

  it('is left alone when the original is a DIFFERENT show by the same artist', async () => {
    rows.VkTrack = [COPY, {...ORIGINAL, titleKey: 'burly hurly'}];

    const [enriched] = await enrich([item()]);

    expect(enriched.frisky).toBeUndefined();
    expect(enriched.artwork).toBeUndefined();
  });

  it('is left alone when the original aired in another month', async () => {
    rows.VkTrack = [COPY, {...ORIGINAL, periodMonth: 11}];

    const [enriched] = await enrich([item()]);

    expect(enriched.frisky).toBeUndefined();
  });
});
