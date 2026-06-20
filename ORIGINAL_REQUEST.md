# Original User Request

## Initial Request — 2026-06-12T06:05:39Z

Build a Windows desktop music player called Melodix using Tauri (Rust) and React. It must use a Node.js sidecar for the Meting API (QQ Music source), parse QRC lyrics, and feature a Glassmorphism UI.

Working directory: D:\IANMUSICD\melodix
Integrity mode: demo

## Requirements

### R1. Scaffold Tauri App with Node Sidecar
Initialize a Tauri 2.0 project with a React 19 + TypeScript frontend. Include a packaged Node.js (Express + `meting`) sidecar to serve QQ Music data (search, url, lyrics, cover) locally without CORS issues.

### R2. Core Playback & State
Implement HTML5 audio playback in the frontend WebView, driven by a Zustand store managing queue, progress, volume, and current song. Include a Search page and a fixed Player bar.

### R3. QRC Lyrics & UI
Implement QRC lyrics parsing using AES-ECB decryption to extract per-word timestamps. Render these in a synced LyricsView. The UI must feature a dynamic glassmorphism theme based on album art colors.

### R4. QRC Lyrics Skill
Use the available `qrc-lyrics` skill in your environment to obtain the specific AES-ECB key, decode logic, and reference materials needed for decoding the lyrics.

## Acceptance Criteria

### Core Logic (Programmatic Verification)
- [ ] A test script can successfully launch the Node sidecar, query a song, and receive valid JSON within 3 seconds.
- [ ] The QRC Decoder successfully parses a known base64 QRC payload into an array of lines and word-level timestamps without throwing an error.

### UI & Integration (Agent-as-Judge / Manual Verification)
- [ ] The application successfully builds with `npm run tauri build` without compilation errors.
- [ ] The main window opens with a transparent/glassmorphism background (Mica or Acrylic).
- [ ] The user can search for a song, play it, and the synchronized lyrics correctly highlight over time in the Lyrics View.
