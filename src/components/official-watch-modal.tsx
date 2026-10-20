'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/client-api';
import type { DoubanItem } from '@/lib/types';
import { OFFICIAL_PROVIDERS, WATCH_STATUS_LABELS, effectiveWatchStatuses } from '@/lib/film-discovery';

const formatTime = (value: string) => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });

export function OfficialWatchModal({ item, onClose, onSearch }: {
  item: DoubanItem;
  onClose: () => void;
  onSearch: () => void;
}) {
  const [tmdbId, setTmdbId] = useState<number>();
  const [clock, setClock] = useState(Date.now);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const query = useQuery({
    queryKey: ['film-discovery', item.title, item.isTv, tmdbId],
    queryFn: ({ signal }) => api.filmDiscovery({ title: item.title, mediaType: item.isTv ? 'tv' : 'movie', tmdbId }, signal),
    staleTime: 60_000, refetchInterval: 5 * 60_000, retry: false,
  });
  const details = query.data?.details;

  useEffect(() => {
    const nextExpiry = Math.min(...(query.data?.availability ?? [])
      .map(entry => Date.parse(entry.evidence?.expiresAt ?? ''))
      .filter(time => Number.isFinite(time) && time > Date.now()));
    if (!Number.isFinite(nextExpiry)) return;
    const timer = window.setTimeout(() => setClock(Date.now()), Math.min(nextExpiry - Date.now() + 20, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [query.data, clock]);

  useEffect(() => {
    // Reveal the global login/setup dialog if this session expired while the modal was open.
    if (query.error instanceof ApiError && [401, 503].includes(query.error.status)) onClose();
  }, [query.error, onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key !== 'Tab') return;
      const nodes = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), [tabindex="0"]') ?? []);
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
        e.preventDefault(); first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-3 sm:p-6" onClick={onClose} role="presentation">
      <section
        ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="official-watch-title"
        className="bg-surface-raised border border-line rounded-2xl p-4 sm:p-6 w-full max-w-2xl max-h-[90vh] supports-[height:100dvh]:max-h-[90dvh] overflow-y-auto overscroll-contain shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 justify-between">
          <div className="min-w-0">
            <p className="text-xs text-muted mb-2">影片资料 · 正版观看入口</p>
            <h2 id="official-watch-title" className="text-lg sm:text-xl font-semibold text-content break-words">{item.title}</h2>
            {item.rating && <p className="mt-2 text-xs text-muted">榜单评分：{item.rating}</p>}
          </div>
          <button ref={closeRef} type="button" onClick={onClose} className="shrink-0 min-h-11 min-w-11 px-3 py-2 rounded-lg bg-chip text-muted hover:text-content" aria-label="关闭观看入口">✕</button>
        </div>

        <section className="mt-4 rounded-xl border border-line p-3 sm:p-4" aria-label="影片资料" aria-busy={query.isFetching}>
          <h3 className="text-sm font-medium text-content">影片资料</h3>
          <div role="status" className="mt-2 text-xs text-muted leading-relaxed">
            {query.isPending ? '正在查找可信影片资料…' : query.isError || query.data?.state === 'unavailable'
              ? '资料暂时无法获取，仍可前往官方平台自行确认。'
              : query.data?.state === 'not_configured' ? '暂未接入已授权的资料来源，以下缺失信息保留为暂无资料。'
                : query.data?.state === 'not_found' ? '未找到片名与类型相符的可信资料，缺失信息保留为暂无资料。'
                  : query.data?.state === 'choose_version' ? '请先确认具体年份和版本，避免混淆同名作品。' : null}
          </div>
          {query.data?.state === 'choose_version' && (
            <div className="mt-3 flex flex-wrap gap-2" aria-label="选择影片版本">
              {query.data.candidates.map(candidate => (
                <button key={candidate.id} type="button" onClick={() => setTmdbId(candidate.id)} className="min-h-11 rounded-lg border border-line bg-chip px-3 py-2 text-left text-xs text-content break-words">
                  {candidate.title} · {candidate.year || '年份未知'} · {candidate.mediaType === 'movie' ? '电影' : '剧集'}
                  {candidate.originalTitle && candidate.originalTitle !== candidate.title && <span className="block text-muted">{candidate.originalTitle}</span>}
                </button>
              ))}
            </div>
          )}
          <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs break-words">
            {[
              ['年份', details?.year], ['类型', details?.genres.join(' / ')],
              ['国家 / 地区', details?.countries.join(' / ')], ['导演', details?.directors.join(' / ')],
              ['演员', details?.cast.join(' / ')], ['评分', details?.rating ? `${details.rating.value.toFixed(1)} / 10 · ${details.rating.source} · ${details.rating.votes} 人评分` : undefined],
            ].map(([label, value]) => <div key={label}><dt className="text-faint">{label}</dt><dd className="mt-1 text-content">{value || '暂无资料'}</dd></div>)}
            {details?.episodeCount && <div><dt className="text-faint">集数</dt><dd className="mt-1 text-content">{details.episodeCount}</dd></div>}
          </dl>
          <h4 className="mt-3 text-xs text-faint">影片简介</h4>
          <p className="mt-1 text-xs text-content leading-relaxed whitespace-pre-wrap break-words">{details?.overview || '暂无资料'}</p>
          {details && <p className="mt-3 text-[11px] text-muted">资料来源：<a className="underline" href={details.source.url} target="_blank" rel="noopener noreferrer">TMDB</a> · 查询时间：{formatTime(details.source.fetchedAt)}（北京时间）</p>}
        </section>

        <h3 className="mt-5 text-sm font-medium text-content">中国大陆观看方式</h3>
        <p className="mt-2 text-xs text-muted leading-relaxed">仅在可信来源明确列出本片在中国大陆的观看方式时显示状态。未知表示尚无可靠证据；搜索入口不代表平台拥有本片，也不代表可免费观看。</p>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {OFFICIAL_PROVIDERS.map(provider => {
            const entry = query.data?.availability.find(a => a.provider === provider.id);
            const statuses = effectiveWatchStatuses(entry);
            const verified = !statuses.includes('unknown');
            return (
              <div key={provider.id} className="rounded-xl border border-line px-3 py-3 bg-surface min-w-0">
                <div className="flex justify-between items-start gap-2">
                  <span className="text-content text-sm font-medium">{provider.name}</span>
                  <span className="text-xs text-muted text-right" data-provider={provider.id}>{statuses.map(s => WATCH_STATUS_LABELS[s]).join(' / ')}</span>
                </div>
                {verified && entry?.evidence ? (
                  <div className="mt-2 text-[11px] text-muted leading-relaxed break-words">
                    <a className="underline" href={entry.evidence.url} target="_blank" rel="noopener noreferrer">来源：{entry.evidence.source}</a>
                    <p>地区：中国大陆 · 查询时间：{formatTime(entry.evidence.checkedAt)}（北京时间）</p>
                    <p>有效至：{formatTime(entry.evidence.expiresAt)}（北京时间）</p>
                  </div>
                ) : <p className="mt-2 text-[11px] text-faint">暂无可核实的中国大陆观看信息</p>}
                <a href={provider.search(item.title)} target="_blank" rel="noopener noreferrer" className="mt-2 min-h-11 inline-flex items-center text-xs text-accent underline" aria-label={`到${provider.name}搜索${item.title}`}>
                  {provider.id === 'mgtv' ? '前往官网搜索' : '前往平台搜索'} ↗
                </a>
              </div>
            );
          })}
        </div>
        <button type="button" onClick={onSearch} className="mt-4 w-full min-h-11 rounded-xl bg-accent text-on-accent px-4 py-3 text-sm font-medium hover:opacity-90">在 LibreTV 搜索已有点播源</button>
        <p className="mt-3 text-[11px] text-faint leading-relaxed">播放权益可能变化，请以平台当前页面及你所在地区为准。本站不提取受保护播放链接，也不绕过 DRM、会员、广告或地区限制。</p>
        {details && <p className="mt-2 text-[11px] text-faint">This product uses the TMDB API but is not endorsed or certified by TMDB. 观看方式数据由 JustWatch 经 TMDB 提供。</p>}
      </section>
    </div>
  );
}
