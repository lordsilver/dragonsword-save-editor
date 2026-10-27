# Skill icon colours: summary

## Where the per-effect tint is defined

The colours are three `TMap<EMesmerizedUIType, FColor>` properties on the native C++ class
`DRootPanelIngame` (module `/Script/DS`). The game's single subclass of it is the widget
blueprint **`/Game/UI/Root/DRootIngame`**. Its class default object,
`Default__DRootIngame_C`, stores the values:

| Property                   | Serialized in DRootIngame?                                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `MesmerizedUIColor`        | yes, 13 entries (table below)                                                                                                            |
| `MesmerizedSwitchingColor` | yes, 15 entries (table below)                                                                                                            |
| `MesmerizedSkillTypeColor` | **no**. The blueprint does not override it, so it keeps its C++ default, which is compiled into the exe and not stored in any data file. |
| `MesmerizedColor`          | yes, the same palette keyed by `EMesmerizedType` (combat states)                                                                         |

No widget blueprint, material, material instance, DataTable, data asset or `.ini` holds a colour
keyed by the effect. The skill-slot widgets (`DUWG_CharacterSkill_Def` for the circle,
`DUWG_CharacterSkill_Tag` for the diamond) and the detail layer (`DLayerCharacterSkill`) all
contain a `Border` named **`ColorBorder`**. Its designer tint is a neutral `#32403F`.
`ColorBorder` is a bound widget of the C++ classes `DCharacterSkillWidget` and
`DLayerCharacterManagerSkill`, and no blueprint graph sets its colour. The recolouring is
therefore done in C++, which this export cannot read; that conclusion is an inference.
`DLayerCharacterManagerSkill` holds the selected row as
`SelectSkillData: DPCSkillGrowthTableData`. Its field `SkillIconColor` uses the same enum,
`EMesmerizedUIType`, as `PCComboData.IconColor`.

**What the data cannot show:** which of the three maps that C++ code reads. The pak data only
proves that these three maps exist and holds the values of two of them.

**Best match:** `MesmerizedUIColor`. It is the only serialized map whose keys are exactly the
IconColor values (`ATTACK`, `AIR`, `BLEED`, `DOWN`, `FIRE`, `HEAL`, `ICE`, `POISON`, `SHOCK`,
`STUN`) plus `HOLD`, `SLOW` and `SUPERARMOR`, with no junk keys. `MesmerizedSwitchingColor` is
the same palette except for `STUN`, `BLEED` and a one-step difference on `ATTACK`.

## Colour per IconColor (`EMesmerizedUIType`)

FColor is 8-bit sRGB with alpha 255 for every entry. Linear values are in
`decoded/DRootIngame.Default__DRootIngame_C.maps.json`.

| IconColor    | enum value | MesmerizedUIColor       | MesmerizedSwitchingColor |
| ------------ | ---------- | ----------------------- | ------------------------ |
| ATTACK       | 11         | `#B39C6F` (179,156,111) | `#B39C70` (179,156,112)  |
| AIR          | 2          | `#47D1F8` (71,209,248)  | `#47D1F8`                |
| BLEED        | 4          | `#CC0048` (204,0,72)    | `#C63555` (198,53,85)    |
| DOWN         | 3          | `#7D5BF1` (125,91,241)  | `#7D5BF1`                |
| FIRE         | 7          | `#F40000` (244,0,0)     | `#F40000`                |
| HEAL         | 12         | `#ED7F9B` (237,127,155) | `#ED7F9B`                |
| ICE          | 10         | `#55DDFF` (85,221,255)  | `#55DDFF`                |
| POISON       | 8          | `#3DC32E` (61,195,46)   | `#3DC32E`                |
| SHOCK        | 6          | `#C465FF` (196,101,255) | `#C465FF`                |
| STUN         | 1          | `#FFDA59` (255,218,89)  | `#F5D000` (245,208,0)    |
| _HOLD_       | 5          | `#C4C4E6`               | `#C4C4E6`                |
| _SLOW_       | 9          | `#E7766E`               | `#E7766E`                |
| _SUPERARMOR_ | 13         | `#DDD8D0`               | `#DDD8D0`                |

`MesmerizedSwitchingColor` also has `EMesmerizedUIType_MAX` = `#FFFFFF` and
`TYPE_MAX` = `#000000`.

## Other useful findings

- **Corner badge:** `MesmerizedUIVer2IconMap` maps each IconColor to
  `Common/State/State_Mark_<X>_Sprite`. BLEED uses `State_Mark_BLEEDING`. There is no ATTACK
  entry, so a plain attack shows no badge. SUPERARMOR is keyed `TYPE_NONE` in the game data,
  which looks like a data bug.
- **Disc per slot type:** `DLayerCharacterSkill.SkillBGImage` gives `NormalSkill` →
  `Btn_Skill_Info_Bg_01` (circle), `TagSkill` → `Btn_Skill_Info_Bg_04` (diamond), and
  `NormalAttack` → none. The list items use `Btn_Skill_Info_Bg_02` (circle) and `_05`
  (diamond).
- **Glow and ring FX:** the material instances on the slot are fixed gold/orange. Brush tint is
  `#FFCA7F`, the selection images are `#FFF1D8`/`#FFECC2`, and the master-skill colours are
  `#FFBB00`/`#FF6A00`. None of them depends on the effect. They are in
  `decoded/materials.txt`, and their textures are in `png/`.
- **PC skill data assets:** the 21 `/Game/Design/SkillData/PC/DsSDA_*` assets are FX and
  rim-light assets (`DsSkillDataAsset`), not per-skill records. There is none for Reina and only
  a rim asset for Lute (AwakeLute). They hold no link to PCComboLevelData. The link must be in
  the XML tables. Going by field names only (not verified against the tables), the likely path
  is `PCSkillGrowth.ComboChangeID` → `PCComboData` → `AttackWeight`.
