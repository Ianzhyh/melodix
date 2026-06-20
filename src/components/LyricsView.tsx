import { useEffect, useRef, useCallback, useState, memo } from 'react'
import { usePlaybackStore } from '../stores/playbackStore'
import { useConfigStore } from '../stores/configStore'
import { AudioEngine } from '../services/AudioEngine'
import type { LyricLine } from '../types/playback'
import '../styles/lyrics.css'

interface LyricLineItemProps {
  line: LyricLine
  index: number
  isActive: boolean
  dist: number
  showTranslation: boolean
  registerRef: (el: HTMLDivElement | null, index: number) => void
  onLineClick: (line: LyricLine) => void
}

const LyricLineItem = memo(
  ({ line, index, isActive, dist, showTranslation, registerRef, onLineClick }: LyricLineItemProps) => {
    let className = 'lyric-line-el'
    if (isActive) {
      className += ' lyric-line-active'
    } else if (dist > 0) {
      // 已唱过的行
      className += ' lyric-line-sung'
      const d = Math.min(dist, 5)
      className += ` lyric-line-sung-dist-${d}`
    } else if (dist < 0) {
      // 还没唱的行
      const d = Math.min(-dist, 5)
      className += ` lyric-line-ahead-${d}`
    } else {
      // 没有活跃行时
      className += ' lyric-line-ahead-1'
    }

    return (
      <div
        ref={(el) => registerRef(el, index)}
        onClick={() => onLineClick(line)}
        className={className}
        style={{
          fontSize: 'clamp(20px, 3vh, 32px)',
          fontWeight: 700,
        }}
      >
        {line.words && line.words.length > 0
          ? line.words.map((word, i) => (
              <span key={i} className="lyric-char">{word.text}</span>
            ))
          : line.text
        }
        {line.translation && (
          <div
            style={{
              display: 'grid',
              gridTemplateRows: showTranslation ? '1fr' : '0fr',
              transition: 'grid-template-rows 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)',
            }}
          >
            <div style={{ overflow: 'hidden' }}>
              <div
                style={{
                  fontSize: '0.65em',
                  marginTop: '0.45em',
                  marginBottom: '0.45em',
                  opacity: showTranslation ? (isActive ? 0.85 : 0.55) : 0,
                  transform: showTranslation ? 'translateY(0)' : 'translateY(-6px)',
                  transition: 'opacity 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)',
                  fontWeight: 400,
                  letterSpacing: '0.02em',
                }}
              >
                {line.translation}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  },
  (prev, next) => {
    // 仅在 isActive、dist、line 引用或 showTranslation 变化时重渲染
    return (
      prev.isActive === next.isActive &&
      prev.dist === next.dist &&
      prev.line === next.line &&
      prev.showTranslation === next.showTranslation
    )
  }
)

export function LyricsView() {
  const lyrics = usePlaybackStore((s) => s.lyrics)
  const activeLine = usePlaybackStore((s) => s.activeLine)
  const currentTime = usePlaybackStore((s) => s.currentTime)
  const setActiveLine = usePlaybackStore((s) => s.setActiveLine)
  const current = usePlaybackStore((s) => s.current)
  const isChineseLyric = usePlaybackStore((s) => s.isChineseLyric)
  const hasTranslation = usePlaybackStore((s) => s.hasTranslation)
  const themeColor = usePlaybackStore((s) => s.themeColor)
  const showTranslationButton = useConfigStore((s) => s.showTranslationButton)
  const autoTranslateLyrics = useConfigStore((s) => s.autoTranslateLyrics)

  const [showTranslation, setShowTranslation] = useState(false)

  // 切歌或翻译可用性变化时，根据 autoTranslateLyrics 重置翻译显示
  useEffect(() => {
    setShowTranslation(autoTranslateLyrics && hasTranslation)
  }, [current?.id, hasTranslation, autoTranslateLyrics])

  const containerRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef<(HTMLDivElement | null)[]>([])
  const charElsRef = useRef<Element[]>([])
  const lastPctRef = useRef<number[]>([])
  const rafRef = useRef<number>(0)
  const prevActiveLineRef = useRef<number>(-1)
  const visibleRef = useRef(true)
  const prevLyricsRef = useRef(lyrics)

  // 歌词变化时清空缓存（渲染阶段执行，确保 ref 回调能重新填充 lineRefs）
  if (prevLyricsRef.current !== lyrics) {
    prevLyricsRef.current = lyrics
    lineRefs.current = []
    charElsRef.current = []
    lastPctRef.current = []
  }

  // activeLine 同步：根据 currentTime 二分查找
  useEffect(() => {
    if (lyrics.length === 0) return
    let lo = 0, hi = lyrics.length - 1, result = -1
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1
      if (lyrics[mid].time <= currentTime) { result = mid; lo = mid + 1 }
      else { hi = mid - 1 }
    }
    if (result !== prevActiveLineRef.current) {
      prevActiveLineRef.current = result
      setActiveLine(result)
    }
  }, [currentTime, lyrics, setActiveLine])

  // 用于区分是正常切歌词还是切换翻译
  const scrollStateRef = useRef({ activeLine, showTranslation })

  // 自动滚动到当前行
  useEffect(() => {
    const isTranslationToggle = scrollStateRef.current.showTranslation !== showTranslation
    scrollStateRef.current = { activeLine, showTranslation }

    if (isTranslationToggle) {
      // 当切换翻译时，所有上方歌词的高度在 0.4s 内平滑变化
      // 为了防止当前行被挤走，我们在 450ms 内使用每一帧(RAF)紧紧咬住它的位置
      const start = performance.now()
      let frameId: number
      const track = () => {
        const el = lineRefs.current[activeLine]
        const container = containerRef.current
        if (el && container) {
          const target = el.offsetTop - container.clientHeight * 0.25 + el.clientHeight / 2
          container.scrollTo({ top: target, behavior: 'auto' })
        }
        if (performance.now() - start < 450) {
          frameId = requestAnimationFrame(track)
        }
      }
      frameId = requestAnimationFrame(track)
      return () => cancelAnimationFrame(frameId)
    } else {
      // 正常的歌词进度推进，使用原生平滑滚动
      const el = lineRefs.current[activeLine]
      const container = containerRef.current
      if (el && container) {
        const target = el.offsetTop - container.clientHeight * 0.25 + el.clientHeight / 2
        container.scrollTo({ top: target, behavior: 'smooth' })
      }
    }
    return undefined
  }, [activeLine, showTranslation])

  // activeLine 变化时缓存 char 元素（Task 18.2）
  useEffect(() => {
    if (activeLine < 0) {
      charElsRef.current = []
      lastPctRef.current = []
      return
    }
    const el = lineRefs.current[activeLine]
    if (el) {
      charElsRef.current = Array.from(el.querySelectorAll('.lyric-char'))
      lastPctRef.current = new Array(charElsRef.current.length).fill(-1)
    } else {
      charElsRef.current = []
      lastPctRef.current = []
    }
  }, [activeLine, lyrics])

  // RAF 60fps 逐字进度更新
  useEffect(() => {
    if (lyrics.length === 0) return

    const handleVisibility = () => {
      visibleRef.current = !document.hidden
      if (!document.hidden) {
        // 页面重新可见时，如果 RAF 已停止则重新启动
        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(update)
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    const update = () => {
      if (!visibleRef.current) {
        // 页面不可见时停止 RAF
        rafRef.current = 0
        return
      }
      if (lyrics.length === 0) {
        // 歌词为空时停止 RAF
        rafRef.current = 0
        return
      }
      if (activeLine < 0) {
        // 没有活跃行时停止 RAF，等 activeLine 变化时 useEffect 会重新启动
        rafRef.current = 0
        return
      }
      const line = lyrics[activeLine]
      if (!line || !line.words || line.words.length === 0) {
        rafRef.current = requestAnimationFrame(update)
        return
      }
      // AudioEngine.getCurrentTime() 返回秒
      const timeSec = AudioEngine.getCurrentTime()
      const charEls = charElsRef.current
      const lastPcts = lastPctRef.current
      for (let i = 0; i < charEls.length; i++) {
        if (i >= line.words.length) break
        const word = line.words[i]
        // word.start 和 word.duration 都是秒
        const wordStart = word.start
        const wordEnd = wordStart + word.duration
        let pct = 0
        if (timeSec >= wordEnd) pct = 100
        else if (timeSec > wordStart) pct = word.duration > 0 ? ((timeSec - wordStart) / word.duration) * 100 : 100
        // 仅在 pct 变化时才写入 DOM（Task 18.4）
        if (pct !== lastPcts[i]) {
          lastPcts[i] = pct
          ;(charEls[i] as HTMLElement).style.setProperty('--char-pct', pct.toFixed(1) + '%')
        }
      }
      rafRef.current = requestAnimationFrame(update)
    }
    rafRef.current = requestAnimationFrame(update)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      cancelAnimationFrame(rafRef.current)
    }
  }, [lyrics, activeLine])

  // 点击某行 seek（line.time 是秒）
  const handleLineClick = useCallback((line: LyricLine) => {
    AudioEngine.seek(line.time)
  }, [])

  const registerRef = useCallback((el: HTMLDivElement | null, index: number) => {
    lineRefs.current[index] = el
  }, [])

  if (lyrics.length === 0) {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: 0.5,
        fontSize: 15,
      }}>
        暂无歌词
      </div>
    )
  }

  // 图标显示条件：开启配置 + 非中文歌词 + 存在翻译
  const showIcon = showTranslationButton && !isChineseLyric && hasTranslation

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      {showIcon && (
        <button
          onClick={() => setShowTranslation((v) => !v)}
          aria-label={showTranslation ? '隐藏翻译' : '显示翻译'}
          style={{
            position: 'absolute',
            top: 52,
            right: 20,
            zIndex: 10,
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.3)',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            color: showTranslation ? themeColor : 'var(--color-text-faint)',
            transform: showTranslation ? 'scale(1)' : 'scale(0.92)',
            transition: 'background 0.2s, color 0.2s, transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0, 0, 0, 0.5)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0, 0, 0, 0.3)' }}
        >
          <svg viewBox="0 0 1024 1024" width="22" height="22" xmlns="http://www.w3.org/2000/svg">
            <path d="M783.74 366.41H658.37V239.48c0-97.57-79.38-176.95-176.95-176.95H240.26c-97.57 0-176.95 79.38-176.95 176.95v241.16c0 97.57 79.38 176.95 176.95 176.95h125.37v126.93c0 97.57 79.38 176.95 176.95 176.95h241.16c97.57 0 176.95-79.38 176.95-176.95V543.36c0-97.57-79.38-176.95-176.95-176.95zM138.22 480.64V239.48c0-56.26 45.77-102.04 102.04-102.04h241.16c56.26 0 102.04 45.77 102.04 102.04v241.16c0 56.26-45.77 102.04-102.04 102.04H240.26c-56.27 0-102.04-45.77-102.04-102.04z m747.56 303.88c0 56.26-45.77 102.04-102.04 102.04H542.58c-56.26 0-102.04-45.77-102.04-102.04V657.59h40.88c97.57 0 176.95-79.38 176.95-176.95v-39.32h125.37c56.26 0 102.04 45.77 102.04 102.04v241.16zM724.28 174.93c65.16 18.59 119.1 64.64 148 126.35 6.37 13.6 19.86 21.58 33.95 21.58 5.32 0 10.72-1.14 15.86-3.54 18.74-8.77 26.81-31.07 18.04-49.81-38.09-81.36-109.27-142.09-195.29-166.63-19.9-5.68-40.62 5.85-46.29 25.75-5.69 19.89 5.83 40.62 25.73 46.3zM298.98 865.78c-65.16-18.59-119.1-64.64-147.99-126.35-8.77-18.74-31.07-26.81-49.81-18.04-18.74 8.77-26.81 31.07-18.04 49.8 38.09 81.36 109.27 142.09 195.29 166.63 3.43 0.98 6.89 1.45 10.29 1.45 16.31 0 31.31-10.73 36-27.19 5.68-19.9-5.84-40.62-25.74-46.3z" fill="currentColor"/>
            <path d="M418.59 466.75c47.2 0 85.6-38.4 85.6-85.6v-28.97c0-47.2-38.4-85.6-85.6-85.6H392.4v-23.41c0-20.69-16.77-37.46-37.46-37.46s-37.46 16.77-37.46 37.46v23.41h-19.17c-47.2 0-85.6 38.4-85.6 85.6v28.97c0 47.2 38.4 85.6 85.6 85.6h19.17v11.16c0 20.69 16.77 37.46 37.46 37.46s37.46-16.77 37.46-37.46v-11.16h26.19z m0-125.24c5.79 0 10.68 4.89 10.68 10.68v28.97c0 5.79-4.89 10.68-10.68 10.68H392.4v-50.33h26.19z m-120.27 50.33c-5.79 0-10.68-4.89-10.68-10.68v-28.97c0-5.79 4.89-10.68 10.68-10.68h19.17v50.33h-19.17zM736.99 578.24c-6.25-13.94-20.35-22.69-35.6-22.11-15.26 0.58-28.65 10.37-33.82 24.74L593 787.98c-7.01 19.46 3.09 40.92 22.55 47.93 4.19 1.51 8.47 2.22 12.69 2.22 15.35 0 29.75-9.51 35.24-24.78l4.4-12.22h86.91l6.66 14.85c8.46 18.88 30.62 27.32 49.5 18.86s27.32-30.62 18.86-49.5l-92.82-207.1z m-42.14 147.98l11.74-32.61 14.62 32.61h-26.36z" fill="currentColor"/>
          </svg>
        </button>
      )}
      <div
        ref={containerRef}
        className="lyrics-scroll-container"
        style={{
          height: '100%',
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '45vh 5vw 0 5vw',
          textAlign: 'left',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
          maskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
        }}
      >

        {lyrics.map((line, index) => {
          const isActive = activeLine === index
          const dist = activeLine >= 0 ? activeLine - index : 0

          return (
            <LyricLineItem
              key={index}
              line={line}
              index={index}
              isActive={isActive}
              dist={dist}
              showTranslation={showTranslation}
              registerRef={registerRef}
              onLineClick={handleLineClick}
            />
          )
        })}
        
        {/* 用于占位的底部空白，确保最后一句歌词可以一直滚到屏幕上方 25% 处 */}
        <div style={{ height: '75vh' }} />
      </div>
    </div>
  )
}
