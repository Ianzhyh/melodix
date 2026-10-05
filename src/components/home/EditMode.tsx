import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Reorder, useDragControls, motion } from 'framer-motion';
import { MODULE_META, useHomeLayoutStore } from '../../stores/homeLayoutStore';
import type { HomeModuleConfig, HomeModuleId, HomeModuleProps } from '../../stores/homeLayoutStore';
import { useToastStore } from '../../stores/toastStore';

/**
 * 主页编辑模式 UI：
 * - HomeEditToolbar：顶部悬浮工具条（问候语开关 / 添加模块 / 恢复默认 / 完成）
 * - EditableModule：模块编辑框（拖拽手柄 + 设置 Popover + 隐藏按钮），作为 Reorder.Item
 * - HiddenModuleTray：已隐藏模块托盘（可重新添加）
 * - 所有浮层监听 melodix-close-popups（App 的 Escape 兜底约定）
 */

/* ================= 图标 ================= */
const IconGrip = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>
);
const IconGear = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
);
const IconEyeOff = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
);
const IconPlus = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
);
const IconReset = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
);
const IconCheck = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
);

/* ================= 浮层关闭 hook ================= */
/** 点击容器外部或按 Esc 时关闭（mousedown 级别，避免与内部点击冲突） */
function useDismiss(open: boolean, ref: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = ref.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) onClose();
    };
    const onEscape = () => onClose();
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('melodix-close-popups', onEscape);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('melodix-close-popups', onEscape);
    };
  }, [open, ref, onClose]);
}

/* ================= 模块设置项定义 ================= */
interface SegOption { value: string | number; label: string }
/** 设置控件类型：标题编辑 / 标题显隐 / 数量步进器 / 分段选择 / 对齐整行开关 */
type SettingDef =
  | { type: 'title' }
  | { type: 'showTitle' }
  | { type: 'count'; min: number; max: number }
  | { type: 'snapRow' }
  | { type: 'seg'; key: 'layout' | 'tileStyle' | 'heroStyle' | 'columns' | 'ratio'; label: string; options: SegOption[] };

const COVERS_COLUMNS: SegOption[] = [
  { value: 2, label: '2 列' }, { value: 3, label: '3 列' }, { value: 4, label: '4 列' },
  { value: 5, label: '5 列' }, { value: 6, label: '6 列' },
];
const RATIO_OPTIONS: SegOption[] = [
  { value: '1:1', label: '方形' }, { value: '4:3', label: '横版' }, { value: '3:4', label: '竖版' },
];
const LAYOUT_GRID_FIRST: SegOption[] = [{ value: 'grid', label: '网格' }, { value: 'scroll', label: '横滑' }];
const LAYOUT_SCROLL_FIRST: SegOption[] = [{ value: 'scroll', label: '横滑' }, { value: 'grid', label: '网格' }];

/** 支持单卡调尺寸（1×1 / 2×1 / 2×2）的模块 */
const WIDE_CARD_MODULES = new Set<HomeModuleId>([
  'playlist-treasure', 'toplists', 'loved-recommend', 'recent-play', 'most-played', 'favorite-shelf', 'local-shelf', 'library-shelf',
]);

const SETTINGS_DEFS: Partial<Record<HomeModuleId, SettingDef[]>> = {
  'quick-access': [
    { type: 'title' },
    { type: 'showTitle' },
    { type: 'count', min: 2, max: 16 },
    { type: 'seg', key: 'columns', label: '每行磁贴', options: [{ value: 2, label: '2 列' }, { value: 3, label: '3 列' }, { value: 4, label: '4 列' }] },
    { type: 'seg', key: 'tileStyle', label: '磁贴样式', options: [{ value: 'compact', label: '小磁贴' }, { value: 'large', label: '大磁贴' }] },
  ],
  'daily-recommend': [
    { type: 'title' },
    { type: 'showTitle' },
    { type: 'seg', key: 'heroStyle', label: '展示样式', options: [{ value: 'banner', label: '横幅+小卡' }, { value: 'cards', label: '仅小卡' }] },
  ],
  'search-bar': [
    { type: 'title' },
    { type: 'showTitle' },
  ],
  'playlist-treasure': [
    { type: 'title' },
    { type: 'showTitle' },
    { type: 'count', min: 2, max: 24 },
    { type: 'seg', key: 'columns', label: '每行列数', options: COVERS_COLUMNS },
    { type: 'seg', key: 'layout', label: '布局', options: LAYOUT_GRID_FIRST },
    { type: 'seg', key: 'ratio', label: '封面比例', options: RATIO_OPTIONS },
    { type: 'snapRow' },
  ],
  'toplists': [
    { type: 'title' },
    { type: 'showTitle' },
    { type: 'count', min: 2, max: 24 },
    { type: 'seg', key: 'columns', label: '每行列数', options: COVERS_COLUMNS },
    { type: 'seg', key: 'layout', label: '布局', options: LAYOUT_GRID_FIRST },
    { type: 'seg', key: 'ratio', label: '封面比例', options: RATIO_OPTIONS },
    { type: 'snapRow' },
  ],
  'toplist-cards': [
    { type: 'title' },
    { type: 'showTitle' },
    { type: 'count', min: 2, max: 10 },
    { type: 'seg', key: 'columns', label: '每行列数', options: [{ value: 1, label: '1 列' }, { value: 2, label: '2 列' }, { value: 3, label: '3 列' }, { value: 4, label: '4 列' }] },
    { type: 'snapRow' },
  ],
  'new-songs': [
    { type: 'title' },
    { type: 'showTitle' },
    { type: 'count', min: 2, max: 12 },
    { type: 'seg', key: 'columns', label: '每行列数', options: [{ value: 2, label: '2 列' }, { value: 3, label: '3 列' }, { value: 4, label: '4 列' }] },
    { type: 'snapRow' },
  ],
  'loved-recommend': [
    { type: 'title' },
    { type: 'showTitle' },
    { type: 'count', min: 2, max: 24 },
    { type: 'seg', key: 'columns', label: '每行列数', options: COVERS_COLUMNS },
    { type: 'seg', key: 'layout', label: '布局', options: LAYOUT_GRID_FIRST },
    { type: 'seg', key: 'ratio', label: '封面比例', options: RATIO_OPTIONS },
    { type: 'snapRow' },
  ],
  'recent-play': [
    { type: 'title' },
    { type: 'showTitle' },
    { type: 'count', min: 2, max: 24 },
    { type: 'seg', key: 'columns', label: '每行列数', options: COVERS_COLUMNS },
    { type: 'seg', key: 'layout', label: '布局', options: LAYOUT_SCROLL_FIRST },
    { type: 'seg', key: 'ratio', label: '封面比例', options: RATIO_OPTIONS },
    { type: 'snapRow' },
  ],
  'most-played': [
    { type: 'title' },
    { type: 'showTitle' },
    { type: 'count', min: 2, max: 24 },
    { type: 'seg', key: 'columns', label: '每行列数', options: COVERS_COLUMNS },
    { type: 'seg', key: 'layout', label: '布局', options: LAYOUT_GRID_FIRST },
    { type: 'seg', key: 'ratio', label: '封面比例', options: RATIO_OPTIONS },
    { type: 'snapRow' },
  ],
  'favorite-shelf': [
    { type: 'title' },
    { type: 'showTitle' },
    { type: 'count', min: 2, max: 24 },
    { type: 'seg', key: 'columns', label: '每行列数', options: COVERS_COLUMNS },
    { type: 'seg', key: 'layout', label: '布局', options: LAYOUT_SCROLL_FIRST },
    { type: 'seg', key: 'ratio', label: '封面比例', options: RATIO_OPTIONS },
    { type: 'snapRow' },
  ],
  'local-shelf': [
    { type: 'title' },
    { type: 'showTitle' },
    { type: 'count', min: 2, max: 24 },
    { type: 'seg', key: 'columns', label: '每行列数', options: COVERS_COLUMNS },
    { type: 'seg', key: 'layout', label: '布局', options: LAYOUT_GRID_FIRST },
    { type: 'seg', key: 'ratio', label: '封面比例', options: RATIO_OPTIONS },
    { type: 'snapRow' },
  ],
  'library-shelf': [
    { type: 'title' },
    { type: 'showTitle' },
    { type: 'count', min: 2, max: 24 },
    { type: 'seg', key: 'columns', label: '每行列数', options: COVERS_COLUMNS },
    { type: 'seg', key: 'layout', label: '布局', options: LAYOUT_GRID_FIRST },
    { type: 'seg', key: 'ratio', label: '封面比例', options: RATIO_OPTIONS },
    { type: 'snapRow' },
  ],
};

/** 分段选择器 */
function Segmented({ value, options, onChange }: { value: string | number | undefined; options: SegOption[]; onChange: (v: string | number) => void }) {
  return (
    <div className="seg-group">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          className={`seg-btn${opt.value === value ? ' active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** 数量步进器（− / 值 / +） */
function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="stepper">
      <button className="stepper-btn" disabled={value <= min} onClick={() => onChange(clamp(value - 1))} aria-label="减少">−</button>
      <span className="stepper-val">{value}</span>
      <button className="stepper-btn" disabled={value >= max} onClick={() => onChange(clamp(value + 1))} aria-label="增加">+</button>
    </div>
  );
}

/** 模块标题编辑行（自定义 + 一键恢复默认） */
function TitleInput({ config, onChange }: { config: HomeModuleConfig; onChange: (v: string) => void }) {
  const value = config.props.customTitle ?? '';
  return (
    <div className="setting-row">
      <span className="setting-label">标题</span>
      <div className="title-input-wrap">
        <input
          className="title-input"
          value={value}
          placeholder={MODULE_META[config.id].title}
          maxLength={20}
          onChange={(e) => onChange(e.target.value)}
        />
        {value && (
          <button className="title-reset" onClick={() => onChange('')} title="恢复默认标题">↺</button>
        )}
      </div>
    </div>
  );
}

/** 模块设置 Popover（锚定在设置按钮下方；开合由父级 chrome 容器统一管理） */
function ModuleSettingsPopover({ config }: { config: HomeModuleConfig }) {
  const setModuleProps = useHomeLayoutStore((s) => s.setModuleProps);
  const defs = SETTINGS_DEFS[config.id] ?? [];

  if (defs.length === 0) return null;
  return (
    <motion.div
      className="module-settings-popover"
      initial={{ opacity: 0, y: -6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      {defs.map((def) => {
        if (def.type === 'title') {
          return <TitleInput key="title" config={config} onChange={(v) => setModuleProps(config.id, { customTitle: v })} />;
        }
        if (def.type === 'showTitle') {
          return (
            <div className="setting-row" key="showTitle">
              <span className="setting-label">显示标题</span>
              <Segmented
                value={config.props.showTitle === false ? 'hide' : 'show'}
                options={[{ value: 'show', label: '显示' }, { value: 'hide', label: '隐藏' }]}
                onChange={(v) => setModuleProps(config.id, { showTitle: v === 'show' })}
              />
            </div>
          );
        }
        if (def.type === 'count') {
          return (
            <div className="setting-row" key="count">
              <span className="setting-label">展示数量</span>
              <Stepper
                value={config.props.count ?? def.min}
                min={def.min}
                max={def.max}
                onChange={(v) => setModuleProps(config.id, { count: v })}
              />
            </div>
          );
        }
        if (def.type === 'snapRow') {
          return (
            <div className="setting-row" key="snapRow">
              <span className="setting-label">自动对齐整行</span>
              <Segmented
                value={config.props.snapRow ? 'on' : 'off'}
                options={[{ value: 'on', label: '开' }, { value: 'off', label: '关' }]}
                onChange={(v) => setModuleProps(config.id, { snapRow: v === 'on' })}
              />
            </div>
          );
        }
        return (
          <div className="setting-row" key={def.key}>
            <span className="setting-label">{def.label}</span>
            <Segmented
              value={config.props[def.key]}
              options={def.options}
              onChange={(v) => setModuleProps(config.id, { [def.key]: v } as HomeModuleProps)}
            />
          </div>
        );
      })}
      <div className="setting-tip">提示：数量与每行列数对齐（如 8 个 × 4 列）可填满整行</div>
      {WIDE_CARD_MODULES.has(config.id) && (
        <div className="setting-tip">编辑模式下悬停卡片，点左上角「1×1 / 2×1 / 2×2」可调整单张卡片尺寸</div>
      )}
    </motion.div>
  );
}

/* ================= 可拖拽编辑模块框 ================= */
export function EditableModule({ config, children, moveEnabled = false, fullWidth = false }: { config: HomeModuleConfig; children: ReactNode; moveEnabled?: boolean; fullWidth?: boolean }) {
  const controls = useDragControls();
  const toggleModule = useHomeLayoutStore((s) => s.toggleModule);
  const moveModule = useHomeLayoutStore((s) => s.moveModule);
  const chromeRef = useRef<HTMLDivElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const meta = MODULE_META[config.id];
  const hasSettings = (SETTINGS_DEFS[config.id]?.length ?? 0) > 0;
  // 关闭判定挂在包含「设置按钮 + 弹层」的 chrome 容器上：
  // 点按钮本体不触发外部关闭（避免关了又被 onClick 重新打开），点其他区域/Esc 才关
  useDismiss(settingsOpen, chromeRef, () => setSettingsOpen(false));

  return (
    <Reorder.Item
      value={config.id}
      dragListener={false}
      dragControls={controls}
      className={`home-module-item${fullWidth ? ' full-width' : ''}`}
      whileDrag={{ scale: 1.01, boxShadow: '0 18px 44px rgba(0,0,0,0.4)', zIndex: 30 }}
    >
      <div className="module-edit-chrome" ref={chromeRef}>
        <div className="chrome-left">
          <button
            className="drag-handle"
            onPointerDown={(e) => controls.start(e)}
            title="拖动调整顺序"
            aria-label={`拖动调整${meta.title}顺序`}
          >
            <IconGrip />
          </button>
          <span className="chrome-name">{meta.title}</span>
          {moveEnabled && (
            <div className="chrome-move">
              <button className="chrome-move-btn" onClick={() => moveModule(config.id, -1)} title="上移">↑</button>
              <button className="chrome-move-btn" onClick={() => moveModule(config.id, 1)} title="下移">↓</button>
            </div>
          )}
        </div>
        <div className="chrome-right">
          {hasSettings && (
            <button
              className={`chrome-btn${settingsOpen ? ' active' : ''}`}
              onClick={() => setSettingsOpen((v) => !v)}
              title="模块设置"
            >
              <IconGear />
              设置
            </button>
          )}
          <button className="chrome-btn" onClick={() => toggleModule(config.id)} title="隐藏该模块">
            <IconEyeOff />
            隐藏
          </button>
        </div>
        {settingsOpen && <ModuleSettingsPopover config={config} />}
      </div>
      <div className="module-edit-content">{children}</div>
    </Reorder.Item>
  );
}

/** 应用风格开关（与设置页 Toggle 一致的 44×24 胶囊） */
function AppToggle({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <button
      className="app-toggle"
      role="switch"
      aria-checked={value}
      onClick={onChange}
      style={{ background: value ? 'var(--color-primary)' : 'var(--color-surface-active)' }}
    >
      <motion.div
        className="app-toggle-knob"
        animate={{ x: value ? 20 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
      />
    </button>
  );
}

/* ================= 顶部编辑工具条 ================= */
export function HomeEditToolbar() {
  const modules = useHomeLayoutStore((s) => s.modules);
  const greeting = useHomeLayoutStore((s) => s.greeting);
  const appearance = useHomeLayoutStore((s) => s.appearance);
  const dualColumn = useHomeLayoutStore((s) => s.dualColumn);
  const { setEditMode, toggleGreeting, addModule, resetLayout, applyPreset, setAppearance, setDualColumn, exportLayout, importLayout } = useHomeLayoutStore();
  const { showToast } = useToastStore();
  const hidden = useMemo(() => modules.filter((m) => !m.visible), [modules]);
  // 互斥：工具条同时只开一个弹层
  const [openMenu, setOpenMenu] = useState<'preset' | 'appearance' | 'add' | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const presetRef = useRef<HTMLDivElement>(null);
  const appearRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLDivElement>(null);

  // 点击当前弹层容器外部 / Esc → 关闭（容器包含自己的触发按钮，点按钮本体不会误关）
  useEffect(() => {
    if (!openMenu) return;
    const refs: Record<string, RefObject<HTMLDivElement | null>> = { preset: presetRef, appearance: appearRef, add: addRef };
    const onDoc = (e: MouseEvent) => {
      const wrap = refs[openMenu]?.current;
      if (!(e.target instanceof Node) || !wrap?.contains(e.target)) setOpenMenu(null);
    };
    const onEscape = () => setOpenMenu(null);
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('melodix-close-popups', onEscape);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('melodix-close-popups', onEscape);
    };
  }, [openMenu]);

  const toggleMenu = (name: 'preset' | 'appearance' | 'add') =>
    setOpenMenu((cur) => (cur === name ? null : name));

  const handleExport = async () => {
    const json = exportLayout();
    try {
      await navigator.clipboard.writeText(json);
      showToast('布局配置已复制到剪贴板', 'success');
    } catch {
      showToast('复制失败，请检查剪贴板权限', 'error');
    }
  };

  const handleImport = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        showToast('剪贴板是空的，请先复制布局配置', 'info');
        return;
      }
      if (importLayout(text)) showToast('布局配置已导入', 'success');
      else showToast('导入失败：配置内容不合法', 'error');
    } catch {
      showToast('读取剪贴板失败，请检查权限', 'error');
    }
  };

  return (
    <div className="home-edit-toolbar">
      <div className="toolbar-left">
        <span className="toolbar-title">自定义主页</span>
        <span className="toolbar-hint">拖动模块排序 · 调整数量、布局与外观</span>
      </div>
      <div className="toolbar-right">
        <div className="toolbar-toggle-row">
          <span className="toolbar-toggle-label">问候语</span>
          <AppToggle value={greeting} onChange={toggleGreeting} />
        </div>

        <button
          className={`toolbar-chip${dualColumn ? ' active' : ''}`}
          onClick={() => setDualColumn(!dualColumn)}
          title="模块按两列并排排列"
        >
          双列
        </button>

        <div className="toolbar-add-wrap" ref={presetRef}>
          <button className="toolbar-chip" onClick={() => toggleMenu('preset')} title="一键应用布局预设">
            预设
          </button>
          {openMenu === 'preset' && (
            <motion.div
              className="module-settings-popover add-menu"
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
            >
              {([
                { key: 'minimal', name: '极简', desc: '搜索框 + 快捷磁贴 + 最近/收藏' },
                { key: 'discover', name: '发现', desc: '推荐 + 榜单 + 新歌，探索向' },
                { key: 'mine', name: '我的', desc: '磁贴 + 音乐库 + 收藏/最近/最常/本地' },
              ] as const).map((p) => (
                <button
                  key={p.key}
                  className="add-menu-item"
                  onClick={() => { applyPreset(p.key); setOpenMenu(null); showToast(`已应用「${p.name}」预设`, 'success'); }}
                >
                  <div className="add-menu-text">
                    <div className="add-menu-name">{p.name}</div>
                    <div className="add-menu-desc">{p.desc}</div>
                  </div>
                </button>
              ))}
            </motion.div>
          )}
        </div>

        <div className="toolbar-add-wrap" ref={appearRef}>
          <button className="toolbar-chip" onClick={() => toggleMenu('appearance')} title="主页整体观感">
            外观
          </button>
          {openMenu === 'appearance' && (
            <motion.div
              className="module-settings-popover"
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
            >
              <div className="setting-row">
                <span className="setting-label">密度</span>
                <Segmented
                  value={appearance.density}
                  options={[{ value: 'compact', label: '紧凑' }, { value: 'standard', label: '标准' }, { value: 'relaxed', label: '宽松' }]}
                  onChange={(v) => setAppearance({ density: v as 'compact' | 'standard' | 'relaxed' })}
                />
              </div>
              <div className="setting-row">
                <span className="setting-label">卡片圆角</span>
                <Segmented
                  value={appearance.radius}
                  options={[{ value: 8, label: '小' }, { value: 12, label: '中' }, { value: 18, label: '大' }]}
                  onChange={(v) => setAppearance({ radius: typeof v === 'number' ? v : 12 })}
                />
              </div>
              <div className="setting-row">
                <span className="setting-label">背景加深</span>
                <AppToggle value={appearance.dimBg} onChange={() => setAppearance({ dimBg: !appearance.dimBg })} />
              </div>
              <div className="setting-tip">密度与圆角作用于整个主页，立即生效</div>
            </motion.div>
          )}
        </div>

        <div className="toolbar-add-wrap" ref={addRef}>
          <button className="toolbar-chip" onClick={() => toggleMenu('add')} disabled={hidden.length === 0} title={hidden.length === 0 ? '所有模块都在展示中' : '添加隐藏的模块'}>
            <IconPlus />
            添加模块{hidden.length > 0 ? ` (${hidden.length})` : ''}
          </button>
          {openMenu === 'add' && hidden.length > 0 && (
            <motion.div
              className="module-settings-popover add-menu"
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
            >
              {hidden.map((m) => (
                <button key={m.id} className="add-menu-item" onClick={() => { addModule(m.id); setOpenMenu(null); }}>
                  <div className="add-menu-text">
                    <div className="add-menu-name">{MODULE_META[m.id].title}</div>
                    <div className="add-menu-desc">{MODULE_META[m.id].desc}</div>
                  </div>
                  <IconPlus />
                </button>
              ))}
            </motion.div>
          )}
        </div>

        <button className="toolbar-chip" onClick={handleExport} title="把当前主页布局复制为 JSON">
          导出
        </button>
        <button className="toolbar-chip" onClick={handleImport} title="从剪贴板读取布局配置">
          导入
        </button>

        <button
          className={`toolbar-chip${confirmReset ? ' danger' : ''}`}
          onClick={() => {
            if (confirmReset) {
              resetLayout();
              setConfirmReset(false);
            } else {
              setConfirmReset(true);
              setTimeout(() => setConfirmReset(false), 3000);
            }
          }}
          title="恢复默认布局"
        >
          <IconReset />
          {confirmReset ? '再点一次确认' : '恢复默认'}
        </button>

        <button className="toolbar-done" onClick={() => { setOpenMenu(null); setEditMode(false); }}>
          <IconCheck />
          完成
        </button>
      </div>
    </div>
  );
}

/* ================= 已隐藏模块托盘 ================= */
export function HiddenModuleTray() {
  const modules = useHomeLayoutStore((s) => s.modules);
  const addModule = useHomeLayoutStore((s) => s.addModule);
  const hidden = useMemo(() => modules.filter((m) => !m.visible), [modules]);

  if (hidden.length === 0) return null;
  return (
    <div className="hidden-tray">
      <div className="tray-title">已隐藏的模块</div>
      <div className="tray-grid">
        {hidden.map((m) => (
          <button key={m.id} className="tray-card" onClick={() => addModule(m.id)}>
            <div className="tray-card-text">
              <div className="tray-name">{MODULE_META[m.id].title}</div>
              <div className="tray-desc">{MODULE_META[m.id].desc}</div>
            </div>
            <span className="tray-add">
              <IconPlus />
              添加
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
