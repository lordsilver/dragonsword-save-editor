# Game assets

Everything the editor knows about the game comes from DragonSword Awakening's own files: the catalog, rules and texts generated from its XML tables into `crates/core/data` (see [The catalog from the game tables](#the-catalog-from-the-game-tables) and [Game rules](game-rules.md)), and the icons (`apps/desktop/src/assets/sprite.webp`). This page records how the icons were extracted and packed, so the work can be repeated after a game update. The extracted files themselves are not part of this repository; only the packed sprite is, stored with Git LFS.

## What is bundled

`scripts/gen-icons.mjs` takes from the export only what the catalog uses:
- each item's icon, found by the game path the catalog records for it (`iconPath` in `crates/core/data/items.json`, for example `Art/UI/InGame/Icon_Item/Common/Icon_Item_Common_Gold`);
- each hero's square portrait, `Art/UI/InGame/Icon_Character/Icon_Character_<ImageType>`, where `ImageType` comes from the game's `PCCharacterData` table (hero 10007 is `Johnny`; Kalsion's art is named `Cassius`, Ornette's `Onette`).

Where the game ships no such texture (see [Textures the game does not ship](#textures-the-game-does-not-ship)), it uses what the game's own tables use instead:
- a costume item: its `CostumeData` card, `Art/UI/InGame/Img_Item/Costume/` or `Costume_Weapon/Img_Item_Costume_<same name>`, cropped to its top square (the cards are 322×862);
- a hero without a portrait (Viola): the hero's `Img_Character/Mini/Img_Character_Mini_<ImageType>` bust, cropped the same way;
- a familiar without an item icon (1320033): the icon of the familiar whose `VehicleCharacterData.IconName` is the same image (1320032).

It also packs what `crates/core/data/game.json` names (see [Game maths and texts](#game-maths-and-texts)): the nine trait emblems `Common/Icon_CharacterAbility_<trait>`, the grade star `Common/Icon_Grade_Star_01`, and each costume's switched hero portrait, `CostumeData.SwitchIconChrPath` (`Icon_Character/Icon_Character_<hero>_Unique_01` and the like; all 23 costumes with a `CostumeData` row have one). The 2026-10-30 run packed 726 images.

It scales everything to 128-pixel cells, packs them into one WebP sheet, and writes each item's cell offset and `iconSize` back into `items.json`. Cell 0 stays empty: an item at offset 0,0 has no icon. The 2026-10-27 run packed 577 images for 1,258 of the 1,259 catalog items (with the additions below); the one left is Kalien's "Great Spirit's Vestment Weapon" costume (9990023), for which the game has no art at all.

```bash
node scripts/gen-icons.mjs <assets-dir> <extract-dir> <fx-dir>
```

`<assets-dir>` is the export below, unzipped. `<extract-dir>` is the folder of XML tables used by `scripts/gen-growth.mjs`; only `PCCharacterData.xml` and `VehicleCharacterData.xml` are read. The script is deterministic for a given export. `apps/desktop/test/icons.test.ts` checks that the frontend's cell size matches `iconSize`.

## Grade artwork

`gen-icons.mjs` also writes the game's grade artwork next to the sprite, for normal, superior, rare, epic and legendary (textures 01 to 05): the inventory tile background `Frame/Frame_Item_Grade_0N` as `grade-tile-<grade>.webp`, and the item card header `Frame/Frame_Grade_0N` as `grade-card-<grade>.webp`. The inventory draws its tiles and its item card from them, as the game's inventory does.

## The catalog from the game tables

`scripts/gen-catalog.mjs <extract-dir>` writes the editor's catalog from the game's tables (2026-10-30):
- `items.json`: all 1,221 `GameItemData` rows, named in English and French from `StringData`, with the game's `ItemType` (`type`), grade, category (`group`, a `GameItemCategoryData` row) and icon path; the 37 playable heroes by the CID `tb_character` stores (`PCCharacterData`, `IsUserCharacter`, 10000–10999); and the one familiar with no item row, 1320033, under the only name the game gives it, its Korean `VehicleCharacterData.Name`. The editor's own catalog category follows the `ItemType`: `PAY_*` and `PLAY_POINT_*` are currencies, `CHARACTER` a hero item, `VEHICLE` a familiar, `EQUIPMENT` gear, `COOKING` a dish, `COSTUME` a costume, and everything else a material. Four unreleased heroes share the name Lyn and two share Kalien; the ones whose art (`ImageType`) differs get it in brackets ("Lyn (Gilford)", "Kalien (Aruru)"). 17 test and system items have no `Name` string (buff dishes for testing, placeholder coins, an unreleased hero's items); they keep no name, and the editor names them by category and CID and counts them as unknown.
- `item_categories.json`: the 74 `GameItemCategoryData` rows an item or a recipe uses, named from `StringData`; `group` is the row's `CategoryType`, which is also the game's inventory tab.
- `recipes.json`: all 1,025 `CookRecipeData` rows. `key` is `CookBook_SwitchData`, the `tb_switch` bit the save sets when the recipe is learned (category `key / 64`, bit `key % 64`); `tool` is the `ToolType`; each `IngredientCond` is an item (`INGREDIENT_ID`) or a category of ingredients (`INGREDIENT_TYPE`); `dishes` are the five `Cook_ID` dishes, normal to legendary. A dish's `Value1` is its `ContentsBuffData` row, whose `Name` is the effect ("Recovery") and `Desc` the effect at that grade ("[Team] Immediately restores 850 HP."). An ingredient category is drawn with its lowest-grade ingredient's icon (lowest CID on a tie); `tools` names the three cooking tools from `CookToolData`.

The script stops on anything it does not expect: an item without an `ItemType` or with an unknown grade, a recipe ingredient or dish missing from `GameItemData`, two recipes on one switch bit, a used category the table lacks. It replaced a catalog generated by an earlier tool from the same tables plus a fan site's names; compared with that file, 95 English and 25 French names now read as the game's current strings (for example "Mercenary Crew Grade EXP", "Damaged Rune of Determination", "Infiltrator Helmet"), the 1,221 items carry the game's own category instead of a made-up "unsorted", karma 1710526 has its own icon instead of a skill's, recipes 4006–4008 list their five graded dishes instead of one dish five times, and 464 dish effects read as the game's current text ("maximum HP"). `items_extra.json`, which filled the earlier file's gaps, is gone.

`scripts/gen-catalog-extras.mjs <extract-dir> <root-maps.json>` rebuilds `titles.json` whole from `AccountTitleData`: all 109 titles with their colour and every stat bonus (a `*_Per` value is a fraction, 0.023 is +2.3%).

The same script writes `crates/core/data/skills.json` from `PCSkillGrowthData`: each of the 26 heroes' nine skill slots as the game's Skill screen lays them out. `type` is the save's `tb_skill_growth.TYPE_VALUE`, and `order` is the game's `SlotOrder`: 1–4 the left column (attack 6, jump attack 5, Dodge 8, roll attack 7), 5–8 the right column (actives 1 and 2, signals 3 and 4) and 9 the master skill (801). `signal` marks `SlotType` 3, the two signal skills (types 3 and 4), which the game draws as diamonds instead of circles. Names and descriptions come from `StringData` with the colour tags removed. The damage percentages the game shows under a description are not included: they come from `PCComboLevelData` through each skill's data asset, which the tables do not link. Each icon is a texture or a Paper2D sprite under `Icon_Skill`; the export has every sprite's texture as a PNG without the `_Sprite` suffix, so `gen-icons.mjs` packs it like an item icon (118 distinct icons) and writes the offsets back into `skills.json`.

A skill's effect, which the game shows as a tinted disc and a corner badge, is the `IconColor` of its first combo step. `PCCharacterData.ComboTableID` names the hero's rows in `PCComboData`, and their `GroupIndex` is the skill's `TYPE_VALUE`. `ATTACK` is a plain skill; the others are `AIR`, `BLEED`, `DOWN`, `FIRE`, `HEAL`, `ICE`, `POISON`, `SHOCK` and `STUN`. The names come from the Skill screen's own strings, 800037–800044 and 800051 (Stun, Airborne, Knockdown, Bleed, Shock, Burn, Poison, Frost, Recovery), which no table links, so the script maps them by hand. The badge is `Common/State/State_Mark_<state>`, with `BLEEDING` for `BLEED`, as the root widget's `MesmerizedUIVer2IconMap` says; `ATTACK` has none. (`PCSkillGrowthData.SkillIconColor` uses the same enum but disagrees with the game's screen, for example STUN on Theresia's Judgment Spiral, so it is ignored.)

The disc colour comes from the in-game root widget, see [Skill colours](#skill-colours) below: `IconColor` is the enum `EMesmerizedUIType`, and `MesmerizedUIColor` gives every value a colour, `ATTACK` (#B39C6F, khaki gold) included. `skills.json` stores it per effect and as `attackColor`, and the backend gives each skill its colour. The editor builds each slot from the game's own layers, described under [Skill colours](#skill-colours).

Run them before `gen-icons.mjs`, which gives the items and the skills their icons:

```bash
node scripts/gen-catalog.mjs <extract-dir>
node scripts/gen-catalog-extras.mjs <extract-dir> <root-maps.json>
node scripts/gen-game-data.mjs <extract-dir>
node scripts/gen-icons.mjs <assets-dir> <extract-dir> <fx-dir>
```

The table readers decode the XML entities in the tables' attributes (`&quot;`, `&lt;`, `&#xA;` …); before 2026-10-30 `skills.json` carried 24 descriptions with them escaped.

## Game maths and texts

`scripts/gen-game-data.mjs <extract-dir>` writes `crates/core/data/game.json`, everything the editor needs to show a hero, a piece of equipment, a karma, a costume or an item the way the game does. [Game rules](game-rules.md) gives each formula, the table it comes from and the screenshots it was checked against (Hero stats, Skills on the Skill screen, Costumes and portraits, Items in the bag).

| Key                                          | From                                                                                                                                                     | Holds                                                                                                                       |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `stats`                                      | `StatListData`, `StringData`                                                                                                                             | every stat's name (English, French), whether it is a percentage, and its point value                                        |
| `traits`                                     | `KarmaData`, `GameItemData`, `GameItemCategoryData`                                                                                                      | each `CharacterAbilityType`'s name (the karma category of the same trait) and emblem                                        |
| `levelRatio`, `heroes`                       | `PCCharacterLevelData`, `PCCharacterData`, `StatDefaultData`, `StatAscendData`, `TranscendData`                                                          | each playable hero's points, ratios, base rates, breakthrough points, quote and story, and its six Awaken steps             |
| `statRolls`, `enchant`, `equipment`, `sets`  | `EquipmentMainStatData`, `EquipmentSubStatData`, `EquipmentLevelData`, `EquipmentSettingData`, `EquipmentData`, `EquipmentSetData`, `EquipmentSkillData` | what every stat roll is, the enchant ratios and caps per grade, each piece's default points and set, and each set's bonuses |
| `karmaLevels`, `karma`                       | `KarmaLevelData`, `KarmaData`, `KarmaTranscendData`                                                                                                      | karma ratios per level, points, ratios, breakthrough points and trait effects                                               |
| `costumes`                                   | `CostumeData`, `GameItemData`                                                                                                                            | each costume item's hero, slot (`CLOTH`, `WEAPON`), card and the portrait it switches to                                    |
| `skills`                                     | `PCSkillGrowthData`, `PCComboLevelData`                                                                                                                  | each slot's four text lines and, per level, its damage, gold, materials and breakthrough                                    |
| `tabs`, `categories`, `items`                | `GameItemCategoryData`, `GameItemData`, `StringData`                                                                                                     | the inventory tabs, each category's tab and name, and every item's description, second text and cooldown                    |
| `ui`, `maxStamina`, `gradeStars`, `starIcon` | `StringData`, `GlobalControlData`                                                                                                                        | the screens' own labels ("+{0} needed", "Owned: {0}", "Trait Effect", "Not Applied" …), Max Stamina and the star            |

The script stops when a table breaks an assumption (a stat no `StatListData` row names, a skill level missing, a trait in two karma categories, Max Stamina other than 240), so a game update fails loudly. Strings keep the game's rich-text tags (`<LightOrange>…</>`, `<Yellow>…</>`, `<br>`); the frontend draws them in the game's colours (`components/game-text.tsx`). `cargo test -p dsa-core --lib gamedata` pins the screenshot values.

## Skill colours

The colours the skill screen paints per effect are not in the XML tables. A second export on 2026-10-27 (the agent's `dsa-skill-ui.zip`, kept outside the repository like the first) found them:
- Three `TMap<EMesmerizedUIType, FColor>` properties belong to the game's C++ root widget class `DRootPanelIngame`: `MesmerizedUIColor`, `MesmerizedSwitchingColor` and `MesmerizedSkillTypeColor`. Its one blueprint subclass, `/Game/UI/Root/DRootIngame`, stores the first two in its class default object. The third keeps its C++ default, which is compiled into the exe and could not be recovered.
- Which map the skill screen reads is decided in C++; the exe shows it is `MesmerizedUIColor`, for the glow rings (below). `MesmerizedSwitchingColor` differs only for STUN (#F5D000), BLEED (#C63555) and ATTACK (#B39C70).
- The skill-slot widgets (`DUWG_CharacterSkill_Def`, circle, and `DUWG_CharacterSkill_Tag`, diamond) and the detail layer (`DLayerCharacterSkill`) hold a `Border` named `ColorBorder` (designer tint #32403F) that the C++ recolours. The FX ring images carry a designer tint #FFCA7F, which the code replaces with the effect's colour (below).

Which map the screen reads was settled from the game's exe (`DSClient-Win64-Shipping.exe`, SHA-256 `7fd80ccf…eeef`, read only, never run), with the scripts in `tools/exe-analysis/`:
- UHT's property records (a pointer to the name string, then flags and `Offset << 16 | ArrayDim`) put `DRootPanelIngame`'s maps at `MesmerizedColor` 0x7d8, `MesmerizedUIColor` 0x828, `MesmerizedSwitchingColor` 0x878, `MesmerizedSkillTypeColor` 0x8c8, and the slot widget's `FX_ring01`–`03` at 0x3a8–0x3b8 and `ColorBorder` at 0x3c8.
- `UBorder::SetBrushColor` (0x142991680, found as the one function that stores `[rdx]` to the border's `BrushColor` at +0x2d0) has a call at 0x14633887d in the slot's colour function. That function takes the root panel, looks the skill's `IconColor` (slot byte +0x544) up in `MesmerizedUIColor` for the three FX rings, then in `MesmerizedSkillTypeColor` for `ColorBorder`, and skips the border when that map has no entry. The rings' setter, 0x1429f5010, is `UImage::SetBrushTintColor` (it stores the brush tint at `UImage`+0x1d0, like the inlined body of that native's exec thunk), so the colour replaces the rings' designer tint.
- The colour is not converted through FLinearColor's sRGB table (the `linear` column of `docs/exports/skill-ui/` is not what the rings get). Before each of the three calls the code converts the FColor's bytes to floats and multiplies them by 1/255 (`FColor::ReinterpretAsLinear`). Slate then packs the tint into an sRGB vertex byte and the ring's vertex shader decodes it, so the shader sees the colour's bytes / 255 as linear values. `docs/exports/skill-shader/` has the addresses and bytes.
- The root panel's constructor (around 0x145e7ead9) initialises all four maps empty and adds nothing, and the blueprint does not serialise `MesmerizedSkillTypeColor`. `ColorBorder` turned out to be the dark plate behind the skill's name (`TypeText`), so it keeps its designer tint #32403F; the effect colour reaches the slot only through the FX rings.

The slot widgets themselves (`json/UI/Widget/ListItemWidget/DUWG_CharacterSkill_Def.json` and `_Tag.json` in the skill-screen export) give the layers, every one filling the 166 px slot box, bottom to top:

| Layer                                             | Circle (`_Def`)                                                                                                                           | Diamond (`_Tag`, signal skills)                                                                                                                 |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `ItemBG`                                          | `Btn/Btn_Skill_Info_Bg_02` (dark disc, white rim)                                                                                         | `Btn/Btn_Skill_Info_Bg_05`                                                                                                                      |
| `ItemIcon`                                        | the skill's glyph                                                                                                                         | the skill's glyph                                                                                                                               |
| FX rings, tinted by code with `MesmerizedUIColor` | `FX_ring02`: `FXT_ring13_UI_ad01` (MainTX `fxt_ring13b`, translucent); `FX_ring03`: `FXT_ring13_UI_ad02` (MainTX `fxt_ring13c`, additive) | `FX_ring01`: `Mask_Fx_Skill_SignalOutGame` (MainTX `Mask/Mask_Fx_Skill_Signal`, additive), in a box inset 8 units on each side, at opacity 0.85 |

`FX_ring01` on the circle and `FX_ring02` on the diamond are collapsed by default.

The rings' base material, `fxm_default_UI`, has no readable graph, but its compiled shaders ship in the paks' shader archives. A third export on 2026-10-27 (`dsa-skill-shader.zip`, record in `docs/exports/skill-shader/`) disassembled them, decoded which material parameter fills each shader constant, and read the colour path in the exe. Per pixel, with (u, v) the ring image's UV (v down), t the UI clock in seconds and C the effect colour's bytes / 255:

```
vc = C (as linear values)          va = 1, or 217/255 for the signal ring (opacity 0.85 sent as a byte)
h  = Tile / 2;  p = (u·Tile − h, (v + VOffset)·Tile − h);  θ = 2π · Rotator_Speed · t
N  = noise.rgb at (p.x cos θ − p.y sin θ + h, p.x sin θ + p.y cos θ + h), raised to noise_pow (0 where ≤ 0)
M  = MainTX at (u, v)
E  = max(0, Main_Str · (noise_str · N + M.rgb) · vc)       (the material's emissive, first tint)
O  = saturate(M.a · Main_Opa · va)                         (the material's opacity)
translucent: colour = sRGB(E · vc), alpha = O · va;  dst = colour · alpha + dst · (1 − alpha)
additive:    dst = min(1, dst + sRGB(E · O · vc · va))
```

Every texture is sampled bilinear with wrap addressing and its RGB decoded from sRGB (all have `SRGB` on); alpha is not decoded. Blending happens on the encoded display values, as CSS blends, over the disc and glyph drawn as plain straight-alpha images. The colour is applied twice, once in the material and once by Slate, so a ring's colour goes roughly as C²: that is why khaki ATTACK rings read cream while FIRE stays red. `MaskTX` (`fxt_flare11`) is never sampled, because the material's `Mask` static switch is off in both compiled permutations.

| Ring   | MainTX                      | noise          | Tile | VOffset | Rotator_Speed (turns/s) | noise_pow | noise_str | Main_Str | Main_Opa |
| ------ | --------------------------- | -------------- | ---- | ------- | ----------------------- | --------- | --------- | -------- | -------- |
| Glow   | `fxt_ring13b`               | `fxt_noise012` | 0.8  | −0.3    | −0.05                   | 1         | 1         | 1.0      | 0.5      |
| Line   | `fxt_ring13c`               | `fxt_grad10a`  | 1    | 0       | −0.25                   | 3         | 3         | 0.6      | 0.5      |
| Signal | `Mask/Mask_Fx_Skill_Signal` | `fxt_grad10a`  | 1    | 0       | +0.5                    | 1         | 3         | 1.0      | 0.5      |

`gen-icons.mjs` writes the discs as `skill-disc-circle.webp` and `skill-disc-diamond.webp`, and for each effect colour (ATTACK and the nine effects) the three rings with this maths averaged over their motion (120 time samples over 20 s, whole turns of all three) as 256 px lossless `skill-ring-<glow|line|signal>-<effect>.webp`, each covering the whole slot box. The glow's alpha does not move, so its layer is the mean colour with that alpha; the line and signal layers hold the mean added light as straight colour with alpha = its brightest channel. The editor draws the disc, the glyph at the slot's own size with no filter, then on a circle the glow (normal blending) and the line (`mix-blend-mode: plus-lighter`), on a diamond the signal ring (`plus-lighter`). The game rotates the rings' noise; the editor keeps the average still.

The layers match the export's reference renderer (`tools/slotrender`, `layers` mode) to within 1/255 per channel. Scored against 30 in-game screenshots (six heroes, five frames each, averaged), the export measures a mean CIELAB error inside the disc of 3.65 for the exact shader maths and 3.73 for these layers stacked, against 5.43 for the fitted formula they replace (6f8272b); the same maths reproduces single frames at 3.20 with one clock offset per hero. Rendered by Chrome at the game's 165 px per slot with the editor's own sprite glyphs and scored on the same pixels (`docs/exports/skill-shader/slots.mjs`), the editor scores 4.51 against 5.99 for the fitted formula, better on all 42 unselected slots (circles 4.74 from 5.68, diamonds 3.94 from 6.75); WebKitGTK renders the same pixels. The fitted formula's record stays in `docs/exports/skill-slot-fit/`. `<fx-dir>` is the skill-screen export's `png/` folder, which holds the FX textures.

CUE4Parse cannot read those maps: the Nexus `.usmap` lacks one property of `DRootPanelIngame` for this game build, so every property after it is read one slot late. `tools/asset-export/decode_root.py` decodes the class default object's bytes by hand and checks the layout (the value after the nine maps must be the 10-entry `AttackCombatSprite` array) before writing anything. With the updated exporter in `tools/asset-export/`:

```bat
set DOTNET_ROOT=C:\Users\Gary\dsa-work\dotnet
dotnet DsaExport.dll raw   "C:\Games\DragonSword Awakening" C:\Users\Gary\dsa-work\tools DS/Content/UI/Root/DRootIngame.uexp DRootIngame.uexp
dotnet DsaExport.dll names "C:\Games\DragonSword Awakening" C:\Users\Gary\dsa-work\tools DS/Content/UI/Root/DRootIngame.uasset DRootIngame.names.tsv
python -I decode_root.py DRootIngame.uexp DRootIngame.names.tsv DRootIngame.Default__DRootIngame_C.maps.json
```

The exporter's other modes (`list`, `grep`, `schema`, `props`, `dump`) search package headers, print the mappings, and dump packages as JSON; that is how the widget and the maps were found. Pass the decoded `.maps.json` to `gen-catalog-extras.mjs`, which stops if a colour is missing. If a game update moves the export offset (655 in this build, from the `names` export map), the decoder's layout check fails instead of writing wrong colours.

## The game's screens compared

Screenshots of the game's Hero > Skill and Inventory screens (2026-10-27) were compared with the editor. What they show, beyond the tables above:
- **Skill discs.** The game keeps a disc dark nearly to its edge and carries the effect's colour in a band along the rim; plain skills have a dark olive disc with a khaki-gold rim. STUN reads as a muted olive gold on screen, much softer than its `#FFDA59`. Selecting a skill adds a light ring around it but does not change the disc's colour. The glyph is about as large as the disc, so tips (a sword's point, a wing) reach past the edge. The editor now draws the slot from the game's own layers (Skill colours, above).
- **Moving light.** The moving light on a slot is its rings' rotating noise textures (Skill colours, above); `FXT_UI_Icon01_N` and `FXT_UI_Icon05` belong to the collapsed selection images. The master skill's material (`FXT_UI_SkillMaster_Icon01_*`) circles an orange-gold ray. That is why the same skill looks brighter in one screenshot than another. The editor draws the rings' average and does not animate them.
- **Skill detail pane.** Next to the large icon the game shows an effect chip (badge and name, "Airborne"), the slot's label (strings 800033–800036: Active 1, Active 2, Signal A, Signal B), "Attack Power N% Damage", "Inflicts the X status effect" and, for signal skills, "Activation Conditions" (for example "Can be activated when the target is in the Airborne status"). The editor shows the effect name; the slot label and the inflict line are game strings it could add, and the damage and conditions come from combo data that is not yet linked to skills (see [Game rules](game-rules.md), Q10).
- **Inventory.** Tiles are the grade artwork above with the count in a bar across the foot, and the item card opens with the grade's header art. Cooked dishes, ingredients and equipment also show 1–5 grade stars (`Common/Icon_Grade_Star_*`), and equipment shows its "+N" upgrade level; the editor does not show these yet. The game's tabs are Cooking, Equipment, Karma, Rune, Materials, Ingredients, Important and Quest.

## Git LFS

`.gitattributes` stores `apps/desktop/src/assets/*.webp` and `*.png` with Git LFS. A fresh clone needs `git lfs install` (once per machine) before checkout, or the sprite is a small pointer file and every icon is blank. `git lfs install --local` was run in this repository; the tool comes from mise (`git-lfs` in `~/.config/mise/config.toml`).

## The export

Done on 2026-10-27 on the PC with the game installed, by a separate Claude Code session given a written brief. Everything below comes from that session's report.

### The game files

- Install: `C:\Games\DragonSword Awakening`. Version probably v1.1.1, unconfirmed: the executables carry no version resource, and the only marker is a checksum file named `v1.1.1.xxh128` in the install root.
- Engine: Unreal Engine 5.3. CUE4Parse has a profile for the game, `GAME_DragonSwordAwakening` (`GAME_UE5_3` + 10), including its own pak index reader.
- Archives: `DS\Content\Paks`, 50 classic `.pak` files (about 19.5 GB), no IoStore (`.utoc`/`.ucas`). The pak index is AES-encrypted and the data Oodle-compressed.
- AES key: `0x263479C442D45B7EEDE7B3A36BBB3C3B39EF9178A2F82AB694FB410AB15E01AD`.
- Mappings: the cooked packages use unversioned properties, so CUE4Parse needs a `.usmap`. The one used is "DragonSword Awakening.usmap" from Nexus Mods, DragonSword Awakening mod 88 "Fmodel .usmap for Modders" v1.0 (2026-07-31), downloaded by hand. SHA-256 `7FD69A3819BE6C33BDBFCCEF5BCACB20E1C2ACC921E62D929483A9084B11905C`. A game update can break it; the mod page or a dumper such as Dumper-7 would provide a new one.

### Tools

| Tool                                  | Version                                                            | Source                                                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| .NET SDK                              | 10.0.403                                                           | Microsoft's signed `dotnet-install.ps1`, installed into a work folder with `-NoPath`                                                       |
| CUE4Parse and CUE4Parse-Conversion    | master at `df14b99` (2026-10-26, package 1.2.2), built from source | https://github.com/FabianFG/CUE4Parse                                                                                                      |
| Oodle (`oodle-data-shared.dll`)       | 2.9.16                                                             | downloaded by CUE4Parse's `OodleHelper` from https://github.com/WorkingRobot/OodleUE/releases (build 2026-06-04-1357, the one FModel uses) |
| zlib-ng (`zlib-ng2.dll`)              | 2.3.2                                                              | downloaded by CUE4Parse's `ZlibHelper`                                                                                                     |
| Detex (`Detex.dll`, BC6H/BC7 decoder) | embedded in CUE4Parse-Conversion                                   | unpacked at start-up                                                                                                                       |
| DsaExport                             | written for this export                                            | [`tools/asset-export`](../tools/asset-export)                                                                                              |

CUE4Parse pulls in, among others, AssetRipper.TextureDecoder 2.6.2, SkiaSharp 2.88.9 and SixLabors.ImageSharp 3.1.12. The optional CUE4Parse-Natives C++ library is not needed.

### DsaExport

[`tools/asset-export/Program.cs`](../tools/asset-export/Program.cs) is a .NET console program that only reads the paks. It mounts `DS\Content\Paks` with the game's CUE4Parse profile, submits the AES key, loads the newest `.usmap` in its tools folder, and then:
- selects every package under `/Game/Art/UI/`, plus any package whose folder path contains `Icon`, `Portrait` or `Img_` (case-insensitive);
- decodes each `Texture2D` at full size (the first mip with data) and writes it as PNG under its game path (`/Game/Art/UI/X/Y` becomes `Art/UI/X/Y.png`);
- collects each Paper2D sprite, exports its atlas page (an atlas package holds several pages, written as `<package>.<page>.png`, e.g. `Mercenaries.Texture2D_5.png`) and records its rectangle from `BakedSourceUV` and `BakedSourceDimension`;
- writes `manifest.csv` (game path, PNG path, width, height, pixel format), `sprites.json` (name, asset, atlas page, PNG, x, y, width, height) and `failures.csv`.

[`DsaExport.csproj`](../tools/asset-export/DsaExport.csproj) expects the CUE4Parse clone at `..\src\CUE4Parse` beside the project folder. To run it:

```bat
set DOTNET_ROOT=<work>\dotnet
dotnet DsaExport.dll probe  "C:\Games\DragonSword Awakening" <tools-dir>
dotnet DsaExport.dll export "C:\Games\DragonSword Awakening" <tools-dir> <out-dir> [/Game/prefix]
dotnet DsaExport.dll inspect "C:\Games\DragonSword Awakening" <tools-dir> DS/Content/<path>.uasset
```

`<tools-dir>` holds the Oodle, zlib-ng and Detex DLLs and the `.usmap`. `probe` checks mounting and mappings, `inspect` dumps a texture's mips, and a prefix limits the export to one folder.

### Steps as run

1. Inspected the install: 50 `.pak` files, no IoStore. No .NET SDK was present.
2. Looked up the AES key and the game's CUE4Parse profile.
3. Installed the .NET 10 SDK into a work folder, cloned CUE4Parse, and confirmed it supports the game.
4. Wrote DsaExport.
5. Probe: all 50 paks mounted (328,178 files, 133,412 `.uasset`); 6,093 packages matched. Loading `Icon_Item_Common_Gold` failed with "Package has unversioned properties but mapping file is missing".
6. Added the Nexus `.usmap`. `Icon_Item_Common_Gold` then loaded as 256×256 PF_DXT5 and decoded.
7. Test run on `/Game/Art/UI/InGame/Icon_Item/Common`: 265 of 265 PNGs. Gold and three EXP-item icons checked on dark, light and checkerboard backgrounds for colour and alpha.
8. Full export, first pass: four BC7 textures failed ("Detex decompression failed: not initialized"). Fixed by unpacking and initialising Detex at start-up.
9. Second pass: atlas sprites cut out blank, because only the first page of each atlas was written. Fixed by keying textures by their full object path and writing one PNG per page.
10. Third pass, the one used: 6,093 packages, 3,678 PNGs (688.7 MB; PF_DXT5 2,067, PF_B8G8R8A8 1,401, PF_DXT1 206, PF_BC7 4), 2,236 sprites on 123 atlas pages, one failure, about 20 seconds. Every sprite's atlas page was exported; the Mercenaries grade icons and the map icon cut out correctly.

The game was only read: nothing under the install folder was created or changed, and the game was not started.

### What the export holds

By folder under `/Game/Art/UI/InGame/`: Common 860, Icon_Item 613, 03_System 574, Icon_Skill 319, Img_Item 301, Btn 222, Img_Character 195, Frame 172, Img_Guide 111, Mask 93, Img_Summon 60, Icon_Character 53, Img_Vehicle 34, BackGround 28, Img_Monster 10, StillCut 9, 02_Main 4. Eighteen more come from outside `/Game/Art/UI` (engine and editor icons, which can be ignored).

Not used yet but useful for the UI: hero busts and key art (`Img_Character/Mini`, `Key`, `keyHalf`), the Mercenary Crew grade emblems and other menu sprites in the atlases (`03_System`).

### Textures the game does not ship

A second run the same day searched for the 17 textures the game's tables name but the export lacked, plus an icon for familiar 1320033. None exists in this build, so the export is complete:
- All 50 paks mounted and decrypted; an exact, case-insensitive search of all 328,178 mounted paths (any extension, any root, `/Engine` and plugin content included) found none of the names.
- The game's cook manifest, `DS/AssetRegistry.bin` (pakchunk9), lists none of them, while existing near-misses such as `Img_Item_Costume_Cassius_Unique_01` and `Img_Character_Mini_Viola` are found in it.
- The only other `.pak` under the install is the crash reporter's, with no game content. `DeluxePack` holds an artbook PDF and soundtrack MP3s. There is no Steam copy of the game.

| Named by the tables                                                                                                                            | What the game has instead                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12 costume icons, `Icon_Item/Costume/Icon_Item_Costume_*` (Astria, Cassius, Cerese `_02`, Eileen and Reina Epic, Othello, Reina Unique weapon) | the same name as a tall card in `Img_Item/Costume` or `Costume_Weapon`, which `CostumeData.CosImgPath` uses. Only 9 textures exist in `Icon_Item/Costume/` |
| `Img_Item_Costume_Kalien_Unique_Weapon_01` (item 9990023)                                                                                      | nothing; no Kalien costume weapon art exists, and `CostumeData` names none                                                                                 |
| `Icon_Character_Viola`                                                                                                                         | only `Img_Character_Mini_Viola`; Viola ships as a full character (model, voice, effects) without other UI art                                              |
| `Icon_Character_Kalien_GreatSpirit` (hero row 1037)                                                                                            | `Icon_Character_Kalien_Unique_01`, the costume's `CostumeData.SwitchIconChrPath`                                                                           |
| `Icon_Character_Othello_Bard` (1511)                                                                                                           | `Icon_Character_Othello_Unique_01`, the same way                                                                                                           |
| `Icon_Character_Onette_PhantomThief` (1070)                                                                                                    | probably `Icon_Character_Onette_Unique_01`, the portrait of Onette's only costume; the row does not point at it directly                                   |
| an icon for familiar 1320033 (Vicious Baby Dragon)                                                                                             | its `VehicleCharacterData` row reuses 1320032's image, `Img_Vehicle_Collection_BraveBabyDragon`; it has no `GameItemData` row                              |

The hero rows 1037, 1070 and 1511 are costume variants, not catalog heroes, so the editor needs none of their portraits yet. Six `Icon_Item_Vehicle_*` and five `Img_Vehicle_Collection_*` images (goats, a magpie, a sky wolf) are named by no table.

The pak layout, as mounted: 50 files, 20,973,032,163 bytes. UI textures are in `pakchunk0_s25` (mount `DS/Content/Art/UI/InGame/`) and `pakchunk0_s26` (root); the XML tables in `pakchunk109` (`DS/Content/__GeneratedGameData__/Server/XML/GameData/`); the asset registry in `pakchunk9`; character art in `pakchunk0_s1`–`s7`; localisation in `pakchunk200`–`202` (en, ja-JP, ko-KR).

### Known issues

- `/Game/Art/UI/InGame/Common/Status_HP_Sprite` is not baked into any atlas, so it has no rectangle; it is the one failure.
- `Teamset_Line_01_Sprite`'s rectangle (4×546) is taller than its 512×256 atlas page, as the game data says. Clamp or skip it when cutting.
- `MiniGM_marmot_01_Sprite` has width 243.99998 from float rounding; round to 244.
- CUE4Parse logged read errors for some UI materials (e.g. `UI_Glow`) and one AI blueprint while loading. They are not textures and affect no exported file.
