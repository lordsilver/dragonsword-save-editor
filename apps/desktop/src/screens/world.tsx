import { Crosshair, Map as MapIcon, Minus, Plus, Route, Undo2 } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmButton, EmptyPanel } from '@/components/common';
import { RichText } from '@/components/game-text';
import { ItemIcon } from '@/components/item-icon';
import { PageHeader } from '@/components/page';
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
import { Switch } from '@/components/ui/switch';
import { formatNumber, itemName, useApp } from '@/lib/store';
import type {
  ChestLock,
  ChestView,
  DungeonView,
  GameText,
  LootDraw,
  MapLabel,
  MapPlacement,
  MissionKind,
  PlaceKind,
  QuestMark,
  RegionView,
  WaypointView,
  WorldView,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { CATEGORIES } from './quests';

// The game's own map markers (scripts/gen-map-marks.mjs) and world maps (scripts/gen-world-map.mjs).
const MARKS = import.meta.glob<string>('../assets/map-mark-*.webp', { eager: true, import: 'default' });
const MAPS = import.meta.glob<string>('../assets/world-map-*.webp', { eager: true, import: 'default' });
const PICTURES = import.meta.glob<string>('../assets/map-info-*.webp', { eager: true, import: 'default' });
const markImage = (name: string): string | undefined => MARKS[`../assets/map-mark-${name}.webp`];
const questImage = (mark: number): string | undefined => markImage(`quest-${String(mark).padStart(2, '0')}`);

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
  { layer: 'legacy', label: "Eona's Legacy", mark: 'legacy' },
  { layer: 'tower', label: 'Tower of Trials', mark: 'tower' },
  { layer: 'dungeon', label: 'Dungeons', mark: 'dungeon' },
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

/** The places each region mission counts; its row's Complete marks the rest of them done. */
const STEPS: Partial<Record<MissionKind, { layer: Layer }>> = {
  WAYPOINT_OPEN: { layer: 'waypoint' },
  WINDMILL_OPEN: { layer: 'legacy' },
  FIELDSTATUE_COMPLETE: { layer: 'statue' },
  DUNGEON_FIND: { layer: 'dungeon' },
  TREASUREBOX_OPEN: { layer: 'chest' },
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

/**
 * How far north of its point the game draws a warp point's and a statue's
 * marker, in world units (DLayerMap's WayPointCorrectionDistance and
 * StatueCorrectionDistance), so that the pin's tip, not its middle, is on the
 * place. Every other marker is centred on its point.
 */
const MARK_LIFT: Partial<Record<Layer, number>> = { waypoint: 1900, statue: 2700 };

/** A name written on the map, where it falls on the image. */
interface Label {
  key: string;
  kind: MapLabel['kind'];
  text: string;
  across: number;
  down: number;
}

/** A quest in progress, marked at its current step. */
interface QuestPlace {
  key: string;
  quest: QuestMark;
  across: number;
  down: number;
}

/**
 * The game's world map writes the regions' names while zoomed out and the
 * areas' names once zoomed in, never both (WorldMapHideChapterName and
 * WorldMapHideAreaName: zoom level 1). Measured on in-game screenshots, that
 * switch comes at about 200,000 world units across the screen's height, so
 * the map shows area names once its shorter side spans less than that.
 */
const AREA_NAMES_BELOW = 200_000;

/** What the game's map shows around each world's capture: Orbis's sea, Belos's sky. */
const BACKDROP: Record<number, string> = { 100: '#33bbd5', 200: '#000000' };

/** Where world point (x, y) falls on a map image: across and down, 0 to 1 inside it. */
function onMap(map: MapPlacement, x: number, y: number): { across: number; down: number } {
  return { across: (x - map.x0) / map.size, down: (y - map.y0) / map.size };
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
      ...onMap(map, waypoint.x, waypoint.y - (MARK_LIFT[layer] ?? 0)),
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
  if (!first) return null;
  switch (first.layer) {
    case 'statue':
      return {
        kind: 'statue',
        ids: places.flatMap((place) => (place.waypoint?.statue ? [place.waypoint.statue.id] : [])),
      };
    case 'dungeon':
      return { kind: 'dungeon', ids: places.map((place) => place.id) };
    case 'chest':
      return { kind: 'chest', ids: places.map((place) => place.id) };
    default:
      return { kind: 'waypoint', ids: places.map((place) => place.id) };
  }
}

/** What doing a place hands out, as the card and the confirmations word it. */
function rewardText(place: Place, language: string): string | null {
  const reward = place.waypoint?.reward ?? [];
  if (reward.length === 0) return null;
  return reward.map((entry) => `${formatNumber(entry.count)} ${itemName(entry.item, language)}`).join(', ');
}

export function WorldScreen() {
  const world = useApp((state) => state.world);
  const save = useApp((state) => state.save);
  const language = useApp((state) => state.settings.language);
  const pending = useApp((state) => state.pending);
  const completeWorldPlaces = useApp((state) => state.completeWorldPlaces);
  const undoWorldPlaces = useApp((state) => state.undoWorldPlaces);
  const grantRewards = useApp((state) => state.settings.grantRewards);
  const allowUndo = useApp((state) => state.settings.allowUndo);
  const [layers, setLayers] = useState<Set<Layer>>(() => new Set(['waypoint', 'statue', 'legacy', 'tower', 'dungeon']));
  const [show, setShow] = useState<Show>('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [regionId, setRegionId] = useState<number | null>(null);
  const [worldId, setWorldId] = useState<number | null>(null);
  const [showQuests, setShowQuests] = useState(true);
  const [showNames, setShowNames] = useState(true);
  const busy = pending !== null;

  // The worlds the editor has a map image of: Orbis, and Belos once the story reaches it.
  const mapped = world?.worlds.filter((entry) => entry.map && MAPS[`../assets/world-map-${entry.id}.webp`]) ?? [];
  const shown = mapped.find((entry) => entry.id === worldId) ?? mapped[0] ?? null;
  const map = shown?.map ?? null;
  const places = useMemo(() => (world && shown && map ? placesOf(world, shown.id, map) : []), [world, shown, map]);
  const regions = useMemo(() => world?.regions.filter((region) => region.world === shown?.id) ?? [], [world, shown]);
  const labels = useMemo<Label[]>(
    () =>
      world && shown && map
        ? world.labels
            .filter((label) => label.world === shown.id)
            .map((label, index) => ({
              key: `l${index}`,
              kind: label.kind,
              text: language === 'fr' ? label.name.fr : label.name.en,
              ...onMap(map, label.x, label.y),
            }))
        : [],
    [world, shown, map, language],
  );
  const quests = useMemo<QuestPlace[]>(
    () =>
      world && shown && map
        ? world.quests
            .filter((quest) => quest.world === shown.id)
            .map((quest) => ({ key: `q${quest.id}`, quest, ...onMap(map, quest.x, quest.y) }))
        : [],
    [world, shown, map],
  );
  const selected = places.find((place) => place.key === selectedKey) ?? null;
  const selectedQuest = quests.find((place) => place.key === selectedKey) ?? null;
  const visible = useMemo(
    () =>
      places.filter(
        (place) => layers.has(place.layer) && (show === 'all' || (show === 'done' ? place.done : !place.done)),
      ),
    [layers, places, show],
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

  // Doing a place hands out its reward when the settings say so; undoing
  // one is only offered when the settings allow it.
  function apply(target: Place[], done: boolean): void {
    const edit = editTarget(target.filter((place) => place.done !== done));
    if (!edit || edit.ids.length === 0) return;
    if (done) void completeWorldPlaces(edit.kind, edit.ids);
    else if (allowUndo) void undoWorldPlaces(edit.kind, edit.ids);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="World map"
        description={
          <>
            {name(shown.name)} as the game's world map draws it, with every warp point, Statue of Organa, Eona's Legacy,
            dungeon and chest and what this save has done, and the quests in progress where their current step leads.
            Click a marker to change it; drag to move, scroll to zoom.
          </>
        }
        actions={
          <ConfirmButton
            title="Activate every warp point?"
            description={`Activates the ${warpPoints.filter((place) => !place.done).length} warp points of ${shown.name.en} not activated yet, so you can travel to any of them. ${
              grantRewards
                ? 'Each gives 100 Mercenary Crew Grade EXP, as in the game.'
                : 'Rewards are off in Settings, so they give nothing.'
            }${allowUndo ? '' : ' Activated warp points stay activated.'} Statues of Organa and Eona's Legacy are left as they are.`}
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
        {quests.length > 0 && (
          <button
            type="button"
            aria-pressed={showQuests}
            onClick={() => setShowQuests((on) => !on)}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              showQuests ? 'border-brand/40 bg-brand/10 text-foreground' : 'text-muted-foreground hover:bg-accent',
            )}
          >
            <img src={questImage(2)} alt="" className={cn('size-4', !showQuests && 'opacity-50 grayscale')} />
            Quests in progress
            <span className="numeric text-muted-foreground">{formatNumber(quests.length)}</span>
          </button>
        )}
        {labels.length > 0 && (
          <button
            type="button"
            aria-pressed={showNames}
            onClick={() => setShowNames((on) => !on)}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              showNames ? 'border-brand/40 bg-brand/10 text-foreground' : 'text-muted-foreground hover:bg-accent',
            )}
          >
            <span aria-hidden className={cn('text-[0.7rem] font-semibold', !showNames && 'opacity-50')}>
              Aa
            </span>
            Place names
          </button>
        )}
        <div className="ml-auto flex gap-2">
          {mapped.length > 1 && (
            <div className="flex gap-1 rounded-lg bg-muted/60 p-0.5">
              {mapped.map((entry) => (
                <Button
                  key={entry.id}
                  size="xs"
                  variant={entry.id === shown.id ? 'secondary' : 'ghost'}
                  onClick={() => {
                    setWorldId(entry.id);
                    setSelectedKey(null);
                    setRegionId(null);
                  }}
                >
                  {name(entry.name)}
                </Button>
              ))}
            </div>
          )}
          <div className="flex gap-1 rounded-lg bg-muted/60 p-0.5">
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
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <MapView
          key={shown.id}
          image={MAPS[`../assets/world-map-${shown.id}.webp`]}
          backdrop={BACKDROP[shown.id] ?? '#000000'}
          places={places}
          visible={visible}
          labels={showNames ? labels : []}
          quests={showQuests ? quests : []}
          worldSize={map.size}
          player={player}
          selectedKey={selectedKey}
          focus={regionId}
          onSelect={setSelectedKey}
        />
        <div className="scroll-thin flex max-h-[max(420px,calc(100svh-17.5rem))] min-h-0 flex-col gap-3 overflow-y-auto">
          {selectedQuest && (
            <QuestCard place={selectedQuest} language={language} onClose={() => setSelectedKey(null)} />
          )}
          {selected && (
            <PlaceCard
              place={selected}
              regionName={regions.find((region) => region.id === selected.region)?.name ?? null}
              language={language}
              busy={busy}
              grantRewards={grantRewards}
              allowUndo={allowUndo}
              onSet={(done) => apply([selected], done)}
              onClose={() => setSelectedKey(null)}
            />
          )}
          <RegionList
            regions={regions}
            places={places}
            selected={regionId}
            language={language}
            busy={busy}
            grantRewards={grantRewards}
            allowUndo={allowUndo}
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
/**
 * How far the map zooms: until one pixel of the map image covers two screen
 * pixels, about as far as the game's own closest zoom, past which the image
 * only blurs; and at least to four times the whole map.
 */
const IMAGE_ZOOM = 2;
const MIN_MAX_ZOOM = 4;

function MapView({
  image,
  backdrop,
  places,
  visible,
  labels,
  quests,
  worldSize,
  player,
  selectedKey,
  focus,
  onSelect,
}: {
  image: string | undefined;
  backdrop: string;
  places: Place[];
  visible: Place[];
  labels: Label[];
  quests: QuestPlace[];
  /** The map image's side in world units, which sets when area names show. */
  worldSize: number;
  player: { across: number; down: number } | null;
  selectedKey: string | null;
  /** A region to zoom to. */
  focus: number | null;
  onSelect: (key: string | null) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  /** The zoom and pan; `whole` while it shows the whole map, which a resize keeps. */
  const view = useRef({ scale: 1, x: 0, y: 0, fit: 1, whole: true });
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
  /** The map image's width in pixels, which sets how far it zooms. */
  const pixels = useRef(4096);
  const maxScale = useCallback(
    (fit: number) => Math.max(fit * MIN_MAX_ZOOM, (pixels.current / STAGE) * IMAGE_ZOOM),
    [],
  );
  const latest = useRef({ frame, width, height, places, worldSize });
  latest.current = { frame, width, height, places, worldSize };

  const draw = useCallback(() => {
    const { scale, x, y } = view.current;
    const element = stage.current;
    const box = viewport.current;
    if (!element || !box) return;
    element.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    element.style.setProperty('--inv', String(1 / scale));
    // Which names the map writes: the regions' zoomed out, the areas' zoomed in.
    const span = (Math.min(box.clientWidth, box.clientHeight) / (scale * STAGE)) * latest.current.worldSize;
    element.dataset.zoom = span < AREA_NAMES_BELOW ? 'near' : 'far';
  }, []);

  /** Shows a box of map units [a0, a1] × [d0, d1] as large as it fits. */
  const show = useCallback(
    (a0: number, a1: number, d0: number, d1: number, whole = false) => {
      const box = viewport.current;
      if (!box) return;
      const { frame, width, height } = latest.current;
      const fit = Math.min(box.clientWidth / width, box.clientHeight / height);
      const boxWidth = (a1 - a0) * STAGE;
      const boxHeight = (d1 - d0) * STAGE;
      const wanted = Math.min(box.clientWidth / boxWidth, box.clientHeight / boxHeight);
      const scale = Math.min(maxScale(fit), Math.max(fit, wanted));
      const centerX = ((a0 + a1) / 2 - frame.a0) * STAGE;
      const centerY = ((d0 + d1) / 2 - frame.d0) * STAGE;
      view.current = {
        fit,
        scale,
        x: box.clientWidth / 2 - centerX * scale,
        y: box.clientHeight / 2 - centerY * scale,
        whole,
      };
      draw();
    },
    [draw, maxScale],
  );
  // The whole map is the map image; the few places past its edge stay a drag away.
  const fitAll = useCallback(() => show(0, 1, 0, 1, true), [show]);

  useEffect(() => {
    const box = viewport.current;
    if (!box) return;
    const observer = new ResizeObserver(() => {
      // Keep the zoom the user chose; refit only the whole map.
      if (view.current.whole) fitAll();
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
    // A few of a region's places can sit far from the rest (seven chests lie
    // in the sea off the map's west edge), so the zoom leaves out the outer
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
      const scale = Math.min(maxScale(current.fit), Math.max(current.fit, current.scale * factor));
      const ratio = scale / current.scale;
      view.current = {
        ...current,
        whole: false,
        scale,
        x: pointX - (pointX - current.x) * ratio,
        y: pointY - (pointY - current.y) * ratio,
      };
      draw();
    },
    [draw, maxScale],
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
      className="relative h-[max(420px,calc(100svh-17.5rem))] cursor-grab touch-none overflow-hidden rounded-xl border select-none active:cursor-grabbing"
      style={{ backgroundColor: backdrop }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        // A press drags or selects; it does not move the keyboard focus, so a
        // clicked marker shows no focus outline.
        event.preventDefault();
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
        view.current = { ...view.current, x: view.current.x + dx, y: view.current.y + dy, whole: false };
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
      <div ref={stage} className="group/stage absolute top-0 left-0 origin-top-left" style={{ width, height }}>
        {image && (
          <img
            src={image}
            onLoad={(event) => {
              pixels.current = event.currentTarget.naturalWidth || pixels.current;
            }}
            alt=""
            draggable={false}
            className="pointer-events-none absolute max-w-none"
            style={{ ...position(0, 0), width: STAGE, height: STAGE }}
          />
        )}
        {labels.map((label) => (
          <span
            key={label.key}
            aria-hidden
            className={cn(
              'pointer-events-none absolute font-medium whitespace-nowrap text-white/[0.98]',
              label.kind === 'region'
                ? 'text-[17px] group-data-[zoom=near]/stage:hidden'
                : 'hidden text-lg group-data-[zoom=near]/stage:block',
            )}
            style={{
              ...position(label.across, label.down),
              transform: 'translate(-50%, -50%) scale(var(--inv))',
              // The game's label sits on a soft dark-green glow (Gradation_13 tinted #113D31).
              textShadow: '0 0 8px rgb(17 61 49 / 0.85), 0 0 3px rgb(17 61 49 / 0.9), 0 1px 1px rgb(0 0 0 / 0.4)',
            }}
          >
            {label.text}
          </span>
        ))}
        {visible.map((place) => (
          <Marker
            key={place.key}
            place={place}
            selected={place.key === selectedKey}
            style={position(place.across, place.down)}
            onSelect={onSelect}
          />
        ))}
        {quests.map((place) => (
          <QuestMarker
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

/** The game's marker for a place: white while there is something to do, grey once it is done. */
function markOf(place: Place): string {
  return place.layer === 'chest' || !place.done ? place.layer : `${place.layer}-done`;
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
  const transform = `translate(-50%, -50%) scale(calc(var(--inv) * ${selected ? (place.chest ? 1.35 : 1.15) : 1}))`;
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
          'absolute size-2.5 rounded-full ring-1 ring-black/45 transition-opacity outline-none focus-visible:ring-2 focus-visible:ring-brand',
          selected && 'z-10 ring-2 ring-brand',
        )}
        style={{
          ...style,
          transform,
          opacity: place.done ? 0.35 : 1,
          backgroundColor: GRADE_DOT[place.chest.grade] ?? GRADE_DOT.normal,
        }}
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
        'absolute z-[1] grid size-11 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand',
        selected && 'z-10',
      )}
      style={{ ...style, transform }}
    >
      {selected && <SelectedRing />}
      {/* The game's own marker, about as large on screen as the game draws it (DUWG_MapPointIcon:
          an 85-unit box at 1.3×): white while there is something to do, grey and dimmed once done. */}
      <img
        src={markImage(markOf(place))}
        alt=""
        draggable={false}
        className={cn('pointer-events-none col-start-1 row-start-1 size-11', place.done && !selected && 'opacity-70')}
      />
    </button>
  );
}

/** The ring in the app's accent colour around the selected marker. */
function SelectedRing() {
  return (
    <span
      aria-hidden
      className="pointer-events-none col-start-1 row-start-1 size-12 rounded-full border-[3px] border-brand bg-black/30 shadow-[0_0_0_1.5px_rgb(0_0_0/0.45)]"
    />
  );
}

/** A quest in progress, with the game's mark for its kind, above every place as in the game. */
function QuestMarker({
  place,
  selected,
  style,
  onSelect,
}: {
  place: QuestPlace;
  selected: boolean;
  style: { left: number; top: number };
  onSelect: (key: string) => void;
}) {
  const { quest } = place;
  return (
    <button
      type="button"
      data-place={place.key}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(place.key);
        }
      }}
      aria-label={`${quest.nameEn}, step ${quest.step.id}`}
      title={quest.nameEn}
      className={cn(
        'absolute z-[5] grid size-11 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand',
        selected && 'z-10',
      )}
      style={{ ...style, transform: `translate(-50%, -50%) scale(calc(var(--inv) * ${selected ? 1.15 : 1}))` }}
    >
      {selected && <SelectedRing />}
      <img
        src={questImage(quest.mark)}
        alt=""
        draggable={false}
        className="pointer-events-none col-start-1 row-start-1 size-11"
      />
    </button>
  );
}

// ----------------------------------------------------------- side panel

/** The quest a mark stands for and the step it points at. */
function QuestCard({ place, language, onClose }: { place: QuestPlace; language: string; onClose: () => void }) {
  const { quest } = place;
  const category = CATEGORIES.find(([value]) => value === quest.category)?.[1] ?? quest.category;
  const step = quest.step.text ? (language === 'fr' ? quest.step.text.fr : quest.step.text.en) : null;
  return (
    <section className="rounded-xl border bg-card/40 p-4">
      <div className="flex items-start gap-3">
        <img src={questImage(quest.mark)} alt="" className="size-8 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{language === 'fr' ? quest.nameFr : quest.nameEn}</h2>
          <p className="text-xs text-muted-foreground">
            {category} · <span className="numeric">#{quest.id}</span>
          </p>
        </div>
        <Button size="xs" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
      <p className="mt-3 text-sm">
        <span className="text-muted-foreground">
          Step {quest.step.id}
          {quest.steps > 0 && ` of ${quest.steps}`}:{' '}
        </span>
        {step ? <RichText text={step} /> : 'no text in the game data'}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        The mark is where the game points this step, as its world map does. The Quests screen completes it.
      </p>
    </section>
  );
}

function PlaceCard({
  place,
  regionName,
  language,
  busy,
  grantRewards,
  allowUndo,
  onSet,
  onClose,
}: {
  place: Place;
  regionName: GameText | null;
  language: string;
  busy: boolean;
  grantRewards: boolean;
  allowUndo: boolean;
  onSet: (done: boolean) => void;
  onClose: () => void;
}) {
  const name = (text: GameText) => (language === 'fr' ? text.fr : text.en);
  const statue = place.waypoint?.statue;
  const lines: ReactNode[] = [];
  const notes: string[] = [];
  let toggle = 'Activated';
  switch (place.layer) {
    case 'statue':
      toggle = 'Restored';
      if (statue) lines.push(`${statue.found} of ${statue.pieces} pieces put back`);
      lines.push(place.waypoint?.active ? 'Warp activated' : 'Warp not activated');
      notes.push(
        allowUndo
          ? 'Restoring puts back every piece and activates its warp; breaking it undoes both.'
          : 'Restoring puts back every piece and activates its warp.',
      );
      break;
    case 'dungeon':
      toggle = 'Found';
      break;
    case 'chest':
      if (place.chest?.lock) lines.push(LOCKS[place.chest.lock]);
      if (place.chest?.lock && !place.done) lines.push(place.chest.released ? 'Lock open' : 'Still locked');
      break;
    case 'legacy':
      notes.push("Eona's Legacy is activated in game by its own quest; this sets only its switch.");
      break;
  }
  const card = place.waypoint ?? place.dungeon;
  const picture = card?.picture ? PICTURES[`../assets/map-info-${card.picture}.webp`] : undefined;
  // A restored statue and a lit Eona's Legacy read differently from before.
  const description = (place.done && card?.descriptionDone) || card?.description;
  const reward = rewardText(place, language);
  if (reward && !place.done) {
    notes.push(
      grantRewards
        ? `Activating gives ${reward}, as in the game.`
        : 'Rewards are off in Settings, so activating gives nothing.',
    );
  }
  if (place.done && !allowUndo && !place.chest) {
    notes.push('It stays this way: undoing progress is off in Settings.');
  }
  return (
    <section className="shrink-0 overflow-hidden rounded-xl border bg-card/40">
      {/* The picture the game's card shows for the place (World_MapInfo_*). */}
      {picture && <img src={picture} alt="" className="aspect-[662/360] w-full object-cover" />}
      <div className="p-4">
        <div className="flex items-start gap-3">
          {place.chest ? (
            <span
              aria-hidden
              className="mt-1 size-4 shrink-0 rounded-full ring-1 ring-black/40"
              style={{ backgroundColor: GRADE_DOT[place.chest.grade] ?? GRADE_DOT.normal }}
            />
          ) : (
            <img src={markImage(place.layer)} alt="" className="size-8 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{name(place.name)}</h2>
            <p className="text-xs text-muted-foreground">
              {card?.area && `${name(card.area)} · `}
              {regionName ? name(regionName) : 'Outside the counted regions'} ·{' '}
              <span className="numeric">#{place.id}</span>
            </p>
          </div>
          <Button size="xs" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        {description && (
          <p className="mt-3 text-sm text-muted-foreground">
            <RichText text={name(description)} />
          </p>
        )}
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
            grantRewards={grantRewards}
            allowUndo={allowUndo}
            onSet={onSet}
          />
        ) : (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
            <span id="world-place-toggle">{toggle}</span>
            <Switch
              aria-labelledby="world-place-toggle"
              checked={place.done}
              disabled={busy || (place.done && !allowUndo)}
              onCheckedChange={(value) => onSet(value)}
            />
          </div>
        )}
        {notes.map((note) => (
          <p key={note} className="mt-2 text-xs text-muted-foreground">
            {note}
          </p>
        ))}
      </div>
    </section>
  );
}

/** How many options of a long draw the card lists before "and N more". */
const LOOT_OPTIONS = 4;

/**
 * What a chest gives, draw by draw, as its loot table reads, and the button
 * that opens it. Opening rolls the loot the way the game does and hands it
 * out when rewards are on; an opened chest stays opened unless the settings
 * allow undoing progress.
 */
function ChestContents({
  chest,
  opened,
  language,
  busy,
  grantRewards,
  allowUndo,
  onSet,
}: {
  chest: ChestView;
  opened: boolean;
  language: string;
  busy: boolean;
  grantRewards: boolean;
  allowUndo: boolean;
  onSet: (done: boolean) => void;
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
        allowUndo ? (
          <>
            <Button variant="outline" className="w-full" disabled={busy} onClick={() => onSet(false)}>
              Mark not opened
            </Button>
            <p className="text-xs text-muted-foreground">
              Its lock stays open, so it can be opened again{grantRewards ? ', handing out its loot again' : ''}.
            </p>
          </>
        ) : (
          <p className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            Opened. An opened chest stays opened: undoing progress is off in Settings.
          </p>
        )
      ) : (
        <>
          <Button className="w-full" disabled={busy} onClick={() => onSet(true)}>
            Open the chest
          </Button>
          <p className="text-xs text-muted-foreground">
            {grantRewards
              ? 'Opening rolls its loot the way the game does and adds it to the save.'
              : 'Rewards are off in Settings, so opening gives nothing.'}
            {allowUndo ? '' : ' It cannot be undone.'}
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
  grantRewards,
  allowUndo,
  onSelect,
  onApply,
}: {
  regions: RegionView[];
  places: Place[];
  selected: number | null;
  language: string;
  busy: boolean;
  grantRewards: boolean;
  allowUndo: boolean;
  onSelect: (id: number) => void;
  onApply: (places: Place[], done: boolean) => void;
}) {
  const name = (text: GameText) => (language === 'fr' ? text.fr : text.en);
  // Doing many places at once that hand out rewards asks first.
  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    label: string;
    target: Place[];
  } | null>(null);
  return (
    <section className="rounded-xl border bg-card/40">
      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm) onApply(confirm.target, true);
                setConfirm(null);
              }}
            >
              {confirm?.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <header className="border-b px-4 py-3">
        <h2 className="font-semibold">Regions</h2>
        <p className="text-xs text-muted-foreground">
          What the game's world map counts in each region. Click one to zoom to it and change its places; click it again
          to see the whole map.
        </p>
      </header>
      <ul className="divide-y">
        {regions.map((region) => {
          const done = region.missions.reduce((sum, mission) => sum + mission.done, 0);
          const total = region.missions.reduce((sum, mission) => sum + mission.total, 0);
          const here = (layer: Layer) => places.filter((place) => place.layer === layer && place.region === region.id);
          // Opening chests and activating warp points hand out rewards, so a whole region asks first.
          const ask = (target: Place[]): boolean => {
            const left = target.filter((place) => !place.done).length;
            const layer = target[0]?.layer;
            if (layer === 'chest') {
              setConfirm({
                title: `Open every chest in ${name(region.name)}?`,
                description: `Opens ${formatNumber(left)} ${left === 1 ? 'chest' : 'chests'}${
                  grantRewards
                    ? ' and adds their loot to the save, rolled the way the game rolls it.'
                    : '. Rewards are off in Settings, so they give nothing.'
                }${allowUndo ? '' : ' Opened chests stay opened.'}`,
                label: `Complete ${formatNumber(left)}`,
                target,
              });
              return true;
            }
            if (layer === 'waypoint' && grantRewards) {
              setConfirm({
                title: `Activate the warp points of ${name(region.name)}?`,
                description: `Activates ${formatNumber(left)} warp ${left === 1 ? 'point' : 'points'}; each gives 100 Mercenary Crew Grade EXP, as in the game.${
                  allowUndo ? '' : ' Activated warp points stay activated.'
                }`,
                label: `Complete ${formatNumber(left)}`,
                target,
              });
              return true;
            }
            return false;
          };
          const open = selected === region.id;
          return (
            <li key={region.id} className={cn('border-l-2 border-transparent', open && 'border-l-brand bg-accent/40')}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => onSelect(region.id)}
                className="block w-full px-4 py-2.5 text-left outline-none hover:bg-accent/40 focus-visible:bg-accent/40"
              >
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{name(region.name)}</span>
                  <span className="numeric text-xs text-muted-foreground">
                    {total > 0 ? Math.round((done / total) * 100) : 0}%
                  </span>
                </span>
                {!open && (
                  <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {region.missions.map((mission) => (
                      <span key={mission.kind} className={cn(mission.done === mission.total && 'text-foreground')}>
                        {MISSIONS[mission.kind] ?? mission.kind}{' '}
                        <span className="numeric">
                          {mission.done}/{mission.total}
                        </span>
                      </span>
                    ))}
                  </span>
                )}
              </button>
              {open && (
                // Each of the region's kinds of place: how many are done, and doing the rest.
                <ul className="space-y-1 px-4 pb-3">
                  {region.missions.map((mission) => {
                    const step = STEPS[mission.kind];
                    const target = step ? here(step.layer) : [];
                    const left = target.filter((place) => !place.done);
                    const doneHere = target.filter((place) => place.done);
                    return (
                      <li key={mission.kind} className="flex h-8 items-center gap-2 text-xs">
                        <span className="grid size-6 shrink-0 place-items-center">
                          {step?.layer === 'chest' ? (
                            <span aria-hidden className="size-2.5 rounded-full bg-[#ffb02e] ring-1 ring-black/30" />
                          ) : step ? (
                            <img src={markImage(step.layer)} alt="" className="size-6" />
                          ) : null}
                        </span>
                        <span
                          className={cn(
                            'min-w-0 flex-1 truncate',
                            mission.done < mission.total && 'text-muted-foreground',
                          )}
                        >
                          {MISSIONS[mission.kind] ?? mission.kind}
                        </span>
                        <span className="numeric text-muted-foreground">
                          {mission.done}/{mission.total}
                        </span>
                        {step && left.length > 0 && (
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={busy}
                            onClick={() => {
                              if (!ask(left)) onApply(left, true);
                            }}
                          >
                            Complete
                          </Button>
                        )}
                        {step && allowUndo && doneHere.length > 0 && (
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label={`Undo ${MISSIONS[mission.kind] ?? mission.kind}`}
                            title="Undo"
                            disabled={busy}
                            onClick={() => onApply(doneHere, false)}
                          >
                            <Undo2 />
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
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
