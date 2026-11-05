// Dressable mannequin for the AI Stylist page.
// Garment cutouts are placed on body zones measured in the mannequin's own
// 400 x 900 coordinate space, so they "sit" on the figure at any screen size.
// Each piece can be dragged and resized; the fit is remembered per piece.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useDroppable } from "@dnd-kit/core";
import { ArrowDownLeft, Minus, Plus, RotateCcw, X } from "lucide-react";
import { html, tr } from "./html.js";
import { useWardrobeStore } from "../store.js";
import { fitGarment } from "./garment-fit.js";

const VB_W = 400, VB_H = 900;

// Body-landmark placement + waist taper for cutouts (falls back to the zone box).
function useGarmentFit(item) {
  const [fitted, setFitted] = useState(null);
  useEffect(() => {
    let alive = true;
    setFitted(null);
    fitGarment(item).then((f) => alive && setFitted(f));
    return () => { alive = false; };
  }, [item.image, item.category, item.cutout]);
  return fitted;
}
// Zones: [x, y, width, height] in mannequin units, plus how the image aligns in the box.
const ZONES = {
  Outerwear: { box: [86, 160, 228, 400], align: "top", z: 16 },
  Tops: { box: [100, 168, 200, 300], align: "top", z: 14 },
  Dresses: { box: [104, 166, 192, 600], align: "top", z: 12 },
  Bottoms: { box: [128, 418, 144, 400], align: "top", z: 10 },
  Shoes: { box: [140, 770, 120, 70], align: "bottom", z: 11 },
};
const ACCESSORY_SLOTS = [[276, 420, 104, 150], [20, 420, 104, 150], [150, 196, 100, 90]];

export const TONES = {
  porcelain: { label: ["Porcelain", "خزفي"], stops: ["#f7f1ec", "#e6dbd4", "#c8b8af", "#9d8a80"] },
  clay: { label: ["Clay", "طيني"], stops: ["#efc3ab", "#d7987a", "#b06e52", "#7d4a37"] },
  ebony: { label: ["Ebony", "أبنوسي"], stops: ["#8a7066", "#5e4a42", "#3d2f2a", "#231b18"] },
};

const FIT_KEY = "forme-fit-v1";
function readFits() { try { return JSON.parse(localStorage.getItem(FIT_KEY) || "{}"); } catch { return {}; } }
function writeFits(f) { try { localStorage.setItem(FIT_KEY, JSON.stringify(f)); } catch {} }

const mirror = (d) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${400 - parseFloat(x)} ${y}`);

// Body parts (right side; the left side is mirrored).
const ARM_R = "M262 196 C281 202 291 222 294 252 L302 332 C303 340 303 345 302 352 L313 450 C314 459 309 466 302 466 C295 466 291 460 290 452 L279 356 C277 348 276 342 275 334 L264 258 C262 236 260 214 262 196 Z";
const HAND_R = "M301 462 C311 463 316 474 315 490 C314 505 309 515 302 515 C295 515 290 506 290 492 C290 476 293 462 301 462 Z";
const LEG_R = "M202 452 L251 430 C256 470 253 526 247 584 C243 626 240 660 238 700 C236 738 234 770 232 790 C231 800 226 806 219 806 C211 806 207 799 207 790 C207 760 206 730 206 700 C205 660 205 626 204 590 C203 540 202 494 202 452 Z";
const FOOT_R = "M207 792 C214 790 224 790 232 794 C242 799 246 808 244 814 C242 820 232 822 222 821 C212 820 206 815 206 808 C206 800 206 795 207 792 Z";
const TORSO = "M200 166 C232 166 258 174 272 194 C281 208 278 236 270 262 C260 300 245 322 240 340 C246 372 257 400 255 430 C253 448 233 460 200 462 C167 460 147 448 145 430 C143 400 154 372 160 340 C155 322 140 300 130 262 C122 236 119 208 128 194 C142 174 168 166 200 166 Z";

function MannequinFigure({ tone }) {
  const s = TONES[tone]?.stops || TONES.porcelain.stops;
  const fill = "url(#mq-body)";
  return html`<svg className="mq-figure" viewBox="0 0 400 900" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="mq-body" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor=${s[2]} />
        <stop offset=".28" stopColor=${s[0]} />
        <stop offset=".55" stopColor=${s[1]} />
        <stop offset="1" stopColor=${s[3]} />
      </linearGradient>
      <radialGradient id="mq-head" cx=".38" cy=".32" r=".75">
        <stop offset="0" stopColor=${s[0]} />
        <stop offset=".6" stopColor=${s[1]} />
        <stop offset="1" stopColor=${s[3]} />
      </radialGradient>
      <linearGradient id="mq-metal" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#5b4a44" /><stop offset=".45" stopColor="#d9c9bf" /><stop offset="1" stopColor="#4a3b36" />
      </linearGradient>
      <radialGradient id="mq-floor" cx=".5" cy=".5" r=".5">
        <stop offset="0" stopColor="#000" stopOpacity=".45" /><stop offset="1" stopColor="#000" stopOpacity="0" />
      </radialGradient>
    </defs>
    <ellipse cx="200" cy="872" rx="120" ry="16" fill="url(#mq-floor)" />
    <rect x="196.5" y="560" width="7" height="300" rx="3.5" fill="url(#mq-metal)" />
    <ellipse cx="200" cy="862" rx="66" ry="11" fill="url(#mq-metal)" />
    <ellipse cx="200" cy="858" rx="62" ry="8" fill="#e8dcd4" opacity=".18" />
    <g className="mq-body">
      <path d=${mirror(ARM_R)} fill=${fill} />
      <path d=${mirror(HAND_R)} fill=${fill} />
      <path d=${ARM_R} fill=${fill} />
      <path d=${HAND_R} fill=${fill} />
      <path d=${mirror(LEG_R)} fill=${fill} />
      <path d=${LEG_R} fill=${fill} />
      <path d=${mirror(FOOT_R)} fill=${fill} />
      <path d=${FOOT_R} fill=${fill} />
      <path d="M184 124 L216 124 L221 176 L179 176 Z" fill=${fill} />
      <path d=${TORSO} fill=${fill} />
      <ellipse cx="200" cy="88" rx="36" ry="46" fill="url(#mq-head)" />
    </g>
    <g className="mq-seams" fill="none" strokeWidth="1.2">
      <path d="M181 172 C192 178 208 178 219 172" />
      <path d="M160 340 C186 350 214 350 240 340" />
      <path d="M262 198 C266 214 268 232 268 250" />
      <path d="M138 198 C134 214 132 232 132 250" />
      <path d="M200 192 L200 330" opacity=".5" />
      <path d="M150 432 C170 452 230 452 250 432" />
    </g>
    <ellipse className="mq-sheen" cx="186" cy="70" rx="9" ry="18" fill="#fff" opacity=".22" />
    <ellipse className="mq-sheen" cx="170" cy="250" rx="14" ry="60" fill="#fff" opacity=".07" />
  </svg>`;
}

function zoneFor(item, accessoryIndex) {
  if (item.category === "Accessories") {
    const [x, y, w, h] = ACCESSORY_SLOTS[accessoryIndex % ACCESSORY_SLOTS.length];
    return { box: [x, y, w, h], align: "center", z: 20 + accessoryIndex };
  }
  return ZONES[item.category] || ZONES.Tops;
}

function Layer({ item, zone, fit, selected, onSelect, onFit, stageRef, t, onRemove }) {
  const fitted = useGarmentFit(item);
  const [broken, setBroken] = useState(false);
  const [x, y, w, h] = fitted?.box || zone.box;
  const src = fitted?.url || item.image;
  const shaded = Boolean(fitted?.url);
  const drag = useRef(null);
  const style = {
    left: (x / VB_W) * 100 + "%", top: (y / VB_H) * 100 + "%",
    width: (w / VB_W) * 100 + "%", height: (h / VB_H) * 100 + "%",
    zIndex: selected ? 60 : zone.z,
  };
  // framer-motion owns the outer transform (enter/exit), the fit lives on the inner box.
  const fitStyle = { transform: `translate(${fit.dx}%, ${fit.dy}%) scale(${fit.s})` };
  const onPointerDown = (e) => {
    e.stopPropagation();
    onSelect(item.id);
    const rect = stageRef.current.getBoundingClientRect();
    drag.current = { x: e.clientX, y: e.clientY, dx: fit.dx, dy: fit.dy, bw: (w / VB_W) * rect.width, bh: (h / VB_H) * rect.height };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    onFit(item.id, { ...fit, dx: d.dx + ((e.clientX - d.x) / d.bw) * 100, dy: d.dy + ((e.clientY - d.y) / d.bh) * 100 });
  };
  const end = () => { drag.current = null; };
  return html`<${motion.div} className=${"mq-layer " + (item.cutout ? "is-cutout " : "is-photo ") + "align-" + zone.align + (selected ? " is-selected" : "")}
    style=${style} initial=${{ opacity: 0, y: -14 }} animate=${{ opacity: 1, y: 0 }} exit=${{ opacity: 0, scale: 0.9 }}
    transition=${{ type: "spring", stiffness: 260, damping: 24 }}
    onPointerDown=${onPointerDown} onPointerMove=${onPointerMove} onPointerUp=${end} onPointerCancel=${end}
    role="button" tabIndex="0" aria-label=${t("Adjust " + item.name, "ضبط " + item.name)}
    onKeyDown=${(e) => {
      const step = e.shiftKey ? 6 : 2;
      const k = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (k) { e.preventDefault(); onFit(item.id, { ...fit, dx: fit.dx + k[0], dy: fit.dy + k[1] }); }
      if (e.key === "+" || e.key === "=") onFit(item.id, { ...fit, s: Math.min(1.8, fit.s + 0.05) });
      if (e.key === "-") onFit(item.id, { ...fit, s: Math.max(0.5, fit.s - 0.05) });
      if (e.key === "Delete" || e.key === "Backspace") onRemove(item.id);
    }}
    onFocus=${() => onSelect(item.id)}>
    <div className=${"mq-fit" + (fitted?.box ? " is-fitted" : "")} style=${fitStyle}>
      <img src=${src} alt=${item.name} draggable="false" onError=${() => setBroken(true)} style=${broken ? { visibility: "hidden" } : undefined} />
      ${shaded && html`<span className="mq-shade" aria-hidden="true" style=${{ WebkitMaskImage: `url(${src})`, maskImage: `url(${src})` }}></span>`}
    </div>
  </${motion.div}>`;
}

export function DressedMannequin({ language }) {
  const t = tr(language);
  const outfit = useWardrobeStore((s) => s.activeOutfit);
  const remove = useWardrobeStore((s) => s.removeFromOutfit);
  const { isOver, setNodeRef } = useDroppable({ id: "outfit-drop" });
  const stageRef = useRef(null);
  const [tone, setTone] = useState(() => { try { return localStorage.getItem("forme-mannequin-tone") || "porcelain"; } catch { return "porcelain"; } });
  const [fits, setFits] = useState(readFits);
  const [selected, setSelected] = useState(null);

  useEffect(() => { try { localStorage.setItem("forme-mannequin-tone", tone); } catch {} }, [tone]);
  useEffect(() => { if (selected && !outfit.some((i) => i.id === selected)) setSelected(null); }, [outfit, selected]);

  const fitOf = (id) => ({ dx: 0, dy: 0, s: 1, ...(fits[id] || {}) });
  const setFit = (id, f) => setFits((all) => { const next = { ...all, [id]: f }; writeFits(next); return next; });
  const resetFit = (id) => setFits((all) => { const next = { ...all }; delete next[id]; writeFits(next); return next; });

  let accessoryIndex = 0;
  const placed = outfit.map((item) => ({ item, zone: zoneFor(item, item.category === "Accessories" ? accessoryIndex++ : 0) }));
  const sel = outfit.find((i) => i.id === selected);

  return html`<div ref=${setNodeRef} className=${"canvas-surface mq-surface " + (isOver ? "canvas-over" : "")} onPointerDown=${() => setSelected(null)}>
    <div className="canvas-grain"></div>
    <div className="canvas-topline">
      <span>${t("LOOK IN PROGRESS", "إطلالة قيد التنسيق")}</span>
      <div className="mq-tones" role="radiogroup" aria-label=${t("Mannequin finish", "لون المانيكان")} onPointerDown=${(e) => e.stopPropagation()}>
        ${Object.entries(TONES).map(([key, v]) => html`<button key=${key} type="button" role="radio" aria-checked=${tone === key}
          className=${"mq-tone " + (tone === key ? "active" : "")} style=${{ "--tone": v.stops[1] }}
          title=${language === "ar" ? v.label[1] : v.label[0]} aria-label=${language === "ar" ? v.label[1] : v.label[0]} onClick=${() => setTone(key)}></button>`)}
      </div>
    </div>
    <div className="canvas-look-number">01 <span>/</span> ${t("TODAY", "اليوم")}</div>

    <div className="mq-stage" ref=${stageRef}>
      <${MannequinFigure} tone=${tone} />
      <${AnimatePresence}>
        ${placed.map(({ item, zone }) => html`<${Layer} key=${item.id} item=${item} zone=${zone} fit=${fitOf(item.id)} selected=${selected === item.id}
          onSelect=${setSelected} onFit=${setFit} stageRef=${stageRef} t=${t} onRemove=${remove} />`)}
      </${AnimatePresence}>
    </div>

    ${sel && html`<div className="mq-toolbar" onPointerDown=${(e) => e.stopPropagation()}>
      <span>${sel.name}</span>
      <button type="button" aria-label=${t("Smaller", "أصغر")} onClick=${() => setFit(sel.id, { ...fitOf(sel.id), s: Math.max(0.5, fitOf(sel.id).s - 0.06) })}><${Minus} size=${15} /></button>
      <button type="button" aria-label=${t("Bigger", "أكبر")} onClick=${() => setFit(sel.id, { ...fitOf(sel.id), s: Math.min(1.8, fitOf(sel.id).s + 0.06) })}><${Plus} size=${15} /></button>
      <button type="button" aria-label=${t("Reset fit", "إعادة الضبط")} onClick=${() => resetFit(sel.id)}><${RotateCcw} size=${14} /></button>
      <button type="button" className="danger" aria-label=${t("Take off", "خلع القطعة")} onClick=${() => { remove(sel.id); setSelected(null); }}><${X} size=${15} /></button>
    </div>`}

    ${!outfit.length && html`<div className="canvas-hint">
      <span className="hint-arrow"><${ArrowDownLeft} size=${18} /></span>
      <span>${t("Drag or tap a piece", "اسحبي أو اضغطي على قطعة")}<br />${t("to dress the mannequin", "لتلبيس المانيكان")}</span>
    </div>`}
    ${isOver && html`<div className="drop-prompt">${t("Dress the mannequin", "ألبسي المانيكان")}</div>`}

    <div className="canvas-footer">
      <div className="look-thumbs">
        ${outfit.slice(0, 5).map((i) => html`<img key=${i.id} src=${i.image} alt=${i.name} className=${i.cutout ? "is-cutout" : ""} />`)}
        ${!outfit.length && html`<span className="empty-thumb"><${Plus} size=${14} /></span>`}
      </div>
      <div className="canvas-count">${outfit.length} ${outfit.length === 1 ? t("PIECE", "قطعة") : t("PIECES", "قطع")}</div>
    </div>
  </div>`;
}
