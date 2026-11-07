// Appearance: "auto" follows the device, or force "light" / "dark".
// index.html applies the stored choice before first paint (no flash);
// this module keeps it in sync and renders the control in the account menu.
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { html, tr } from "./html.js";

const KEY = "forme-theme";
const COLORS = { light: "#fbfaf7", dark: "#121411" };
const media = typeof matchMedia !== "undefined" ? matchMedia("(prefers-color-scheme: dark)") : null;

export function getThemeChoice() {
  try { const v = localStorage.getItem(KEY); return v === "light" || v === "dark" ? v : "auto"; } catch { return "auto"; }
}

function resolve(choice) {
  return choice === "auto" ? (media && media.matches ? "dark" : "light") : choice;
}

export function applyTheme(choice = getThemeChoice()) {
  const theme = resolve(choice);
  const root = document.documentElement;
  // Ease the switch instead of flashing (skipped for reduced motion via CSS).
  root.classList.add("theme-switching");
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", COLORS[theme]));
  window.setTimeout(() => root.classList.remove("theme-switching"), 360);
  return theme;
}

export function setThemeChoice(choice) {
  try { choice === "auto" ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, choice); } catch {}
  applyTheme(choice);
  window.dispatchEvent(new CustomEvent("forme-theme", { detail: choice }));
}

// Follow the device while on "auto".
if (media) {
  media.addEventListener("change", () => { if (getThemeChoice() === "auto") applyTheme("auto"); });
}

export function useThemeChoice() {
  const [choice, setChoice] = useState(getThemeChoice);
  useEffect(() => {
    const on = (e) => setChoice(e.detail);
    window.addEventListener("forme-theme", on);
    return () => window.removeEventListener("forme-theme", on);
  }, []);
  return [choice, setThemeChoice];
}

const ICONS = {
  auto: html`<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`,
  light: html`<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`,
  dark: html`<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>`,
};

export function AppearanceControl({ language }) {
  const t = tr(language);
  const [choice, setChoice] = useThemeChoice();
  const options = [["auto", t("Auto", "تلقائي")], ["light", t("Light", "فاتح")], ["dark", t("Dark", "داكن")]];
  return html`<div className="appearance">
    <span className="appearance-label">${t("Appearance", "المظهر")}</span>
    <div className="appearance-switch" role="radiogroup" aria-label=${t("Appearance", "المظهر")}>
      ${options.map(([key, label]) => html`<button key=${key} type="button" role="radio" aria-checked=${choice === key}
        className=${choice === key ? "active" : ""} onClick=${(e) => { e.stopPropagation(); setChoice(key); }}>
        ${choice === key && html`<${motion.span} layoutId="appearance-pill" className="glass-pill" transition=${{ type: "spring", bounce: 0, duration: 0.35 }} />`}
        <span>${ICONS[key]}${label}</span>
      </button>`)}
    </div>
  </div>`;
}
