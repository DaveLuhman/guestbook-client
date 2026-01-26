# Client (Tauri) Testing Suite Plan

## 0. Mapping from Methodology to This Codebase

| Methodology / Legacy Name | This Codebase |
|---------------------------|---------------|
| barcodeScanner (parseScanData) | `src-tauri/devices/barcode.rs` (inline in `listen_to_barcode`); TS `HIDManager` validates `/^\d{7}$/` before `submit_barcode_entry` |
| magtekSwiper (parseSwipeData) | `src-tauri/devices/magtek.rs` `parse_card_data`; TS `magstripReader` + `HIDManager` for `swipeData` and 7-digit check |
| reconnectionUtility | `src-tauri/hid/manager.rs` (`attempt_reconnect_device`, monitoring loop, hot-plug on Linux) |
| HIDManager (path normalization) | No `normalizePath` in this app; `device.path()` used as-is. `is_barcode_device` / `is_msr_device` for VID/PID. |
| db, GuestEntry | `src-tauri/db/` behind `#[cfg(feature = "db")]`; not in default build. `insert_guest_entry` has a params-order bug vs SQL. |
| configManager (wg_config.json, getSelectedDevice) | `src-tauri/config/config_manager.rs`; file is `gb_config.json`; no device path selection. |
| windowManager, viewer, CSV export, password gating | Not present in this repo. |

---

## 1. Test Stack and Layout

- **Rust (src-tauri/)**: `cargo test` for parsing, validation, config, device-id, and (if enabled) DB. Add `dev-dependencies` as needed (e.g. `tempfile` for config path tests).
- **TypeScript (src/)**: **Vitest** for pure TS logic. Add `vitest` and `@vitest/coverage-v8` (or `v8`) to `devDependencies`, `test` script in `package.json`, and `vitest.config.ts`. No Playwright/E2E in this plan; that can be a follow-up. See **1.1** for naming, locations, and `vitest.config.ts` `include` / `exclude`.

```
┌─────────────────────────────────────────────────────────────────┐
│ Rust (cargo test)                                                │
│  • devices/barcode   • devices/magtek   • config/config_manager  │
│  • config/device_id • validation (main: validate_and_sanitize)   │
│  • db/db (if feature enabled)                                    │
├─────────────────────────────────────────────────────────────────┤
│ TypeScript (Vitest)                                              │
│  • firstRun (validateAndSanitizeUrl)  • types/config             │
│  • ui/entryFeedback  • lib/validateOneCard (if extracted)        │
└─────────────────────────────────────────────────────────────────┘
```

### 1.1 Naming and Cargo/Vitest Locations

We use the pattern `*.unit.test.*`, `*.int.test.*`, `*.e2e.test.*` with the language extension (`.ts` or `.rs`).

**Rust (Cargo)**

- **Unit:** In `src-tauri/src/**/*.rs` inside `#[cfg(test)] mod tests`. No separate `*.unit.test.rs` file; use test names like `fn parse_card_data_unit_extracts_onecard` or a `mod unit_tests` block.
- **Integration:** `src-tauri/tests/*_int_test.rs` (e.g. `config_int_test.rs`). Cargo uses the file stem as the crate name, so dots are avoided. Run: `cargo test` or `cargo test --test config_int_test`. Add `entries_int_test.rs` or `*_e2e_test.rs` when real tests exist (no placeholder-only files).

**TypeScript (Vitest)**

- **Unit:** `src/**/*.unit.test.ts` colocated with source (e.g. `src/types/config.unit.test.ts`, `src/ui/entryFeedback.unit.test.ts`).
- **Integration:** `tests/int/**/*.int.test.ts` (e.g. `tests/int/config.int.test.ts`) when added; create `tests/int/` as needed.
- **E2E:** `tests/e2e/**/*.e2e.test.ts` (e.g. `tests/e2e/smoke.e2e.test.ts`) when added; create `tests/e2e/` as needed.

---

## 2. Layer 1: Pure Logic (Unit Tests)

### 2.1 Rust – Parsing and Validation

| Target | Location | Scope | Notes |
|--------|----------|-------|-------|
| **Barcode parsing** | `src-tauri/src/devices/barcode.rs` | Extract a `parse_barcode_from_buffer(raw: &str) -> Option<String>` (or keep logic inline and test via a `pub(crate)` helper). Tests: `^1234567^` => `"1234567"`; `^12345^` => none (not 7); fallback: 7 or 9 digits-only => accept; 6 digits => none; leading/trailing non-digits stripped. | BARCODE_REGEX + fallback are currently in `listen_to_barcode`; refactor into a testable fn. |
| **Magstripe parsing** | `src-tauri/src/devices/magtek.rs` | Make `parse_card_data` `pub(crate)` (or `#[cfg(test)] pub`). Expand tests: `%B1234567   ^DOE/JOHN^...?` => onecard=`"1234567"`, name=`"DOE/JOHN"`; null bytes / `\0` in input; reject when no 7-digit block, no `^` name, or malformed track; name with `^` inside. | Two tests exist; add edge cases and null-byte handling. |
| **URL validation** | `src-tauri/src/main.rs` | Extract `validate_and_sanitize_url` into a `pub fn` in a new `src-tauri/src/validation.rs` (or `config/url.rs`). Tests: empty => `Err`; `javascript:`, `data:`, `<script` => `Err`; `http://host`, `https://host/path` => `Ok` and trailing slash trimmed; missing scheme => `http://` added; `http://host/` => path `/` preserved; invalid host => `Err`. | Reduces main.rs size and makes the function directly testable. |
| **Device ID** | `src-tauri/src/config/device_id.rs` | `compute_device_id`: when `get_mac_address` is mockable or in tests, assert format (e.g. 6 alphanumeric); fallback when no MAC yields 6-char alphanumeric. `is_zero_mac` / `get_primary_mac_address` can be tested if exposed or via dependency-injection. | `mac_address` may need `#[cfg(test)]` or a wrapper to avoid flaky hardware-dependent tests; document env or mock. |

### 2.2 TypeScript – Pure Functions

| Target | Location | Scope | Notes |
|--------|----------|-------|-------|
| **URL validation (first-run)** | `src/firstRun.ts` | Export `validateAndSanitizeUrl` (or move to `src/lib/validateUrl.ts`). Tests: empty => `{ isValid: false, error }`; `http://example.com`, `https://example.com/path` => `{ isValid: true, url }`; `example.com` => protocol added; trailing slash removed; invalid URL / wrong protocol => `isValid: false`. | Mirrors Rust rules; both must stay in sync. |
| **Config display mapping** | `src/types/config.ts` | Test `configFieldMap` transforms: `server_token` long => `xxxx...yyyy`; short (<=8) => `***`; `first_run` bool => `"Yes"`/`"No"`; missing/empty string => `"Not set"`. | Can test the object's `transform` functions in isolation. |
| **Entry feedback state** | `src/ui/entryFeedback.ts` | Unit-test `getIsEntryFeedbackShowing` before/after `showEntrySuccess`/`showEntryError` and after timeout (mock `setTimeout`/fake timers). `resetEntryDisplay` behavior: when `network-unavailable-state` is absent vs present. | Use `vi.useFakeTimers()` and optionally a lightweight DOM (jsdom or happy-dom) for `document.body`, `getElementById`. |

---

## 3. Layer 2: Local Persistence (Config + File Permissions)

| Target | Location | Scope | Notes |
|--------|----------|-------|-------|
| **Config path resolution** | `src-tauri/src/config/config_manager.rs` | Extract `resolve_config_path` into a callable that can take an optional override (or use `$HOME`/`$XDG_CONFIG_HOME` in tests). Tests: with `ProjectDirs`/temp dir => path under config_dir; fallback to `home/.adosoftware-guestbook/gb_config.json`; fallback to `gb_config.json` when no home. | Use `tempfile` or `directories` test helpers; may need to make `resolve_config_path` injectable or `pub(crate)` with env. |
| **Config load/save/merge** | `src-tauri/src/config/config_manager.rs` | `ConfigManager::new` with a temp path: create dir, save, reload, assert fields. `merge_with_default`: partial JSON; new fields in default (e.g. `camera_preview_enabled`) merged; `first_run` and `camera_preview_enabled` overrides. `save_config`: atomic write (temp + rename); corrupt temp should not overwrite final. | Isolate from real filesystem via temp dir. |
| **Config mutex and `get_config`** | Same | `get_config` returns a clone; `set_*` then `get_config` reflects change. Poisoning is hard to test; document expected behavior only. | |
| **File / directory creation** | Same | If parent of config path does not exist, `save_config` creates it (or `new` does). Test with a temp path whose parent is missing. | |

---

## 4. Layer 3: Device I/O and Reconnection

| Target | Location | Scope | Notes |
|--------|----------|-------|-------|
| **HID device matching (barcode)** | `src-tauri/src/devices/barcode.rs` | `open_symbol_scanner`: unit tests are hardware-dependent; **do not** run on CI without a mock. Prefer: (a) document manual “attach scanner and run test,” or (b) introduce a `HidApi` trait and inject a mock that returns no device / one fake device; test that `open_symbol_scanner` returns `None` or `Some` accordingly. | Low priority if trait abstraction is costly; otherwise optional. |
| **HID device matching (MagTek)** | `src-tauri/src/devices/magtek.rs` | Same as barcode: mock or manual. | |
| **Reconnection rules** | `src-tauri/src/hid/manager.rs` | `attempt_reconnect_device` (or a static helper): when `DeviceConnectionState::Connected`, return `Ok(())` without calling `open_*`. When `open_fn` returns `None`, status becomes `Disconnected`, `error_count` incremented, `Err`. When `Some(device)`, status `Connected`, `listen_fn` invoked (mock `listen_fn` to avoid real HID). `is_barcode_device` / `is_msr_device`: known VID/PID pairs return true; unknown false. | Use a fake `HidApi`/`open_fn`/`listen_fn` if we add a thin abstraction; else test `is_*_device` only. |
| **Consecutive error / backoff** | `src-tauri/src/devices/barcode.rs`, `magtek.rs` | `max_consecutive_errors = 5` then stop and emit `device-status` error. Hard to unit test without mocking `device.read`; document as integration behavior or add a small harness that simulates `read` results. | Optional. |

---

## 5. Layer 4: UI and Command Wiring

| Target | Location | Scope | Notes |
|--------|----------|-------|-------|
| **OneCard validation at IPC boundary** | `src/hid/HIDManager.ts`, `src/ui/modals/manualEntry.ts` | HIDManager: barcode and MagTek handlers only call `invoke('submit_*_entry', { onecard })` when `/^\d{7}$/.test(onecard)`. manualEntry: `currentOneCardInput` length <= 7, submit only if non-empty. **Vitest**: extract a `validateOneCard(s: string): boolean` (or use the regex in a small `src/lib/validateOneCard.ts`) and test: 7 digits => true; 6, 8, non-numeric, empty => false. | Keeps validation testable without `invoke`. |
| **Debounce (barcode)** | `src-tauri/src/main.rs` `submit_barcode_entry` | `LastScannedId` and 15s window: with a mock `ConfigManager` and `LastScannedId`, first submit for `onecard` succeeds; second within 15s returns `Err` with “already submitted recently”; after 15s (or clearing state) succeeds. | Requires injecting or constructing state in tests; possible with a `#[cfg(test)]` or feature. |
| **First-run URL flow** | `src/firstRun.ts` | TS: `validateAndSanitizeUrl` covered in 2.2. Integration with `invoke('validate_and_sanitize_url_command')` and `invoke('submit_first_run_config', ...)` is E2E; not in this plan. | |
| **Config / Manual / Reset modals** | `src/ui/modals/config.ts`, `manualEntry.ts`, `resetConfirmation.ts` | Logic that does not touch DOM: e.g. in config, `updateConfigDisplay` given a `Config` and a mock `document.getElementById` returning a stub with `textContent`; assert it's set. manualEntry: keypad `currentOneCardInput` length cap. resetConfirmation: `handleDeviceReset` flow is mostly `invoke`; mock `invoke` in Vitest and assert calls and `closeResetConfirmation` (if exposed for testing). | Prefer testing pure logic; thin DOM shims only where valuable. |

---

## 6. DB and GuestEntry (Conditional)

`db/db.rs` and `db/mod.rs` are behind `#[cfg(feature = "db")]`; the default build does not include them. **If** the `db` feature is (re)enabled and `Db`/`GuestEntry` are wired into Tauri state and commands:

- **GuestEntry and insert**
  - `insert_guest_entry`: `params!` order must match SQL `(name, entry_time, onecard)`; current `params![entry.onecard, entry.name, entry.entry_time]` is **wrong** (should be `[entry.name, entry.entry_time, entry.onecard]`). A test would catch this.
  - `GuestEntry` creation: reject `onecard` that is not 7-digit (if validation is in Rust); `entry_time` set (e.g. `Utc::now()` or injected).

- **Schema**
  - `Db::new` with `:memory:` or temp path creates the table; `CREATE TABLE IF NOT EXISTS` idempotent.

- **Flush / CSV**
  - Not present in the repo; omit until such a feature exists.

---

## 7. Implementation Order and Notes

1. **Setup**
   - Add Vitest, `vitest.config.ts`, `test` script; `jsdom` or `happy-dom` if DOM is needed for `entryFeedback` or modals.
   - Add Rust `dev-dependencies`: `tempfile` (and optionally `mockall` or similar if we introduce traits for HID/`HidApi`).

2. **High-value, low-effort**
   - Rust: `parse_card_data` (magtek) tests (expose fn, add cases).
   - Rust: `validate_and_sanitize_url` (extract to `validation.rs`, add tests).
   - Rust: `is_barcode_device` / `is_msr_device` (pure).
   - TS: `validateAndSanitizeUrl` (firstRun) and `configFieldMap` transforms.

3. **Medium effort**
   - Barcode: extract `parse_barcode_from_buffer` and add tests.
   - Config: `resolve_config_path`, `load_config`/`merge_with_default`/`save_config` with temp dir.
   - TS: `validateOneCard` and `getIsEntryFeedbackShowing` + fake timers.

4. **Lower priority / integration**
   - Reconnection logic with mocked `open_fn`/`listen_fn`.
   - Debounce in `submit_barcode_entry` with injected state.
   - DB tests when `db` feature is enabled; fix `insert_guest_entry` param order when used.

5. **Out of scope here**
   - E2E (Playwright): first-run, submit flows, menu, modals.
   - Real HID on CI (manual or device farm only).
   - Viewer window, CSV export, password gating (not in codebase).

---

## 8. Files to Add or Change

**Rust**

- **Unit:** Remain in `src-tauri/src/validation.rs`, `devices/magtek.rs`, `devices/barcode.rs`, `config/device_id.rs`, `hid/manager.rs` inside `#[cfg(test)] mod tests` (or `mod unit_tests`). No `*.unit.test.rs` files.
- **New integration:** `src-tauri/tests/config_int_test.rs` (config load/save, `with_path`). Use `tempfile` in `[dev-dependencies]`. Use underscore names because Cargo uses the file stem as the crate name. Add `entries_int_test.rs` when HTTP/mock tests exist.

**TypeScript**

- **Unit:** `src/types/config.unit.test.ts`, `src/firstRun.unit.test.ts` or `src/lib/validateUrl.unit.test.ts`, `src/ui/entryFeedback.unit.test.ts`, `src/lib/validateOneCard.unit.test.ts`.
- **Integration:** `tests/int/*.int.test.ts` when added; create `tests/int/` then.
- **E2E:** `tests/e2e/*.e2e.test.ts` or Playwright when added; create `tests/e2e/` then.

**Shared / config**

- **New:** `src-tauri/src/validation.rs` (or `config/url.rs`) – `validate_and_sanitize_url` extracted from main, plus in-source unit tests.
- **New:** `src/lib/validateUrl.ts` (optional) – shared first-run URL validator used by firstRun.ts; or keep in firstRun and export.
- **New:** `src/lib/validateOneCard.ts` (optional) – `validateOneCard(s: string): boolean` and unit tests.
- **Change:** `src-tauri/src/main.rs` – call `validation::validate_and_sanitize_url` instead of local fn.
- **Change:** `src-tauri/src/devices/magtek.rs` – `parse_card_data` `pub(crate)` and more in-source unit tests.
- **Change:** `src-tauri/src/devices/barcode.rs` – extract parse helper + in-source unit tests (optional in first slice).
- **Change:** `package.json` – `vitest`, `@vitest/coverage-v8`, `happy-dom`; `test`, `test:unit` scripts. Add `test:int`, `test:e2e` when those test dirs exist.
- **New:** `vitest.config.ts` with `include: ['src/**/*.unit.test.ts']` and `exclude: ['node_modules','dist']`. Extend `include` with `tests/int/**` and `tests/e2e/**` when those tests exist.

---

## 9. CI Integration

- **Rust:** `cargo test` in `src-tauri/`. Run one integration binary: `cargo test --test config_int_test` (Cargo does not glob `--test`; list or run all with `cargo test`).
- **Vitest:** `test` = `vitest run` (unit tests in `src/`). `test:unit` = `vitest run src`. Add `test:int` and `test:e2e` when `tests/int/` and `tests/e2e/` exist.
- **Optional:** `cargo test` and `npm run test` (or `npm run test:unit` and `npm run test:int`) in `.github/workflows/ci-arm64.yml` if not already present.
