DragonSword Awakening - skill screen UI data (skill icon colours)
==================================================================

Export date : 2026-10-27
Game        : DragonSword Awakening, installed at C:\Games\DragonSword Awakening
              (same install and same unconfirmed v1.1.1 build as dsa-assets.zip)
Engine      : Unreal Engine 5.3 (CUE4Parse profile GAME_DragonSwordAwakening)
Archives    : DS\Content\Paks - 50 .pak files, all mounted, 328,178 files

The game install was only read. Nothing under C:\Games\DragonSword Awakening was created,
modified, moved or deleted, and the game was never started. The game exe was opened once,
read-only, to scan its bytes (step 9).

Start with SUMMARY.md. It says where the per-effect tint is defined and lists the colours.


Results in short
----------------
- The IconColor enum is EMesmerizedUIType:
    0=TYPE_NONE 1=STUN 2=AIR 3=DOWN 4=BLEED 5=HOLD 6=SHOCK 7=FIRE 8=POISON 9=SLOW 10=ICE
    11=ATTACK 12=HEAL 13=SUPERARMOR 14=TYPE_MAX
  DComboData.IconColor (PCComboData) and DPCSkillGrowthTableData.SkillIconColor both use it.
- The colours are TMap<EMesmerizedUIType, FColor> properties of the native class
  DRootPanelIngame. Their values are stored in the class default object of its blueprint subclass
  /Game/UI/Root/DRootIngame: MesmerizedUIColor (13 entries) and MesmerizedSwitchingColor
  (15 entries). The third map, MesmerizedSkillTypeColor, is not stored in any data file; it keeps
  its C++ default.
- CUE4Parse cannot read that object (see Known issues 1), so the maps were decoded by hand:
  decoded/DRootIngame.Default__DRootIngame_C.maps.json / .txt.
- The same object also holds the icon maps: MesmerizedUIVer2IconMap gives IconColor ->
  State_Mark_<X> corner badge, and MesmerizedUIIconMap gives IconColor -> StateSymbol_<X>.
- No widget, material, material instance, DataTable, data asset or .ini contains a colour keyed
  by the effect. No skill blueprint calls SetBrushColor or SetColorAndOpacity. The slot widgets'
  "ColorBorder" is a C++-bound Border with a neutral designer tint of #32403F, so the code that
  picks one of the three maps is in the C++ exe, which this export cannot read.


Files in this folder
--------------------
SUMMARY.md                    the answer: where the tint lives and the colour per IconColor
decoded/
  DRootIngame.Default__DRootIngame_C.maps.json
                              the 9 enum-keyed maps of the root widget's default object,
                              decoded from the raw bytes. Colour entries carry r,g,b,a (FColor,
                              sRGB 0-255), hex, and linear (FLinearColor(FColor), sRGB-decoded).
                              Object entries give the referenced sprite.
  DRootIngame.Default__DRootIngame_C.maps.txt   the same, as readable text
  enums.txt                   EMesmerizedUIType, EMesmerizedType, DENM_SkillSlotType,
                              ESkillGrowthType, from the mappings
  materials.txt               every material instance used by the skill widgets: parent chain,
                              scalar, vector and texture parameters, blend-mode overrides
json/<game path>.json         every export of each package, serialized by CUE4Parse
                              (JsonConvert, indented). /Game/X/Y -> json/X/Y.json. 41 packages:
    UI/Root/DRootIngame                 root widget (its default object is incomplete here,
                                        see decoded/ and Known issues 1)
    UI/Layer/CharacterManager/DLayerCharacterSkill              Hero > Skill detail panel
    UI/Layer/CharacterManager/CharacterSkill/DLayerCharacterSkillPlane   skill slot layout
    UI/Widget/ListItemWidget/DUWG_CharacterSkill_Def            circle skill slot
    UI/Widget/ListItemWidget/DUWG_CharacterSkill_Tag            diamond (tag) skill slot
    UI/Widget/ListItemWidget/DUWG_CharacterSkillMaster          master skill slot
    UI/Widget/CustomWidget/DUWGProperty                         State_Mark corner badge widget
    UI/UMG/UserWidgets/InGame/DUWG_UserWidget_Mesmerized        in-combat state widget
    UI/Layer/Collection/DLayerCharCollectionSkill, DLayerVehicleCollctionEffect,
    UI/Layer/DLayerVehicleEffect, UI/Widget/ListItemWidget/DUWG_DungeonScore
                                        other packages that reference the same images
    Art/UI/InGame/02_Main/Main/*, Art/FX/...    20 material instances and 7 base materials,
                                        following each parent chain to its root
    Design/SkillData/PC/AwakeLute/DsSDA_AwakeLute_ActiveSkill1_Rim,
    Design/SkillData/PC/Tarte/DsSDA_Tarte_Active02   two PC skill data assets (step 12)
png/                          the 24 textures used by those materials that are outside /Game/Art/UI
                              (FX glow, ring, gradient, noise and mask textures), full size,
                              with manifest.csv and an empty failures.csv as in dsa-assets.zip.
                              The other 15 textures they use are under /Game/Art/UI and are
                              already in dsa-assets.zip (checked against its manifest.csv).
evidence/
  grep-skill-bg-and-state-mark.tsv    package headers naming Btn_Skill_Info_Bg_01/02/04/05,
                                      State_Mark_ or IconColor (44 packages)
  grep-classes-and-enum.tsv           package headers naming DRootPanelIngame, EMesmerizedUIType,
                                      DComboData, DPCSkillGrowthTableData or CharacterSkill
  grep-colour-setters-and-map-names.tsv
                                      package headers naming SetBrushColor, SetColorAndOpacity or
                                      the colour map properties: none is a skill or root widget
  usmap-schema.txt                    every enum and class/struct in the .usmap, as text
  DRootIngame.names.tsv               DRootIngame's name map (N), import map (I), export map (E,
                                      with serial offset in .uexp); input for the hand decode
  DRootIngame.cdo-header-as-cue4parse-reads-it.txt
                                      the property indices in the default object's header, named as
                                      the .usmap resolves them (off by one, Known issues 1)
  exe-colour-constant-scan.txt        result of step 9
  referenced-materials-and-textures.tsv   every material and texture referenced from json/
tools/
  exporter/Program.cs, DsaExport.csproj   DsaExport with the modes added for this export
  decode_root.py                      the hand decoder for the default object's maps
  collect_refs.py                     lists materials and textures referenced from the JSON dumps
  summarize_mi.py                     writes decoded/materials.txt
  scan_exe.py                         read-only byte search of the exe for FColor constants


Known issues
------------
1. The Nexus .usmap (2026-07-31) is one property short in DRootPanelIngame, somewhere before
   GuideWidgetHighlightWidget. The game build is newer. CUE4Parse therefore names every serialized
   property of Default__DRootIngame_C one index too late:
   - It reads the first value (GuideWidgetHighlightWidget) as GuideWidgetEmphasisStringWidget.
   - It reads the second value as MesmerizedIconMap (and gets an empty map).
   - It then fails in "BossMesmerizedIconMap" ("FName could not be read, requested index -227").
   The raw bytes prove the shift:
   - The two leading values are DPopupGuideHightlightWidget_C and DPopupGuideStringWithTerritory_C,
     the classes for the two Guide widget properties.
   - Exactly 9 maps follow.
   - The next value is a 10-element object array (AttackCombatSprite).
   So the 9 maps are MesmerizedIconMap ... MesmerizedSwitchingColor, in declaration order, and
   index 28 (MesmerizedSkillTypeColor) is absent from the header. decode_root.py asserts this
   layout before writing anything.
2. Other dumps that are incomplete for the same reason (mappings older than the build), with
   the CUE4Parse error:
   - Default__DLayerCharCollectionSkill_C: SelectSkillData, DPCSkillGrowthTableData "Unknown
     property with value 26". The struct also gained fields.
   - Default__DUWG_DungeonScore_C: "Unknown property with value 26".
   - All 7 base Materials: the CachedExpressionData read fails ("MaterialCachedParameterEntry:
     Unknown property"). Their JSON has only domain and blend mode, not the parameter defaults.
     The material instances, which carry all the overridden values, read completely.
   None of these holds effect colours.
3. MesmerizedSkillTypeColor keeps its C++ default, which may be empty or may be filled in the
   class constructor. The exe contains none of the known palette colours as 32-bit constants
   (step 9), so that default could not be recovered.
4. Game-data oddities, kept as found:
   - MesmerizedUIVer2IconMap keys SUPERARMOR's badge as TYPE_NONE.
   - BossMesmerizedIconMap has an EMesmerizedType_MAX key.
   - MesmerizedSwitchingColor has _MAX (#FFFFFF) and TYPE_MAX (#000000) keys.
   - MesmerizedIconMap and MesmerizedUIIconMap use StateSymbol_DOWN for ATTACK and
     StateSymbol_FREEZE for ICE.


Tools used
----------
Same toolchain as dsa-assets.zip (see its README for versions and sources), reused from
C:\Users\Gary\dsa-work:
- .NET SDK 10.0.403 (local, C:\Users\Gary\dsa-work\dotnet)
- CUE4Parse + CUE4Parse-Conversion, commit df14b99, unmodified
- Oodle 2.9.16, zlib-ng 2.3.2, Detex (tools folder)
- Mappings: "DragonSword Awakening.usmap", Nexus mod 88 v1.0,
  SHA-256 7FD69A3819BE6C33BDBFCCEF5BCACB20E1C2ACC921E62D929483A9084B11905C
- AES key 0x263479C442D45B7EEDE7B3A36BBB3C3B39EF9178A2F82AB694FB410AB15E01AD
- DsaExport (tools/exporter), with these new read-only modes:
    grep   <out> <needle>...   case-insensitive ASCII search of every package header
                               (.uasset/.umap: name map, imports, exports) in all paks
    schema <out>               writes every enum and class/struct in the mappings as text
    dump   <out> <pkg|@list>   serializes every export of a package to JSON
    names  <pkg> <out>         writes a package's name, import and export maps
    props  <pkg> <export>      lists the property indices in an export's unversioned header
- Python 3 (run with -I) for decode_root.py, collect_refs.py, summarize_mi.py and scan_exe.py.


Operations, in order
--------------------
1. Added the grep mode and searched the headers of all 141,139 packages (.uasset + .umap) for
   Btn_Skill_Info_Bg_01, _02, _04, _05, State_Mark_ and IconColor. That found 44 packages: the
   textures and sprites themselves, plus these UI packages: DLayerCharacterSkill,
   DLayerCharCollectionSkill, DLayerVehicleCollctionEffect, DLayerVehicleEffect,
   DUWG_CharacterSkill_Def (_02), DUWG_CharacterSkill_Tag (_05), DUWGProperty,
   DUWG_UserWidget_Mesmerized, DUWG_DungeonScore, DRootIngame, MesmerizedIconMat and
   MesmerizedBossIconMat. "IconColor" matched no package, because property names are not stored
   in unversioned packages.
   (evidence/grep-skill-bg-and-state-mark.tsv)
2. Added the schema mode and dumped the .usmap. DComboData.IconColor and
   DPCSkillGrowthTableData.SkillIconColor are EnumProperty [EMesmerizedUIType]. Every structure
   using that enum was listed. Only DRootPanelIngame has colour maps keyed by it:
   MesmerizedUIColor, MesmerizedSwitchingColor and MesmerizedSkillTypeColor
   (all TMap<EMesmerizedUIType, FColor>), plus MesmerizedColor keyed by EMesmerizedType.
3. Searched the package headers for DRootPanelIngame, EMesmerizedUIType, DComboData,
   DPCSkillGrowthTableData and CharacterSkill. DRootIngame is the only package naming
   DRootPanelIngame and EMesmerizedUIType. The skill-slot packages are DUWG_CharacterSkill_Def,
   DUWG_CharacterSkill_Tag, DUWG_CharacterSkillMaster and DLayerCharacterSkillPlane.
   (evidence/grep-classes-and-enum.tsv)
4. Added the dump mode and dumped those 12 UI packages plus the two materials to JSON. The
   DRootIngame default object came back with only 2 properties and a parse error (Known issues 1).
5. Extracted DS/Config/DefaultGame.ini and DefaultEngine.ini (raw mode) and searched them for
   Mesmerized/RootPanel. Nothing matched; no colours are set from config.
6. Name map of DRootIngame (names mode): it contains every EMesmerizedType:: and
   EMesmerizedUIType:: value, so enum-keyed data is serialized there. Hex-dumped the .uexp at the
   default object (offset 655, from the export map) and saw 12-byte map entries: FName key plus a
   4-byte value.
7. Added the props mode, which lists the header's property indices as CUE4Parse names them. That
   showed the off-by-one (Known issues 1). It was confirmed from the two leading object values, the
   count of 9 maps, and the AttackCombatSprite array that follows.
8. Wrote decode_root.py, which reads the 9 maps with value types taken from the declaration
   order, not guessed, and asserts the layout. Output is in decoded/.
9. Read-only scan of DS\Binaries\Win64\DSClient-Win64-Shipping.exe (164.6 MB) for the 13 palette
   colours as little-endian 0xAARRGGBB constants. Only FIRE (#F40000, 14 hits, also a generic red)
   and STUN (1-3 hits) appear, and no hits cluster together. There is no constructor table of
   these colours to recover. (evidence/exe-colour-constant-scan.txt)
10. Read brushes and tints from the widget JSON. ColorBorder is #32403F in Def, Tag and
    DLayerCharacterSkill. DLayerCharacterSkill.SkillBGImage maps NormalSkill -> Btn_Skill_Info_Bg_01
    and TagSkill -> _04. The FX images use material instances with fixed gold tints. Searched all
    package headers for SetBrushColor, SetColorAndOpacity and the map property names. No skill or
    root widget calls either function. (evidence/grep-colour-setters-and-map-names.tsv)
11. Collected every MaterialInstanceConstant, Material and Texture2D referenced from the JSON
    (collect_refs.py). The materials were then dumped round by round until the parent chains
    closed: 4 rounds, 25 more packages (20 material instances in all, 7 base materials). Then:
    - Summarised the parameters into decoded/materials.txt.
    - Exported the 24 referenced textures outside /Game/Art/UI as PNG with the existing export
      mode: 24/24, 0 failures.
    - Checked that the 15 under /Game/Art/UI are all in dsa-assets.zip.
12. Optional skill data assets: /Game/Design/SkillData/PC holds only 21 DsSDA_* assets
    (DsSkillDataAsset: skill FX, rim colour, armour material). There is one for AwakeLute (a rim
    asset) and none for Reina or Lute's base form. AwakeLute's and Tarte_Active02 were dumped as
    examples. They hold no combo or level link. DsSkillDataAsset has no field for one, so the
    skill -> PCComboLevelData link is only in the XML tables.
13. Wrote SUMMARY.md and this README, and zipped the folder to
    C:\Users\Gary\Desktop\dsa-skill-ui.zip.

To re-run (same folders):
  set DOTNET_ROOT=C:\Users\Gary\dsa-work\dotnet
  dotnet DsaExport.dll grep  "C:\Games\DragonSword Awakening" C:\Users\Gary\dsa-work\tools out.tsv Btn_Skill_Info_Bg_01 State_Mark_
  dotnet DsaExport.dll dump  "C:\Games\DragonSword Awakening" C:\Users\Gary\dsa-work\tools <outDir> /Game/UI/Root/DRootIngame
  dotnet DsaExport.dll raw   "C:\Games\DragonSword Awakening" C:\Users\Gary\dsa-work\tools DS/Content/UI/Root/DRootIngame.uexp DRootIngame.uexp
  dotnet DsaExport.dll names "C:\Games\DragonSword Awakening" C:\Users\Gary\dsa-work\tools DS/Content/UI/Root/DRootIngame.uasset DRootIngame.names.tsv
  python -I decode_root.py DRootIngame.uexp DRootIngame.names.tsv maps.json
  (From Git Bash, set MSYS_NO_PATHCONV=1 first, or /Game/... arguments get rewritten.)
