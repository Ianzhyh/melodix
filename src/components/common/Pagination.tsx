import React, { useCallback, useEffect, useState } from 'react';

/**
 * 统一分页控件。
 *
 * 背景：此前 FavoritesPage / HistoryPage / CustomLibraryPage / PlaylistView 各自
 * 复制了一份分页逻辑与分页条 JSX，其中三个 `pagerBtnStyle` 函数逐字节相同
 * （连注释都写着"与 FavoritesPage 的 pagerBtnStyle 视觉一致"），
 * 另外每页还各写了一份 `totalPages / currentPage / pageStartIndex` 钳制式推导。
 * 同一套标准写四遍的直接后果是行为漂移：
 *   - HistoryPage 的翻页条只在 `totalPages > 1` 时出现，FavoritesPage 却总是显示；
 *   - HistoryPage 翻页后不清空选中集合，其它两个页面清空；
 *   - PlaylistView 是唯一带"跳至第 N 页"输入的页面，其余三个没有。
 * 现在统一到本组件：布局、样式、钳制规则、无障碍属性只写一次。
 */

export const DEFAULT_PAGE_SIZE = 50;

/** 分页按钮样式：内联样式（不依赖 CSS 变量名是否存在于 tokens.css） */
export function pagerButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    background: 'none',
    border: '1px solid var(--color-border, rgba(255,255,255,0.1))',
    color: disabled
      ? 'var(--color-text-faint, rgba(255,255,255,0.3))'
      : 'var(--color-text, rgba(255,255,255,0.9))',
    padding: '6px 14px',
    borderRadius: 6,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 13,
    transition: 'background 0.15s',
  };
}

export interface PaginationMeta {
  /** 已钳制到 [1, totalPages] 的当前页码 */
  currentPage: number;
  totalPages: number;
  /** 当前页第一条在整体列表中的下标（从 0 开始） */
  pageStartIndex: number;
  /** 每页条数 */
  pageSize: number;
}

/**
 * 分页派生量：把「总页数取整 + 页码钳制 + 起始下标」这三行易错算术收敛到一处。
 *
 * 钳制是必要的：取消收藏 / 清空历史 / 删除音乐库歌曲都会让 `total` 变小，
 * 而 `page` 仍停在旧值，不钳制就会渲染出空白的一页（页码显示 3/2）。
 *
 * @param total 总条数
 * @param page 请求的页码（可能越界）
 * @param pageSize 每页条数
 */
export function usePagination(
  total: number,
  page: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
): PaginationMeta {
  const safeSize = Math.max(1, Math.floor(pageSize) || DEFAULT_PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(Math.max(0, total) / safeSize));
  const currentPage = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const pageStartIndex = (currentPage - 1) * safeSize;
  return { currentPage, totalPages, pageStartIndex, pageSize: safeSize };
}

/** 把整体列表按下标切出当前页（纯函数，避免各页面重复 slice 边界算式） */
export function slicePage<T>(items: readonly T[], meta: PaginationMeta): T[] {
  return items.slice(meta.pageStartIndex, meta.pageStartIndex + meta.pageSize);
}

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** 显示"跳至第 N 页"输入框（长列表用，如歌单详情） */
  showJump?: boolean;
  /**
   * 页码文案模板。默认「第 X / Y 页」；
   * 需要附带条数信息时传 `(cur, total) => ...`。
   */
  renderLabel?: (currentPage: number, totalPages: number) => React.ReactNode;
  /** 总页数只有 1 页时是否仍然渲染（默认不渲染，省掉无用的一行控件） */
  alwaysShow?: boolean;
  style?: React.CSSProperties;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  showJump = false,
  renderLabel,
  alwaysShow = false,
  style,
}: PaginationProps) {
  const [jumpInput, setJumpInput] = useState('');

  // 外部翻页后清空跳页输入，避免输入框里残留上一页的旧数字
  useEffect(() => {
    setJumpInput('');
  }, [currentPage]);

  const go = useCallback(
    (page: number) => {
      const target = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
      if (target !== currentPage) onPageChange(target);
    },
    [currentPage, totalPages, onPageChange],
  );

  const handleJump = useCallback(() => {
    const num = parseInt(jumpInput, 10);
    if (!Number.isFinite(num)) {
      setJumpInput('');
      return;
    }
    go(num);
    setJumpInput('');
  }, [jumpInput, go]);

  if (!alwaysShow && totalPages <= 1) return null;

  const prevDisabled = currentPage <= 1;
  const nextDisabled = currentPage >= totalPages;

  return (
    <div
      role="navigation"
      aria-label="分页"
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
        padding: '24px 0 8px',
        ...style,
      }}
    >
      <button
        type="button"
        className="common-pager-btn"
        aria-label="上一页"
        disabled={prevDisabled}
        onClick={() => go(currentPage - 1)}
        style={pagerButtonStyle(prevDisabled)}
      >
        上一页
      </button>
      <span
        aria-live="polite"
        style={{
          fontSize: 13,
          color: 'var(--color-text-dim, rgba(255,255,255,0.65))',
          minWidth: 90,
          textAlign: 'center',
        }}
      >
        {renderLabel ? renderLabel(currentPage, totalPages) : `第 ${currentPage} / ${totalPages} 页`}
      </span>
      <button
        type="button"
        className="common-pager-btn"
        aria-label="下一页"
        disabled={nextDisabled}
        onClick={() => go(currentPage + 1)}
        style={pagerButtonStyle(nextDisabled)}
      >
        下一页
      </button>

      {showJump && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 12 }}>
          <label htmlFor="common-page-jump" style={{ color: 'var(--color-text-faint)', fontSize: 13 }}>
            跳至
          </label>
          <input
            id="common-page-jump"
            type="number"
            min={1}
            max={totalPages}
            value={jumpInput}
            onChange={(e) => setJumpInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleJump();
            }}
            onBlur={() => setJumpInput('')}
            placeholder="页"
            style={{
              width: 56,
              height: 30,
              padding: '0 8px',
              fontSize: 13,
              textAlign: 'center',
              color: 'var(--color-text)',
              background: 'var(--color-hover)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <span style={{ color: 'var(--color-text-faint)', fontSize: 13 }}>页</span>
          <button
            type="button"
            onClick={handleJump}
            style={{
              background: 'var(--color-primary, #6366f1)',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            跳转
          </button>
        </div>
      )}

      {/* hover 反馈只写一次；此前每个页面各贴一份 <style> 且类名不同（fv/hp/cl-pager-btn） */}
      <style>{`
        .common-pager-btn:hover:not(:disabled) {
          background: var(--color-hover, rgba(255,255,255,0.06));
        }
      `}</style>
    </div>
  );
}

export default Pagination;
