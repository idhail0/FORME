// Main-thread API for the garment vision worker.
let worker = null;
let nextId = 1;
const pending = new Map();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("./vision-worker.js", import.meta.url), { type: "module", name: "forme-vision" });
    worker.addEventListener("message", (event) => {
      const { id, type } = event.data || {};
      const job = pending.get(id);
      if (!job) return;
      if (type === "progress") job.onProgress?.(event.data);
      else {
        pending.delete(id);
        if (type === "result") job.resolve(event.data.result);
        else job.reject(new Error(event.data.message || "Vision failed"));
      }
    });
    worker.addEventListener("error", (event) => {
      for (const job of pending.values()) job.reject(new Error(event.message || "Vision worker crashed"));
      pending.clear();
      worker = null;
    });
  }
  return worker;
}

function run(type, payload, onProgress) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject, onProgress });
    getWorker().postMessage({ id, type, ...payload });
  });
}

export const visionSupported = typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined" && typeof WebAssembly !== "undefined";

/** Remove the background, detect garment type and main color. */
export function analyzeGarment(blob, onProgress) {
  return run("analyze", { blob }, onProgress);
}

/** Start downloading the models early (e.g. when the upload sheet opens). */
export function warmupVision(onProgress) {
  return run("warmup", {}, onProgress);
}
