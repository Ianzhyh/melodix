import { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import type { MouseEvent, ReactNode, CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { usePlaybackStore } from '../../stores/playbackStore';
import { useHomeStore } from '../../stores/homeStore';
import { useToastStore } from '../../stores/toastStore';
import { useFavoriteStore } from '../../stores/favoriteStore';
import { useHistoryStore } from '../../stores/historyStore';
import { useLocalLibraryStore } from '../../stores/localLibraryStore';
import { useCustomLibraryStore } from '../../stores/customLibraryStore';
import { useSearchStore } from '../../stores/searchStore';
import { useUIStore } from '../../stores/uiStore';
import { useHomeLayoutStore } from '../../stores/homeLayoutStore';
import * as api from '../../api/client';
import { getSongCoverUrl, getLibraryCoverUrl } from '../../utils/cover';
import type { RouteState, Song } from '../../types/playback';
import type { HomeModuleConfig, CardSize, CoverRatio } from '../../stores/homeLayoutStore';

/**
 * 主页内容模块集合：
 * - 旧模块（今日推荐/宝藏库/榜单/新歌/猜你喜欢）的 JSX 自原版 HomePage 迁移，外观保持不变
 * - 新模块（快捷入口/最近播放/我喜欢的音乐）复用同一套卡片语言
 * - 每个模块自行读取数据与加载态；编辑模式下空数据渲染幽灵占位（ModuleGhost）
 */

export interface ModuleComponentProps {
  config: HomeModuleConfig;
  editing?: boolean;
  onNavigate?: (route: RouteState) => void;
}

/* ================= 图标 ================= */
export const IconPlay = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
);
const IconMusic = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
);

/* ---- 快捷磁贴用图标（跟随应用 token，无渐变） ---- */
const IconHeartTint = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--color-favorite)"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
);
const IconZapTint = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--color-primary)"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /></svg>
);
const IconClockTint = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-icon)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
);
const IconDiscTint = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-icon)" strokeWidth="2"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></svg>
);
const IconMusicTint = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-icon)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
);
const IconSearchTint = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-icon)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
);
const IconDownloadTint = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-icon)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
);
const IconSearch = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
);
export const IconChevron = ({ size = 16, dir }: { size?: number; dir: 'left' | 'right' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: dir === 'left' ? 'rotate(180deg)' : undefined }}><polyline points="9 18 15 12 9 6" /></svg>
);

/* ================= 通用小组件 ================= */

export const Skeleton = ({ width, height, borderRadius = 8 }: { width: number | string; height: number; borderRadius?: number }) => (
  <div className="shimmer-skeleton" style={{ width, height, borderRadius }} />
);

/** 模块标题行：支持自定义标题与隐藏（由模块设置控制） */
const SectionHead = ({ config, fallbackTitle, hint }: { config: HomeModuleConfig; fallbackTitle: string; hint?: string }) => {
  if (config.props.showTitle === false) return null;
  const title = config.props.customTitle?.trim() || fallbackTitle;
  return (
    <div className="section-head-row">
      <h2 className="section-title" style={{ marginBottom: 0 }}>{title}</h2>
      {hint && <span className="section-hint">{hint}</span>}
    </div>
  );
};

/** 网格列数内联样式：列数由模块设置控制（默认 6 列），同时派生 --c 列宽变量供卡片高度公式使用 */
const gridStyle = (columns: number | undefined): CSSProperties => ({
  gridTemplateColumns: `repeat(${columns ?? 6}, minmax(0, 1fr))`,
  '--cols': String(columns ?? 6),
  '--c': 'calc((100cqw - (var(--cols, 6) - 1) * var(--hm-col-gap, 16px)) / var(--cols, 6))',
} as CSSProperties);

/** 单卡尺寸切换（1×1 → 2×1 → 1×2 → 2×2 循环）：编辑模式显示在卡片左上角 */
function CardSizeChip({ size, onCycle }: { size: CardSize; onCycle: (e: MouseEvent) => void }) {
  const label = size === 'w' ? '2×1' : size === 't' ? '1×2' : size === 'l' ? '2×2' : '1×1';
  return (
    <button
      className={`card-size-chip${size !== 's' ? ' active' : ''}`}
      onClick={onCycle}
      title="点击切换卡片尺寸（1×1 / 2×1 / 1×2 / 2×2）"
    >
      {label}
    </button>
  );
}

const SIZE_CYCLE: Record<CardSize, CardSize> = { s: 'w', w: 't', t: 'l', l: 's' };

/** 卡片尺寸钩子：读取/轮换模块的 cardSizes */
function useCardSizes(config: HomeModuleConfig) {
  const setModuleProps = useHomeLayoutStore((s) => s.setModuleProps);
  const cardSizes = config.props.cardSizes;
  const sizeOf = useCallback((id: string): CardSize => cardSizes?.[id] ?? 's', [cardSizes]);
  const cycleSize = useCallback((id: string) => {
    const cur = cardSizes ?? {};
    setModuleProps(config.id, { cardSizes: { ...cur, [id]: SIZE_CYCLE[cur[id] ?? 's'] } });
  }, [config.id, cardSizes, setModuleProps]);
  return { sizeOf, cycleSize };
}

/** 尺寸徽章便捷构造 */
const sizeChipOf = (
  editing: boolean | undefined,
  sizeOf: (id: string) => CardSize,
  cycleSize: (id: string) => void,
  id: string
): ReactNode =>
  editing ? (
    <CardSizeChip size={sizeOf(id)} onCycle={(e) => { e.stopPropagation(); cycleSize(id); }} />
  ) : undefined;

/** 网格子项的跨行跨列样式（2×1 横宽 / 1×2 竖版 / 2×2 海报） */
const spanStyle = (size: CardSize): CSSProperties | undefined => {
  if (size === 'w') return { gridColumn: 'span 2' };
  if (size === 't') return { gridRow: 'span 2' };
  if (size === 'l') return { gridColumn: 'span 2', gridRow: 'span 2' };
  return undefined;
};

/** 横滑行单元格的宽度档位 class（1×2 在横滑中退化为方卡，避免撑坏行高） */
const cellClass = (size: CardSize): string =>
  size === 's' || size === 't' ? 'scroll-cell' : 'scroll-cell wide';

/** 封面比例（仅方形卡生效） */
const RATIO_ASPECT: Record<CoverRatio, string> = {
  '1:1': '1 / 1',
  '4:3': '4 / 3',
  '3:4': '3 / 4',
};
const coverAspect = (size: CardSize, ratio: CoverRatio | undefined): string =>
  size === 'w' ? '2.02 / 1' : RATIO_ASPECT[ratio ?? '1:1'];

/** 自动对齐整行：snap 开启且数量足够时取列数整数倍（数量不足列数时保持原数量，不越权放大） */
const snapSlice = <T,>(items: T[], count: number, columns: number, snap: boolean | undefined): T[] => {
  const cols = Math.max(1, columns);
  const n = snap && count >= cols ? count - (count % cols) : count;
  return items.slice(0, n);
};

/* ---- 跨尺寸卡片的内联几何（关键尺寸走内联，防 CSS 级联失效；--c 由网格派生列宽） ---- */
const IMG_FILL: CSSProperties = { width: '100%', height: '100%', objectFit: 'cover', display: 'block' };
const POSTER_H = 'calc(2 * (var(--c, 190px) + 52px) + var(--hm-row-gap, 16px))';

/** 播放入队工具 hook */
function usePlaySongs() {
  const setQueue = usePlaybackStore((s) => s.setQueue);
  const { showToast } = useToastStore();
  return useCallback((songs: Song[], startIndex: number) => {
    if (!songs.length) {
      showToast('暂时没有可播放的歌曲', 'error');
      return;
    }
    setQueue(songs, startIndex);
    showToast(`正在播放: ${songs[startIndex]?.name || '未知歌曲'}`, 'success');
  }, [setQueue, showToast]);
}

/** 歌手名跳转 */
function artistLink(song: Song, onNavigate?: (route: RouteState) => void) {
  return (e: MouseEvent) => {
    e.stopPropagation();
    const artist = song.artists && song.artists.length > 0 ? song.artists[0] : null;
    if (!artist || !artist.id || !onNavigate) return;
    onNavigate({ page: 'artist', id: artist.id, source: song.source || 'tencent', name: artist.name });
  };
}

const formatPlayCount = (n: number): string => {
  if (n > 100000000) return (n / 100000000).toFixed(1) + '亿';
  if (n > 10000) return (n / 10000).toFixed(1) + '万';
  return String(n);
};

/** 横向滑动容器：悬停两侧浮现圆形箭头 */
function HScrollRow({ children }: { children: ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    update();
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [update]);

  return (
    <div className="hscroll">
      <div className="hscroll-track" ref={trackRef} onScroll={update}>{children}</div>
      {canLeft && (
        <button
          className="hscroll-arrow left"
          onClick={() => trackRef.current?.scrollBy({ left: -Math.round(trackRef.current.clientWidth * 0.85), behavior: 'smooth' })}
          aria-label="向左滚动"
          tabIndex={-1}
        >
          <IconChevron dir="left" />
        </button>
      )}
      {canRight && (
        <button
          className="hscroll-arrow right"
          onClick={() => trackRef.current?.scrollBy({ left: Math.round(trackRef.current.clientWidth * 0.85), behavior: 'smooth' })}
          aria-label="向右滚动"
          tabIndex={-1}
        >
          <IconChevron dir="right" />
        </button>
      )}
    </div>
  );
}

/** 编辑模式下空数据模块的幽灵占位 */
export function ModuleGhost({ label }: { label?: string }) {
  return (
    <div className="module-ghost">
      <IconMusic size={26} />
      <div>{label || '暂无内容，有数据后自动展示'}</div>
    </div>
  );
}

/* ================= 共享卡片 ================= */

function PlaylistCard({ name, cover, trackCount, size = 's', ratio, chip, onClick }: { name: string; cover: string; trackCount?: number; size?: CardSize; ratio?: CoverRatio; chip?: ReactNode; onClick: () => void }) {
  const poster = size === 'l';
  // 2×1 横排卡：左方封面 + 右文字，高度 = 一行（与 1×1 严格对齐）
  if (size === 'w') {
    return (
      <motion.div
        className="song-card card-wide"
        style={{ cursor: 'pointer', gridColumn: 'span 2', height: 'calc(var(--c, 190px) + 52px)' }}
        whileHover={{ y: -4 }}
        whileTap={{ scale: 0.98 }}
        onClick={onClick}
      >
        <div className="wide-cover" style={{ height: 'calc(var(--c, 190px) + 28px)', width: 'calc(var(--c, 190px) + 28px)' }}>
          {cover && (
            <img src={cover} alt={name} className="card-image" style={IMG_FILL} loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          )}
          <div className="play-overlay">
            <IconPlay size={26} />
          </div>
          {chip}
        </div>
        <div className="wide-body">
          <div className="wide-name">{name}</div>
          <div className="wide-sub">
            {!!trackCount && Number(trackCount) > 0
              ? <><IconPlay size={10} /> {formatPlayCount(Number(trackCount))} 次播放</>
              : '在线歌单'}
          </div>
        </div>
      </motion.div>
    );
  }
  // 1×2 竖版卡：整卡模糊封面氛围底 + 底部（小封面 + 歌名歌手）——图片有白边也不显眼
  if (size === 't') {
    return (
      <motion.div
        className="song-card span-1x2"
        style={{ cursor: 'pointer', gridRow: 'span 2', height: 'calc(2 * (var(--c, 190px) + 52px) + var(--hm-row-gap, 16px))', ...spanStyle(size) }}
        whileHover={{ y: -4 }}
        whileTap={{ scale: 0.98 }}
        onClick={onClick}
      >
        {cover ? (
          <>
            <div className="tall-blur" style={{ backgroundImage: `url(${cover})` }} />
            <div className="tall-scrim" />
          </>
        ) : (
          <div className="tall-blur tall-blur-flat" />
        )}
        <button
          className="tall-play"
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          aria-label={`播放${name}`}
          title={`播放${name}`}
        >
          <IconPlay size={22} />
        </button>
        <div className="tall-bottom">
          <div className="tall-thumb">
            {cover ? (
              <img src={cover} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            ) : (
              <div className="mini-cover-fallback"><IconMusic size={22} /></div>
            )}
          </div>
          <div className="tall-text">
            <div className="tall-name">{name}</div>
            <div className="tall-sub">在线歌单</div>
          </div>
        </div>
        {chip}
      </motion.div>
    );
  }
  return (
    <motion.div
      className={`song-card${poster ? ' span-2x2' : ''}`}
      style={{ cursor: 'pointer', height: poster ? POSTER_H : undefined, ...(poster ? {} : spanStyle(size)) }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
    >
      <div className={`card-container${poster ? ' fill' : ''}`} style={poster ? { width: '100%' } : { width: '100%', aspectRatio: coverAspect(size, ratio), borderRadius: 12, marginBottom: 12 }}>
        {cover && (
          <img src={cover} alt={name} className="card-image" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        )}
        <div className="play-overlay" style={{ borderRadius: 12 }}>
          <IconPlay size={36} />
        </div>
        {chip}
        {poster && (
          <div className="poster-info">
            <div className="poster-name">{name}</div>
            {!!trackCount && Number(trackCount) > 0 && (
              <div className="poster-sub">
                <IconPlay size={9} />
                {formatPlayCount(Number(trackCount))} 次播放
              </div>
            )}
          </div>
        )}
      </div>
      {!poster && (
        <div className="card-text">
          <div className="card-name">{name}</div>
        </div>
      )}
    </motion.div>
  );
}

function MiniSongCard({ song, size = 's', ratio, chip, onClick, onArtist }: { song: Song; size?: CardSize; ratio?: CoverRatio; chip?: ReactNode; onClick: () => void; onArtist: (e: MouseEvent) => void }) {
  const cover = getSongCoverUrl(song, 300);
  const poster = size === 'l';
  // 2×1 横排卡：左方封面 + 右歌名歌手
  if (size === 'w') {
    return (
      <motion.div
        className="song-card card-wide"
        style={{ cursor: 'pointer', gridColumn: 'span 2' }}
        whileHover={{ y: -4 }}
        whileTap={{ scale: 0.98 }}
        onClick={onClick}
      >
        <div className="wide-cover">
          {cover ? (
            <img src={cover} alt={song.name} className="card-image" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          ) : (
            <div className="mini-cover-fallback"><IconMusic size={24} /></div>
          )}
          <div className="play-overlay">
            <IconPlay size={26} />
          </div>
          {chip}
        </div>
        <div className="wide-body">
          <div className="wide-name">{song.name}</div>
          <div className="wide-sub">
            <span className="md-text-link" onClick={onArtist}>{song.artist}</span>
          </div>
        </div>
      </motion.div>
    );
  }
  // 1×2 竖版卡：整卡模糊封面氛围底 + 底部（小封面 + 歌名歌手）
  if (size === 't') {
    return (
      <motion.div
        className="song-card span-1x2"
        style={{ cursor: 'pointer', gridRow: 'span 2', height: 'calc(2 * (var(--c, 190px) + 52px) + var(--hm-row-gap, 16px))', ...spanStyle(size) }}
        whileHover={{ y: -4 }}
        whileTap={{ scale: 0.98 }}
        onClick={onClick}
      >
        {cover ? (
          <>
            <div className="tall-blur" style={{ backgroundImage: `url(${cover})` }} />
            <div className="tall-scrim" />
          </>
        ) : (
          <div className="tall-blur tall-blur-flat" />
        )}
        <button
          className="tall-play"
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          aria-label={`播放${song.name}`}
          title={`播放${song.name}`}
        >
          <IconPlay size={22} />
        </button>
        <div className="tall-bottom">
          <div className="tall-thumb">
            {cover ? (
              <img src={cover} alt={song.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            ) : (
              <div className="mini-cover-fallback"><IconMusic size={22} /></div>
            )}
          </div>
          <div className="tall-text">
            <div className="tall-name">{song.name}</div>
            <div className="tall-sub">
              <span className="md-text-link" onClick={onArtist}>{song.artist}</span>
            </div>
          </div>
        </div>
        {chip}
      </motion.div>
    );
  }
  return (
    <motion.div
      className={`song-card${poster ? ' span-2x2' : ''}`}
      style={{ cursor: 'pointer', height: poster ? POSTER_H : undefined, ...(poster ? {} : spanStyle(size)) }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
    >
      <div className={`card-container${poster ? ' fill' : ''}`} style={poster ? { width: '100%' } : { width: '100%', aspectRatio: coverAspect(size, ratio), borderRadius: 12, marginBottom: 12 }}>
        {cover ? (
          <img src={cover} alt={song.name} className="card-image" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        ) : (
          <div className="mini-cover-fallback"><IconMusic size={26} /></div>
        )}
        <div className="play-overlay" style={{ borderRadius: 12 }}>
          <IconPlay size={36} />
        </div>
        {chip}
        {poster && (
          <div className="poster-info">
            <div className="poster-name">{song.name}</div>
            <div className="poster-sub">{song.artist}</div>
          </div>
        )}
      </div>
      {!poster && (
        <div className="card-text">
          <div className="card-name">{song.name}</div>
          <div className="card-sub">
            <span className="md-text-link" onClick={onArtist}>{song.artist}</span>
          </div>
        </div>
      )}
    </motion.div>
  );
}

/** 迷你歌曲集合（最近播放 / 我喜欢的音乐 / 最常播放 / 本地音乐）公共渲染 */
function SongShelfBody({ songs, count, columns, layout, editing, config, onNavigate, emptyHint }: {
  songs: Song[]; count: number; columns?: number; layout?: 'grid' | 'scroll'; editing?: boolean;
  config: HomeModuleConfig;
  onNavigate?: (route: RouteState) => void; emptyHint: string;
}) {
  const play = usePlaySongs();
  const { sizeOf, cycleSize } = useCardSizes(config);
  const items = snapSlice(songs, count, columns ?? 6, config.props.snapRow);
  if (items.length === 0) {
    if (!editing) return null;
    return <ModuleGhost label={emptyHint} />;
  }
  const card = (song: Song, index: number) => (
    <MiniSongCard
      key={`${song.id}-${index}`}
      song={song}
      size={sizeOf(song.id)}
      ratio={config.props.ratio}
      chip={sizeChipOf(editing, sizeOf, cycleSize, song.id)}
      onClick={() => play(songs, index)}
      onArtist={artistLink(song, onNavigate)}
    />
  );
  if (layout === 'grid') {
    return <div className="mini-grid" style={gridStyle(columns)}>{items.map(card)}</div>;
  }
  return (
    <HScrollRow>
      {items.map((s, i) => (
        <div className={cellClass(sizeOf(s.id))} key={`${s.id}-${i}`}>{card(s, i)}</div>
      ))}
    </HScrollRow>
  );
}

/* ================= 模块：今日为你推荐 ================= */

export function DailyRecommendModule({ config, editing, onNavigate }: ModuleComponentProps) {
  const { newSongs, isLoading } = useHomeStore();
  const play = usePlaySongs();
  const heroStyle = config.props.heroStyle ?? 'banner';
  // 「仅小卡」至少要有 2 首歌才有意义，不足时回退横幅
  const useCardsOnly = heroStyle === 'cards' && newSongs.length > 1;

  if (isLoading && newSongs.length === 0) {
    return (
      <section>
        <SectionHead config={config} fallbackTitle="今日为你推荐" />
        <div className="hero-grid">
          <div className="hero-main-card"><Skeleton width="100%" height={180} borderRadius={14} /></div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}><Skeleton width="100%" height={160} borderRadius={12} /></div>
          ))}
        </div>
      </section>
    );
  }
  if (newSongs.length === 0) {
    if (editing) return <ModuleGhost label="暂无推荐数据，稍后或刷新后展示" />;
    return null;
  }

  const smallCards = newSongs.slice(1, 5).map((song, index) => (
    <motion.div
      key={song.id}
      className="song-card"
      style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
      initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: (index + 1) * 0.03 + 0.03, ease: 'easeOut' }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.95 }}
      onClick={() => play(newSongs, index + 1)}
    >
      <div className="card-container" style={{ width: '100%', aspectRatio: '1/1', borderRadius: 12, marginBottom: 12 }}>
        <img
          src={getSongCoverUrl(song, 300)}
          alt={song.name}
          className="card-image"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          loading="lazy"
          decoding="async"
        />
        <div className="play-overlay" style={{ borderRadius: 12 }}>
          <IconPlay size={36} />
        </div>
      </div>
      <div style={{ fontSize: 14.5, fontWeight: 650, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.name}</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-faint)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        <span className="md-text-link" onClick={artistLink(song, onNavigate)}>{song.artist}</span>
      </div>
    </motion.div>
  ));

  return (
    <section>
      <SectionHead config={config} fallbackTitle="今日为你推荐" />
      <div className={`hero-grid${useCardsOnly ? ' no-banner' : ''}`}>
        {!useCardsOnly && (
          <div className="hero-main-card">
            <motion.div
              className="song-card hero-banner"
              initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.03, ease: 'easeOut' }}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => play(newSongs, 0)}
            >
              <div
                className="hero-banner-bg"
                style={{ backgroundImage: `url(${getSongCoverUrl(newSongs[0], 300)})` }}
              />
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1 }} />
              <div className="hero-banner-content">
                <div className="hero-banner-text">
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--color-text-on-dark-faint)', marginBottom: 2 }}>猜你喜欢</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#ffffff', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{newSongs[0].name}</div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-on-dark-dim)', marginTop: 4 }}>
                    <span className="md-text-link" onClick={artistLink(newSongs[0], onNavigate)}>{newSongs[0].artist}</span>
                  </div>
                  <button className="hero-play-btn" onClick={(e) => { e.stopPropagation(); play(newSongs, 0); }}>
                    <IconPlay size={18} />
                  </button>
                </div>
                <div className="hero-banner-cover">
                  <img src={getSongCoverUrl(newSongs[0], 300)} alt={newSongs[0].name} loading="lazy" decoding="async" />
                </div>
              </div>
            </motion.div>
          </div>
        )}
        {smallCards}
      </div>
    </section>
  );
}

/* ================= 模块：你的歌单宝藏库 ================= */

export function PlaylistTreasureModule({ config, editing, onNavigate }: ModuleComponentProps) {
  const { recommendations, isLoading } = useHomeStore();
  const { sizeOf, cycleSize } = useCardSizes(config);
  const count = config.props.count ?? 6;
  const columns = config.props.columns ?? 6;
  const layout = config.props.layout ?? 'grid';
  const items = recommendations.slice(0, count);

  const body = () => {
    if (isLoading) {
      return layout === 'scroll'
        ? <HScrollRow>{Array.from({ length: 6 }).map((_, i) => <div key={i} className="scroll-cell"><Skeleton width="100%" height={160} borderRadius={12} /></div>)}</HScrollRow>
        : <div className="mod-grid" style={gridStyle(columns)}>{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} width="100%" height={160} borderRadius={12} />)}</div>;
    }
    if (items.length === 0) {
      return editing ? <ModuleGhost /> : null;
    }
    const shown = snapSlice(items, count, columns, config.props.snapRow);
    const cards = shown.map((rec) => (
      <PlaylistCard
        key={rec.id}
        name={rec.name}
        cover={rec.cover ? api.getProxyImageUrl(rec.cover) : ''}
        trackCount={rec.trackCount}
        size={sizeOf(rec.id)}
        ratio={config.props.ratio}
        chip={sizeChipOf(editing, sizeOf, cycleSize, rec.id)}
        onClick={() => onNavigate?.({ page: 'playlist', id: rec.id, source: 'tencent' })}
      />
    ));
    return layout === 'scroll'
      ? <HScrollRow>{shown.map((rec, i) => <div className={cellClass(sizeOf(rec.id))} key={rec.id}>{cards[i]}</div>)}</HScrollRow>
      : <div className="mod-grid" style={gridStyle(columns)}>{cards}</div>;
  };

  return (
    <section>
      <SectionHead config={config} fallbackTitle="你的歌单宝藏库" />
      {body()}
    </section>
  );
}

/* ================= 模块：随时随地，停不下来（排行榜） ================= */

export function ToplistsModule({ config, editing, onNavigate }: ModuleComponentProps) {
  const { toplists, isLoading, getToplistSongs } = useHomeStore();
  const setQueue = usePlaybackStore((s) => s.setQueue);
  const { showToast } = useToastStore();
  const { sizeOf, cycleSize } = useCardSizes(config);
  const count = config.props.count ?? 6;
  const columns = config.props.columns ?? 6;
  const layout = config.props.layout ?? 'grid';
  const items = toplists.slice(0, count);

  const handlePlay = useCallback(async (id: string, name: string) => {
    showToast(`正在加载「${name}」...`);
    const songs = await getToplistSongs(id);
    if (songs.length) {
      setQueue(songs, 0);
      showToast(`正在播放: ${songs[0]?.name}`, 'success');
    } else {
      showToast('榜单加载失败，请稍后再试', 'error');
    }
  }, [getToplistSongs, setQueue, showToast]);

  const body = () => {
    if (isLoading) {
      return layout === 'scroll'
        ? <HScrollRow>{Array.from({ length: 6 }).map((_, i) => <div key={i} className="scroll-cell"><Skeleton width="100%" height={160} borderRadius={12} /></div>)}</HScrollRow>
        : <div className="mod-grid" style={gridStyle(columns)}>{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} width="100%" height={160} borderRadius={12} />)}</div>;
    }
    if (items.length === 0) {
      return editing ? <ModuleGhost /> : null;
    }
    const cards = items.map((top) => {
      const size = sizeOf(top.id);
      const coverUrl = top.cover ? api.getProxyImageUrl(top.cover) : '';
      const firstSong = (top.songs ?? [])[0];

      // 2×1 横排卡：左方封面 + 右榜名与首歌曲信息
      if (size === 'w') {
        return (
          <motion.div
            key={top.id}
            className="song-card card-wide"
            style={{ cursor: 'pointer', gridColumn: 'span 2', height: 'calc(var(--c, 190px) + 52px)' }}
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onNavigate?.({ page: 'playlist', id: top.id, source: 'toplist' })}
          >
            <div className="wide-cover" style={{ height: 'calc(var(--c, 190px) + 28px)', width: 'calc(var(--c, 190px) + 28px)' }}>
              {coverUrl ? (
                <img src={coverUrl} alt={top.name} className="card-image" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              ) : (
                <div className="mini-cover-fallback"><IconMusic size={24} /></div>
              )}
              <div className="play-overlay">
                <IconPlay size={26} />
              </div>
              {sizeChipOf(editing, sizeOf, cycleSize, top.id)}
            </div>
            <div className="wide-body">
              <div className="wide-name">{top.name}</div>
              <div className="wide-sub">
                {firstSong ? <><IconPlay size={10} /> {firstSong.name} · {firstSong.artist}</> : 'Top Charts'}
              </div>
            </div>
          </motion.div>
        );
      }

  // 1×2 竖版卡：整卡模糊封面氛围底 + 底部（小封面 + 榜名）
      if (size === 't') {
        return (
          <motion.div
            key={top.id}
            className="song-card span-1x2"
            style={{ cursor: 'pointer', gridRow: 'span 2', height: 'calc(2 * (var(--c, 190px) + 52px) + var(--hm-row-gap, 16px))', ...spanStyle(size) }}
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onNavigate?.({ page: 'playlist', id: top.id, source: 'toplist' })}
          >
            {coverUrl ? (
              <>
                <div className="tall-blur" style={{ backgroundImage: `url(${coverUrl})` }} />
                <div className="tall-scrim" />
              </>
            ) : (
              <div className="tall-blur tall-blur-flat" />
            )}
            <button
              className="tall-play"
              onClick={(e) => { e.stopPropagation(); void handlePlay(top.id, top.name); }}
              aria-label={`播放${top.name}`}
              title={`播放${top.name}`}
            >
              <IconPlay size={22} />
            </button>
            <div className="tall-bottom">
              <div className="tall-thumb">
                {coverUrl ? (
                  <img src={coverUrl} alt={top.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                ) : (
                  <div className="mini-cover-fallback"><IconMusic size={22} /></div>
                )}
              </div>
              <div className="tall-text">
                <div className="tall-name">{top.name}</div>
                <div className="tall-sub">Top Charts</div>
              </div>
            </div>
            {sizeChipOf(editing, sizeOf, cycleSize, top.id)}
          </motion.div>
        );
      }

      // 1×1 方形 / 2×2 海报
      return (
        <motion.div
          key={top.id}
          className={`song-card${size === 'l' ? ' span-2x2' : ''}`}
          style={{ cursor: 'pointer', height: size === 'l' ? POSTER_H : undefined, ...(spanStyle(size) ?? {}) }}
          whileHover={{ y: -4 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onNavigate?.({ page: 'playlist', id: top.id, source: 'toplist' })}
        >
          <div className={`card-container${size === 'l' ? ' fill' : ''}`} style={size === 'l' ? { width: '100%' } : { width: '100%', aspectRatio: coverAspect(size, config.props.ratio), borderRadius: 12, marginBottom: 12 }}>
            {top.cover && (
              <img src={coverUrl} alt={top.name} className="card-image" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            )}
            <div className="play-overlay" style={{ borderRadius: 12 }}>
              <IconPlay size={36} />
            </div>
            {sizeChipOf(editing, sizeOf, cycleSize, top.id)}
            {size === 'l' && (
              <div className="poster-info">
                <div className="poster-name">{top.name}</div>
                <div className="poster-sub">Top Charts</div>
              </div>
            )}
          </div>
          {size !== 'l' && (
            <div className="card-text">
              <div className="card-name">{top.name}</div>
              <div className="card-sub">Top Charts</div>
            </div>
          )}
        </motion.div>
      );
    });
    return layout === 'scroll'
      ? <HScrollRow>{items.map((top, i) => <div className={cellClass(sizeOf(top.id))} key={top.id}>{cards[i]}</div>)}</HScrollRow>
      : <div className="mod-grid" style={gridStyle(columns)}>{cards}</div>;
  };

  return (
    <section>
      <SectionHead config={config} fallbackTitle="随时随地，停不下来" />
      {body()}
    </section>
  );
}

/* ================= 模块：听「热门新歌」也会喜欢 ================= */

export function NewSongsModule({ config, editing, onNavigate }: ModuleComponentProps) {
  const { newSongs, isLoading } = useHomeStore();
  const play = usePlaySongs();
  const count = config.props.count ?? 9;
  const columns = config.props.columns ?? 3;
  const items = newSongs.slice(6, 6 + count);

  if (isLoading && newSongs.length === 0) {
    return (
      <section>
        <SectionHead config={config} fallbackTitle="听「热门新歌」也会喜欢" />
        <div className="track-grid" style={gridStyle(columns)}>
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: 12 }}>
              <Skeleton width={56} height={56} borderRadius={8} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
                <Skeleton width="80%" height={14} borderRadius={4} />
                <Skeleton width="40%" height={12} borderRadius={4} />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }
  if (items.length === 0) {
    return editing ? <ModuleGhost /> : null;
  }

  return (
    <section>
      <SectionHead config={config} fallbackTitle="听「热门新歌」也会喜欢" />
      <div className="track-grid" style={gridStyle(columns)}>
        {items.map((song, index) => (
          <motion.div
            key={song.id}
            className="track-item-card"
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '8px',
              borderRadius: 12, cursor: 'pointer', transition: 'background 0.2s',
            }}
            initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: index * 0.03, ease: 'easeOut' }}
            whileHover={{ background: 'var(--color-surface-hover)' }}
            whileTap={{ scale: 0.95 }}
            onClick={() => play(newSongs, index + 6)}
          >
            <div className="card-container" style={{ width: 56, height: 56, borderRadius: 8, flexShrink: 0 }}>
              <img
                src={getSongCoverUrl(song, 150)}
                alt={song.name}
                className="card-image"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                loading="lazy"
                decoding="async"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <div className="play-overlay" style={{ borderRadius: 8 }}>
                <IconPlay size={24} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, justifyContent: 'center' }}>
              <div style={{ fontSize: 14.5, fontWeight: 650, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.name}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-faint)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <span className="md-text-link" onClick={artistLink(song, onNavigate)}>{song.artist}</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ================= 模块：根据你爱的歌曲推荐 ================= */

export function LovedRecommendModule({ config, editing, onNavigate }: ModuleComponentProps) {
  const { recommendations, isLoading } = useHomeStore();
  const { sizeOf, cycleSize } = useCardSizes(config);
  const count = config.props.count ?? 6;
  const columns = config.props.columns ?? 6;
  const layout = config.props.layout ?? 'grid';
  const items = recommendations.slice(6, 6 + count);

  const body = () => {
    if (isLoading) return null;
    if (items.length === 0) {
      return editing ? <ModuleGhost /> : null;
    }
    const shown = snapSlice(items, count, columns, config.props.snapRow);
    const cards = shown.map((rec) => (
      <motion.div
        key={rec.id}
        className="song-card"
        style={{ cursor: 'pointer', ...spanStyle(sizeOf(rec.id)) }}
        whileHover={{ y: -4 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => onNavigate?.({ page: 'playlist', id: rec.id, source: 'tencent' })}
      >
        <div
          className={`card-container${sizeOf(rec.id) === 'l' ? ' fill' : ''}`}
          style={sizeOf(rec.id) === 'l' ? undefined : { width: '100%', aspectRatio: coverAspect(sizeOf(rec.id), config.props.ratio), borderRadius: 12, marginBottom: 12 }}
        >
          {rec.cover && (
            <img src={api.getProxyImageUrl(rec.cover)} alt={rec.name} className="card-image" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          )}
          <div className="play-overlay" style={{ borderRadius: 12 }}>
            <IconPlay size={36} />
          </div>
          {sizeChipOf(editing, sizeOf, cycleSize, rec.id)}
          {sizeOf(rec.id) === 'l' && (
            <div className="poster-info">
              <div className="poster-name">{rec.name}</div>
            </div>
          )}
        </div>
        {sizeOf(rec.id) !== 'l' && (
          <div style={{ fontSize: 14.5, fontWeight: 650, color: 'var(--color-text)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4 }}>{rec.name}</div>
        )}
      </motion.div>
    ));
    return layout === 'scroll'
      ? <HScrollRow>{shown.map((rec, i) => <div className={cellClass(sizeOf(rec.id))} key={rec.id}>{cards[i]}</div>)}</HScrollRow>
      : <div className="mod-grid" style={gridStyle(columns)}>{cards}</div>;
  };

  return (
    <section>
      <SectionHead config={config} fallbackTitle="根据你爱的歌曲推荐" />
      {body()}
    </section>
  );
}

/* ================= 模块：快捷入口磁贴 ================= */

interface QuickTile {
  key: string;
  name: string;
  sub: string;
  cover?: string;
  icon: ReactNode;
  onOpen: () => void;
  onPlay: (e: MouseEvent) => void;
}

export function QuickAccessModule({ config, editing, onNavigate }: ModuleComponentProps) {
  const { toplists, newSongs, getToplistSongs, isLoading } = useHomeStore();
  const customTiles = useHomeLayoutStore((s) => s.customTiles);
  const removeCustomTile = useHomeLayoutStore((s) => s.removeCustomTile);
  const addCustomTile = useHomeLayoutStore((s) => s.addCustomTile);
  const play = usePlaySongs();
  const { showToast } = useToastStore();
  const favoriteCount = useFavoriteStore((s) => s.favoriteIds.length);
  const lastPlayed = useHistoryStore((s) => s.entries[0]?.song);
  const localTotal = useLocalLibraryStore((s) => s.totalCount);
  const count = config.props.count ?? 8;
  const columns = config.props.columns ?? 4;
  const tileStyle = config.props.tileStyle ?? 'compact';
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPos, setPickerPos] = useState({ x: 0, y: 0 });
  const addTileRef = useRef<HTMLDivElement>(null);
  const libraries = useCustomLibraryStore((s) => s.libraries);

  const pinnedToplists = useMemo(() => {
    const prefer = ['热歌', '飙升', '新歌', '流行指数'];
    const found: { id: string; name: string; cover: string; updateKey?: string }[] = [];
    for (const p of prefer) {
      const t = toplists.find((x: { name: string; id: string }) => x.name.includes(p) && !found.some((f) => f.id === x.id));
      if (t) found.push({ id: String(t.id), name: String(t.name), cover: String(t.cover ?? ''), updateKey: (t as { updateKey?: string }).updateKey });
    }
    return found;
  }, [toplists]);

  const handlePlayToplist = useCallback(async (top: { id: string; name: string }) => {
    showToast(`正在加载「${top.name}」...`);
    const songs = await getToplistSongs(top.id);
    if (songs.length) play(songs, 0);
    else showToast('榜单加载失败，请稍后再试', 'error');
  }, [getToplistSongs, play, showToast]);

  const tiles = useMemo<QuickTile[]>(() => {
    const list: QuickTile[] = [
      {
        key: 'liked',
        name: '我喜欢的音乐',
        sub: favoriteCount > 0 ? `${favoriteCount} 首` : '暂无收藏',
        icon: <IconHeartTint />,
        onOpen: () => onNavigate?.({ page: 'favorites' }),
        onPlay: (e) => {
          e.stopPropagation();
          const favs = useFavoriteStore.getState().getFavorites();
          if (favs.length) play(favs, 0);
          else showToast('还没有收藏的歌曲，听到喜欢的记得点红心', 'info');
        },
      },
      {
        key: 'daily',
        name: '每日新歌',
        sub: '每天更新',
        cover: newSongs[0] ? getSongCoverUrl(newSongs[0], 300) : undefined,
        icon: <IconZapTint />,
        onOpen: () => play(newSongs, 0),
        onPlay: (e) => { e.stopPropagation(); play(newSongs, 0); },
      },
      {
        key: 'recent',
        name: '最近播放',
        sub: lastPlayed ? lastPlayed.name : '从上次继续',
        cover: lastPlayed ? getSongCoverUrl(lastPlayed, 300) : undefined,
        icon: <IconClockTint />,
        onOpen: () => onNavigate?.({ page: 'history' }),
        onPlay: (e) => {
          e.stopPropagation();
          const songs = useHistoryStore.getState().entries.map((en) => en.song);
          if (songs.length) play(songs, 0);
          else showToast('暂无播放记录', 'info');
        },
      },
      {
        key: 'local',
        name: '本地音乐',
        sub: localTotal > 0 ? `${localTotal} 首` : '你的曲库',
        icon: <IconDiscTint />,
        onOpen: () => onNavigate?.({ page: 'local-library' }),
        onPlay: (e) => {
          e.stopPropagation();
          const songs = useLocalLibraryStore.getState().songs;
          if (songs.length) play(songs, 0);
          else showToast('本地曲库为空，先到「本地音乐」导入歌曲吧', 'info');
        },
      },
    ];
    for (const top of pinnedToplists) {
      list.push({
        key: `top-${top.id}`,
        name: top.name,
        sub: top.updateKey || '实时更新',
        cover: top.cover ? api.getProxyImageUrl(top.cover) : undefined,
        icon: <IconMusicTint />,
        onOpen: () => onNavigate?.({ page: 'playlist', id: top.id, source: 'toplist' }),
        onPlay: (e) => { e.stopPropagation(); void handlePlayToplist(top); },
      });
    }
    // 用户自定义磁贴（钉我的音乐库 / 常用页面）
    for (const t of customTiles) {
      const lib = t.page === 'custom-library' && t.libId
        ? useCustomLibraryStore.getState().libraries.find((l) => l.id === t.libId)
        : undefined;
      // 下载列表不是路由页，而是全局面板 → 特殊处理
      const isDownloads = t.page === 'downloads';
      list.push({
        key: t.id,
        name: t.label,
        sub: lib ? `${lib.songs.length} 首` : '页面入口',
        cover: t.cover || (lib ? getLibraryCoverUrl(lib, 300) : undefined),
        icon: <IconMusicTint />,
        onOpen: () => {
          if (isDownloads) {
            useUIStore.getState().setDownloadPanelOpen(true);
            return;
          }
          onNavigate?.(t.page === 'custom-library' ? { page: t.page, id: t.libId, name: t.label } : { page: t.page });
        },
        onPlay: (e) => {
          e.stopPropagation();
          if (isDownloads) {
            useUIStore.getState().setDownloadPanelOpen(true);
            return;
          }
          if (lib) {
            if (lib.songs.length) play(lib.songs, 0);
            else showToast(`「${lib.name}」还是空的`, 'info');
          } else if (t.page === 'favorites') {
            const favs = useFavoriteStore.getState().getFavorites();
            if (favs.length) play(favs, 0); else showToast('还没有收藏的歌曲', 'info');
          } else if (t.page === 'history') {
            const songs = useHistoryStore.getState().entries.map((en) => en.song);
            if (songs.length) play(songs, 0); else showToast('暂无播放记录', 'info');
          } else if (t.page === 'local-library') {
            const songs = useLocalLibraryStore.getState().songs;
            if (songs.length) play(songs, 0); else showToast('本地曲库为空', 'info');
          } else {
            showToast('这个磁贴是页面入口', 'info');
          }
        },
      });
    }
    return list;
  }, [favoriteCount, newSongs, lastPlayed, localTotal, pinnedToplists, customTiles, onNavigate, play, handlePlayToplist, showToast]);

  if (isLoading && newSongs.length === 0 && toplists.length === 0) {
    return (
      <section>
        <SectionHead config={config} fallbackTitle="快捷入口" />
              <div className="quick-grid" style={gridStyle(columns)}>
          {Array.from({ length: Math.min(count, 8) }).map((_, i) => <Skeleton key={i} width="100%" height={84} borderRadius={14} />)}
        </div>
      </section>
    );
  }

  const builtin = tiles.filter((t) => !t.key.startsWith('ct-')).slice(0, count);
  const customs = tiles.filter((t) => t.key.startsWith('ct-'));
  const shown = [...builtin, ...customs];
  if (shown.length === 0 && !editing) {
    return null;
  }

  const renderRemove = (tile: QuickTile) =>
    editing && tile.key.startsWith('ct-') ? (
      <button
        className="tile-remove"
        onClick={(e) => { e.stopPropagation(); removeCustomTile(tile.key); }}
        aria-label={`移除磁贴 ${tile.name}`}
        title="移除这个磁贴"
      >
        ×
      </button>
    ) : undefined;

  const renderAddTile = () =>
    editing ? (
      <div
        className="quick-tile tile-add"
        ref={addTileRef}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPickerPos({
            x: Math.max(8, Math.min(r.left, window.innerWidth - 260)),
            y: Math.max(8, Math.min(r.bottom + 8, window.innerHeight - 340)),
          });
          setPickerOpen((v) => !v);
        }}
        title="添加磁贴"
      >
        <div className="tile-art tile-add-art">+</div>
        <div className="tile-text">
          <div className="tile-name">添加磁贴</div>
          <div className="tile-sub">把音乐库或常用页面钉到主页</div>
        </div>
      </div>
    ) : null;

  // 弹层用 fixed 定位渲染在磁贴外部，逃出磁贴与模块边界的 overflow 裁切
  const renderPicker = () =>
    pickerOpen && editing ? (
      <>
        <div className="tile-picker-catch" onClick={() => setPickerOpen(false)} />
        <div
          className="tile-picker"
          style={{ position: 'fixed', left: pickerPos.x, top: pickerPos.y, zIndex: 999, pointerEvents: 'auto' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="tile-picker-title">选择要钉到主页的内容</div>
          {libraries.length > 0 && <div className="tile-picker-group">我的音乐库</div>}
          {libraries.map((lib) => {
            const cover = getLibraryCoverUrl(lib, 150);
            return (
              <button
                key={lib.id}
                className="tile-picker-item"
                onClick={() => { addCustomTile({ label: lib.name, page: 'custom-library', libId: lib.id, cover: cover || undefined }); setPickerOpen(false); }}
              >
                {cover ? <img src={cover} alt="" /> : <span className="tile-picker-dot" />}
                <span>{lib.name}</span>
              </button>
            );
          })}
          <div className="tile-picker-group">常用页面</div>
          {([
            { label: '收藏的音乐', page: 'favorites', icon: <IconHeartTint /> },
            { label: '最近播放', page: 'history', icon: <IconClockTint /> },
            { label: '本地音乐', page: 'local-library', icon: <IconDiscTint /> },
            { label: '发现页', page: 'search', icon: <IconSearchTint /> },
            { label: '下载列表', page: 'downloads', icon: <IconDownloadTint /> },
          ] as { label: string; page: string; icon: ReactNode }[]).map((t) => (
            <button key={t.page} className="tile-picker-item" onClick={() => { addCustomTile(t); setPickerOpen(false); }}>
              <span className="tile-picker-icon">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </>
    ) : null;

  return (
    <section>
      <SectionHead config={config} fallbackTitle="快捷入口" />
      {tileStyle === 'large' ? (
        <div className="quick-grid large" style={gridStyle(columns)}>
          {shown.map((tile) => (
            <motion.div
              key={tile.key}
              className={`quick-tile-lg${tile.cover ? '' : ' flat'}`}
              style={tile.cover ? { backgroundImage: `url(${tile.cover})` } : undefined}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.97 }}
              onClick={tile.onOpen}
              title={tile.name}
            >
              {tile.cover && <div className="quick-tile-lg-scrim" />}
              {!tile.cover && <div className="quick-tile-lg-icon">{tile.icon}</div>}
              <div className="quick-tile-lg-text">
                <div className="lg-name">{tile.name}</div>
                <div className="lg-sub">{tile.sub}</div>
              </div>
              {renderRemove(tile)}
              <button className="tile-play" onClick={tile.onPlay} aria-label={`播放${tile.name}`} title={`播放${tile.name}`}>
                <span className="tp-chevron"><IconChevron size={13} dir="right" /></span>
                <span className="tp-play"><IconPlay size={14} /></span>
              </button>
            </motion.div>
          ))}
          {renderAddTile()}
        </div>
      ) : (
        <div className="quick-grid" style={gridStyle(columns)}>
          {shown.map((tile) => (
            <motion.div
              key={tile.key}
              className="quick-tile"
              whileTap={{ scale: 0.98 }}
              onClick={tile.onOpen}
              title={tile.name}
            >
              <div className="tile-art">
                {tile.cover ? <img src={tile.cover} alt="" loading="lazy" decoding="async" /> : tile.icon}
              </div>
              <div className="tile-text">
                <div className="tile-name">{tile.name}</div>
                <div className="tile-sub">{tile.sub}</div>
              </div>
              {renderRemove(tile)}
              <button className="tile-play" onClick={tile.onPlay} aria-label={`播放${tile.name}`} title={`播放${tile.name}`}>
                <span className="tp-chevron"><IconChevron size={13} dir="right" /></span>
                <span className="tp-play"><IconPlay size={13} /></span>
              </button>
            </motion.div>
          ))}
          {renderAddTile()}
        </div>
      )}
      {renderPicker()}
    </section>
  );
}

/* ================= 模块：最近播放 ================= */

export function RecentPlayModule({ config, editing, onNavigate }: ModuleComponentProps) {
  const entries = useHistoryStore((s) => s.entries);
  const songs = useMemo(() => entries.map((e) => e.song), [entries]);
  const count = config.props.count ?? 6;
  const layout = config.props.layout ?? 'scroll';

  return (
    <section>
      <SectionHead config={config} fallbackTitle="最近播放" hint={songs.length > 0 ? `${songs.length} 首` : undefined} />
      <SongShelfBody songs={songs} count={count} columns={config.props.columns} layout={layout} editing={editing} config={config} onNavigate={onNavigate} emptyHint="还没有播放记录，去听首歌吧" />
    </section>
  );
}

/* ================= 模块：搜索框 ================= */

export function SearchBarModule({ config, onNavigate }: ModuleComponentProps) {
  const { showToast } = useToastStore();
  const [value, setValue] = useState('');
  const submit = () => {
    const k = value.trim();
    if (!k) {
      showToast('先输入想搜的歌 / 歌手 / 专辑', 'info');
      return;
    }
    void useSearchStore.getState().search(k);
    onNavigate?.({ page: 'search', keyword: k });
  };
  if (config.props.showTitle === false) {
    return (
      <section>
        <div className="home-searchbar">
          <IconSearch />
          <input
            value={value}
            placeholder="搜索歌曲、歌手、专辑…"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
          <button className="home-searchbar-btn" onClick={submit}>搜索</button>
        </div>
      </section>
    );
  }
  return (
    <section>
      <SectionHead config={config} fallbackTitle="搜索" />
      <div className="home-searchbar">
        <IconSearch />
        <input
          value={value}
          placeholder="搜索歌曲、歌手、专辑…"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        />
        <button className="home-searchbar-btn" onClick={submit}>搜索</button>
      </div>
    </section>
  );
}

/* ================= 模块：我的音乐库 ================= */

function LibraryCard({ name, cover, songCount, size = 's', ratio, chip, onClick, onPlay }: {
  name: string; cover: string; songCount: number; size?: CardSize; ratio?: CoverRatio; chip?: ReactNode;
  onClick: () => void; onPlay: (e: MouseEvent) => void;
}) {
  const poster = size === 'l';
  // 2×1 横排卡：左方封面 + 右库名与歌曲数
  if (size === 'w') {
    return (
      <motion.div
        className="song-card card-wide"
        style={{ cursor: 'pointer', gridColumn: 'span 2' }}
        whileHover={{ y: -4 }}
        whileTap={{ scale: 0.98 }}
        onClick={onClick}
      >
        <div className="wide-cover">
          {cover ? (
            <img src={cover} alt={name} className="card-image" loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          ) : (
            <div className="mini-cover-fallback"><IconMusic size={24} /></div>
          )}
          <div className="play-overlay">
            <IconPlay size={26} />
          </div>
          {chip}
        </div>
        <div className="wide-body">
          <div className="wide-name">{name}</div>
          <div className="wide-sub">{songCount} 首</div>
        </div>
      </motion.div>
    );
  }
  // 1×2 竖版卡：整卡模糊封面氛围底 + 顶部方形封面 + 底部文字（任何图片来源都不会露白底）
  if (size === 't') {
    return (
      <motion.div
        className="song-card lib-card span-1x2"
        style={{ cursor: 'pointer', gridRow: 'span 2', height: 'calc(2 * (var(--c, 190px) + 52px) + var(--hm-row-gap, 16px))', ...spanStyle(size) }}
        whileHover={{ y: -4 }}
        whileTap={{ scale: 0.98 }}
        onClick={onClick}
      >
        {cover ? (
          <>
            <div className="tall-blur" style={{ backgroundImage: `url(${cover})` }} />
            <div className="tall-scrim" />
          </>
        ) : (
          <div className="tall-blur tall-blur-flat" />
        )}
        <button
          className="tall-play"
          onClick={(e) => { e.stopPropagation(); onPlay(e); }}
          aria-label={`播放${name}`}
          title={`播放「${name}」`}
        >
          <IconPlay size={22} />
        </button>
        <div className="tall-bottom">
          <div className="tall-thumb">
            {cover ? (
              <img src={cover} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            ) : (
              <div className="mini-cover-fallback"><IconMusic size={22} /></div>
            )}
          </div>
          <div className="tall-text">
            <div className="tall-name">{name}</div>
            <div className="tall-sub">{songCount} 首</div>
          </div>
        </div>
        {chip}
      </motion.div>
    );
  }
  return (
    <motion.div
      className={`song-card lib-card${poster ? ' span-2x2' : ''}`}
      style={{ cursor: 'pointer', height: poster ? POSTER_H : undefined, ...(poster ? {} : spanStyle(size)) }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
    >
      <div className={`card-container${poster ? ' fill' : ''}`} style={poster ? { width: '100%' } : { width: '100%', aspectRatio: coverAspect(size, ratio), borderRadius: 12, marginBottom: 12 }}>
        {cover ? (
          <img src={cover} alt={name} className="card-image" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        ) : (
          <div className="mini-cover-fallback"><IconMusic size={26} /></div>
        )}
        <div className="play-overlay" style={{ borderRadius: 12 }}>
          <IconPlay size={36} />
        </div>
        <button className="play-fab" onClick={onPlay} aria-label={`播放${name}`} title={`播放「${name}」`}>
          <IconPlay size={15} />
        </button>
        {chip}
        {poster && (
          <div className="poster-info">
            <div className="poster-name">{name}</div>
            <div className="poster-sub">{songCount} 首</div>
          </div>
        )}
      </div>
      {!poster && (
        <div className="card-text">
          <div className="card-name">{name}</div>
          <div className="card-sub">{songCount} 首</div>
        </div>
      )}
    </motion.div>
  );
}

export function LibraryShelfModule({ config, editing, onNavigate }: ModuleComponentProps) {
  const libraries = useCustomLibraryStore((s) => s.libraries);
  const setQueue = usePlaybackStore((s) => s.setQueue);
  const { showToast } = useToastStore();
  const { sizeOf, cycleSize } = useCardSizes(config);
  const count = config.props.count ?? 6;
  const columns = config.props.columns ?? 6;
  const layout = config.props.layout ?? 'grid';
  const items = snapSlice(libraries, count, columns, config.props.snapRow);

  const body = () => {
    if (items.length === 0) {
      return editing ? <ModuleGhost label="还没有自建音乐库，到左侧「新建音乐库」创建后就会出现在这里" /> : null;
    }
    const card = (lib: typeof libraries[number]) => (
      <LibraryCard
        key={lib.id}
        name={lib.name}
        cover={getLibraryCoverUrl(lib, 300)}
        songCount={lib.songs.length}
        size={sizeOf(lib.id)}
        ratio={config.props.ratio}
        chip={sizeChipOf(editing, sizeOf, cycleSize, lib.id)}
        onClick={() => onNavigate?.({ page: 'custom-library', id: lib.id, name: lib.name })}
        onPlay={(e) => {
          e.stopPropagation();
          if (lib.songs.length) {
            setQueue(lib.songs, 0);
            showToast(`正在播放: ${lib.songs[0]?.name}`, 'success');
          } else {
            showToast('这个库还是空的', 'info');
          }
        }}
      />
    );
    if (layout === 'scroll') {
      return <HScrollRow>{items.map((lib) => <div className={cellClass(sizeOf(lib.id))} key={lib.id}>{card(lib)}</div>)}</HScrollRow>;
    }
    return <div className="mod-grid" style={gridStyle(columns)}>{items.map((lib) => card(lib))}</div>;
  };

  return (
    <section>
      <SectionHead config={config} fallbackTitle="我的音乐库" hint={libraries.length > 0 ? `${libraries.length} 个库` : undefined} />
      {body()}
    </section>
  );
}

/* ================= 模块：我喜欢的音乐 ================= */

export function FavoriteShelfModule({ config, editing, onNavigate }: ModuleComponentProps) {
  const favoriteCount = useFavoriteStore((s) => s.favoriteIds.length);
  const songs = useMemo(() => useFavoriteStore.getState().getFavorites(), [favoriteCount]);
  const count = config.props.count ?? 6;
  const layout = config.props.layout ?? 'scroll';

  return (
    <section>
      <SectionHead config={config} fallbackTitle="我喜欢的音乐" hint={favoriteCount > 0 ? `${favoriteCount} 首` : undefined} />
      <SongShelfBody songs={songs} count={count} columns={config.props.columns} layout={layout} editing={editing} config={config} onNavigate={onNavigate} emptyHint="还没有收藏的歌曲，听到喜欢的记得点红心" />
    </section>
  );
}

/* ================= 模块：最常播放 ================= */

export function MostPlayedModule({ config, editing, onNavigate }: ModuleComponentProps) {
  const entries = useHistoryStore((s) => s.entries);
  const songs = useMemo(
    () => [...entries].sort((a, b) => b.playCount - a.playCount).map((e) => e.song),
    [entries]
  );
  const count = config.props.count ?? 6;
  const layout = config.props.layout ?? 'grid';

  return (
    <section>
      <SectionHead config={config} fallbackTitle="最常播放" hint={songs.length > 0 ? '按播放次数排序' : undefined} />
      <SongShelfBody songs={songs} count={count} columns={config.props.columns} layout={layout} editing={editing} config={config} onNavigate={onNavigate} emptyHint="还没有播放记录，去听首歌吧" />
    </section>
  );
}

/* ================= 模块：本地音乐 ================= */

export function LocalShelfModule({ config, editing, onNavigate }: ModuleComponentProps) {
  const songs = useLocalLibraryStore((s) => s.songs);
  const totalCount = useLocalLibraryStore((s) => s.totalCount);
  const loading = useLocalLibraryStore((s) => s.loading);
  const loadSongs = useLocalLibraryStore((s) => s.loadSongs);
  const count = config.props.count ?? 6;
  const layout = config.props.layout ?? 'grid';

  // 进入主页时若本地曲库未加载则拉取一次（静默，失败不提示）
  useEffect(() => {
    if (songs.length === 0 && totalCount > 0 && !loading) {
      void loadSongs();
    }
  }, [songs.length, totalCount, loading, loadSongs]);

  return (
    <section>
      <SectionHead config={config} fallbackTitle="本地音乐" hint={totalCount > 0 ? `${totalCount} 首` : undefined} />
      {loading && songs.length === 0 ? (
        <div className="mini-grid" style={gridStyle(config.props.columns)}>
          {Array.from({ length: Math.min(count, 6) }).map((_, i) => <Skeleton key={i} width="100%" height={120} borderRadius={12} />)}
        </div>
      ) : (
        <SongShelfBody songs={songs} count={count} columns={config.props.columns} layout={layout} editing={editing} config={config} onNavigate={onNavigate} emptyHint="本地曲库还是空的，到「本地音乐」页导入歌曲吧" />
      )}
    </section>
  );
}

/* ================= 模块：榜单精选（横向大卡，内嵌 Top3） ================= */

export function ToplistCardsModule({ config, editing, onNavigate }: ModuleComponentProps) {
  const { toplists, isLoading, getToplistSongs } = useHomeStore();
  const setQueue = usePlaybackStore((s) => s.setQueue);
  const { showToast } = useToastStore();
  const count = config.props.count ?? 4;
  const columns = config.props.columns ?? 4;
  const items = toplists.slice(0, count);

  const handlePlay = useCallback(async (id: string, name: string) => {
    showToast(`正在加载「${name}」...`);
    const songs = await getToplistSongs(id);
    if (songs.length) {
      setQueue(songs, 0);
      showToast(`正在播放: ${songs[0]?.name}`, 'success');
    } else {
      showToast('榜单加载失败，请稍后再试', 'error');
    }
  }, [getToplistSongs, setQueue, showToast]);

  const body = () => {
    if (isLoading) {
      return (
        <div className="tcard-grid" style={gridStyle(columns)}>
          {Array.from({ length: Math.min(count, 4) }).map((_, i) => <Skeleton key={i} width="100%" height={252} borderRadius={16} />)}
        </div>
      );
    }
    if (items.length === 0) {
      return editing ? <ModuleGhost /> : null;
    }
    return (
      <div className="tcard-grid" style={gridStyle(columns)}>
        {items.map((top) => (
          <motion.div
            key={top.id}
            className="tcard"
            onClick={() => onNavigate?.({ page: 'playlist', id: top.id, source: 'toplist' })}
            whileHover={{ y: -3 }}
            whileTap={{ scale: 0.98 }}
          >
            {top.cover && (
              <>
                <div className="tcard-bg" style={{ backgroundImage: `url(${api.getProxyImageUrl(top.cover)})` }} />
                <div className="tcard-overlay" />
              </>
            )}
            <div className="tcard-cover">
              {top.cover ? (
                <img src={api.getProxyImageUrl(top.cover)} alt={top.name} loading="lazy" decoding="async"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              ) : (
                <div className="tcard-cover-fallback"><IconMusic size={26} /></div>
              )}
            </div>
            <div className="tcard-body">
              <div className="tcard-head">
                <span className="tcard-name">{top.name}</span>
                {(top as { updateKey?: string }).updateKey && (
                  <span className="tcard-update">{(top as { updateKey?: string }).updateKey}</span>
                )}
              </div>
              <div className="tcard-songs">
                {(top.songs ?? []).slice(0, 3).map((s, i) => (
                  <div className="tcard-song" key={i}>
                    <span className={`tcard-rank tcard-rank-${i + 1}`}>{i + 1}</span>
                    <div className="tcard-song-info">
                      <span className="tcard-song-name">{s.name}</span>
                      <span className="tcard-song-artist">{s.artist}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <button
              className="tcard-play"
              onClick={(e) => { e.stopPropagation(); void handlePlay(top.id, top.name); }}
              aria-label={`播放${top.name}`}
              title={`播放${top.name}`}
            >
              <IconPlay size={14} />
            </button>
          </motion.div>
        ))}
      </div>
    );
  };

  return (
    <section>
      <SectionHead config={config} fallbackTitle="榜单精选" hint="内嵌每张榜的前 3 首" />
      {body()}
    </section>
  );
}
