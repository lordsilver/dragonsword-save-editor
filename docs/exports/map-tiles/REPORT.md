# DragonSword world map capture tiles

Answer to `handoff-world-map-tiles.md`. Every texture under `/Game/Design/CaptureMinimap/Export/`
is in this zip as PNG, at `Design/CaptureMinimap/Export/<name>.png`. That is 58 textures from 71
packages; the other 13 packages hold no texture (see "Capture bounds"). Nothing in the game
install or any save was changed, and the game was not started.

Each value below is **read**, meaning taken from the package, or **checked**, meaning compared
pixel by pixel.

## How they were made

```bash
export MSYS_NO_PATHCONV=1
dotnet DsaExport.dll export "C:\Games\DragonSword Awakening" <tools-dir> <tiles-dir> /Game/Design/CaptureMinimap/Export/
```

- **DsaExport:** built 2026-10-27 from `tools/asset-export/Program.cs` of
  `lordsilver/dragonsword-save-editor` at b9860de. The local copy adds one command (`shaders`); the
  `export`, `inspect`, `raw` and `dump` code is unchanged. The project has no version number.
  `DsaExport.dll` SHA-256: `cedb079f…5d8ba`.
- **CUE4Parse:** 1.2.2 (`Directory.Build.props`), git df14b992 (2026-10-26, "USD PBR"), from
  FabianFG/CUE4Parse with a clean working tree. The game is read as `GAME_DragonSwordAwakening`
  with `DragonSword Awakening.usmap`.
- **Runtime:** .NET 10.0.14. BC7 decoding is done by `Detex.dll`, the decoder CUE4Parse picks on
  Windows (`TextureDecoder.cs`, PF_BC7 branch).
- **PNG writing:** `CTexture.Encode(Png)` writes the decoded pixels losslessly as 8-bit RGBA, with
  no resizing and no flipping. Row 0 of the texture is the top row of the PNG.
- **Checking:** Pillow 13.0.0, numpy 2.5.4 and texture2ddecoder 1.0.6 in Python
  (`scripts/verify_tiles.py`, `bc7_third.py`, `bc7_mode6.py`).

## Is the PNG the best the game holds?

**Read** (`DsaExport inspect`, every texture; full output in `data/inspect.txt`):
- **One mip each.** Every texture holds a single mip at full size and no smaller levels.
- **Stored inline.** The mip lives in the package itself (`BULKDATA_ForceInlinePayload`), with no
  `.ubulk` or optional higher-resolution data. The folder's files are only `.uasset` and `.uexp`,
  all in `pakchunk3-WindowsClient.pak`.
- **Same settings everywhere.** All 58 have `CompressionSettings` TC_BC7 and `LODGroup`
  TEXTUREGROUP_UI. 42 also have `NeverStream`; the 16 Orbis tiles don't. `ImportedSize` equals
  the stored size on all 58.

| Group                                       | Textures | Stored as                               | Is the PNG the best the game holds?                                                                                              |
| ------------------------------------------- | -------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Orbis `RTM_W1_world_01_main_WP_<a>_<b>`     | 16       | BC7, 1024 × 1024                        | The game itself only has BC7 blocks, so the compression is the game's. See the BC7 note below for a 1-level rounding difference. |
| Belos `RTM_W2_1_world_02_main_wp_<a>_<b>`   | 16       | **B8G8R8A8 (uncompressed)**, 769/765 px | Yes. **Checked:** each PNG equals the stored bytes exactly (B,G,R,A → R,G,B,A), all 16.                                          |
| `RTM_W2_1xx_world_02_main_wp_0_0` (102–111) | 10       | BC7, 3072 × 3072                        | Same as Orbis.                                                                                                                   |
| `RTM_W2_World_02_Dummy1_WP_<a>_<b>`         | 16       | BC7, 3072 × 3072                        | Same as Orbis.                                                                                                                   |

The Belos tiles are TC_BC7 in their settings but stored uncompressed. This is most likely because
769 and 765 are not multiples of 4, which BC7 needs, so the engine kept them as BGRA.

### BC7 note: the exporter's decode is off by 1 on some pixels

**Checked:** I decoded the stored BC7 blocks of all 42 BC7 textures again with two other decoders,
Pillow's BCn decoder and texture2ddecoder. Those two agree with each other on every pixel of all
42. DsaExport's PNGs (Detex) match them exactly on 9 textures. On the other 33 they differ by
**exactly 1 level** in some channels of some pixels; no difference is larger.
- In total that is 1,621,412 pixels. For Orbis it is 793,034 of 16,777,216 (4.7%), from 784 to
  117,656 per tile.
- I checked three tiles (Orbis 0_0 and 2_2, Belos island 105), 13,361 differing blocks in all.
  Every one of them is BC7 **mode 6**. Decoding them by hand with the BC7 interpolation rule,
  `((64 − w)·e0 + w·e1 + 32) >> 6`, gives Pillow's and texture2ddecoder's values on every block
  (`scripts/bc7_mode6.py`). So the Detex output is the one that strays from the spec.
- The difference cannot be seen, but the spec decode is the exact one. **`spec-decode/Design/CaptureMinimap/Export/`**
  has it for the 16 Orbis tiles, written losslessly. `scripts/spec_decode.py <work> <out> <prefix>`
  writes it for the other BC7 textures from the package bytes.
- The main folder stays exactly as DsaExport wrote it, as the handoff asked.

## Layout and names

- **Tile names:** the editor's rule holds: `<a>_<b>` is row a, column b. For Belos, column 3 is
  765 px wide and row 0 is 765 high, with the other columns and rows 769. 769 × 3 + 765 = 3,072, the
  `TexSize` of `RTM_W2_world_02_main_wp`, and the 16 pieces tile to exactly 3,072 × 3,072.
- **Belos package name:** the textures are named `RTM_W2_1_world_02_main_wp_*`, but the data
  package is `RTM_W2_world_02_main_wp`, without the `_1`. `WorldMapData_200.MapTexturePath` names
  `RTM_W2_1_world_02_main_wp`.
- **Belos is mostly black.** 7 of its 16 tiles are a single colour, (0, 0, 0). The islands are
  small and dark, with mean RGB under 7. That is what the package holds, not an export fault.

## Capture bounds (the 13 non-texture packages)

**Read:** each capture has a package of class `JSONString` with the capture's settings (`dump/`,
`data/captures.csv`). Units are world units.

| Prefix                        | size      | count | TexSize | sx         | sy         | ex         | ey         |
| ----------------------------- | --------- | ----- | ------- | ---------- | ---------- | ---------- | ---------- |
| `RTM_W1_world_01_main_WP`     | 460,000   | 4     | 1,024   | -165,990   | -151,100   | 294,010    | 308,900    |
| `RTM_W2_102_world_02_main_wp` | 240,000   | 1     | 3,072   | 424,800    | 275,400    | 664,800    | 515,400    |
| `RTM_W2_103_world_02_main_wp` | 240,000   | 1     | 3,072   | 658,320    | 468,770    | 898,320    | 708,770    |
| `RTM_W2_104_world_02_main_wp` | 87,000    | 1     | 3,072   | 584,280    | 738,880    | 671,280    | 825,880    |
| `RTM_W2_105_world_02_main_wp` | 87,000    | 1     | 3,072   | 354,140    | 632,720    | 441,140    | 719,720    |
| `RTM_W2_106_world_02_main_wp` | 62,000    | 1     | 3,072   | 291,440    | 734,190    | 353,440    | 796,190    |
| `RTM_W2_107_world_02_main_wp` | 140,000   | 1     | 3,072   | 188,442.62 | 788,131.92 | 328,442.62 | 928,131.92 |
| `RTM_W2_108_world_02_main_wp` | 140,000   | 1     | 3,072   | 188,442.61 | 788,131.92 | 328,442.61 | 928,131.92 |
| `RTM_W2_109_world_02_main_wp` | 87,000    | 1     | 3,072   | 69,590     | 768,020    | 156,590    | 855,020    |
| `RTM_W2_110_world_02_main_wp` | 170,000   | 1     | 3,072   | 46,960     | 577,860    | 216,960    | 747,860    |
| `RTM_W2_111_world_02_main_wp` | 87,000    | 1     | 3,072   | 228,190    | 454,450    | 315,190    | 541,450    |
| `RTM_W2_World_02_Dummy1_WP`   | 1,400,000 | 4     | 3,072   | -500,000   | -700,000   | 900,000    | 700,000    |
| `RTM_W2_world_02_main_wp`     | 1,100,000 | 4     | 3,072   | -143,730   | 125,690    | 956,270    | 1,225,690  |

The columns `sz` and `ez` (height range) are left out here; they are in `data/captures.csv`.
- **Orbis:** the square, corner (−165,990, −151,100) and size 460,000, is the one the editor already
  has in `crates/core/data/world_maps.json` for map 100.
- **Belos:** this square is (−143,730, 125,690). It is **not** the one that fits Belos' points; the
  fitting one is `WorldMapData_200`'s corner (−593,730, −524,310) with the same size, as in
  `dsa-world-map.zip`'s `REPORT.md`, section 5. The two differ by exactly (450,000, 650,000).
- **The 10 single-island captures (102–111)** are 3,072 px each over 62,000–240,000 units, 20–78
  units per pixel. Belos' main capture is 358 units per pixel. 107 and 108 cover the same square at
  two heights (two floors).
  - **Not placed:** I tried drawing them on the stitched Belos image with their own bounds, both as
    stored and shifted by (450,000, 650,000), searching ±6,000 units around each. None lined up
    (correlation ≤ 0.04, `scripts/island_fit.py`). So they are probably in their own level's
    coordinates; where they go on Belos is open.
  - Nothing found so far says the world map uses them; `WorldMapData_200` names only the main
    capture.
- **`RTM_W2_World_02_Dummy1_WP`** is a 4 × 4 capture of a 1,400,000 square (12,288 px across). It
  has one bright white square near (0.22, 0.66) of the image and is not named by `WorldMapData`.

## Files

| Path                                                    | What                                                                                                                               |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `Design/CaptureMinimap/Export/*.png`                    | The 58 textures exactly as DsaExport wrote them                                                                                    |
| `spec-decode/Design/CaptureMinimap/Export/RTM_W1_*.png` | The 16 Orbis tiles decoded by the BC7 spec (see the BC7 note)                                                                      |
| `data/tiles.csv`                                        | Per file: size, PNG mode, format, mips, mip 0 bytes, NeverStream, alpha range, whether it matches the package exactly, PNG SHA-256 |
| `data/manifest.csv`, `data/failures.csv`                | DsaExport's own lists (no failures)                                                                                                |
| `data/inspect.txt`                                      | `DsaExport inspect` for every texture: mips, bulk-data flags, properties                                                           |
| `data/bc7-check.txt`                                    | DsaExport vs Pillow vs texture2ddecoder, per BC7 texture                                                                           |
| `data/captures.csv`, `dump/`                            | The capture bounds and the 13 `JSONString` packages as JSON                                                                        |
| `scripts/`                                              | The checking scripts                                                                                                               |

## Every file

The last column counts pixels where DsaExport's PNG is 1 level off the BC7 spec decode in some
channel. "—" means the texture is not BC7.

| File                                  | Pixels      | Format in package | Mips | Never streamed | Pixels off by 1 from BC7 spec |
| ------------------------------------- | ----------- | ----------------- | ---- | -------------- | ----------------------------- |
| `RTM_W1_world_01_main_WP_0_0.png`     | 1024 × 1024 | BC7               | 1    | no             | 784                           |
| `RTM_W1_world_01_main_WP_0_1.png`     | 1024 × 1024 | BC7               | 1    | no             | 2,170                         |
| `RTM_W1_world_01_main_WP_0_2.png`     | 1024 × 1024 | BC7               | 1    | no             | 6,364                         |
| `RTM_W1_world_01_main_WP_0_3.png`     | 1024 × 1024 | BC7               | 1    | no             | 20,189                        |
| `RTM_W1_world_01_main_WP_1_0.png`     | 1024 × 1024 | BC7               | 1    | no             | 3,596                         |
| `RTM_W1_world_01_main_WP_1_1.png`     | 1024 × 1024 | BC7               | 1    | no             | 27,037                        |
| `RTM_W1_world_01_main_WP_1_2.png`     | 1024 × 1024 | BC7               | 1    | no             | 30,154                        |
| `RTM_W1_world_01_main_WP_1_3.png`     | 1024 × 1024 | BC7               | 1    | no             | 74,018                        |
| `RTM_W1_world_01_main_WP_2_0.png`     | 1024 × 1024 | BC7               | 1    | no             | 35,771                        |
| `RTM_W1_world_01_main_WP_2_1.png`     | 1024 × 1024 | BC7               | 1    | no             | 62,867                        |
| `RTM_W1_world_01_main_WP_2_2.png`     | 1024 × 1024 | BC7               | 1    | no             | 67,706                        |
| `RTM_W1_world_01_main_WP_2_3.png`     | 1024 × 1024 | BC7               | 1    | no             | 88,579                        |
| `RTM_W1_world_01_main_WP_3_0.png`     | 1024 × 1024 | BC7               | 1    | no             | 82,358                        |
| `RTM_W1_world_01_main_WP_3_1.png`     | 1024 × 1024 | BC7               | 1    | no             | 117,656                       |
| `RTM_W1_world_01_main_WP_3_2.png`     | 1024 × 1024 | BC7               | 1    | no             | 88,131                        |
| `RTM_W1_world_01_main_WP_3_3.png`     | 1024 × 1024 | BC7               | 1    | no             | 85,654                        |
| `RTM_W2_102_world_02_main_wp_0_0.png` | 3072 × 3072 | BC7               | 1    | yes            | 22,195                        |
| `RTM_W2_103_world_02_main_wp_0_0.png` | 3072 × 3072 | BC7               | 1    | yes            | 27,811                        |
| `RTM_W2_104_world_02_main_wp_0_0.png` | 3072 × 3072 | BC7               | 1    | yes            | 24,174                        |
| `RTM_W2_105_world_02_main_wp_0_0.png` | 3072 × 3072 | BC7               | 1    | yes            | 86,368                        |
| `RTM_W2_106_world_02_main_wp_0_0.png` | 3072 × 3072 | BC7               | 1    | yes            | 110,933                       |
| `RTM_W2_107_world_02_main_wp_0_0.png` | 3072 × 3072 | BC7               | 1    | yes            | 98,969                        |
| `RTM_W2_108_world_02_main_wp_0_0.png` | 3072 × 3072 | BC7               | 1    | yes            | 57,827                        |
| `RTM_W2_109_world_02_main_wp_0_0.png` | 3072 × 3072 | BC7               | 1    | yes            | 188,721                       |
| `RTM_W2_110_world_02_main_wp_0_0.png` | 3072 × 3072 | BC7               | 1    | yes            | 82,313                        |
| `RTM_W2_111_world_02_main_wp_0_0.png` | 3072 × 3072 | BC7               | 1    | yes            | 44,461                        |
| `RTM_W2_1_world_02_main_wp_0_0.png`   | 769 × 765   | B8G8R8A8          | 1    | yes            | —                             |
| `RTM_W2_1_world_02_main_wp_0_1.png`   | 769 × 765   | B8G8R8A8          | 1    | yes            | —                             |
| `RTM_W2_1_world_02_main_wp_0_2.png`   | 769 × 765   | B8G8R8A8          | 1    | yes            | —                             |
| `RTM_W2_1_world_02_main_wp_0_3.png`   | 765 × 765   | B8G8R8A8          | 1    | yes            | —                             |
| `RTM_W2_1_world_02_main_wp_1_0.png`   | 769 × 769   | B8G8R8A8          | 1    | yes            | —                             |
| `RTM_W2_1_world_02_main_wp_1_1.png`   | 769 × 769   | B8G8R8A8          | 1    | yes            | —                             |
| `RTM_W2_1_world_02_main_wp_1_2.png`   | 769 × 769   | B8G8R8A8          | 1    | yes            | —                             |
| `RTM_W2_1_world_02_main_wp_1_3.png`   | 765 × 769   | B8G8R8A8          | 1    | yes            | —                             |
| `RTM_W2_1_world_02_main_wp_2_0.png`   | 769 × 769   | B8G8R8A8          | 1    | yes            | —                             |
| `RTM_W2_1_world_02_main_wp_2_1.png`   | 769 × 769   | B8G8R8A8          | 1    | yes            | —                             |
| `RTM_W2_1_world_02_main_wp_2_2.png`   | 769 × 769   | B8G8R8A8          | 1    | yes            | —                             |
| `RTM_W2_1_world_02_main_wp_2_3.png`   | 765 × 769   | B8G8R8A8          | 1    | yes            | —                             |
| `RTM_W2_1_world_02_main_wp_3_0.png`   | 769 × 769   | B8G8R8A8          | 1    | yes            | —                             |
| `RTM_W2_1_world_02_main_wp_3_1.png`   | 769 × 769   | B8G8R8A8          | 1    | yes            | —                             |
| `RTM_W2_1_world_02_main_wp_3_2.png`   | 769 × 769   | B8G8R8A8          | 1    | yes            | —                             |
| `RTM_W2_1_world_02_main_wp_3_3.png`   | 765 × 769   | B8G8R8A8          | 1    | yes            | —                             |
| `RTM_W2_World_02_Dummy1_WP_0_0.png`   | 3072 × 3072 | BC7               | 1    | yes            | 29,532                        |
| `RTM_W2_World_02_Dummy1_WP_0_1.png`   | 3072 × 3072 | BC7               | 1    | yes            | 1,938                         |
| `RTM_W2_World_02_Dummy1_WP_0_2.png`   | 3072 × 3072 | BC7               | 1    | yes            | 0                             |
| `RTM_W2_World_02_Dummy1_WP_0_3.png`   | 3072 × 3072 | BC7               | 1    | yes            | 0                             |
| `RTM_W2_World_02_Dummy1_WP_1_0.png`   | 3072 × 3072 | BC7               | 1    | yes            | 155                           |
| `RTM_W2_World_02_Dummy1_WP_1_1.png`   | 3072 × 3072 | BC7               | 1    | yes            | 24,333                        |
| `RTM_W2_World_02_Dummy1_WP_1_2.png`   | 3072 × 3072 | BC7               | 1    | yes            | 0                             |
| `RTM_W2_World_02_Dummy1_WP_1_3.png`   | 3072 × 3072 | BC7               | 1    | yes            | 0                             |
| `RTM_W2_World_02_Dummy1_WP_2_0.png`   | 3072 × 3072 | BC7               | 1    | yes            | 5,312                         |
| `RTM_W2_World_02_Dummy1_WP_2_1.png`   | 3072 × 3072 | BC7               | 1    | yes            | 12,481                        |
| `RTM_W2_World_02_Dummy1_WP_2_2.png`   | 3072 × 3072 | BC7               | 1    | yes            | 10,855                        |
| `RTM_W2_World_02_Dummy1_WP_2_3.png`   | 3072 × 3072 | BC7               | 1    | yes            | 0                             |
| `RTM_W2_World_02_Dummy1_WP_3_0.png`   | 3072 × 3072 | BC7               | 1    | yes            | 0                             |
| `RTM_W2_World_02_Dummy1_WP_3_1.png`   | 3072 × 3072 | BC7               | 1    | yes            | 0                             |
| `RTM_W2_World_02_Dummy1_WP_3_2.png`   | 3072 × 3072 | BC7               | 1    | yes            | 0                             |
| `RTM_W2_World_02_Dummy1_WP_3_3.png`   | 3072 × 3072 | BC7               | 1    | yes            | 0                             |
