'use client';

import { useEffect } from 'react';
import type { DoubanItem } from '@/lib/types';

const PROVIDERS = [
  { name: '爱奇艺', detail: '搜索影视正片', build: (q: string) => 'https://so.iqiyi.com/so/q_' + encodeURIComponent(q) },
  { name: '腾讯视频', detail: '搜索影视正片', build: (q: string) => 'https://v.qq.com/x/search/?q=' + encodeURIComponent(q) },
  { name: '优酷', detail: '搜索影视正片', build: (q: string) => 'https://search.youku.com/search_video?keyword=' + encodeURIComponent(q) },
  { name: '哔哩哔哩', detail: '搜索影视正片', build: (q: string) => 'https://search.bilibili.com/all?keyword=' + encodeURIComponent(q) },
  { name: '芒果TV', detail: '进入官网后搜索', build: () => 'https://www.mgtv.com/' },
] as const;

export function OfficialWatchModal({
  item, onClose, onSearch,
}: {
  item: DoubanItem;
  onClose: () => void;
  onSearch: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-3 sm:p-6" onClick={onClose} role="presentation">
      <section
        role="dialog" aria-modal="true" aria-labelledby="official-watch-title"
        className="bg-surface-raised border border-line rounded-2xl p-5 sm:p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 justify-between">
          <div className="min-w-0">
            <p className="text-xs text-muted mb-2">影视榜单 · 正版观看入口</p>
            <h2 id="official-watch-title" className="text-lg sm:text-xl font-semibold text-content break-words">{item.title}</h2>
            <div className="mt-2 text-xs text-muted flex flex-wrap gap-x-3 gap-y-1">
              {item.rating && <span>榜单评分：{item.rating}</span>}
              <span>片源情况：待平台确认</span>
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="shrink-0 px-3 py-2 rounded-lg bg-chip text-muted hover:text-content"
            aria-label="关闭观看入口">✕</button>
        </div>
        <div className="mt-4 rounded-xl border border-line bg-chip/40 px-3 py-3 text-xs text-muted leading-relaxed">
          以下按钮前往各正版平台的搜索页，不代表该平台拥有本片，也不代表当前可免费观看。
          是否提供正片、限免、广告观看或需要会员，请以平台页面为准。
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {PROVIDERS.map((provider) => (
            <a
              key={provider.name}
              href={provider.build(item.title)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-line px-4 py-3 bg-surface hover:bg-hover transition-colors flex justify-between items-center gap-2"
              aria-label={'到' + provider.name + '搜索' + item.title}
            >
              <span className="min-w-0">
                <span className="block text-content text-sm font-medium">{provider.name}</span>
                <span className="block text-xs text-muted mt-1">{provider.detail}</span>
              </span>
              <span aria-hidden="true" className="text-muted">↗</span>
            </a>
          ))}
        </div>
        <button
          type="button"
          onClick={onSearch}
          className="mt-4 w-full rounded-xl bg-accent text-on-accent px-4 py-3 text-sm font-medium hover:opacity-90"
        >
          在 LibreTV 搜索已有点播源
        </button>
        <p className="mt-3 text-[11px] text-faint leading-relaxed">
          榜单海报与评分仅用于影片发现。本站不提取视频平台的受保护播放链接，也不绕过会员、广告或地区限制。
        </p>
      </section>
    </div>
  );
}
