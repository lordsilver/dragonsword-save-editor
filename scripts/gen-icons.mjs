#!/usr/bin/env node
// Build the editor's icon sprite from the game's own textures.
//
// Usage: node scripts/gen-icons.mjs <assets-dir> <extract-dir> <fx-dir>
//
// <assets-dir> is the 2D-art export described in docs/game-assets.md (PNGs
// laid out by game path, e.g. Art/UI/InGame/Icon_Item/Common/Icon_Item_Common_Gold.png).
// <extract-dir> holds the game's XML tables (see scripts/gen-growth.mjs); only
// PCCharacterData is read, for each hero's portrait name. Neither folder is
// part of this repository.
//
// The script takes only the icons the catalog uses: each item's own icon by
// its game path, and each hero's square portrait (Icon_Character_<ImageType>).
// Where the game ships no such texture (docs/game-assets.md lists them), it
// falls back to what the game's own tables use instead:
// - a costume item: its tall CostumeData card (Img_Item/Costume or
//   Costume_Weapon, same name), cropped to the top square;
// - a hero without a portrait (Viola): the hero's Img_Character_Mini bust,
//   cropped the same way;
// - a familiar without an item icon: the icon of the familiar whose
//   VehicleCharacterData row names the same image.
// It also packs each hero skill's icon and each skill effect's badge from
// crates/core/data/skills.json.
//
// Last, it writes the game's grade artwork next to the sprite: the inventory
// tile background (Frame/Frame_Item_Grade_0N) as grade-tile-<grade>.webp and
// the item card header (Frame/Frame_Grade_0N) as grade-card-<grade>.webp, for
// N = 1..5 from normal to legendary.
//
// And the layers of a skill slot, as the game's DUWG_CharacterSkill_Def
// (circle) and _Tag (diamond) widgets stack them (docs/game-assets.md): the
// discs Btn/Btn_Skill_Info_Bg_02 and _05, and per effect colour the three
// effect rings drawn with the maths of their compiled shaders (fxm_default_UI),
// averaged over the rings' motion: the circle's translucent glow
// (FXT_ring13_UI_ad01) and additive line (_ad02), and the diamond's additive
// signal ring (Mask_Fx_Skill_SignalOutGame), as skill-ring-<ring>-<effect>.webp.
// <fx-dir> is the png/ folder of the skill-screen export, which holds the FX
// textures.
// It packs them into apps/desktop/src/assets/sprite.webp and rewrites the
// cell offsets in crates/core/data/items.json, items_extra.json (the game's
// items that items.json lacks) and skills.json, the last two written by
// scripts/gen-catalog-extras.mjs. Cell 0 stays empty, because an item at
// offset 0,0 means "no icon" to the catalog.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const [assetsDir, extractDir, fxDir] = process.argv.slice(2);
if (!assetsDir || !extractDir || !fxDir) {
  console.error('usage: node scripts/gen-icons.mjs <assets-dir> <extract-dir> <fx-dir>');
  process.exit(2);
}

/** Pixels per sprite cell. The frontend's ItemIcon reads the same value from items.json. */
const CELL = 128;
const COLUMNS = 32;

const catalogPath = new URL('../crates/core/data/items.json', import.meta.url);
const extraPath = new URL('../crates/core/data/items_extra.json', import.meta.url);
const skillsPath = new URL('../crates/core/data/skills.json', import.meta.url);
const spritePath = new URL('../apps/desktop/src/assets/sprite.webp', import.meta.url);

function fail(message) {
  console.error(`gen-icons: ${message}`);
  process.exit(1);
}

/** Rows of a table as attribute maps, the way gen-growth.mjs reads them. */
function rows(table) {
  const text = readFileSync(join(extractDir, `${table}.xml`), 'utf8');
  const out = [];
  for (const element of text.matchAll(/<[\w-]+:\w+\s([^<>]*?)\/>/g)) {
    const row = {};
    for (const attribute of element[1].matchAll(/[\w-]+:(\w+)="([^"]*)"/g)) row[attribute[1]] = attribute[2];
    out.push(row);
  }
  if (out.length === 0) fail(`${table} has no rows`);
  return out;
}

const exists = (path) => existsSync(join(assetsDir, `${path}.png`));

// Hero art: PCCharacterData names each hero's art set in ImageType.
const heroImages = new Map();
for (const row of rows('PCCharacterData')) if (row.ImageType) heroImages.set(row.ID, row.ImageType);

// Familiars: VehicleCharacterData names one collection image per familiar,
// and two familiars can share it.
const vehicleImages = new Map();
for (const row of rows('VehicleCharacterData')) if (row.IconName) vehicleImages.set(row.ID, row.IconName);

/** Where an item's icon comes from: a game path, and whether to crop it to its top square. */
function iconSource(cid, item) {
  if (item.iconPath && exists(item.iconPath)) return { path: item.iconPath, crop: false };
  const costume = item.iconPath?.match(/\/Icon_Item\/Costume\/(?:Icon|Img)_Item_Costume_(\w+)$/)?.[1];
  if (costume) {
    for (const folder of ['Costume', 'Costume_Weapon']) {
      const card = `Art/UI/InGame/Img_Item/${folder}/Img_Item_Costume_${costume}`;
      if (exists(card)) return { path: card, crop: true };
    }
  }
  const hero = item.category === 'character' ? heroImages.get(cid) : undefined;
  if (hero) {
    const portrait = `Art/UI/InGame/Icon_Character/Icon_Character_${hero}`;
    if (exists(portrait)) return { path: portrait, crop: false };
    const bust = `Art/UI/InGame/Img_Character/Mini/Img_Character_Mini_${hero}`;
    if (exists(bust)) return { path: bust, crop: true };
  }
  if (item.category === 'mount' && !item.iconPath && vehicleImages.has(cid)) {
    for (const [other, image] of vehicleImages) {
      const sibling = allItems[other];
      if (other !== cid && image === vehicleImages.get(cid) && sibling?.iconPath && exists(sibling.iconPath)) {
        return { path: sibling.iconPath, crop: false };
      }
    }
  }
  return null;
}

const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
const extra = JSON.parse(readFileSync(extraPath, 'utf8'));
// items.json wins for a CID in both files, as in the catalog loader.
const allItems = { ...extra.items, ...catalog.items };
const sources = new Map(); // "path|crop" -> { path, crop, cell }
const placed = new Map(); // item CID -> source key
const missing = [];
for (const [cid, item] of Object.entries(allItems)) {
  const source = iconSource(cid, item);
  if (!source) {
    missing.push(`${cid} ${item.en}: ${item.iconPath ?? (heroImages.get(cid) || 'no icon in the game tables')}`);
    continue;
  }
  const key = `${source.path}|${source.crop}`;
  placed.set(cid, key);
  sources.set(key, { ...source, cell: 0 });
}

// Skill icons have no fallbacks; scripts/gen-catalog-extras.mjs already
// checked that each names a texture.
const skills = JSON.parse(readFileSync(skillsPath, 'utf8'));
const skillSlots = [...Object.values(skills.heroes).flat(), ...Object.values(skills.effects)];
for (const slot of skillSlots) {
  if (!exists(slot.iconPath)) fail(`skill icon ${slot.iconPath} is not in the export`);
  sources.set(`${slot.iconPath}|false`, { path: slot.iconPath, crop: false, cell: 0 });
}

// The trait emblems, the grade star and each costume's switched hero portrait
// from crates/core/data/game.json (scripts/gen-game-data.mjs). A costume whose
// portrait the game does not ship keeps no icon, and the hero's own shows.
const gameDataPath = new URL('../crates/core/data/game.json', import.meta.url);
const game = JSON.parse(readFileSync(gameDataPath, 'utf8'));
const gameIcons = [...Object.values(game.traits), game.starIcon];
for (const icon of gameIcons) {
  if (!exists(icon.iconPath)) fail(`game icon ${icon.iconPath} is not in the export`);
}
for (const costume of Object.values(game.costumes)) {
  if (costume.iconPath && exists(costume.iconPath)) gameIcons.push(costume);
  else if (costume.iconPath) missing.push(`costume portrait ${costume.iconPath}`);
}
for (const icon of gameIcons) sources.set(`${icon.iconPath}|false`, { path: icon.iconPath, crop: false, cell: 0 });

// Cells in game-path order, so a rerun on the same export gives the same sheet.
const ordered = [...sources.keys()].sort();
for (const [index, key] of ordered.entries()) sources.get(key).cell = index + 1;
const sheetRows = Math.ceil((ordered.length + 1) / COLUMNS);

const tiles = await Promise.all(
  ordered.map(async (key) => {
    const { path, crop, cell } = sources.get(key);
    const input = await sharp(join(assetsDir, `${path}.png`))
      .resize(CELL, CELL, {
        fit: crop ? 'cover' : 'contain',
        position: 'top',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        kernel: 'lanczos3',
      })
      .png()
      .toBuffer();
    return { input, left: (cell % COLUMNS) * CELL, top: Math.floor(cell / COLUMNS) * CELL };
  }),
);

const sheet = await sharp({
  create: { width: COLUMNS * CELL, height: sheetRows * CELL, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite(tiles)
  .webp({ quality: 90, alphaQuality: 100, effort: 6 })
  .toBuffer();
writeFileSync(spritePath, sheet);

for (const [cid, item] of [...Object.entries(catalog.items), ...Object.entries(extra.items)]) {
  const key = placed.get(cid);
  const cell = key ? sources.get(key).cell : 0;
  item.x = -(cell % COLUMNS) * CELL;
  item.y = -Math.floor(cell / COLUMNS) * CELL;
}
for (const icon of gameIcons) {
  const cell = sources.get(`${icon.iconPath}|false`).cell;
  icon.x = -(cell % COLUMNS) * CELL;
  icon.y = -Math.floor(cell / COLUMNS) * CELL;
}
writeFileSync(gameDataPath, `${JSON.stringify(game)}\n`);
for (const slot of skillSlots) {
  const cell = sources.get(`${slot.iconPath}|false`).cell;
  slot.x = -(cell % COLUMNS) * CELL;
  slot.y = -Math.floor(cell / COLUMNS) * CELL;
}
writeFileSync(skillsPath, `${JSON.stringify(skills, null, 2)}\n`);
catalog.iconSize = CELL;
catalog._source =
  "Item names datamined from the game's own GameItemData/StringData (paks). Icons are the game's own textures, packed by scripts/gen-icons.mjs from the export described in docs/game-assets.md.";
writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
writeFileSync(extraPath, `${JSON.stringify(extra, null, 2)}\n`);

const GRADES = ['normal', 'superior', 'rare', 'epic', 'legendary'];
const assetsOut = new URL('../apps/desktop/src/assets/', import.meta.url);
for (const [index, grade] of GRADES.entries()) {
  for (const [kind, texture, width] of [
    ['tile', 'Frame_Item_Grade', 194],
    ['card', 'Frame_Grade', 460],
  ]) {
    const path = `Art/UI/InGame/Frame/${texture}_0${index + 1}`;
    if (!exists(path)) fail(`grade texture ${path} is not in the export`);
    const out = await sharp(join(assetsDir, `${path}.png`))
      .resize({ width, kernel: 'lanczos3' })
      .webp({ quality: 90, alphaQuality: 100, effort: 6 })
      .toBuffer();
    writeFileSync(new URL(`grade-${kind}-${grade}.webp`, assetsOut), out);
  }
}

// The rings as their compiled shaders draw them (docs/game-assets.md, Skill
// colours). Each ring adds a noise texture, rotating about the tile centre, to
// its MainTX colour, multiplies the sum by the effect colour twice (the
// material, then Slate), encodes it to sRGB and blends it on display values:
// the glow translucent, the line and signal additive. Textures are sampled the
// way the GPU does: RGB decoded from sRGB, bilinear, wrap addressing. The
// signal ring's box is inset 8 of the slot's 166 units on each side, at render
// opacity 0.85, which reaches the shader as a byte.
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => (c < 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const encode = (c) => Math.min(1, Math.max(0, toSrgb(c)));
async function texture(file) {
  if (!existsSync(file)) fail(`texture ${file} is not in the export`);
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const texel = new Float64Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      texel[index * 4 + channel] = toLinear(data[index * 4 + channel] / 255);
    }
    texel[index * 4 + 3] = data[index * 4 + 3] / 255;
  }
  /** Bilinear with wrap addressing, texel centres at (i + 0.5) / size. */
  return (u, v, out) => {
    const x = u * width - 0.5;
    const y = v * height - 0.5;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const i0 = ((x0 % width) + width) % width;
    const i1 = (i0 + 1) % width;
    const j0 = ((y0 % height) + height) % height;
    const j1 = (j0 + 1) % height;
    for (let channel = 0; channel < 4; channel += 1) {
      const at = (i, j) => texel[(j * width + i) * 4 + channel];
      const top = at(i0, j0) + (at(i1, j0) - at(i0, j0)) * fx;
      const bottom = at(i0, j1) + (at(i1, j1) - at(i0, j1)) * fx;
      out[channel] = top + (bottom - top) * fy;
    }
    return out;
  };
}
const ringTexture = (path) => texture(join(fxDir, `Art/FX/textures/${path}.png`));
const grad10a = await ringTexture('gradient/fxt_grad10a');
const RINGS = {
  glow: {
    noise: await ringTexture('noise/fxt_noise012'),
    main: await ringTexture('ring/fxt_ring13b'),
    ...{ additive: false, tile: 0.8, vOffset: -0.3, speed: -0.05, noisePow: 1, noiseStr: 1, mainStr: 1, mainOpa: 0.5 },
    ...{ opacity: 1, inset: 0 },
  },
  line: {
    noise: grad10a,
    main: await ringTexture('ring/fxt_ring13c'),
    ...{ additive: true, tile: 1, vOffset: 0, speed: -0.25, noisePow: 3, noiseStr: 3, mainStr: 0.6, mainOpa: 0.5 },
    ...{ opacity: 1, inset: 0 },
  },
  signal: {
    noise: grad10a,
    main: await texture(join(assetsDir, 'Art/UI/InGame/Mask/Mask_Fx_Skill_Signal.png')),
    ...{ additive: true, tile: 1, vOffset: 0, speed: 0.5, noisePow: 1, noiseStr: 3, mainStr: 1, mainOpa: 0.5 },
    ...{ opacity: 0.85, inset: 8 / 166 },
  },
};
// 120 samples over 20 s cover whole turns of all three rings (20, 4 and 2 s).
const PERIOD = 20;
const TIME_SAMPLES = 120;
const RING_SIZE = 256;
/**
 * The colour the ring shaders see for an effect colour: the game reinterprets
 * the bytes as linear (bytes / 255), Slate packs that into an sRGB vertex byte
 * and the vertex shader decodes it again.
 */
function vertexColour(hex) {
  return [1, 3, 5].map((at) => {
    const linear = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return toLinear(Math.floor(toSrgb(linear) * 255.999) / 255);
  });
}
/**
 * One ring for each effect colour, averaged over its motion, covering the
 * slot's box. The glow's alpha does not move, so its layer is straight colour
 * (the mean encoded colour) and that alpha, drawn with normal blending. The
 * additive rings' layers hold the mean added light as straight colour with
 * alpha = its brightest channel, so that plus-lighter adds exactly that light.
 */
function ringLayers(ring, colours) {
  const vas = Math.trunc(ring.opacity * 255.999) / 255;
  const out = colours.map(() => Buffer.alloc(RING_SIZE * RING_SIZE * 4));
  const sum = colours.map(() => [0, 0, 0]);
  const noise = [0, 0, 0, 0];
  const main = [0, 0, 0, 0];
  const base = [0, 0, 0];
  const half = ring.tile / 2;
  for (let y = 0; y < RING_SIZE; y += 1) {
    for (let x = 0; x < RING_SIZE; x += 1) {
      const u = ((x + 0.5) / RING_SIZE - ring.inset) / (1 - 2 * ring.inset);
      const v = ((y + 0.5) / RING_SIZE - ring.inset) / (1 - 2 * ring.inset);
      if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
      ring.main(u, v, main);
      const opacity = Math.min(1, Math.max(0, main[3] * ring.mainOpa * vas));
      for (const total of sum) total.fill(0);
      const px = u * ring.tile - half;
      const py = (v + ring.vOffset) * ring.tile - half;
      for (let k = 0; k < TIME_SAMPLES; k += 1) {
        const angle = 2 * Math.PI * ring.speed * ((k * PERIOD) / TIME_SAMPLES);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        ring.noise(px * cos - py * sin + half, px * sin + py * cos + half, noise);
        for (let channel = 0; channel < 3; channel += 1) {
          const n = noise[channel] > 0 ? noise[channel] ** ring.noisePow : 0;
          base[channel] = (ring.noiseStr * n + main[channel]) * ring.mainStr;
        }
        for (const [index, colour] of colours.entries()) {
          for (let channel = 0; channel < 3; channel += 1) {
            const emissive = Math.max(0, base[channel] * colour[channel]);
            sum[index][channel] += ring.additive
              ? encode(emissive * opacity * colour[channel] * vas)
              : encode(emissive * colour[channel]);
          }
        }
      }
      const at = (y * RING_SIZE + x) * 4;
      for (const [index, total] of sum.entries()) {
        const mean = total.map((value) => value / TIME_SAMPLES);
        const alpha = ring.additive ? Math.max(...mean) : opacity * vas;
        for (let channel = 0; channel < 3; channel += 1) {
          const straight = ring.additive
            ? alpha > 1e-4
              ? mean[channel] / alpha
              : 0
            : alpha > 1e-4
              ? mean[channel]
              : 0;
          out[index][at + channel] = Math.round(Math.min(1, straight) * 255);
        }
        out[index][at + 3] = Math.round(Math.min(1, alpha) * 255);
      }
    }
  }
  return out;
}
const effectColours = { ATTACK: skills.attackColor };
for (const [key, effect] of Object.entries(skills.effects)) effectColours[key] = effect.color;
const skillLayers = {
  'skill-disc-circle': sharp(join(assetsDir, 'Art/UI/InGame/Btn/Btn_Skill_Info_Bg_02.png')),
  'skill-disc-diamond': sharp(join(assetsDir, 'Art/UI/InGame/Btn/Btn_Skill_Info_Bg_05.png')),
};
const colours = Object.values(effectColours).map(vertexColour);
for (const [name, ring] of Object.entries(RINGS)) {
  for (const [index, pixels] of ringLayers(ring, colours).entries()) {
    const effect = Object.keys(effectColours)[index].toLowerCase();
    skillLayers[`skill-ring-${name}-${effect}`] = sharp(pixels, {
      raw: { width: RING_SIZE, height: RING_SIZE, channels: 4 },
    });
  }
}
for (const [name, image] of Object.entries(skillLayers)) {
  // The rings are lossless: lossy coding shifts their faint, colour-divided light.
  const lossless = name.startsWith('skill-ring-');
  const out = await image
    .webp(lossless ? { lossless, effort: 6 } : { quality: 90, alphaQuality: 100, effort: 6 })
    .toBuffer();
  writeFileSync(new URL(`${name}.webp`, assetsOut), out);
}

console.log(
  `packed ${ordered.length} icons for ${placed.size} of ${Object.keys(allItems).length} items and ${skillSlots.length} skill slots and effects into ${COLUMNS}x${sheetRows} cells of ${CELL}px (${(sheet.length / 1048576).toFixed(1)} MB)`,
);
if (missing.length > 0) {
  console.log(`${missing.length} items have no icon in the export:`);
  for (const line of missing) console.log(`  ${line}`);
}
