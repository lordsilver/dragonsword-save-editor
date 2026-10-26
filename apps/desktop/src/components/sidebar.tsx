import { NAV_GROUPS, NAV_ITEMS } from '@/lib/nav';
import { useApp } from '@/lib/store';
import { cn } from '@/lib/utils';

// The screens, grouped the way the game's own menus split them, each with
// how many rows of its kind the save holds.
export function Sidebar() {
  const section = useApp((state) => state.section);
  const setSection = useApp((state) => state.setSection);
  const counts = useApp((state) => state.overview?.counts);
  const version = useApp((state) => state.info?.version);

  return (
    <nav aria-label="Screens" className="flex w-56 shrink-0 flex-col border-r bg-sidebar">
      <div className="flex items-center gap-2.5 px-5 pt-4 pb-3">
        <img src="/icon.png" alt="" className="size-[30px] rounded-md" />
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="font-semibold">DragonSword</span>
          <span className="truncate text-xs text-muted-foreground">Save editor{version ? ` ${version}` : ''}</span>
        </div>
      </div>

      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-3">
        {NAV_GROUPS.map((group) => (
          <div key={group} className={cn('flex flex-col gap-0.5', group === 'Advanced' && 'mt-auto pt-3')}>
            {group !== 'Advanced' && (
              <div className="px-2.5 pt-3.5 pb-1 text-xs font-medium text-muted-foreground first:pt-1.5">{group}</div>
            )}
            {NAV_ITEMS.filter((item) => item.group === group).map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              const count = counts && item.count ? item.count(counts) : 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setSection(item.id)}
                  className={cn(
                    'relative flex h-[34px] w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50',
                    active && 'bg-accent font-medium',
                  )}
                >
                  {active && (
                    <span aria-hidden className="absolute inset-y-2 -left-3 w-[3px] rounded-r-full bg-brand" />
                  )}
                  <Icon
                    aria-hidden
                    className={cn('size-4 shrink-0', active ? 'text-brand' : 'text-muted-foreground')}
                  />
                  <span className="truncate">{item.label}</span>
                  {count > 0 && (
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">{count.toLocaleString()}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
