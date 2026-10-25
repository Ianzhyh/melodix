import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { open } from '@tauri-apps/plugin-dialog';
import { usePlaybackStore } from '../stores/playbackStore';
import { useCustomLibraryStore } from '../stores/customLibraryStore';
import { useUIStore } from '../stores/uiStore';
import { useToastStore } from '../stores/toastStore';
import { useDownloadStore } from '../stores/downloadStore';
import { SelectionBar } from './SelectionBar';
import { TrackList, TrackListHeader } from './common/TrackList';
import { TrackRow } from './common/TrackRow';
import { getLibraryCoverUrl } from '../utils/cover';
import { useSongEnrichment } from '../hooks/useSongEnrichment';
import { Pagination, usePagination, DEFAULT_PAGE_SIZE } from './common/Pagination';
import { Modal, ModalButton } from './common/Modal';
import { popoverGlass } from '../utils/styles';
import { useDismiss } from '../hooks/useDismiss';
import { useConfigStore } from '../stores/configStore';
import type { RouteState, Song } from '../types/playback';
import { onCoverError } from '../utils/coverFallback';

/** 歌曲列表每页条数：分页 UI 与派生量统一走 common/Pagination */
const PAGE_SIZE = DEFAULT_PAGE_SIZE;

interface CustomLibraryPageProps {
  libraryId?: string;
  onNavigate?: (route: RouteState) => void;
}



const libraryGlyph = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--color-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    <polyline points="9 7 15 10 9 13 9 7" />
  </svg>
);

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  background: 'var(--color-hover)',
  color: 'var(--color-text)',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
};

const coverMenuItemStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 13,
  color: 'var(--color-text-dim)',
  transition: 'background 0.15s',
  whiteSpace: 'nowrap',
};

// 创建 / 重命名 / 删除 弹窗：统一走 common/Modal（遮罩、玻璃、按钮、焦点管理只写一次）
function LibraryModal({
  title,
  inputValue,
  inputPlaceholder,
  showInput,
  warning,
  confirmLabel,
  confirmDanger,
  onInputChange,
  onConfirm,
  onClose,
}: {
  title: string;
  inputValue?: string;
  inputPlaceholder?: string;
  showInput?: boolean;
  warning?: string;
  confirmLabel: string;
  confirmDanger?: boolean;
  onInputChange?: (v: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const confirmDisabled = showInput ? !(inputValue ?? '').trim() : false;
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={warning}
      cardStyle={{ minWidth: 360 }}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 4 }}>
          <ModalButton onClick={onClose}>取消</ModalButton>
          <ModalButton
            variant={confirmDanger ? 'danger' : 'primary'}
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </ModalButton>
        </div>
      }
    >
      {showInput && (
        <input
          autoFocus
          value={inputValue}
          onChange={(e) => onInputChange?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !confirmDisabled) onConfirm();
          }}
          placeholder={inputPlaceholder}
          maxLength={40}
          style={inputStyle}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--glass-border)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
        />
      )}
    </Modal>
  );
}

export function CustomLibraryPage({ libraryId, onNavigate }: CustomLibraryPageProps) {
  const libraries = useCustomLibraryStore((s) => s.libraries);
  // 封面菜单等浮层的玻璃材质跟随透明度开关（此前写死丙烯，关掉开关后仍模糊）
  const enableTransparency = useConfigStore((s) => s.enableTransparency);
  const createLibrary = useCustomLibraryStore((s) => s.createLibrary);
  const renameLibrary = useCustomLibraryStore((s) => s.renameLibrary);
  const deleteLibrary = useCustomLibraryStore((s) => s.deleteLibrary);
  const setLibraryCover = useCustomLibraryStore((s) => s.setLibraryCover);
  const removeSong = useCustomLibraryStore((s) => s.removeSong);
  const removeSongs = useCustomLibraryStore((s) => s.removeSongs);
  const moveLibrary = useCustomLibraryStore((s) => s.moveLibrary);
  const reorderSongs = useCustomLibraryStore((s) => s.reorderSongs);
  const addTasks = useDownloadStore((s) => s.addTasks);

  const setQueue = usePlaybackStore((s) => s.setQueue);
  const current = usePlaybackStore((s) => s.current);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const isBuffering = usePlaybackStore((s) => s.isBuffering);

  // 侧边栏「新建音乐库」入口：通过 uiStore 标志触发创建弹窗
  const libraryCreateOpen = useUIStore((s) => s.libraryCreateOpen);
  const setLibraryCreateOpen = useUIStore((s) => s.setLibraryCreateOpen);

  const [modal, setModal] = useState<'create' | 'rename' | 'delete' | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [coverMenuOpen, setCoverMenuOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const coverMenuRef = useRef<HTMLDivElement | null>(null);
  // 多选模式：选中集合按当前页可见歌曲计（切库/切页重置；批量移除后清空）
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // 歌曲列表分页（每页 50，与 FavoritesPage 一致）：避免一次挂载整库几百上千行
  const [page, setPage] = useState(1);
  // 音乐库卡片拖拽排序状态（自定义指针拖拽）
  const [drag, setDrag] = useState<{ id: string; from: number } | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const dragRef = useRef<{ id: string; from: number } | null>(null);
  const dropIndexRef = useRef<number | null>(null);
  const pendingRef = useRef<{ pointerId: number; startX: number; startY: number; id: string; index: number } | null>(null);
  const suppressClickRef = useRef(false);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  // 歌曲拖拽列表容器（用于 dragConstraints，限制拖拽不能超出列表范围）
  const songListRef = useRef<HTMLDivElement | null>(null);
  // 拖影位置走命令式 transform 更新（不经过 React 状态），保证完全跟手、零重渲染
  const dragPosRef = useRef({ x: 0, y: 0 });
  const ghostRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(
    () => (libraryId ? libraries.find((l) => l.id === libraryId) ?? null : null),
    [libraryId, libraries],
  );

  // 老数据补全：为缺失 albumId/artists 的在线歌曲静默拉取元信息并写回存储
  useSongEnrichment(selected ? selected.songs : [], (songId, patch) => {
    const lib = useCustomLibraryStore.getState().libraries.find((l) => l.id === libraryId);
    if (lib && lib.songs.some((s) => s.id === songId)) {
      useCustomLibraryStore.getState().updateSong(lib.id, songId, patch);
    }
  });

  // ===== 分页：须在 songValues / pageSongs 消费方之前声明 =====
  // 整库 620 首一次性挂载会拖垮渲染（实测 12042 DOM 节点 / scrollHeight 40537px），
  // 故按页切片。分页派生量与分页 UI 统一走 common/Pagination。
  const librarySongs = selected ? selected.songs : [];
  const pageMeta = usePagination(librarySongs.length, page, PAGE_SIZE);
  const { currentPage, totalPages, pageStartIndex } = pageMeta;
  // 依赖用原始值而不是 pageMeta 对象：后者每次渲染都是新引用，会让 useMemo 失效
  const pageSongs = useMemo(
    () => librarySongs.slice(pageStartIndex, pageStartIndex + PAGE_SIZE),
    [librarySongs, pageStartIndex],
  );
  // 页码越界时回正（例如批量移除后总页数减少）
  useEffect(() => {
    if (page !== currentPage) setPage(currentPage);
  }, [page, currentPage]);
  const goToTop = useCallback(() => {
    document.querySelector('main')?.scrollTo({ top: 0 });
  }, []);

  // 歌曲列表拖拽排序的受控值：当前页的稳定 id 数组（对齐 QueuePanel 的 Reorder 用法）
  const songValues = useMemo(() => pageSongs.map((s) => s.id), [pageSongs]);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  // 全局 Escape 广播：关闭弹窗与封面菜单，并退出多选
  useEffect(() => {
    const closePopups = () => {
      setModal(null);
      setCoverMenuOpen(false);
      setSelectMode(false);
      setSelectedIds(new Set());
    };
    window.addEventListener('melodix-close-popups', closePopups);
    return () => window.removeEventListener('melodix-close-popups', closePopups);
  }, []);

  // 切换音乐库时重置多选与分页（歌曲集合变化，避免残留选择/页码越界）
  useEffect(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setPage(1);
  }, [libraryId]);

  // 封面菜单外点 + Escape 关闭（统一走 useDismiss）
  useDismiss(coverMenuOpen, coverMenuRef, () => setCoverMenuOpen(false));

  // 音乐库卡片指针拖拽：移动超过 5px 阈值进入拖拽；拖影 transform 命令式更新（不触发
  // 每帧重渲染，完全跟手）；拖影整个矩形钳制在网格容器内，不会探出盖住上方信息区。
  // 松手提交到最近的目标槽位；指针取消/窗口失焦则回退不提交
  useEffect(() => {
    const GHOST_W = 140;
    const GHOST_H = 170;

    const clampPos = (clientX: number, clientY: number): { x: number; y: number } | null => {
      const grid = gridRef.current;
      if (!grid) return null;
      const rect = grid.getBoundingClientRect();
      const gw = ghostRef.current?.offsetWidth ?? GHOST_W;
      const gh = ghostRef.current?.offsetHeight ?? GHOST_H;
      // 按拖影整个矩形钳制：中心点向内收缩半个尺寸，
      // 拖到网格边缘时拖影仍完整停留在网格内（不会盖住上方"音乐库"标题信息区）
      const x = Math.min(Math.max(clientX - rect.left, gw / 2), Math.max(gw / 2, rect.width - gw / 2));
      const y = Math.min(Math.max(clientY - rect.top, gh / 2), Math.max(gh / 2, rect.height - gh / 2));
      return { x, y };
    };

    const applyGhost = (pos: { x: number; y: number }) => {
      dragPosRef.current = pos;
      if (ghostRef.current) {
        ghostRef.current.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -50%)`;
      }
    };

    const handleMove = (e: PointerEvent) => {
      // 尚未激活：达到阈值才进入拖拽（保留普通点击跳转行为）
      if (!dragRef.current) {
        const p = pendingRef.current;
        if (p && e.pointerId === p.pointerId) {
          const dist = Math.hypot(e.clientX - p.startX, e.clientY - p.startY);
          if (dist > 5) {
            dragRef.current = { id: p.id, from: p.index };
            setDrag(dragRef.current);
            const pos = clampPos(p.startX, p.startY);
            if (pos) applyGhost(pos);
            dropIndexRef.current = p.index;
            setDropIndex(p.index);
            document.body.style.cursor = 'grabbing';
          }
        }
        return;
      }

      const pos = clampPos(e.clientX, e.clientY);
      if (!pos) return;
      applyGhost(pos);

      // 目标槽位：卡片中心点离指针最近的索引
      let best = -1;
      let bestDist = Infinity;
      for (let i = 0; i < cardRefs.current.length; i++) {
        const el = cardRefs.current[i];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const d = (e.clientX - cx) ** 2 + (e.clientY - cy) ** 2;
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      if (best >= 0 && best !== dropIndexRef.current) {
        dropIndexRef.current = best;
        setDropIndex(best);
      }
    };

    const cleanupDrag = (commitDrop: boolean) => {
      if (dragRef.current) {
        if (commitDrop) {
          // 真实拖拽结束后抑制紧随其后的 click（避免误触发卡片跳转）
          suppressClickRef.current = true;
          const from = dragRef.current.from;
          const to = dropIndexRef.current;
          if (to !== null && to !== from) {
            moveLibrary(from, to);
          }
        }
      }
      dragRef.current = null;
      dropIndexRef.current = null;
      pendingRef.current = null;
      setDrag(null);
      setDropIndex(null);
      document.body.style.cursor = '';
    };

    const handleUp = (e: PointerEvent) => {
      // 纯点击（未进入拖拽）：清除 pending 即可，浏览器正常派发 click
      if (!dragRef.current) {
        if (pendingRef.current && e.pointerId === pendingRef.current.pointerId) {
          pendingRef.current = null;
        }
        return;
      }
      cleanupDrag(true);
    };
    const handleCancel = () => cleanupDrag(false);

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    window.addEventListener('blur', handleCancel);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
      window.removeEventListener('blur', handleCancel);
    };
  }, [moveLibrary]);

  // 响应侧边栏新建入口
  // 从其他页面点「+」时会先经过 AnimatePresence 页面切换动画（退出 0.22s + 进入 0.22s），
  // 若弹窗与页面动画同时启动，两个合成动画 + 遮罩阴影会挤在同一帧，出现首帧卡顿。
  // 延迟 250ms 等页面入场动画结束后再弹窗，动画错开、无重影冲突。
  useEffect(() => {
    if (!libraryCreateOpen) return;
    setLibraryCreateOpen(false);
    setNameInput('');
    const timer = window.setTimeout(() => setModal('create'), 250);
    return () => window.clearTimeout(timer);
  }, [libraryCreateOpen, setLibraryCreateOpen]);

  const openCreate = () => {
    setNameInput('');
    setModal('create');
  };

  const handleCreate = () => {
    const id = createLibrary(nameInput);
    if (!id) return;
    setModal(null);
    setNameInput('');
    // 创建后直接进入新音乐库详情
    if (onNavigate) onNavigate({ page: 'custom-library', id });
  };

  const handleRename = () => {
    if (!selected) return;
    renameLibrary(selected.id, nameInput);
    setModal(null);
    setNameInput('');
  };

  const handleDelete = () => {
    if (!selected) return;
    deleteLibrary(selected.id);
    setModal(null);
    if (onNavigate) onNavigate({ page: 'custom-library' });
  };

  // 播放整库（队列仍是整库，不受分页影响）
  const handlePlayAll = useCallback(() => {
    if (!selected || selected.songs.length === 0) return;
    setQueue(selected.songs, 0);
  }, [selected, setQueue]);

  // 播放当前页第 index 行：索引要换算成整库下标，否则第 2 页起会播错歌
  const handlePlayTrack = useCallback(
    (index: number) => {
      if (!selected) return;
      setQueue(selected.songs, pageStartIndex + index);
    },
    [selected, setQueue, pageStartIndex],
  );

  const handleRemoveTrack = useCallback(
    (songId: string) => {
      if (!selected) return;
      removeSong(selected.id, songId);
    },
    [selected, removeSong],
  );

  // ===== 多选（按当前页计：与 PlaylistView 一致，切页/切库清空选中） =====
  // 分页派生量（librarySongs / totalPages / currentPage / pageStartIndex / pageSongs /
  // goToTop）已在组件上方声明，供 songValues 与拖拽逻辑复用。
  const selectedSongs = useMemo(
    () => pageSongs.filter((s) => selectedIds.has(s.id)),
    [pageSongs, selectedIds],
  );
  const allSelected =
    selectMode && pageSongs.length > 0 && pageSongs.every((s) => selectedIds.has(s.id));

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (pageSongs.length > 0 && pageSongs.every((s) => prev.has(s.id))) return new Set();
      return new Set(pageSongs.map((s) => s.id));
    });
  }, [pageSongs]);

  const handleBatchDownload = useCallback(() => {
    if (selectedSongs.length === 0) return;
    addTasks(selectedSongs);
  }, [selectedSongs, addTasks]);

  // 批量移除：删完清空选中；库里没有剩余歌曲则退出多选
  const handleBatchRemove = useCallback(() => {
    if (!selected || selectedIds.size === 0) return;
    const remaining = librarySongs.filter((s) => !selectedIds.has(s.id)).length;
    removeSongs(selected.id, [...selectedIds]);
    setSelectedIds(new Set());
    if (remaining === 0) exitSelectMode();
  }, [selected, selectedIds, librarySongs, removeSongs, exitSelectMode]);

  // 歌曲行的歌手/专辑可点击入口：跳到歌手页/专辑页（来源跟随歌曲自身平台）
  const handleOpenArtist = useCallback((song: Song) => {
    const a = song.artists && song.artists.length > 0 ? song.artists[0] : null;
    if (!a || !a.id || !onNavigate) return;
    onNavigate({ page: 'artist', id: a.id, source: song.source || 'tencent', name: a.name });
  }, [onNavigate]);

  const handleOpenAlbum = useCallback((song: Song) => {
    if (!song.albumId || !onNavigate) return;
    onNavigate({ page: 'album', id: song.albumId, source: song.source || 'tencent', name: song.album });
  }, [onNavigate]);

  // 拖拽调整音乐库内歌曲顺序：由新 value 顺序映射回歌曲对象。
  // 注意分页后 Reorder 只拿到「当前页」的 id，而 reorderSongs 会校验长度一致才写入，
  // 因此这里必须把当前页的排列结果「拼回」整库序列，而不是整表替换（否则长度不符被静默丢弃）。
  const handleReorderSongs = useCallback(
    (newValues: string[]) => {
      if (!selected) return;
      const byId = new Map(selected.songs.map((s) => [s.id, s]));
      const reorderedPage = newValues
        .map((id) => byId.get(id))
        .filter((s): s is Song => Boolean(s));
      if (reorderedPage.length !== pageSongs.length) return;
      const nextSongs = [
        ...selected.songs.slice(0, pageStartIndex),
        ...reorderedPage,
        ...selected.songs.slice(pageStartIndex + pageSongs.length),
      ];
      reorderSongs(selected.id, nextSongs);
    },
    [selected, reorderSongs, pageSongs, pageStartIndex],
  );

  // 选择图片文件作为自定义封面
  const handleChooseCover = useCallback(async () => {
    if (!selected) return;
    setCoverMenuOpen(false);
    try {
      const picked = await open({
        multiple: false,
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
      });
      if (!picked || typeof picked !== 'string') return;
      setLibraryCover(selected.id, picked);
    } catch (e) {
      useToastStore.getState().showToast(`选择封面失败：${String(e)}`, 'error');
    }
  }, [selected, setLibraryCover]);

  // 恢复默认封面（第一首歌封面 / 默认占位）
  const handleResetCover = useCallback(() => {
    if (!selected) return;
    setCoverMenuOpen(false);
    setLibraryCover(selected.id, '');
  }, [selected, setLibraryCover]);

  const backToIndex = () => {
    if (onNavigate) onNavigate({ page: 'custom-library' });
  };

  // ===== 音乐库详情视图 =====
  if (libraryId) {
    if (!selected) {
      return (
        <div style={{ padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, color: 'var(--color-text-faint, rgba(255,255,255,0.45))' }}>
          <div style={{ fontSize: 15 }}>音乐库不存在或已删除</div>
          <button
            onClick={backToIndex}
            style={{
              padding: '8px 24px',
              borderRadius: 8,
              background: 'var(--color-primary, #6366f1)',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            返回音乐库列表
          </button>
        </div>
      );
    }

    const coverUrl = getLibraryCoverUrl(selected, 400);
    const totalDuration = selected.songs.reduce((s, t) => s + (t.duration || 0), 0);
    const fmtDuration = (sec: number) => `${Math.floor(sec / 60)} 分钟`;

    return (
      <div style={{ position: 'relative', width: '100%', minHeight: '100%', paddingBottom: 120 }}>
        <style>{`
          .cl-cover-box:hover .cl-cover-edit-hint { opacity: 1 !important; }
          .cl-toolbar-btn:hover:not(:disabled) { background: var(--color-surface-active, rgba(255,255,255,0.08)) !important; }
        `}</style>

        {/* Floating Back Button */}
        <div style={{ position: 'absolute', top: 24, left: 40, zIndex: 50 }}>
          <motion.button onClick={backToIndex} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
            style={{ height: 36, padding: '0 16px', borderRadius: 18, background: 'var(--glass-2, rgba(255,255,255,0.08))', border: '1px solid var(--glass-border, rgba(255,255,255,0.1))', color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, backdropFilter: 'var(--blur-sm, blur(12px))', WebkitBackdropFilter: 'var(--blur-sm, blur(12px))', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            返回
          </motion.button>
        </div>

        {/* Immersive Header */}
        <div style={{ position: 'relative', height: 300, display: 'flex', alignItems: 'flex-end', padding: '0 40px 36px', overflow: 'hidden' }}>
          {/* Blurred background */}
          <div style={{
            position: 'absolute', inset: 0, zIndex: 0,
            backgroundImage: coverUrl ? `url(${coverUrl})` : 'var(--color-primary)',
            backgroundSize: 'cover', backgroundPosition: 'center',
            filter: 'blur(60px) brightness(0.55)',
            transform: 'scale(1.2)',
          }} />

          <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: 28, alignItems: 'flex-end', width: '100%' }}>
            {/* Cover with edit menu */}
            <div ref={coverMenuRef} style={{ position: 'relative', flexShrink: 0 }}>
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                className="cl-cover-box"
                onClick={() => setCoverMenuOpen(v => !v)}
                title="设置封面"
                style={{
                  width: 180, height: 180, borderRadius: 16, overflow: 'hidden', cursor: 'pointer',
                  position: 'relative', background: 'var(--color-primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
                }}
              >
                {libraryGlyph}
                {coverUrl && (
                  <img src={coverUrl} alt="" onError={onCoverError}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
                <div className="cl-cover-edit-hint" style={{
                  position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: 0, transition: 'opacity 0.2s',
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </div>
              </motion.div>
              <AnimatePresence>
                {coverMenuOpen && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.15 }}
                    style={{
                      position: 'absolute', top: '100%', left: 0, marginTop: 8,
                      // 统一走 popoverGlass：透明度开关为必填参数，避免再次漏判
                      ...popoverGlass({ enableTransparency, radius: 12, padding: 4, minWidth: 170, elevation: 'sm' }),
                    }}
                  >
                    <div onClick={handleChooseCover} style={coverMenuItemStyle}
                      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--color-surface-hover)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                    >选择图片文件...</div>
                    {selected.cover && (
                      <div onClick={handleResetCover} style={coverMenuItemStyle}
                        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--color-surface-hover)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                      >恢复默认封面</div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Title & meta */}
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(255,255,255,0.6)' }}>音乐库</span>
              <h1 style={{ fontSize: 44, fontWeight: 800, margin: '6px 0 12px', letterSpacing: -1.5, color: 'rgba(255,255,255,0.95)', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 480 }}>
                {selected.name}
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'rgba(255,255,255,0.65)' }}>
                <span>{selected.songs.length} 首</span>
                {totalDuration > 0 && (<><span>•</span><span>{fmtDuration(totalDuration)}</span></>)}
              </div>
            </motion.div>
          </div>
        </div>

        {/* Action Bar */}
        <div style={{ padding: '20px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Play All (Left) */}
          <motion.button onClick={handlePlayAll} disabled={selected.songs.length === 0}
            whileHover={selected.songs.length > 0 ? { scale: 1.05 } : undefined}
            whileTap={selected.songs.length > 0 ? { scale: 0.95 } : undefined}
            style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--color-primary)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: selected.songs.length > 0 ? 'pointer' : 'not-allowed', opacity: selected.songs.length > 0 ? 1 : 0.5, boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8V4z"/></svg>
          </motion.button>
          
          {/* Operations (Right) */}
          <div style={{ display: 'flex', gap: 12 }}>
            {/* Multi-select */}
            <motion.button className="cl-toolbar-btn"
              onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
              disabled={selected.songs.length === 0}
              whileHover={selected.songs.length > 0 ? { scale: 1.04 } : undefined}
              whileTap={selected.songs.length > 0 ? { scale: 0.96 } : undefined}
              style={{
                height: 36, padding: '0 16px', borderRadius: 18,
                background: selectMode ? 'var(--color-primary)' : 'var(--glass-2)',
                border: `1px solid ${selectMode ? 'var(--color-primary)' : 'var(--glass-border)'}`,
                color: selectMode ? '#fff' : 'var(--color-text)',
                fontSize: 13, fontWeight: 500,
                cursor: selected.songs.length > 0 ? 'pointer' : 'not-allowed',
                opacity: selected.songs.length > 0 ? 1 : 0.5,
                backdropFilter: 'var(--blur-sm)', WebkitBackdropFilter: 'var(--blur-sm)',
              }}>
              {selectMode ? '退出多选' : '多选'}
            </motion.button>
            {/* Rename */}
            <motion.button className="cl-toolbar-btn" onClick={() => { setNameInput(selected.name); setModal('rename'); }}
              whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
              style={{ height: 36, padding: '0 16px', borderRadius: 18, background: 'var(--glass-2)', border: '1px solid var(--glass-border)', color: 'var(--color-text)', fontSize: 13, fontWeight: 500, cursor: 'pointer', backdropFilter: 'var(--blur-sm)', WebkitBackdropFilter: 'var(--blur-sm)' }}>
              重命名
            </motion.button>
            {/* Delete */}
            <motion.button className="cl-toolbar-btn" onClick={() => setModal('delete')}
              whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
              style={{ height: 36, padding: '0 16px', borderRadius: 18, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--color-danger)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              删除音乐库
            </motion.button>
          </div>
        </div>

        {/* Song list */}
        <div style={{ padding: '0 40px' }}>
          {selected.songs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-faint)' }}>
              <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>{libraryGlyph}</div>
              <p style={{ fontSize: 16, margin: '0 0 4px' }}>音乐库还是空的</p>
              <p style={{ fontSize: 13, margin: '0 0 20px', color: 'var(--color-text-dim)' }}>在歌单或搜索结果中使用「加入音乐库」添加歌曲</p>
            </div>
          ) : (
            <TrackList showCover={true}>
              {/* 列标题行 / 多选操作栏：共用同一位置，selectMode 时替换 */}
              <AnimatePresence mode="wait" initial={false}>
                {selectMode ? (
                  <SelectionBar
                    key="sel-bar"
                    count={selectedIds.size}
                    total={pageSongs.length}
                    allSelected={allSelected}
                    onToggleSelectAll={toggleSelectAll}
                    onExit={exitSelectMode}
                    horizontalPadding={12}
                    actions={[
                      {
                        key: 'download',
                        label: `下载${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`,
                        disabled: selectedIds.size === 0,
                        onClick: handleBatchDownload,
                      },
                      {
                        key: 'remove',
                        label: `移除${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`,
                        danger: true,
                        disabled: selectedIds.size === 0,
                        onClick: handleBatchRemove,
                      },
                    ]}
                  />
                ) : (
                  <TrackListHeader key="col-header" showCover={true} />
                )}
              </AnimatePresence>

              {/* 分页信息：说明拖拽只在当前页内生效（跨页排序会被整库序列覆盖） */}
              {totalPages > 1 && (
                <div style={{ fontSize: 12, color: 'var(--color-text-faint)', padding: '0 12px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>第 {currentPage} / {totalPages} 页 · 本页 {pageSongs.length} 首 · 共 {librarySongs.length} 首</span>
                  <span title="歌曲按页展示，拖拽排序仅在当前页内生效">（拖拽排序仅在当前页内生效）</span>
                </div>
              )}

              <div ref={songListRef} style={{ position: 'relative', overflow: 'hidden' }}>
                <Reorder.Group axis="y" values={songValues} onReorder={handleReorderSongs} as="div" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {pageSongs.map((song, i) => (
                    <Reorder.Item key={song.id} value={song.id} layout="position"
                      dragListener={!selectMode}
                      dragConstraints={songListRef} dragElastic={0} dragMomentum={false}
                      dragTransition={{ bounceStiffness: 600, bounceDamping: 40 }}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.02, 0.3), layout: { duration: 0.15 } }}
                      onDragStart={() => setDraggingId(song.id)} onDragEnd={() => setDraggingId(null)}
                      style={{ cursor: selectMode ? 'pointer' : 'grab', position: 'relative' }}
                    >
                      <TrackRow
                        song={song}
                        index={i}
                        displayIndex={pageStartIndex + i + 1}
                        isCurrent={current?.id === song.id}
                        isPlaying={isPlaying}
                        isBuffering={isBuffering}
                        selectMode={selectMode}
                        selected={selectedIds.has(song.id)}
                        onToggleSelect={toggleSelect}
                        onPlay={() => handlePlayTrack(i)}
                        onOpenArtist={handleOpenArtist as any}
                        onOpenAlbum={handleOpenAlbum as any}
                        showCover={true}
                        isDragging={draggingId === song.id}
                        renderAction={() => (
                          <button
                            title="从音乐库移除"
                            onClick={(e) => { e.stopPropagation(); handleRemoveTrack(song.id); }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--color-text-faint)',
                              cursor: 'pointer',
                              padding: 4,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-danger)'; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-faint)'; }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              <line x1="18" y1="6" x2="6" y2="18"></line>
                              <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                          </button>
                        )}
                      />
                    </Reorder.Item>
                  ))}
                </Reorder.Group>
              </div>

              {/* 分页控件：翻页后回到顶部，并清空选中避免残留隐藏选择 */}
              {totalPages > 1 && (
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={(next) => { setPage(next); setSelectedIds(new Set()); goToTop(); }}
                />
              )}
            </TrackList>
          )}
        </div>

        {modal === 'create' && (
          <LibraryModal title="新建音乐库" inputValue={nameInput} inputPlaceholder="音乐库名称..." showInput confirmLabel="创建"
            onInputChange={setNameInput} onConfirm={handleCreate} onClose={() => setModal(null)} />
        )}
        {modal === 'rename' && (
          <LibraryModal title="重命名音乐库" inputValue={nameInput} inputPlaceholder="音乐库名称..." showInput confirmLabel="保存"
            onInputChange={setNameInput} onConfirm={handleRename} onClose={() => setModal(null)} />
        )}
        {modal === 'delete' && (
          <LibraryModal title="删除音乐库" warning={`确定删除「${selected.name}」吗？歌曲列表将被移除（不删除任何歌曲文件）。`}
            confirmLabel="删除" confirmDanger onConfirm={handleDelete} onClose={() => setModal(null)} />
        )}
      </div>
    );
  }

  // ===== 音乐库列表视图 =====
  return (
    <div style={{ padding: 'clamp(20px, 3vw, 40px)', paddingBottom: 120, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <div style={{
          width: 56,
          height: 56,
          borderRadius: 12,
          background: 'var(--color-primary, #6366f1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          {libraryGlyph}
        </div>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>自定义音乐库</h1>
          <p style={{ fontSize: 14, color: 'var(--color-text-dim, rgba(255,255,255,0.65))', margin: '4px 0 0' }}>
            {libraries.length} 个音乐库
          </p>
        </div>
        <div style={{ flex: 1 }} />
        <button className="cl-toolbar-btn" onClick={openCreate} style={toolbarButtonStyle(false)}>
          新建音乐库
        </button>
      </div>

      {libraries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-faint, rgba(255,255,255,0.45))' }}>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>{libraryGlyph}</div>
          <p style={{ fontSize: 16, margin: '0 0 4px' }}>还没有自定义音乐库</p>
          <p style={{ fontSize: 13, margin: '0 0 20px' }}>创建音乐库后，可从播放器「更多」菜单或歌曲列表把歌曲添加进来</p>
          <button onClick={openCreate} style={toolbarButtonStyle(false)}>新建音乐库</button>
        </div>
      ) : (
        <div
          ref={gridRef}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 20, position: 'relative' }}
        >
          {libraries.map((lib, index) => {
            const libCover = getLibraryCoverUrl(lib, 300);
            const isDragging = drag?.id === lib.id;
            const isDropTarget = !isDragging && dropIndex === index && drag !== null;
            return (
            // 外层普通 div 承载指针拖拽事件（motion.div 的 onDragStart 会被 framer 手势占用），
            // 内层 motion.div 负责卡片动画与点击
            <div
              key={lib.id}
              ref={(el) => { cardRefs.current[index] = el; }}
              title="拖拽调整音乐库顺序"
              style={{
                opacity: isDragging ? 0.35 : 1,
                WebkitUserSelect: 'none',
                userSelect: 'none',
                touchAction: 'none',
              }}
              onPointerDown={(e) => {
                // 新交互开始，清除上一次拖拽遗留的点击抑制标记
                suppressClickRef.current = false;
                if (e.button !== 0) return;
                pendingRef.current = {
                  pointerId: e.pointerId,
                  startX: e.clientX,
                  startY: e.clientY,
                  id: lib.id,
                  index,
                };
              }}
            >
            <motion.div
              className="song-card"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.3), ease: 'easeOut' }}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.98 }}
              style={{
                cursor: isDragging ? 'grabbing' : 'pointer',
                display: 'flex',
                flexDirection: 'column',
              }}
              onClick={() => {
                // 拖拽结束后的 click 直接吞掉，避免误触发卡片跳转
                if (suppressClickRef.current) {
                  suppressClickRef.current = false;
                  return;
                }
                if (onNavigate) onNavigate({ page: 'custom-library', id: lib.id });
              }}
            >
              <div style={{
                width: '100%',
                aspectRatio: '1/1',
                borderRadius: 12,
                marginBottom: 12,
                overflow: 'hidden',
                position: 'relative',
                background: 'var(--color-surface-hover)',
                border: '1px solid var(--color-border)',
                outline: isDropTarget ? '2px solid var(--color-primary, #6366f1)' : 'none',
                outlineOffset: 2,
              }}>
                {/* 默认占位永远垫底；封面加载失败时自动回落（纯色） */}
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-primary, #6366f1)' }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                    <polyline points="9 7 15 10 9 13 9 7" />
                  </svg>
                </div>
                {libCover && (
                  <img
                    src={libCover}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="card-image"
                    draggable={false}
                    onError={onCoverError}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                )}
                <div className="play-overlay" style={{ borderRadius: 12 }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#fff' }}><path d="M8 5v14l11-7z"/></svg>
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lib.name}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-faint)', marginTop: 4 }}>{lib.songs.length} 首</div>
            </motion.div>
            </div>
            );
          })}

          {/* 拖拽跟手预览：transform 由 pointermove 命令式更新（不经 React 渲染），
              位置按整个矩形钳制在网格容器内，无法拖出界、不会盖住上方信息区 */}
          {drag && (() => {
            const draggedLib = libraries.find((l) => l.id === drag.id);
            const ghostCover = draggedLib ? getLibraryCoverUrl(draggedLib, 300) : '';
            return (
              <div
                ref={ghostRef}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: 140,
                  transform: `translate(${dragPosRef.current.x}px, ${dragPosRef.current.y}px) translate(-50%, -50%)`,
                  pointerEvents: 'none',
                  zIndex: 30,
                  cursor: 'grabbing',
                  background: 'var(--color-bg-elevated)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 12,
                  padding: 8,
                  boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
                }}
              >
                <div style={{
                  width: '100%',
                  aspectRatio: '1/1',
                  borderRadius: 8,
                  overflow: 'hidden',
                  position: 'relative',
                  background: 'var(--color-primary, #6366f1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  {ghostCover ? (
                    <img
                      src={ghostCover}
                      alt=""
                      draggable={false}
                      onError={onCoverError}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                      <polyline points="9 7 15 10 9 13 9 7" />
                    </svg>
                  )}
                </div>
                <div style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--color-text)',
                  marginTop: 6,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {draggedLib?.name}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {modal === 'create' && (
        <LibraryModal
          title="新建音乐库"
          inputValue={nameInput}
          inputPlaceholder="音乐库名称..."
          showInput
          confirmLabel="创建"
          onInputChange={setNameInput}
          onConfirm={handleCreate}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

// 工具栏按钮统一样式（对齐本地库页）
function toolbarButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    height: 36,
    padding: '0 14px',
    fontSize: 13,
    fontWeight: 500,
    color: disabled ? 'var(--color-text-faint, rgba(255,255,255,0.4))' : 'var(--color-text, rgba(255,255,255,0.95))',
    background: 'var(--color-hover, rgba(255,255,255,0.04))',
    border: '1px solid var(--color-border, rgba(255,255,255,0.06))',
    borderRadius: 8,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background 0.15s',
    whiteSpace: 'nowrap',
  };
}
