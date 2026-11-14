// Visual check: screenshot the running app (bun serve / bun start) with headless Chromium.
//   bun run scripts/screenshot.ts out.png [--theme dark] [--display ticker] [--hint romaji]
//        [--font klee] [--type "kesa"] [--offline] [--settings] [--finish] [--url http://localhost:5174]
// --offline serves Tatoeba/builtin passages instead of calling the LLM.

import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const out = args[0] ?? "screenshot.png";
const opt = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (name: string) => args.includes(`--${name}`);

const url = opt("url") ?? "http://localhost:5174";
const executablePath = process.env.CHROMIUM ?? "/usr/bin/chromium";
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({
  viewport: { width: Number(opt("width") ?? 1280), height: Number(opt("height") ?? 800) },
  deviceScaleFactor: 1,
});
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") console.log(`[browser ${m.type()}]`, m.text());
});
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

const settings: Record<string, unknown> = { petals: false };
for (const k of ["theme", "display", "hint", "font", "level"]) if (opt(k)) settings[k] = opt(k);
if (opt("size")) settings.fontSize = Number(opt("size"));
if (opt("petals")) settings.petals = opt("petals") === "on";
await page.addInitScript((s) => localStorage.setItem("weebtype.settings.v1", JSON.stringify(s)), settings);

if (flag("offline")) {
  await page.route("**/api/passage", (route) => route.continue({ url: `${url}/api/fallback` }));
}
if (flag("builtin")) {
  await page.route("**/api/passage", async (route) => {
    const { BUILTIN } = await import("../server/tatoeba.ts");
    await route.fulfill({ json: { passage: BUILTIN } });
  });
}

await page.goto(url);
await page.waitForSelector(".cell", { timeout: 240_000 });
await page.waitForTimeout(800);
const keys = opt("type");
if (keys) {
  for (const k of keys) await page.keyboard.press(k === " " ? "Space" : k, { delay: 30 });
  await page.waitForTimeout(400);
}
if (flag("finish")) {
  // Type the whole passage using the hint's romaji guide.
  for (let guard = 0; guard < 2000; guard++) {
    const done = await page.$(".results");
    if (done) break;
    const full = await page.$eval(".g-romaji", (el) => el.textContent ?? "").catch(() => "");
    const typed = await page.$eval(".g-typed", (el) => el.textContent ?? "").catch(() => "");
    const next = full.slice(typed.length, typed.length + 1);
    if (!next) break;
    await page.keyboard.press(next === " " ? "Space" : next, { delay: 20 });
  }
  await page.waitForTimeout(1200);
}
if (flag("settings")) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
}
await page.screenshot({ path: out });
console.log(`saved ${out}`);
await browser.close();
