// 2026.11.15-4 guard rails — the checks that let 11.15-3 regressions through. Run in light AND dark.
// Each page: scrolled to the very bottom nothing sits under the tab bar; every tappable thing ≥44×44 (steppers,
// chips, ⓘ); badges/tags/ⓘ text contrast ≥4.5:1 against their composited background; sleep header dark in both
// schemes; kcal follows today's ACTUAL plan (quick → 1950, eaten meals untouched, rest of day = rest-day portions).
const { test, expect } = require("@playwright/test");
const { fixData } = require("./_fixed-data");
const P = process.env.SMOKE_URL || `${process.env.FATMI_PREFIX || ""}${process.env.FATMI_PATH || "/staging/"}`;
const SUN = "2026-11-15T18:00:00+08:00"; // Sunday = 健身房 B
const u = (h, extra = "") => `${P}?debug=1&rest=5&sleep=8&now=${encodeURIComponent(SUN)}${extra}#${h}`;
const SHOTS = process.env.GUARD_OUT || "/workspace/fatmi-layout/v4/guard";

// --- in-page helpers -------------------------------------------------------------------------------
const PAGE_HELPERS = () => {
  const parse = (c) => { const m = String(c).match(/[\d.]+/g); if (!m) return null; const [r, g, b, a] = m.map(Number); return [r, g, b, a == null ? 1 : a]; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const over = (top, under) => { const a = top[3]; return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1); };
  // composite background: walk ancestors, blend translucent layers; gradients → use their first colour stop
  window.__effBg = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      let c = parse(s.backgroundColor);
      if ((!c || c[3] === 0) && /gradient/.test(s.backgroundImage)) c = parse((s.backgroundImage.match(/rgba?\([^)]*\)/) || [])[0]);
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
    }
    let base = [255, 255, 255, 1];
    if (!layers.length || layers[layers.length - 1][3] < 1) base = parse(getComputedStyle(document.documentElement).backgroundColor) || base;
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  };
  window.__contrast = (el) => { const fg = parse(getComputedStyle(el).color); const bg = window.__effBg(el); const f = over(fg, bg); const a = lum(f), b = lum(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
  window.__visible = (e) => { const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const s = getComputedStyle(e); if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0) return false; return !e.closest("details:not([open]) > :not(summary)"); };
};

async function open(page, hash, extra) {
  await page.goto(u(hash, extra)); await page.waitForSelector(".ttl"); await page.evaluate(PAGE_HELPERS); await page.waitForTimeout(250);
}
// pages that scroll, and how to reach their deepest state
const PAGES = [
  ["today", async () => {}],
  ["shop", async () => {}],
  ["rules", async () => {}],
  ["body", async () => {}],
  ["sleep", async () => {}],
  ["log", async () => {}],
  ["log-cardio", async (p) => { await p.locator("[data-log-open='2026-11-14']").click(); await p.locator(".cardio").first().waitFor(); }],
  ["else", async (p) => { await p.locator("[data-eat-else]").first().click(); await p.locator("[data-testid=else-list]").waitFor(); await p.locator("[data-else-out]").first().click(); }],
  ["workout", async (p) => { await p.locator("[data-start]").first().click(); await p.locator("[data-complete]").waitFor(); await p.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true))); }],
];
const hashOf = (n) => (n === "log-cardio" ? "log" : n === "else" || n === "workout" ? "today" : n);

for (const scheme of (process.env.SMOKE_SCHEMES || "light,dark").split(",")) {
  test.describe(`guard (${scheme})`, () => {
    test.use({ colorScheme: scheme });
    // real Garmin data for the records / cardio pages (the measurement must use the real 11/14 card); fixed data elsewhere
    test.beforeEach(async ({ page }, ti) => { if (!/^log|cardio/.test(ti.title)) await fixData(page); });

    for (const [name, prep] of PAGES) {
      test(`${name}: bottom clear of tab bar, targets ≥44px, badge contrast ≥4.5`, async ({ page }) => {
        await open(page, hashOf(name)); await prep(page); await page.evaluate(PAGE_HELPERS);
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(300);
        const r = await page.evaluate(() => {
          const navEl = document.querySelector("nav#tabs"); const nav = window.__visible(navEl) ? navEl.getBoundingClientRect() : { top: innerHeight };
          const main = document.getElementById("main");
          const sticky = [...main.querySelectorAll(".sticky-cta")].filter(window.__visible).map((e) => e.getBoundingClientRect()).filter((r) => r.top >= 0 && r.top < innerHeight);
          const inSticky = (e) => !!e.closest(".sticky-cta");
          const els = [...main.querySelectorAll("*")].filter((e) => window.__visible(e) && !inSticky(e) && getComputedStyle(e).position !== "fixed");
          let last = null, lb = -1; for (const e of els) { const b = e.getBoundingClientRect().bottom; if (b > lb) { lb = b; last = e; } }
          const limit = Math.min(nav.top, ...sticky.map((s) => s.top));
          const lastDesc = last ? `${last.tagName.toLowerCase()}.${String(last.className).split(" ")[0]} “${(last.textContent || "").trim().slice(0, 30)}”` : "";
          // tap targets
          const tapSel = "button,a[href],[role=button],select,input:not([type=hidden]):not(.mt-in),summary,.chip,label.meal-time";
          const small = [...document.querySelectorAll(`#main ${tapSel.split(",").join(",#main ")},nav#tabs button`)]
            .filter((e) => window.__visible(e) && !e.closest("svg") && !(e.matches("span.chip,div.chip") && !e.matches("[role=button],[data-else-out],[data-else-size],[tabindex]")))
            .map((e) => { const b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), d: `${e.tagName.toLowerCase()}${e.className ? "." + String(e.className).trim().split(/\s+/).join(".") : ""} ${[...e.attributes].filter((a) => a.name.startsWith("data-") && a.name !== "data-testid").map((a) => a.name).join(" ")} “${(e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 14)}”` }; })
            .filter((x) => x.w < 44 || x.h < 44);
          // badges / tags / small coloured labels
          const badgeSel = ".chip,.pend,.stg-tag,.demo-tag,.info-i,.hero .btn,.tag,.badge,.zone,.z-tag,.lvl,.who .nums,.app-ver,.why";
          const lowC = [...document.querySelectorAll(badgeSel)].filter((e) => window.__visible(e) && (e.textContent || "").trim())
            .map((e) => ({ c: Math.round(window.__contrast(e) * 100) / 100, d: `${e.tagName.toLowerCase()}.${String(e.className).trim().split(/\s+/).join(".")} “${e.textContent.trim().slice(0, 12)}” ${getComputedStyle(e).color} on rgb(${window.__effBg(e).slice(0, 3).map(Math.round).join(",")})` }))
            .filter((x) => x.c < 4.5);
          return { lastBottom: Math.round(lb), limit: Math.round(limit), lastDesc, small, lowC, scrollable: document.documentElement.scrollHeight > innerHeight + 2 };
        });
        await page.screenshot({ path: `${SHOTS}/${scheme}-${name}-bottom.png` });
        expect.soft(r.lastBottom, `${name}: last element ${r.lastDesc} bottom ${r.lastBottom} vs tab bar/sticky top ${r.limit}`).toBeLessThanOrEqual(r.limit);
        expect.soft(r.small, `${name}: tap targets < 44px`).toEqual([]);
        expect.soft(r.lowC, `${name}: contrast < 4.5`).toEqual([]);
      });
    }

    test("cardio card: last chart row (km3) can scroll fully above the tab bar", async ({ page }) => {
      await open(page, "log");
      await page.locator("[data-log-open='2026-11-14']").click();
      const card = page.locator(".cardio").first(); await card.waitFor();
      const r = await page.evaluate(() => {
        const c = document.querySelector(".cardio");
        const kids = [...c.querySelectorAll("*")].filter((e) => e.getBoundingClientRect().height > 0);
        const last = kids.reduce((a, e) => (e.getBoundingClientRect().bottom > a.getBoundingClientRect().bottom ? e : a), kids[0]);
        last.scrollIntoView({ block: "end" }); // what a deep link / focus / anchor does
        const nav = document.querySelector("nav#tabs").getBoundingClientRect();
        return { lastBottom: Math.round(last.getBoundingClientRect().bottom), navTop: Math.round(nav.top), what: (last.textContent || "").trim().slice(0, 30) };
      });
      await page.screenshot({ path: `${SHOTS}/${scheme}-cardio-scrollIntoView.png` });
      expect(r.lastBottom, `cardio last “${r.what}”`).toBeLessThanOrEqual(r.navTop);
    });

    test("吃了別的: last item row scrolls clear of the sticky 「✓ 吃了」", async ({ page }) => {
      await open(page, "today");
      await page.locator("[data-eat-else]").first().click();
      await page.locator("[data-else-inc]").first().click();
      const r = await page.evaluate(() => {
        const rows = [...document.querySelectorAll("[data-testid=else-list] .else-row")];
        const last = rows[rows.length - 1]; last.scrollIntoView({ block: "end" });
        window.scrollBy(0, 0);
        const cta = document.querySelector(".sticky-cta").getBoundingClientRect();
        // scroll so the list's end is as low as it can go while still visible: bottom of the list vs sticky top
        const list = document.querySelector("[data-testid=else-list]");
        window.scrollTo(0, list.getBoundingClientRect().bottom + scrollY - cta.top);
        const lr = last.getBoundingClientRect(), c2 = document.querySelector(".sticky-cta").getBoundingClientRect();
        return { rowBottom: Math.round(lr.bottom), ctaTop: Math.round(c2.top), name: last.textContent.trim().slice(0, 10) };
      });
      await page.screenshot({ path: `${SHOTS}/${scheme}-else-last-row.png` });
      expect(r.rowBottom, `last row “${r.name}”`).toBeLessThanOrEqual(r.ctaTop);
    });

    test("sleep page: header/body/tab bar all dark, back is the shared .btn 「← 回到今天」", async ({ page }) => {
      await open(page, "sleep"); await page.locator(".sleep-page").waitFor();
      const r = await page.evaluate(() => {
        const L = (el) => { const c = window.__effBg(el); return Math.round((0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 2.55); };
        const back = document.querySelector("#main [data-go='today']");
        const tag = document.querySelector("header .stg-tag");
        return { header: L(document.querySelector("header")), body: L(document.querySelector(".sleep-page")), nav: L(document.querySelector("nav#tabs")), tag: tag ? L(tag) : 0,
          theme: document.querySelector("meta[name=theme-color]").content, backText: back && back.textContent.trim(), backCls: back && back.className, backH: back && Math.round(back.getBoundingClientRect().height) };
      });
      await page.screenshot({ path: `${SHOTS}/${scheme}-sleep-top.png` });
      for (const k of ["header", "body", "nav", "tag"]) expect.soft(r[k], `${k} brightness % (dark ≤ 25)`).toBeLessThanOrEqual(25);
      expect.soft(r.theme.toLowerCase()).toBe("#000000");
      expect.soft(r.backText).toBe("← 回到今天");
      expect.soft(r.backCls).toMatch(/\bbtn\b/);
      expect.soft(r.backH).toBeGreaterThanOrEqual(44);
    });


    // Fix #6: header must be dark on the sleep page no matter how you got there (light scheme matters most)
    const ENTRIES = [
      ["direct-url", async (p) => { await open(p, "sleep"); }],
      ["home-card", async (p) => { await open(p, "today"); await p.locator("[data-testid=sleep-home]").click(); }],
      ["body-page-button", async (p) => { await open(p, "body"); await p.locator("#main [data-go='sleep']").click(); }],
      ["records-then-home-card", async (p) => { await open(p, "log"); await p.locator("#main [data-go='today']").first().click(); await p.locator("[data-testid=sleep-home]").click(); }],
      ["tab-bar-today-then-card", async (p) => { await open(p, "shop"); await p.locator("nav#tabs button").first().click(); await p.locator("[data-testid=sleep-home]").click(); }],
      ["history-back-forward", async (p) => { await open(p, "today"); await p.locator("[data-testid=sleep-home]").click(); await p.goBack(); await p.waitForTimeout(200); await p.goForward(); }],
      ["after-reload", async (p) => { await open(p, "today"); await p.locator("[data-testid=sleep-home]").click(); await p.reload(); await p.waitForSelector(".ttl"); await p.evaluate(PAGE_HELPERS); }],
    ];
    for (const [entry, go] of ENTRIES) {
      test(`sleep header dark via ${entry}`, async ({ page }) => {
        await go(page); await page.locator(".sleep-page").waitFor(); await page.waitForTimeout(250);
        const r = await page.evaluate(() => { const c = window.__effBg(document.querySelector("header")); return { L: Math.round((0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 2.55), bg: getComputedStyle(document.querySelector("header")).backgroundColor, theme: document.querySelector("meta[name=theme-color]").content }; });
        await page.screenshot({ path: `${SHOTS}/${scheme}-sleep-entry-${entry}.png`, clip: { x: 0, y: 0, width: 390, height: 200 } });
        expect(r.L, `header ${r.bg}`).toBeLessThanOrEqual(25);
        expect(r.theme.toLowerCase()).toBe("#000000");
        // leaving sleep restores the normal header (no black header stuck on other pages in light mode)
        await page.locator("#main [data-go='today']").first().click();
        const back = await page.evaluate(() => ({ bg: getComputedStyle(document.querySelector("header")).backgroundColor, theme: document.querySelector("meta[name=theme-color]").content, dark: matchMedia("(prefers-color-scheme: dark)").matches }));
        if (!back.dark) { expect(back.bg).not.toBe("rgb(0, 0, 0)"); expect(back.theme).toBe("#C2410C"); }
      });
    }
    test("kcal follows today's actual plan: gym day → eat 16:00 snack → switch to quick = 1950, snack kept, rest of day rest-day portions", async ({ page }) => {
      await open(page, "today");
      const before = await page.evaluate(() => ({ target: kcalInfo(load()).target, id: todayPlan(load()).id }));
      expect(before.id).toMatch(/^gym/);
      expect(before.target).toBe(2150);
      await page.locator("[data-eat='snack']").click();
      const snack0 = await page.evaluate(() => JSON.stringify((load().mealLogs || {})[todayKey()].snack));
      await page.locator("[data-fasted='on']").click(); // switch today to the 25-min quick version
      await page.waitForTimeout(200);
      const r = await page.evaluate(() => {
        const st = load(), key = todayKey();
        const logs = (st.mealLogs || {})[key] || {};
        const uneaten = mealIdsFor(st).filter((id) => !(logs[id] && logs[id].eaten));
        const now = Object.fromEntries(uneaten.map((id) => [id, currentMeal(st, id)]).map(([id, m]) => [id, { kcal: m.kcal, protein: m.protein, name: m.name }]));
        const real = isGymDay; isGymDay = () => false; // what the same day looks like as a non-gym day
        let rest; try { rest = Object.fromEntries(uneaten.map((id) => [id, currentMeal(st, id)]).map(([id, m]) => [id, { kcal: m.kcal, protein: m.protein, name: m.name }])); } finally { isGymDay = real; }
        return { id: todayPlan(st).id, target: kcalInfo(st).target, source: kcalInfo(st).source, snack: JSON.stringify(logs.snack), now, rest, txt: document.querySelector("#main").innerText };
      });
      await page.screenshot({ path: `${SHOTS}/${scheme}-quick-kcal.png` });
      expect(r.id).toBe("quick");
      expect(r.target).toBe(1950);
      expect(r.txt).toContain("目標 1950");
      expect(r.txt).not.toContain("2150");
      expect(r.snack, "eaten 16:00 snack unchanged").toBe(snack0);
      expect(Object.keys(r.now).length).toBeGreaterThan(0);
      expect(r.now, "not-yet-eaten meals = rest-day portions").toEqual(r.rest);
    });
  });
}
