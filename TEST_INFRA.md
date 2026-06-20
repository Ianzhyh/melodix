# Melodix E2E Test Infrastructure Documentation

## 1. Test Philosophy
The testing strategy for Melodix is designed around the **opaque-box** testing model. This ensures that:
- Tests depend exclusively on external interfaces (REST endpoints, decrypted data formats, public APIs) and never on internal implementation details or classes of the frontend UI.
- The test suite is **requirement-driven** and **interface-compatible**, facilitating future refactoring of internal application code without breaking tests.
- Testing is organized progressively into tiers, from isolated features up to complex, real-world multi-feature scenarios.

---

## 2. Feature Inventory
The Melodix E2E test suite covers the following core features:

### A. Meting Sidecar API
- Integrates with external music platforms (Tencent Music) through a local Node.js sidecar server.
- Supports search query execution (`/search`), play URL retrieval (`/url`), cover picture retrieval (`/pic`), and encrypted/decrypted lyric fetching (`/lrc`).
- Enforces proper query parameters (`server`, `type`, `keywords`, `id`).

### B. QRC Lyric Decryptor & Parser
- **Decryption**: Decrypts QQ Music's proprietary Triple DES encrypted QRC lyrics. Uses both a high-performance native binding decryptor and a fallback CryptoJS implementation.
- **Decompression**: Handles raw zlib deflate decompression of decrypted binary payloads.
- **Parsing**: Parses XML lyric content structure to extract line-level and syllable-level (word-level) timestamps, text, and durations.

### C. Playback Queue & State Manager
- Simulates state transitions and playback queue management (adding songs, next, previous, skip next, clear).
- Simulates volume controls, mute/unmute behavior with memory tracking, and volume fading transitions.

---

## 3. Test Architecture
The test runner is built on **Vitest** and **TypeScript** for fast, native ESModule execution:
- **Sidecar Lifecycle Manager**: Starts the Node.js `meting-server` before tests run and cleans up the process afterwards using the `helpers/sidecar-runner.ts` module.
- **Test Fixtures**: Pre-recorded QRC hex strings and parsed lyric formats are stored in `fixtures/qrc-fixtures.ts` to allow testing decoders and parsers offline without hitting network rate limits.
- **Adversarial & Stress Tests**: Contains randomized input fuzzing, massive XML inputs, and execution time bounds to prevent performance regressions.

---

## 4. Scenario Details (Tier 4: Real-world Application Scenarios)
The E2E test suite includes 5 real-world integration scenarios simulating user actions and system behavior:

* **Scenario 1: Active Lyric Syncing**
  - Verifies that the syllable parser correctly resolves the active line index and active word/syllable index inside a sentence at any given millisecond during playback.
* **Scenario 2: State Machine / Playback Queue**
  - Tests queue additions (`addSong`, `addSongNext`), playlist navigation (`next`, `prev`), skip features, and clear actions, ensuring correct pointer indexes and boundaries.
* **Scenario 3: Theme Extraction Integration**
  - Fetches the cover image stream from the Meting Sidecar, validates the response status, headers (`content-type: image/png`), and parses the buffer to assert the magic PNG signature (`0x89 0x50 0x4E 0x47`).
* **Scenario 4: Lyric Offset Adjustment / Sync Correction**
  - Tests shifting lyric timestamps using positive/negative offsets (e.g. +/- 500ms) and verifies that active line/word lookups adjust accordingly (e.g. a time of 1500ms with a -500ms offset checks at 1000ms, resolving a different word or line).
* **Scenario 5: Volume Control & Mute Manager**
  - Simulates a volume helper/state-manager that handles volume values (bounded between 0.0 and 1.0), remembers the last volume level upon muting, restores it upon unmuting, and calculates stepped volume levels during fade-in/fade-out transitions.

---

## 5. Coverage Thresholds
The project enforces test count rules and structure across the 4 tiers:
- **Tier 1 (Feature Coverage)**: Ensure every feature has at least 5 baseline test cases covering standard operation.
- **Tier 2 (Boundary & Corner Cases)**: At least 5 tests per feature targeting invalid inputs, empty states, out-of-bounds inputs, and error-handling.
- **Tier 3 (Cross-Feature Combinations)**: End-to-end integration flow matching actual application usage (e.g. search -> play URL -> fetch lyrics -> decrypt -> parse).
- **Tier 4 (Real-world Application Scenarios)**: At least 5 distinct scenarios simulating comprehensive application behaviors.
