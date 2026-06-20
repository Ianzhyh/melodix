# Melodix Human Interface Guidelines (HIG)

> Version 2.0 · June 2026

Welcome to the definitive Melodix Human Interface Guidelines. This document serves as the **absolute source of truth** for designing, building, and evaluating any feature within the Melodix ecosystem. It is modeled after the depth of Apple's HIG and Google's Material Design, but tailored exclusively for Melodix's unique immersive music experience.

**How to use this document:** Read Chapters 1–3 first to internalize the philosophy. Then use the remaining chapters as a reference lookup when building specific features. The [Design Decision Checklist](#25-design-decision-checklist-设计决策检查清单) at the end should be run before every feature ships.

---

## Table of Contents

1. [Core Principles](#1-core-principles-核心原则)
2. [Aesthetic Philosophy](#2-aesthetic-philosophy-美学哲学)
3. [The "Music Room" Metaphor](#3-the-music-room-metaphor-音乐房间隐喻)
4. [Color System & Theming](#4-color-system--theming-颜色系统与主题)
5. [Dynamic Color & Album Art](#5-dynamic-color--album-art-动态色彩与封面)
6. [Glassmorphism Materials](#6-glassmorphism-materials-毛玻璃材质体系)
7. [Shadow & Light Theory](#7-shadow--light-theory-光影理论)
8. [Gradient Usage](#8-gradient-usage-渐变使用规范)
9. [Opacity Scale](#9-opacity-scale-透明度标尺)
10. [Typography](#10-typography-排版规范)
11. [Iconography](#11-iconography-图标规范)
12. [Negative Space & Layout Rhythm](#12-negative-space--layout-rhythm-留白与布局节奏)
13. [Z-Index Spatial System](#13-z-index-spatial-system-z轴空间体系)
14. [Motion & Choreography](#14-motion--choreography-动画与物理编排)
15. [Transition Sequencing & Stagger](#15-transition-sequencing--stagger-过渡时序与错峰动画)
16. [Component Anatomy: Player Bar](#16-component-anatomy-player-bar-播放栏解剖)
17. [Component Anatomy: Sidebar](#17-component-anatomy-sidebar-侧边栏解剖)
18. [Component Anatomy: Song List Row](#18-component-anatomy-song-list-row-歌曲列表行解剖)
19. [Component Patterns](#19-component-patterns-组件模式库)
20. [Loading States & Skeletons](#20-loading-states--skeletons-加载态与骨架屏)
21. [Cursor & Selection Styles](#21-cursor--selection-styles-光标与选区样式)
22. [Keyboard Shortcuts & Focus](#22-keyboard-shortcuts--focus-键盘快捷键与焦点)
23. [Responsive & Window Behavior](#23-responsive--window-behavior-响应式与窗口行为)
24. [Writing & Copy Guidelines](#24-writing--copy-guidelines-文案与语言规范)
25. [Design Decision Checklist](#25-design-decision-checklist-设计决策检查清单)
26. [Anti-Patterns](#26-anti-patterns-绝对禁止的做法)
27. [Naming Conventions](#27-naming-conventions-命名规范)

---

## 1. Core Principles (核心原则)

Before writing any code or drawing any pixels, you must align with the six pillars of the Melodix experience:

1. **Aesthetic Integrity (美学连贯性)**: The app's appearance and behavior must integrate seamlessly with its function. Melodix is a music player; its UI should step back and let the music (represented by album art) dictate the environmental mood.
2. **Fluid Metaphors (流体隐喻)**: Virtual objects should mimic real-world physics. Lists should have momentum when scrolled, buttons should depress when clicked, and menus should slide out with spring tension. Nothing should snap instantly.
3. **Direct Manipulation (直接操纵)**: Users should feel they are directly touching the interface. Dragging a progress bar or swiping a lyric should have zero perceived latency and 1-to-1 movement mapping.
4. **Unobtrusive Feedback (无缝反馈)**: Every action requires acknowledgment, but it should not interrupt the user's flow. Use micro-animations (color shifts, scaling) for minor actions, and transient Toasts for major actions. Avoid blocking modal dialogs unless absolutely destructive.
5. **Contextual Clarity (上下文清晰)**: At any moment, the user must know: *What is playing? Where am I? How do I get back?* The Player Bar and Title Bar must always act as unshakeable anchors.
6. **Progressive Disclosure (渐进式呈现)**: Hide complex settings, deep queue management, and advanced audio configurations until the user explicitly asks for them. Keep the primary interface radically clean.

---

## 2. Aesthetic Philosophy (美学哲学)

### 2.1 The Melodix Identity: "Calm Luxury" (沉静的奢华感)

Melodix's visual identity can be distilled into a single phrase: **"Calm Luxury"**. We draw from the aesthetic lineage of late-night jazz bars, high-end audio equipment, and the quietness of a concert hall before the first note plays.

**What "Calm Luxury" looks like in practice:**
- **Restraint over excess**: If you can communicate with one element, never use two. A single icon is superior to icon + label + tooltip.
- **Whisper, don't shout**: Colors should never scream. Even our primary indigo (`#6366f1`) is used sparingly — it highlights, it doesn't dominate.
- **Weight implies importance**: Heavier font weights (600–700) are reserved exclusively for the most important text on screen. Everything else whispers at 400–500.
- **Emptiness is a feature**: An empty region is not wasted space — it's breathing room that elevates the elements around it.

### 2.2 Visual Hierarchy Through Contrast (通过对比度建立视觉层级)

Your eye should be magnetically drawn to what matters most on any given screen.

**The Hierarchy Stack (from most prominent to least):**
1. **Currently playing song title** — Largest size, heaviest weight, highest opacity.
2. **Album art** — Large, vivid, fully saturated image. Anchors attention.
3. **Section headings** — Bold (600), but smaller than song title.
4. **Individual song/playlist titles in lists** — Medium weight (500), standard size.
5. **Metadata** (artist names, durations, play counts) — Low opacity, small size. Present but unobtrusive.
6. **Borders and dividers** — Almost invisible (4–8% opacity). They organize without shouting.

> [!TIP]
> **The Competition Test:** If two elements on screen are competing for attention, one of them is wrong. Either reduce the visual weight of the less important element, or increase spacing between them to create distinct zones.

### 2.3 The 90/5/5 Color Distribution Rule

- **90% Neutral**: Near-black (dark mode) or near-white (light mode) with subtle alpha variations. Creates visual calm.
- **5% Brand/Primary**: Indigo for active states, selected items, and primary CTAs only. If indigo appears in more than 5% of any screen, it's overused.
- **5% Semantic/Dynamic**: Red (danger/favorite), green (success), and the dynamic album-extracted color.

---

## 3. The "Music Room" Metaphor (音乐房间隐喻)

When designing any new feature, imagine you are arranging furniture in a dark, elegant listening room:

| Room Element | UI Equivalent | Behavior |
| :--- | :--- | :--- |
| The painting on the wall | Album art | Sets the mood and palette of the entire room |
| The bookshelf along the left wall | Sidebar | Always there, never demanding attention |
| The open floor | Main content area | Spacious, breathable, inviting |
| The turntable console | Player Bar | The most premium, tactile object. Never moves. |
| A guest stepping forward | Modal / Drawer | Brief conversation, then politely retreats |
| Ambient room lighting | Dynamic color tint | Changes with the music, never blinding |

**The Litmus Test:** *"Does this new feature feel like it belongs in this room, or does it feel like someone dragged in a fluorescent office lamp?"*

---

## 4. Color System & Theming (颜色系统与主题)

> [!IMPORTANT]
> **Never hardcode HEX or RGB values in component files.** All colors must come from `src/styles/tokens.css`.

### 4.1 Brand & Semantic Colors

| Token | Value | Usage |
| :--- | :--- | :--- |
| `--color-primary` | `#6366f1` (Indigo) | Active states, primary buttons, progress bar highlight |
| `--color-primary-light` | `#818cf8` | Lighter primary variant for hover states |
| `--color-primary-20` | `rgba(99,102,241,0.2)` | Primary glow/halo behind active elements |
| `--color-primary-10` | `rgba(99,102,241,0.1)` | Extremely subtle primary wash |
| `--color-success` | `#10b981` (Emerald) | Success toasts, completed downloads, "online" status |
| `--color-danger` | `#ef4444` (Red) | Error toasts, delete confirmations |
| `--color-favorite` | `#ef4444` (Red) | Heart icon when liked (distinct semantic role from danger) |
| `--color-accent` | `#ec4899` (Pink) | Logo gradient endpoint, special highlights |

### 4.2 Surface Colors

| Token | Dark Mode | Light Mode | Usage |
| :--- | :--- | :--- | :--- |
| `--color-bg` | `#050505` | `#f8fafc` | App background (behind all glass) |
| `--color-bg-elevated` | `#0a0a0b` | `#ffffff` | Cards that don't use glass |
| `--color-bg-card` | `#161a26` | `rgba(255,255,255,0.65)` | Opaque card backgrounds |
| `--color-bg-alt` | `#0f0f14` | — | Splash/loading screen |
| `--color-player-bg` | `rgba(5,5,5,0.45)` | `rgba(255,255,255,0.75)` | Player bar surface |

### 4.3 Text Colors

| Token | Dark Mode | Light Mode | Usage |
| :--- | :--- | :--- | :--- |
| `--color-text` | `rgba(255,255,255,0.95)` | `rgba(15,23,42,0.95)` | Headings, active song title, primary data |
| `--color-text-dim` | `rgba(255,255,255,0.65)` | `rgba(15,23,42,0.65)` | Artist name, subtitle, inactive tab |
| `--color-text-faint` | `rgba(255,255,255,0.45)` | `rgba(15,23,42,0.45)` | Timestamps, footnotes, minor metadata |
| `--color-text-on-dark` | `rgba(255,255,255,0.95)` | `rgba(255,255,255,0.95)` | Text on dark surfaces (both modes) |

### 4.4 Interactive Surface Colors

| Token | Dark Mode | Light Mode | Usage |
| :--- | :--- | :--- | :--- |
| `--color-border` | `rgba(255,255,255,0.04)` | `rgba(15,23,42,0.08)` | Subtle dividers |
| `--color-hover` | `rgba(255,255,255,0.03)` | `rgba(15,23,42,0.04)` | Background on hover |
| `--color-surface-hover` | `rgba(255,255,255,0.06)` | `rgba(15,23,42,0.06)` | Stronger hover for list items |
| `--color-surface-active` | `rgba(255,255,255,0.1)` | `rgba(15,23,42,0.1)` | Pressed/selected state |

---

## 5. Dynamic Color & Album Art (动态色彩与封面)

### 5.1 Color Extraction
When a track plays, Melodix extracts the dominant color from the album cover using a `ColorThief`-style algorithm and stores it in `usePlaybackStore().themeColor`.

### 5.2 Application Rules
- The extracted color is applied as a **radial gradient** emanating from the album art's position in the layout.
- Maximum opacity of the color wash: **20%** in its final rendered state.
- Color transitions between tracks must use a smooth CSS transition of **800ms** duration, `ease-out` timing. (This is one of the few places where CSS transition is acceptable — because it's color-only, not geometry.)
- Never use the extracted color for text or interactive elements — it is exclusively for ambient background tinting.

### 5.3 Album Art Display Rules
| Context | Size | Border Radius | Aspect Ratio |
| :--- | :--- | :--- | :--- |
| Home page card grid | `100%` width, `1:1` | `12px` | Square |
| Player bar thumbnail | `52×52px` | `8px` | Square |
| Immersive/Lyrics view | `clamp(200px, 30vw, 400px)` | `16px` | Square |
| Playlist header | `180×180px` | `16px` | Square |
| Search result row | `44×44px` | `8px` | Square |
| Queue panel item | `40×40px` | `8px` | Square |

- All album art MUST use `object-fit: cover`.
- Always provide a fallback background: `background: var(--color-img-placeholder)`.
- Images should fade in on load using `opacity: 0 → 1` over `200ms`.

---

## 6. Glassmorphism Materials (毛玻璃材质体系)

Not all glass is created equal. We define three material tiers.

### 6.1 Heavy Glass (厚玻璃)
**Use for:** Modals, CustomSelect dropdowns, Queue Drawer, Context menus.
```css
background: rgba(15, 18, 35, 0.4);
backdrop-filter: blur(80px) saturate(1.8);
-webkit-backdrop-filter: blur(80px) saturate(1.8);
border: 1px solid rgba(255, 255, 255, 0.12);
box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
```

### 6.2 Medium Glass (中等玻璃)
**Use for:** Sidebar, Player Bar, Title Bar, Settings cards.
```css
background: rgba(15, 18, 35, 0.2);   /* var(--glass-bg) */
backdrop-filter: blur(40px) saturate(1.5);
-webkit-backdrop-filter: blur(40px) saturate(1.5);
border: 1px solid rgba(255, 255, 255, 0.08);  /* var(--glass-border) */
```

### 6.3 Thin Glass (薄玻璃)
**Use for:** List item hover states, song cards, tooltip backgrounds.
```css
background: rgba(255, 255, 255, 0.03);
backdrop-filter: blur(8px);
border: 1px solid transparent;
```

### 6.4 Construction Checklist
Every glass panel must include ALL of the following:
1. ✅ `background` with low alpha
2. ✅ `backdrop-filter` with blur + saturate
3. ✅ `-webkit-backdrop-filter` (identical, for WebKit engines like Tauri's WebView2)
4. ✅ `border` with subtle glass highlight
5. ✅ `border-radius` (never 0 for floating panels)

---

## 7. Shadow & Light Theory (光影理论)

### 7.1 Light Source
Imagine light comes from directly above and slightly in front of the user. Shadows always fall downward and diffuse outward.

### 7.2 Shadow Principles
- **No sharp drop shadows**: Never use `box-shadow: 0 2px 0 #000`. Shadows must be soft and diffuse.
- **Shadow color in dark mode**: Pure black with low opacity.
- **Shadow color in light mode**: Tinted dark (`rgba(15,23,42,...)`) instead of pure black.
- **Layered shadows**: For deep elevation, use two shadow layers — one tight and one diffuse:
  ```css
  box-shadow: 0 2px 8px rgba(0,0,0,0.15), 0 12px 40px rgba(0,0,0,0.1);
  ```

### 7.3 Shadow Scale

| Component | Dark Mode | Light Mode |
| :--- | :--- | :--- |
| Hover Card | `0 4px 12px rgba(0,0,0,0.1)` | `0 4px 12px rgba(15,23,42,0.08)` |
| Dropdown | `0 8px 24px rgba(0,0,0,0.2)` | `0 8px 24px rgba(15,23,42,0.12)` |
| Modal | `0 20px 60px rgba(0,0,0,0.35)` | `0 20px 60px rgba(15,23,42,0.15)` |
| Toast | `0 8px 32px rgba(0,0,0,0.2)` | `0 8px 32px rgba(15,23,42,0.1)` |
| Player Bar | `0 -10px 40px rgba(0,0,0,0.2)` | `0 -10px 40px rgba(15,23,42,0.06)` |

### 7.4 Inner Glow / Top Highlight
For elevated glass panels, simulate light catching the edge:
```css
border-top: 1px solid rgba(255, 255, 255, 0.06);  /* Dark mode */
border-top: 1px solid rgba(255, 255, 255, 0.5);   /* Light mode */
```

---

## 8. Gradient Usage (渐变使用规范)

### 8.1 When to Use Gradients
- ✅ Logo icon (brand gradient: `--color-primary` → `--color-accent`)
- ✅ Dynamic ambient background wash from album art
- ✅ Skeleton/shimmer loading animation (horizontal sweep)
- ✅ Fading content at scroll edges (mask gradient)
- ❌ Never as button backgrounds (use solid colors)
- ❌ Never as text color (except the logo/brand mark)
- ❌ Never as card backgrounds (use glass instead)

### 8.2 Skeleton Shimmer Gradient
```css
background: linear-gradient(
  90deg,
  rgba(255,255,255,0.03) 25%,
  rgba(255,255,255,0.06) 50%,
  rgba(255,255,255,0.03) 75%
);
background-size: 200% 100%;
animation: shimmer 1.5s infinite;
```

### 8.3 Scroll Fade Mask
When content scrolls behind a fixed header/footer, use a gradient mask to create a soft fade:
```css
mask-image: linear-gradient(to bottom, transparent 0%, black 32px, black calc(100% - 32px), transparent 100%);
```

---

## 9. Opacity Scale (透明度标尺)

Melodix uses a deliberate opacity scale for alpha-based layering:

| Opacity | Token/Usage | Visual Effect |
| :--- | :--- | :--- |
| `0.02` | `--glass-1` | Barely visible. Hover hint on dark surfaces. |
| `0.03` | `--color-hover` | Subtle hover background. |
| `0.04` | `--color-border` | Invisible unless you look closely. Dividers. |
| `0.05` | `--glass-2` | Settings card backgrounds. |
| `0.06` | `--color-surface-hover` | Active hover on list items. |
| `0.08` | `--glass-3`, `--glass-border` | Glass panel borders. Clearly visible. |
| `0.10` | `--color-surface-active` | Pressed/selected item background. |
| `0.15` | `--color-scrollbar` | Scrollbar thumb idle state. |
| `0.20` | `--glass-bg` base | Glass panel background (medium glass). |
| `0.25` | `--color-scrollbar-hover` | Scrollbar thumb on hover. |
| `0.45` | `--color-text-faint` | Timestamps, minor captions. |
| `0.65` | `--color-text-dim` | Subtitles, artist names. |
| `0.95` | `--color-text` | Primary headings, song titles. |

> [!NOTE]
> Never use `opacity: 1` for white text on dark backgrounds. The 0.95 cap creates a subtle softness that reduces eye strain during extended listening sessions.

---

## 10. Typography (排版规范)

### 10.1 Font Stack
```css
font-family: 'Inter Variable', 'Microsoft YaHei', sans-serif;
```
- **Inter Variable**: Primary. Geometric, clean, excellent for UI at all sizes.
- **Microsoft YaHei**: Fallback for Chinese characters. Matches Inter's geometric feel.

### 10.2 Type Scale

| Element | Weight | Size | Color | Line Height | Letter Spacing |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Page Title (H1) | 700 | `32px` | `--color-text` | 1.2 | `-0.02em` |
| Section Title (H2) | 600 | `24px` | `--color-text` | 1.3 | `-0.01em` |
| Subsection (H3) | 600 | `17px` | `--color-text` | 1.4 | `0` |
| Item Title | 500 | `14–16px` | `--color-text` | 1.4 | `0` |
| Body / Description | 400 | `14px` | `--color-text-dim` | 1.5 | `0` |
| Caption / Metadata | 400 | `12px` | `--color-text-faint` | 1.5 | `0.01em` |
| Micro Label | 600 | `10px` | `--color-text-faint` | 1.2 | `0.15em` (uppercase) |

### 10.3 Text Truncation
All song titles, artist names, and playlist names in confined spaces must use:
```css
white-space: nowrap;
overflow: hidden;
text-overflow: ellipsis;
```
Never allow text to wrap and break a list item's height.

### 10.4 Text Anti-Aliasing
For the smoothest rendering on Windows:
```css
-webkit-font-smoothing: antialiased;
-moz-osx-font-smoothing: grayscale;
```

---

## 11. Iconography (图标规范)

### 11.1 Icon Style
- **Stroke-based (outlined)** in idle state. Stroke width: `1.5–2.5px`.
- **Filled** only when toggled active (e.g., heart filled = "liked", play filled = "playing").
- Size: `20×20px` standard, `24×24px` for player controls, within a `32×32px` minimum hit target.
- Color: `var(--color-icon)` default → `var(--color-icon-active)` hover → `var(--color-icon-disabled)` disabled.

### 11.2 Icon Toggle Animation
When an icon state toggles (heart empty → filled), use a scale pop:
```jsx
<motion.svg
  animate={{ scale: isActive ? [1, 1.3, 1] : 1 }}
  transition={{ duration: 0.3 }}
/>
```

### 11.3 Icon vs. Text Decision Matrix

| Scenario | Use |
| :--- | :--- |
| Universally understood (Play, Pause, ❤️, ✕, 🔍) | Icon only |
| Uncommon actions (Save Configuration, Clear Queue) | Text only |
| Navigation items (Home, Search, Settings) | Icon + Text |
| Ambiguous but frequent (Shuffle, Repeat) | Icon + Tooltip on hover |

---

## 12. Negative Space & Layout Rhythm (留白与布局节奏)

### 12.1 Spacing Scale (from `tokens.css`)

| Token | Value | Usage |
| :--- | :--- | :--- |
| `--spacing-xxs` | `4px` | Between title and subtitle in a list item |
| `--spacing-xs` | `8px` | Gap between inline buttons |
| `--spacing-sm` | `12px` | Inner padding of list items (vertical) |
| `--spacing-md` | `16px` | Inner padding of list items (horizontal) |
| `--spacing-lg` | `24px` | Card/section internal padding |
| `--spacing-xl` | `32px` | Page-level top/bottom padding |
| `--spacing-xxl` | `48px` | Vertical gap between major content sections |

### 12.2 Border Radius Scale

| Token | Value | Usage |
| :--- | :--- | :--- |
| `--radius-xs` | `4px` | Tiny elements (progress bar track) |
| `--radius-sm` | `8px` | Buttons, inputs, small thumbnails |
| `--radius-md` | `12px` | Cards, album art, panels |
| `--radius-lg` | `16px` | Large panels, immersive cover art |
| `--radius-xl` | `24px` | Toast pills, large modal dialogs |
| `--radius-full` | `9999px` | Circular buttons, fully rounded pills |

### 12.3 Page-Level Layout
```
┌─────────────────────────────────────────────┐
│  TitleBar (32px height, drag region)        │
├────────┬────────────────────────────────────┤
│        │  padding: 32px 40px               │
│ Side-  │                                    │
│ bar    │  [Content Area]                    │
│ 220px  │                                    │
│        │  padding-bottom: 120px             │
│        │  (clears the player bar)           │
├────────┴────────────────────────────────────┤
│  PlayerBar (88px height, fixed bottom)      │
└─────────────────────────────────────────────┘
```

### 12.4 The "Squint Test"
Squint at your screen until you can no longer read any text. If the layout still looks balanced as abstract shapes and whitespace, you've succeeded. If it looks like a cluttered bulletin board, you need more breathing room.

---

## 13. Z-Index Spatial System (Z轴空间体系)

| Elevation | Z-Index | Component | Shadow |
| :--- | :--- | :--- | :--- |
| Base | `0` | Route Content (Home, Search, Settings) | none |
| Level 1 | `10` | Sidebar | none |
| Level 2 | `50` | Player Bar | upward shadow |
| Level 3 | `60` | Title Bar | none |
| Level 4 | `90` | Overlay/Backdrop | none (darkens screen) |
| Level 5 | `100` | Modals, Queue Drawer, Dropdowns | heavy shadow |
| Level 6 | `120` | Toasts, Tooltips | medium shadow |

> [!WARNING]
> Never use arbitrary z-index values like `999`, `9999`, or `99999`. Always reference this table.

---

## 14. Motion & Choreography (动画与物理编排)

### 14.1 Spring Physics Presets

| Preset Name | `stiffness` | `damping` | Use Case |
| :--- | :--- | :--- | :--- |
| **Snappy** | `400` | `17` | Icon buttons, small interactive elements |
| **Standard** | `300` | `25` | Page transitions, panel entrance/exit |
| **Bouncy** | `350` | `20` | Toasts, attention-grabbing notifications |
| **Heavy** | `260` | `28` | Queue drawer, full-screen lyrics slide |
| **Gentle** | `200` | `30` | Background color transitions, ambient effects |

### 14.2 Interaction States (Required for EVERY interactive element)

| State | Visual Change | Implementation |
| :--- | :--- | :--- |
| **Idle** | Base appearance | Default styles |
| **Hover** | Scale up 2–5%, bg shift | `whileHover={{ scale: 1.02 }}` |
| **Active/Tap** | Scale down 5–10% | `whileTap={{ scale: 0.95 }}` |
| **Focus** | Primary-color outline ring | `:focus-visible { outline: 2px solid var(--color-primary) }` |
| **Disabled** | 30% opacity, no pointer events | `opacity: 0.3; pointer-events: none` |
| **Loading** | Pulse or spinner | `animate={{ opacity: [0.5, 1, 0.5] }}` |

### 14.3 When CSS Transitions ARE Allowed
Only for these specific property changes:
- `color` / `background-color` (duration: `200ms`)
- `opacity` (duration: `150–300ms`)
- `border-color` (duration: `200ms`)
- `box-shadow` (duration: `200ms`)

Everything else (position, scale, width, height, transform) → **Framer Motion springs only**.

---

## 15. Transition Sequencing & Stagger (过渡时序与错峰动画)

### 15.1 List Stagger
When a list of items (songs, playlists) appears, each item should animate in with a slight delay offset:
```jsx
{items.map((item, i) => (
  <motion.div
    key={item.id}
    initial={{ opacity: 0, x: 20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay: i * 0.03, type: 'spring', stiffness: 300, damping: 25 }}
  />
))}
```
- Maximum stagger: `0.03s` per item.
- Cap at 15 items — items beyond 15 should all animate simultaneously to prevent excessive delay.

### 15.2 Section Cascade
When a page loads (e.g., Home page), sections appear top-to-bottom:
- Section 1 (hero): Immediate
- Section 2 (recommendations): +100ms
- Section 3 (playlists): +200ms
- Section 4 (new songs): +300ms

### 15.3 Exit Choreography
When leaving a page, content should fade out and shift slightly downward:
```jsx
exit={{ opacity: 0, y: 10 }}
transition={{ duration: 0.15 }}
```
Exits should always be **faster** than entrances (150ms vs 300ms) to feel snappy.

---

## 16. Component Anatomy: Player Bar (播放栏解剖)

The Player Bar is the most important persistent UI element.

```
┌──────────────────────────────────────────────────────────┐
│  [Progress Bar — full width, 3px height, top edge]       │
├──────────┬──────────────────────┬────────────────────────┤
│ ┌──────┐ │                      │                        │
│ │Cover │ │  Song Title (14px/500)│  ⏮  ▶️/⏸  ⏭          │
│ │52×52 │ │  Artist (12px/400)   │  Shuffle  Repeat       │
│ │ r=8  │ │  ❤️ ··· (actions)     │                        │
│ └──────┘ │                      │  🔊━━━━━━ Volume       │
│  12px gap│                      │  Queue  Lyrics  Quality│
├──────────┴──────────────────────┴────────────────────────┤
│  Height: 88px (var(--player-bar-height))                 │
│  Material: Medium Glass                                  │
│  Position: fixed bottom, full width                      │
└──────────────────────────────────────────────────────────┘
```

**Structural rules:**
- Three sections: Left (track info), Center (playback controls), Right (volume & utilities).
- Progress bar sits at the **very top edge** of the Player Bar, not inset.
- The progress bar expands from 3px to 5px on hover, with a draggable thumb appearing.
- Album art thumbnail uses `layoutId="album-cover"` for seamless morph to immersive view.

---

## 17. Component Anatomy: Sidebar (侧边栏解剖)

```
┌─────────────────────┐
│  ♫ Melodix  (logo)  │  ← 48px top padding, brand gradient icon
│                      │
│  🏠 Home             │  ← Navigation items: 44px height each
│  🔍 Search           │     12px left padding for icon
│  ❤️ Favorites        │     12px gap between icon and text
│  📖 Library          │     Active item: primary bg + white text
│                      │
│  ─────────────────   │  ← Divider: 1px, 4% opacity, 16px margin
│                      │
│  📋 Playlist 1       │  ← User playlists section
│  📋 Playlist 2       │     Same item structure
│  📋 Playlist 3       │     Right-click for context menu
│                      │
│                      │  ← Flexible spacer
│                      │
│  ⚙️ Settings         │  ← Pinned to bottom
│  « Collapse          │  ← Toggle sidebar width
└─────────────────────┘
Width: 220px (expanded) / 60px (collapsed, icon-only)
Material: Medium Glass
```

**Active state:** Background `var(--color-primary)` at 15% opacity, left border accent `3px` solid `var(--color-primary)`, text color `var(--color-text)`.

---

## 18. Component Anatomy: Song List Row (歌曲列表行解剖)

```
┌─────────────────────────────────────────────────┐
│  ┌──────┐  Song Title          Artist    3:42   │
│  │Cover │  14px/500/text       12px/400  12px   │
│  │44×44 │                      text-dim  faint  │
│  │ r=8  │                                       │
│  └──────┘                                       │
│  padding: 8px 12px   gap: 12px between elements │
│  height: ~60px (natural)                        │
│  hover: background var(--color-surface-hover)   │
│  border-radius: 10px on hover                   │
└─────────────────────────────────────────────────┘
```

- Title and artist should both use `text-overflow: ellipsis`.
- Duration is right-aligned, `--color-text-faint`.
- On hover, the entire row gets a subtle glass background.
- On click, the row briefly scales to 0.98 via `whileTap`.

---

## 19. Component Patterns (组件模式库)

### 19.1 Buttons

| Type | Background | Text | Radius | Height |
| :--- | :--- | :--- | :--- | :--- |
| Primary | `--color-primary` solid | White | `9999px` | `40px` |
| Secondary / Ghost | Transparent | `--color-text` | `8px` | `36px` |
| Icon | Transparent | `--color-icon` | `8px` | `32×32px` |
| Destructive | `--color-danger` solid | White | `9999px` | `40px` |
| Pill/Tag | `rgba(255,255,255,0.04)` | `--color-text` | `20px` | `32px` |

### 19.2 Custom Select / Dropdown
**Native `<select>` is strictly forbidden.** Use `CustomSelect`:
- Trigger: `--color-hover` background, `--color-border` edge, rotating SVG chevron.
- Dropdown: **Heavy Glass** material, absolutely positioned, `z-index: var(--z-modal)`.
- Selected item: text in `--color-primary`, background in `--glass-2`.
- Hover item: background in `--glass-1`.

### 19.3 Toggle Switch
- Track: `40×22px`, `border-radius: 11px`.
- Off: `rgba(255,255,255,0.15)` background.
- On: `var(--color-primary)` background.
- Thumb: `18×18px` white circle, spring-animated slide.

### 19.4 Text Input
```css
background: var(--color-hover);
border: 1px solid var(--color-border);
border-radius: 8px;
padding: 10px 14px;
color: var(--color-text);
font-size: 14px;
transition: border-color 0.2s;
```
On focus: `border-color: var(--color-primary)`.

### 19.5 Tooltips
- Appear after **500ms** hover delay (never instantly).
- Position: above the element, centered, with a small `4px` offset.
- Material: Heavy Glass, `border-radius: 6px`, `padding: 6px 10px`, `font-size: 12px`.
- Animate: fade in + slight Y shift over `150ms`.

### 19.6 Context Menu (Right-Click)
- Appears at cursor position.
- Material: Heavy Glass.
- Item height: `36px`, `padding: 0 12px`.
- Hover: `--color-surface-hover` background.
- Separator: `1px solid var(--color-border)`, `8px` vertical margin.
- Exits on click outside or Escape key.

### 19.7 Dividers / Separators
- Horizontal: `height: 1px; background: var(--color-border); margin: 16px 0;`
- Never use `<hr>` with default styling.
- In sidebar: add `16px` left/right margin to create visual inset.

---

## 20. Loading States & Skeletons (加载态与骨架屏)

### 20.1 Philosophy
Never show a blank screen. Always provide a structural preview of what's coming.

### 20.2 Skeleton Component
```jsx
const Skeleton = ({ width, height, borderRadius = 8 }) => (
  <div style={{
    width, height, borderRadius,
    background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s infinite',
  }} />
);
```

### 20.3 Where Skeletons Must Appear
| Scenario | Skeleton Shape |
| :--- | :--- |
| Home page loading | 6 square card skeletons in grid |
| Playlist detail loading | Cover (180×180) + 8 row skeletons |
| Search results loading | 6 row skeletons with circle + lines |
| Lyrics loading | 5 centered line skeletons of varying width |
| Image loading | Same dimensions as final image, shimmer |

### 20.4 Loading Spinners
For inline loading (e.g., a button that triggers an async action), replace the button text with a small spinner:
- Size: `16×16px`
- Color: inherit from parent text
- Animation: `rotate 360deg` over `800ms`, `linear`, infinite
- Never use spinners for full-page loads — use skeletons instead.

### 20.5 Buffering State
When audio is buffering, the play/pause icon in the Player Bar should pulse:
```jsx
animate={{ opacity: [0.4, 1, 0.4] }}
transition={{ duration: 1.5, repeat: Infinity }}
```

---

## 21. Cursor & Selection Styles (光标与选区样式)

### 21.1 Cursor Types

| Element | Cursor |
| :--- | :--- |
| Buttons, links, clickable cards | `cursor: pointer` |
| Text inputs | `cursor: text` |
| Disabled elements | `cursor: not-allowed` |
| Drag handles | `cursor: grab` → `cursor: grabbing` |
| Progress bar / slider | `cursor: pointer` |
| Title bar (drag region) | `cursor: default` (OS handles drag) |
| Resize handles | `cursor: ew-resize` or `cursor: ns-resize` |

### 21.2 Text Selection Color
```css
::selection {
  background: var(--color-primary-20);
  color: var(--color-text);
}
```
This gives selected text a subtle indigo wash that matches the brand.

### 21.3 User-Select Rules
- Song lyrics: `user-select: text` (allow copying).
- UI chrome (buttons, nav): `user-select: none` (prevent accidental selection during interaction).
- Title bar: `user-select: none` + `-webkit-app-region: drag`.

---

## 22. Keyboard Shortcuts & Focus (键盘快捷键与焦点)

### 22.1 Global Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Space` | Play / Pause |
| `←` / `→` | Seek backward / forward 5 seconds |
| `↑` / `↓` | Volume up / down 5% |
| `M` | Mute / Unmute |
| `N` | Next track |
| `P` | Previous track |
| `L` | Toggle lyrics/immersive view |
| `S` | Toggle shuffle |
| `R` | Cycle repeat mode |
| `Ctrl + F` | Focus search input |
| `Escape` | Close any open modal/drawer/menu |

### 22.2 Focus Ring
```css
:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  border-radius: inherit;
}
```
This ring should **only** appear during keyboard navigation (not mouse clicks), which `:focus-visible` handles natively.

### 22.3 Focus Trapping
When a modal or drawer is open, Tab/Shift+Tab must cycle only through elements within that modal. Focus must not escape to the content behind the overlay.

---

## 23. Responsive & Window Behavior (响应式与窗口行为)

### 23.1 Breakpoint Strategy

| Window Width | Sidebar | Content Grid | Notes |
| :--- | :--- | :--- | :--- |
| `≥ 1200px` | Full (220px) | 6 columns small / 4 large | Maximum layout |
| `900–1199px` | Icon-only (60px) | 4 columns / 3 large | Compact sidebar |
| `< 900px` | Hidden (hamburger) | 3 columns / 2 large | Mobile-like |

### 23.2 Content Grid
Use CSS Grid with auto-fill for fluid adaptation:
```css
grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
gap: 20px;
```

### 23.3 Immersive View Scaling
Album art in the full-screen lyrics view must use `clamp()` for smooth scaling:
```css
width: clamp(200px, 30vw, 400px);
```

### 23.4 Minimum Window Size
Melodix should set a minimum window size of `800×600px` via Tauri configuration to prevent unusable layouts.

---

## 24. Writing & Copy Guidelines (文案与语言规范)

### 24.1 Tone of Voice
- **Warm but concise**: "已添加到我喜欢的音乐" ✓ / "操作成功！歌曲已经被成功添加到您的收藏列表中。" ✗
- **Conversational, not robotic**: "Queue is empty" ✓ / "No items found in queue array" ✗
- **Action-oriented buttons**: "Save", "Clear", "Play All" — not "OK", "Submit", "Confirm".

### 24.2 Bilingual Strategy
- **Navigation & Section Titles**: English for international aesthetic.
- **Toast Messages & Descriptions**: Chinese for user warmth.
- **Error Messages**: Chinese, empathetic tone ("无法获取歌单详情，请稍后再试").

### 24.3 Number Formatting
- Play counts above 10,000: display as `1.2万`, not `12,000`.
- Durations: `mm:ss` (e.g., `3:42`), never `03m42s`.
- File sizes: `12.3 MB`, not `12903482 bytes`.

### 24.4 Empty State Copy
| Scenario | Message |
| :--- | :--- |
| Empty queue | "Queue is empty" |
| No search results | "没有找到相关结果，试试其他关键词？" |
| No favorites | "还没有喜欢的音乐，去发现新歌吧" |
| Network error | "网络连接似乎有点问题" |

---

## 25. Design Decision Checklist (设计决策检查清单)

Run this checklist before shipping any new feature:

| # | Question | ✅ Pass |
| :--- | :--- | :--- |
| 1 | Does it belong in the "music room"? | Feels calm, premium, focused |
| 2 | Is the 90/5/5 color rule maintained? | 90% neutral, 5% primary, 5% semantic |
| 3 | Does the squint test pass? | Layout balanced as blurred shapes |
| 4 | Are all colors from `tokens.css`? | No hardcoded hex in components |
| 5 | Does every interactive element have hover + tap? | Scale/bg shift on hover, scale-down on tap |
| 6 | Are animations spring-based? | No `ease-in-out` for geometry changes |
| 7 | Is the glass material tier correct? | Heavy / Medium / Thin matches elevation |
| 8 | Is feedback provided for this action? | Toast, animation, or visual state change |
| 9 | Is there enough negative space? | ≥20px card gap, ≥48px section gap |
| 10 | Does it work at 900px window width? | Content reflows, nothing overlaps |
| 11 | Is the text hierarchy correct? | Only one "loudest" element per zone |
| 12 | Are skeletons shown during loading? | No blank screens, no layout shifts |
| 13 | Is the cursor correct? | Pointer for clickable, text for inputs |
| 14 | Are keyboard shortcuts working? | Space = play/pause, Esc = close |
| 15 | Does light mode look equally premium? | Not washed out or broken |
| 16 | Would you be proud to screenshot this? | If no → iterate |

---

## 26. Design Don'ts & Anti-Patterns (设计排雷指南与反模式)

To maintain the high quality of the application, the following patterns are **strictly prohibited**. These are common mistakes that instantly degrade the "Calm Luxury" feel of Melodix into a cheap, unpolished experience.

### 26.1 Color & Gradient Misuse (色彩与渐变滥用)

🚨 **DO NOT use gradients as component backgrounds**
- **Why:** Gradients on buttons, cards, or sidebars look dated (like 2010s UI) and fight for attention with the album art.
- **Instead:** Use solid colors (`var(--color-primary)`) for buttons, and glassmorphism for panels. The *only* allowed gradients are the logo, skeleton loaders, and the ambient background wash.

🚨 **DO NOT use Pure White (#FFFFFF) on Pure Black (#000000)**
- **Why:** This creates a visual "halation" effect—text appears to vibrate and bleed into the background, causing severe eye strain. Highly saturated colors (neon) do the same.
- **Instead:** Use `rgba(255,255,255,0.95)` on `#0a0a0b`. Desaturate all accent colors slightly when in dark mode.

🚨 **DO NOT use multiple saturated colors together**
- **Why:** Melodix relies on the 90/5/5 rule. Having a green button, a red tag, and an indigo active state all on the same screen creates visual noise.
- **Instead:** Rely on opacity layers of white/black. Save saturated colors exclusively for active states and critical semantic feedback.

🚨 **DO NOT hardcode `#FFF`, `#000`, or `rgba(...)`**
- **Why:** Hardcoded colors will break Dark/Light mode switching. Even `rgba(0,0,0,0.5)` might look wrong on a light theme where shadows need to be tinted.
- **Instead:** Always use `var(--color-text)`, `var(--glass-1)`, etc.

### 26.2 Material & Shadow Errors (材质与阴影错误)

🚨 **DO NOT use `border-radius: 0` on floating elements**
- **Why:** Sharp corners on floating UI elements break the fluid, organic feel of the interface. Glass naturally has rounded, smoothed edges.
- **Instead:** Every card, modal, or floating panel must have at least `var(--radius-sm)` (8px).

🚨 **DO NOT use harsh, dark drop shadows in Dark Mode**
- **Why:** `box-shadow: 0 4px 4px #000` looks like a cheap CSS tutorial. Traditional drop shadows often disappear or look muddy in dark mode.
- **Instead:** In dark mode, elevate elements primarily via **surface lightness** (lighter background = closer) and use highly diffuse, low-opacity shadows.

🚨 **DO NOT stack Glass on top of Glass**
- **Why:** Blurring an already blurred background (e.g., a glass toast over a glass modal over a glass sidebar) creates visual mud, destroys legibility, and tanks GPU performance.
- **Instead:** Limit glass stacking to a maximum of 2 layers. Ensure deep z-index elevation uses distinct opacities rather than compounding blurs.

### 26.3 Animation & Interaction Fails (动画与交互灾难)

🚨 **DO NOT use linear or ease-based CSS transitions for layout**
- **Why:** `transition: all 0.3s ease` for scaling or moving elements feels robotic and stiff. It lacks the momentum and mass of real-world objects.
- **Instead:** Use `framer-motion` spring physics (`type: 'spring', stiffness: 400, damping: 17`) for all geometry changes.

🚨 **DO NOT animate multiple heavy elements simultaneously without stagger**
- **Why:** A list of 20 songs appearing instantly all at once feels overwhelming and can cause frame drops.
- **Instead:** Use Framer Motion's `staggerChildren` or manually delay them (`delay: i * 0.03`) to create a cascading entrance.

🚨 **DO NOT use native `window.alert()` or `window.confirm()`**
- **Why:** Native OS dialogs instantly pull the user out of the app's immersive environment. They are jarring and unstyled.
- **Instead:** Build a custom React modal or use the `ToastContainer` for non-blocking notifications.

### 26.4 Native UI Chrome (原生系统控件的破坏力)

🚨 **DO NOT use native `<select>`, `<input type="range">`, or `<input type="checkbox">`**
- **Why:** Browsers render these controls using the host OS's native styling (e.g., rigid Windows 11 grey dropdowns). This instantly shatters the immersive glassmorphism illusion.
- **Instead:** Build custom components using `div` elements and `framer-motion` (like our `CustomSelect` or custom slider).

🚨 **DO NOT use unstyled OS native scrollbars**
- **Why:** A chunky gray native scrollbar floating on top of a sleek glass interface is a visual disaster.
- **Instead:** Hide scrollbars where possible (`overflow-x: hidden`), or use the globally defined 6px custom webkit scrollbar.

🚨 **DO NOT use native `window.alert()`, `confirm()`, or `prompt()`**
- **Why:** Native OS dialogs pause the JavaScript thread and pull the user out of the app's environment. They cannot be styled.
- **Instead:** Build a custom React modal for blocking choices, or use the `ToastContainer` for non-blocking notifications.

### 26.5 Layout & Typography Sins (布局与排版原罪)

🚨 **DO NOT allow text to wrap in fixed-height list rows**
- **Why:** A song title that wraps to two lines will break the height of the row, ruining the grid rhythm and pushing controls out of alignment.
- **Instead:** Always use `white-space: nowrap; overflow: hidden; text-overflow: ellipsis;` for list items.

🚨 **DO NOT create competing focal points**
- **Why:** If a play button and a prominent "Upgrade" banner are exactly the same size and color, the user's eye gets confused.
- **Instead:** Pick one primary action per screen. Everything else must be visually demoted (smaller size, ghost button style, lower opacity).

---

## 27. Naming Conventions (命名规范)

### 27.1 CSS Token Naming
```
--{category}-{property}-{variant}
```
Examples: `--color-text-dim`, `--glass-border`, `--radius-md`, `--spacing-lg`

### 27.2 Component File Naming
- PascalCase: `PlayerBar.tsx`, `QueuePanel.tsx`, `ToastContainer.tsx`
- Index barrel: `PlayerBar/index.tsx` for complex multi-file components.
- Sub-components: `PlayerBar/Icons.tsx`, `PlayerBar/CommentPanel.tsx`

### 27.3 Store Naming
- camelCase with `Store` suffix: `playbackStore.ts`, `configStore.ts`, `toastStore.ts`
- Hook: `usePlaybackStore`, `useConfigStore`, `useToastStore`

### 27.4 CSS Class Naming (when not inline)
- kebab-case: `song-card`, `play-overlay`, `section-title`, `shimmer-skeleton`
- BEM-style for variants: `nav-item--active`, `card-image--loading`

---

*End of Document · Melodix Design System v2.0*
*By following these guidelines, you contribute to making Melodix a world-class application.*
