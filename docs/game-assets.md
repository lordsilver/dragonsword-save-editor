# Game assets

The editor uses two things taken from DragonSword Awakening's own files: the rule tables (`crates/core/data/growth.json`, see [Game rules](game-rules.md)) and the icons (`apps/desktop/src/assets/sprite.webp`). This page records how the icons were extracted and packed, so the work can be repeated after a game update. The extracted files themselves are not part of this repository; only the packed sprite is, stored with Git LFS.

## What is bundled

`scripts/gen-icons.mjs` takes from the export only what the catalog uses:
- each item's icon, found by the game path the catalog records for it (`iconPath` in `crates/core/data/items.json`, for example `Art/UI/InGame/Icon_Item/Common/Icon_Item_Common_Gold`);
- each hero's square portrait, `Art/UI/InGame/Icon_Character/Icon_Character_<ImageType>`, where `ImageType` comes from the game's `PCCharacterData` table (hero 10007 is `Johnny`; Kalsion's art is named `Cassius`, Ornette's `Onette`).

Where the game ships no such texture (see [Textures the game does not ship](#textures-the-game-does-not-ship)), it uses what the game's own tables use instead:
- a costume item: its `CostumeData` card, `Art/UI/InGame/Img_Item/Costume/` or `Costume_Weapon/Img_Item_Costume_<same name>`, cropped to its top square (the cards are 322×862);
- a hero without a portrait (Viola): the hero's `Img_Character/Mini/Img_Character_Mini_<ImageType>` bust, cropped the same way;
- a familiar without an item icon (1320033): the icon of the familiar whose `VehicleCharacterData.IconName` is the same image (1320032).

It scales everything to 128-pixel cells, packs them into one WebP sheet, and writes each item's cell offset and `iconSize` back into `items.json`. Cell 0 stays empty: an item at offset 0,0 has no icon. The 2026-10-27 run packed 577 images for 1,258 of the 1,259 catalog items (with the additions below); the one left is Kalien's "Great Spirit's Vestment Weapon" costume (9990023), for which the game has no art at all.

```bash
node scripts/gen-icons.mjs <assets-dir> <extract-dir>
```

`<assets-dir>` is the export below, unzipped. `<extract-dir>` is the folder of XML tables used by `scripts/gen-growth.mjs`; only `PCCharacterData.xml` and `VehicleCharacterData.xml` are read. The script is deterministic for a given export. `apps/desktop/test/icons.test.ts` checks that the frontend's cell size matches `iconSize`.

## Items, titles and skills from the game tables

`crates/core/data/items.json` stops at 16 of the game's 24 costumes and misses one title. `scripts/gen-catalog-extras.mjs <extract-dir>` adds every `GameItemData` row that `items.json` lacks to `items_extra.json`, named in English and French from `StringData`, and rebuilds `titles.json` whole from `AccountTitleData`: all 109 titles with their colour and every stat bonus (a `*_Per` value is a fraction, 0.023 is +2.3%; the earlier file had dropped them, so 44 titles showed none). On 2026-10-27 that added costumes 9990032–9990039 and title 2103020, and took ten title names from the game's current strings (for example "Veteran Mercenary Crew", as the game's menus say). A new item type stops the script until its catalog category is chosen.

The same script writes `crates/core/data/skills.json` from `PCSkillGrowthData`: each of the 26 heroes' nine skill slots as the game's Skill screen lays them out. `type` is the save's `tb_skill_growth.TYPE_VALUE`, and `order` is the game's `SlotOrder`: 1–4 the left column (attack 6, jump attack 5, Dodge 8, roll attack 7), 5–8 the right column (actives 1 and 2, signals 3 and 4) and 9 the master skill (801). Names and descriptions come from `StringData` with the colour tags removed. The damage percentages the game shows under a description are not included: they come from `PCComboLevelData` through each skill's data asset, which the tables do not link. Each icon is a texture or a Paper2D sprite under `Icon_Skill`; the export has every sprite's texture as a PNG without the `_Sprite` suffix, so `gen-icons.mjs` packs it like an item icon (118 distinct icons) and writes the offsets back into `skills.json`.

A skill's effect, which the game shows as a tinted disc and a corner badge, is the `IconColor` of its first combo step. `PCCharacterData.ComboTableID` names the hero's rows in `PCComboData`, and their `GroupIndex` is the skill's `TYPE_VALUE`. `ATTACK` is a plain skill; the others are `AIR`, `BLEED`, `DOWN`, `FIRE`, `HEAL`, `ICE`, `POISON`, `SHOCK` and `STUN`. The names come from the Skill screen's own strings, 800037–800044 and 800051 (Stun, Airborne, Knockdown, Bleed, Shock, Burn, Poison, Frost, Recovery), which no table links, so the script maps them by hand. The badge is `Common/State/State_Mark_<state>`, with `BLEEDING` for `BLEED`. The disc tint is not a texture in the export (the game tints it in a material), so `gen-icons.mjs` records each badge's colour, the average of its opaque pixels, in `skills.json`. Like the game, the editor blends that colour into the grey metal disc, dark in the middle and glowing at the rim, rather than painting the colour itself, which keeps the white glyphs readable. (`PCSkillGrowthData.SkillIconColor` looks related but disagrees with the game's screen, for example STUN on Theresia's Judgment Spiral, so it is ignored.)

Run it before `gen-icons.mjs`, which gives the new items and the skills their icons:

```bash
node scripts/gen-catalog-extras.mjs <extract-dir>
node scripts/gen-icons.mjs <assets-dir> <extract-dir>
```

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
