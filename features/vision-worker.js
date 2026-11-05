// Runs on a Web Worker so the page never freezes while the models work.
// 1. Background removal  — onnx-community/ormbg-ONNX (Apache-2.0), int8, ~42 MB
// 2. Garment type        — CLIP ViT-B/32 image encoder (MIT), 4-bit, ~60 MB, compared
//                          against text embeddings precomputed in garment-embeddings.json
// 3. Dominant color      — k-means on the cutout's opaque pixels
// Models download once and are cached by the browser (Cache Storage).
import { env, pipeline, AutoProcessor, CLIPVisionModelWithProjection, RawImage } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.min.js";
import { dominantColors, nearestColor, rgbToHex, rgbToLab, PALETTE } from "./colors.js";

// k-means often splits one light garment into lit / shadow / tinted slices; read
// them together so a white sneaker isn't named after its biggest shadow slice.
function lightNeutralGroup(clusters) {
  const members = clusters.filter((c) => {
    const [L, a, b] = rgbToLab(c.rgb);
    return Math.hypot(a, b) < 16 && L > 42;
  });
  const share = members.reduce((s, c) => s + c.share, 0);
  if (!members.length || share < 0.4) return null;
  const lit = members.reduce((s, c) => s + c.share * (c.lightShare || 0), 0) / share;
  if (lit < 0.2) return null;
  const brightest = members.slice().sort((x, y) => rgbToLab(y.rgb)[0] - rgbToLab(x.rgb)[0])[0];
  const warm = rgbToLab(brightest.rgb)[2] > 4;
  return { share, rgb: brightest.rgb, swatch: PALETTE.find((p) => p.name === (warm ? "Ivory" : "White")) };
}

env.allowLocalModels = false;
env.useBrowserCache = true;
// Multi-threaded WASM needs cross-origin isolation (COOP/COEP headers in vercel.json).
if (self.crossOriginIsolated && env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.numThreads = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
}

const BG_MODEL = "onnx-community/ormbg-ONNX";
const CLIP_MODEL = "Xenova/clip-vit-base-patch32";
const MAX_SIDE = 1400;

let modelsPromise = null;
const downloads = new Map();

function trackDownload(post) {
  return (event) => {
    if (event.status === "progress" && event.total) {
      downloads.set(event.file + event.name, { loaded: event.loaded, total: event.total });
      let loaded = 0, total = 0;
      for (const d of downloads.values()) { loaded += d.loaded; total += d.total; }
      post({ stage: "download", progress: total ? loaded / total : 0, loaded, total });
    }
  };
}

function loadModels(post) {
  if (!modelsPromise) {
    const progress_callback = trackDownload(post);
    modelsPromise = Promise.all([
      pipeline("background-removal", BG_MODEL, { dtype: "q8", device: "wasm", progress_callback }),
      AutoProcessor.from_pretrained(CLIP_MODEL, { progress_callback }),
      CLIPVisionModelWithProjection.from_pretrained(CLIP_MODEL, { dtype: "q4", device: "wasm", progress_callback }),
      fetch(new URL("./garment-embeddings.json", import.meta.url)).then((r) => r.json()),
    ]).then(([segmenter, processor, vision, embeddings]) => ({ segmenter, processor, vision, labels: embeddings.labels }))
      .catch((error) => { modelsPromise = null; throw error; });
  }
  return modelsPromise;
}

async function decode(blob) {
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, w, h);
  return new RawImage(new Uint8ClampedArray(data), w, h, 4);
}

// Trim fully transparent margins so the garment fills its box on the mannequin.
function trimToContent(rgba, w, h) {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (rgba[(y * w + x) * 4 + 3] > 24) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.02);
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

async function encode(canvas) {
  // WebP keeps transparency at a fraction of PNG's size; fall back where unsupported.
  try {
    const webp = await canvas.convertToBlob({ type: "image/webp", quality: 0.9 });
    if (webp.type === "image/webp") return webp;
  } catch {}
  return canvas.convertToBlob({ type: "image/png" });
}

function classify(labels, embeds) {
  const v = Array.from(embeds);
  const n = Math.hypot(...v);
  const scores = labels.map((l) => ({ label: l.label, category: l.category, s: 100 * l.e.reduce((a, x, i) => a + (x * v[i]) / n, 0) }));
  const max = Math.max(...scores.map((x) => x.s));
  const exps = scores.map((x) => Math.exp(x.s - max));
  const Z = exps.reduce((a, b) => a + b, 0);
  const byCategory = {};
  scores.forEach((x, i) => { byCategory[x.category] = (byCategory[x.category] || 0) + exps[i] / Z; });
  const ranked = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([category, p]) => ({ category, p }));
  const best = ranked[0].category;
  const label = scores.filter((x) => x.category === best).sort((a, b) => b.s - a.s)[0].label;
  return { category: best, label, confidence: ranked[0].p, alternatives: ranked.slice(1, 3) };
}

async function analyze(blob, post) {
  post({ stage: "download", progress: 0 });
  const { segmenter, processor, vision, labels } = await loadModels(post);

  post({ stage: "cutout", progress: 0.1 });
  const image = await decode(blob);
  const out = await segmenter(image);
  const cut = Array.isArray(out) ? out[0] : out; // RGBA with the background made transparent
  const rgba = cut.data;
  const box = trimToContent(rgba, cut.width, cut.height);
  if (!box) throw new Error("NO_SUBJECT");

  const full = new OffscreenCanvas(cut.width, cut.height);
  full.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(rgba), cut.width, cut.height), 0, 0);
  const cropped = new OffscreenCanvas(box.w, box.h);
  const cctx = cropped.getContext("2d");
  cctx.drawImage(full, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  const cutout = await encode(cropped);
  const coverage = (() => { let o = 0; for (let i = 3; i < rgba.length; i += 16) if (rgba[i] > 128) o++; return o / (rgba.length / 16); })();

  post({ stage: "detect", progress: 0.7 });
  // CLIP sees the garment on white, the way product photos look.
  const onWhite = new OffscreenCanvas(box.w, box.h);
  const wctx = onWhite.getContext("2d", { willReadFrequently: true });
  wctx.fillStyle = "#ffffff";
  wctx.fillRect(0, 0, box.w, box.h);
  wctx.drawImage(cropped, 0, 0);
  const white = wctx.getImageData(0, 0, box.w, box.h);
  const clipInput = new RawImage(new Uint8ClampedArray(white.data), box.w, box.h, 4).rgb();
  const { image_embeds } = await vision(await processor(clipInput));
  const kind = classify(labels, image_embeds.data);

  const croppedData = cctx.getImageData(0, 0, box.w, box.h).data;
  const clusters = dominantColors(croppedData, { k: 4 });
  const main = clusters[0];
  const light = lightNeutralGroup(clusters);
  let color = null;
  if (light && light.share >= (main?.share || 0)) {
    color = { name: light.swatch.name, ar: light.swatch.ar, hex: rgbToHex(light.rgb), share: light.share };
  } else if (main) {
    const named = nearestColor(main.rgb, { lightShare: main.lightShare });
    color = { name: named.name, ar: named.ar, hex: rgbToHex(main.rgb), share: main.share };
  }
  const accents = clusters.slice(1).filter((c) => c.share > 0.18).map((c) => nearestColor(c.rgb).name);

  post({ stage: "done", progress: 1 });
  return { cutout, width: box.w, height: box.h, coverage, ...kind, color, accents };
}

self.addEventListener("message", async (event) => {
  const { id, type, blob } = event.data || {};
  const post = (data) => self.postMessage({ id, type: "progress", ...data });
  try {
    if (type === "warmup") {
      await loadModels(post);
      self.postMessage({ id, type: "result", result: { ready: true } });
    } else if (type === "analyze") {
      const result = await analyze(blob, post);
      self.postMessage({ id, type: "result", result });
    }
  } catch (error) {
    self.postMessage({ id, type: "error", message: error?.message || String(error) });
  }
});
