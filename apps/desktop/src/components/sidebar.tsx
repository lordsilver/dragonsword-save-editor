import { APP_GROUP, NAV_GROUPS, NAV_ITEMS, type NavItem } from '@/lib/nav';
import { useApp } from '@/lib/store';
import { cn } from '@/lib/utils';

// The screens, grouped the way the game's own menus split them, each with
// how many rows of its kind the save holds and a dot while it has unsaved
// edits. The app's own Settings sits apart at the foot.
export function Sidebar() {
  return (
    <nav aria-label="Screens" className="flex w-56 shrink-0 flex-col border-r bg-sidebar">
      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-3">
        {NAV_GROUPS.map((group) => (
          <div key={group} className="flex flex-col gap-0.5">
            <div className="px-2.5 pt-3.5 pb-1 text-xs font-medium text-muted-foreground first:pt-1.5">{group}</div>
            {NAV_ITEMS.filter((item) => item.group === group).map((item) => (
              <NavButton key={item.id} item={item} />
            ))}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-0.5 border-t px-3 py-2">
        {NAV_ITEMS.filter((item) => item.group === APP_GROUP).map((item) => (
          <NavButton key={item.id} item={item} />
        ))}
      </div>
    </nav>
  );
}

function NavButton({ item }: { item: NavItem }) {
  const active = useApp((state) => state.section === item.id);
  const setSection = useApp((state) => state.setSection);
  const counts = useApp((state) => state.overview?.counts);
  const changes = useApp((state) => state.changes[item.id] ?? 0);
  const Icon = item.icon;
  const count = counts && item.count ? item.count(counts) : 0;

  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={() => setSection(item.id)}
      className={cn(
        'relative flex h-[34px] w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50',
        active && 'bg-accent font-medium',
      )}
    >
      {active && <span aria-hidden className="absolute inset-y-2 -left-3 w-[3px] rounded-r-full bg-brand" />}
      <Icon aria-hidden className={cn('size-4 shrink-0', active ? 'text-brand' : 'text-muted-foreground')} />
      <span className="truncate">{item.label}</span>
      {count > 0 && (
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">{count.toLocaleString()}</span>
      )}
      {changes > 0 && (
        <span
          title={`${changes} unsaved ${changes === 1 ? 'change' : 'changes'}`}
          className={cn('size-1.5 shrink-0 rounded-full bg-brand', count === 0 && 'ml-auto')}
        >
          <span className="sr-only">, unsaved changes</span>
        </span>
      )}
    </button>
  );
}
