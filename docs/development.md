# Development

## Repository layout

| Path                     | Purpose                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `crates/core`            | Save format, SQLCipher, catalog, typed queries and mutations, raw table browser, discovery, backups. No window. |
| `apps/desktop/src-tauri` | Tauri 2 commands, application state, settings store, and the window.                                            |
| `apps/desktop/src`       | React 19 frontend: Zustand store, screens, shadcn components, theme.                                            |
| `apps/desktop/test`      | Vitest tests for formatting, ID ordering, and navigation.                                                       |
| `crates/core/data`       | Bundled item, recipe, title, and category catalogs.                                                             |
| `docs`                   | Save format reference, user guide, and this page.                                                               |

The core crate has no Tauri dependency, so the format and mutation tests run without a display server.

## Requirements

- Node.js 24 and pnpm 12 (see `mise.toml`; `mise install` sets both up).
- Rust stable with the version in `Cargo.toml` (currently 1.96 or newer).
- Tauri's Linux dependencies if you build on Linux: `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `patchelf`, and the usual GTK/WebKit development packages.
- On Windows and macOS, the standard Tauri prerequisites for that platform.

## Running and building

```bash
pnpm install
pnpm desktop
```

`pnpm desktop` starts Vite and the Tauri development window. Rust edits restart the app and close the open save.

To produce installers or a bundle:

```bash
pnpm desktop:build
```

The save format uses PBKDF2-HMAC-SHA512 with 256,000 iterations. In an unoptimized `cargo run` build, opening or saving a file can take several seconds; a release build is much faster. This is CPU time in the key derivation, not a hang.

## Checks

```bash
pnpm check          # Biome, typecheck, frontend tests, production build, Rust fmt/clippy/tests
pnpm lint           # Biome only
pnpm lint:fix       # apply Biome formatting and safe fixes
pnpm typecheck      # TypeScript only
pnpm test           # frontend tests only
pnpm build          # production frontend build
cargo fmt --all
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

`pnpm check` is the same gate used before a commit.

## Testing against a real save

The normal test suite is self-contained. Two tests need a real save because the schema and the interesting data cannot be synthesized safely. They copy the file to a temporary directory, so the source is never modified.

```bash
DSA_SAVE="$HOME/Games/DragonSword Awakening/DS/Saved/SaveGames/1000/1000_Slot3.db" \
  cargo test -p dsa-core --test real_save -- --ignored

DSA_SAVE="$HOME/Games/DragonSword Awakening/DS/Saved/SaveGames/1000/1000_Slot5.db" \
  cargo test -p dsa-core --test domain_mutations -- --ignored --nocapture
```

`real_save` checks the read path: overview, characters, inventory, teams, skills, loadout, recipes, and a write/reopen round trip. `domain_mutations` exercises every typed mutation, backups, raw updates, and persistence after reopening.

## 64-bit instance IDs

`ITEM_DBID`, `GEM_DBID`, `COSTUME_DBID`, and `VEHICLE_DBID` are 64-bit values. JavaScript cannot represent all of them exactly: `Number("70000000823123456")` becomes `70000000823123460`. The rules are:
- Rust serializes these IDs as decimal strings.
- The TypeScript API types them as `string`.
- Tauri commands that accept an instance ID take `String` and parse it with the `instance_id` helper.
- Sorting uses `compareDbid`, which compares decimal strings without converting to `Number`.
- Inputs are parsed in Rust, not in the webview, when the value crosses the boundary.

Do not add a command that accepts a 64-bit ID as a JSON number.

## Adding a typed field

1. Add the read to the relevant struct in `crates/core/src/domain.rs`.
2. Add a mutation that validates the column, range, and row count, then calls `touch()`.
3. Expose it in `apps/desktop/src-tauri/src/lib.rs` and register the command in `invoke_handler`.
4. Add a typed wrapper in `apps/desktop/src/lib/api.ts` and a store action in `apps/desktop/src/lib/store.ts`.
5. Render it in the screen. Keep the input controlled and commit on blur or Enter, matching the existing fields.
6. Add a unit test for validation and, when it changes a real table, extend `domain_mutations.rs`.

## Adding a screen

1. Add the section id and label to `apps/desktop/src/lib/nav.ts`.
2. Create `apps/desktop/src/screens/<name>.tsx` and register it in the `SCREENS` map in `apps/desktop/src/app.tsx`.
3. Add a loader case to `loadSection` in the store.
4. Reuse `Page`, `Summary`/`StatTile`, `SearchField`, `EmptyState`, and the shared field components.
5. Apply `compactRows` and `showUnknown` from settings locally, as the other screens do.

## Catalog data

The JSON files in `crates/core/data` are embedded at compile time with `include_str!`. The sprite sheet is `apps/desktop/src/assets/sprite.webp`; catalog entries carry pixel offsets into its 64-pixel cells.

## Packaging

`pnpm desktop:build` uses the Tauri configuration in `apps/desktop/src-tauri/tauri.conf.json` and builds the targets supported by the host. The Windows NSIS installer uses the `both` install mode. The app identifier is `io.github.lordsilver.dragonsword-save-editor`, and settings live in the platform app-data directory under that identifier.
