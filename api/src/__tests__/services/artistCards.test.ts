// What the Artists tab is allowed to call an artist.
//
// The rest of the cache suite runs with no database on purpose; this one has to
// mock one, because the whole behaviour under test is the join against the
// mirrored frisky directory — and without that join there is nothing to test.
jest.mock('@/configurations/playback', () => ({db: {enabled: true}}));
jest.mock('@/configurations/frisky', () => ({
  frisky: {enabled: true, artistMixesTtlMs: 1, pageSize: 100, searchTtlMs: 1, showTtlMs: 1},
}));

const find = jest.fn();
jest.mock('@/configurations/typeorm.config', () => ({
  initDataSource: jest.fn(async () => ({getRepository: () => ({find})})),
}));

import {artistCards} from '@/services/friskyCache';

const counted = () =>
  new Map([
    // a real DJ, in the directory
    ['elreyalto', {name: 'El Reyalto', shows: 12}],
    // a SHOW sitting in VK's artist field, and the highest count of the three
    ['artistoftheweek', {name: 'Artist of the Week', shows: 165}],
    // the group itself, same problem
    ['feelinfrisky', {name: 'Feelin FRISKY', shows: 84}],
  ]);

describe('artistCards', () => {
  beforeEach(() => jest.clearAllMocks());

  it('keeps only the keys the frisky directory knows', async () => {
    find.mockResolvedValue([
      {key: 'elreyalto', title: 'El Reyalto', photoThumbUrl: 'https://x/thumb.jpg', genre: ['Techno'], homeCity: 'Lisbon'},
    ]);

    const cards = await artistCards(counted());

    expect(cards.map((card) => card.key)).toEqual(['elreyalto']);
    expect(cards[0].name).toEqual('El Reyalto');
    expect(cards[0].shows).toEqual(12);
    expect(cards[0].photo).toEqual('https://x/thumb.jpg');
    expect(cards[0].genres).toEqual(['Techno']);
    expect(cards[0].homeCity).toEqual('Lisbon');
  });

  it("prefers frisky's spelling of the name over VK's", async () => {
    find.mockResolvedValue([{key: 'elreyalto', title: 'EL REYALTO', genre: null}]);

    const [card] = await artistCards(counted());

    expect(card.name).toEqual('EL REYALTO');
    expect(card.genres).toEqual([]);
  });

  it('falls back to the thumbnail-less photo when there is no thumbnail', async () => {
    find.mockResolvedValue([{key: 'elreyalto', title: 'El Reyalto', photoUrl: 'https://x/full.jpg'}]);

    const [card] = await artistCards(counted());

    expect(card.photo).toEqual('https://x/full.jpg');
  });

  it('serves every key unfiltered while the directory is still empty', async () => {
    // a cold cache knows nobody; an empty tab would be worse than an imperfect one
    find.mockResolvedValue([]);

    const cards = await artistCards(counted());

    expect(cards.map((card) => card.key).sort())
      .toEqual(['artistoftheweek', 'elreyalto', 'feelinfrisky']);
    expect(cards.every((card) => card.photo === null)).toBe(true);
  });

  it('never lets a database failure take the tab down', async () => {
    find.mockRejectedValue(new Error('connection refused'));

    const cards = await artistCards(counted());

    expect(cards.length).toEqual(3);
    expect(cards.every((card) => card.genres.length === 0)).toBe(true);
  });

  it('has nothing to say about an empty catalogue', async () => {
    expect(await artistCards(new Map())).toEqual([]);
  });
});
