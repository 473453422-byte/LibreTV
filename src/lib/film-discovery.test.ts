import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectiveWatchStatuses, OFFICIAL_PROVIDERS, unknownAvailability } from './film-discovery';
import { discoverFilm, EVIDENCE_TTL, mapCnAvailability, mapFilmDetails, matchingCandidates, normalizeFilmTitle, parseFilmRequest } from './film-discovery-server';

const now = Date.parse('2026-10-20T00:00:00Z');
const movie = { id: 1234, title: '同名电影', original_title: 'Original', release_date: '2020-01-02', adult: false };
const provider = (name: string, id = 1) => ({ provider_id: id, provider_name: name });
const cn = (categories: Record<string, unknown>) => ({ id: 1234, results: { CN: { link: 'https://www.themoviedb.org/movie/1234/watch?locale=CN', ...categories } } });

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('film identity and request validation', () => {
  it('validates bounded typed input and refuses URLs as configuration', () => {
    expect(parseFilmRequest({ title: '电影', mediaType: 'movie', year: '2020', tmdbId: 1 })).toMatchObject({ title: '电影', year: '2020', tmdbId: 1 });
    for (const input of [null, {}, { title: 'x', mediaType: 'person' }, { title: '!', mediaType: 'movie' }, { title: 'x'.repeat(151), mediaType: 'movie' }, { title: 'x', mediaType: 'tv', year: '20' }, { title: 'x', mediaType: 'tv', tmdbId: -1 }]) expect(parseFilmRequest(input)).toBeNull();
    expect(parseFilmRequest({ title: 'x', mediaType: 'movie', apiUrl: 'http://127.0.0.1' })).not.toHaveProperty('apiUrl');
  });
  it('ignores punctuation but retains sequel and season numbers', () => {
    expect(normalizeFilmTitle('Ａ：片名 2')).toBe(normalizeFilmTitle('a片名2'));
    expect(normalizeFilmTitle('片名 2')).not.toBe(normalizeFilmTitle('片名'));
  });
  it('uses exact title/original title, year, and movie/TV shape; deduplicates IDs', () => {
    const input = [movie, movie, { ...movie, id: 2, release_date: '1990-01-01' }, { ...movie, id: 3, title: '同名电影续集', original_title: '' }, { id: 4, name: '同名电影', first_air_date: '2020-01-01' }];
    expect(matchingCandidates(input, { title: '同名电影', mediaType: 'movie', year: '2020' }).map(c => c.id)).toEqual([1234]);
    expect(matchingCandidates(input, { title: 'Original', mediaType: 'movie' }).map(c => c.id)).toEqual([1234, 2]);
    expect(matchingCandidates(input, { title: '同名电影', mediaType: 'tv' }).map(c => c.id)).toEqual([4]);
  });
});

describe('metadata provenance', () => {
  it('keeps real synopsis, year, genres, country, director, cast and score attribution', () => {
    const result = mapFilmDetails({ ...movie, overview: '真实简介', genres: [{ name: '剧情' }], production_countries: [{ name: 'China', iso_3166_1: 'CN' }], credits: { crew: [{ job: 'Director', name: '导演甲' }, { job: 'Producer', name: '制片人' }], cast: [{ name: '演员甲' }] }, vote_average: 8.2, vote_count: 100 }, 'movie', now);
    expect(result).toMatchObject({ year: '2020', overview: '真实简介', genres: ['剧情'], countries: ['China'], directors: ['导演甲'], cast: ['演员甲'], rating: { value: 8.2, votes: 100, source: 'TMDB' }, source: { fetchedAt: new Date(now).toISOString(), url: 'https://www.themoviedb.org/movie/1234' } });
  });
  it('does not invent missing fields or treat a TV creator as a director', () => {
    const result = mapFilmDetails({ id: 8, name: '剧名', created_by: [{ name: '主创' }], number_of_episodes: 12, vote_average: 9, vote_count: 0 }, 'tv', now);
    expect(result).toMatchObject({ directors: [], cast: [], genres: [], countries: [], episodeCount: 12 });
    expect(result?.rating).toBeUndefined();
    expect(result?.overview).toBeUndefined();
  });
});

describe('CN viewing evidence', () => {
  it('maps each explicit category without prioritizing free over paid modes', () => {
    const result = mapCnAvailability(cn({ free: [provider('iQIYI')], ads: [provider('Youku', 2)], flatrate: [provider('Tencent Video', 3), provider('iQIYI')], rent: [provider('Mango TV', 4)], buy: [provider('bilibili', 5)] }), 'movie', 1234, now);
    expect(result.map(p => p.statuses)).toEqual([['free', 'subscription'], ['subscription'], ['ad_supported'], ['rental'], ['purchase'], ['unknown']]);
    expect(result[0].evidence).toMatchObject({ source: 'TMDB / JustWatch', providerIds: [1], region: 'CN', checkedAt: new Date(now).toISOString(), expiresAt: new Date(now + EVIDENCE_TTL).toISOString() });
  });
  it('requires the exact film, CN region and trusted evidence URL', () => {
    const good = cn({ free: [provider('iQIYI')] });
    const bad = [null, { ...good, id: 999 }, { id: 1234, results: { US: good.results.CN } }, cn({ free: [provider('iQIYI')], link: 'http://www.themoviedb.org/movie/1234/watch?locale=CN' }), cn({ free: [provider('iQIYI')], link: 'https://evil.example/movie/1234/watch?locale=CN' }), cn({ free: [provider('iQIYI')], link: 'https://www.themoviedb.org/movie/1234/watch?locale=US' }), cn({ free: [provider('iQIYI')], link: 'https://www.themoviedb.org/movie/999/watch?locale=CN' })];
    for (const input of bad) expect(mapCnAvailability(input, 'movie', 1234, now)).toEqual(unknownAvailability());
  });
  it('never infers free from a search link, a lookalike name, or an international variant', () => {
    const result = mapCnAvailability(cn({ free: [provider('iQIYI International'), provider('WeTV'), provider('Youku Fake'), { provider_name: 'CCTV' }] }), 'movie', 1234, now);
    expect(result).toEqual(unknownAvailability());
    expect(OFFICIAL_PROVIDERS).toHaveLength(6);
  });
  it('expires observations and rejects incomplete, invalid, or future evidence', () => {
    const entry = mapCnAvailability(cn({ free: [provider('iQIYI')] }), 'movie', 1234, now)[0];
    expect(effectiveWatchStatuses(entry, now)).toEqual(['free']);
    expect(effectiveWatchStatuses(entry, now + EVIDENCE_TTL)).toEqual(['unknown']);
    expect(effectiveWatchStatuses({ provider: 'iqiyi', statuses: ['free'] }, now)).toEqual(['unknown']);
    expect(effectiveWatchStatuses(entry, now - 120_000)).toEqual(['unknown']);
    expect(effectiveWatchStatuses({ ...entry, evidence: { ...entry.evidence!, expiresAt: 'invalid' } }, now)).toEqual(['unknown']);
  });
});

describe('optional authorized upstream and graceful failure', () => {
  it('makes no external request without a configured token', async () => {
    vi.stubEnv('TMDB_READ_ACCESS_TOKEN', '');
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const result = await discoverFilm({ title: '缺少授权', mediaType: 'movie' });
    expect(result).toMatchObject({ state: 'not_configured', availability: unknownAvailability() });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('requires explicit version selection when the year is absent', async () => {
    vi.stubEnv('TMDB_READ_ACCESS_TOKEN', 'fixture-token');
    const fetcher = vi.fn(async () => Response.json({ page: 1, total_pages: 1, results: [movie, { ...movie, id: 2, release_date: '1990-01-01' }] })); vi.stubGlobal('fetch', fetcher);
    const result = await discoverFilm({ title: '同名电影', mediaType: 'movie' });
    expect(result.state).toBe('choose_version'); expect(result.candidates).toHaveLength(2);
    expect(result.details).toBeUndefined(); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('requires confirmation even for one result without a known year', async () => {
    vi.stubEnv('TMDB_READ_ACCESS_TOKEN', 'fixture-token');
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ page: 1, total_pages: 1, results: [{ ...movie, title: '单条测试' }] })));
    expect((await discoverFilm({ title: '单条测试', mediaType: 'movie' })).state).toBe('choose_version');
  });
  it('refuses a client-selected ID absent from exact candidates', async () => {
    vi.stubEnv('TMDB_READ_ACCESS_TOKEN', 'fixture-token');
    const fetcher = vi.fn(async () => Response.json({ page: 1, total_pages: 1, results: [movie] })); vi.stubGlobal('fetch', fetcher);
    expect((await discoverFilm({ title: movie.title, mediaType: 'movie', tmdbId: 999 })).state).toBe('choose_version');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('retains verified metadata if the availability service fails, without leaking error bodies', async () => {
    vi.stubEnv('TMDB_READ_ACCESS_TOKEN', 'fixture-token');
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => {
      if (url.pathname.includes('/search/')) return Response.json({ page: 1, total_pages: 1, results: [{ ...movie, title: '故障降级' }] });
      if (url.pathname.endsWith('/watch/providers')) return new Response('fixture-token sensitive upstream body', { status: 503 });
      return Response.json({ ...movie, title: '故障降级', overview: '已核实简介' });
    }));
    const result = await discoverFilm({ title: '故障降级', mediaType: 'movie', year: '2020' });
    expect(result).toMatchObject({ state: 'ready', details: { overview: '已核实简介' }, availability: unknownAvailability() });
    expect(JSON.stringify(result)).not.toContain('fixture-token');
  });
  it('uses fixed HTTPS paths and error-on-redirect for credential-bearing requests', async () => {
    vi.stubEnv('TMDB_READ_ACCESS_TOKEN', 'fixture-token');
    const fetcher = vi.fn(async () => { throw new Error('fixture-token'); }); vi.stubGlobal('fetch', fetcher);
    const result = await discoverFilm({ title: '网络故障', mediaType: 'movie' });
    expect(result.state).toBe('unavailable');
    const [url, options] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.origin).toBe('https://api.themoviedb.org'); expect(url.search).not.toContain('fixture-token');
    expect(options.redirect).toBe('error'); expect(JSON.stringify(result)).not.toContain('fixture-token');
  });
});
