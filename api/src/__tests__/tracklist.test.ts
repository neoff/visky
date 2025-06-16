import {TrackItem, Tracklist} from "@/types/response/vk";

describe('Tracklist structure', () => {
  test('should store array of TrackItem', () => {
    const track: TrackItem = {
      id: 1,
      owner_id: 123,
      type: TrackItem.type.HLS,
      url: 'https://example.com/track.m3u8',
      title: 'My Track',
      artist: 'Artist Name',
      date: 12345678,
      duration: 300
    };

    const tracklist: Tracklist = {
      count: 1,
      offset: 0,
      total: 1,
      items: [track]
    };

    expect(tracklist.items[0].title).toBe('My Track');
    expect(tracklist.count).toBe(1);
  });
});