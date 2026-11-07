# DragonSword world map: what the game files say

Answers to `handoff-world-map.md` (2026-11-07). Everything was read from the game's paks in
`C:\Games\DragonSword Awakening` with DsaExport (CUE4Parse, UE 5.3 profile), plus the 2026-10-30
XML tables and the three in-game screenshots from the editor's chat. The game install and the
save were not modified, and the game was not started.

Each answer says where it comes from: **read** means it is stored in a game file (named), and
**measured** means it is fitted against a screenshot. The coordinate maths in `DLayerMap` is native
C++ (`/Script/DSClient`), so no formula is stored as a Blueprint. Every number below is either a
stored value or a fit that reproduces the screenshots.

Folder guide:

| Folder                 | Contents                                                                                                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dump/`                | Every asset below as JSON with all properties (DsaExport `dump`)                                                                                                                             |
| `textures/`            | Textures as PNG: fog masks, fog material textures, the `World` atlas pages, marker art                                                                                                       |
| `shaders/`             | The fog and mask materials' compiled shaders: `.bin`, `.dxbc`/`.dxil` and disassembly (`.asm`). Also `fog-main.preshader.txt` (every material constant and its value) and `shader-index.txt` |
| `data/fog-regions.csv` | The 12 fog masks: which windmill opens each one, its centre and its size                                                                                                                     |
| `belos/`               | Belos' capture stitched with Orbis' rule (3072 px)                                                                                                                                           |
| `checks/`              | Screenshots, the fog fit overlay, the line-texture overlay and contact sheets                                                                                                                |
| `scripts/`             | The scripts that produced the fits and decodes                                                                                                                                               |

---

## 1. World to map transform

**Answer (read):** the widget does not use the capture's `JSONString`. It uses the
`DWorldMapData` asset of the world (`WorldMapDataInfo`). For Orbis that is
`DS/Content/Design/CaptureMinimap/Data/WorldMapData_100` (and `_1`, which is identical apart from
minimap zoom):

| Property                                                                                                | Orbis (100)               | Belos (200)                 |
| ------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------- |
| `MapTexturePath`                                                                                        | `RTM_W1_world_01_main_WP` | `RTM_W2_1_world_02_main_wp` |
| `MapTextureCount`                                                                                       | 4 (a 4×4 grid)            | 4                           |
| `MapDimensions` (side of the square, world units)                                                       | **570,000**               | **1,100,000**               |
| `MapDimensionsCenterX`, `CenterY`                                                                       | **144,010**, **86,150**   | **−43,730**, **25,690**     |
| `WorldMapUISize` (side of the map widget, UI units)                                                     | 3000                      | 3000                        |
| `WorldMapBaseZoom`, `WorldMapZoomValuePerLevel`, `WorldMapZoomMaxLevel`                                 | 1.2, 0.3, 5               | same                        |
| `WorldMapHideWayPoint`, `HideNPC`, `HideAreaName`, `HideChapterName`, `HideWorldMemo` (zoom thresholds) | 2, 4, 1, 1, 2.5           | same                        |

The other 13 `WorldMapData_1xx` assets cover the dungeon maps (all their properties are in `dump/`).

```
across = (X − (CenterX − D/2)) / D        down = (Y − (CenterY − D/2)) / D        D = MapDimensions
```

For Orbis that is a square with its corner at (−140,990, −198,850) and a side of 570,000. Your
fitted square was (−139,900, −197,400) with a side of 567,900. The two differ by 0.4% in size and
by 1,000 to 1,500 world units at the corners, which is a few pixels on the 4096-px image. Same
orientation: +X across, +Y down, nothing mirrored.

How the map is drawn (`DS/Content/UI/Layer/DLayerMap`, read): `MapGrid` is a UniformGridPanel of
64 images `Map_<a>_<b>` (8×8; `MapTextureCount` 4 uses a 4×4 block). Each image fills its cell, and
the grid fills the 3000-unit map square. The `Fog` image is exactly 3000×3000 (`ImageSize`). So
the capture textures and the fog share one square, and that square is `MapDimensions` around the
centre.

Checks:
- Orbis, stitched with the editor's existing rule (texture `<a>_<b>` at row a, column b, each
  flipped top to bottom, then the whole image flipped top to bottom). Points on land under each
  square:
  - `WorldMapData_100`: chests 1,363/1,499, warps 46/46, dungeons 24/26.
  - Your fit: 1,361/1,499, 46/46, 26/26.
  - The `JSONString` square: 1,043/1,407, 30/45, 18/25.
    `WorldMapData` puts 1,499 of 1,506 chests inside the image. The "chests beyond the capture" came
    from the `JSONString` square.
- The fog's line texture `FX_WorldMap_Line` (below) is sampled at the same UV as the map. Laid
  unflipped over the stitched Orbis, it sits on the capture's coastline: brightness on the coast is
  4.4× the texture's average. The next-best orientation gives 1.9×. See `checks/line-over-orbis.png`.
  This confirms the tile layout from an independent source.
- In your zoomed-out screenshot, the three lit windmills fit screen = 0.00493 × world + offset in
  both axes (X right, Y down). The dungeons land within 3 px of their icons.

Why the `JSONString` disagrees: it is the record written by the capture tool. For Orbis its
square (−165,990, −151,100, side 460,000) is not the one the widget stretches the textures over.
Nothing in the widget reads it. The capture margin (`sz`/`ez`) is irrelevant to the map.

## 2. Map and fog

All read from `DLayerMap`, the `Design/CaptureMinimap/Fog/` folder, the materials' compiled
shaders and `WayPointData.xml`. The mask size is measured.

**Layers, bottom to top, inside `MapOverlay`** (draw order read from the overlay's slot list):
1. `Black`: a black fill.
2. `MapGrid`: the capture.
3. `FogUnderPanel`: empty in the asset, filled at runtime.
4. `FogPanel`, which draws two things in order:
   - `Fog`: a 3000×3000 image with material `FogOfWarMain_Instance` (translucent, unlit).
   - `FogMask`: a RetainerBox with effect material `FogOfWarMask_Inst` (additive, unlit) and
     texture parameter `Target`. Inside it, `CanvasPanel_52` holds `BG` (a black image) and seven
     Niagara sparkle emitters, `FogStar*` (`Art/FX/UI/WorldMap/FX_UI_world_ptc01–03`), at fixed
     offsets.
5. `FogAbovePanel`: empty in the asset.
6. Markers and the player go in `MapOverlayOutSide`, above all of this.

A region's opening plays `Anim_FogOpen` (on `Fog`, `FX_Circle` and Niagara `FX_UI_world_Open01`),
with the sound `UI_FogOpen_01_Cue`.

**The fog is per windmill, not per region table row.** The 12 masks are
`Design/CaptureMinimap/Fog/Fog_1`–`Fog_12`. Each is white RGB with the shape in alpha; `Fog_1` is
128 px and the others are 256 px (`textures/fog/`, and the sheet `checks/fog-alpha-sheet.png`). Which
mask a place opens, and where, is stored in **`WayPointData.xml`** on the 12 Eona's Legacy rows:
`FogImg` (the texture), `XRevisionPosition`/`YRevisionPosition` (the mask's centre in world
units) and `Scale` (1 for all). `WorldCompleteGroupData.FogSectionName` is only the region's name
string. All 12 rows are in `data/fog-regions.csv`. `Fog_1` belongs to the Orbis statue legacy
(waypoint 100000, switch 326); the other 11 belong to one region's windmill each.

**Mask size (measured):** about **1,150 world units per mask pixel**, unrotated and unflipped
(+u = +X, +v = +Y), centred on (`XRevisionPosition`, `YRevisionPosition`). A 256-px mask spans
about 294,000 units, which is about 1,550 of the map's 3000 UI units. The fit is the union of
`Fog_1`–`Fog_4` (the four legacies lit in this save) against the fog edge in your zoomed-out
screenshot, at mask alpha 0.5. Its intersection over union is **0.956**, against 0.79 for the best
flipped orientation (`checks/3-fit.png`). The native code that sets this size was not read, so
treat 1,150 as ±1%. It equals 6.05 UI units per mask pixel, so the code may use a factor of 6
(`WorldMapUISize` / 500).

**How a region's state picks the look:** the fog has no per-region states. A place is either
opened (its windmill's switch is set, so its mask is drawn into the reveal) or not, and the reveal
is the union of opened masks. The fog shader reads that reveal through two render targets,
`FogOfWarRenderCurrent` and `FogOfWarRenderPrevious` (128×128, RG8; the base material imports both).
Native code writes them, and the "previous" one is what the opening animation fades from.

**The fog shader** (`FogOfWarMain`, `TSlateMaterialShaderPSDefault`, SM5, 162 instructions;
`shaders/…FogOfWarMain_Instance…03.SF_Pixel.asm`). Its constants are decoded in
`shaders/fog-main.preshader.txt`. Textures: t0 `FX_WorldMap_Line`, t1 `Fog_Tex` = `fxt_noise018A`,
t2 and t3 the two reveal render targets (unnamed samplers, so which is which is not recorded),
t4 `Cloud_Tex` = `fxt_noise020A`, t5 `Target` (defaults to `FogOfWarRenderCurrent`; RG8 has no
alpha, so it reads as 1). Below, uv runs 0–1 over the 3000-unit square and t is game time in
seconds:

```
// drifting fog colour: four samples of fxt_noise018A
s  = t * 0.06                                   // Fog_Speed
S1 = noise(uv*2.0 + s*(-0.25,-0.10)); S2 = noise(uv*1.6 + s*(0.20,-0.02))
S3 = noise(uv*3.0 + s*(-0.12, 0.25)); S4 = noise(uv*3.4 + s*(0.05, 0.12))
n  = S4.r*S3.g + S1.g*S2.r                      // brightness of the fog
m  = S4.b*S3.b + S1.b*S2.b                      // distortion
fog = Fog_Color1 + 7 * n * Fog_Color            // linear (0.0021,0.0069,0.020) + 7n·(0.0034,0.0106,0.0365)
uvd = uv + (m*0.035 − 0.007)                    // Fog_distortion, Fog_distortion_Offset
B = RT_t2(uvd).r      A = RT_t3(uvd).r          // reveal masks, 1 = open
open = 1 except while Anim_FogOpen plays (a swirl of fxt_noise020A in polar coordinates and a
       growing disc of radius InRadius_ANI; full formula in the .asm, lines 1–60)
v  = (A − B)*open + (1 − A − B)                 // with A = B and no animation: 1 − 2B
E  = 1 − v
glowCut = saturate(21 * E^3 − 10)               // Cut_line 3, Edge_Value12 10
edge = (pow(E * f(Cutout), 1.7) * (Edge_Color − glowCut) + glowCut) * pow(A, −0.8) * 0.7
                                                // Edge_Color linear (0.026,0.146,1.0) = #2C6BFF;
                                                // f is a preshader op this decoder doesn't know (0x16)
col = fog * (1 − B) + edge
col += FX_WorldMap_Line(uv).rgb * line_color * min((sin(2π*0.3*t) + 2)/2, 1) * 3
                                                // line_color linear (0.0625,0.424,1.0) = #46AEFF
alpha = saturate(0.6 * (v.x − B² + 1) * Target(uv).a)   // Line_Opa 0.6
```

With one mask (A = B) and no animation: alpha = saturate(0.6·(2 − 2B − B²)). The fog stays
almost opaque until B ≈ 0.3, is half gone at B ≈ 0.45 and is clear at B ≈ 0.6. The blue glow
(`Edge_Color`) sits on the fog side of the edge, where 0 < B < ≈0.45, because of
`pow(A, −0.8)`. That is the coastal glow in the screenshots: it follows the masks' edges, not
the coast.

**The pattern in the dark area** is `FX_WorldMap_Line` (`textures/fog-material/`, 2048 px). It
is a contour drawing of Orbis' coastline plus faint swirls, aligned with the map (check above),
tinted `line_color`, ×3, pulsing between 0.5 and 1 every 3.3 s. The sparkles are the `FogStar`
Niagara systems.

**`FogOfWarMask`** (additive, on the `FogMask` retainer; `shaders/…FogOfWarMask…08.SF_Pixel.asm`):
out = lerp(Target.rgb, C, k) · saturate((1 − Current.r) · Target.a). Target is the retainer's own
render of its children, so this lights up parts not yet in `FogOfWarRenderCurrent` (the opening
flash).

**Open point: the fog's colour.** In your zoomed-out screenshot the open fog measures `#15191F`
to `#171C28` (median `#151921`). The formula with the instance's colours gives `#071427` at
n = 0 and `#141F3C` at n = 0.1, the same darkness but more blue. Something at runtime makes it
greyer, perhaps a dynamic material instance or the screenshot's colour handling, and these files
do not show what. For the editor, I'd use the measured `#151921` as the base and add the line
texture and the edge glow from the formula.

## 3. `Art/UI/InGame/03_System/World/World.Texture2D_0`, `_1`, `_2`

**Read:** `World` is a **PaperSpriteAtlas**. The three textures are its pages (2048 px, DXT5,
clamped, `TEXTUREGROUP_Project01`). They hold all 45 `World_*_Sprite` sprites in that folder; each
sprite's `BakedSourceTexture` and `BakedSourceUV` name the page and the rectangle:

| Page          | Holds                                                                                                                                                                                                                 | Used by                                                                                                                                                                                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Texture2D_0` | the place-info pictures `World_MapInfo_*` (Waypoint, Windmill (782 px wide), Statue, TrialTower, NPCShop, Quest, …; 662×360 each), `World_Frame_02/03/04/06`, `World_Icon_Compass_01`, `World_Icon_WorldMisson_01–06` | `LayerWorldMapInfoPopup` (info pictures; `WayPointData.MapInfoImgName` picks one per place), `DUWG_WorldGroupFog` (Frame_02/03, the region list rows), `DUWG_WorldGroupMisson` (mission icons, Frame_04), `DUWG_WorldMapIconList` (Frame_06), `DPanelWorldMap` (compass) |
| `Texture2D_1` | the dungeon, cave, fortress and field-boss info pictures (15)                                                                                                                                                         | `LayerWorldMapInfoPopup`                                                                                                                                                                                                                                                 |
| `Texture2D_2` | `World_Frame_01`, `World_Frame_05` (the panel frames), `World_MapInfo_Anne`, `_Training`                                                                                                                              | `DPanelWorldMap` (Frame_01/05), the popup                                                                                                                                                                                                                                |

None of them is a map layer. The pages are in `textures/world-atlas/`, and every sprite's rectangle
is in `dump/…/World/*_Sprite.uasset.json`.

## 4. Markers

**Widget (read, `UI/Widget/CustomWidget/DUWG_MapPointIcon`):**
- The icon image (default `Icon_UserMapPin_01`, 90×90) is in an 85×85 `SizeBox`. It is centred
  in `Panel_Icon` (anchor 0.5, alignment 0.5), and `Overlay_Point` is centred on the map point.
- **Anchor:** every icon is drawn centred on its position, none stands on its tip. For warp points
  and statues, native code first moves the position by `WayPointCorrectionDistance` = 1,900 and
  `StatueCorrectionDistance` = 2,700 world units. That puts the pin's tip near the real spot.
  Measured in your screenshots: warp pins sit about 1,700 units north of their point and statues
  1,500–2,400. Dungeons, chests and windmills sit exactly on their point (within 3 px).
- **Size:** `WorldMapPointIconScale` (1.3, 1.3) on the 85-unit box gives 110 UI units on the
  world map (`MiniMapPointIconScale` 1.0 on the minimap). Measured, icons keep the same screen
  size at every zoom: about 50 px tall on a 1125-px-high screenshot, zoomed in and out alike. So
  the editor should not scale them with the map.
- **No outline or shadow** is added by the widget to the icon itself. The selection, quest and
  chest highlights are separate layers: `Frame_Map_01` (an 80-px selection frame), `Tracking01/02`
  rings tinted `#FF6700`/`#FFCF00` for chests, and the Niagara `Fxw_UI_MapPoint01/02`.

**Colours (measured; no tint is stored in any asset).** A search of all 141,139 package headers
for colour property names found none. The tints are set in native code:

| State                                                                          | Colour                                             | Where measured                                                       |
| ------------------------------------------------------------------------------ | -------------------------------------------------- | -------------------------------------------------------------------- |
| Done (activated warp, restored statue, cleared dungeon, …), white glyph tinted | **`#82AFFA`** (130,175,250)                        | 13 icons over both screenshots (warps, statues, dungeons), spread ±4 |
| Not done, white glyph tinted                                                   | **`#99A697`** (153,166,151)                        | 4 icons (dungeons, statues)                                          |
| Lit Eona's Legacy                                                              | **`#91E1FF`** (zoomed out) / `#8BDAFD` (zoomed in) | 4 icons                                                              |

Your `#80aefe` and `#9aa698` are the same within the measurement spread. Measured over the
brightest 15% of each icon's pixels.

The windmill sprites carry their own colour, unlike the other marks: `Icon_Mark_AWindmill` is
grey-green (mean `#808A7F`) and `Icon_Mark_AWindmill_Activate` is blue (mean `#5B9ADC`), while
`Waypoint`, `Godbless`, `Dungeon_*`, `TrialTower` and `Box_png` are white. On screen an unlit
windmill measures `#9AA297`, which suggests the "not done" tint applied to its own sprite. Lit ones
are lighter than the done tint, so the `_Activate` sprite is likely shown untinted or with a light
tint.

**The `?` marker:** a quest mark, not a place state. The blue diamond `?` is
`Common/Mark/Icon_Mark_QuestMark_04`. The quest marks come in pairs, `!` (odd) and `?` (even), per
quest kind; the kinds come from `WorldMapLegendData.xml`:
- 01/02 yellow: adventure requests.
- 03/04 blue: bond requests.
- 05/06 purple: hero requests.
- 07/08 green.
- 09/10 orange: promotion requests.

The yellow `?` in Orbis Castle is `QuestMark_02`. They are drawn on the QUEST layer
(`WorldMapIconLayerData`, priority 80), above windmills (40) and warps (30). They never replace a
place's own icon. `DLayerMap` also has `OverlapPointCheckDistancePC` = 50
(`OverlapPointCheckDistanceMobile` = 65), probably the distance within which overlapping icons are
grouped. Its use is in native code. Contact sheet: `checks/marks-sheet.png`.

**Yellow arrow:** the player, `DUWG_MapPlayerIcon`. It is `Icon_MapArrow_02` (100×108, ×1.18 on
the world map) over `Img_MapRadar_Bg` (164×138, white at 80%), the camera's view cone. The cone
pivots on its bottom centre, its tip at the player.

**Dark circle:** the gamepad's virtual cursor, `DUWG_MapVirtualCursorIcon`: `Frame_Map_02`
(116 px) inside `Frame_Circle_20` (134 px, white at 56%). It stays at the screen centre, which is
where it is in your zoomed-in screenshot (1000, 563 of 2000×1125). The footer's "A Select / R Zoom"
prompts show the gamepad was in use. A mouse player would not see it.

## 5. Belos (world 200)

**Read:** `WorldMapData_200`: `RTM_W2_1_world_02_main_wp`, `MapTextureCount` 4,
`MapDimensions` 1,100,000, centre (−43,730, 25,690). The same transform as question 1:
corner (−593,730, −524,310).

**Layout (worked out):** the 16 uneven textures are one 3,072-px capture cut into four pieces each
way. Columns 0–2 are 769 px wide and column 3 is 765; row 0 is 765 high and rows 1–3 are 769:
769 × 3 + 765 = 3,072, the `TexSize` that `RTM_W2_world_02_main_wp`'s `JSONString` gives. With
Orbis' rule they tile to exactly 3072 × 3072 (`belos/belos-stitched.png`). In the game each piece
fills an equal grid cell, so the 765-px pieces are stretched by 0.5%; drawing the 3072-px image
over the square is the same to within 2 px.

**Check:** with this square, X across and Y down, **184 of Belos' 190 points** (warps, dungeons,
chests from `world.json`) fall on an island or within 6 px of one. The best of the other 7
orientations gets 76. The `JSONString` square puts only 3 of the 190 inside the image.

## Not done

- **New in-game screenshots** were not taken. The handoff suggested them, but that needs the game
  running, and it was left untouched. The three screenshots from the chat are in `checks/`.
- **Native code not read:** the mask size factor (1,150 units/px, measured), the marker tints
  (measured), and which render target is t2 and which is t3.
- **Material node graphs:** cooked materials keep no graph, so the "graph" here is the compiled
  pixel shader with its constants decoded (`shaders/`). Two preshader opcodes are new to the
  decoder: 0x0A is read as `max` (it guards a divide by 1e‑5), and 0x16 (a function applied to
  `Cutout` = 0.9) is left unknown.
