jest.mock('@/configurations/typeorm.config', () => ({initDataSource: jest.fn()}));

const {initDataSource} = require('@/configurations/typeorm.config');
import {linkFavorite, originalsOf} from '@/services/favoriteLinks';

const GROUP = -42311167;
const RAW_TITLE = (month: string) => `${month} 2026 - Gedonizm [vk.com/feelin_frisky]`;

/** A repository over an in-memory vk_tracks: `find` reads it, the upsert writes it. */
const fakeDb = (rows: any[]) => {
  const written: any[] = [];
  const builder: any = {
    insert: () => builder,
    into: () => builder,
    values: (value: any) => {
      written.push(value);
      return builder;
    },
    orUpdate: () => builder,
    execute: async () => undefined,
  };
  const matches = (row: any, where: any) =>
    Object.entries(where).every(([key, condition]: [string, any]) => {
      if (condition && condition._type === 'in') return condition._value.includes(row[key]);
      if (condition && condition._type === 'isNull') return row[key] == null;
      return row[key] === condition;
    });
  const repository = {
    find: async ({where}: any) => rows.filter((row) => matches(row, where)),
    createQueryBuilder: () => builder,
  };
  initDataSource.mockResolvedValue({getRepository: () => repository});
  return written;
};

beforeEach(() => jest.clearAllMocks());

describe('originalsOf', () => {
  it('says it cannot answer without a DB', async () => {
    initDataSource.mockResolvedValue(null);
    expect(await originalsOf([{id: 1, owner_id: 111, title: 'x'}])).toBeNull();
  });

  it('reads a stored link', async () => {
    fakeDb([{trackId: '111_900', favoriteOf: `${GROUP}_11`}]);
    const links = await originalsOf([{id: 900, owner_id: 111, title: RAW_TITLE('November')}]);
    expect(links!.get('111_900')).toBe(`${GROUP}_11`);
  });

  it('a group row in the playlist is its own original', async () => {
    fakeDb([]);
    const links = await originalsOf([{id: 11, owner_id: GROUP, title: RAW_TITLE('November')}]);
    expect(links!.get(`${GROUP}_11`)).toBe(`${GROUP}_11`);
  });

  it('links an old copy once, by its exact raw title, and stores it', async () => {
    const written = fakeDb([
      {trackId: `${GROUP}_10`, ownerId: String(GROUP), artist: 'FRISKY | Jackie Mayden', title: RAW_TITLE('October')},
      {trackId: `${GROUP}_11`, ownerId: String(GROUP), artist: 'FRISKY | Jackie Mayden', title: RAW_TITLE('November')},
    ]);
    const links = await originalsOf([
      {id: 900, owner_id: 111, artist: 'FRISKY | Jackie Mayden', title: RAW_TITLE('October')},
    ]);
    // October, not November: the month is part of the words that are compared
    expect(links!.get('111_900')).toBe(`${GROUP}_10`);
    expect(written).toEqual([expect.objectContaining({trackId: '111_900', favoriteOf: `${GROUP}_10`})]);
  });

  it('leaves a copy unlinked when the words name more than one group row', async () => {
    const written = fakeDb([
      {trackId: `${GROUP}_10`, ownerId: String(GROUP), artist: 'A', title: 'Same'},
      {trackId: `${GROUP}_12`, ownerId: String(GROUP), artist: 'A', title: 'Same'},
    ]);
    const links = await originalsOf([{id: 900, owner_id: 111, artist: 'A', title: 'Same'}]);
    expect(links!.has('111_900')).toBe(false);
    expect(written).toEqual([]);
  });
});

describe('linkFavorite', () => {
  it('stores the original on the copy row', async () => {
    const written = fakeDb([]);
    await linkFavorite({owner_id: 111, id: 777}, {owner_id: GROUP, id: 11});
    expect(written).toEqual([{trackId: '111_777', ownerId: '111', audioId: '777', favoriteOf: `${GROUP}_11`}]);
  });
});
