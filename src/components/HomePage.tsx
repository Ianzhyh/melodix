import { useEffect, useMemo } from 'react';
import { AnimatePresence, motion, Reorder } from 'framer-motion';
import { useHomeStore } from '../stores/homeStore';
import { useHomeLayoutStore } from '../stores/homeLayoutStore';
import type { HomeModuleConfig } from '../stores/homeLayoutStore';
import { HomeEditToolbar, EditableModule, HiddenModuleTray } from './home/EditMode';
import {
  DailyRecommendModule,
  PlaylistTreasureModule,
  ToplistsModule,
  ToplistCardsModule,
  NewSongsModule,
  LovedRecommendModule,
  QuickAccessModule,
  RecentPlayModule,
  MostPlayedModule,
  FavoriteShelfModule,
  LocalShelfModule,
  LibraryShelfModule,
  SearchBarModule,
  IconPlay,
} from './home/modules';
import type { RouteState } from '../types/playback';
import '../styles/home.css';

interface HomePageProps {
  onNavigate?: (route: RouteState) => void;
}

/* ================= 图标 ================= */
const IconCustomize = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
);
const IconRefresh = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
);
const IconMusic = ({ size = 34 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
);

/** 双列模式下仍占整行的模块 */
const FULL_WIDTH_MODULES = new Set(['search-bar', 'quick-access', 'daily-recommend']);

/** 模块组件注册表：id → 渲染函数 */
function renderModule(cfg: HomeModuleConfig, editing: boolean, onNavigate?: HomePageProps['onNavigate']) {
  const props = { config: cfg, editing, onNavigate };
  switch (cfg.id) {
    case 'search-bar': return <SearchBarModule {...props} />;
    case 'quick-access': return <QuickAccessModule {...props} />;
    case 'daily-recommend': return <DailyRecommendModule {...props} />;
    case 'playlist-treasure': return <PlaylistTreasureModule {...props} />;
    case 'toplists': return <ToplistsModule {...props} />;
    case 'toplist-cards': return <ToplistCardsModule {...props} />;
    case 'new-songs': return <NewSongsModule {...props} />;
    case 'loved-recommend': return <LovedRecommendModule {...props} />;
    case 'recent-play': return <RecentPlayModule {...props} />;
    case 'most-played': return <MostPlayedModule {...props} />;
    case 'favorite-shelf': return <FavoriteShelfModule {...props} />;
    case 'local-shelf': return <LocalShelfModule {...props} />;
    case 'library-shelf': return <LibraryShelfModule {...props} />;
    default: return null;
  }
}

export function HomePage({ onNavigate }: HomePageProps) {
  const { recommendations, toplists, newSongs, isLoading, fetchHomeData } = useHomeStore();
  const modules = useHomeLayoutStore((s) => s.modules);
  const greeting = useHomeLayoutStore((s) => s.greeting);
  const editMode = useHomeLayoutStore((s) => s.editMode);
  const setEditMode = useHomeLayoutStore((s) => s.setEditMode);
  const reorderModules = useHomeLayoutStore((s) => s.reorderModules);
  const appearance = useHomeLayoutStore((s) => s.appearance);
  const dualColumn = useHomeLayoutStore((s) => s.dualColumn);

  useEffect(() => {
    fetchHomeData();
  }, [fetchHomeData]);

  const visible = useMemo(() => modules.filter((m) => m.visible), [modules]);
  const visibleIds = useMemo(() => visible.map((m) => m.id), [visible]);
  const isEmpty = !isLoading && newSongs.length === 0 && recommendations.length === 0 && toplists.length === 0;

  const greetingText = (() => {
    const h = new Date().getHours();
    if (h < 5) return '夜深了';
    if (h < 11) return '早上好';
    if (h < 13) return '中午好';
    if (h < 18) return '下午好';
    return '晚上好';
  })();
  const dateLabel = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());

  const actionButtons = (
    <div className="home-actions">
      {!editMode && (
        <button className="home-action-btn" onClick={() => setEditMode(true)} title="自定义主页模块">
          <IconCustomize />
          自定义
        </button>
      )}
      <button className="home-action-btn" onClick={() => fetchHomeData()} disabled={isLoading} title="刷新推荐内容">
        <IconRefresh />
        {isLoading ? '加载中...' : '刷新'}
      </button>
    </div>
  );

  return (
    <div
      className={`home-page${editMode ? ' editing' : ''} density-${appearance.density}${appearance.dimBg ? ' dim-bg' : ''}${dualColumn ? ' dual-col' : ''}`}
      style={{ '--hm-radius': `${appearance.radius}px` } as React.CSSProperties}
    >
      {/* ===== 头部：问候语 / 编辑工具条 ===== */}
      {editMode ? (
        <HomeEditToolbar />
      ) : (
        <motion.header
          className="home-header"
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          {greeting ? (
            <div>
              <h1 className="home-greeting">{greetingText}</h1>
              <p className="home-greeting-sub">{dateLabel} · 今天想听点什么</p>
            </div>
          ) : (
            <div />
          )}
          {actionButtons}
        </motion.header>
      )}

      {/* ===== 全空兜底 ===== */}
      {isEmpty && !editMode ? (
        <div className="home-empty">
          <IconMusic />
          <div>暂时没有推荐内容，可能是网络出了问题</div>
          <button className="home-action-btn" onClick={() => fetchHomeData()}>
            <IconRefresh />
            重新加载
          </button>
        </div>
      ) : editMode ? (
        <>
          {/* ===== 编辑模式：可拖拽模块序列 ===== */}
          <Reorder.Group
            axis="y"
            values={visibleIds}
            onReorder={reorderModules}
            as="div"
            className={`home-reorder-group${dualColumn ? ' dual' : ''}`}
          >
            {visible.map((cfg) => (
              <EditableModule
                key={cfg.id}
                config={cfg}
                moveEnabled={dualColumn}
                fullWidth={FULL_WIDTH_MODULES.has(cfg.id)}
              >
                {renderModule(cfg, true, onNavigate)}
              </EditableModule>
            ))}
          </Reorder.Group>
          <HiddenModuleTray />
          <AnimatePresence>
            {visible.length === 0 && (
              <motion.div
                className="home-empty"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              >
                <IconMusic />
                <div>所有模块都已隐藏，用上方「添加模块」或从下方托盘恢复</div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      ) : (
        <>
          {/* ===== 普通模式：按配置顺序渲染可见模块 ===== */}
          {visible.map((cfg) => (
            <div key={cfg.id}>
              {renderModule(cfg, false, onNavigate)}
            </div>
          ))}
          {visible.length === 0 && (
            <div className="home-empty">
              <IconMusic />
              <div>主页模块都被隐藏了</div>
              <button className="home-action-btn" onClick={() => setEditMode(true)}>
                <IconCustomize />
                去自定义
              </button>
            </div>
          )}
          {/* 原页脚占位：避开播放栏 */}
          <div style={{ height: 8 }} />
        </>
      )}
    </div>
  );
}

// 保留命名导出，方便测试或其他地方按需引用
export { IconPlay };
