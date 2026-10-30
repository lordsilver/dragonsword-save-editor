import { Eye, EyeOff, Languages, Monitor, Moon, Rows3, Rows4, Sun, TriangleAlert } from 'lucide-react';
import { type ThemePreference, useTheme } from '@/components/theme-provider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import { NAV_ITEMS } from '@/lib/nav';
import { useApp } from '@/lib/store';
import { cn } from '@/lib/utils';

const item = 'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs';
const toggle = cn(item, 'hover:bg-accent hover:text-foreground');

const THEMES: Record<ThemePreference, { label: string; icon: typeof Sun; next: ThemePreference }> = {
  system: { label: 'System', icon: Monitor, next: 'light' },
  light: { label: 'Light', icon: Sun, next: 'dark' },
  dark: { label: 'Dark', icon: Moon, next: 'system' },
};

// What is going on: unsaved edits and where they are, what is running, and
// problems found in the save; then the view settings, each switched in place.
export function StatusBar() {
  const save = useApp((state) => state.save);
  const dirty = useApp((state) => state.dirty);
  const draftCount = useApp((state) => state.draftCount);
  const changes = useApp((state) => state.changes);
  const pending = useApp((state) => state.pending);
  const settings = useApp((state) => state.settings);
  const setSettings = useApp((state) => state.setSettings);
  const setSection = useApp((state) => state.setSection);
  const theme = useTheme();

  if (!save) return null;

  const { danglingGemLinks, duplicateGemLinks, teamIssues } = save.consistency;
  const issues = danglingGemLinks.length + duplicateGemLinks.length + teamIssues.length;
  const where = NAV_ITEMS.filter((nav) => (changes[nav.id] ?? 0) > 0);
  const total = where.reduce((sum, nav) => sum + (changes[nav.id] ?? 0), 0);
  const hasChanges = dirty || draftCount > 0;
  const current = THEMES[theme.preference];
  const ThemeIcon = current.icon;

  return (
    <footer className="flex shrink-0 flex-wrap items-center gap-1 border-t bg-sidebar px-3 py-1 text-xs text-muted-foreground">
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={where.length === 0}>
          <button
            type="button"
            title={where.length > 0 ? 'Where the unsaved changes are' : undefined}
            className={cn(item, hasChanges && 'font-medium text-foreground', where.length > 0 && 'hover:bg-accent')}
          >
            <span
              aria-hidden
              className={cn('size-1.5 rounded-full', hasChanges ? 'bg-brand shadow-[0_0_6px_var(--brand)]' : 'bg-ok')}
            />
            {!hasChanges
              ? 'Saved'
              : total > 0
                ? `${total} unsaved ${total === 1 ? 'change' : 'changes'}`
                : 'Unsaved changes'}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Unsaved changes, by screen</DropdownMenuLabel>
          {where.map((nav) => {
            const Icon = nav.icon;
            return (
              <DropdownMenuItem key={nav.id} onSelect={() => setSection(nav.id)}>
                <Icon />
                {nav.label}
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">{changes[nav.id]}</span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {pending && (
        <span className={item}>
          <Spinner className="size-3.5" />
          {pending}
        </span>
      )}
      {issues > 0 && (
        <button
          type="button"
          className={cn(item, 'font-medium text-warn-strong hover:bg-accent')}
          title="Broken links between rows, found when the save was opened"
          onClick={() => setSection('overview')}
        >
          <TriangleAlert aria-hidden className="size-3.5" />
          {issues} {issues === 1 ? 'issue' : 'issues'}
        </button>
      )}
      <span className="flex-1" />
      <button
        type="button"
        title="Catalog language (click to switch)"
        onClick={() => void setSettings({ language: settings.language === 'en' ? 'fr' : 'en' })}
        className={toggle}
      >
        <Languages aria-hidden className="size-3.5" />
        {settings.language === 'en' ? 'English' : 'Français'}
      </button>
      <button
        type="button"
        title="Items the catalog does not know (click to switch)"
        onClick={() => void setSettings({ showUnknown: !settings.showUnknown })}
        className={toggle}
      >
        {settings.showUnknown ? <Eye aria-hidden className="size-3.5" /> : <EyeOff aria-hidden className="size-3.5" />}
        {settings.showUnknown ? 'Unknown items shown' : 'Unknown items hidden'}
      </button>
      <button
        type="button"
        title="Row density (click to switch)"
        onClick={() => void setSettings({ compactRows: !settings.compactRows })}
        className={toggle}
      >
        {settings.compactRows ? <Rows4 aria-hidden className="size-3.5" /> : <Rows3 aria-hidden className="size-3.5" />}
        {settings.compactRows ? 'Compact rows' : 'Comfortable rows'}
      </button>
      <button
        type="button"
        title={`Theme: ${current.label} (click for ${THEMES[current.next].label})`}
        onClick={() => theme.setPreference(current.next)}
        className={toggle}
      >
        <ThemeIcon aria-hidden className="size-3.5" />
        {current.label}
      </button>
    </footer>
  );
}
