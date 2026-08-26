import {
  airDateOf,
  artistKey,
  bestMatch,
  MATCH_THRESHOLD,
  normalize,
  partNumber,
  periodMs,
  periodOf,
  titleKey,
} from '@/helper/friskyMatch';

// Real strings from both sides, so the test fails when either API changes shape.
//   frisky.fm  GET /v3/mixes?artists_id=151
//   VK         audio.get owner_id=-42311167
const FRISKY_DATED = 'Tech Coast Tribal - 06 May 2016 - El Reyalto';
const FRISKY_DATED_URL = 'el-reyalto-at-05-06-2016';
const FRISKY_MONTHLY = 'Tech Coast Tribal - August 2026 - El Reyalto';
const FRISKY_MONTHLY_URL = 'el-reyalto-at-08-14-2026';
const VK_OLD_TITLE = 'May 2016 - Tech Coast Tribal (Part 1) [vk.com/feelin_frisky]';
const VK_OLD_ARTIST = 'FRISKY | El Reyalto';
const VK_NEW_TITLE = 'FRISKY | Tech Coast Tribal August 2026 - Part 2';
const VK_NEW_ARTIST = 'El Reyalto';

describe('normalize / artistKey', () => {
  it('folds case, accents and punctuation', () => {
    expect(normalize('El  Reyalto!')).toBe('el reyalto');
    expect(normalize('Tomás Briski')).toBe('tomas briski');
  });

  it('gives the same artist key on both sides of the FRISKY prefix', () => {
    expect(artistKey(VK_OLD_ARTIST)).toBe(artistKey(VK_NEW_ARTIST));
    expect(artistKey('el reyalto')).toBe('elreyalto');
  });

  it('is empty for a missing artist', () => {
    expect(artistKey(undefined)).toBe('');
    expect(artistKey(null)).toBe('');
  });
});

describe('partNumber', () => {
  it('reads every spelling VK uses', () => {
    expect(partNumber('Show (Part 2)')).toBe(2);
    expect(partNumber('Show - Part 3')).toBe(3);
    expect(partNumber('Show Part 11')).toBe(11);
  });

  it('is null for a single-part show', () => {
    expect(partNumber(FRISKY_DATED)).toBeNull();
    expect(partNumber(undefined)).toBeNull();
  });
});

describe('periodOf', () => {
  it('reads a day-month-year date', () => {
    expect(periodOf(FRISKY_DATED)).toEqual({year: 2016, month: 5, day: 6});
  });

  it('reads a month-year date, with no day to read', () => {
    expect(periodOf(FRISKY_MONTHLY)).toEqual({year: 2026, month: 8, day: null});
    expect(periodOf(VK_NEW_TITLE)).toEqual({year: 2026, month: 8, day: null});
  });

  it('ignores a part number that looks like a year would not', () => {
    expect(periodOf('Show (Part 2)')).toEqual({year: null, month: null, day: null});
  });
});

describe('airDateOf', () => {
  it('reads the exact air date out of the mix slug', () => {
    expect(airDateOf(FRISKY_MONTHLY_URL)).toEqual({year: 2026, month: 8, day: 14});
    expect(airDateOf(FRISKY_DATED_URL)).toEqual({year: 2016, month: 5, day: 6});
  });

  it('is empty for a slug with no date in it', () => {
    expect(airDateOf('tech_coast_tribal')).toEqual({year: null, month: null, day: null});
    expect(airDateOf(undefined)).toEqual({year: null, month: null, day: null});
  });

  it('turns a period into a timestamp a comparison can use', () => {
    expect(periodMs(airDateOf(FRISKY_MONTHLY_URL))).toBe(Date.UTC(2026, 7, 14, 12));
    expect(periodMs({year: null, month: null, day: null})).toBeNull();
  });
});

describe('titleKey', () => {
  it('drops the artist, the date, the part and the vk suffix', () => {
    expect(titleKey(FRISKY_DATED, 'El Reyalto')).toBe('coast tech tribal');
    expect(titleKey(VK_OLD_TITLE, VK_OLD_ARTIST)).toBe('coast tech tribal');
    expect(titleKey(VK_NEW_TITLE, VK_NEW_ARTIST)).toBe('coast tech tribal');
  });

  it('gives both parts of a multipart show the same key', () => {
    expect(titleKey('FRISKY | Artist of the Week August 2026 - Part 1', 'Melamanos'))
      .toBe(titleKey('FRISKY | Artist of the Week August 2026 - Part 2', 'Melamanos'));
  });
});

describe('bestMatch', () => {
  const mixes = [
    {id: 32954, titleKey: titleKey(FRISKY_DATED, 'El Reyalto'), year: 2016, month: 5},
    {id: 73675, titleKey: titleKey(FRISKY_MONTHLY, 'El Reyalto'), year: 2026, month: 8},
  ];

  it('picks the mix from the same month', () => {
    const query = {titleKey: titleKey(VK_OLD_TITLE, VK_OLD_ARTIST), year: 2016, month: 5};
    expect(bestMatch(query, mixes)?.id).toBe(32954);
  });

  it('matches both parts of a show to the one mix', () => {
    const query = {titleKey: titleKey(VK_NEW_TITLE, VK_NEW_ARTIST), year: 2026, month: 8};
    expect(bestMatch(query, mixes)?.id).toBe(73675);
  });

  it('never crosses months, however alike the titles read', () => {
    const query = {titleKey: 'coast tech tribal', year: 2019, month: 3};
    expect(bestMatch(query, mixes)).toBeNull();
  });

  it('rejects a different show of the same artist in the same month', () => {
    const query = {titleKey: titleKey('Deep Blue Sessions August 2026', 'El Reyalto'), year: 2026, month: 8};
    expect(bestMatch(query, mixes)).toBeNull();
  });

  it('has nothing to say about an artist with no mixes', () => {
    expect(bestMatch({titleKey: 'anything', year: 2026, month: 8}, [])).toBeNull();
  });

  it('scores a same-month hit above the threshold', () => {
    const query = {titleKey: titleKey(VK_NEW_TITLE, VK_NEW_ARTIST), year: 2026, month: 8};
    expect(bestMatch(query, mixes)!.score).toBeGreaterThan(MATCH_THRESHOLD);
  });

  // Tech Coast Tribal is weekly: frisky lists four August 2026 mixes with the
  // same title and the same month, and VK names none of them. The upload time
  // against the air date in the slug is all there is to tell them apart.
  describe('a weekly show, four mixes in the one month', () => {
    const weekly = ['08-07-2026', '08-14-2026', '08-21-2026', '08-28-2026'].map((date, index) => ({
      id: 73650 + index,
      titleKey: titleKey(FRISKY_MONTHLY, 'El Reyalto'),
      year: 2026,
      month: 8,
      airMs: periodMs(airDateOf(`el-reyalto-at-${date}`)),
    }));

    const query = (uploadedIso: string) => ({
      titleKey: titleKey(VK_NEW_TITLE, VK_NEW_ARTIST),
      year: 2026,
      month: 8,
      refMs: Date.parse(uploadedIso),
    });

    it('picks the episode nearest the VK upload', () => {
      expect(bestMatch(query('2026-08-22T10:00:00Z'), weekly)?.id).toBe(73652);
      expect(bestMatch(query('2026-08-08T10:00:00Z'), weekly)?.id).toBe(73650);
      expect(bestMatch(query('2026-08-30T10:00:00Z'), weekly)?.id).toBe(73653);
    });

    it('still matches something when VK has no upload time', () => {
      const {refMs, ...noDate} = query('2026-08-22T10:00:00Z');
      expect(bestMatch(noDate, weekly)).not.toBeNull();
    });
  });
});
