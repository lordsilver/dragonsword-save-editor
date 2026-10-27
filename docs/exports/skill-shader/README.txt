DragonSword Awakening - skill-slot ring shaders (the exact maths of the effect rings)
=====================================================================================

Export date : 2026-10-27
Game        : DragonSword Awakening, installed at C:\Games\DragonSword Awakening
              (same install and build as dsa-assets.zip and dsa-skill-ui.zip)
Engine      : Unreal Engine 5.3 (CUE4Parse profile GAME_DragonSwordAwakening)
Archives    : DS\Content\Paks - 50 .pak files, all mounted, 328,178 files

The game install was only read. Nothing under C:\Games\DragonSword Awakening was created,
modified, moved or deleted, and the game was never started. The game exe was read as a file to
follow the colour code (steps 9-10). The in-game screenshots in C:\Users\Gary\Pictures\Screenshots
were only read.

Start with SUMMARY.md: the per-pixel formula, the three rings' values, how to use it in the
editor, and how well it matches the game.


Results in short
----------------
- The ring material fxm_default_UI cannot be read as a graph, but its compiled shaders can. The
  three ring instances use two static permutations, both with the Distortion and Mask switches
  off: translucent (FXT_ring13_UI_ad01, same shader map as the base material itself) and additive
  (FXT_ring13_UI_ad02 and Mask_Fx_Skill_SignalOutGame share one map).
- Per ring: a noise texture rotates about the tile centre and is added to MainTX's colour; the sum
  is multiplied by the effect colour twice (once by the material's VertexColor, once by Slate);
  opacity is MainTX alpha x Main_Opa x widget opacity. MaskTX (fxt_flare11) is never sampled.
- The game passes the colour to the rings as UImage::SetBrushTintColor(FColor bytes / 255): the
  bytes reinterpreted as linear, replacing the brushes' #FFCA7F tint.
- The diamond's signal ring sits in a box padded 8 of 166 units on each side, at opacity 0.85.
- Checked against 30 in-game screenshots: mean CIELAB dE 3.65 on 5-frame averages (the editor's
  current formula 5.43, on the same pixels) and 3.20 frame by frame with one clock offset per hero.


Files in this folder
--------------------
SUMMARY.md                     the answer
shaders/                       the five material packages' cooked shader maps and shaders:
  <game path>.shadermaps.json   each package's shader maps as CUE4Parse reads them (platform,
                                library hash, shader types, parameter bindings, uniform
                                expression set). fxm_default_UI's own is empty: CUE4Parse cannot
                                read that export to its end (Known issues 1); its maps were found by
                                hash and are the same as FXT_ring13_UI_ad01's.
  <game path>.<format>.<map hash>.<NN>.<frequency>.bin
                                one shader's code as stored in the library, decompressed: UE's
                                resource table, the D3D container, UE's optional data. NN is the
                                shader's ResourceIndex in its map; decoded/shader-index.txt says
                                which shader type each one is.
  ... .dxbc / .dxil             the D3D container cut out of the .bin (SM5 DXBC, SM6 DXIL)
  ... .asm                      its disassembly (fxc /dumpbin for SM5, dxc -dumpbin for SM6)
  shaders.tsv                   every extracted shader: package, library, map hash, how the map was
                                found, index, frequency, shader hash, stored and unpacked sizes
  Packages: Art/FX/Material/UI/fxm_default_UI (base), Art/FX/textures/ring/Uins/FXT_ring13_UI_ad01
  (glow), .../FXT_ring13_UI_ad02 (line), Art/FX/textures/UI/Uins/Mask_Fx_Skill_SignalOutGame
  (signal), Art/FX/textures/glow/Uins/fxt_flare21_UI_M_ad01 (FX_ring01 of the circle, collapsed).
decoded/
  ps-annotated.txt              the ring pixel shader, line by line
  <instance>.preshader.txt      every float of the Material constant buffer (cb2): the parameter
                                expression that fills it and its value for that instance
  shader-index.txt              per shader map: the Slate shader types by ResourceIndex, and the
                                pixel shader's texture/sampler slots and constant-buffer names
  exe-colour-path.txt           the exe evidence for SetBrushTintColor and the bytes/255 conversion
  widget-layout.txt             the slot widgets' layer order, opacities and overlay padding
  textures.txt                  the sampled textures' stored properties (SRGB on for all)
layers/ring-<glow|line|signal>-<EFFECT>.png
                                each ring for each of the 10 effect colours, 256 px over the whole
                                slot box, averaged over the rings' motion. Glow: straight colour and
                                alpha, normal blending. Line and signal: straight colour with alpha =
                                brightest channel, for mix-blend-mode plus-lighter.
validation/
  report.tsv                    per slot (6 heroes x 8): placement, mask size, mean dE of the shader
                                model, the editor formula and the stacked layer PNGs, and mean CIELAB
                                of the disc interior and rim for game / shader / editor
  timing.tsv                    per frame: the fitted clock offset and the frame-by-frame dE
  compare.log                   the run's console output
  sheet-<hero>.png              each slot: 5-frame game average | shader model | editor formula
  frames-<hero>.png             each frame: game | shader model at that frame's time
  frames-whirlwind.png          five raw frames of one slot, enlarged (the rings move)
  layers-preview.png            five of the layer PNGs side by side
tools/
  exporter/                     DsaExport (Program.cs, DsaExport.csproj), with the new "shaders" mode
  slotrender/                   SlotRender (Program.cs, SlotRender.csproj): the reference renderer,
                                "compare", "layers" and "crop" modes
  scripts/                      carve_dxbc.py, decode_preshader.py, shader_index.py,
                                exe_natives.py, widget_tree.py, unversioned_header.py


Tools used
----------
Tool                         Version / source
.NET SDK                     10.0.403, in C:\Users\Gary\dsa-work\dotnet (installed for the first
                             export)
CUE4Parse                    master at df14b99, built from source (as before). Its readers for
                             material shader maps (FMaterialShaderMap, FUniformExpressionSet) and
                             shader libraries (FSerializedShaderArchive) are used here.
Oodle                        oodle-data-shared.dll 2.9.16, in C:\Users\Gary\dsa-work\tools (as before);
                             decompresses the shader code
Mappings                     DragonSword Awakening.usmap, Nexus Mods mod 88 (as before)
fxc.exe, dxc.exe             Windows SDK 10.0.26100 (already installed on this PC; fxc
                             10.0.26100.7705, dxc 1.8.2502.11), x64
SixLabors.ImageSharp         3.1.12, from the local NuGet cache (C:\Users\Gary\dsa-work\nuget),
                             already there as a CUE4Parse-Conversion dependency; used by SlotRender
Python                       3.13 (Microsoft Store build), standard library only, always run as
                             python -I
Nothing was downloaded or installed for this export.


Steps as run
------------
1. Read the save editor's notes (D:\Downloads\Chrome\dragonsword-save-editor-main.zip, unpacked to
   C:\Users\Gary\dsa-work\save-editor-src, read only): scripts/gen-icons.mjs, docs/game-assets.md,
   docs/exports/skill-slot-fit/. The rings are FX_ring01-03 of DUWG_CharacterSkill_Def/_Tag, with
   instances of fxm_default_UI.
2. Found the shader libraries in the earlier full file list (extra/all-files.tsv):
   DS/Content/ShaderArchive-DS_Chunk{0,1,3,6,9}-PCD3D_SM{5,6}.ushaderbytecode and
   ShaderArchive-Global-*. Chunk0 holds 9,744 (SM5) and 9,760 (SM6) shader maps.
3. Added the "shaders" mode to DsaExport: it turns on CUE4Parse's ReadShaderMaps, writes each
   material's shader maps as JSON, reads each library (version 2: FSerializedShaderArchive, then
   the code), finds each map by its parsed hash and by scanning the package's .uexp for any
   library hash, and writes every shader's code, Oodle-decompressed.
     dotnet DsaExport.dll shaders "C:\Games\DragonSword Awakening" C:\Users\Gary\dsa-work\tools <out> @packages.txt
   The 5 packages use 6 distinct shader maps (3 permutations x SM5 and SM6), written per package as
   195 shader files. The material instances parsed fully;
   the base material was found by the .uexp scan (offsets 18355 and 33006), with the same hashes
   as FXT_ring13_UI_ad01.
4. Identified the shaders from the maps' type names: TSlateMaterialShaderPSDefault is the pixel
   shader UMG uses for an Image with a material brush, TSlateMaterialShaderVSfalse its vertex
   shader (shader_index.py). The other entries are Slate's other pixel shader types and mesh
   shaders for particle vertex factories.
5. Cut the D3D container out of each .bin by its 'DXBC' magic and size field, and disassembled it
   with the Windows SDK: fxc /nologo /dumpbin /Fc <asm> <dxbc> for SM5, dxc -dumpbin <dxil>
   -Fc <asm> for SM6 (carve_dxbc.py). All 195 disassembled.
6. Decoded the Material constant buffer: the shader map's uniform expressions are small stack
   programs (preshaders) over the material parameters; decode_preshader.py prints each buffer
   float's expression and evaluates it with the instance's values from dsa-skill-ui's JSON dumps.
7. Decoded the binding header UE puts before the container (an FShaderResourceTable): texture slot
   0 = Material.Texture2D_0 = "noise", slot 1 = Texture2D_1 = "MainTX" (the order of the map's
   texture parameters); and the optional data after it: cb0 = $Globals, cb1 = View,
   cb2 = Material.
8. Read the shaders: decoded/ps-annotated.txt. The SM6 pixel shader has the same operations and
   constants (2 samples, 2 sin/cos with 2pi, the same pow and sRGB constants, the same buffer rows).
9. Identified the exe's colour setter: UImage's native table gives the exec thunks of
   SetColorAndOpacity and SetBrushTintColor (exe_natives.py); the function the slot code calls,
   0x1429f5010, stores into UImage+0x1d0 (Brush.TintColor) exactly like the inlined
   SetBrushTintColor, while SetColorAndOpacity writes +0x208.
10. Read the conversion before the three calls: each FColor channel is converted to float and
   multiplied by 1/255 (ReinterpretAsLinear), not looked up in the sRGB table.
11. Checked the textures' stored properties (DsaExport dump; unversioned_header.py): only
   ImportedSize, LightingGuid and LODGroup are stored, so SRGB keeps its default (on).
12. Printed the slot widgets' trees with their overlay slots (widget_tree.py): the signal ring's
   slot is padded 8 units on every side; everything else fills the slot.
13. Wrote SlotRender, a C# renderer of a slot from the game's layers with the shader maths, and
   compared it with the 30 screenshots of 2026-10-27 15:39 (six heroes x five frames) in
   C:\Users\Gary\Pictures\Screenshots:
     dotnet SlotRender.dll compare C:\Users\Gary\dsa-work\dsa-assets C:\Users\Gary\dsa-work\dsa-skill-ui\png
       <save editor>\crates\core\data\skills.json C:\Users\Gary\Pictures\Screenshots <out> <layers>
   Runs, in order, and what each changed:
   - colour sRGB-decoded, slot 166 x 1440/1080 px: placement failed (the slot is smaller);
   - placement searched (size 140-200 px): slots fit at ~165 px; dE 9.79, too dark on dull
     colours -> led to step 10;
   - colour as bytes/255: dE 5.42, diamonds' rims still weak -> led to step 12;
   - signal ring inset 8 units: dE 4.91;
   - size fixed at 165 px for every slot, centres searched, clock offset per hero fitted to the
     single frames: dE 3.65 (5-frame) and 3.20 (single frames). The two slots whose free size
     search had failed (Air Bomb, Venom Dance) placed correctly at 165 px.
14. Wrote the per-effect layers (SlotRender layers ... 256) and scored them stacked as an editor
    would (premultiplied filtering, normal + plus-lighter): dE 3.73.
15. Wrote SUMMARY.md and this README, and zipped the folder to
    C:\Users\Gary\Desktop\dsa-skill-shader.zip.


Known issues
------------
1. CUE4Parse still cannot read fxm_default_UI's export to its end (its CachedExpressionData read
   fails, as in dsa-skill-ui), so that package's .shadermaps.json is empty. Its compiled shaders
   were matched by hash instead, and they are the same map as FXT_ring13_UI_ad01's.
2. Preshader opcodes: 0x02 Constant, 0x03 Parameter, 0x24 ComponentSwizzle and 0x25 AppendVector
   are certain from their operands; 0x06 (Mul) and 0x07 (Div) from use (x * -1, x / 2). 0x04 is
   taken as Add from the enum order; it only ever adds 0.0 here, so its exact identity changes no
   value.
3. The Slate shader's gamma path (cb0[0]) follows UE 5.3's GammaAndAlphaValues (x = 2.2/DisplayGamma,
   y = 1/DisplayGamma, w = Contrast) from the engine's source, not from data. The screenshots match
   with the sRGB encode on and the contrast path off, as on an SDR back buffer.
4. The validation's slot centres are searched per slot (disc and glyph only), and the screen's
   slot size of 165 px was measured, not read. Each hero's first slot is selected in the
   screenshots (its selection frame is drawn), so it is left out of the totals.
5. The layer PNGs are averages over the rings' motion. A still frame of the game differs from
   them by the moving noise (dE about 6 per frame); only an animated renderer can follow it.
6. Not covered: the selection FX (FX_Select_*, Select, Strong), the master skill slot
   (fxm_Ray_ui), the circle's collapsed FX_ring01 (fxt_flare21_UI_M_ad01, extracted but not
   analysed) and the Niagara level-up effects.
