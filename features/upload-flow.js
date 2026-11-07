// Smart "Add a piece" flow:
//   1. front photo -> background removed, piece type + color detected (in-browser)
//   2. back photo (optional) -> background removed
//   3. studio mockup (front / back) + editable details -> save
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue } from "framer-motion";
import { ArrowLeft, Camera, Check, Download, ImagePlus, RotateCcw, Sparkles, X } from "lucide-react";
import { html, tr } from "./html.js";
import { analyzeGarment, visionSupported, warmupVision } from "./vision.js";
import { PALETTE, colorLabel, findColorByName } from "./colors.js";
import { useWardrobeStore } from "../store.js";

const CATEGORIES = ["Tops", "Bottoms", "Outerwear", "Dresses", "Shoes", "Accessories"];
const CATEGORY_AR = { Tops: "قطع علوية", Bottoms: "قطع سفلية", Outerwear: "ملابس خارجية", Dresses: "فساتين", Shoes: "أحذية", Accessories: "إكسسوارات" };
const LABEL_AR = {
  "t-shirt": "تيشيرت", "button-up shirt": "قميص", blouse: "بلوزة", sweater: "كنزة", "tank top": "توب بدون أكمام", hoodie: "هودي", "polo shirt": "بولو",
  trousers: "بنطال", jeans: "جينز", skirt: "تنورة", shorts: "شورت", coat: "معطف", jacket: "جاكيت", blazer: "بليزر", "trench coat": "ترنش",
  dress: "فستان", jumpsuit: "جمبسوت", sneakers: "سنيكرز", boots: "بوت", "high heels": "كعب عالي", loafers: "لوفر", sandals: "صندل",
  handbag: "حقيبة يد", hat: "قبعة", scarf: "وشاح", belt: "حزام", sunglasses: "نظارة شمسية", necklace: "قلادة", watch: "ساعة",
};
// Apple's momentum projection (Designing Fluid Interfaces): where a flick would come to rest.
const project = (velocity, decelerationRate = 0.998) => ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
const SPRING = { type: "spring", bounce: 0, duration: 0.42 };
function useMediaQuery(query) {
  const [match, setMatch] = useState(() => typeof matchMedia !== "undefined" && matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}
const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());

async function toJpeg(file, maxSide = 1400) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f4f1eb";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
}

function loadImage(src) {
  return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; });
}

// Studio mockup as a downloadable image (front and back side by side).
async function renderMockup({ front, back, name }) {
  const W = back ? 2000 : 1200, H = 1400;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const bg = ctx.createRadialGradient(W / 2, H * 0.38, 50, W / 2, H * 0.5, W * 0.75);
  bg.addColorStop(0, "#f3eee8"); bg.addColorStop(1, "#d9cfc6");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const views = [front, back].filter(Boolean);
  const slotW = W / views.length;
  for (let i = 0; i < views.length; i++) {
    const img = await loadImage(views[i]);
    const maxW = slotW * 0.74, maxH = H * 0.7;
    const s = Math.min(maxW / img.width, maxH / img.height);
    const w = img.width * s, h = img.height * s;
    const x = slotW * i + (slotW - w) / 2, y = H * 0.12 + (maxH - h) / 2;
    const floor = ctx.createRadialGradient(x + w / 2, y + h + 26, 4, x + w / 2, y + h + 26, w * 0.55);
    floor.addColorStop(0, "rgba(60,40,30,.28)"); floor.addColorStop(1, "rgba(60,40,30,0)");
    ctx.fillStyle = floor;
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + h + 26, w * 0.55, 30, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.shadowColor = "rgba(40,25,20,.28)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18;
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
    if (views.length > 1) {
      ctx.fillStyle = "#776e6f"; ctx.font = "600 26px Geist, system-ui, sans-serif"; ctx.textAlign = "center";
      ctx.fillText(i === 0 ? "FRONT" : "BACK", slotW * i + slotW / 2, H - 120);
    }
  }
  ctx.fillStyle = "#201819"; ctx.textAlign = "left"; ctx.font = "54px 'Instrument Serif', Georgia, serif";
  ctx.fillText(name || "FORME", 70, H - 70);
  ctx.fillStyle = "#ac5567"; ctx.textAlign = "right"; ctx.font = "30px 'Instrument Serif', Georgia, serif";
  ctx.fillText("FORME.", W - 70, H - 72);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

function Progress({ job, t }) {
  const stages = [
    ["download", t("Getting the style engine ready", "تجهيز محرك التنسيق")],
    ["cutout", t("Removing the background", "إزالة الخلفية")],
    ["detect", t("Recognizing the piece and its color", "التعرّف على القطعة ولونها")],
  ];
  const order = { download: 0, cutout: 1, detect: 2, done: 3 };
  const current = order[job.stage] ?? 0;
  const mb = (n) => (n / 1048576).toFixed(0);
  return html`<div className="smart-progress" role="status" aria-live="polite">
    <div className="smart-progress-preview">
      ${job.preview && html`<img src=${job.preview} alt="" />`}
      <span className="smart-scan"></span>
    </div>
    <ol>
      ${stages.map(([key, label], i) => html`<li key=${key} className=${i < current ? "done" : i === current ? "active" : ""}>
        <span className="dot">${i < current ? html`<${Check} size=${12} />` : null}</span>
        <span>${label}${key === "download" && i === current && job.total ? html`<small> · ${mb(job.loaded)} / ${mb(job.total)} MB · ${t("one time only", "مرة واحدة فقط")}</small>` : null}</span>
      </li>`)}
    </ol>
  </div>`;
}

function Dropzone({ title, hint, onFile, icon = ImagePlus, secondary }) {
  const ref = useRef(null);
  const Icon = icon;
  return html`<div className="smart-drop-wrap">
    <input ref=${ref} className="file-input-hidden" type="file" accept="image/*" onChange=${(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
    <button type="button" className="upload-dropzone smart-dropzone" onClick=${() => ref.current?.click()}
      onDragOver=${(e) => e.preventDefault()} onDrop=${(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}>
      <span className="upload-glyph"><${Icon} size=${22} /></span>
      <strong>${title}</strong>
      <small>${hint}</small>
    </button>
    ${secondary}
  </div>`;
}

export function GarmentMockup({ front, back, t, compact = false }) {
  const [side, setSide] = useState("front");
  const both = Boolean(front && back);
  return html`<div className=${"garment-mockup " + (compact ? "compact" : "")}>
    <div className=${"mockup-stage " + (both ? "two-up" : "")}>
      ${[["front", front], ["back", back]].filter(([, src]) => src).map(([key, src]) => html`
        <figure key=${key} className=${"mockup-view " + (both && side !== key ? "is-dim" : "")} onClick=${() => setSide(key)}>
          <img src=${src} alt=${key === "front" ? t("Front", "الأمام") : t("Back", "الخلف")} />
          <span className="mockup-floor"></span>
          ${both && html`<figcaption>${key === "front" ? t("Front", "الأمام") : t("Back", "الخلف")}</figcaption>`}
        </figure>`)}
    </div>
  </div>`;
}

export function SmartUploadModal({ open, onClose, language }) {
  const t = tr(language);
  const add = useWardrobeStore((s) => s.addItem);
  const [step, setStep] = useState("front"); // front | back | review | manual
  const [job, setJob] = useState(null);
  const [front, setFront] = useState(null); // { original, originalUrl, cutout, cutoutUrl, result }
  const [back, setBack] = useState(null);
  const [useCutout, setUseCutout] = useState(true);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Tops");
  const [color, setColor] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && visionSupported) warmupVision(() => {}).catch(() => {}); // start the one-time download early
  }, [open]);

  const reset = () => {
    [front, back].forEach((v) => { if (v) { URL.revokeObjectURL(v.originalUrl); v.cutoutUrl && URL.revokeObjectURL(v.cutoutUrl); } });
    setStep("front"); setJob(null); setFront(null); setBack(null); setUseCutout(true);
    setName(""); setCategory("Tops"); setColor(""); setError(""); setSaving(false);
  };
  const close = () => { reset(); onClose(); };
  const isSheet = useMediaQuery("(max-width: 760px)");
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const sheetRef = useRef(null);
  // Only the handle and step bar start a drag; the body keeps normal scrolling and taps.
  const keepInBody = (e) => { if (isSheet) e.stopPropagation(); };
  // Pixel values (not "100%") so the drag always starts from a numeric position.
  const offscreen = typeof window !== "undefined" ? window.innerHeight : 900;
  const sheetY = useMotionValue(offscreen);
  const onDragEnd = (_, info) => {
    const height = sheetRef.current?.offsetHeight || 600;
    const current = sheetY.get();
    // Decide from where the gesture is heading (momentum projection), not where the finger let go,
    // then hand the finger's velocity to the spring so there is no seam between drag and animation.
    const resting = current + project(info.velocity.y);
    if (resting > height * 0.42) {
      animate(sheetY, offscreen, { type: "spring", bounce: 0, duration: 0.32, velocity: info.velocity.y }).then(close);
    } else {
      animate(sheetY, 0, { type: "spring", bounce: info.velocity.y < -300 ? 0.18 : 0, duration: 0.42, velocity: info.velocity.y });
    }
  };
  // Sheets enter and leave along the same path (from the bottom); dialogs materialize in place.
  const motionProps = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.18 } }
    : isSheet
      ? { initial: { y: offscreen }, animate: { y: 0 }, exit: { y: offscreen }, transition: SPRING }
      : { initial: { opacity: 0, scale: 0.94, filter: "blur(10px)" }, animate: { opacity: 1, scale: 1, filter: "blur(0px)" }, exit: { opacity: 0, scale: 0.96, filter: "blur(8px)" }, transition: SPRING };

  const process = async (file, side) => {
    if (!file.type.startsWith("image/")) { setError(t("Choose an image file to continue.", "اختاري ملف صورة للمتابعة.")); return; }
    setError("");
    const original = await toJpeg(file).catch(() => null);
    if (!original) { setError(t("This photo could not be opened. Try a JPG or PNG.", "تعذّر فتح الصورة. جرّبي ملف JPG أو PNG.")); return; }
    const originalUrl = URL.createObjectURL(original);
    if (!visionSupported) {
      const entry = { original, originalUrl };
      side === "front" ? setFront(entry) : setBack(entry);
      setUseCutout(false);
      setStep(side === "front" ? "back" : "review");
      return;
    }
    setJob({ stage: "download", progress: 0, preview: originalUrl });
    try {
      const result = await analyzeGarment(original, (p) => setJob((j) => ({ ...j, ...p })));
      const entry = { original, originalUrl, cutout: result.cutout, cutoutUrl: URL.createObjectURL(result.cutout), result };
      if (side === "front") {
        setFront(entry);
        const detectedColor = result.color?.name || "";
        setCategory(result.category);
        setColor(detectedColor);
        setName(titleCase([detectedColor, result.label].filter(Boolean).join(" ")));
        setStep("back");
      } else {
        setBack(entry);
        setStep("review");
      }
    } catch (err) {
      const entry = { original, originalUrl };
      side === "front" ? setFront(entry) : setBack(entry);
      setUseCutout(false);
      setError(err.message === "NO_SUBJECT"
        ? t("We couldn't find a garment in that photo. You can still add it as is.", "لم نجد قطعة واضحة في الصورة. يمكنك إضافتها كما هي.")
        : t("Smart processing isn't available right now. You can still add the photo as is.", "المعالجة الذكية غير متاحة حالياً. يمكنك إضافة الصورة كما هي."));
      if (side === "front") setName(file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim());
      setStep(side === "front" ? "back" : "review");
    } finally {
      setJob(null);
    }
  };

  const frontSrc = front && (useCutout && front.cutoutUrl ? front.cutoutUrl : front.originalUrl);
  const backSrc = back && (useCutout && back.cutoutUrl ? back.cutoutUrl : back.originalUrl);
  const cutoutReady = Boolean(front?.cutout) && (!back || Boolean(back.cutout));

  const save = async () => {
    if (!front || saving) return;
    setSaving(true); setError("");
    try {
      const smart = useCutout && cutoutReady;
      await add({
        name: name.trim() || t("New piece", "قطعة جديدة"),
        category, color: color.trim(),
        imageBlob: smart ? front.cutout : front.original,
        backBlob: back ? (smart ? back.cutout : back.original) : null,
        cutout: smart,
      });
      close();
    } catch (err) {
      setError(err.message || t("Could not save this piece.", "تعذّر حفظ القطعة."));
      setSaving(false);
    }
  };

  const downloadMockup = async () => {
    const blob = await renderMockup({ front: frontSrc, back: backSrc, name });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (name || "forme-piece").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() + "-mockup.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const r = front?.result;
  const stepIndex = { front: 0, back: 1, review: 2 }[step] ?? 0;

  return html`<${AnimatePresence}>${open && html`
    <${motion.div} className="modal-backdrop" initial=${{ opacity: 0 }} animate=${{ opacity: 1 }} exit=${{ opacity: 0 }}
      onMouseDown=${(e) => { if (e.target === e.currentTarget && !job) close(); }}>
      <${motion.div} ref=${sheetRef} className=${"upload-modal smart-upload" + (isSheet ? " is-sheet" : "")} role="dialog" aria-modal="true" aria-label=${t("Add a piece", "أضيفي قطعة")}
        ...${motionProps}
        style=${isSheet ? { y: sheetY } : undefined}
        drag=${isSheet && !reduceMotion && !job ? "y" : false} dragMomentum=${false}
        dragConstraints=${{ top: 0 }} dragElastic=${{ top: 0.06, bottom: 1 }} onDragEnd=${onDragEnd}>
        ${isSheet && html`<div className="sheet-grabber" aria-hidden="true"><span></span></div>`}
        <button className="modal-close" onPointerDown=${keepInBody} onClick=${close} aria-label=${t("Close", "إغلاق")} disabled=${Boolean(job)}><${X} size=${18} /></button>
        <div className="smart-steps" aria-hidden="true">
          ${[t("Front", "الأمام"), t("Back", "الخلف"), t("Review", "مراجعة")].map((label, i) => html`<span key=${i} className=${i < stepIndex ? "done" : i === stepIndex ? "active" : ""}><i>${i + 1}</i>${label}</span>`)}
        </div>

        <div className="sheet-body" onPointerDown=${keepInBody}>
        ${job ? html`<${Progress} job=${job} t=${t} />` : step === "front" ? html`
          <div className="eyebrow">${t("STEP 1 · FRONT", "الخطوة ١ · الأمام")}</div>
          <h2>${t("Add a piece", "أضيفي قطعة")}</h2>
          <p>${t("Photograph the front of the piece. We remove the background and recognize the type and color for you.", "صوّري القطعة من الأمام. سنزيل الخلفية ونتعرّف على نوعها ولونها تلقائياً.")}</p>
          <${Dropzone} title=${t("Choose the front photo", "اختاري صورة الأمام")} hint=${t("Lay it flat or hang it, in good light", "ضعيها مسطّحة أو معلّقة بإضاءة جيدة")} onFile=${(f) => process(f, "front")} icon=${Camera} />
          ${!visionSupported && html`<div className="local-note">${t("Smart processing isn't supported in this browser; photos are saved as they are.", "المعالجة الذكية غير مدعومة في هذا المتصفح؛ ستُحفظ الصور كما هي.")}</div>`}
        ` : step === "back" ? html`
          <div className="eyebrow">${t("STEP 2 · BACK", "الخطوة ٢ · الخلف")}</div>
          <h2>${t("Now the back", "والآن الخلف")}</h2>
          <div className="smart-detected">
            <div className="smart-thumb"><img src=${frontSrc} alt="" /></div>
            <div>
              ${r ? html`
                <strong>${language === "ar" ? (LABEL_AR[r.label] || r.label) : titleCase(r.label)}</strong>
                <span><i className="swatch-dot" style=${{ background: r.color?.hex }}></i>${colorLabel(r.color?.name, language)} · ${language === "ar" ? CATEGORY_AR[r.category] : r.category}</span>
                <em><${Sparkles} size=${12} /> ${t("Recognized", "تم التعرّف")} · ${Math.round(r.confidence * 100)}%</em>
              ` : html`<strong>${t("Front photo added", "تمت إضافة صورة الأمام")}</strong>`}
            </div>
          </div>
          <${Dropzone} title=${t("Choose the back photo", "اختاري صورة الخلف")} hint=${t("Same light and angle as the front", "بنفس الإضاءة وزاوية الأمام")} onFile=${(f) => process(f, "back")} icon=${RotateCcw}
            secondary=${html`<button type="button" className="modal-secondary smart-skip" onClick=${() => setStep("review")}>${t("Skip — no back photo", "تخطّي — بدون صورة خلفية")}</button>`} />
        ` : html`
          <div className="eyebrow">${t("STEP 3 · REVIEW", "الخطوة ٣ · مراجعة")}</div>
          <h2>${t("Your piece", "قطعتك")}</h2>
          <${GarmentMockup} front=${frontSrc} back=${backSrc} t=${t} />
          <div className="mockup-actions">
            ${cutoutReady && html`<label className="smart-toggle"><input type="checkbox" checked=${useCutout} onChange=${(e) => setUseCutout(e.target.checked)} /><span></span>${t("Background removed", "الخلفية مُزالة")}</label>`}
            <button type="button" className="text-button" onClick=${downloadMockup}><${Download} size=${14} />${t("Download mockup", "تنزيل الموك أب")}</button>
          </div>
          <label className="field-label">${t("PIECE NAME", "اسم القطعة")}
            <input className="piece-name-input" value=${name} onInput=${(e) => setName(e.target.value)} placeholder=${t("Name this piece", "اسم القطعة")} />
          </label>
          <div className="field-label"><span>${t("CATEGORY", "الفئة")}</span>
            <div className="chip-row" role="radiogroup">
              ${CATEGORIES.map((c) => html`<button key=${c} type="button" role="radio" aria-checked=${category === c} className=${"chip " + (category === c ? "selected" : "")} onClick=${() => setCategory(c)}>
                ${language === "ar" ? CATEGORY_AR[c] : c}${r && r.category === c ? html`<${Sparkles} size=${11} />` : null}</button>`)}
            </div>
          </div>
          <div className="field-label"><span>${t("COLOR", "اللون")}</span>
            <div className="color-field">
              <i className="swatch-dot large" style=${{ background: findColorByName(color)?.hex || r?.color?.hex || "transparent" }}></i>
              <select className="piece-category-select" value=${findColorByName(color)?.name || ""} onChange=${(e) => setColor(e.target.value)}>
                <option value="">${t("Choose a color", "اختاري لوناً")}</option>
                ${PALETTE.map((p) => html`<option key=${p.name} value=${p.name}>${language === "ar" ? p.ar : p.name}</option>`)}
              </select>
            </div>
          </div>
          <div className="smart-actions">
            <button type="button" className="modal-secondary" onClick=${() => setStep("back")}><${ArrowLeft} size=${14} />${t("Back", "رجوع")}</button>
            <button className="primary-button save-piece-button" disabled=${saving} onClick=${save}>
              ${saving ? html`<span className="spinner"></span>` : html`<${Check} size=${15} />`}${t("Add to my closet", "أضيفيها إلى خزانتي")}
            </button>
          </div>
        `}
        ${error && html`<div className="upload-error" role="alert">${error}</div>`}
        <div className="local-note">${t("Photos are processed on your device. On save, the piece is sent to your private Supabase storage.", "تتم معالجة الصور على جهازك. عند الحفظ تُرسل القطعة إلى تخزينك الخاص في Supabase.")}</div>
        </div>
      </${motion.div}>
    </${motion.div}>`}
  </${AnimatePresence}>`;
}
