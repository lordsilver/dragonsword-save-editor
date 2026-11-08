// Browser preview: the real UI against answers recorded from one save by the
// `preview_fixture` example. Read commands replay the recording; writes do
// nothing. Served only by `pnpm preview:ui`, never built into the app.
//
// Query parameters set the starting view: `fixture` (a recording's name when
// several are served), `section`, `hero` (a CID), `tab` (the hero tab), `theme`, `rewards=off` and
// `undo` for the two world-progress settings, and `trace` to list commands the recording does not
// answer.
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import type { HeroTab, Section, Settings } from '@/lib/types';

type Fixture = Record<string, unknown>;

// Headless screenshots have no console, so failures are printed on the page.
function report(text: string): void {
  const line = document.createElement('pre');
  line.style.cssText =
    'position:fixed;left:0;right:0;bottom:0;z-index:9999;margin:0;padding:8px;background:#7f1d1d;color:#fff;font:12px monospace;white-space:pre-wrap';
  line.textContent = text;
  document.body.append(line);
}
window.addEventListener('error', (event) => report(`error: ${event.message}`));
window.addEventListener('unhandledrejection', (event) =>
  report(`rejection: ${String(event.reason?.stack ?? event.reason)}`),
);

const PER_HERO = new Set(['skills_get', 'loadout_get']);
/** Commands recorded per ID; an ID the recording lacks gets an empty answer. */
const PER_ID = new Set(['chest_loot_get']);

const params = new URLSearchParams(window.location.search);
const theme = (params.get('theme') ?? 'dark') as Settings['theme'];
const settings: Settings = {
  language: 'en',
  theme,
  compactRows: false,
  showUnknown: false,
  lastFolder: null,
  grantRewards: params.get('rewards') !== 'off',
  allowUndo: params.has('undo'),
};

const fixture: Fixture = await fetch(
  `/__preview/fixture.json?name=${encodeURIComponent(params.get('fixture') ?? 'fixture')}`,
).then((response) => response.json());

/**
 * The World map's edits, kept in the recording so they show and stay until
 * "saved", as in the app: a place's done state, whether the session has
 * unsaved changes, and the world before each edit for Undo. Other edits
 * still do nothing.
 */
let previewDirty = false;
let previewRevision = 0;
const previewHistory: Array<{ world: unknown; dirty: boolean }> = [];
function worldEdit(kind: string, ids: number[], done: boolean): number {
  const before = { world: structuredClone(fixture.world_get), dirty: previewDirty };
  const world = fixture.world_get as {
    waypoints: Array<{
      id: number;
      active: boolean;
      statue: { id: number; restored: boolean; found: number; pieces: number } | null;
    }>;
    dungeons: Array<{ id: number; found: boolean }>;
    chests: Array<{ id: number; opened: boolean; released: boolean }>;
  };
  const chosen = new Set(ids);
  let changed = 0;
  for (const waypoint of world.waypoints) {
    if (kind === 'waypoint' && chosen.has(waypoint.id) && waypoint.active !== done) {
      waypoint.active = done;
      changed += 1;
    }
    if (kind === 'statue' && waypoint.statue && chosen.has(waypoint.statue.id) && waypoint.statue.restored !== done) {
      waypoint.statue = { ...waypoint.statue, restored: done, found: done ? waypoint.statue.pieces : 0 };
      waypoint.active = done;
      changed += 1;
    }
  }
  for (const dungeon of world.dungeons) {
    if (kind === 'dungeon' && chosen.has(dungeon.id) && dungeon.found !== done) {
      dungeon.found = done;
      changed += 1;
    }
  }
  for (const chest of world.chests) {
    if (kind === 'chest' && chosen.has(chest.id) && chest.opened !== done) {
      chest.opened = done;
      chest.released ||= done;
      changed += 1;
    }
  }
  if (changed > 0) {
    previewHistory.push(before);
    previewDirty = true;
    previewRevision += 1;
  }
  return changed;
}

mockWindows('main');
mockIPC(
  (command, args) => {
    if (command === 'settings_get' || command === 'settings_set') return settings;
    if (PER_HERO.has(command)) {
      const cid = String((args as { cid: number }).cid);
      return (fixture[command] as Record<string, unknown>)[cid];
    }
    if (PER_ID.has(command)) {
      const id = String((args as { id: number }).id);
      return (fixture[command] as Record<string, unknown> | undefined)?.[id] ?? [];
    }
    if (command === 'slots_scan') return { roots: [], slots: [] };
    if (command === 'world_places_complete' || command === 'world_places_undo') {
      const { kind, ids } = args as { kind: string; ids: number[] };
      const done = worldEdit(kind, ids, command === 'world_places_complete');
      return command === 'world_places_undo'
        ? done
        : { done, alreadyDone: ids.length - done, grant: { granted: [], notGranted: [] }, levelsGained: 0 };
    }
    // A copy, as the app gets from the backend: the World map keeps the last saved one to compare with.
    if (command === 'world_get') return structuredClone(fixture.world_get);
    const handle = () => ({
      ...(fixture.save_current as object),
      dirty: previewDirty,
      undoDepth: previewHistory.length,
      revision: previewRevision,
    });
    if (command === 'save_current') return handle();
    if (command === 'save_undo') {
      const last = previewHistory.pop();
      if (last) {
        fixture.world_get = last.world;
        previewDirty = last.dirty;
        previewRevision += 1;
      }
      return handle();
    }
    if (command === 'save_write') {
      previewDirty = false;
      previewHistory.length = 0;
      const current = fixture.save_current as { path?: string; consistency?: unknown };
      return { backup: null, bytes: 0, path: current.path ?? '', consistency: current.consistency };
    }
    if (command in fixture) return fixture[command];
    if (params.has('trace') && !command.startsWith('plugin:')) report(`unrecorded command: ${command}`);
    return null;
  },
  { shouldMockEvents: true },
);

await import('./main.tsx');

const { useApp } = await import('@/lib/store');
const section = params.get('section') as Section | null;
const hero = params.get('hero');
const tab = params.get('tab') as HeroTab | null;
const unsubscribe = useApp.subscribe((state) => {
  if (!state.booted || !state.save) return;
  unsubscribe();
  if (section) useApp.getState().setSection(section);
  if (tab) useApp.getState().setHeroTab(tab);
  if (hero) void useApp.getState().selectCharacter(Number(hero));
});
