import { toast } from 'sonner';
import { create } from 'zustand';
import * as api from './api.ts';
import { consistencyIssues } from './consistency.ts';
import { currencyLimit } from './limits.ts';
import type {
  AppInfo,
  CatalogEntry,
  Character,
  Costume,
  Currency,
  Equipment,
  Gem,
  HeroEntry,
  HeroTab,
  Item,
  Karma,
  Loadout,
  Overview,
  QuestCompletion,
  QuestRewards,
  RawPage,
  RawTable,
  RawValue,
  Recipe,
  RewardGrant,
  SaveHandle,
  ScanResult,
  Section,
  Settings,
  Skill,
  Stack,
  TeamPage,
  TitleEntry,
  Vehicle,
} from './types.ts';

const DEFAULT_SETTINGS: Settings = {
  language: 'en',
  theme: 'system',
  compactRows: false,
  showUnknown: true,
  lastFolder: null,
};

const EMPTY_SCAN: ScanResult = { roots: [], slots: [] };

export interface AppState {
  desktop: boolean;
  booted: boolean;
  info: AppInfo | null;
  settings: Settings;
  scanning: boolean;
  scan: ScanResult;
  save: SaveHandle | null;
  dirty: boolean;
  /// Number of number fields currently holding an uncommitted draft.
  draftCount: number;
  /** Edits since the last save or open, counted by the screen they were made on. */
  changes: Partial<Record<Section, number>>;
  section: Section;
  loading: boolean;
  pending: string | null;
  overview: Overview | null;
  currencies: Currency[];
  inventory: Stack[];
  stackables: Item[];
  characters: Character[];
  selectedCharacter: number | null;
  /** The hero screen's tab, kept while switching heroes as the game does. */
  heroTab: HeroTab;
  skills: Skill[];
  teams: TeamPage[];
  loadout: Loadout | null;
  equipment: Equipment[];
  gems: Gem[];
  karma: Karma[];
  costumes: Costume[];
  costumeCatalog: CatalogEntry[];
  mounts: Vehicle[];
  mountCatalog: CatalogEntry[];
  titles: TitleEntry[];
  recipes: Recipe[];
  rawTables: RawTable[];
  rawPage: RawPage | null;
}

export interface AppActions {
  boot(): Promise<void>;
  /** Rescan for slots; `quiet` skips the notice when none are found. */
  refreshScan(path?: string, quiet?: boolean): Promise<void>;
  openSave(path: string): Promise<boolean>;
  closeCurrent(): Promise<void>;
  /** Drop the session whatever its dirty state. */
  discardCurrent(refresh?: boolean): Promise<void>;
  saveNow(): Promise<boolean>;
  backupNow(): Promise<void>;
  /** Record or release one field's uncommitted draft. */
  markDraft(active: boolean): void;
  setSettings(patch: Partial<Settings>): Promise<void>;
  setSection(section: Section): void;
  loadSection(section?: Section): Promise<void>;
  loadOverview(): Promise<void>;
  loadCurrencies(): Promise<void>;
  loadInventory(): Promise<void>;
  loadCharacters(): Promise<void>;
  ensureCharacters(): Promise<void>;
  selectCharacter(cid: number | null): Promise<void>;
  setHeroTab(tab: HeroTab): void;
  loadEquipment(): Promise<void>;
  loadGems(): Promise<void>;
  loadKarma(): Promise<void>;
  loadCostumes(): Promise<void>;
  loadMounts(): Promise<void>;
  loadTitles(): Promise<void>;
  loadRecipes(): Promise<void>;
  loadTeams(): Promise<void>;
  loadRawTables(): Promise<void>;
  loadRawPage(table: string, offset: number, search: string): Promise<void>;
  setPlayerName(name: string): Promise<void>;
  setAdventure(field: string, value: number): Promise<void>;
  setAdventureBatch(patch: Record<string, number>): Promise<void>;
  setCurrency(cid: number, amount: number): Promise<void>;
  setAllCurrencies(): Promise<void>;
  setStack(kind: string, id: string, count: number): Promise<void>;
  addStack(cid: number, count: number): Promise<void>;
  fillStacks(count: number): Promise<void>;
  /** The rewards of every completed quest; read-only. */
  questRewards(): Promise<QuestRewards[]>;
  grantQuestRewards(questIds: number[]): Promise<RewardGrant | null>;
  /** The heroes the game hands out, with whether this save has them. */
  recruitableHeroes(): Promise<HeroEntry[]>;
  recruitHero(cid: number): Promise<void>;
  /** The quests in progress, with what completing each would hand out. */
  questsInProgress(): Promise<QuestRewards[]>;
  completeQuest(questId: number): Promise<QuestCompletion | null>;
  setCharacter(cid: number, field: string, value: number): Promise<void>;
  removeCharacter(cid: number): Promise<void>;
  setSkill(cid: number, typeValue: number, level: number): Promise<void>;
  removeSkill(cid: number, typeValue: number): Promise<void>;
  setTeamSlot(pageId: number, slot: number, cid: number): Promise<void>;
  setEquipment(dbid: string, field: string, value: number): Promise<void>;
  setEquipmentGem(dbid: string, gemDbid: string): Promise<void>;
  setGem(dbid: string, field: string, value: number): Promise<void>;
  setKarma(dbid: string, field: string, value: number): Promise<void>;
  equipKarma(characterCid: number, dbid: string): Promise<void>;
  unlockCostume(cid: number): Promise<void>;
  equipCostume(dbid: string, characterCid: number): Promise<void>;
  unlockMount(cid: number): Promise<void>;
  equipMount(characterCid: number, dbid: string): Promise<void>;
  setTitle(id: number, unlocked: boolean): Promise<void>;
  unlockAllTitles(): Promise<void>;
  setRecipe(key: number, known: boolean): Promise<void>;
  unlockAllRecipes(): Promise<void>;
  rawUpdate(table: string, rowid: string, column: string, value: RawValue, advanced: boolean): Promise<void>;
}

export type Store = AppState & AppActions;

function message(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

/** The stable kind the Rust command error carries, when there is one. */
function errorKind(error: unknown): string | null {
  return error && typeof error === 'object' && 'kind' in error ? String((error as { kind: unknown }).kind) : null;
}

function initialState(): AppState {
  return {
    desktop: api.isDesktop(),
    booted: false,
    info: null,
    settings: DEFAULT_SETTINGS,
    scanning: false,
    scan: EMPTY_SCAN,
    save: null,
    dirty: false,
    draftCount: 0,
    changes: {},
    section: 'overview',
    loading: false,
    pending: null,
    overview: null,
    currencies: [],
    inventory: [],
    stackables: [],
    characters: [],
    selectedCharacter: null,
    heroTab: 'info',
    skills: [],
    teams: [],
    loadout: null,
    equipment: [],
    gems: [],
    karma: [],
    costumes: [],
    costumeCatalog: [],
    mounts: [],
    mountCatalog: [],
    titles: [],
    recipes: [],
    rawTables: [],
    rawPage: null,
  };
}

export const useApp = create<Store>((set, get) => {
  // One action at a time. A save must wait for every mutation that was
  // started before it, and two writes must never overlap. Loads are not
  // queued: they only read, and queueing them would deadlock the reload that
  // a mutation performs inside its own task.
  let queue: Promise<unknown> = Promise.resolve();
  let savePromise: Promise<boolean> | null = null;

  function enqueue<T>(label: string, task: () => Promise<T>): Promise<T> {
    const start = async (): Promise<T> => {
      set({ pending: label });
      try {
        return await task();
      } finally {
        set({ pending: null });
      }
    };
    const run = queue.then(start, start);
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function attempt<T>(label: string, action: () => Promise<T>, after?: () => Promise<void>): Promise<T | null> {
    try {
      return await enqueue(label, async () => {
        const result = await action();
        set((state) => ({
          dirty: true,
          changes: { ...state.changes, [state.section]: (state.changes[state.section] ?? 0) + 1 },
        }));
        if (after) await after();
        return result;
      });
    } catch (error) {
      toast.error(message(error));
      return null;
    }
  }

  async function read<T>(loader: () => Promise<T>, apply: (value: T) => void): Promise<void> {
    try {
      apply(await loader());
    } catch (error) {
      toast.error(message(error));
    }
  }

  return {
    ...initialState(),

    async boot() {
      if (!get().desktop) {
        set({ booted: true });
        return;
      }
      try {
        const [info, settings, save] = await Promise.all([api.appInfo(), api.settingsGet(), api.currentSave()]);
        set({ info, settings, save, dirty: save?.dirty ?? false, booted: true });
        if (save) {
          await get().loadSection();
        } else {
          await get().refreshScan(settings.lastFolder ?? undefined);
        }
      } catch (error) {
        set({ booted: true });
        toast.error(`Could not start: ${message(error)}`);
      }
    },

    async refreshScan(path, quiet = false) {
      if (!get().desktop) return;
      set({ scanning: true });
      try {
        const scan = await api.scanSlots(path);
        set({ scan });
        if (scan.slots.length === 0 && !quiet) {
          toast.info('No saves found there. Pick the folder that contains your DragonSword saves.');
        }
      } catch (error) {
        toast.error(message(error));
      } finally {
        set({ scanning: false });
      }
    },

    async openSave(path) {
      return enqueue('Opening save', async () => {
        try {
          const save = await api.openSave(path);
          const folder = path.replace(/[\\/][^\\/]+$/, '');
          set({
            save,
            dirty: false,
            draftCount: 0,
            changes: {},
            section: 'overview',
            overview: null,
            currencies: [],
            inventory: [],
            characters: [],
            selectedCharacter: null,
            equipment: [],
            gems: [],
            karma: [],
            costumes: [],
            mounts: [],
            titles: [],
            recipes: [],
            rawTables: [],
            rawPage: null,
          });
          await get().setSettings({ lastFolder: folder });
          await get().loadSection('overview');
          toast.success(`Opened slot ${save.slot} of account ${save.accountId}`);
          for (const warning of save.warnings ?? []) {
            toast.warning(warning, { duration: 15000 });
          }
          if (consistencyIssues(save.consistency).length > 0) {
            toast.warning('This save already has consistency problems', {
              description: 'Open the overview to see them. The editor will not create new ones.',
              duration: 20000,
            });
          }
          return true;
        } catch (error) {
          toast.error(message(error));
          return false;
        }
      });
    },

    async closeCurrent() {
      if (get().dirty || get().draftCount > 0) {
        toast.error('Save or discard your changes before closing this save.');
        return;
      }
      await get().discardCurrent();
    },

    async discardCurrent(refresh = true) {
      try {
        await enqueue('Closing save', async () => {
          await api.closeSave();
          set({ save: null, dirty: false, draftCount: 0, changes: {}, overview: null, section: 'overview' });
          if (refresh) await get().refreshScan(get().settings.lastFolder ?? undefined);
        });
      } catch (error) {
        toast.error(message(error));
      }
    },

    async saveNow() {
      // A focused number field has not committed yet. Blurring queues its
      // mutation before the save, so the save waits for it instead of writing
      // the value that was on screen before the user started typing.
      if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      if (savePromise) return savePromise;
      savePromise = enqueue('Writing save', async () => {
        try {
          const current = await api.currentSave();
          if (!current) {
            toast.error('No save is open.');
            return false;
          }
          if (!current.dirty) {
            toast.info('No changes to save.');
            return true;
          }
          const report = await api.writeSave();
          set({
            dirty: false,
            draftCount: 0,
            changes: {},
            save: { ...current, dirty: false, consistency: report.consistency },
          });
          toast.success(report.backup ? `Save written. Backup kept at ${report.backup}` : 'Save written.', {
            duration: 8000,
          });
          await get().loadOverview();
          return true;
        } catch (error) {
          if (errorKind(error) === 'stale') {
            const path = get().save?.path;
            toast.error(message(error), {
              duration: 20000,
              description: 'Reopening discards the edits you have not saved.',
              action: path ? { label: 'Reopen', onClick: () => void get().openSave(path) } : undefined,
            });
          } else if (errorKind(error) === 'inconsistent') {
            toast.error(message(error), { duration: 20000 });
          } else {
            toast.error(message(error));
          }
          return false;
        }
      });
      try {
        return await savePromise;
      } finally {
        savePromise = null;
      }
    },

    async backupNow() {
      await enqueue('Copying backup', async () => {
        try {
          const path = await api.backupSave();
          toast.success(`Backup written to ${path}`, { duration: 8000 });
        } catch (error) {
          toast.error(message(error));
        }
      });
    },

    markDraft(active) {
      set((state) => ({ draftCount: Math.max(0, state.draftCount + (active ? 1 : -1)) }));
    },

    async setSettings(patch) {
      const next = { ...get().settings, ...patch };
      set({ settings: next });
      if (!get().desktop) return;
      try {
        const saved = await api.settingsSet(next);
        set({ settings: saved });
      } catch (error) {
        toast.error(message(error));
      }
    },

    setSection(section) {
      if (get().section === section) return;
      set({ section });
      if (get().save) void get().loadSection(section);
    },

    async loadSection(section) {
      const target = section ?? get().section;
      if (!get().save) return;
      set({ loading: true });
      try {
        switch (target) {
          case 'overview':
            await get().loadOverview();
            break;
          case 'currencies':
            await get().loadCurrencies();
            break;
          case 'inventory':
            await get().loadInventory();
            if (get().stackables.length === 0) {
              await read(api.stackableCatalog, (stackables) => set({ stackables }));
            }
            break;
          case 'characters':
            await Promise.all([get().loadCharacters(), get().loadTeams()]);
            break;
          case 'equipment':
            await get().loadEquipment();
            break;
          case 'gems':
            await get().loadGems();
            break;
          case 'karma':
            await Promise.all([get().loadKarma(), get().ensureCharacters()]);
            break;
          case 'costumes':
            await Promise.all([get().loadCostumes(), get().ensureCharacters()]);
            break;
          case 'mounts':
            await Promise.all([get().loadMounts(), get().ensureCharacters()]);
            break;
          case 'titles':
            await get().loadTitles();
            break;
          case 'cooking':
            await get().loadRecipes();
            break;
          case 'raw':
            await get().loadRawTables();
            break;
          case 'settings':
            break;
        }
      } finally {
        set({ loading: false });
      }
    },

    async loadOverview() {
      await read(api.overview, (overview) => set({ overview }));
    },

    async loadCurrencies() {
      await read(api.currencies, (currencies) => set({ currencies }));
    },

    async loadInventory() {
      await read(api.inventory, (inventory) => set({ inventory }));
    },

    async loadCharacters() {
      await read(api.characters, (characters) => {
        const selected = get().selectedCharacter;
        const next =
          selected && characters.some((character) => character.cid === selected)
            ? selected
            : (characters[0]?.cid ?? null);
        set({ characters, selectedCharacter: next });
      });
      const selected = get().selectedCharacter;
      if (selected) await get().selectCharacter(selected);
    },

    async ensureCharacters() {
      if (get().characters.length > 0) return;
      await read(api.characters, (characters) => set({ characters }));
    },

    setHeroTab(heroTab) {
      set({ heroTab });
    },

    async selectCharacter(cid) {
      set({ selectedCharacter: cid, skills: [], loadout: null });
      if (cid === null) return;
      await Promise.all([
        read(
          () => api.skills(cid),
          (skills) => set({ skills }),
        ),
        read(
          () => api.loadout(cid),
          (loadout) => set({ loadout }),
        ),
      ]);
    },

    async loadEquipment() {
      await read(api.equipment, (equipment) => set({ equipment }));
    },

    async loadGems() {
      await read(api.gems, (gems) => set({ gems }));
    },

    async loadKarma() {
      await read(api.karma, (karma) => set({ karma }));
    },

    async loadCostumes() {
      await Promise.all([
        read(api.costumes, (costumes) => set({ costumes })),
        read(api.costumeCatalog, (costumeCatalog) => set({ costumeCatalog })),
      ]);
    },

    async loadMounts() {
      await Promise.all([
        read(api.mounts, (mounts) => set({ mounts })),
        read(api.mountCatalog, (mountCatalog) => set({ mountCatalog })),
      ]);
    },

    async loadTitles() {
      await read(api.titles, (titles) => set({ titles }));
    },

    async loadRecipes() {
      await read(api.recipes, (recipes) => set({ recipes }));
    },

    async loadRawTables() {
      await read(api.rawTables, (rawTables) => set({ rawTables }));
      const table = get().rawPage?.table ?? get().rawTables[0]?.name;
      if (table) await get().loadRawPage(table, 0, '');
    },

    async loadRawPage(table, offset, search) {
      await read(
        () => api.rawPage(table, offset, 100, search || undefined),
        (rawPage) => set({ rawPage }),
      );
    },

    async setPlayerName(name) {
      await attempt(
        'Renaming player',
        () => api.setPlayerName(name),
        async () => {
          await get().loadOverview();
        },
      );
    },

    async setAdventure(field, value) {
      await attempt(
        'Updating Mercenary Corps',
        () => api.setAdventure(field, value),
        async () => {
          await get().loadOverview();
        },
      );
    },

    async setAdventureBatch(patch) {
      await attempt(
        'Updating Mercenary Corps',
        async () => {
          for (const [field, value] of Object.entries(patch)) {
            await api.setAdventure(field, value);
          }
        },
        async () => {
          await get().loadOverview();
        },
      );
    },

    async setCurrency(cid, amount) {
      await attempt(
        'Updating currency',
        () => api.setCurrency(cid, amount),
        async () => {
          await get().loadCurrencies();
          await get().loadOverview();
        },
      );
    },

    async setAllCurrencies() {
      const rows = get().currencies;
      const eligible = rows.filter((currency) => {
        const limit = currencyLimit(currency.item.cid);
        return limit.observed && currency.amount < limit.max;
      });
      if (eligible.length === 0) {
        toast.info(
          rows.some((currency) => currencyLimit(currency.item.cid).observed)
            ? 'Every observed balance is already at or above its reference.'
            : 'No currency has an observed reference balance.',
        );
        return;
      }
      const updated = await attempt(
        'Updating observed currencies',
        async () => {
          for (const currency of eligible) {
            await api.setCurrency(currency.item.cid, currencyLimit(currency.item.cid).max);
          }
        },
        async () => {
          await get().loadCurrencies();
          await get().loadOverview();
        },
      );
      if (updated !== null) {
        const skipped = rows.length - eligible.length;
        toast.success(
          `Set ${eligible.length.toLocaleString()} observed balance${eligible.length === 1 ? '' : 's'} to the highest seen value; ${skipped.toLocaleString()} row${skipped === 1 ? '' : 's'} left alone.`,
        );
      }
    },

    async setStack(kind, id, count) {
      await attempt(
        'Updating stack',
        () => api.setStack(kind, id, count),
        async () => {
          await get().loadInventory();
          await get().loadOverview();
        },
      );
    },

    async addStack(cid, count) {
      const added = await attempt(
        'Adding item',
        () => api.addStack(cid, count),
        async () => {
          await get().loadInventory();
          await get().loadOverview();
        },
      );
      if (added !== null) toast.success('Item added to the inventory.');
    },

    async questRewards() {
      try {
        return await api.questRewards();
      } catch (error) {
        toast.error(message(error));
        return [];
      }
    },

    async recruitableHeroes() {
      try {
        return await api.recruitableHeroes();
      } catch (error) {
        toast.error(message(error));
        return [];
      }
    },

    async recruitHero(cid) {
      const recruited = await attempt(
        'Recruiting hero',
        () => api.recruitHero(cid),
        async () => {
          await get().loadCharacters();
          await get().loadOverview();
        },
      );
      if (recruited) toast.success('Hero recruited at level 1.');
    },

    async questsInProgress() {
      try {
        return await api.questsInProgress();
      } catch (error) {
        toast.error(message(error));
        return [];
      }
    },

    async completeQuest(questId) {
      const completion = await attempt(
        'Completing quest',
        () => api.completeQuest(questId),
        async () => {
          await get().loadInventory();
          await get().loadCurrencies();
          await get().loadMounts();
          await get().loadOverview();
        },
      );
      if (completion) {
        const parts = [`${completion.grant.granted.length} reward${completion.grant.granted.length === 1 ? '' : 's'}`];
        if (completion.levelsGained > 0)
          parts.push(`corps +${completion.levelsGained} level${completion.levelsGained === 1 ? '' : 's'}`);
        if (completion.newGrade !== null) parts.push(`promoted to grade ${completion.newGrade}`);
        toast.success(`Quest complete: ${parts.join(', ')}.`);
      }
      return completion;
    },

    async grantQuestRewards(questIds) {
      const grant = await attempt(
        'Granting quest rewards',
        () => api.grantQuestRewards(questIds),
        async () => {
          await get().loadInventory();
          await get().loadCurrencies();
          await get().loadMounts();
          await get().loadOverview();
        },
      );
      if (grant) {
        const count = grant.granted.length;
        toast.success(
          `Added ${count} reward${count === 1 ? '' : 's'} from ${questIds.length} quest${questIds.length === 1 ? '' : 's'}.`,
        );
      }
      return grant;
    },

    async fillStacks(count) {
      const filled = await attempt(
        'Filling material stacks',
        () => api.fillStacks(count),
        async () => {
          await get().loadInventory();
          await get().loadOverview();
        },
      );
      if (filled === null) return;
      if (filled === 0) {
        toast.info('No eligible material stack was below that count.');
        return;
      }
      toast.success(
        `Raised ${filled.toLocaleString()} eligible stack${filled === 1 ? '' : 's'} to at least ${count.toLocaleString()}; no count was lowered.`,
      );
    },

    async setCharacter(cid, field, value) {
      await attempt(
        'Updating character',
        () => api.setCharacter(cid, field, value),
        async () => {
          await get().loadCharacters();
          await get().loadOverview();
        },
      );
    },

    async removeCharacter(cid) {
      const removed = await attempt(
        'Removing character',
        () => api.removeCharacter(cid),
        async () => {
          await get().loadCharacters();
          await get().loadOverview();
        },
      );
      if (removed !== null) toast.success('Character removed.');
    },

    async setSkill(cid, typeValue, level) {
      await attempt(
        'Updating skill',
        () => api.setSkill(cid, typeValue, level),
        async () => {
          await read(
            () => api.skills(cid),
            (skills) => set({ skills }),
          );
        },
      );
    },

    async removeSkill(cid, typeValue) {
      await attempt(
        'Removing skill',
        () => api.removeSkill(cid, typeValue),
        async () => {
          await read(
            () => api.skills(cid),
            (skills) => set({ skills }),
          );
        },
      );
    },

    async setTeamSlot(pageId, slot, cid) {
      await attempt(
        'Updating team',
        () => api.setTeamSlot(pageId, slot, cid),
        async () => {
          await get().loadTeams();
        },
      );
    },

    async setEquipment(dbid, field, value) {
      await attempt(
        'Updating equipment',
        () => api.setEquipment(dbid, field, value),
        async () => {
          await get().loadEquipment();
        },
      );
    },

    async setEquipmentGem(dbid, gemDbid) {
      await attempt(
        'Updating equipment',
        () => api.setEquipmentGem(dbid, gemDbid),
        async () => {
          await get().loadEquipment();
        },
      );
    },

    async setGem(dbid, field, value) {
      await attempt(
        'Updating gem',
        () => api.setGem(dbid, field, value),
        async () => {
          await get().loadGems();
        },
      );
    },

    async setKarma(dbid, field, value) {
      await attempt(
        'Updating karma',
        () => api.setKarma(dbid, field, value),
        async () => {
          await get().loadKarma();
        },
      );
    },

    async equipKarma(characterCid, dbid) {
      await attempt(
        'Equipping karma',
        () => api.equipKarma(characterCid, dbid),
        async () => {
          await get().loadKarma();
          await get().loadCharacters();
        },
      );
    },

    async unlockCostume(cid) {
      const added = await attempt(
        'Unlocking costume',
        () => api.unlockCostume(cid),
        async () => {
          await get().loadCostumes();
          await get().loadOverview();
        },
      );
      if (added !== null) toast.success(added ? 'Costume unlocked.' : 'That costume is already owned.');
    },

    async equipCostume(dbid, characterCid) {
      await attempt(
        'Equipping costume',
        () => api.equipCostume(dbid, characterCid),
        async () => {
          await get().loadCostumes();
        },
      );
    },

    async unlockMount(cid) {
      const added = await attempt(
        'Unlocking familiar',
        () => api.unlockMount(cid),
        async () => {
          await get().loadMounts();
          await get().loadOverview();
        },
      );
      if (added !== null) toast.success(added ? 'Familiar unlocked.' : 'That familiar is already owned.');
    },

    async equipMount(characterCid, dbid) {
      await attempt(
        'Equipping familiar',
        () => api.equipMount(characterCid, dbid),
        async () => {
          await get().loadMounts();
        },
      );
    },

    async setTitle(id, unlocked) {
      set({ titles: get().titles.map((title) => (title.id === id ? { ...title, unlocked } : title)) });
      await attempt(
        'Updating title',
        () => api.setTitle(id, unlocked),
        async () => {
          await get().loadOverview();
        },
      );
    },

    async unlockAllTitles() {
      const count = await attempt(
        'Unlocking every title',
        () => api.unlockAllTitles(),
        async () => {
          await get().loadTitles();
          await get().loadOverview();
        },
      );
      if (count !== null) toast.success('Every title is unlocked.');
    },

    async setRecipe(key, known) {
      set({ recipes: get().recipes.map((recipe) => (recipe.key === key ? { ...recipe, known } : recipe)) });
      await attempt(
        'Updating recipe',
        () => api.setRecipe(key, known),
        async () => {
          await get().loadOverview();
        },
      );
    },

    async unlockAllRecipes() {
      const count = await attempt(
        'Unlocking every recipe',
        () => api.unlockAllRecipes(),
        async () => {
          await get().loadRecipes();
          await get().loadOverview();
        },
      );
      if (count !== null) toast.success('Every recipe is known.');
    },

    async rawUpdate(table, rowid, column, value, advanced) {
      await attempt(
        'Writing cell',
        () => api.rawUpdate(table, rowid, column, value, advanced),
        async () => {
          const page = get().rawPage;
          if (page) await get().loadRawPage(table, page.offset, page.search ?? '');
        },
      );
    },

    async loadTeams() {
      await read(api.teams, (teams) => set({ teams }));
    },
  };
});

/** The catalog name in the chosen language, with a fallback to English. */
export function itemName(item: Item, language: string): string {
  return language === 'fr' && item.nameFr ? item.nameFr : item.nameEn;
}

export function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

/** Compare two decimal 64-bit ids without losing precision through `Number`. */
export function compareDbid(left: string, right: string): number {
  try {
    const a = BigInt(left);
    const b = BigInt(right);
    return a < b ? -1 : a > b ? 1 : 0;
  } catch {
    return left.localeCompare(right);
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(ms: number): string {
  if (!ms) return 'Unknown';
  return new Date(ms).toLocaleString();
}
