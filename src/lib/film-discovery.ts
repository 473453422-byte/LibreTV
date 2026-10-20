/** Shared contracts; credentials and upstream requests stay on the server. */
export type FilmMediaType = 'movie' | 'tv';
export type WatchStatus = 'free' | 'ad_supported' | 'subscription' | 'rental' | 'purchase' | 'unknown';
export type OfficialProviderId = 'iqiyi' | 'tencent' | 'youku' | 'mgtv' | 'bilibili' | 'cctv';

export const WATCH_STATUS_LABELS: Record<WatchStatus, string> = {
  free: '免费', ad_supported: '广告免费', subscription: '会员', rental: '租赁', purchase: '购买', unknown: '未知',
};

export const OFFICIAL_PROVIDERS = [
  { id: 'iqiyi', name: '爱奇艺', aliases: ['爱奇艺', 'iqiyi'], search: (q: string) => `https://so.iqiyi.com/so/q_${encodeURIComponent(q)}` },
  { id: 'tencent', name: '腾讯视频', aliases: ['腾讯视频', 'tencent video'], search: (q: string) => `https://v.qq.com/x/search/?q=${encodeURIComponent(q)}` },
  { id: 'youku', name: '优酷', aliases: ['优酷', 'youku'], search: (q: string) => `https://search.youku.com/search_video?keyword=${encodeURIComponent(q)}` },
  { id: 'mgtv', name: '芒果TV', aliases: ['芒果tv', 'mango tv'], search: () => 'https://www.mgtv.com/' },
  { id: 'bilibili', name: '哔哩哔哩', aliases: ['哔哩哔哩', 'bilibili'], search: (q: string) => `https://search.bilibili.com/all?keyword=${encodeURIComponent(q)}` },
  { id: 'cctv', name: '央视网', aliases: ['央视网', 'cctv'], search: (q: string) => `https://search.cctv.com/search.php?qtext=${encodeURIComponent(q)}&type=video` },
] as const;

export interface FilmCandidate {
  id: number;
  title: string;
  originalTitle?: string;
  year?: string;
  mediaType: FilmMediaType;
}

export interface FilmDetails extends FilmCandidate {
  overview?: string;
  genres: string[];
  countries: string[];
  directors: string[];
  cast: string[];
  episodeCount?: number;
  rating?: { value: number; votes: number; source: 'TMDB' };
  source: { name: 'TMDB'; url: string; fetchedAt: string };
}

export interface ProviderAvailability {
  provider: OfficialProviderId;
  statuses: WatchStatus[];
  evidence?: {
    source: 'TMDB / JustWatch';
    providerIds: number[];
    region: 'CN';
    url: string;
    checkedAt: string;
    expiresAt: string;
  };
}

export interface FilmDiscoveryResponse {
  state: 'ready' | 'choose_version' | 'not_found' | 'not_configured' | 'unavailable';
  candidates: FilmCandidate[];
  details?: FilmDetails;
  availability: ProviderAvailability[];
}

export interface FilmDiscoveryRequest {
  title: string;
  mediaType: FilmMediaType;
  year?: string;
  tmdbId?: number;
}

export function unknownAvailability(): ProviderAvailability[] {
  return OFFICIAL_PROVIDERS.map(p => ({ provider: p.id, statuses: ['unknown'] }));
}

/** An expired or incomplete observation must never remain a free/member claim. */
export function effectiveWatchStatuses(entry: ProviderAvailability | undefined, now = Date.now()): WatchStatus[] {
  const e = entry?.evidence;
  if (!e || e.region !== 'CN' || !Number.isFinite(Date.parse(e.checkedAt)) ||
    !Number.isFinite(Date.parse(e.expiresAt)) || Date.parse(e.checkedAt) > now + 60_000 ||
    Date.parse(e.expiresAt) <= now || Date.parse(e.expiresAt) <= Date.parse(e.checkedAt)) return ['unknown'];
  const statuses = entry.statuses.filter(s => s !== 'unknown' && s in WATCH_STATUS_LABELS);
  return statuses.length ? [...new Set(statuses)] : ['unknown'];
}
