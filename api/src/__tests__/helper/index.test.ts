// helpers.test.ts
import {
  deviceIDgen,
  md5,
  normalizePort,
  encodeQueryData,
  cleanupData,
  sortLocalPartTracks,
  cleanupDataAndSortPart
} from '@/helper';
import {Tracklist} from "@/__genedated__/openapi/vk";

describe('helpers', () => {
  test('deviceIDgen should return 16-char string with valid chars', () => {
    const id = deviceIDgen();
    expect(id).toHaveLength(16);
    expect(id).toMatch(/^[a-z0-9]+$/);
  });

  test('md5 should hash correctly', () => {
    expect(md5('test')).toBe('098f6bcd4621d373cade4e832627b4f6');
  });

  test('normalizePort should return numeric port or NaN', () => {
    expect(normalizePort('3000')).toBe(3000);
    expect(normalizePort('-1')).toBeNaN();
    expect(normalizePort('abc')).toBeNaN();
  });

  test('encodeQueryData should serialize object to query string', async () => {
    const result = await encodeQueryData({ a: '1', b: '2' });
    expect(result).toBe('a=1&b=2');
  });

  test('cleanupData should clean artist and title', () => {
    const data: Tracklist = {
      items: [
        { artist: 'FRISKY | Some Artist', title: 'Show 2024 - Hello [vk.com/feelin_frisky]', type: 'other' }
      ]
    } as unknown as Tracklist;
    const result = cleanupData(data);
    expect(result.items[0].artist).toBe('Some Artist');
    expect(result.items[0].title).toBe('Hello');
  });

  test('sortLocalPartTracks should sort (Part N) blocks', () => {
    const data: Tracklist = {
      items: [
        { title: 'Intro', artist: '', type: 'hls' },
        { title: 'Mix (Part 2)', artist: '', type: 'hls' },
        { title: 'Mix (Part 1)', artist: '', type: 'hls' },
        { title: 'Outro', artist: '', type: 'hls' }
      ]
    } as unknown as Tracklist;
    const result = sortLocalPartTracks(data);
    expect(result.items.map(i => i.title)).toEqual([
      'Intro', 'Mix (Part 1)', 'Mix (Part 2)', 'Outro'
    ]);
  });

  test('cleanupData should strip "FRISKY | " from the new-format title', () => {
    const data: Tracklist = {
      items: [
        { artist: 'Melamanos', title: 'FRISKY | Artist of the Week August 2026 - Part 2', type: 'hls' }
      ]
    } as unknown as Tracklist;
    const result = cleanupData(data);
    expect(result.items[0].artist).toBe('Melamanos');
    expect(result.items[0].title).toBe('Artist of the Week Part 2');
  });

  test('sortLocalPartTracks should sort new-format "- Part N" blocks', () => {
    const data: Tracklist = {
      items: [
        { title: 'Artist of the Week - Part 2', artist: 'Melamanos', type: 'hls' },
        { title: 'Artist of the Week - Part 1', artist: 'Melamanos', type: 'hls' }
      ]
    } as unknown as Tracklist;
    const result = sortLocalPartTracks(data);
    expect(result.items.map(i => i.title)).toEqual([
      'Artist of the Week - Part 1', 'Artist of the Week - Part 2'
    ]);
  });

  test('cleanupDataAndSortPart handles the new VK payload shape', () => {
    const data: Tracklist = {
      items: [
        { artist: 'Melamanos', title: 'FRISKY | Artist of the Week August 2026 - Part 3', type: 'hls' },
        { artist: 'Melamanos', title: 'FRISKY | Artist of the Week August 2026 - Part 2', type: 'hls' },
        { artist: 'Christian Monique', title: 'FRISKY | SEVENTEEN August 2026 - Part 2', type: 'hls' },
        { artist: 'Melamanos', title: 'FRISKY | Artist of the Week August 2026 - Part 1', type: 'hls' },
        { artist: 'Christian Monique', title: 'FRISKY | SEVENTEEN August 2026 - Part 1', type: 'hls' }
      ]
    } as unknown as Tracklist;
    const result = cleanupDataAndSortPart(data);
    expect(result.items.map(i => i.title)).toEqual([
      'Artist of the Week Part 1',
      'Artist of the Week Part 2',
      'Artist of the Week Part 3',
      'SEVENTEEN Part 1',
      'SEVENTEEN Part 2'
    ]);
  });

  // Reported: a search for a recurring slot came back
  //   Artist of the Week Part 1 (Selsi)
  //   Artist of the Week Part 1 (Boraa)
  //   Artist of the Week Part 2 (Selsi)
  //   Artist of the Week Part 2 (Boraa)
  // Two shows interleaved, because the group key was the base title alone.
  test('sortLocalPartTracks keeps two artists in the same slot apart', () => {
    const data: Tracklist = {
      items: [
        { title: 'Artist of the Week Part 1', artist: 'Selsi', date: 1756000000, type: 'hls' },
        { title: 'Artist of the Week Part 1', artist: 'Boraa', date: 1755000000, type: 'hls' },
        { title: 'Artist of the Week Part 2', artist: 'Selsi', date: 1756000060, type: 'hls' },
        { title: 'Artist of the Week Part 2', artist: 'Boraa', date: 1755000060, type: 'hls' }
      ]
    } as unknown as Tracklist;
    const result = sortLocalPartTracks(data);
    expect(result.items.map(i => `${i.artist} ${i.title}`)).toEqual([
      'Selsi Artist of the Week Part 1',
      'Selsi Artist of the Week Part 2',
      'Boraa Artist of the Week Part 1',
      'Boraa Artist of the Week Part 2'
    ]);
  });

  // The catalogue-wide search route sorts years of episodes at once, so the
  // same artist hosts the same slot again months later. That is a second show,
  // not two more parts of the first.
  test('sortLocalPartTracks keeps two editions by one artist apart', () => {
    const march = 1741000000;
    const august = 1756000000;
    const data: Tracklist = {
      items: [
        { title: 'Artist of the Week Part 2', artist: 'Selsi', date: august + 60, type: 'hls' },
        { title: 'Artist of the Week Part 1', artist: 'Selsi', date: august, type: 'hls' },
        { title: 'Artist of the Week Part 2', artist: 'Selsi', date: march + 60, type: 'hls' },
        { title: 'Artist of the Week Part 1', artist: 'Selsi', date: march, type: 'hls' }
      ]
    } as unknown as Tracklist;
    const result = sortLocalPartTracks(data);
    expect(result.items.map(i => i.date)).toEqual([august, august + 60, march, march + 60]);
  });

  // Both halves of one episode are uploaded minutes apart; they must still meet.
  test('sortLocalPartTracks groups parts uploaded minutes apart', () => {
    const data: Tracklist = {
      items: [
        { title: 'Hurly Burly Part 2', artist: 'Blue', date: 1756000420, type: 'hls' },
        { title: 'Hurly Burly Part 1', artist: 'Blue', date: 1756000000, type: 'hls' }
      ]
    } as unknown as Tracklist;
    const result = sortLocalPartTracks(data);
    expect(result.items.map(i => i.title)).toEqual(['Hurly Burly Part 1', 'Hurly Burly Part 2']);
  });

  // The window is inclusive, and the bucket index the lookup uses is
  // floor(date / window) -- so a pair straddling a bucket boundary has to be
  // found in the NEIGHBOURING bucket, not just the item's own.
  test('sortLocalPartTracks groups parts exactly one window apart', () => {
    const day = 24 * 60 * 60;
    // 1756000000 / 86400 is not an integer, so first and second sit in
    // different buckets: the neighbour scan is what makes this pass.
    const first = 1756000000;
    const data: Tracklist = {
      items: [
        { title: 'Long Night Part 2', artist: 'Blue', date: first + day, type: 'hls' },
        { title: 'Long Night Part 1', artist: 'Blue', date: first, type: 'hls' }
      ]
    } as unknown as Tracklist;
    const result = sortLocalPartTracks(data);
    expect(result.items.map(i => i.title)).toEqual(['Long Night Part 1', 'Long Night Part 2']);
  });

  test('sortLocalPartTracks splits parts more than one window apart', () => {
    const day = 24 * 60 * 60;
    const first = 1756000000;
    const data: Tracklist = {
      items: [
        { title: 'Long Night Part 2', artist: 'Blue', date: first + day + 1, type: 'hls' },
        { title: 'Long Night Part 1', artist: 'Blue', date: first, type: 'hls' }
      ]
    } as unknown as Tracklist;
    const result = sortLocalPartTracks(data);
    // Two separate editions: each keeps the position of its own first member,
    // so the Part 2 that came in first stays first.
    expect(result.items.map(i => i.date)).toEqual([first + day + 1, first]);
  });

  // The search route sorts the whole catalogue at once, where one artist can
  // hold the same weekly slot for years. Every edition must stay its own group.
  test('sortLocalPartTracks keeps many editions of one slot apart', () => {
    const week = 7 * 24 * 60 * 60;
    const base = 1700000000;
    const items: any[] = [];
    for (let edition = 0; edition < 200; edition++) {
      const aired = base + edition * week;
      items.push({ title: 'Weekly Part 1', artist: 'Blue', date: aired, type: 'hls' });
      items.push({ title: 'Weekly Part 2', artist: 'Blue', date: aired + 60, type: 'hls' });
    }
    const result = sortLocalPartTracks({ items } as unknown as Tracklist);

    expect(result.items).toHaveLength(400);
    // Nothing merged across editions: the dates come back strictly ascending,
    // each edition's Part 1 immediately followed by its own Part 2.
    const dates = result.items.map(i => i.date as number);
    expect(dates).toEqual([...dates].sort((a, b) => a - b));
    expect(new Set(dates).size).toBe(400);
  });

  test('cleanupDataAndSortPart combines both clean and sort', () => {
    const data: Tracklist = {
      items: [
        { artist: 'FRISKY | Blue', title: 'Event 2024 - Mix (Part 2) [vk.com/feelin_frisky]', type: 'other' },
        { artist: 'FRISKY | Blue', title: 'Event 2024 - Mix (Part 1) [vk.com/feelin_frisky]', type: 'other' }
      ]
    } as unknown as Tracklist;
    const result = cleanupDataAndSortPart(data);
    expect(result.items[0].title).toBe('Mix (Part 1)');
    expect(result.items[1].title).toBe('Mix (Part 2)');
  });
});
