# Project: Melodix

## Architecture
- React 19 + TypeScript + Vite frontend inside Tauri 2.0 Webview.
- Express + meting API server sidecar written in Node.js, built into a standalone executable using `pkg`.
- Communication: Frontend fetches from local Express sidecar running on port 3000 (with fallback check logic if needed).
- Audio Playback: Handled directly in frontend Webview via HTML5 Audio API.
- QRC Lyrics: Fetched from QQ Music and decrypted/parsed using Triple DES EDE3-ECB and zlib raw deflate.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | E2E Test Suite | Build the E2E test harness and cover Tiers 1-4 | None | DONE |
| 2 | Scaffold & Sidecar | Init Tauri 2.0 project and package meting-server as sidecar | None | DONE |
| 3 | Core Playback MVP | Implement Zustand store, HTML5 AudioEngine, PlayerBar UI, and SearchPage | M2 | IN_PROGRESS (Conv: ada14d13-5e53-46c7-98b4-dd6171b20db3) |
| 4 | QRC Lyrics Decoding | Parse QRC lyrics using Triple DES and render in synced scroll view | M3 | PLANNED |
| 5 | Dynamic Theme & Polish | node-vibrant theme integration & Glassmorphism polish | M4 | PLANNED |
| 6 | Integration & adversarial hardening | Pass 100% E2E tests and perform adversarial testing (Tier 5) | M1, M5 | PLANNED |

## Code Layout
- `meting-server/` - Node.js Express server + Meting package
- `src-tauri/` - Rust Tauri backend setup + packaged binary
- `src/` - React frontend with subfolders components, stores, api, utils, styles
- `.agents/` - Coordination metadata files for agents

## Interface Contracts
### Frontend ↔ Node.js Sidecar API
- Port: 3000 (localhost)
- Endpoints:
  - `GET /?server=tencent&type=search&keywords=<query>`: returns `Song[]`
  - `GET /?server=tencent&type=url&id=<song_id>`: returns `[{ url: string }]`
  - `GET /?server=tencent&type=lrc&id=<song_id>`: returns encrypted lyric text
  - `GET /?server=tencent&type=pic&id=<song_id>&size=800`: returns cover image stream
