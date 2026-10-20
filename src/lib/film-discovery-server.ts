import {
  OFFICIAL_PROVIDERS, unknownAvailability,
  type FilmCandidate, type FilmDetails, type FilmDiscoveryRequest, type FilmDiscoveryResponse,
  type FilmMediaType, type ProviderAvailability, type WatchStatus,
} from './film-discovery';
import { getCache, setCache } from './fetch-utils';

const API = 'https://api.themoviedb.org/3';
const CACHE_TTL = 10 * 60 * 1000;
export const EVIDENCE_TTL = 6 * 60 * 60 * 1000;
type Raw = Record<string, unknown>;
const object = (v: unknown): Raw => v && typeof v === 'object' && !Array.isArray(v) ? v as Raw : {};
const array = (v: unknown): Raw[] => Array.isArray(v) ? v.map(object) : [];
const text = (v: unknown): string => typeof v === 'string' ? v.trim() : '';
const positiveId = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const yearOf = (v: unknown) => /^(\d{4})-\d{2}-\d{2}$/.exec(text(v))?.[1];

export function normalizeFilmTitle(value: string): string {
  // Keep letters and numbers, including season/version numbers; never use fuzzy substring matching.
  return value.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]/gu, '');
}

export function parseFilmRequest(value: unknown): FilmDiscoveryRequest | null {
  const raw = object(value);
  const title = text(raw.title);
  if (!title || title.length > 150 || !normalizeFilmTitle(title) || !['movie', 'tv'].includes(text(raw.mediaType))) return null;
  if (raw.year !== undefined && (typeof raw.year !== 'string' || !/^\d{4}$/.test(raw.year))) return null;
  if (raw.tmdbId !== undefined && !positiveId(raw.tmdbId)) return null;
  return { title, mediaType: raw.mediaType as FilmMediaType, year: raw.year as string | undefined, tmdbId: raw.tmdbId as number | undefined };
}

function toCandidate(raw: Raw, mediaType: FilmMediaType): FilmCandidate | undefined {
  if (!positiveId(raw.id) || raw.adult === true) return;
  const title = text(mediaType === 'movie' ? raw.title : raw.name);
  if (!title) return;
  return {
    id: raw.id, title, mediaType,
    originalTitle: text(mediaType === 'movie' ? raw.original_title : raw.original_name) || undefined,
    year: yearOf(mediaType === 'movie' ? raw.release_date : raw.first_air_date),
  };
}

export function matchingCandidates(results: unknown, request: FilmDiscoveryRequest): FilmCandidate[] {
  const query = normalizeFilmTitle(request.title);
  return [...new Map(array(results).flatMap(raw => {
    const c = toCandidate(raw, request.mediaType);
    if (!c || (request.year && c.year !== request.year)) return [];
    if (![c.title, c.originalTitle].some(t => t && normalizeFilmTitle(t) === query)) return [];
    return [[c.id, c] as const];
  })).values()];
}

async function tmdb(path: string, token: string, query: Record<string, string> = {}): Promise<Raw> {
  const url = new URL(API + path);
  for (const [key, value] of Object.entries({ language: 'zh-CN', ...query })) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(7000), redirect: 'error', cache: 'no-store',
  });
  // Never expose upstream bodies, headers, credentials, or request URLs in client errors.
  if (!response.ok) throw new Error('Film data unavailable');
  return object(await response.json());
}

export function mapFilmDetails(raw: unknown, type: FilmMediaType, now: number): FilmDetails | undefined {
  const r = object(raw);
  const candidate = toCandidate(r, type);
  if (!candidate) return;
  const credits = object(r.credits);
  const names = (rows: Raw[]) => [...new Set(rows.map(x => text(x.name)).filter(Boolean))];
  const countries = array(r.production_countries).map(x => text(x.name) || text(x.iso_3166_1)).filter(Boolean);
  const score = typeof r.vote_average === 'number' ? r.vote_average : 0;
  const votes = typeof r.vote_count === 'number' ? r.vote_count : 0;
  return {
    ...candidate, overview: text(r.overview) || undefined,
    genres: names(array(r.genres)), countries,
    directors: names(array(credits.crew).filter(x => x.job === 'Director')),
    cast: names(array(credits.cast).slice(0, 12)),
    episodeCount: positiveId(r.number_of_episodes) ? r.number_of_episodes : undefined,
    rating: score > 0 && score <= 10 && votes > 0 ? { value: score, votes, source: 'TMDB' } : undefined,
    source: { name: 'TMDB', url: `https://www.themoviedb.org/${type}/${candidate.id}`, fetchedAt: new Date(now).toISOString() },
  };
}

/** Only explicit CN categories from the trusted TMDB/JustWatch endpoint are evidence. */
export function mapCnAvailability(raw: unknown, type: FilmMediaType, id: number, now: number): ProviderAvailability[] {
  if (object(raw).id !== id) return unknownAvailability();
  const cn = object(object(object(raw).results).CN);
  let evidenceUrl: URL;
  try {
    evidenceUrl = new URL(text(cn.link));
    if (evidenceUrl.protocol !== 'https:' || evidenceUrl.hostname !== 'www.themoviedb.org' ||
      evidenceUrl.username || evidenceUrl.password || evidenceUrl.searchParams.get('locale') !== 'CN' ||
      !new RegExp(`^/${type}/${id}(?:-[^/]+)?/watch/?$`).test(evidenceUrl.pathname)) return unknownAvailability();
  } catch { return unknownAvailability(); }
  const categories: [string, WatchStatus][] = [
    ['free', 'free'], ['ads', 'ad_supported'], ['flatrate', 'subscription'], ['rent', 'rental'], ['buy', 'purchase'],
  ];
  return OFFICIAL_PROVIDERS.map(provider => {
    const observations = categories.flatMap(([category, status]) => array(cn[category])
      .filter(p => positiveId(p.provider_id) && provider.aliases.some(alias => alias === text(p.provider_name).normalize('NFKC').toLowerCase()))
      .map(p => ({ status, id: p.provider_id as number })));
    if (!observations.length) return { provider: provider.id, statuses: ['unknown'] };
    return {
      provider: provider.id, statuses: [...new Set(observations.map(x => x.status))],
      evidence: {
        source: 'TMDB / JustWatch', providerIds: [...new Set(observations.map(x => x.id))], region: 'CN', url: evidenceUrl.toString(),
        checkedAt: new Date(now).toISOString(), expiresAt: new Date(now + EVIDENCE_TTL).toISOString(),
      },
    };
  });
}

export async function discoverFilm(request: FilmDiscoveryRequest): Promise<FilmDiscoveryResponse> {
  const fallback = (state: FilmDiscoveryResponse['state'], candidates: FilmCandidate[] = []): FilmDiscoveryResponse =>
    ({ state, candidates, availability: unknownAvailability() });
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  if (!token) return fallback('not_configured');
  const key = `film-discovery:${JSON.stringify(request)}`;
  const cached = getCache<FilmDiscoveryResponse>(key);
  if (cached) return cached;
  try {
    const params = { query: request.title, include_adult: 'false' };
    const first = await tmdb(`/search/${request.mediaType}`, token, params);
    if (!Array.isArray(first.results) || first.page !== 1 || !Number.isSafeInteger(first.total_pages) || (first.total_pages as number) < 0) return fallback('unavailable');
    const totalPages = first.total_pages as number;
    const pageCount = Math.min(3, Math.max(1, totalPages));
    const extra = await Promise.all(Array.from({ length: pageCount - 1 }, (_, i) => tmdb(`/search/${request.mediaType}`, token, { ...params, page: String(i + 2) })));
    if (extra.some((p, i) => !Array.isArray(p.results) || p.page !== i + 2)) return fallback('unavailable');
    const candidates = matchingCandidates([...(first.results as unknown[]), ...extra.flatMap(p => p.results as unknown[])], request);
    if (!candidates.length) return fallback('not_found');
    // Missing year always requires explicit version selection, including a single search hit.
    const selected = request.tmdbId ? candidates.find(c => c.id === request.tmdbId)
      : request.year && candidates.length === 1 && totalPages <= 3 ? candidates[0] : undefined;
    if (!selected) return fallback('choose_version', candidates);
    const raw = await tmdb(`/${request.mediaType}/${selected.id}`, token, { append_to_response: 'credits' });
    const details = mapFilmDetails(raw, request.mediaType, Date.now());
    if (!details || details.id !== selected.id || (selected.year && details.year !== selected.year) ||
      ![details.title, details.originalTitle].some(t => t && [selected.title, selected.originalTitle].some(s => s && normalizeFilmTitle(t) === normalizeFilmTitle(s)))) return fallback('unavailable');
    let availability = unknownAvailability();
    try {
      availability = mapCnAvailability(await tmdb(`/${request.mediaType}/${selected.id}/watch/providers`, token), request.mediaType, selected.id, Date.now());
    } catch { /* A provider outage must not hide valid metadata or affect existing playback. */ }
    const result: FilmDiscoveryResponse = { state: 'ready', candidates, details, availability };
    setCache(key, result, CACHE_TTL);
    return result;
  } catch { return fallback('unavailable'); }
}
