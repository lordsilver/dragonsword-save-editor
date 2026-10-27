// Editor skill slots at the game's 165 px, scored against the 5-frame averages of Desktop/skills.
//   node slots.mjs page <repo> <outDir>            writes old.html and new.html (one slot per cell)
//   node slots.mjs score <repo> <assetsDir> <shot.png> <report.tsv>   mean CIELAB dE per slot
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const [mode, repo] = process.argv.slice(2);
const sharp = createRequire(`${repo}/package.json`)('sharp');
const skills = JSON.parse(readFileSync(`${repo}/crates/core/data/skills.json`, 'utf8'));
const HEROES = [
  ['10022', 'Theresia', ['04_574', '06_273', '08_223', '10_189', '11_989']],
  ['10006', 'Aria', ['18_861', '20_561', '22_094', '23_294', '24_462']],
  ['10007', 'Johnny', ['28_570', '29_786', '30_903', '32_086', '33_320']],
  ['10002', 'Lute', ['36_753', '37_820', '38_836', '39_853', '40_886']],
  ['10003', 'Castella', ['44_353', '45_419', '46_469', '47_268', '48_220']],
  ['10004', 'Reina', ['53_753', '54_756', '55_786', '57_020', '58_203']],
];
const SLOT = 165,
  PITCH = 185,
  CELL = 128;
const CENTRES = [
  [720, 175],
  [585, 330],
  [455, 485],
  [585, 640],
  [1218, 340],
  [1345, 492],
  [1218, 645],
  [1085, 795],
];
const slotsOf = (cid) =>
  skills.heroes[cid].filter((s) => s.order >= 2 && s.order <= 8).sort((a, b) => a.order - b.order);

if (mode === 'page') {
  const out = process.argv[4];
  for (const version of ['old', 'new']) {
    let cells = '';
    for (const [row, [cid]] of HEROES.entries())
      for (const [col, s] of slotsOf(cid).entries()) {
        const effect = s.effect ?? 'ATTACK';
        const color = s.effect ? skills.effects[s.effect].color : skills.attackColor;
        const k = SLOT / CELL;
        const ring = (css) => `<i style="${css}"></i>`;
        const mask = (m) =>
          `-webkit-mask-image:url(old-skill-ring-${m}.webp);mask-image:url(old-skill-ring-${m}.webp);mask-size:100% 100%;-webkit-mask-size:100% 100%;background-color:${color};`;
        const rings =
          version === 'old'
            ? s.signal
              ? ring(`${mask('signal')}mix-blend-mode:plus-lighter`)
              : ring(
                  `${mask('glow')}background-image:url(old-skill-ring-glow-shade.webp);background-size:100% 100%;background-blend-mode:multiply`,
                ) + ring(`${mask('line')}mix-blend-mode:plus-lighter`)
            : (s.signal ? ['signal'] : ['glow', 'line'])
                .map((r) =>
                  ring(
                    `background:url(skill-ring-${r}-${effect.toLowerCase()}.webp) 0 0/100% 100%;mix-blend-mode:${r === 'glow' ? 'normal' : 'plus-lighter'}`,
                  ),
                )
                .join('');
        cells +=
          `<b style="left:${col * PITCH + 10}px;top:${row * PITCH + 10}px">` +
          `<i style="background:url(skill-disc-${s.signal ? 'diamond' : 'circle'}.webp) center/contain no-repeat"></i>` +
          `<i style="background:url(sprite.webp) ${s.x * k}px ${s.y * k}px/${32 * CELL * k}px auto no-repeat"></i>${rings}</b>`;
      }
    writeFileSync(
      `${out}/${version}.html`,
      `<!doctype html><meta charset=utf-8><style>html,body{margin:0;background:#000}b{position:absolute;width:${SLOT}px;height:${SLOT}px;isolation:isolate;display:block}i{position:absolute;inset:0;display:block}</style>${cells}`,
    );
  }
} else {
  // Score: one editor screenshot against every hero's 5-frame average.
  const [assetsDir, editorShot, reportTsv, shotDir] = process.argv.slice(4);
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const lab = (r, g, b) => {
    const [R, G, B] = [r, g, b].map(lin);
    const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047,
      Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B,
      Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  };
  const load = async (file) => {
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data, w: info.width, h: info.height };
  };
  const bilinear = (img, x, y, c) => {
    x -= 0.5;
    y -= 0.5;
    const x0 = Math.floor(x),
      y0 = Math.floor(y),
      fx = x - x0,
      fy = y - y0;
    const at = (i, j) =>
      img.data[(Math.min(img.h - 1, Math.max(0, j)) * img.w + Math.min(img.w - 1, Math.max(0, i))) * 4 + c];
    return (
      (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) +
      (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy
    );
  };
  const discs = [
    await load(`${assetsDir}/Art/UI/InGame/Btn/Btn_Skill_Info_Bg_02.png`),
    await load(`${assetsDir}/Art/UI/InGame/Btn/Btn_Skill_Info_Bg_05.png`),
  ];
  const discR = discs.map((d) => {
    let r = 0;
    for (let i = 0; i < 400; i++) {
      const t = i / 800;
      if (
        bilinear(d, (0.5 + t) * d.w, 0.5 * d.h, 3) >= 0.98 * 255 ||
        bilinear(d, 0.5 * d.w, (0.5 + t) * d.h, 3) >= 0.98 * 255
      )
        r = t;
    }
    return r;
  });
  const place = Object.fromEntries(
    readFileSync(reportTsv, 'utf8')
      .trim()
      .split('\n')
      .slice(1)
      .map((l) => l.split('\t'))
      .map((c) => [`${c[0]}/${c[1]}`, [Number(c[5]), Number(c[6]), Number(c[9]), Number(c[10])]]),
  );
  const editor = await load(editorShot);
  const all = [],
    rows = [];
  for (const [row, [cid, hero, stamps]] of HEROES.entries()) {
    const frames = await Promise.all(
      stamps.map((s) => load(`${shotDir}/DSClient-Win64-Shipping_2026_10_27_15_39_${s}.png`)),
    );
    const game = { w: frames[0].w, h: frames[0].h, data: new Float64Array(frames[0].data.length) };
    for (const fr of frames) for (let i = 0; i < fr.data.length; i++) game.data[i] += fr.data[i] / frames.length;
    const scale = game.w / 2000;
    for (const [col, s] of slotsOf(cid).entries()) {
      const [dx, dy, refEditor, refLayers] = place[`${hero}/${s.order}`];
      const disc = discs[s.signal ? 1 : 0],
        rPx = discR[s.signal ? 1 : 0] * SLOT;
      const cx = CENTRES[s.order - 1][0] * scale + dx,
        cy = CENTRES[s.order - 1][1] * scale + dy;
      let err = 0,
        n = 0;
      for (let py = Math.floor(cy - rPx); py <= cy + rPx; py++)
        for (let px = Math.floor(cx - rPx); px <= cx + rPx; px++) {
          const ox = px + 0.5 - cx,
            oy = py + 0.5 - cy,
            u = ox / SLOT + 0.5,
            v = oy / SLOT + 0.5;
          if (bilinear(disc, u * disc.w, v * disc.h, 3) < 0.98 * 255) continue;
          if (
            oy > 0.55 * rPx ||
            (ox > 0.45 * rPx && oy < -0.45 * rPx) ||
            (s.signal && ox < -0.2 * rPx && oy < -0.2 * rPx)
          )
            continue;
          const o = (py * game.w + px) * 4;
          const g = lab(game.data[o] / 255, game.data[o + 1] / 255, game.data[o + 2] / 255);
          const ex = col * PITCH + 10 + u * SLOT,
            ey = row * PITCH + 10 + v * SLOT;
          const e = lab(...[0, 1, 2].map((c) => bilinear(editor, ex, ey, c) / 255));
          err += Math.hypot(g[0] - e[0], g[1] - e[1], g[2] - e[2]);
          n++;
        }
      const dE = err / n;
      all.push([s.signal, dE]);
      rows.push(
        `${hero.padEnd(9)} ${s.order} ${s.nameEn.padEnd(22)} ${(s.effect ?? 'ATTACK').padEnd(7)} ${s.signal ? 'diamond' : 'circle '} dE ${dE.toFixed(2)}  (PC: 6f8272b ${refEditor}, layers ${refLayers})`,
      );
    }
  }
  const mean = (xs) => (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2);
  console.log(rows.join('\n'));
  console.log(
    `mean ${mean(all.map((x) => x[1]))}  circles ${mean(all.filter((x) => !x[0]).map((x) => x[1]))}  diamonds ${mean(all.filter((x) => x[0]).map((x) => x[1]))}  (${all.length} slots)`,
  );
}
