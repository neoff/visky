import axios from 'axios';
import {__resetFriskyClient, search} from '@/services/friskyApi';

const mock = axios as unknown as {__created: any[]; __resetCreated: () => void};

describe('the frisky client encodes its own query parameters', () => {
  beforeEach(() => {
    mock.__resetCreated();
    __resetFriskyClient();
  });

  /**
   * The bug this pins down: axios's default parameter encoder ends with
   * `.replace(/%20/g, "+")`, and frisky does not read `+` as a space.
   * `?query=hurly+burly` answers with four EMPTY arrays — a 200, no error, no
   * hint — while `hurly%20burly` returns 30 mixes. Every multi-word search
   * found nothing and every track was filed as unknown to frisky.
   */
  it('keeps a space as %20, never as +', async () => {
    await search('hurly burly');

    const config = mock.__created[mock.__created.length - 1];
    const encode = config?.paramsSerializer?.encode;
    expect(encode).toBeDefined();
    expect(encode('hurly burly')).toBe('hurly%20burly');
    expect(encode('hurly burly')).not.toContain('+');
  });

  it('answers with the four empty models when the body is not a search result', async () => {
    // the mock returns {response:{success:true}} — nothing this client can use
    await expect(search('anything')).resolves.toEqual({Mixes: [], Shows: [], Episodes: [], Artists: []});
  });
});
