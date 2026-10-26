// Browser preview: the real UI against answers recorded from one save by the
// `preview_fixture` example. Read commands replay the recording; writes do
// nothing. Served only by `pnpm preview:ui`, never built into the app.
//
// Query parameters set the starting view: `fixture` (a recording's name when
// several are served), `section`, `hero` (a CID), `tab` (the hero tab), `theme`, and `trace` to list
// commands the recording does not answer.
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

const params = new URLSearchParams(window.location.search);
const theme = (params.get('theme') ?? 'dark') as Settings['theme'];
const settings: Settings = { language: 'en', theme, compactRows: false, showUnknown: false, lastFolder: null };

const fixture: Fixture = await fetch(
  `/__preview/fixture.json?name=${encodeURIComponent(params.get('fixture') ?? 'fixture')}`,
).then((response) => response.json());

mockWindows('main');
mockIPC(
  (command, args) => {
    if (command === 'settings_get' || command === 'settings_set') return settings;
    if (PER_HERO.has(command)) {
      const cid = String((args as { cid: number }).cid);
      return (fixture[command] as Record<string, unknown>)[cid];
    }
    if (command === 'slots_scan') return { roots: [], slots: [] };
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
