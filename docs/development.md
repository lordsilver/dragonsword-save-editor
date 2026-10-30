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
- Rust stable with the version in `Cargo.toml` (currently 1.99 or newer).
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

## Browser preview

The UI can run in an ordinary browser against answers recorded from a save, which is how screens are checked without the Tauri window (for example with headless Chrome from WSL). Record a copy of a save, then build and serve the preview:

```bash
cargo run -p dsa-core --example preview_fixture -- /path/to/copy/1000_Slot3.db /tmp/fixtures/fixture.json
DSA_PREVIEW_FIXTURE=/tmp/fixtures pnpm preview:ui
```

Open `http://127.0.0.1:1421/preview.html`. `DSA_PREVIEW_FIXTURE` names one recording or a folder of them; query parameters pick the recording (`fixture=<name>`, default `fixture`), the screen (`section=characters`), the hero (`hero=10001`) and the theme (`theme=light`), and `trace` lists commands the recording does not answer. Read commands replay the recording and edits do nothing. The example only reads the save, but record a copy anyway. Headless Chrome needs `--virtual-time-budget=10000` rather than `--timeout`, which stops the page before it loads the recording.

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

The normal test suite is self-contained. `crates/core/tests/phase0.rs` builds a small encrypted save from a synthetic database and covers the stale-file guard, journal and WAL refusal, backups, dense 64-bit ids, the raw editor's rules, the refusal of a newly broken gem link, the per-hero breakthrough caps, the read-only Mercenary Corps grade, the cooked-dish limit, the schema-version write block, and the no-direct-recruit guard. Two tests need a real save because the schema and the interesting data cannot be synthesized safely. They copy the file to a temporary directory, so the source is never modified.

```bash
DSA_SAVE="$HOME/Games/DragonSword Awakening/DS/Saved/SaveGames/1000/1000_Slot3.db" \
  cargo test -p dsa-core --test real_save -- --ignored

DSA_SAVE="$HOME/Games/DragonSword Awakening/DS/Saved/SaveGames/1000/1000_Slot5.db" \
  cargo test -p dsa-core --test domain_mutations -- --ignored --nocapture
```

`real_save` checks the read path: overview, characters, inventory, teams, skills, loadout, recipes, and a write/reopen round trip. `domain_mutations` exercises every typed mutation, backups, raw updates, the pre-existing broken-link baseline and its repair, and persistence after reopening.

The phase0 fixture writes a plaintext database and then rewrites each page to reserve the 80 bytes SQLCipher needs for its IV and HMAC, because SQLite only exposes that setting through a C file control. The fixture runs `PRAGMA integrity_check` on the rewritten pages before encrypting them.

## 64-bit instance IDs

`ITEM_DBID`, `GEM_DBID`, `COSTUME_DBID`, and `VEHICLE_DBID` are 64-bit values. JavaScript cannot represent all of them exactly: `Number("70000000823123456")` becomes `70000000823123460`. The rules are:
- Rust serializes these IDs as decimal strings.
- The TypeScript API types them as `string`.
- Tauri commands that accept an instance ID take `String` and parse it with the `instance_id` helper.
- Sorting uses `compareDbid`, which compares decimal strings without converting to `Number`.
- Inputs are parsed in Rust, not in the webview, when the value crosses the boundary.

Do not add a command that accepts a 64-bit ID as a JSON number. Raw rowids are 64-bit ids too: `tb_equipment`, `tb_gem`, and `tb_karma` use `ITEM_DBID` as their primary key, so the raw editor addresses rows by string.

## Character recruiting

The editor has no direct recruit write path. `add_character` and `unlock_all_characters` remain as core stubs that refuse every request, so a future caller cannot accidentally insert a row. Do not use `tb_init_character` as a roster: it is the game's new-account seed, with three `NORMAL` starters and twenty `MASTER` rows for what looks like a developer account, and it does not match the characters a save owns. The bundled catalog's `character` category is not a roster either, because it also contains character items (111xxxx) and skins (999xxxx).

The supported route is the game's own shop. Add Fate's Invitation (`ITEM_CID` 1,000,500) as a stackable item, save, then buy the character in game. The game writes the level-1 character row and the purchase record itself. This covers the 11 shop characters; story characters arrive by playing. The editor's job ends at supplying the invitation, so it never has to guess at `tb_character` columns or shop bookkeeping.

## Schema versions

`SUPPORTED_SCHEMA_VERSION` in `crates/core/src/save.rs` is 2. A save with a higher `USER_DB_VERSION` opens for inspection with a warning, but `SaveSession::write` refuses with a `schema` error before touching the file. The version is read from `tb_user`; a save without that column is treated as version 0. Bump the constant only after checking the game's changed columns and adding tests for both the new schema and the old one.

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

The JSON files in `crates/core/data` are embedded at compile time with `include_str!`. The sprite sheet is `apps/desktop/src/assets/sprite.webp` (Git LFS), packed from the game's own textures by `scripts/gen-icons.mjs`; catalog entries carry pixel offsets into its 128-pixel cells. [Game assets](game-assets.md) describes the extraction and how to repeat it.

`items.json`, `item_categories.json` and `recipes.json` are the catalog: every item, hero and familiar, the item categories and every cooking recipe, built from the game's tables by `scripts/gen-catalog.mjs`. `titles.json` and `skills.json` come from `scripts/gen-catalog-extras.mjs`. [Game assets](game-assets.md#the-catalog-from-the-game-tables) gives the rules and the order to run the generators in.

`game.json` holds the game's maths and texts for heroes, equipment, karma, costumes, skills and items, from `scripts/gen-game-data.mjs`; `crates/core/src/gamedata.rs` loads it and computes the hero screen's stats. [Game assets](game-assets.md#game-maths-and-texts) lists what it holds.

`growth.json` holds the game's growth rules: level and EXP tables, skill caps per breakthrough, Mercenary Corps grades, and each region's live limits. `scripts/gen-growth.mjs` generates it from the XML tables extracted from the game's paks; [Game rules](game-rules.md) covers the extraction and what each table gives. Never commit the extracted files. After regenerating, run `cargo test -p dsa-core --lib growth`: its tests pin key rows, so a changed rule fails until it is looked at.

## Packaging

`pnpm desktop:build` uses the Tauri configuration in `apps/desktop/src-tauri/tauri.conf.json` and builds the targets supported by the host. The Windows NSIS installer uses the `both` install mode. The app identifier is `io.github.lordsilver.dragonsword-save-editor`, and settings live in the platform app-data directory under that identifier.

## Continuous integration

`.github/workflows/ci.yml` runs on pushes to `main` and on pull requests, on Ubuntu and Windows. Ubuntu runs Biome, TypeScript, the frontend tests and `cargo fmt`; both build the UI and run Clippy and the Rust tests. The workflows reference actions by major version tag, and `.github/workflows/actions.lock` records the exact commit GitHub runs for each, with the ID of the repository it must come from ([workflow dependency lockfiles](https://docs.github.com/actions/concepts/security/workflow-dependency-lockfiles), a public preview). The lockfile is generated by the [`gh actions-lock`](https://github.com/github/gh-actions-lock) extension at the version CI pins in `ci.yml`; never edit it by hand. After adding or changing a `uses:` line, run `gh actions-lock --no-narrow`, so major tags stay as written, and commit the workflow and the lockfile together. `gh actions-lock --relock` moves to newer releases within each major version; review its diff like a version bump, since a move back to an older commit is not flagged. CI runs `gh actions-lock --verify`.

## Releasing

`.github/workflows/release.yml` builds the Windows NSIS setup (`.exe`) and MSI on a Windows runner and publishes them on a GitHub release with `SHA256SUMS` (and build provenance while the repository is public).
1. Set the version in `[workspace.package]` in `Cargo.toml` (the installers take it from there) and in both `package.json` files, and merge that to `main`. The workflow refuses a tag that does not match `Cargo.toml`.
2. Tag the commit with the release notes in the tag message: the first line is the title, the rest becomes the release notes. `--cleanup=verbatim` keeps Markdown headings.

   ```bash
   git tag -a v0.1.0 --cleanup=verbatim -F notes.txt
   git push origin v0.1.0
   ```

Running the workflow by hand with no tag builds both installers as a workflow artifact without publishing anything. Given an existing tag, it rebuilds that tag and replaces its release.
