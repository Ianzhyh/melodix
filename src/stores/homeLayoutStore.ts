import { create } from 'zustand';

/**
 * 主页模块化布局 store（DIY 完全体）：
 * - 模块显隐 / 排序 / 模块级设置（数量、列数、布局、比例、样式、标题、单卡尺寸、对齐整行）
 * - 页面级：模块双列排列、密度、卡片圆角、背景加深
 * - 自定义快捷磁贴（钉我的音乐库/常用页面）
 * - 一键预设（极简/发现/我的）与配置导出/导入
 * - 手动持久化到 localStorage（沿用 configStore 的 IIFE + try/catch 模式）
 * - editMode 为运行时状态，不持久化
 */

export type HomeModuleId =
  | 'search-bar'        // 搜索框
  | 'quick-access'      // 快捷入口磁贴
  | 'daily-recommend'   // 今日为你推荐（Hero）
  | 'playlist-treasure' // 你的歌单宝藏库
  | 'toplists'          // 随时随地，停不下来（排行榜）
  | 'toplist-cards'     // 榜单精选（内嵌 Top3 的大卡）
  | 'new-songs'         // 听「热门新歌」也会喜欢
  | 'loved-recommend'   // 根据你爱的歌曲推荐
  | 'recent-play'       // 最近播放
  | 'most-played'       // 最常播放
  | 'favorite-shelf'    // 我喜欢的音乐
  | 'local-shelf'       // 本地音乐
  | 'library-shelf';    // 我的音乐库（自建库货架）

/** 网格 / 横向滑动（支持两种布局的模块） */
export type HomeModuleLayout = 'grid' | 'scroll';
/** 快捷磁贴样式：小行磁贴 / 大封面磁贴 */
export type TileStyle = 'compact' | 'large';
/** 今日推荐样式：大横幅+小卡 / 仅小卡 */
export type HeroStyle = 'banner' | 'cards';
/** 封面比例（仅方形卡生效） */
export type CoverRatio = '1:1' | '4:3' | '3:4';
/** 单卡尺寸：1×1 方形 / 2×1 横宽 / 1×2 竖版 / 2×2 海报 */
export type CardSize = 's' | 'w' | 't' | 'l';
/** 页面密度 */
export type Density = 'compact' | 'standard' | 'relaxed';

export interface HomeModuleProps {
  /** 展示数量（封面数 / 行数上限） */
  count?: number;
  /** 网格列数 */
  columns?: number;
  layout?: HomeModuleLayout;
  tileStyle?: TileStyle;
  heroStyle?: HeroStyle;
  /** 封面比例（默认 1:1） */
  ratio?: CoverRatio;
  /** 自动对齐整行：展示数量取列数整数倍，保证行满 */
  snapRow?: boolean;
  /** 是否显示模块标题行 */
  showTitle?: boolean;
  /** 自定义模块标题（空则用默认标题） */
  customTitle?: string;
  /** 各卡片的尺寸覆盖，缺省 's' */
  cardSizes?: Record<string, CardSize>;
  /** @deprecated 旧版拉宽列表，加载时迁移为 cardSizes */
  wideIds?: string[];
}

export interface HomeModuleConfig {
  id: HomeModuleId;
  visible: boolean;
  props: HomeModuleProps;
}

/** 页面外观设置 */
export interface HomeAppearance {
  density: Density;
  /** 卡片圆角 px */
  radius: number;
  /** 深色模式下主页背景加深 */
  dimBg: boolean;
}

/** 自定义快捷磁贴 */
export interface CustomTile {
  id: string;
  label: string;
  /** 目标路由 page（custom-library / favorites / history / local-library / search / downloads） */
  page: string;
  /** 库 id（page 为 custom-library 时用） */
  libId?: string;
  /** 磁贴封面（库封面或第一首歌封面） */
  cover?: string;
}

/** 模块元信息（编辑模式 UI 展示用） */
export const MODULE_META: Record<HomeModuleId, { title: string; desc: string }> = {
  'search-bar': { title: '搜索框', desc: '主页直接搜索，回车出结果' },
  'quick-access': { title: '快捷入口', desc: '收藏 / 新歌 / 最近播放 / 本地音乐 / 榜单一键直达' },
  'daily-recommend': { title: '今日为你推荐', desc: '每日新歌横幅与精选小卡' },
  'playlist-treasure': { title: '你的歌单宝藏库', desc: '为你精选的在线歌单' },
  'toplists': { title: '随时随地，停不下来', desc: '官方排行榜，热度即时更新' },
  'toplist-cards': { title: '榜单精选', desc: '排行榜大卡，内嵌每张榜的前 3 首' },
  'new-songs': { title: '听「热门新歌」也会喜欢', desc: '热门新歌速递列表' },
  'loved-recommend': { title: '根据你爱的歌曲推荐', desc: '按你的口味推荐更多歌单' },
  'recent-play': { title: '最近播放', desc: '接着上次继续听' },
  'most-played': { title: '最常播放', desc: '按播放次数排序的循环单曲' },
  'favorite-shelf': { title: '我喜欢的音乐', desc: '红心收藏的歌曲墙' },
  'local-shelf': { title: '本地音乐', desc: '已导入的本地歌曲封面墙' },
  'library-shelf': { title: '我的音乐库', desc: '你自建的音乐库货架' },
};

const mk = (id: HomeModuleId, visible: boolean, props: HomeModuleProps): HomeModuleConfig => ({ id, visible, props });

export const DEFAULT_MODULES: HomeModuleConfig[] = [
  mk('daily-recommend', true, { heroStyle: 'banner', showTitle: true }),
  mk('quick-access', true, { count: 8, columns: 4, tileStyle: 'compact', showTitle: true }),
  mk('playlist-treasure', true, { count: 6, columns: 6, layout: 'grid', ratio: '1:1', showTitle: true }),
  mk('toplists', true, { count: 6, columns: 6, layout: 'grid', ratio: '1:1', showTitle: true }),
  mk('toplist-cards', true, { count: 4, columns: 2, showTitle: true }),
  mk('new-songs', true, { count: 9, columns: 3, showTitle: true }),
  mk('loved-recommend', true, { count: 6, columns: 6, layout: 'grid', ratio: '1:1', showTitle: true }),
  mk('recent-play', true, { count: 6, columns: 6, layout: 'scroll', ratio: '1:1', showTitle: true }),
  mk('most-played', false, { count: 6, columns: 6, layout: 'grid', ratio: '1:1', showTitle: true }),
  mk('favorite-shelf', true, { count: 6, columns: 6, layout: 'scroll', ratio: '1:1', showTitle: true }),
  mk('local-shelf', false, { count: 6, columns: 6, layout: 'grid', ratio: '1:1', showTitle: true }),
  mk('library-shelf', false, { count: 6, columns: 6, layout: 'grid', ratio: '1:1', showTitle: true }),
  mk('search-bar', false, { showTitle: false }),
];

const STORAGE_KEY = 'melodix-home-layout';
const LAYOUT_VERSION = 2;

export const DEFAULT_APPEARANCE: HomeAppearance = { density: 'standard', radius: 12, dimBg: false };

interface PersistedLayout {
  version: number;
  greeting: boolean;
  modules: HomeModuleConfig[];
  appearance?: HomeAppearance;
  customTiles?: CustomTile[];
  dualColumn?: boolean;
}

function persistLayout(state: {
  greeting: boolean; modules: HomeModuleConfig[]; appearance: HomeAppearance; customTiles: CustomTile[]; dualColumn: boolean;
}) {
  try {
    const data: PersistedLayout = {
      version: LAYOUT_VERSION,
      greeting: state.greeting,
      modules: state.modules,
      appearance: state.appearance,
      customTiles: state.customTiles,
      dualColumn: state.dualColumn,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

/* ---- 配置值白名单与钳制（加载/导入共用，防止非法数值破坏渲染） ---- */
const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const pickEnum = <T extends string,>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

const RATIOS: readonly CoverRatio[] = ['1:1', '4:3', '3:4'];
const LAYOUTS: readonly HomeModuleLayout[] = ['grid', 'scroll'];
const TILE_STYLES: readonly TileStyle[] = ['compact', 'large'];
const HERO_STYLES: readonly HeroStyle[] = ['banner', 'cards'];
const CARD_SIZES: readonly CardSize[] = ['s', 'w', 't', 'l'];
const DENSITIES: readonly Density[] = ['compact', 'standard', 'relaxed'];

function sanitizeProps(def: HomeModuleProps, saved?: HomeModuleProps): HomeModuleProps {
  const p: HomeModuleProps = { ...def, ...(saved || {}) };
  if (p.count !== undefined) p.count = clampInt(p.count, 2, 24, def.count ?? 6);
  if (p.columns !== undefined) p.columns = clampInt(p.columns, 1, 6, def.columns ?? 6);
  if (p.layout !== undefined) p.layout = pickEnum(p.layout, LAYOUTS, def.layout ?? 'grid');
  if (p.tileStyle !== undefined) p.tileStyle = pickEnum(p.tileStyle, TILE_STYLES, def.tileStyle ?? 'compact');
  if (p.heroStyle !== undefined) p.heroStyle = pickEnum(p.heroStyle, HERO_STYLES, def.heroStyle ?? 'banner');
  if (p.ratio !== undefined) p.ratio = pickEnum(p.ratio, RATIOS, def.ratio ?? '1:1');
  p.showTitle = p.showTitle !== false;
  p.customTitle = typeof p.customTitle === 'string' ? p.customTitle.slice(0, 30) : undefined;
  p.snapRow = p.snapRow === true;
  if (p.cardSizes && typeof p.cardSizes === 'object') {
    const sizes: Record<string, CardSize> = {};
    for (const [k, v] of Object.entries(p.cardSizes)) {
      if (CARD_SIZES.includes(v as CardSize)) sizes[k] = v as CardSize;
    }
    p.cardSizes = Object.keys(sizes).length ? sizes : undefined;
  } else {
    p.cardSizes = undefined;
  }
  // 迁移：旧版 wideIds（2×1 列表）→ cardSizes
  if (!p.cardSizes && p.wideIds?.length) {
    p.cardSizes = Object.fromEntries(p.wideIds.map((id) => [id, 'w' as const]));
  }
  delete p.wideIds;
  return p;
}

/** 兼容旧调用名：统一走 sanitizeProps（白名单 + 钳制 + 迁移） */
function normalizeProps(def: HomeModuleProps, saved?: HomeModuleProps): HomeModuleProps {
  return sanitizeProps(def, saved);
}

function sanitizeAppearance(saved: unknown): HomeAppearance {
  const a = (typeof saved === 'object' && saved ? saved : {}) as Partial<HomeAppearance>;
  return {
    density: pickEnum(a.density, DENSITIES, DEFAULT_APPEARANCE.density),
    radius: clampInt(a.radius, 6, 24, DEFAULT_APPEARANCE.radius),
    dimBg: a.dimBg === true,
  };
}

function loadLayout(): {
  greeting: boolean; modules: HomeModuleConfig[]; appearance: HomeAppearance; customTiles: CustomTile[]; dualColumn: boolean;
} {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as PersistedLayout;
      if (parsed && Array.isArray(parsed.modules)) {
        const merged: HomeModuleConfig[] = [];
        for (const m of parsed.modules) {
          const def = DEFAULT_MODULES.find((d) => d.id === m?.id);
          if (def && !merged.some((x) => x.id === m.id)) {
            merged.push({ ...def, visible: m.visible !== false, props: normalizeProps(def.props, m.props) });
          }
        }
        for (const def of DEFAULT_MODULES) {
          if (!merged.some((x) => x.id === def.id)) merged.push({ ...def, props: { ...def.props } });
        }
        return {
          greeting: parsed.greeting !== false,
          modules: merged,
          appearance: sanitizeAppearance(parsed.appearance),
          customTiles: Array.isArray(parsed.customTiles) ? parsed.customTiles.filter((t) => t && t.id && t.label && t.page) : [],
          dualColumn: parsed.dualColumn === true,
        };
      }
    }
  } catch {}
  return {
    greeting: true,
    modules: DEFAULT_MODULES.map((m) => ({ ...m, props: { ...m.props } })),
    appearance: { ...DEFAULT_APPEARANCE },
    customTiles: [],
    dualColumn: false,
  };
}

const initial = loadLayout();

interface HomeLayoutState {
  modules: HomeModuleConfig[];
  greeting: boolean;
  appearance: HomeAppearance;
  customTiles: CustomTile[];
  dualColumn: boolean;
  /** 主页编辑模式（运行时状态，不持久化） */
  editMode: boolean;
  setEditMode: (on: boolean) => void;
  toggleGreeting: () => void;
  toggleModule: (id: HomeModuleId) => void;
  addModule: (id: HomeModuleId) => void;
  /** Reorder 回调：入参为可见模块的新顺序 */
  reorderModules: (visibleIds: HomeModuleId[]) => void;
  /** 按索引移动模块（双列模式的兜底操作） */
  moveModule: (id: HomeModuleId, dir: -1 | 1) => void;
  setModuleProps: (id: HomeModuleId, patch: HomeModuleProps) => void;
  setAppearance: (patch: Partial<HomeAppearance>) => void;
  setDualColumn: (on: boolean) => void;
  addCustomTile: (tile: Omit<CustomTile, 'id'>) => void;
  removeCustomTile: (id: string) => void;
  /** 一键预设：只调整模块组合与顺序 */
  applyPreset: (name: 'minimal' | 'discover' | 'mine') => void;
  /** 导出当前配置 JSON 字符串 */
  exportLayout: () => string;
  /** 导入配置 JSON，成功返回 true */
  importLayout: (json: string) => boolean;
  resetLayout: () => void;
}

export const useHomeLayoutStore = create<HomeLayoutState>((set, get) => {
  const commit = () => {
    const s = get();
    persistLayout({ greeting: s.greeting, modules: s.modules, appearance: s.appearance, customTiles: s.customTiles, dualColumn: s.dualColumn });
  };
  return {
    modules: initial.modules,
    greeting: initial.greeting,
    appearance: initial.appearance,
    customTiles: initial.customTiles,
    dualColumn: initial.dualColumn,
    editMode: false,

    setEditMode: (on) => set({ editMode: on }),

    toggleGreeting: () => { set({ greeting: !get().greeting }); commit(); },

    toggleModule: (id) => {
      set({ modules: get().modules.map((m) => (m.id === id ? { ...m, visible: !m.visible } : m)) });
      commit();
    },

    addModule: (id) => {
      set({ modules: get().modules.map((m) => (m.id === id ? { ...m, visible: true } : m)) });
      commit();
    },

    reorderModules: (visibleIds) => {
      const visibleCfgs = get().modules.filter((m) => m.visible);
      const byId = new Map(visibleCfgs.map((m) => [m.id, m]));
      const reordered = visibleIds.map((id) => byId.get(id)).filter((m): m is HomeModuleConfig => !!m);
      if (reordered.length !== visibleCfgs.length) return;
      let vi = 0;
      set({ modules: get().modules.map((m) => (m.visible ? reordered[vi++] : m)) });
      commit();
    },

    moveModule: (id, dir) => {
      const modules = [...get().modules];
      const idx = modules.findIndex((m) => m.id === id);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= modules.length) return;
      [modules[idx], modules[target]] = [modules[target], modules[idx]];
      set({ modules });
      commit();
    },

    setModuleProps: (id, patch) => {
      set({ modules: get().modules.map((m) => (m.id === id ? { ...m, props: { ...m.props, ...patch } } : m)) });
      commit();
    },

    setAppearance: (patch) => {
      set({ appearance: { ...get().appearance, ...patch } });
      commit();
    },

    setDualColumn: (on) => { set({ dualColumn: on }); commit(); },

    addCustomTile: (tile) => {
      const id = `ct-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      set({ customTiles: [...get().customTiles, { ...tile, id }] });
      commit();
    },

    removeCustomTile: (id) => {
      set({ customTiles: get().customTiles.filter((t) => t.id !== id) });
      commit();
    },

    applyPreset: (name) => {
      const p = (id: HomeModuleId, props?: Partial<HomeModuleProps>): HomeModuleConfig => {
        const def = DEFAULT_MODULES.find((d) => d.id === id)!;
        return { id, visible: true, props: { ...def.props, ...(props || {}) } };
      };
      const hidden = (id: HomeModuleId): HomeModuleConfig => {
        const def = DEFAULT_MODULES.find((d) => d.id === id)!;
        return { ...def, visible: false, props: { ...def.props } };
      };
      let modules: HomeModuleConfig[];
      if (name === 'minimal') {
        modules = [
          p('search-bar'),
          mk('quick-access', true, { count: 4, columns: 4, tileStyle: 'compact', showTitle: false }),
          p('recent-play', { count: 12, columns: 6, layout: 'grid' }),
          p('favorite-shelf', { count: 12, columns: 6, layout: 'grid' }),
          ...DEFAULT_MODULES.filter((d) => !['search-bar', 'quick-access', 'recent-play', 'favorite-shelf'].includes(d.id)).map((d) => hidden(d.id)),
        ];
      } else if (name === 'discover') {
        modules = [
          p('daily-recommend'),
          p('playlist-treasure', { count: 12, columns: 6, layout: 'scroll' }),
          p('toplists', { count: 10, columns: 5, layout: 'scroll' }),
          p('toplist-cards'),
          p('new-songs', { count: 12 }),
          p('loved-recommend', { count: 12, columns: 6, layout: 'scroll' }),
          ...DEFAULT_MODULES.filter((d) => !['daily-recommend', 'playlist-treasure', 'toplists', 'toplist-cards', 'new-songs', 'loved-recommend'].includes(d.id)).map((d) => hidden(d.id)),
        ];
      } else {
        modules = [
          mk('quick-access', true, { count: 8, columns: 4, tileStyle: 'compact', showTitle: true }),
          p('library-shelf', { count: 6, columns: 6, layout: 'grid' }),
          p('favorite-shelf', { count: 12, columns: 6, layout: 'grid' }),
          p('recent-play', { count: 6, columns: 6, layout: 'scroll' }),
          p('most-played', { count: 6, columns: 6, layout: 'grid' }),
          p('local-shelf', { count: 6, columns: 6, layout: 'grid' }),
          ...DEFAULT_MODULES.filter((d) => !['quick-access', 'library-shelf', 'favorite-shelf', 'recent-play', 'most-played', 'local-shelf'].includes(d.id)).map((d) => hidden(d.id)),
        ];
      }
      set({ modules, greeting: true });
      commit();
    },

    exportLayout: () => {
      const s = get();
      return JSON.stringify({
        version: LAYOUT_VERSION,
        greeting: s.greeting,
        modules: s.modules,
        appearance: s.appearance,
        customTiles: s.customTiles,
        dualColumn: s.dualColumn,
      } satisfies PersistedLayout);
    },

    importLayout: (json) => {
      try {
        const parsed = JSON.parse(json) as PersistedLayout;
        if (!parsed || !Array.isArray(parsed.modules)) return false;
        // 走与加载一致的合并校验
        const merged: HomeModuleConfig[] = [];
        for (const m of parsed.modules) {
          const def = DEFAULT_MODULES.find((d) => d.id === m?.id);
          if (def && !merged.some((x) => x.id === m.id)) {
            merged.push({ ...def, visible: m.visible !== false, props: normalizeProps(def.props, m.props) });
          }
        }
        for (const def of DEFAULT_MODULES) {
          if (!merged.some((x) => x.id === def.id)) merged.push({ ...def, props: { ...def.props } });
        }
        set({
          modules: merged,
          greeting: parsed.greeting !== false,
          appearance: sanitizeAppearance(parsed.appearance),
          customTiles: Array.isArray(parsed.customTiles) ? parsed.customTiles.filter((t) => t && t.id && t.label && t.page) : [],
          dualColumn: parsed.dualColumn === true,
        });
        commit();
        return true;
      } catch {
        return false;
      }
    },

    resetLayout: () => {
      set({
        modules: DEFAULT_MODULES.map((m) => ({ ...m, props: { ...m.props } })),
        greeting: true,
        appearance: { ...DEFAULT_APPEARANCE },
        customTiles: [],
        dualColumn: false,
      });
      commit();
    },
  };
});
