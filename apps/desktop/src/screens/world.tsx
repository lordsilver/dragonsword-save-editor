import { Crosshair, Map as MapIcon, Minus, MoreHorizontal, Plus, Route } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmButton, EmptyPanel } from '@/components/common';
import { ItemIcon } from '@/components/item-icon';
import { PageHeader } from '@/components/page';
import { InfoNote } from '@/components/summary';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { formatNumber, itemName, useApp } from '@/lib/store';
import type {
  ChestLock,
  ChestView,
  DungeonView,
  GameText,
  LootDraw,
  MapPlacement,
  MissionKind,
  PlaceKind,
  RegionView,
  WaypointView,
  WorldView,
} from '@/lib/types';
import { cn } from '@/lib/utils';

// The game's own map markers and world maps, written by scripts/gen-world-map.mjs.
const MARKS = import.meta.glob<string>('../assets/map-mark-*.webp', { eager: true, import: 'default' });
const MAPS = import.meta.glob<string>('../assets/world-map-*.webp', { eager: true, import: 'default' });
const markImage = (name: string): string | undefined => MARKS[`../assets/map-mark-${name}.webp`];

type Layer = 'waypoint' | 'statue' | 'legacy' | 'tower' | 'dungeon' | 'chest';
type Show = 'all' | 'todo' | 'done';

/** A place on the map, whatever its kind. */
interface Place {
  key: string;
  layer: Layer;
  id: number;
  region: number | null;
  name: GameText;
  /** Across and down the map image, 0 to 1 inside it. */
  across: number;
  down: number;
  done: boolean;
  waypoint?: WaypointView;
  dungeon?: DungeonView;
  chest?: ChestView;
}

const LAYERS: Array<{ layer: Layer; label: string; mark: string }> = [
  { layer: 'waypoint', label: 'Warp points', mark: 'waypoint' },
  { layer: 'statue', label: 'Statues of Organa', mark: 'statue' },
  { layer: 'legacy', label: "Eona's Legacy", mark: 'legacy-active' },
  { layer: 'tower', label: 'Tower of Trials', mark: 'tower' },
  { layer: 'dungeon', label: 'Dungeons', mark: 'dungeon-found' },
  { layer: 'chest', label: 'Chests', mark: 'chest' },
];

const MISSIONS: Record<MissionKind, string> = {
  TREASUREBOX_OPEN: 'Chests opened',
  MINIGAME: 'Mini-games won',
  DUNGEON_FIND: 'Dungeons found',
  WAYPOINT_OPEN: 'Warp points',
  FIELDSTATUE_COMPLETE: 'Statues restored',
  WINDMILL_OPEN: "Eona's Legacy",
};

const LOCKS: Record<ChestLock, string> = {
  lock: 'Opens once the monsters guarding it are beaten.',
  hide: 'Appears when its mini-game is won.',
  excavation: 'Buried: dig it up.',
  lock_with_key: 'Locked: opens with a key.',
  hide_with_map: 'Hidden: a treasure map shows where.',
};

/** The grade colours of the game's item tiles, for the chest dots. */
const GRADE_DOT: Record<string, string> = {
  normal: '#b8c1cc',
  superior: '#6cc24a',
  rare: '#4aa3ff',
  epic: '#b56cff',
  legendary: '#ffb02e',
};

/** Where world point (x, y) falls on a map image: across and down, 0 to 1 inside it. */
function onMap(map: MapPlacement, x: number, y: number): { across: number; down: number } {
  return { across: (map.y0 + map.size - y) / map.size, down: (x - map.x0) / map.size };
}

function placesOf(world: WorldView, worldId: number, map: MapPlacement): Place[] {
  const places: Place[] = [];
  for (const waypoint of world.waypoints) {
    if (waypoint.world !== worldId) continue;
    const layer: Layer = waypoint.kind;
    places.push({
      key: `w${waypoint.id}`,
      layer,
      id: waypoint.id,
      region: waypoint.region,
      name: waypoint.name,
      ...onMap(map, waypoint.x, waypoint.y),
      done: layer === 'statue' ? (waypoint.statue?.restored ?? waypoint.active) : waypoint.active,
      waypoint,
    });
  }
  for (const dungeon of world.dungeons) {
    if (dungeon.world !== worldId) continue;
    places.push({
      key: `d${dungeon.id}`,
      layer: 'dungeon',
      id: dungeon.id,
      region: dungeon.region,
      name: dungeon.name,
      ...onMap(map, dungeon.x, dungeon.y),
      done: dungeon.found,
      dungeon,
    });
  }
  for (const chest of world.chests) {
    if (chest.world !== worldId) continue;
    places.push({
      key: `c${chest.id}`,
      layer: 'chest',
      id: chest.id,
      region: chest.region,
      name: chest.name,
      ...onMap(map, chest.x, chest.y),
      done: chest.opened,
      chest,
    });
  }
  return places;
}

/** The ids and kind the save edit for a set of places of one layer. */
function editTarget(places: Place[]): { kind: PlaceKind; ids: number[] } | null {
  const first = places[0];
  if (!first || first.layer === 'chest') return null;
  switch (first.layer) {
    case 'statue':
      return {
        kind: 'statue',
        ids: places.flatMap((place) => (place.waypoint?.statue ? [place.waypoint.statue.id] : [])),
      };
    case 'dungeon':
      return { kind: 'dungeon', ids: places.map((place) => place.id) };
    default:
      return { kind: 'waypoint', ids: places.map((place) => place.id) };
  }
}

export function WorldScreen() {
  const world = useApp((state) => state.world);
  const save = useApp((state) => state.save);
  const language = useApp((state) => state.settings.language);
  const pending = useApp((state) => state.pending);
  const setWorldPlaces = useApp((state) => state.setWorldPlaces);
  const openChests = useApp((state) => state.openChests);
  const [layers, setLayers] = useState<Set<Layer>>(() => new Set(['waypoint', 'statue', 'legacy', 'tower', 'dungeon']));
  const [show, setShow] = useState<Show>('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [regionId, setRegionId] = useState<number | null>(null);
  const busy = pending !== null;

  // The editor shows the worlds it has a map image of; Belos has none yet.
  const shown = world?.worlds.find((entry) => entry.map && MAPS[`../assets/world-map-${entry.id}.webp`]) ?? null;
  const map = shown?.map ?? null;
  const places = useMemo(() => (world && shown && map ? placesOf(world, shown.id, map) : []), [world, shown, map]);
  const regions = useMemo(() => world?.regions.filter((region) => region.world === shown?.id) ?? [], [world, shown]);
  const selected = places.find((place) => place.key === selectedKey) ?? null;
  const visible = useMemo(
    () =>
      places.filter(
        (place) =>
          layers.has(place.layer) &&
          (show === 'all' || (show === 'done' ? place.done : !place.done)) &&
          (regionId === null || place.region === regionId || place.key === selectedKey),
      ),
    [layers, places, regionId, selectedKey, show],
  );
  const player =
    world?.player && map && world.player.world === shown?.id ? onMap(map, world.player.x, world.player.y) : null;

  if (!save) return null;
  if (!world) {
    return (
      <div className="space-y-5">
        <PageHeader title="World map" />
        <EmptyPanel
          icon={<MapIcon />}
          title="Loading the world"
          description="Reading the save's warp points, chests and dungeons."
        />
      </div>
    );
  }
  if (!shown || !map) {
    return (
      <div className="space-y-5">
        <PageHeader title="World map" />
        <EmptyPanel
          icon={<MapIcon />}
          title="No world map"
          description="The editor has no map image of these worlds."
        />
      </div>
    );
  }

  const name = (text: GameText) => (language === 'fr' ? text.fr : text.en);
  const warpPoints = places.filter((place) => place.layer === 'waypoint');

  function toggleLayer(layer: Layer): void {
    setLayers((current) => {
      const next = new Set(current);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  }

  function apply(target: Place[], done: boolean): void {
    // A chest only opens, and opening hands out its loot.
    if (target[0]?.layer === 'chest') {
      const shut = target.filter((place) => !place.done).map((place) => place.id);
      if (done && shut.length > 0) void openChests(shut);
      return;
    }
    const edit = editTarget(target);
    if (edit && edit.ids.length > 0) void setWorldPlaces(edit.kind, edit.ids, done);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="World map"
        description={
          <>
            {name(shown.name)} as the game's world map draws it, with every warp point, Statue of Organa, Eona's Legacy,
            dungeon and chest and what this save has done. Click a marker to change it; drag to move, scroll to zoom.
          </>
        }
        actions={
          <ConfirmButton
            title="Activate every warp point?"
            description={`Sets the activation switch of all ${warpPoints.length} warp points of ${shown.name.en} in tb_switch, so you can travel to any of them. Statues of Organa and Eona's Legacy are left as they are.`}
            confirmLabel="Activate all"
            variant="outline"
            size="sm"
            disabled={busy || warpPoints.every((place) => place.done)}
            onConfirm={() => apply(warpPoints, true)}
          >
            <Route />
            Activate every warp point
          </ConfirmButton>
        }
      />

      <div className="flex flex-wrap items-center gap-1.5">
        {LAYERS.map(({ layer, label, mark }) => {
          const all = places.filter((place) => place.layer === layer);
          if (all.length === 0) return null;
          const done = all.filter((place) => place.done).length;
          const on = layers.has(layer);
          return (
            <button
              key={layer}
              type="button"
              aria-pressed={on}
              onClick={() => toggleLayer(layer)}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                on ? 'border-brand/40 bg-brand/10 text-foreground' : 'text-muted-foreground hover:bg-accent',
              )}
            >
              {layer === 'chest' ? (
                <span aria-hidden className="size-2.5 rounded-full bg-[#ffb02e] ring-1 ring-black/30" />
              ) : (
                <img src={markImage(mark)} alt="" className={cn('size-4', !on && 'opacity-50 grayscale')} />
              )}
              {label}
              <span className="numeric text-muted-foreground">
                {formatNumber(done)}/{formatNumber(all.length)}
              </span>
            </button>
          );
        })}
        <div className="ml-auto flex gap-1 rounded-lg bg-muted/60 p-0.5">
          {(
            [
              ['all', 'All'],
              ['todo', 'Not done'],
              ['done', 'Done'],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              size="xs"
              variant={show === value ? 'secondary' : 'ghost'}
              onClick={() => setShow(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <MapView
          image={MAPS[`../assets/world-map-${shown.id}.webp`]}
          places={places}
          visible={visible}
          player={player}
          selectedKey={selectedKey}
          focus={regionId}
          onSelect={setSelectedKey}
        />
        <div className="scroll-thin flex max-h-[max(420px,calc(100svh-17.5rem))] min-h-0 flex-col gap-3 overflow-y-auto">
          {selected ? (
            <PlaceCard
              place={selected}
              regionName={regions.find((region) => region.id === selected.region)?.name ?? null}
              language={language}
              busy={busy}
              onSet={(done) => apply([selected], done)}
              onClose={() => setSelectedKey(null)}
            />
          ) : (
            <InfoNote>Click a marker to see it here and change it.</InfoNote>
          )}
          <RegionList
            regions={regions}
            places={places}
            selected={regionId}
            language={language}
            busy={busy}
            onSelect={(id) => setRegionId((current) => (current === id ? null : id))}
            onApply={apply}
          />
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------- map

/** Map units (one = the map image's side) drawn as this many stage pixels. */
const STAGE = 1000;
const MAX_ZOOM = 14;

function MapView({
  image,
  places,
  visible,
  player,
  selectedKey,
  focus,
  onSelect,
}: {
  image: string | undefined;
  places: Place[];
  visible: Place[];
  player: { across: number; down: number } | null;
  selectedKey: string | null;
  /** A region to zoom to. */
  focus: number | null;
  onSelect: (key: string | null) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const view = useRef({ scale: 1, x: 0, y: 0, fit: 1 });
  /** A press on the map: where it was, whether it became a drag, and the marker under it. */
  const drag = useRef<{ x: number; y: number; moved: boolean; place: string | null } | null>(null);

  // The drawn area: the image and every place, some of which the game's
  // capture leaves just outside it.
  const frame = useMemo(() => {
    let a0 = 0;
    let a1 = 1;
    let d0 = 0;
    let d1 = 1;
    for (const place of places) {
      a0 = Math.min(a0, place.across);
      a1 = Math.max(a1, place.across);
      d0 = Math.min(d0, place.down);
      d1 = Math.max(d1, place.down);
    }
    const margin = 0.02;
    return { a0: a0 - margin, a1: a1 + margin, d0: d0 - margin, d1: d1 + margin };
  }, [places]);
  const width = (frame.a1 - frame.a0) * STAGE;
  const height = (frame.d1 - frame.d0) * STAGE;
  // Each edit reloads the places; the view must not jump back when it does,
  // so the callbacks below read the latest frame from here.
  const latest = useRef({ frame, width, height, places });
  latest.current = { frame, width, height, places };

  const draw = useCallback(() => {
    const { scale, x, y } = view.current;
    const element = stage.current;
    if (!element) return;
    element.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    element.style.setProperty('--inv', String(1 / scale));
  }, []);

  /** Shows a box of map units [a0, a1] × [d0, d1] as large as it fits. */
  const show = useCallback(
    (a0: number, a1: number, d0: number, d1: number) => {
      const box = viewport.current;
      if (!box) return;
      const { frame, width, height } = latest.current;
      const fit = Math.min(box.clientWidth / width, box.clientHeight / height);
      const boxWidth = (a1 - a0) * STAGE;
      const boxHeight = (d1 - d0) * STAGE;
      const wanted = Math.min(box.clientWidth / boxWidth, box.clientHeight / boxHeight);
      const scale = Math.min(fit * MAX_ZOOM, Math.max(fit, wanted));
      const centerX = ((a0 + a1) / 2 - frame.a0) * STAGE;
      const centerY = ((d0 + d1) / 2 - frame.d0) * STAGE;
      view.current = {
        fit,
        scale,
        x: box.clientWidth / 2 - centerX * scale,
        y: box.clientHeight / 2 - centerY * scale,
      };
      draw();
    },
    [draw],
  );
  const fitAll = useCallback(() => {
    const { frame } = latest.current;
    show(frame.a0, frame.a1, frame.d0, frame.d1);
  }, [show]);

  useEffect(() => {
    const box = viewport.current;
    if (!box) return;
    const observer = new ResizeObserver(() => {
      const { scale, fit } = view.current;
      // Keep the zoom the user chose; refit only an unzoomed map.
      if (Math.abs(scale - fit) < 1e-6) fitAll();
      else {
        const { width, height } = latest.current;
        view.current.fit = Math.min(box.clientWidth / width, box.clientHeight / height);
      }
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [fitAll]);

  // Show the whole map, or zoom to a region chosen in the list.
  useEffect(() => {
    const inRegion = focus === null ? [] : latest.current.places.filter((place) => place.region === focus);
    if (inRegion.length === 0) {
      fitAll();
      return;
    }
    // A few of a region's places can sit far from the rest (Orbis Castle has
    // four chests off the map's corner), so the zoom leaves out the outer
    // twentieth on each side of a large region.
    const span = (values: number[]): [number, number] => {
      const sorted = [...values].sort((a, b) => a - b);
      const cut = sorted.length >= 20 ? Math.floor(sorted.length * 0.05) : 0;
      return [sorted[cut] ?? 0, sorted[sorted.length - 1 - cut] ?? 0];
    };
    const [a0, a1] = span(inRegion.map((place) => place.across));
    const [d0, d1] = span(inRegion.map((place) => place.down));
    const pad = 0.03;
    show(a0 - pad, a1 + pad, d0 - pad, d1 + pad);
  }, [fitAll, focus, show]);

  const zoomAt = useCallback(
    (factor: number, pointX: number, pointY: number) => {
      const current = view.current;
      const scale = Math.min(current.fit * MAX_ZOOM, Math.max(current.fit, current.scale * factor));
      const ratio = scale / current.scale;
      view.current = {
        ...current,
        scale,
        x: pointX - (pointX - current.x) * ratio,
        y: pointY - (pointY - current.y) * ratio,
      };
      draw();
    },
    [draw],
  );

  // React's wheel listener is passive, so it cannot keep the page from scrolling.
  useEffect(() => {
    const box = viewport.current;
    if (!box) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = box.getBoundingClientRect();
      zoomAt(event.deltaY < 0 ? 1.25 : 0.8, event.clientX - rect.left, event.clientY - rect.top);
    };
    box.addEventListener('wheel', onWheel, { passive: false });
    return () => box.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  function zoomCenter(factor: number): void {
    const box = viewport.current;
    if (box) zoomAt(factor, box.clientWidth / 2, box.clientHeight / 2);
  }

  const position = (across: number, down: number) => ({
    left: (across - frame.a0) * STAGE,
    top: (down - frame.d0) * STAGE,
  });

  return (
    <div
      ref={viewport}
      role="application"
      aria-label="World map"
      className="relative h-[max(420px,calc(100svh-17.5rem))] cursor-grab touch-none overflow-hidden rounded-xl border bg-[#33bbd5] select-none active:cursor-grabbing"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        // Pointer capture sends the release to the map, so note the marker now.
        const place = (event.target as HTMLElement).closest<HTMLElement>('[data-place]')?.dataset.place ?? null;
        drag.current = { x: event.clientX, y: event.clientY, moved: false, place };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (!start) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (!start.moved && Math.hypot(dx, dy) < 4) return;
        start.moved = true;
        view.current = { ...view.current, x: view.current.x + dx, y: view.current.y + dy };
        start.x = event.clientX;
        start.y = event.clientY;
        draw();
      }}
      onPointerUp={() => {
        const start = drag.current;
        drag.current = null;
        // A click, not a drag: select the marker it was on, or clear the selection.
        if (start && !start.moved) onSelect(start.place);
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      <div ref={stage} className="absolute top-0 left-0 origin-top-left" style={{ width, height }}>
        {image && (
          <img
            src={image}
            alt=""
            draggable={false}
            className="pointer-events-none absolute max-w-none"
            style={{ ...position(0, 0), width: STAGE, height: STAGE }}
          />
        )}
        {visible.map((place) => (
          <Marker
            key={place.key}
            place={place}
            selected={place.key === selectedKey}
            style={position(place.across, place.down)}
            onSelect={onSelect}
          />
        ))}
        {player && (
          <span
            role="img"
            aria-label="You are here"
            className="pointer-events-none absolute z-20 size-4 rounded-full border-2 border-white bg-red-500 shadow-[0_0_0_4px_rgb(239_68_68/0.35)]"
            style={{ ...position(player.across, player.down), transform: 'translate(-50%, -50%) scale(var(--inv))' }}
          />
        )}
      </div>
      <div
        className="absolute right-2.5 bottom-2.5 flex flex-col gap-1"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <Button size="icon-sm" variant="secondary" aria-label="Zoom in" onClick={() => zoomCenter(1.5)}>
          <Plus />
        </Button>
        <Button size="icon-sm" variant="secondary" aria-label="Zoom out" onClick={() => zoomCenter(1 / 1.5)}>
          <Minus />
        </Button>
        <Button size="icon-sm" variant="secondary" aria-label="Show the whole map" onClick={fitAll}>
          <Crosshair />
        </Button>
      </div>
    </div>
  );
}

function markOf(place: Place): string {
  switch (place.layer) {
    case 'legacy':
      return place.done ? 'legacy-active' : 'legacy';
    case 'dungeon':
      return place.done ? 'dungeon-found' : 'dungeon';
    default:
      return place.layer;
  }
}

function Marker({
  place,
  selected,
  style,
  onSelect,
}: {
  place: Place;
  selected: boolean;
  style: { left: number; top: number };
  onSelect: (key: string) => void;
}) {
  const transform = `translate(-50%, -50%) scale(calc(var(--inv) * ${selected ? 1.35 : 1}))`;
  // The mouse selects through the map's press handling; this is for the keyboard.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(place.key);
    }
  };
  if (place.chest) {
    return (
      <button
        type="button"
        data-place={place.key}
        onKeyDown={onKeyDown}
        aria-label={`${place.name.en}${place.done ? ', opened' : ''}`}
        title={`${place.name.en}${place.done ? ' (opened)' : ''}`}
        className={cn(
          'absolute size-2.5 rounded-full ring-1 ring-black/45 outline-none focus-visible:ring-2 focus-visible:ring-white',
          place.done && 'opacity-35',
          selected && 'z-10 ring-2 ring-white',
        )}
        style={{ ...style, transform, backgroundColor: GRADE_DOT[place.chest.grade] ?? GRADE_DOT.normal }}
      />
    );
  }
  return (
    <button
      type="button"
      data-place={place.key}
      onKeyDown={onKeyDown}
      aria-label={`${place.name.en}${place.done ? '' : ', not done'}`}
      title={place.name.en}
      className={cn(
        'absolute z-[1] grid size-7 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white',
        selected && 'z-10 bg-black/35 ring-2 ring-white',
      )}
      style={{ ...style, transform }}
    >
      <img
        src={markImage(markOf(place))}
        alt=""
        draggable={false}
        className={cn(
          'pointer-events-none size-6 drop-shadow-[0_1px_1px_rgb(0_0_0/0.6)]',
          !place.done && 'opacity-55 grayscale',
        )}
      />
    </button>
  );
}

// ----------------------------------------------------------- side panel

function PlaceCard({
  place,
  regionName,
  language,
  busy,
  onSet,
  onClose,
}: {
  place: Place;
  regionName: GameText | null;
  language: string;
  busy: boolean;
  onSet: (done: boolean) => void;
  onClose: () => void;
}) {
  const name = (text: GameText) => (language === 'fr' ? text.fr : text.en);
  const statue = place.waypoint?.statue;
  const lines: ReactNode[] = [];
  let toggle = 'Activated';
  let note: string | null = null;
  switch (place.layer) {
    case 'statue':
      toggle = 'Restored';
      if (statue) lines.push(`${statue.found} of ${statue.pieces} pieces put back`);
      lines.push(place.waypoint?.active ? 'Warp activated' : 'Warp not activated');
      note = 'Restoring puts back every piece and activates its warp; breaking it undoes both.';
      break;
    case 'dungeon':
      toggle = 'Found';
      break;
    case 'chest':
      if (place.chest?.lock) lines.push(LOCKS[place.chest.lock]);
      if (place.chest?.lock && !place.done) lines.push(place.chest.released ? 'Lock open' : 'Still locked');
      break;
    case 'legacy':
      note = "Eona's Legacy is activated in game by its own quest; this sets only its switch.";
      break;
  }
  return (
    <section className="rounded-xl border bg-card/40 p-4">
      <div className="flex items-start gap-3">
        {place.chest ? (
          <span
            aria-hidden
            className="mt-1 size-4 shrink-0 rounded-full ring-1 ring-black/40"
            style={{ backgroundColor: GRADE_DOT[place.chest.grade] ?? GRADE_DOT.normal }}
          />
        ) : (
          <img src={markImage(markOf({ ...place, done: true }))} alt="" className="size-8 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{name(place.name)}</h2>
          <p className="text-xs text-muted-foreground">
            {regionName ? name(regionName) : 'Outside the counted regions'} ·{' '}
            <span className="numeric">#{place.id}</span>
          </p>
        </div>
        <Button size="xs" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
      {lines.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {lines.map((line, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list of lines
            <li key={index}>{line}</li>
          ))}
        </ul>
      )}
      {place.chest ? (
        <ChestContents
          chest={place.chest}
          opened={place.done}
          language={language}
          busy={busy}
          onOpen={() => onSet(true)}
        />
      ) : (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
          <span id="world-place-toggle">{toggle}</span>
          <Switch
            aria-labelledby="world-place-toggle"
            checked={place.done}
            disabled={busy}
            onCheckedChange={(value) => onSet(value)}
          />
        </div>
      )}
      {note && <p className="mt-2 text-xs text-muted-foreground">{note}</p>}
    </section>
  );
}

/** How many options of a long draw the card lists before "and N more". */
const LOOT_OPTIONS = 4;

/**
 * What a chest gives, draw by draw, as its loot table reads, and the button
 * that opens it. Opening rolls the loot the way the game does and hands it
 * out; an opened chest stays opened.
 */
function ChestContents({
  chest,
  opened,
  language,
  busy,
  onOpen,
}: {
  chest: ChestView;
  opened: boolean;
  language: string;
  busy: boolean;
  onOpen: () => void;
}) {
  const chestLoot = useApp((state) => state.chestLoot);
  const [loot, setLoot] = useState<{ id: number; draws: LootDraw[] } | null>(null);
  useEffect(() => {
    let live = true;
    void chestLoot(chest.id).then((draws) => {
      if (live) setLoot({ id: chest.id, draws });
    });
    return () => {
      live = false;
    };
  }, [chest.id, chestLoot]);
  const draws = loot?.id === chest.id ? loot.draws : null;
  const count = (min: number, max: number) =>
    min === max ? formatNumber(min) : `${formatNumber(min)}–${formatNumber(max)}`;

  return (
    <div className="mt-3 space-y-3">
      <div>
        <h3 className="text-xs font-medium text-muted-foreground">Inside</h3>
        {draws === null ? (
          <p className="mt-1 text-sm text-muted-foreground">Reading its loot…</p>
        ) : draws.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">Nothing.</p>
        ) : (
          <ul className="mt-1.5 space-y-2 text-sm">
            {draws.map((draw, index) => {
              const options = [...draw.options].sort((a, b) => b.chance - a.chance);
              const shown = options.slice(0, LOOT_OPTIONS);
              const single = options.length === 1;
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: draws are listed in their table's order
                <li key={index}>
                  {!single && (
                    <div className="text-xs text-muted-foreground">
                      {draw.times > 1 ? `${draw.times} picks` : 'One pick'} from {options.length}
                      {draw.chance < 1 && `, ${Math.round(draw.chance * 100)}% chance`}:
                    </div>
                  )}
                  <ul className={cn('space-y-1', !single && 'mt-1')}>
                    {shown.map((option, at) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: one item can appear with several counts
                      <li key={at} className="flex items-center gap-2">
                        <ItemIcon item={option.item} size={22} className="shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{itemName(option.item, language)}</span>
                        <span className="numeric text-xs text-muted-foreground">
                          {single && draw.times > 1 ? `${draw.times} × ` : ''}
                          {count(option.min, option.max)}
                          {!single && ` · ${(option.chance * 100).toFixed(option.chance < 0.1 ? 1 : 0)}%`}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {options.length > shown.length && (
                    <div className="mt-0.5 text-xs text-muted-foreground">and {options.length - shown.length} more</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {opened ? (
        <p className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">Opened. An opened chest stays opened.</p>
      ) : (
        <>
          <Button className="w-full" disabled={busy || !chest.loot} onClick={onOpen}>
            Open the chest
          </Button>
          <p className="text-xs text-muted-foreground">
            Opening rolls its loot the way the game does and adds it to the save. It cannot be undone.
          </p>
        </>
      )}
    </div>
  );
}

function RegionList({
  regions,
  places,
  selected,
  language,
  busy,
  onSelect,
  onApply,
}: {
  regions: RegionView[];
  places: Place[];
  selected: number | null;
  language: string;
  busy: boolean;
  onSelect: (id: number) => void;
  onApply: (places: Place[], done: boolean) => void;
}) {
  const name = (text: GameText) => (language === 'fr' ? text.fr : text.en);
  // Opening a region's chests hands out a lot of loot at once and cannot be undone.
  const [confirm, setConfirm] = useState<{ region: string; target: Place[] } | null>(null);
  const shut = confirm?.target.filter((place) => !place.done).length ?? 0;
  return (
    <section className="rounded-xl border bg-card/40">
      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Open every chest in {confirm?.region}?</AlertDialogTitle>
            <AlertDialogDescription>
              Opens {formatNumber(shut)} {shut === 1 ? 'chest' : 'chests'} and adds their loot to the save, rolled the
              way the game rolls it. Opened chests stay opened.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm) onApply(confirm.target, true);
                setConfirm(null);
              }}
            >
              Open {formatNumber(shut)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <header className="border-b px-4 py-3">
        <h2 className="font-semibold">Regions</h2>
        <p className="text-xs text-muted-foreground">
          What the game's world map counts in each region. Click one to zoom to it.
        </p>
      </header>
      <ul className="divide-y">
        {regions.map((region) => {
          const done = region.missions.reduce((sum, mission) => sum + mission.done, 0);
          const total = region.missions.reduce((sum, mission) => sum + mission.total, 0);
          const here = (layer: Layer) => places.filter((place) => place.layer === layer && place.region === region.id);
          const actions: Array<{ label: string; target: Place[]; done: boolean }> = [
            { label: 'Activate the warp points', target: here('waypoint'), done: true },
            { label: "Activate Eona's Legacy", target: here('legacy'), done: true },
            { label: 'Restore the statues', target: here('statue'), done: true },
            { label: 'Mark the dungeons found', target: here('dungeon'), done: true },
            { label: 'Open every chest', target: here('chest'), done: true },
          ];
          return (
            <li key={region.id} className={cn('px-4 py-2.5', selected === region.id && 'bg-accent/60')}>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-pressed={selected === region.id}
                  onClick={() => onSelect(region.id)}
                  className="min-w-0 flex-1 truncate text-left text-sm font-medium outline-none hover:underline focus-visible:underline"
                >
                  {name(region.name)}
                </button>
                <span className="numeric text-xs text-muted-foreground">
                  {total > 0 ? Math.round((done / total) * 100) : 0}%
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon-xs" variant="ghost" aria-label={`Change ${name(region.name)}`} disabled={busy}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-56">
                    <DropdownMenuLabel>{name(region.name)}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {actions
                      .filter((action) => action.target.some((place) => place.done !== action.done))
                      .map((action) => (
                        <DropdownMenuItem
                          key={action.label}
                          onSelect={() =>
                            action.target[0]?.layer === 'chest'
                              ? setConfirm({ region: name(region.name), target: action.target })
                              : onApply(action.target, action.done)
                          }
                        >
                          {action.label}
                        </DropdownMenuItem>
                      ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {region.missions.map((mission) => (
                  <span key={mission.kind} className={cn(mission.done === mission.total && 'text-foreground')}>
                    {MISSIONS[mission.kind] ?? mission.kind}{' '}
                    <span className="numeric">
                      {mission.done}/{mission.total}
                    </span>
                  </span>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
        Mini-games are counted but not changed here: winning one in game also spawns its chest.
      </p>
    </section>
  );
}
