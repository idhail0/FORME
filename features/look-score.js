// Outfit compatibility score shown under the mannequin.
// Three signals, all explainable to the user:
//   - Color harmony (45%): neutrals vs statement colors, hue relationships, contrast
//   - Completeness (30%): a wearable base (top + bottom, or a dress) and shoes
//   - Style match (25%): casual vs dressy pieces, read from the piece names
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { html, tr } from "./html.js";
import { describeColor, findColorByName, sampleImageColor, colorLabel } from "./colors.js";

const CASUAL = ["jean", "denim", "t-shirt", "tee", "hoodie", "sneaker", "trainer", "short", "tank", "sweatshirt", "cargo", "jogger", "flip", "graphic", "polo", "sandal"];
const DRESSY = ["blazer", "tailored", "trouser", "silk", "loafer", "heel", "pump", "satin", "wool coat", "oxford", "blouse", "pencil", "trench", "button-up", "shirt dress", "column", "pleated", "leather tote", "suit"];

function formality(item) {
  const n = (item.name || "").toLowerCase();
  if (DRESSY.some((k) => n.includes(k))) return 1;
  if (CASUAL.some((k) => n.includes(k))) return -1;
  return 0;
}

function hueDistance(a, b) { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }

export function scoreLook(items, colors, t) {
  const tips = [];
  const count = (c) => items.filter((i) => i.category === c).length;
  const has = (c) => count(c) > 0;

  // Completeness
  let coverage = 0;
  const base = has("Dresses") || (has("Tops") && has("Bottoms"));
  if (base) coverage = 70; else if (has("Tops") || has("Bottoms") || has("Outerwear")) coverage = 38;
  if (has("Shoes")) coverage += 20; else tips.push(t("Add shoes to finish the look.", "حذاء مناسب سيُكمل الإطلالة."));
  if (has("Outerwear") || has("Accessories")) coverage += 10;
  if (!base) {
    if (has("Tops") && !has("Bottoms")) tips.unshift(t("Pick a bottom to go with your top.", "تنقص الإطلالة قطعة سفلية تناسب القطعة العلوية."));
    else if (has("Bottoms") && !has("Tops")) tips.unshift(t("Pick a top for these bottoms.", "تنقص الإطلالة قطعة علوية تناسب هذه القطعة."));
    else if (!has("Tops") && !has("Bottoms")) tips.unshift(t("Start with a top and bottom, or a dress.", "البداية: قطعة علوية وسفلية، أو فستان."));
  }
  for (const c of ["Bottoms", "Dresses", "Shoes"]) {
    if (count(c) > 1) { coverage -= 25; tips.push(t("Two pieces of the same kind compete — keep one.", "قطعتان من النوع نفسه تتنافسان — واحدة تكفي.")); break; }
  }
  if (has("Dresses") && has("Bottoms")) { coverage -= 15; tips.push(t("A dress and bottoms rarely work together.", "الفستان مع قطعة سفلية نادراً ما ينسجمان.")); }
  coverage = Math.max(0, Math.min(100, coverage));

  // Color harmony
  const known = colors.filter(Boolean);
  const accents = known.filter((c) => !c.neutral);
  let color = 86, colorNote;
  if (known.length < 2) { color = 80; colorNote = t("Add pieces to read the palette", "قطع أكثر لقراءة الألوان"); }
  else if (accents.length === 0) { color = 90; colorNote = t("Calm neutral palette", "ألوان محايدة هادئة"); }
  else if (accents.length === 1) { color = 96; colorNote = t("Neutrals with one statement color", "ألوان محايدة مع لون واحد بارز"); }
  else if (accents.length === 2) {
    const d = hueDistance(accents[0].H, accents[1].H);
    if (d < 30) { color = 90; colorNote = t("Tonal — colors from the same family", "تدرّج من عائلة لونية واحدة"); }
    else if (d > 150) { color = 80; colorNote = t("Bold complementary pairing", "تباين متكامل جريء"); }
    else if (d < 60) { color = 84; colorNote = t("Analogous colors that flow together", "ألوان متجاورة متناغمة"); }
    else { color = 56; colorNote = t("These two colors compete", "هذان اللونان يتنافسان"); tips.push(t("Swap one colorful piece for a neutral.", "استبدال قطعة ملوّنة بأخرى محايدة يحسّن التوازن.")); }
  } else {
    color = 48; colorNote = t("Too many statement colors", "ألوان بارزة كثيرة");
    tips.push(t("Keep it to one or two statement colors.", "لون أو لونان بارزان يكفيان."));
  }
  if (known.length >= 2) {
    const Ls = known.map((c) => c.L);
    if (Math.max(...Ls) - Math.min(...Ls) < 12 && accents.length < 2) { color -= 6; tips.push(t("Add a lighter or darker piece for contrast.", "قطعة أفتح أو أغمق ستخلق تباينًا أجمل.")); }
  }

  // Style match
  const levels = items.map(formality).filter((f) => f !== 0);
  let style = 88, styleNote = t("Consistent mood", "طابع منسجم");
  if (levels.length >= 2 && Math.max(...levels) - Math.min(...levels) >= 2) {
    style = 62; styleNote = t("Mixes casual and dressy", "مزيج بين الكاجوال والرسمي");
    tips.push(t("Casual and dressy pieces together read as high-low — make it intentional.", "الجمع بين الكاجوال والرسمي يحتاج قصداً واضحاً."));
  } else if (levels.length >= 2) { style = 95; styleNote = levels[0] > 0 ? t("Polished throughout", "أنيقة بالكامل") : t("Relaxed throughout", "مريحة بالكامل"); }

  const total = Math.round(coverage * 0.3 + color * 0.45 + style * 0.25);
  const verdict = total >= 85 ? t("Excellent match", "تناسق ممتاز") : total >= 72 ? t("Works well", "تناسق جيد") : total >= 58 ? t("Almost there", "قريبة من التناسق") : t("Needs rethinking", "تحتاج إعادة نظر");
  return { total, coverage, color: Math.max(0, color), style, colorNote, styleNote, tips: [...new Set(tips)].slice(0, 3), verdict };
}

function Bar({ label, value, note }) {
  return html`<div className="score-bar">
    <div className="score-bar-head"><span>${label}</span><strong>${Math.round(value)}</strong></div>
    <div className="score-track"><${motion.i} initial=${{ width: 0 }} animate=${{ width: value + "%" }} transition=${{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }} /></div>
    ${note && html`<small>${note}</small>`}
  </div>`;
}

export function LookScore({ items, language }) {
  const t = tr(language);
  const [colors, setColors] = useState([]);
  const key = items.map((i) => i.id + (i.color || "")).join("|");

  useEffect(() => {
    let alive = true;
    Promise.all(items.map(async (i) => {
      const named = findColorByName(i.color);
      if (named) return describeColor(named.name);
      const hex = await sampleImageColor(i.image);
      return hex ? describeColor(hex) : null;
    })).then((c) => alive && setColors(c));
    return () => { alive = false; };
  }, [key]);

  if (items.length < 2) {
    return html`<section className="look-score is-empty" aria-label=${t("Look score", "تقييم الإطلالة")}>
      <div className="score-ring" style=${{ "--p": 0 }}><span>—</span></div>
      <div><strong>${t("Match score", "نسبة التوافق")}</strong>
        <p>${t("Add at least two pieces to see how well they work together.", "قطعتان على الأقل لمعرفة مدى التوافق.")}</p></div>
    </section>`;
  }

  const s = scoreLook(items, colors, t);
  const tone = s.total >= 85 ? "great" : s.total >= 72 ? "good" : s.total >= 58 ? "fair" : "poor";
  return html`<section className=${"look-score tone-" + tone} aria-label=${t("Look score", "تقييم الإطلالة")}>
    <div className="score-summary">
      <div className="score-ring" style=${{ "--p": s.total }} role="img" aria-label=${s.total + "%"}><span>${s.total}<em>%</em></span></div>
      <div>
        <span className="eyebrow">${t("MATCH SCORE", "نسبة التوافق")}</span>
        <strong>${s.verdict}</strong>
        <div className="score-swatches">
          ${items.map((i, idx) => html`<span key=${i.id} title=${i.name}><i style=${{ background: colors[idx]?.hex || "transparent" }}></i>${colorLabel(i.color, language) || i.name}</span>`)}
        </div>
      </div>
    </div>
    <div className="score-bars">
      <${Bar} label=${t("Color harmony", "تناغم الألوان")} value=${s.color} note=${s.colorNote} />
      <${Bar} label=${t("Completeness", "اكتمال الإطلالة")} value=${s.coverage} />
      <${Bar} label=${t("Style match", "انسجام الطابع")} value=${s.style} note=${s.styleNote} />
    </div>
    ${s.tips.length > 0 && html`<ul className="score-tips">${s.tips.map((tip) => html`<li key=${tip}>${tip}</li>`)}</ul>`}
  </section>`;
}
