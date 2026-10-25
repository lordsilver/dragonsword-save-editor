import { BookOpenCheck, ChefHat, CookingPot, Flame, Search, Utensils } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ConfirmButton, EmptyPanel, Pager } from '@/components/common';
import { ItemIcon } from '@/components/item-icon';
import { PageHeader, Panel, Toolbar } from '@/components/page';
import { CountPill, InfoNote, StatTile } from '@/components/summary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { formatNumber, itemName, useApp } from '@/lib/store';
import type { Recipe, RecipeIngredient } from '@/lib/types';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'known' | 'unknown';
const PAGE_SIZE = 40;

export function CookingScreen() {
  const recipes = useApp((state) => state.recipes);
  const save = useApp((state) => state.save);
  const language = useApp((state) => state.settings.language);
  const pending = useApp((state) => state.pending);
  const setRecipe = useApp((state) => state.setRecipe);
  const unlockAllRecipes = useApp((state) => state.unlockAllRecipes);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [tool, setTool] = useState('all');
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<Recipe | null>(null);

  const tools = useMemo(() => [...new Set(recipes.map((recipe) => recipe.tool).filter(Boolean))].sort(), [recipes]);
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return recipes.filter((recipe) => {
      if (filter === 'known' && !recipe.known) return false;
      if (filter === 'unknown' && recipe.known) return false;
      if (tool !== 'all' && recipe.tool !== tool) return false;
      if (!needle) return true;
      return (
        recipe.dish.nameEn.toLowerCase().includes(needle) ||
        recipe.dish.nameFr.toLowerCase().includes(needle) ||
        recipe.dish.cid.toString().includes(needle) ||
        recipe.key.toString().includes(needle) ||
        recipe.tool.toLowerCase().includes(needle) ||
        recipe.ingredients.some(
          (ingredient) =>
            ingredient.nameEn.toLowerCase().includes(needle) || ingredient.nameFr.toLowerCase().includes(needle),
        )
      );
    });
  }, [filter, query, recipes, tool]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const visible = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const known = recipes.filter((recipe) => recipe.known).length;
  const percent = recipes.length ? (known / recipes.length) * 100 : 0;
  const busy = pending !== null;

  if (!save) return null;

  function updateQuery(value: string): void {
    setQuery(value);
    setPage(0);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`Account ${save.accountId} · Slot ${save.slot}`}
        title="Cooking"
        description="The cookbook, its ingredients and the effects each dish grants. Recipe knowledge is a bit in tb_switch, not an inventory row."
        actions={
          <ConfirmButton
            title="Learn every recipe?"
            description={`Sets all ${formatNumber(recipes.length)} recipe bits in tb_switch. Existing bits are preserved.`}
            confirmLabel="Learn all"
            variant="outline"
            size="sm"
            disabled={busy || recipes.length === 0 || recipes.every((recipe) => recipe.known)}
            onConfirm={() => void unlockAllRecipes()}
          >
            <CookingPot />
            Learn every recipe
          </ConfirmButton>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={<BookOpenCheck />}
          label="Known"
          value={`${formatNumber(known)} / ${formatNumber(recipes.length)}`}
          detail={`${percent.toFixed(0)}% of the cookbook`}
        />
        <StatTile icon={<ChefHat />} label="Tools" value={formatNumber(tools.length)} detail="Cooking methods in use" />
        <StatTile
          icon={<Utensils />}
          label="Matching"
          value={formatNumber(rows.length)}
          detail={query ? `Search: ${query}` : 'No search applied'}
        />
        <StatTile
          icon={<Flame />}
          label="Unknown"
          value={formatNumber(recipes.length - known)}
          detail="Can be learned here"
        />
      </div>

      <Panel contentClassName="p-4">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Cookbook progress</span>
          <span className="numeric">
            {formatNumber(known)} / {formatNumber(recipes.length)}
          </span>
        </div>
        <Progress value={percent} indicatorClassName="bg-brand" />
      </Panel>

      <Toolbar>
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            placeholder="Search dishes, ingredients, ids or tools"
            className="h-8 w-full rounded-md border border-input bg-background pr-2 pl-8 text-xs shadow-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none dark:bg-input/30"
          />
        </div>
        <div className="flex gap-1 rounded-lg bg-muted/60 p-0.5">
          {(
            [
              ['all', 'All'],
              ['known', 'Known'],
              ['unknown', 'Unknown'],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              size="xs"
              variant={filter === value ? 'secondary' : 'ghost'}
              onClick={() => {
                setFilter(value);
                setPage(0);
              }}
            >
              {label}
            </Button>
          ))}
        </div>
        <select
          value={tool}
          onChange={(event) => {
            setTool(event.target.value);
            setPage(0);
          }}
          aria-label="Filter by cooking tool"
          className="h-8 rounded-md border border-input bg-background px-2 text-xs shadow-xs dark:bg-input/30"
        >
          <option value="all">Every tool</option>
          {tools.map((value) => (
            <option key={value} value={value}>
              {toolLabel(value)}
            </option>
          ))}
        </select>
        <Badge variant="outline" className="ml-auto">
          {formatNumber(rows.length)} recipes
        </Badge>
      </Toolbar>

      {rows.length === 0 ? (
        <EmptyPanel
          icon={<CookingPot />}
          title={recipes.length === 0 ? 'The cookbook is empty' : 'No recipe matches that filter'}
          description={
            recipes.length === 0
              ? 'The recipe catalog failed to load. Reopen the app or check the bundled data.'
              : 'Try a different search term, tool, or knowledge filter.'
          }
        />
      ) : (
        <>
          <Panel contentClassName="p-0" title="Cookbook" description={`Page ${safePage + 1} of ${pages}.`}>
            <div className="divide-y">
              {visible.map((recipe) => (
                <RecipeRow
                  key={recipe.key}
                  recipe={recipe}
                  language={language}
                  busy={busy}
                  onToggle={(value) => void setRecipe(recipe.key, value)}
                  onDetails={() => setDetail(recipe)}
                />
              ))}
            </div>
            <div className="border-t px-4 py-2">
              <Pager page={safePage} pages={pages} total={rows.length} onPage={setPage} />
            </div>
          </Panel>
          <InfoNote>
            Ingredients show how many the save already owns versus how many the recipe needs. Counts come from
            tb_stackable_item and are grouped by item category for ingredient-type entries, so a recipe can be craftable
            even when the exact item differs.
          </InfoNote>
        </>
      )}

      <RecipeDialog
        recipe={detail}
        open={detail !== null}
        onOpenChange={(open) => !open && setDetail(null)}
        language={language}
      />
    </div>
  );
}

function RecipeRow({
  recipe,
  language,
  busy,
  onToggle,
  onDetails,
}: {
  recipe: Recipe;
  language: string;
  busy: boolean;
  onToggle: (known: boolean) => void;
  onDetails: () => void;
}) {
  const effect = recipe.effects[0];
  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <ItemIcon item={recipe.dish} size={42} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">{itemName(recipe.dish, language)}</span>
            <Badge variant="outline" className="text-[10px]">
              {toolLabel(recipe.tool)}
            </Badge>
            {recipe.dishes.length > 1 && (
              <Badge variant="secondary" className="text-[10px]">
                {recipe.dishes.length} variants
              </Badge>
            )}
            {recipe.known ? (
              <Badge variant="outline" className="border-emerald-400/30 bg-emerald-400/10 text-[10px] text-emerald-300">
                Known
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                Unknown
              </Badge>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="font-mono">Key {recipe.key}</span>
            <span>·</span>
            <span className="font-mono">CID {recipe.dish.cid}</span>
            {recipe.effectName && (
              <>
                <span>·</span>
                <span className="text-brand">{language === 'fr' ? recipe.effectName.fr : recipe.effectName.en}</span>
              </>
            )}
          </div>
          {effect && (
            <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground/80">
              {language === 'fr' ? effect.fr : effect.en}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            {recipe.ingredients.map((ingredient) => (
              <IngredientChip key={`${ingredient.kind}:${ingredient.id}`} ingredient={ingredient} language={language} />
            ))}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Switch
            checked={recipe.known}
            disabled={busy}
            aria-label={`Know ${recipe.dish.nameEn}`}
            onCheckedChange={onToggle}
          />
          <Button variant="ghost" size="xs" onClick={onDetails}>
            Details
          </Button>
        </div>
      </div>
    </div>
  );
}

function IngredientChip({ ingredient, language }: { ingredient: RecipeIngredient; language: string }) {
  const enough = ingredient.owned >= ingredient.qty;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px]',
        enough
          ? 'border-emerald-400/20 bg-emerald-400/5 text-emerald-200/90'
          : 'border-border bg-muted/30 text-muted-foreground',
      )}
      title={`${ingredient.kind === 'item' ? 'Item' : 'Category'} ${ingredient.id} · owned ${ingredient.owned}`}
    >
      <span className="max-w-36 truncate">{language === 'fr' ? ingredient.nameFr : ingredient.nameEn}</span>
      <span className="numeric shrink-0 opacity-70">
        {formatNumber(ingredient.owned)}/{formatNumber(ingredient.qty)}
      </span>
    </span>
  );
}

function RecipeDialog({
  recipe,
  open,
  onOpenChange,
  language,
}: {
  recipe: Recipe | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  language: string;
}) {
  if (!recipe) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent />
      </Dialog>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ItemIcon item={recipe.dish} size={32} />
            {itemName(recipe.dish, language)}
          </DialogTitle>
          <DialogDescription>
            Key {recipe.key} · {toolLabel(recipe.tool)} · {recipe.known ? 'known' : 'unknown'} · category{' '}
            {recipe.category}, bit {recipe.bit}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              Ingredients
            </div>
            <div className="flex flex-wrap gap-1">
              {recipe.ingredients.map((ingredient) => (
                <IngredientChip
                  key={`${ingredient.kind}:${ingredient.id}`}
                  ingredient={ingredient}
                  language={language}
                />
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              Dish variants
            </div>
            <div className="flex flex-wrap gap-1">
              {recipe.dishes.map((cid) => (
                <CountPill key={cid}>CID {cid}</CountPill>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              Effects {recipe.effectName ? `· ${language === 'fr' ? recipe.effectName.fr : recipe.effectName.en}` : ''}
            </div>
            <div className="space-y-1">
              {recipe.effects.length === 0 && (
                <p className="text-xs text-muted-foreground">No effect text in the catalog.</p>
              )}
              {recipe.effects.map((effect, index) => (
                <div
                  key={`${effect.en ?? ''}|${effect.fr ?? ''}`}
                  className="flex gap-2 rounded-md border bg-muted/20 px-2 py-1.5 text-[11px]"
                >
                  <span className="numeric shrink-0 text-muted-foreground">{index + 1}.</span>
                  <span>{language === 'fr' ? effect.fr : effect.en}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toolLabel(tool: string): string {
  if (!tool) return 'Unknown tool';
  return tool
    .toLowerCase()
    .split(/[_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
