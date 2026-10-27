DragonSword Awakening - 2D art export
=====================================

Export date : 2026-10-27
Game        : DragonSword Awakening, installed at C:\Games\DragonSword Awakening
Game version: v1.1.1 (NOT confirmed - the exes carry no version resource; the only marker
              is a checksum file named "v1.1.1.xxh128" in the install root, which came with
              the install rather than from the game itself)
Engine      : Unreal Engine 5.3 (CUE4Parse profile GAME_DragonSwordAwakening = GAME_UE5_3 + 10)
Archives    : DS\Content\Paks - 50 classic .pak files (~19.5 GB), no IoStore (.utoc/.ucas),
              AES-encrypted index, Oodle-compressed, custom pak footer.

The game install was only read. Nothing under C:\Games\DragonSword Awakening was created,
modified, moved or deleted, and the game was never started.


Results
-------
Packages scanned        : 6,093 (every .uasset under /Game/Art/UI/, plus any package whose
                          folder path contains "Icon", "Portrait" or "Img_", case-insensitive)
Textures exported (PNG) : 3,678 Texture2D objects, full size (mip 0), 688.7 MB total
    by source pixel format: PF_DXT5 2,067 | PF_B8G8R8A8 1,401 | PF_DXT1 206 | PF_BC7 4
    by folder (/Game/Art/UI/InGame/...):
        Common 860, Icon_Item 613, 03_System 574, Icon_Skill 319, Img_Item 301, Btn 222,
        Img_Character 195, Frame 172, Img_Guide 111, Mask 93, Img_Summon 60,
        Icon_Character 53, Img_Vehicle 34, BackGround 28, Img_Monster 10, StillCut 9, 02_Main 4
    outside /Game/Art/UI: 18 (13 engine/plugin editor icons, /Game/Editor/Icons x3,
        /Game/Art/Spine/UI knockdown icon, /Game/Art/Environment_Art ... /Icons/UDS_Icon)
Paper2D sprites         : 2,236 listed in sprites.json, on 123 atlas pages from 103 atlas packages
Failures                : 1 (see failures.csv and "Known issues" below)
Packages with no Texture2D/PaperSprite (materials, widgets, fonts, ...) are skipped, as asked.


Files in this folder
--------------------
Art/UI/...                  PNGs, mirroring the game path: /Game/Art/UI/X/Y -> Art/UI/X/Y.png
Engine/..., Editor/...      the few matches outside /Game/Art/UI (/Game/ is dropped, /Engine/ kept)
<Atlas>.Texture2D_N.png     sprite-atlas pages. A Paper2D atlas package holds several texture
                            pages; each is exported separately and named <package>.<page>.png,
                            e.g. Art/UI/InGame/03_System/Mercenaries/Mercenaries.Texture2D_5.png
manifest.csv                game_asset_path, png_path, width, height, pixel_format - one row per
                            PNG. game_asset_path is the package path (/Game/...), or
                            <package>.<page> for atlas pages. pixel_format is the texture's
                            format inside the game (all PNGs are 8-bit RGBA).
sprites.json                one entry per PaperSprite:
                              name        sprite asset name (e.g. Mercenaries_Icon_Grade_1_Sprite)
                              asset       sprite asset path
                              atlas       atlas page it is baked into (matches manifest.csv)
                              atlasPng    that page's PNG, relative to this folder
                              x, y, width, height
                                          source rectangle in atlas pixels, origin top-left
                              rectSource  where the rectangle came from (BakedSourceUV +
                                          BakedSourceDimension for every sprite but one)
failures.csv                assets that could not be exported, with the reason
_exporter-src/              source of the exporter used (Program.cs, DsaExport.csproj)


Known issues
------------
1. /Game/Art/UI/InGame/Common/Status_HP_Sprite - the sprite has no BakedSourceTexture
   (it is not baked into any atlas), so it has no atlas or rectangle in sprites.json.
2. Teamset_Line_01_Sprite - its baked rectangle (1,177 4x546) is taller than its atlas page
   Teamset.Texture2D_0 (512x256). The value is what the game data says; the sprite is
   probably stale in the game's own atlas. Clamp or skip it when cutting.
3. MiniGM_marmot_01_Sprite has width 243.999984741211 (a float rounding in the game data);
   round to 244.
4. During loading, CUE4Parse logged read errors for some UI Materials (e.g. UI_Glow,
   ui_circleprogress_mm) and one AI blueprint. Those are not textures and do not affect
   any exported file.


Tools used
----------
- .NET SDK 10.0.403, installed with Microsoft's signed dotnet-install.ps1 into
  C:\Users\Gary\dsa-work\dotnet (-NoPath; no system or PATH change). NuGet cache in
  C:\Users\Gary\dsa-work\nuget, CLI home in C:\Users\Gary\dsa-work\dotnet-home, telemetry off.
- CUE4Parse + CUE4Parse-Conversion, built from source: https://github.com/FabianFG/CUE4Parse
  master at commit df14b99 (2026-10-26, package version 1.2.2), cloned to
  C:\Users\Gary\dsa-work\src\CUE4Parse. NuGet packages pulled in by it, among others:
  AssetRipper.TextureDecoder 2.6.2, SkiaSharp 2.88.9, SixLabors.ImageSharp 3.1.12.
  (The optional CUE4Parse-Natives C++ library was not built - no CMake - and is not needed.)
- Oodle: oodle-data-shared.dll, Oodle 2.9.16, downloaded by CUE4Parse's OodleHelper from
  https://github.com/WorkingRobot/OodleUE/releases (2026-06-04-1357, the build FModel uses).
- zlib-ng: zlib-ng2.dll (2.3.2), downloaded by CUE4Parse's ZlibHelper.
- Detex.dll: BC6H/BC7 decoder, embedded in CUE4Parse-Conversion, unpacked to the tools folder.
- Mappings: "DragonSword Awakening.usmap" from Nexus Mods, DragonSword Awakening mod 88
  "Fmodel .usmap for Modders" v1.0 (2026-07-31), downloaded manually by the user.
  SHA-256 7FD69A3819BE6C33BDBFCCEF5BCACB20E1C2ACC921E62D929483A9084B11905C.
  Needed because the cooked packages use unversioned properties.
- AES key: 0x263479C442D45B7EEDE7B3A36BBB3C3B39EF9178A2F82AB694FB410AB15E01AD.
- DsaExport: a small .NET 10 console program written for this export (_exporter-src/).
- Windows PowerShell + System.Drawing, only to build preview sheets and run checks; they never
  touched the exported PNGs.


Operations, in order
--------------------
1. Inspected the install: DS\Content\Paks holds 50 .pak files, no .utoc/.ucas. No .NET SDK
   was present.
2. Looked up the AES key and the CUE4Parse game profile.
3. Installed the .NET 10 SDK locally (see Tools). Cloned CUE4Parse master; confirmed it has
   GAME_DragonSwordAwakening plus the game's own pak index/AES reader.
4. Wrote DsaExport (C:\Users\Gary\dsa-work\exporter): mounts the Paks folder with
   DefaultFileProvider(TopDirectoryOnly, GAME_DragonSwordAwakening, case-insensitive),
   submits the AES key, loads Oodle/zlib/Detex from C:\Users\Gary\dsa-work\tools.
5. Probe run: all 50 paks mounted (328,178 files, 133,412 .uasset); 6,093 packages matched
   the selection. Loading Icon_Item_Common_Gold failed with "Package has unversioned
   properties but mapping file is missing" -> stopped and asked for a mappings file.
6. The user downloaded the Nexus mod 88 zip; only "DragonSword Awakening.usmap" was extracted
   from it into the tools folder and passed to CUE4Parse as FileUsmapTypeMappingsProvider.
   Probe: Icon_Item_Common_Gold loads as 256x256 PF_DXT5 and decodes.
7. Test run on /Game/Art/UI/InGame/Icon_Item/Common: 265/265 PNGs, 0 failures. Checked Gold,
   ArmorEXP_02, KarmaEXP_02 and MercenaryEXP_02 on dark, light and checkerboard backgrounds:
   colours and alpha correct. Fixed output paths to drop the internal "DS/Content/" prefix.
8. Full export, pass 1: 3,654 PNGs, 4 BC7 textures failed ("Detex decompression failed: not
   initialized"). Fix: unpack and initialise the embedded Detex.dll at startup.
9. Pass 2: all textures decoded, but cutting sprites out showed blank icons. Cause: sprite
   atlas packages contain several texture pages and the exporter keyed textures by package,
   so only the first page of each atlas was written. Fix: key every texture by its full
   object path and write one PNG per page (<package>.<page>.png).
10. Pass 3 (this output): 6,093 packages, 3,678 PNGs, 2,236 sprites, 1 failure, ~20 s.
    Checks: every sprite with an atlas resolves to an exported page; all rectangles fit their
    page except Teamset_Line_01 (Known issues); Mercenaries_Icon_Grade_1..5 and Icon_ETC_Map
    cut out of their atlas pages correctly.
11. Wrote this README and zipped the folder to C:\Users\Gary\Desktop\dsa-assets.zip.

How the exporter works (per package)
- Loads the package; for each export:
  - UTexture2D -> CUE4Parse_Conversion TextureDecoder.Decode() (first mip with data =
    full size), TextureEncoder.Encode(ETextureFormat.Png) -> written under the game path.
  - UPaperSprite -> collected. Afterwards its BakedSourceTexture is loaded and exported
    (even when outside the selected folders), and the rectangle is taken from
    BakedSourceUV / BakedSourceDimension (fallback: bounds of BakedRenderData UVs x page size).
- Runs packages in parallel; writes manifest.csv, sprites.json and failures.csv at the end.

To re-run (on a machine with the same folders):
  set DOTNET_ROOT=C:\Users\Gary\dsa-work\dotnet
  dotnet DsaExport.dll export "C:\Games\DragonSword Awakening" C:\Users\Gary\dsa-work\tools <outDir> [/Game/prefix]
  (also: "probe" to check mounting/mappings, "inspect <DS/Content/...uasset>" to dump mips)
