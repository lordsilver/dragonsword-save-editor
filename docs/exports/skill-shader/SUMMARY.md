# Skill-slot rings: the exact maths, from the game's compiled shaders

The rings' base material (`/Game/Art/FX/Material/UI/fxm_default_UI`) has no readable graph in the cooked game, but its compiled shaders ship in the paks (`DS/Content/ShaderArchive-DS_Chunk0-PCD3D_SM5-PCD3D_SM5.ushaderbytecode` and the `SM6` twin). I extracted the ring instances' shader maps, disassembled them with the Windows SDK's `fxc`/`dxc`, decoded the material's uniform expressions (which parameter feeds which shader constant) and the texture bindings, and read the colour path in the exe.

**Validation.** Rendering the slots with the result and nothing fitted matches the game to a mean CIELAB ΔE of **3.65** on 42 skill slots (5-frame averages), against **5.43** for the editor's current formula. The editor's formula is at 6f8272b and is scored on the same pixels. With one clock offset per screenshot group, the maths also reproduces **every single frame** at ΔE **3.20**, so the rotation speeds and directions are right too. Everything below was read from the game files. The only free parameters in the check are each slot's position on screen and that clock offset.

## Per pixel

Notation:
- **u, v:** the ring image's UV, 0..1 across its box, with v pointing down.
- **t:** the UI clock in seconds (the material's Time input).
- **C:** the effect colour from `MesmerizedUIColor`, as display bytes / 255.
- **Texture samples:** bilinear with wrap addressing. All these textures have `SRGB` on, so the GPU decodes their RGB from sRGB to linear when sampling; alpha is not decoded.

```
vc = C                        # the vertex colour, as linear values (see "Colour path")
va = 1 (circle rings) or 217/255 (signal ring: render opacity 0.85, sent as a byte)

# noise texture, rotating about the tile centre
h  = Tile / 2
p  = (u * Tile - h, (v + VOffset) * Tile - h)
θ  = 2π * Rotator_Speed * t
N  = noise.rgb at (p.x cosθ - p.y sinθ + h,  p.x sinθ + p.y cosθ + h)
N  = N ^ noise_pow                                  (0 where N <= 0)

M  = MainTX at (u, v)                                (rgb linear, a as stored)

E  = max(0, Main_Str * (noise_str * N + M.rgb) * vc) # material emissive, first tint
O  = saturate(M.a * Main_Opa * va)                   # material opacity

translucent ring:  colour = sRGB(E * vc),         alpha = O * va      # Slate tints again
                   dst = colour * alpha + dst * (1 - alpha)
additive ring:     light  = sRGB(E * O * vc * va)
                   dst = min(1, dst + light)
```

`sRGB()` is the standard encode (12.92·x below 0.0031308, else 1.055·x^(1/2.4) − 0.055), and the 8-bit target clamps the result to 1.

Blending happens on these encoded display values, exactly as CSS blends. `dst` starts as the disc (`Btn/Btn_Skill_Info_Bg_02`, or `_05` for the diamond) with the glyph drawn over it unchanged. Both are plain textures with straight alpha.

The colour is applied **twice**, once in the material and once by Slate, so a ring's colour goes as roughly C². That is why plain khaki ATTACK rings read cream while FIRE stays red.

## The three rings

|                         | Glow                                | Line                       | Signal                                        |
| ----------------------- | ----------------------------------- | -------------------------- | --------------------------------------------- |
| Widget, draw order      | `_Def` `FX_ring02`, after the glyph | `_Def` `FX_ring03`, on top | `_Tag` `FX_ring01`, after the glyph, on top   |
| Instance                | `FXT_ring13_UI_ad01`                | `FXT_ring13_UI_ad02`       | `Mask_Fx_Skill_SignalOutGame`                 |
| Blend                   | translucent                         | additive                   | additive                                      |
| MainTX                  | `fxt_ring13b`                       | `fxt_ring13c`              | `Mask/Mask_Fx_Skill_Signal`                   |
| noise                   | `fxt_noise012`                      | `fxt_grad10a`              | `fxt_grad10a`                                 |
| Tile (Utile = Vtile)    | 0.8                                 | 1                          | 1                                             |
| VOffset                 | −0.3                                | 0                          | 0                                             |
| Rotator_Speed (turns/s) | −0.05: one turn per 20 s, clockwise | −0.25: per 4 s, clockwise  | +0.5: per 2 s, counter-clockwise              |
| noise_pow               | 1                                   | 3                          | 1                                             |
| noise_str               | 1                                   | 3                          | 3                                             |
| Main_Str                | 1.0                                 | 0.6                        | 1.0                                           |
| Main_Opa                | 0.5                                 | 0.5                        | 0.5                                           |
| Render opacity (va)     | 1                                   | 1                          | 0.85                                          |
| Box                     | the whole slot                      | the whole slot             | the slot inset by 8 of 166 units on each side |
- **Defaults:** every other parameter keeps `fxm_default_UI`'s default. UOffset, the pans, the angles, the UVParameters and Main_* rotation and pan are 0; Dimension and Main_Intensity are 1. So MainTX is sampled at plain (u, v).
- **Unused:** `MaskTX` (`fxt_flare11`) is never sampled, because the `Mask` static switch is off in both compiled permutations. The `distortionTX` and `*_D` parameters are unused too, because `Distortion` is off.
- **Box size:** all layers fill the 166-unit slot box. It measured 165 px on the 2560×1440 screenshots, so UMG draws this screen at about 1 px per unit, not 1440/1080.
- **Rotation direction:** on screen with y pointing down, a positive Rotator_Speed turns the noise counter-clockwise.

## Colour path (from the exe)

- **Map:** the slot's colour function looks the skill's IconColor up in `MesmerizedUIColor` (root panel `+0x828`).
- **Conversion:** it turns the FColor into an FLinearColor with **bytes × 1/255**, which is `ReinterpretAsLinear`, not the sRGB table.
- **Setter:** it hands the result to **`UImage::SetBrushTintColor`** on `FX_ring01`–`03`, replacing the designer tint `#FFCA7F`; `ColorAndOpacity` stays white.
- **Slate round trip:** Slate packs the tint into an sRGB vertex byte, and the vertex shader decodes it, so the shader sees C/255 as linear values.

Addresses and bytes are in `decoded/exe-colour-path.txt`. That file corrects one earlier note: the colour does not go through the sRGB table.

## Using it in the editor

The colour sits inside a non-linear encode and is applied twice, so a white mask tinted in CSS cannot reproduce it. There are two ways to draw it:
1. **Static (simplest):** `layers/` has the three rings for each of the 10 effect colours, averaged over the rings' motion: `ring-glow-<EFFECT>.png`, `ring-line-<EFFECT>.png`, `ring-signal-<EFFECT>.png`, 256 px, covering the whole slot box.
   - **Stacking order:** for a circle, draw the disc, then the glyph, then glow (normal blending), then line (`mix-blend-mode: plus-lighter`). For a diamond, draw the disc, the glyph, then signal (`plus-lighter`).
   - **Colour encoding:** glow PNGs hold straight colour and alpha. The additive PNGs hold straight colour with alpha = the brightest channel, so colour × alpha is the light to add.
   - **Accuracy:** stacked like that, they score ΔE **3.73** against the game, essentially the exact model's 3.65.
   - **Producing them:** `gen-icons.mjs` could generate them from the formula above instead of shipping them. `tools/slotrender` (`layers` mode) is the reference implementation, and its output is in `layers/` for checking.
2. **Animated (exact):** run the per-pixel formula in a canvas or WebGL shader with the five textures and a clock. The rings then move the way they do in the game.

## Validation

`tools/slotrender` (`compare` mode) used 30 screenshots (2026-10-27 15:39, six heroes × five frames ~1 s apart).
- **Placement:** each slot is placed by matching only the disc and glyph at a fixed 165 px. Nothing about the rings was fitted.
- **Masked pixels:** ΔE is the mean CIELAB distance inside the opaque disc. The name plate, the level-up chevron and the diamonds' effect badge are excluded.
- **Selected slot:** each hero's first slot is selected (its detail pane is open), so it is left out.

|                            | Shader maths                                     | Layer PNGs stacked | Editor now (6f8272b) |
| -------------------------- | ------------------------------------------------ | ------------------ | -------------------- |
| 5-frame averages, 42 slots | **3.65**                                         | 3.73               | 5.43                 |
| circles (30)               | 3.91                                             | 4.00               | 5.21                 |
| diamonds (12)              | 2.99                                             | 3.03               | 6.00                 |
| single frames (30)         | **3.20** at the fitted clock; 5.97 time-averaged |                    | 6.99                 |

The single-frame test uses one clock offset per hero. The frames then sit at the offsets given by the screenshot file names' millisecond timestamps. The error stays at 2.6–3.9 on all five frames of every hero, so the rotation speeds and directions are right. `validation/frames-*.png` shows each frame next to the model at that time; `sheet-*.png` shows game | shader | editor.

The shader beats the editor's formula on every one of the 42 slots (`validation/report.tsv`).

## Two corrections to the editor's notes

- **Moving light:** the slot's moving light is these rings' rotating noise textures. `FXT_UI_Icon01_N` and `FXT_UI_Icon05` are on the collapsed selection images.
- **Ring brightness:** it comes from the ring textures' RGB plus the noise, not from alpha masks; flare11 plays no part.
