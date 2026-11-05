// 2D garment fitting for the mannequin.
// Reads a transparent cutout's silhouette, places it by body landmarks
// (shoulders, waist, feet) instead of a fixed box, and gently tapers the
// torso rows toward the mannequin's waist so the piece reads as worn.
// Everything runs on a canvas in the browser; results are cached per image.

// Mannequin landmarks, in the 400 x 900 units used by mannequin.js.
export const BODY = {
  centerX: 200,
  neckY: 170,        // collar line
  shoulderW: 150,    // shoulder point to shoulder point
  waistY: 340,
  hipTopY: 414,      // where trousers sit
  hipW: 112,
  ankleY: 800,
  floorY: 824,
};

// Half-width of the body at a given height (torso, then both legs together).
const PROFILE = [[170, 30], [196, 74], [262, 70], [300, 58], [340, 42], [372, 47], [430, 55], [460, 52], [600, 44], [700, 37], [800, 30]];
function bodyHalfWidth(y) {
  if (y <= PROFILE[0][0]) return PROFILE[0][1];
  for (let i = 1; i < PROFILE.length; i++) {
    const [y1, w1] = PROFILE[i];
    if (y <= y1) {
      const [y0, w0] = PROFILE[i - 1];
      return w0 + ((w1 - w0) * (y - y0)) / (y1 - y0);
    }
  }
  return PROFILE[PROFILE.length - 1][1];
}

// How each kind of piece is placed and how much it hugs the body (0 = boxy, 1 = skin-tight).
const RULES = {
  Tops: { ease: 1.1, hug: 0.42, top: BODY.neckY, taper: [0.42, 1] },
  Outerwear: { ease: 1.22, hug: 0.22, top: BODY.neckY - 6, taper: [0.45, 1] },
  Dresses: { ease: 1.06, hug: 0.45, top: BODY.neckY, taper: [0.18, 0.4] },
  Bottoms: { ease: 1.12, hug: 0, top: BODY.hipTopY },
  Shoes: { width: 112 },
};

const MAX_SIDE = 900;
const cache = new Map();

async function loadBitmap(src) {
  const res = await fetch(src, { mode: "cors", credentials: "omit" });
  if (!res.ok) throw new Error("image " + res.status);
  return createImageBitmap(await res.blob());
}

// Width of the solid run through the garment's middle on every row, so arms or
// straps separated by a gap don't count as body width.
function rowProfile(alpha, w, h, cx) {
  const rows = new Array(h);
  for (let y = 0; y < h; y++) {
    const off = y * w;
    let c = Math.round(cx);
    if (alpha[off + c] < 40) {
      // the center column can be empty (e.g. between trouser legs) — use the widest run instead
      let best = null, start = -1;
      for (let x = 0; x <= w; x++) {
        const on = x < w && alpha[off + x] >= 40;
        if (on && start < 0) start = x;
        if (!on && start >= 0) { if (!best || x - start > best[1] - best[0]) best = [start, x]; start = -1; }
      }
      rows[y] = best ? { l: best[0], r: best[1], c: (best[0] + best[1]) / 2, w: best[1] - best[0] } : null;
      continue;
    }
    let l = c, r = c;
    while (l > 0 && alpha[off + l - 1] >= 40) l--;
    while (r < w - 1 && alpha[off + r + 1] >= 40) r++;
    rows[y] = { l, r: r + 1, c: (l + r + 1) / 2, w: r + 1 - l };
  }
  return rows;
}

// Robust row measurement: median width over a band of rows around fraction f.
function bandWidth(rows, f, span = 0.06) {
  const h = rows.length, a = Math.floor(h * Math.max(0, f - span)), b = Math.ceil(h * Math.min(1, f + span));
  const ws = rows.slice(a, b).filter(Boolean).map((r) => r.w).sort((x, y) => x - y);
  return ws.length ? ws[Math.floor(ws.length / 2)] : 0;
}
function bandCenter(rows, f, span = 0.08) {
  const h = rows.length, a = Math.floor(h * Math.max(0, f - span)), b = Math.ceil(h * Math.min(1, f + span));
  const cs = rows.slice(a, b).filter(Boolean).map((r) => r.c);
  return cs.length ? cs.reduce((s, c) => s + c, 0) / cs.length : null;
}

function smooth(values, radius) {
  return values.map((_, i) => {
    let s = 0, n = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(values.length - 1, i + radius); j++) { s += values[j]; n++; }
    return s / n;
  });
}

async function computeFit(src, category) {
  const bitmap = await loadBitmap(src);
  const k = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * k)), h = Math.max(1, Math.round(bitmap.height * k));
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = w; srcCanvas.height = h;
  const sctx = srcCanvas.getContext("2d", { willReadFrequently: true });
  sctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const rgba = sctx.getImageData(0, 0, w, h).data;
  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = rgba[i * 4 + 3];

  const rule = RULES[category];
  if (!rule) return null; // accessories keep their slots

  if (category === "Shoes") {
    const scale = rule.width / w;
    return { url: null, box: [BODY.centerX - (w * scale) / 2, BODY.floorY - h * scale, w * scale, h * scale] };
  }

  const midCol = w / 2;
  const rows = rowProfile(alpha, w, h, midCol);
  let scale, cx, top = rule.top;

  if (category === "Bottoms") {
    const waist = bandWidth(rows, 0.04, 0.04) || w;
    scale = (BODY.hipW * rule.ease) / waist;
    // never longer than the legs
    scale = Math.min(scale, (BODY.floorY - BODY.hipTopY) / h);
    cx = bandCenter(rows, 0.05) ?? midCol;
  } else {
    // Torso width measured below the armholes (sleeves on a flat lay usually end above this).
    const torsoAt = category === "Dresses" ? 0.3 : 0.62;
    const torso = bandWidth(rows, torsoAt) || w;
    const shoulders = bandWidth(rows, 0.12) || w;
    const fromTorso = (BODY.shoulderW * rule.ease * 0.9) / torso;
    const fromShoulders = (BODY.shoulderW * rule.ease * 1.15) / shoulders;
    scale = Math.sqrt(fromTorso * fromShoulders); // geometric mean: robust to sleeves spread or tucked
    const minH = category === "Dresses" ? 380 : 190, maxH = category === "Dresses" ? 680 : category === "Outerwear" ? 470 : 360;
    scale = Math.max(minH / h, Math.min(maxH / h, scale));
    cx = bandCenter(rows, torsoAt) ?? midCol;
  }

  // Taper: pull torso rows toward the body's silhouette (hug) — a fitted, worn look.
  let rowScale = new Array(h).fill(1);
  if (rule.hug > 0 && rule.taper) {
    const [fa, fb] = rule.taper;
    rowScale = rows.map((r, y) => {
      const f = y / h;
      if (!r || f < fa || f > fb) return 1;
      const bodyY = top + y * scale;
      const desired = bodyHalfWidth(bodyY) * 2 * rule.ease;
      const current = r.w * scale;
      const ratio = desired / current;
      const weight = Math.min(1, (f - fa) / 0.12) * Math.min(1, (fb - f) / 0.08 + 0.25); // ease in/out of the band
      return Math.max(0.84, Math.min(1.06, 1 + rule.hug * weight * (ratio - 1)));
    });
    rowScale = smooth(smooth(rowScale, 12), 12);
  }

  // Render the warped garment (row by row, scaled about the garment's center line).
  const pad = Math.ceil(w * 0.06);
  const out = document.createElement("canvas");
  out.width = w + pad * 2; out.height = h;
  const octx = out.getContext("2d");
  octx.imageSmoothingQuality = "high";
  for (let y = 0; y < h; y++) {
    const s = rowScale[y];
    if (s === 1) { octx.drawImage(srcCanvas, 0, y, w, 1, pad, y, w, 1); continue; }
    octx.drawImage(srcCanvas, 0, y, w, 1, pad + cx - cx * s, y, w * s, 1);
  }
  const blob = await new Promise((resolve) => out.toBlob(resolve, "image/png"));
  const url = URL.createObjectURL(blob);

  const boxW = out.width * scale, boxH = h * scale;
  const left = BODY.centerX - (pad + cx) * scale;
  return { url, box: [left, top, boxW, boxH] };
}

/** Returns a promise of { url, box:[x,y,w,h] } in mannequin units, or null to use the default slot. */
export function fitGarment(item) {
  if (!item?.cutout || !item.image) return Promise.resolve(null);
  const key = item.image + "|" + item.category;
  if (!cache.has(key)) cache.set(key, computeFit(item.image, item.category).catch(() => null));
  return cache.get(key);
}
