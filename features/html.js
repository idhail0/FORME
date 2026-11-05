// JSX-like templates without a build step: html`<div class=${x}>...</div>`.
import { createElement } from "react";
import htm from "htm";

export const html = htm.bind(createElement);
export const tr = (language) => (english, arabic) => (language === "ar" ? arabic : english);
