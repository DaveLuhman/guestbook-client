# AGENTS.md for Guestbook Tauri Client (Rust + TypeScript/Vite)

## Project Structure

- `/src-tauri/`: Rust backend code, modularized into:
  - Device management (barcode scanner, swiper)
  - Database (SQLite) access and migration
  - Configuration management
  - IPC command handlers exposed via `#[tauri::command]`
- `/src/`: Frontend TypeScript code with Vite
  - UI components, modals, forms
  - IPC calls to Rust backend via `invoke`
  - Event listeners for backend event streams
- `/public/`: Static assets (images, CSS)
- `vite.config.ts`: Vite config customized for Tauri

## Coding Conventions

### Rust Backend

- Idiomatic Rust with modular separation
- Use `Result<T, E>` with meaningful errors for all IPC commands
- Use async runtime properly (`tokio` or equivalent)
- Avoid blocking calls on main thread
- Clear documentation on public command interfaces
- Port device reconnection logic from existing JS implementation

### TypeScript Frontend

- Use modern ES modules and strict typing
- Prefer small, focused UI components
- Maintain existing app styling (blue theme, modal design)
- Use Tauri's `invoke` and `listen` APIs for backend communication
- Implement password prompts and error dialogs with accessible modals

## IPC and API Handling

- Backend commands replace Electron IPC listeners
- Frontend uses `invoke` to send requests, `listen` to receive events
- Maintain secure and typed IPC message contracts
- Provide rich error feedback on failures

## Database

- Use SQLite in Rust with proper schema migrations
- Provide commands for:
  - Creating guest entries
  - Querying entries (all or filtered)
  - Flushing data
- Ensure transactional integrity and error propagation

## Device Integration

- Port device handling from Node `node-hid` to Rust equivalents or native Tauri plugins
- Manage reconnection attempts in Rust
- Stream device data events to frontend via event listeners

## Styling & UI/UX

- Follow current blue-and-white theme from legacy styles
- Modal dialogs for password prompts, manual entries, and error notifications
- Responsive and accessible UI design
- Sounds played via frontend audio APIs or Tauri plugins

## Testing

- Rust unit and integration tests for backend modules
- Vitest/Jest for frontend UI and service layers
- Mock device inputs and IPC messages for automated tests

## Development & Build

- Use `cargo tauri dev` for live-reloading dev environment
- Use Vite dev server for frontend
- Production build bundles frontend and backend

## Pull Requests

- Clear summaries and issue references
- UI screenshots for visual changes
- All tests must pass before merge

## Checks before merge

```bash
# Rust code formatting and linting
cargo fmt -- --check
cargo clippy

# Rust tests
cargo test

# Frontend linting and tests
npm run lint
npm run test

# Build both frontend and backend
npm run build
cargo tauri build
