# Missing textures: search report

Date: 2026-10-27. Game: DragonSword Awakening at `C:\Games\DragonSword Awakening` (probably v1.1.1, not confirmed).
Tools: DsaExport (CUE4Parse `df14b99`, profile `GAME_DragonSwordAwakening`, public AES key, Nexus mod 88 `.usmap`),
the same setup that produced `dsa-assets.zip`. The game install was only read.

## Result in one paragraph

None of the 18 entries exists as a texture anywhere in the game's archives. All 50 paks mounted and decrypted (none
failed), and an exact, case-insensitive search of all 328,178 mounted paths (any extension, any root, including
`/Engine` and plugin content) found none of the 17 names. The game's cook manifest `DS/AssetRegistry.bin` doesn't
contain them either, while the existing near-miss textures do appear in it. So these textures were never cooked into
this build; it isn't an extraction gap. There are no other game paks: the only other `.pak` under the install is the
engine's crash reporter, and there is no Steam/DLC copy of the game. For 16 of the 18 entries, the game's own tables
point to an existing replacement texture (below); those are exported in this zip.

## Per entry

"Item" = `GameItemData` row whose `IconName` names the texture. The game's `CostumeData` table, which the costume UI
reads, references the `Img_Item_Costume_*` sprite of the same name in every case except Kalien's weapon. All existing
textures listed are in `pakchunk0_s25-WindowsClient.pak`, except where another pak is named.

| #   | Missing texture (as named by the tables)                                                              | Status                                                                                           | Closest existing texture (exported here)                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Icon_Item/Costume/Icon_Item_Costume_Astria_Unique_Weapon_01` (items 9990028, 9990029)                | not in any pak                                                                                   | `Img_Item/Costume_Weapon/Img_Item_Costume_Astria_Unique_Weapon_01` (same name, `Img_` prefix, `Img_Item/Costume_Weapon` folder; 322x862)                                                                                                                                                                                                                                                                                                                                                                          |
| 2   | `Icon_Item_Costume_Cassius_Unique_01` (9990026)                                                       | not in any pak                                                                                   | `Img_Item/Costume/Img_Item_Costume_Cassius_Unique_01`                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 3   | `Icon_Item_Costume_Cassius_Unique_Weapon_01` (9990027)                                                | not in any pak                                                                                   | `Img_Item/Costume_Weapon/Img_Item_Costume_Cassius_Unique_Weapon_01`                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 4   | `Icon_Item_Costume_Cerese_Unique_02` (9990032)                                                        | not in any pak                                                                                   | `Img_Item/Costume/Img_Item_Costume_Cerese_Unique_02`                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 5   | `Icon_Item_Costume_Cerese_Unique_Weapon_02` (9990033)                                                 | not in any pak                                                                                   | `Img_Item/Costume_Weapon/Img_Item_Costume_Cerese_Unique_Weapon_02`. (An `Icon_Item_Costume_Cerese_Unique_Weapon_01` exists, but it's the `_01` set and already in `dsa-assets.zip`.)                                                                                                                                                                                                                                                                                                                              |
| 6   | `Icon_Item_Costume_Eileen_Epic_01` (9990034)                                                          | not in any pak                                                                                   | `Img_Item/Costume/Img_Item_Costume_Eileen_Epic_01`                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 7   | `Icon_Item_Costume_Eileen_Epic_Weapon_01` (9990035)                                                   | not in any pak                                                                                   | `Img_Item/Costume_Weapon/Img_Item_Costume_Eileen_Epic_Weapon_01`                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 8   | `Icon_Item_Costume_Othello_Unique_01` (9990038)                                                       | not in any pak                                                                                   | `Img_Item/Costume/Img_Item_Costume_Othello_Unique_01`                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 9   | `Icon_Item_Costume_Othello_Unique_Weapon_01` (9990039)                                                | not in any pak                                                                                   | `Img_Item/Costume_Weapon/Img_Item_Costume_Othello_Unique_Weapon_01`                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 10  | `Icon_Item_Costume_Reina_Epic_01` (9990036)                                                           | not in any pak                                                                                   | `Img_Item/Costume/Img_Item_Costume_Reina_Epic_01`                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 11  | `Icon_Item_Costume_Reina_Epic_Weapon_01` (9990037)                                                    | not in any pak                                                                                   | `Img_Item/Costume_Weapon/Img_Item_Costume_Reina_Epic_Weapon_01`                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 12  | `Icon_Item_Costume_Reina_Unique_Weapon_01` (items 9990030, 9990031)                                   | not in any pak                                                                                   | `Img_Item/Costume_Weapon/Img_Item_Costume_Reina_Unique_Weapon_01`                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 13  | `Icon_Item/Costume/Img_Item_Costume_Kalien_Unique_Weapon_01` (9990023, 대정령의 예복 무기)            | not in any pak; no Kalien costume weapon art exists at all, and `CostumeData` names none         | similar only: `Icon_Item/Costume/Icon_Item_Costume_Kalien_Unique_01` (256x256, the costume body icon) and `Img_Item/Costume/Img_Item_Costume_Kalien_Unique_01`                                                                                                                                                                                                                                                                                                                                                    |
| 14  | `Icon_Character/Icon_Character_Viola` (`PCCharacterData` ImageType `Viola`: IDs 10035, 1060, 2000024) | not in any pak                                                                                   | similar only: `Img_Character/Mini/Img_Character_Mini_Viola` (424x358). Viola ships as a full character (model, about 900 animations, voice, FX, cinematics, costume data), but her only UI art in this build is this mini image and the flying-squirrel familiar's images: no `Icon_Character`, skill icons, key art or summon banners.                                                                                                                                                                           |
| 15  | `Icon_Character_Kalien_GreatSpirit` (ID 1037, "Kalien (hero-request costume)")                        | not in any pak; `GreatSpirit` appears nowhere in the paks or the asset registry                  | `Icon_Character/Icon_Character_Kalien_Unique_01`. ID 1037's `DefaultCostumeID` is 999918, whose `CostumeData.SwitchIconChrPath` is `Icon_Character_Kalien_Unique_01_Sprite`, so this is the game's own image for that costume. Also exported: `Icon_Character_Kalien`.                                                                                                                                                                                                                                            |
| 16  | `Icon_Character_Onette_PhantomThief` (ID 1070, "Onette (team-substitute only / phantom-thief skin)")  | not in any pak; `PhantomThief` appears nowhere in the paks or the asset registry                 | `Icon_Character/Icon_Character_Onette_Unique_01`: the portrait of Onette's only costume (`CostumeData` 100201/100202). ID 1070 itself points at 10008 (Onette's default look), so this match is an inference. Also exported: `Icon_Character_Onette`.                                                                                                                                                                                                                                                             |
| 17  | `Icon_Character_Othello_Bard` (ID 1511, "Othello bard costume")                                       | not in any pak (the bard costume's 3D mesh, materials and animations exist; its UI icon doesn't) | `Icon_Character/Icon_Character_Othello_Unique_01`. ID 1511's `DefaultCostumeID` is 101201 (`DLCAppID` 5245440), whose `SwitchIconChrPath` is `Icon_Character_Othello_Unique_01_Sprite`. Also exported: `Icon_Character_Othello`.                                                                                                                                                                                                                                                                                  |
| 18  | Familiar 1320033 흉악한 새끼 용 ("vicious baby dragon")                                               | no icon of its own                                                                               | Its `VehicleCharacterData.IconName` is `Img_Vehicle/Collection/Img_Vehicle_Collection_BraveBabyDragon` (in `pakchunk0_s26`), the same image as 1320032 용맹한 새끼 용 ("brave baby dragon"). That's why 30 familiars have only 29 distinct images. Exported: `Img_Vehicle_Collection_BraveBabyDragon` (512x512), `Icon_Item_Vehicle_BraveBabyDragon`, and the 3D colour maps `vc_Vicious_Baby_Dragon_col` (`pakchunk0_s8`) and `pet_Vicious_Baby_Dragon_col` (`pakchunk0_s5`), both 2048x2048 UV maps, not icons. |

Other notes on 1320033: `VehicleAcquireData` memo "프리미엄 스팀 패키지로 판매" ("sold as a premium Steam package"),
`IsIncludePak=true`, empty `DLCAppID`, 11 `VehicleComboData` rows (shared vehicle-skill sprites). There is no
`GameItemData` row for 1320033.

### Vehicle images not referenced by any table

From the 35 `Icon_Item/Vehicle` and 34 `Img_Vehicle/Collection` textures, these are named in none of the 505 extracted
GameData tables. None is a dragon, so none is a missing 1320033 icon. All are exported here:
- `Icon_Item_Vehicle_`: CliffGoat, CloudGoat, GentleMagpie, RavineGoat, SkyWolf, ValleyGoat
- `Img_Vehicle_Collection_`: CliffGoat, CloudGoat, GentleMagpie, RavineGoat, ValleyGoat

## Pattern worth recording in docs/game-assets.md

- Costume items: `GameItemData.IconName` points at `Icon_Item/Costume/Icon_Item_Costume_<Hero>_<Grade>_..` textures
  that were mostly never made (only 9 textures exist in that folder: Cerese/Dana/Kalien/Theresia icons and two Onette
  `Img_` files). The art that ships is the tall `Img_Item/Costume[_Weapon]/Img_Item_Costume_*` card (322x862), which
  is what `CostumeData.CosImgPath` uses.
- Hero-request / team-substitute characters (`PCCharacterData` rows with `ImageType` such as `Kalien_GreatSpirit`,
  `Othello_Bard`): the portrait to use is the costume's `CostumeData.SwitchIconChrPath`, not
  `Icon_Character_<ImageType>`.
- Viola is in the game data and has 3D, voice and FX assets, but no portrait or other UI art except
  `Img_Character_Mini_Viola`.

## What was searched (exact)

1. **Mount status.** `DsaExport list` (CUE4Parse `MountedVfs` / `UnloadedVfs`): 50 mounted, all encrypted and
   decrypted with the key, **0 unloaded**, 328,178 entries. Output in `evidence/mount-status.txt`; every path with
   its pak is in `evidence/all-files.tsv`.
2. **Exact names**, over every path in `all-files.tsv` (PowerShell `-match`, which is case-insensitive, with the name
   regex-escaped): each of the 17 texture names above. **0 hits for each.**
3. **Parts of names**, same method (hit counts and the first `.uasset`/`.umap` hits are in `evidence/partial-search.txt`):
   `Astria_Unique`, `Cassius_Unique`, `Cerese_Unique`, `Eileen_Epic`, `Othello_Unique`, `Reina_Epic`, `Reina_Unique`,
   `Kalien_Unique`, `Costume_Astria`, `Costume_Cassius`, `Costume_Cerese`, `Costume_Eileen`, `Costume_Othello`,
   `Costume_Reina`, `Costume_Kalien`, `Viola`, `GreatSpirit`, `Great_Spirit`, `PhantomThief`, `Phantom`, `Onette`,
   `Othello_Bard`, `Bard`. Then, restricted to `/Art/UI/` `.uasset` files: every file in `Icon_Item/Costume/`, and every
   UI file matching `Viola`, `Kalien`, `Onette`, `Othello`, `Costume_Weapon/.*Kalien`, `ViciousBabyDragon`, `Vicious`
   and `BabyDragon`.
4. **Asset registry.** `DsaExport raw DS/AssetRegistry.bin` (52,901,067 bytes, pakchunk9) searched as text for the
   17 names plus `GreatSpirit` and `PhantomThief`: **0 hits each**. The controls `Img_Item_Costume_Cassius_Unique_01`
   (6 hits), `Icon_Item_Costume_Cerese_Unique_01` (2) and `Img_Character_Mini_Viola` (6) were found.
5. **Tables.** The 505 extracted GameData XMLs and `dsgamedb_sqlite.sql` were searched for `1320033`, for each missing
   name and for `GreatSpirit`, `PhantomThief` and `Othello_Bard`. Rows found: `GameItemData`, `PCCharacterData`,
   `NPCCharacterData`, `CostumeData`, `VehicleCharacterData`, `VehicleAcquireData`, `VehicleComboData`, as cited above.
6. **Paks and chunks outside `DS\Content\Paks`.** Every `*.pak`, `*.utoc`, `*.ucas`, `*.sig`, `*.chunk` and `*.patch`
   anywhere under `C:\Games\DragonSword Awakening`: only the 50 game paks, plus
   `Engine\Programs\CrashReportClient\Content\Paks\CrashReportClient.pak` (21,698,164 bytes). That one doesn't mount
   with the game profile or as plain `GAME_UE5_3` (CUE4Parse reads 0 entries), so its raw bytes were scanned
   instead: 0 occurrences of `Costume`, `Icon_Character`, `Viola`, `GreatSpirit`, `PhantomThief`, `Othello`,
   `Vehicle`, `/Game/` or `DS/Content`, so it holds no game content. The other top-level folders are `DeluxePack`
   (an artbook PDF and soundtrack MP3s only), `DS` and `Engine`.
   Steam: the only library is `C:\Program Files (x86)\Steam`, and none of its app manifests is DragonSword Awakening.

## Pak files (`C:\Games\DragonSword Awakening\DS\Content\Paks`)

50 files, 20,973,032,163 bytes, 328,178 entries, all mounted and decrypted.

| Pak                             |         Bytes | Entries | Mount point                                                                                | Encrypted |
| ------------------------------- | ------------: | ------: | ------------------------------------------------------------------------------------------ | --------- |
| pakchunk0_s1-WindowsClient.pak  |   668,319,241 |   1,588 | `DS/Content/Art/Character/`                                                                | yes       |
| pakchunk0_s2-WindowsClient.pak  |   735,668,854 |   1,676 | `DS/Content/Art/Character/Monster/`                                                        | yes       |
| pakchunk0_s3-WindowsClient.pak  |   671,335,699 |   1,583 | `DS/Content/Art/Character/`                                                                | yes       |
| pakchunk0_s4-WindowsClient.pak  |   571,413,384 |   1,923 | `DS/Content/Art/Character/NPC/`                                                            | yes       |
| pakchunk0_s5-WindowsClient.pak  |   574,244,321 |   1,755 | `DS/Content/Art/Character/`                                                                | yes       |
| pakchunk0_s6-WindowsClient.pak  |   608,852,266 |   1,403 | `DS/Content/Art/Character/Player/`                                                         | yes       |
| pakchunk0_s7-WindowsClient.pak  |   636,451,119 |   1,745 | `DS/Content/Art/Character/`                                                                | yes       |
| pakchunk0_s8-WindowsClient.pak  |   572,620,933 |   7,355 | `DS/Content/Art/`                                                                          | yes       |
| pakchunk0_s9-WindowsClient.pak  |   650,083,008 |   7,428 | `DS/Content/Art/`                                                                          | yes       |
| pakchunk0_s10-WindowsClient.pak |   719,092,925 |   3,182 | `DS/Content/Art/Environment_Art/Asset/com/`                                                | yes       |
| pakchunk0_s11-WindowsClient.pak |   682,592,662 |   5,529 | `DS/Content/Art/Environment_Art/Asset/com/`                                                | yes       |
| pakchunk0_s12-WindowsClient.pak |   583,795,284 |   2,648 | `DS/Content/Art/Environment_Art/Asset/`                                                    | yes       |
| pakchunk0_s13-WindowsClient.pak |   646,772,905 |   2,934 | `DS/Content/Art/Environment_Art/Asset/`                                                    | yes       |
| pakchunk0_s14-WindowsClient.pak |   595,352,360 |   2,160 | `DS/Content/Art/Environment_Art/Asset/`                                                    | yes       |
| pakchunk0_s15-WindowsClient.pak |   528,793,784 |   2,136 | `DS/Content/Art/Environment_Art/Asset/w01/`                                                | yes       |
| pakchunk0_s16-WindowsClient.pak |   598,607,793 |   2,507 | `DS/Content/Art/Environment_Art/Asset/w01/`                                                | yes       |
| pakchunk0_s17-WindowsClient.pak |   388,027,274 |   4,211 | `DS/Content/Art/Environment_Art/`                                                          | yes       |
| pakchunk0_s18-WindowsClient.pak |   272,477,107 |   4,921 | `DS/Content/Art/Environment_Art/Maps/`                                                     | yes       |
| pakchunk0_s19-WindowsClient.pak |   461,298,146 |   2,302 | `DS/Content/Art/Environment_Art/Maps/World/world_01_Main_WP/`                              | yes       |
| pakchunk0_s20-WindowsClient.pak |   394,290,368 |   3,790 | `DS/Content/Art/Environment_Art/Maps/World/world_01_Main_WP/world_01_main_WP/_Generated_/` | yes       |
| pakchunk0_s21-WindowsClient.pak |   416,524,906 |   3,421 | `DS/Content/Art/Environment_Art/Maps/World/world_01_Main_WP/world_01_main_WP/_Generated_/` | yes       |
| pakchunk0_s22-WindowsClient.pak |   336,624,574 |  13,237 | `DS/Content/Art/`                                                                          | yes       |
| pakchunk0_s23-WindowsClient.pak |   391,155,361 |   9,989 | `DS/Content/Art/`                                                                          | yes       |
| pakchunk0_s24-WindowsClient.pak |   313,881,783 |   3,105 | `DS/Content/Art/`                                                                          | yes       |
| pakchunk0_s25-WindowsClient.pak |   391,136,598 |   9,334 | `DS/Content/Art/UI/InGame/`                                                                | yes       |
| pakchunk0_s26-WindowsClient.pak | 1,311,431,702 |   9,981 | (root)                                                                                     | yes       |
| pakchunk0-WindowsClient.pak     |   888,969,435 |  49,968 | (root)                                                                                     | yes       |
| pakchunk1-WindowsClient.pak     |     7,235,131 |      24 | `DS/Content/`                                                                              | yes       |
| pakchunk2-WindowsClient.pak     |         3,127 |       6 | `DS/Content/DataLayers/`                                                                   | yes       |
| pakchunk3-WindowsClient.pak     |   140,971,196 |  51,645 | `DS/`                                                                                      | yes       |
| pakchunk4-WindowsClient.pak     |         5,517 |       8 | `DS/Content/FoliageTypes/`                                                                 | yes       |
| pakchunk5-WindowsClient.pak     |         1,351 |       2 | `DS/Content/ImpostorBaker/`                                                                | yes       |
| pakchunk6-WindowsClient.pak     |   192,589,255 |  10,601 | (root)                                                                                     | yes       |
| pakchunk7-WindowsClient.pak     |        20,226 |      36 | `DS/Content/Movies/`                                                                       | yes       |
| pakchunk8_s1-WindowsClient.pak  |   170,773,784 |  13,693 | `DS/Content/Sound/Voice/Quest_Voice/`                                                      | yes       |
| pakchunk8-WindowsClient.pak     | 1,081,655,676 |  51,947 | `DS/Content/Sound/`                                                                        | yes       |
| pakchunk9-WindowsClient.pak     |     7,408,587 |   1,148 | `DS/`                                                                                      | yes       |
| pakchunk100-WindowsClient.pak   |   322,380,953 |      13 | `DS/Content/Movies/UI/`                                                                    | yes       |
| pakchunk101-WindowsClient.pak   |   311,915,574 |      29 | `DS/Content/Movies/UI/`                                                                    | yes       |
| pakchunk102-WindowsClient.pak   | 1,263,178,571 |       9 | `DS/Content/Movies/2d_cutscene/`                                                           | yes       |
| pakchunk103-WindowsClient.pak   |   677,546,958 |       6 | `DS/Content/Movies/2d_cutscene/`                                                           | yes       |
| pakchunk104-WindowsClient.pak   |   403,350,476 |       8 | `DS/Content/Movies/3d_cutscene/world01/`                                                   | yes       |
| pakchunk105-WindowsClient.pak   |   222,878,994 |       8 | `DS/Content/Movies/3d_cutscene/world01/`                                                   | yes       |
| pakchunk106-WindowsClient.pak   |    84,489,402 |       7 | `DS/Content/Movies/3d_cutscene/PC/world01_PC/`                                             | yes       |
| pakchunk107-WindowsClient.pak   |    26,068,615 |       7 | `DS/Content/Movies/3d_cutscene/PC/world01_PC/`                                             | yes       |
| pakchunk108-WindowsClient.pak   |    46,577,907 |     357 | `DS/Content/Design/GameData/`                                                              | yes       |
| pakchunk109-WindowsClient.pak   |    24,551,970 |     342 | `DS/Content/__GeneratedGameData__/Server/XML/GameData/`                                    | yes       |
| pakchunk200-WindowsClient.pak   |   126,363,451 |  12,158 | `DS/Content/L10N/en/`                                                                      | yes       |
| pakchunk201-WindowsClient.pak   |   127,349,133 |  12,158 | `DS/Content/L10N/ja-JP/`                                                                   | yes       |
| pakchunk202-WindowsClient.pak   |   125,902,517 |  12,155 | `DS/Content/L10N/ko-KR/`                                                                   | yes       |

## Files in this zip

- `Art/...`: 36 PNGs, same layout as `dsa-assets.zip` (`/Game/X` -> `X.png`). All except the two
  `ViciousBabyDragon` colour maps were already in `dsa-assets.zip`; they're repeated here so the near-misses sit together.
- `manifest.csv`: game_asset_path, png_path, width, height, pixel_format.
- `failures.csv`: empty (0 failures).
- `evidence/`: `mount-status.txt`, `all-files.tsv` (every mounted path with its pak), `partial-search.txt`,
  `export-list.txt` (the packages exported).
