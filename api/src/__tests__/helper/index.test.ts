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
