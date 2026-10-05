import { usePlaybackStore } from '../stores/playbackStore';
import { useUIStore } from '../stores/uiStore';
import { getSongCoverUrl } from '../utils/cover';
import { motion, AnimatePresence } from 'framer-motion';
import { AudioEngine } from '../services/AudioEngine';
import { useFavoriteStore } from '../stores/favoriteStore';
import { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';

export function MiniPlayer() {
  const current = usePlaybackStore((s) => s.current);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const setPlaying = usePlaybackStore((s) => s.setPlaying);
  const progress = usePlaybackStore((s) => s.progress);
  const next = usePlaybackStore((s) => s.next);
  const prev = usePlaybackStore((s) => s.prev);
  const toggleMiniPlayer = useUIStore((s) => s.toggleMiniPlayer);
  const activeLine = usePlaybackStore((s) => s.activeLine);
  const lyrics = usePlaybackStore((s) => s.lyrics);
  const currentLyric = activeLine >= 0 && activeLine < lyrics.length ? lyrics[activeLine].text : '';
  
  const { isFavorite, toggleFavorite } = useFavoriteStore();
  const [showLyrics, setShowLyrics] = useState(false);
  const [isPinned, setIsPinned] = useState(true);

  // 监听歌词展开状态，通过 Rust 命令动态调整原生窗口高度
  useEffect(() => {
    const adjustHeight = async () => {
      try {
        await invoke('set_mini_player_height', { height: showLyrics ? 139 : 80 });
      } catch (e) {
        console.error(e);
      }
    };
    adjustHeight();
  }, [showLyrics]);

  const handleWheel = (e: React.WheelEvent) => {
    const store = usePlaybackStore.getState();
    // 向下滚动音量减小，向上滚动音量增大
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    store.setVolume(store.volume + delta);
  };

  const handleTogglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlaying) {
      AudioEngine.pause();
      setPlaying(false);
    } else {
      AudioEngine.resume();
      setPlaying(true);
    }
  };

  return (
    <div
      data-tauri-drag-region
      onWheel={handleWheel}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'transparent',
        overflow: 'hidden',
        position: 'relative',
        borderRadius: 12,
        transform: 'translateZ(0)',
        boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.15), inset 0 -1px 1px rgba(0, 0, 0, 0.3)',
      }}
    >
      {/* Background blur from cover */}
      {current && (
        <div
          data-tauri-drag-region
          style={{
            position: 'absolute',
            inset: -20,
            backgroundImage: `url(${getSongCoverUrl(current, 300)})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(25px) saturate(1.8) brightness(0.65)',
            opacity: 0.85,
            zIndex: 0,
            pointerEvents: 'none',
          }}
        />
      )}
      <div
        data-tauri-drag-region
        style={{
          position: 'absolute',
          inset: 0,
          background: 'var(--acrylic-noise)',
          opacity: 0.5,
          mixBlendMode: 'overlay',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />

      {/* Main Content (Top 80px) */}
      <div
        data-tauri-drag-region
        style={{
          display: 'flex',
          height: 80,
          flexShrink: 0,
          alignItems: 'center',
          padding: '0 16px',
          gap: 12,
          zIndex: 2,
        }}
      >
        {/* Cover */}
        {current ? (
          <img
            src={getSongCoverUrl(current, 100)}
            style={{
              width: 48,
              height: 48,
              borderRadius: 8,
              objectFit: 'cover',
              pointerEvents: 'none',
              boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08)',
            }}
          />
        ) : (
          <div style={{ width: 48, height: 48, borderRadius: 8, background: 'var(--color-surface)' }} />
        )}

        {/* Info */}
        <div data-tauri-drag-region style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
          <div data-tauri-drag-region style={{ fontSize: 13.5, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
            {current?.name || 'No Track'}
          </div>
          <div data-tauri-drag-region style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.75)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
            {current?.artist || '-'}
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fff' }}>
          <motion.button whileHover={{ backgroundColor: 'rgba(255,255,255,0.1)' }} whileTap={{ scale: 0.9 }} onClick={(e) => { e.stopPropagation(); prev(); }} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
          </motion.button>
          
          <motion.button whileHover={{ backgroundColor: 'rgba(255,255,255,0.1)' }} whileTap={{ scale: 0.9 }} onClick={handleTogglePlay} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isPlaying ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            )}
          </motion.button>
          
          <motion.button whileHover={{ backgroundColor: 'rgba(255,255,255,0.1)' }} whileTap={{ scale: 0.9 }} onClick={(e) => { e.stopPropagation(); next(); }} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
          </motion.button>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {/* Favorite */}
          <motion.button
            whileHover={{ color: '#fff', backgroundColor: 'rgba(255,255,255,0.1)' }}
            whileTap={{ scale: 0.9 }}
            onClick={(e) => { e.stopPropagation(); if (current) toggleFavorite(current); }}
            style={{ background: 'none', border: 'none', color: (current && isFavorite(current.id)) ? 'var(--color-danger)' : 'rgba(255,255,255,0.6)', cursor: 'pointer', width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title="收藏"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill={(current && isFavorite(current.id)) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
          </motion.button>

          {/* Lyrics Toggle */}
          <motion.button
            whileHover={{ color: '#fff', backgroundColor: 'rgba(255,255,255,0.1)' }}
            whileTap={{ scale: 0.9 }}
            onClick={(e) => { e.stopPropagation(); setShowLyrics(!showLyrics); }}
            style={{ background: 'none', border: 'none', color: showLyrics ? '#fff' : 'rgba(255,255,255,0.6)', cursor: 'pointer', width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title="单行歌词"
          >
            <svg width="13" height="13" viewBox="0 0 1024 1024" fill="currentColor">
              <path d="M927.27050913-6.45970103L96.72949087-6.45970103C39.73034507-6.45970103-6.45970103 40.10740668-6.45970103 96.72949087l0 830.47817565C-6.45970103 984.26965493 40.10740668 1030.45970103 96.72949087 1030.45970103l830.47817565 0c56.9991458 0 103.18919189-46.56710769 103.18919189-103.1891919L1030.39685694 96.72949087C1030.45970103 39.73034507 983.89259332-6.45970103 927.27050913-6.45970103zM935.69155253 936.19430083c0-0.43990567-847.88585338-0.50274831-847.88585336-0.5027483C88.24560484 935.69155253 88.30844747 87.80569917 88.30844747 87.80569917 88.30844747 88.24560484 936.19430083 88.30844747 936.19430083 88.30844747 935.75439516 88.30844747 935.69155253 936.19430083 935.69155253 936.19430083z"></path>
              <path d="M794.29345226 761.61477969l0.50274831 0.25137488L794.79620057 272.88010103c-1.69677721-27.39981014-20.54985724-41.97952441-56.49639603-43.6763016L435.07943344 229.20379943c-18.85308003 1.69677721-29.09658734 13.69990433-30.85620715 35.94653879 1.69677721 22.24663444 12.00312714 34.24976158 30.85620715 35.94653878l280.03108266 0c5.15317571 0 7.72976282 2.57658711 7.7297628 7.72976282l0 416.21316312 0.69127913 0.37706161-96.90483141 0c-9.86644571 0-25.89156372 12.82009443-27.14843524 33.36995167 1.25687152 22.24663444 14.89393324 34.24976158 27.14843524 35.94653878l145.73430869 0C785.30681645 793.16226745 792.59667504 782.10179284 794.29345226 761.61477969zM460.78246639 403.9090073c-17.15630283-1.69677721-26.51999876-13.69990433-28.27962006-35.9465388 1.69677721-20.54985724 11.12331723-31.67317446 28.27962006-33.36995166l210.65174811 0c20.54985724 1.69677721 31.67317446 12.82009443 33.36995167 33.36995166-1.69677721 22.24663444-12.00312714 34.24976158-30.85620718 35.9465388L460.78246639 403.9090073zM250.88484147 298.58313397C240.82986497 296.88635678 218.45754382 284.88322964 217.45204573 262.5737511 218.45754382 242.02389387 237.18493715 230.90057665 247.30275628 229.20379943l82.82786545 0c12.12881531 1.69677721 29.47364895 12.82009443 30.47914557 33.36995167C359.66711329 284.88322964 341.25393897 296.88635678 330.13062173 298.58313397L250.88484147 298.58313397zM350.30341737 723.53155803l0-301.6492806c1.69677721-37.70616007-12.82009443-55.6794302-43.6763016-53.98265301L244.97754258 367.89962442C226.12446254 369.65924572 215.88095671 381.66237286 214.12133541 403.9090073c1.69677721 24.00625573 12.00312714 36.82635015 30.85620717 38.52312736L270.68057552 442.43213466c5.15317571 0 7.72976282 2.57658711 7.72976282 7.72976282l0 304.41439851c-0.12568672 0.7541232-0.18853081 1.5710905-0.1885308 2.38805632 0.18853081 4.46189513 1.25687152 8.48388603 2.8908061 12.12881531 4.27336431 14.01412332 11.62606554 21.30398045 28.15393335 25.38881397 2.76511791 0.43990567 5.46739321-0.12568672 8.1696685-1.57109051l72.39582735 0c10.68341152-1.69677721 30.60483376-13.69990433 31.61033038-35.94653877-0.94265401-20.54985724-19.92142077-31.67317446-31.61033038-33.36995168 0 0-17.91042605 0-36.63781938 0L350.30341737 723.59440212zM494.21526067 691.66985277c-35.94653878 0-53.98265298-17.15630283-53.98265299-51.40606442L440.23260915 491.26161197c0-34.24976158 15.39668155-51.40606442 46.25289018-51.40606441l151.5787635 0c35.94653878 0 53.10284161 14.57971571 51.40606441 43.67630159l0 156.7319392c0 34.24976158-15.39668155 51.40606442-46.25289017 51.40606442L494.21526067 691.66985277zM512.18853081 617.13734252c1.69677721 3.45639851 4.27336431 5.97014151 7.72976281 7.7297628l89.92919177 0c5.15317571 0 7.72976282-2.57658711 7.72976282-7.7297628L617.57724821 516.9646449c0-5.15317571-2.57658711-7.72976282-7.72976282-7.72976281L519.85544953 509.23488209c-5.15317571 0-7.72976282 2.57658711-7.72976281 7.72976281L512.12568672 617.13734252z"></path>
            </svg>
          </motion.button>

          {/* Always on top Pin */}
          <motion.button
            whileHover={{ color: '#fff', backgroundColor: 'rgba(255,255,255,0.1)' }}
            whileTap={{ scale: 0.9 }}
            onClick={async (e) => { 
              e.stopPropagation(); 
              const nextState = !isPinned;
              setIsPinned(nextState);
              await getCurrentWindow().setAlwaysOnTop(nextState);
            }}
            style={{ background: 'none', border: 'none', color: isPinned ? '#fff' : 'rgba(255,255,255,0.6)', cursor: 'pointer', width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title={isPinned ? "取消置顶" : "置顶窗口"}
          >
            <svg width="17" height="17" viewBox="0 0 1024 1024" fill="currentColor" style={{ marginTop: 1 }}>
              {isPinned ? (
                <path d="M377.088 10.6496A27.5456 27.5456 0 0 0 369.664 34.816a149.4016 149.4016 0 0 0 44.5952 78.08L389.12 327.0144a290.1504 290.1504 0 0 0-72.192 52.3264 278.2208 278.2208 0 0 0-54.528 76.8 283.6992 283.6992 0 0 0-26.3168 93.2352 25.6 25.6 0 0 0 6.8096 21.0944 26.6752 26.6752 0 0 0 20.1216 8.96l229.5808 0.3072v248.4736a24.9856 24.9856 0 0 0 7.1168 18.2784 24.32 24.32 0 0 0 18.2784 7.168 24.832 24.832 0 0 0 18.2784-7.168 24.1664 24.1664 0 0 0 7.168-18.2784v-248.4224l229.5808 0.3072a26.7264 26.7264 0 0 0 19.5072-8.3456 26.0608 26.0608 0 0 0 7.424-21.7088 281.6 281.6 0 0 0-49.2544-132.2496 288.0512 288.0512 0 0 0-104.3968-90.7776l-25.1392-214.1184 3.4304-3.3792a147.712 147.712 0 0 0 40.96-75.6224 24.8832 24.8832 0 0 0-5.12-21.3504 27.1872 27.1872 0 0 0-20.48-9.9328H395.6736a26.624 26.624 0 0 0-18.5856 8.0384z" />
              ) : (
                <path d="M377.088 10.6496A27.5456 27.5456 0 0 0 369.664 34.816a149.4016 149.4016 0 0 0 44.5952 78.08L389.12 327.0144a290.1504 290.1504 0 0 0-72.192 52.3264 278.2208 278.2208 0 0 0-54.528 76.8 283.6992 283.6992 0 0 0-26.3168 93.2352 25.6 25.6 0 0 0 6.8096 21.0944 26.6752 26.6752 0 0 0 20.1216 8.96l229.5808 0.3072v248.4736a24.9856 24.9856 0 0 0 7.1168 18.2784 24.32 24.32 0 0 0 18.2784 7.168 24.832 24.832 0 0 0 18.2784-7.168 24.1664 24.1664 0 0 0 7.168-18.2784v-248.4224l229.5808 0.3072a26.7264 26.7264 0 0 0 19.5072-8.3456 26.0608 26.0608 0 0 0 7.424-21.7088 281.6 281.6 0 0 0-49.2544-132.2496 288.0512 288.0512 0 0 0-104.3968-90.7776l-25.1392-214.1184 3.4304-3.3792a147.712 147.712 0 0 0 40.96-75.6224 24.8832 24.8832 0 0 0-5.12-21.3504 27.1872 27.1872 0 0 0-20.48-9.9328H395.6736a26.624 26.624 0 0 0-18.5856 8.0384z m215.9616 48.64a118.3232 118.3232 0 0 1-8.704 9.9328l-22.272 21.0432 30.72 272.6912 26.9312 13.9264a232.0384 232.0384 0 0 1 83.968 72.8064 226.2016 226.2016 0 0 1 33.792 73.4208l-439.3472-0.6144a244.736 244.736 0 0 1 15.36-41.8304A239.1552 239.1552 0 0 1 358.4 419.328a230.656 230.656 0 0 1 57.9584-42.4448l26.9312-13.9264 30.72-272.6912-20.48-19.2a47.4112 47.4112 0 0 1-10.5472-11.776z" />
              )}
            </svg>
          </motion.button>

          {/* Expand button */}
          <motion.button
            whileHover={{ color: '#fff', backgroundColor: 'rgba(255,255,255,0.1)' }}
            whileTap={{ scale: 0.9 }}
            onClick={(e) => { e.stopPropagation(); toggleMiniPlayer(); }}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 4 }}
            title="退出迷你模式"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
          </motion.button>
        </div>
      </div>

      {/* Lyrics Expansion Area */}
      <AnimatePresence>
        {showLyrics && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 56 }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              width: '100%',
              zIndex: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              flexShrink: 0,
              padding: '0 20px',
            }}
          >
            <div style={{
              padding: '7px 20px',
              backgroundColor: 'rgba(0,0,0,0.28)',
              borderRadius: 22,
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.1), 0 4px 12px rgba(0,0,0,0.35)',
              fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif',
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: '0.3px',
              color: 'rgba(255,255,255,0.95)',
              maxWidth: '100%',
              textAlign: 'center',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {currentLyric || (isPlaying ? '...' : 'Melodix')}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress Bar (Bottom Edge) */}
      <div style={{ width: '100%', height: 3, flexShrink: 0, background: 'rgba(255,255,255,0.1)', zIndex: 2, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, overflow: 'hidden' }}>
        <div style={{ width: `${progress * 100}%`, height: '100%', background: '#ffffff', boxShadow: '0 0 6px rgba(255,255,255,0.8)', transition: 'width 0.1s linear' }} />
      </div>
    </div>
  );
}
