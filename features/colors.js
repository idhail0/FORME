// Fashion color palette, color naming, and helpers shared by the upload flow
// (auto-detected color) and the look score (color harmony).

export const PALETTE = [
  { name: "Black", ar: "أسود", hex: "#1c1c1e", neutral: true },
  { name: "Charcoal", ar: "فحمي", hex: "#3a3b3f", neutral: true },
  { name: "Grey", ar: "رمادي", hex: "#8c8d91", neutral: true },
  { name: "Silver", ar: "فضي", hex: "#c4c6ca", neutral: true },
  { name: "White", ar: "أبيض", hex: "#f6f5f2", neutral: true },
  { name: "Ivory", ar: "عاجي", hex: "#efe8d8", neutral: true },
  { name: "Cream", ar: "كريمي", hex: "#e8dcc2", neutral: true },
  { name: "Beige", ar: "بيج", hex: "#d6c3a0", neutral: true },
  { name: "Sand", ar: "رملي", hex: "#c9b38c", neutral: true },
  { name: "Camel", ar: "جملي", hex: "#b88a55", neutral: true },
  { name: "Tan", ar: "بني فاتح", hex: "#a8805a", neutral: true },
  { name: "Brown", ar: "بني", hex: "#6f4a32", neutral: true },
  { name: "Chocolate", ar: "شوكولاتة", hex: "#46301f", neutral: true },
  { name: "Navy", ar: "كحلي", hex: "#1f2a44", neutral: true },
  { name: "Denim", ar: "جينز", hex: "#4a6890", neutral: true },
  { name: "Light blue", ar: "أزرق فاتح", hex: "#9dbbd9" },
  { name: "Blue", ar: "أزرق", hex: "#2f5fb3" },
  { name: "Teal", ar: "تركوازي غامق", hex: "#1f6f6d" },
  { name: "Green", ar: "أخضر", hex: "#2f7a43" },
  { name: "Olive", ar: "زيتي", hex: "#6b6b34", neutral: true },
  { name: "Sage", ar: "أخضر مريمي", hex: "#a3b18f" },
  { name: "Khaki", ar: "كاكي", hex: "#b5a26b", neutral: true },
  { name: "Yellow", ar: "أصفر", hex: "#e7c84a" },
  { name: "Mustard", ar: "خردلي", hex: "#c99a2e" },
  { name: "Orange", ar: "برتقالي", hex: "#e07a2e" },
  { name: "Rust", ar: "صدئي", hex: "#a8512c" },
  { name: "Terracotta", ar: "طوبي", hex: "#c46a4a" },
  { name: "Red", ar: "أحمر", hex: "#c62c2c" },
  { name: "Burgundy", ar: "عنابي", hex: "#6e1f2c" },
  { name: "Pink", ar: "زهري", hex: "#e48aa8" },
  { name: "Blush", ar: "وردي فاتح", hex: "#e9c2bd" },
  { name: "Purple", ar: "بنفسجي", hex: "#6b3f8f" },
  { name: "Lavender", ar: "لافندر", hex: "#b7a6d6" },
];

const ALIASES = {
  "off white": "Ivory", "off-white": "Ivory", oat: "Beige", oatmeal: "Beige", nude: "Beige",
  espresso: "Chocolate", "dark chocolate": "Chocolate", "dark brown": "Chocolate", coffee: "Brown",
  "vintage blue": "Denim", indigo: "Denim", "sky blue": "Light blue", "baby blue": "Light blue",
  maroon: "Burgundy", wine: "Burgundy", gray: "Grey", "dark grey": "Charcoal", "dark gray": "Charcoal",
  gold: "Mustard", mint: "Sage", lilac: "Lavender", coral: "Terracotta", rose: "Blush",
};

export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex([r, g, b]) {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

// sRGB -> CIELAB (D65), for perceptual color distance.
export function rgbToLab([r, g, b]) {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
  const y = f(R * 0.2126 + G * 0.7152 + B * 0.0722);
  const z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
export function labToLch([L, a, b]) {
  return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
}

const PALETTE_LAB = PALETTE.map((p) => ({ ...p, lab: rgbToLab(hexToRgb(p.hex)) }));

export function nearestColor(rgb, { lightShare = 0 } = {}) {
  const lab = rgbToLab(rgb);
  // Studio shadows make white garments average out grey; trust the lit pixels.
  const chroma = Math.hypot(lab[1], lab[2]);
  if (chroma < 14 && lab[0] > 42 && lightShare > 0.2) return PALETTE_LAB.find((p) => p.name === (lab[2] > 4 ? "Ivory" : "White"));
  let best = PALETTE_LAB[0], bestD = Infinity;
  for (const p of PALETTE_LAB) {
    const d = (lab[0] - p.lab[0]) ** 2 * 0.7 + (lab[1] - p.lab[1]) ** 2 + (lab[2] - p.lab[2]) ** 2;
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

export function findColorByName(name) {
  if (!name) return null;
  const key = String(name).trim().toLowerCase();
  const alias = ALIASES[key];
  const direct = PALETTE.find((p) => p.name.toLowerCase() === (alias || key).toLowerCase() || p.ar === name.trim());
  if (direct) return direct;
  // "Dark chocolate leather" -> first palette word found inside the text
  const hit = PALETTE.find((p) => key.includes(p.name.toLowerCase())) ||
    Object.entries(ALIASES).filter(([k]) => key.includes(k)).map(([, v]) => PALETTE.find((p) => p.name === v))[0];
  return hit || null;
}

export function colorLabel(name, language) {
  const p = findColorByName(name);
  return p ? (language === "ar" ? p.ar : p.name) : name;
}

// Dominant colors of the opaque pixels of an RGBA buffer (k-means in Lab space).
export function dominantColors(data, { maxSamples = 6000, k = 4 } = {}) {
  const px = [];
  const step = Math.max(1, Math.floor(data.length / 4 / maxSamples));
  for (let i = 0; i < data.length; i += 4 * step) {
    if (data[i + 3] < 200) continue;
    px.push([data[i], data[i + 1], data[i + 2]]);
  }
  if (!px.length) return [];
  const labs = px.map(rgbToLab);
  let centers = [];
  for (let c = 0; c < k; c++) centers.push(labs[Math.floor(((c + 0.5) / k) * labs.length)]);
  let assign = new Array(labs.length).fill(0);
  for (let iter = 0; iter < 10; iter++) {
    assign = labs.map((l) => {
      let bi = 0, bd = Infinity;
      centers.forEach((c, ci) => { const d = (l[0] - c[0]) ** 2 + (l[1] - c[1]) ** 2 + (l[2] - c[2]) ** 2; if (d < bd) { bd = d; bi = ci; } });
      return bi;
    });
    centers = centers.map((c, ci) => {
      const members = labs.filter((_, i) => assign[i] === ci);
      if (!members.length) return c;
      return [0, 1, 2].map((d) => members.reduce((s, m) => s + m[d], 0) / members.length);
    });
  }
  return centers.map((_, ci) => {
    const members = px.filter((_, i) => assign[i] === ci);
    if (!members.length) return null;
    const rgb = [0, 1, 2].map((d) => members.reduce((s, m) => s + m[d], 0) / members.length);
    const memberLabs = labs.filter((_, i) => assign[i] === ci);
    const lightShare = memberLabs.filter((l) => l[0] > 78).length / memberLabs.length;
    return { rgb, share: members.length / px.length, lightShare };
  }).filter(Boolean).sort((a, b) => b.share - a.share);
}

// Color descriptor used for harmony scoring.
export function describeColor(hexOrName) {
  const p = typeof hexOrName === "string" && hexOrName.startsWith("#") ? null : findColorByName(hexOrName);
  const hex = p ? p.hex : hexOrName;
  if (!hex || !String(hex).startsWith("#")) return null;
  const [L, C, H] = labToLch(rgbToLab(hexToRgb(hex)));
  const neutral = p ? Boolean(p.neutral) : C < 18;
  return { hex, L, C, H, neutral, name: p ? p.name : null };
}

// Read an item's color from its photo when the name is unknown (cached).
const imageColorCache = new Map();
export function sampleImageColor(src) {
  if (!src) return Promise.resolve(null);
  if (imageColorCache.has(src)) return imageColorCache.get(src);
  const job = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 64;
        const canvas = document.createElement("canvas");
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        // ignore near-white studio backgrounds and keep the center-weighted subject
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
          const i = (y * size + x) * 4;
          const edge = Math.min(x, y, size - 1 - x, size - 1 - y) < size * 0.12;
          const bright = data[i] > 232 && data[i + 1] > 232 && data[i + 2] > 232;
          if (edge || bright) data[i + 3] = 0;
        }
        const [top] = dominantColors(data, { k: 3 });
        resolve(top ? rgbToHex(top.rgb) : null);
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
  imageColorCache.set(src, job);
  return job;
}
