# Melodix E2E Test Execution Readiness (TEST_READY)

## 1. Test Runner Command
The E2E test suite must be run from the `e2e-tests` directory. Due to PowerShell execution policy configurations on Windows, use `npx.cmd` or run via bypassing PowerShell execution policy:

```bash
# Navigate to e2e-tests directory
cd e2e-tests

# Run tests
npx.cmd vitest run
```

Or, alternatively:
```powershell
powershell -ExecutionPolicy Bypass -Command "npx vitest run"
```

## 2. Expected Exit Code
- **Success**: `0`
- **Failure**: `1` (or non-zero if test failures or compilation errors occur)

---

## 3. Coverage Count Summary
The test suite consists of **41 tests** distributed across 5 test suites:

| Test Suite File | Count | Description / Target |
|-----------------|-------|----------------------|
| `sidecar.test.ts` | 5 | **Tier 1**: Sidecar endpoints (search, url, pic, lrc, song info) |
| `decoder.test.ts` | 7 | **Tier 1**: QRC native decryption, raw decompression, XML parsing |
| `adversarial.test.ts` | 13 | **Tier 2**: Empty values, negative durations, out-of-range IDs, invalid signatures |
| `adversarial-2.test.ts` | 10 | **Tier 2**: Large XML fuzzing, performance bounds, parallel requests, corrupted files |
| `integration-scenarios.test.ts` | 6 | **Tier 3 & 4**: Cross-feature flow (1 test) and 5 Real-world application scenarios (5 tests) |

### Tier Summary:
1. **Tier 1: Feature Coverage**: **12 tests** (Decryption, Decompression, Parsing, and Sidecar API query types).
2. **Tier 2: Boundary & Corner Cases**: **23 tests** (Invalid hex, empty strings, extremely large files, bad XML structures, and concurrency/throttling).
3. **Tier 3: Cross-Feature Combinations**: **1 test** (Complete flow: Search -> URL -> LRC -> Decrypt -> Parse).
4. **Tier 4: Real-world Application Scenarios**: **5 tests** (Active syncing, Playback Queue, Image Extraction, Lyric Offset/Sync, and Volume Control/Fade/Mute).

---

## 4. Verification Checklist
- [x] Node.js dependencies installed in `e2e-tests`
- [x] Meting Sidecar server processes start and terminate cleanly on port `45015`
- [x] Opaque-box design maintained (no dependence on internals of the Melodix Tauri app)
- [x] Native decryption library tested and fallback decryption verified
- [x] All 5 Tier 4 real-world scenarios successfully verified
- [x] All 41 tests compile and pass with an exit code of `0`
