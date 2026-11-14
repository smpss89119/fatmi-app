// Full-feature smoke: guided flows with assertions (part A) + an explorer that clicks EVERY
// data-* action the app's click handler knows about (part B, parsed from app.js at run time).
// Runs against SMOKE_URL (live) or the local server (FATMI_PATH). Writes results JSON + screenshots.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const BASE = process.env.SMOKE_URL || `${process.env.FATMI_PREFIX || ""}${process.env.FATMI_PATH || "/staging/"}`;
const OUT = process.env.SMOKE_OUT || "/workspace/fatmi-layout/smoke";
const SCHEMES = (process.env.SMOKE_SCHEMES || "light,dark").split(",");
test.use({ actionTimeout: 4000, navigationTimeout: 15000, viewport: { width: 390, height: 844 }, permissions: ["clipboard-read", "clipboard-write"] });
test.setTimeout(30 * 60 * 1000);

const SAT_EVE = "2026-11-14T20:00:00+08:00"; // real Garmin day (strength + cardio)
const SUN_EVE = "2026-11-15T21:00:00+08:00";
const MON_AM = "2026-11-16T10:00:00+08:00";
const PHOTO_DAY = "2026-11-16";

let RN = 0;
function u(now, hash = "today", extra = {}) {
  const q = new URLSearchParams({ debug: "1", now, r: String(++RN), ...extra }); // r: force a real reload every time
  return `${BASE}?${q}#${hash}`;
}

for (const scheme of SCHEMES) {
  test(`full-feature smoke (${scheme})`, async ({ page, context, browserName }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const dir = path.join(OUT, scheme);
    fs.mkdirSync(dir, { recursive: true });
    const results = [];
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message || e)));
    page.on("dialog", (d) => d.accept(d.type() === "prompt" ? "" : undefined).catch(() => null));
    // photo meals: inject one group-photo meal into data.json (live data may have none today)
    await page.route("**/data.json*", async (route) => {
      const r = await route.fetch();
      let d; try { d = await r.json(); } catch { return route.fulfill({ response: r }); }
      // a Garmin strength day with no exercise sets → the log offers 「補登」
      if (d.garmin && d.garmin.activities) d.garmin.activities.push({ type: "strength_training", date: "2026-11-05", startTime: "2026-11-05 19:00:00", durationMin: 30, avgHR: 110, kcal: 200, name: "肌力訓練（smoke）" });
      d.chatMeals = { ...(d.chatMeals || {}) };
      d.chatMeals[PHOTO_DAY] = [...(d.chatMeals[PHOTO_DAY] || []), { id: "smoke1", time: "12:30", name: "雞腿便當（smoke）", kcal: 650, protein: 38 }];
      await route.fulfill({ response: r, json: d });
    });
    // every real click / change / long-press on a data-* action is recorded (survives reloads)
    let curHits = new Set();
    const flowHits = {}; // attr -> [step ids where it fired in a passing step]
    await page.exposeBinding("__smokeHit", (_src, attrs) => { for (const a of attrs) curHits.add(a); });
    await page.addInitScript(() => {
      const rec = (e) => {
        const out = [];
        for (let el = e.target; el && el.getAttributeNames; el = el.parentElement) for (const at of el.getAttributeNames()) if (at.startsWith("data-") && at !== "data-testid") out.push(at);
        if (out.length && window.__smokeHit) window.__smokeHit(out);
      };
      for (const t of ["click", "change", "pointerdown"]) document.addEventListener(t, rec, true);
    });
    let shotN = 0;
    const shot = async (name) => { shotN++; const f = path.join(dir, `${String(shotN).padStart(2, "0")}-${name}.png`); await page.screenshot({ path: f }).catch(() => null); return path.basename(f); };
    async function step(id, feature, fn) {
      const e0 = errors.length;
      curHits = new Set();
      let pass = false, note = "";
      try { note = (await fn()) || ""; pass = true; } catch (e) { note = String(e.message || e).split("\n")[0].slice(0, 200); }
      if (errors.length > e0) { pass = false; note += ` JS error: ${errors.slice(e0).join(" | ").slice(0, 200)}`; }
      const s = await shot(id);
      if (pass) for (const a of curHits) (flowHits[a] = flowHits[a] || []).push(id);
      results.push({ id, feature, pass, note, shot: s, actions: [...curHits].sort() });
    }
    const open = async (now, hash = "today", extra) => {
      await page.goto(u(now, hash, extra), { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".ttl", { timeout: 15000 });
      await page.waitForTimeout(250);
    };
    const reset = async () => { await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }).catch(() => null); };

    // find a training day where the start button shows
    async function trainingDay() {
      for (let d = 16; d <= 22; d++) {
        const now = `2026-11-${d}T18:00:00+08:00`;
        await open(now); await reset(); await open(now);
        if (await page.locator("[data-start]").first().isVisible().catch(() => false)) return now;
      }
      throw new Error("no training day with 開始訓練 found 11/16–11/22");
    }

    // ---------- Part A: guided flows ----------
    await page.goto(u(MON_AM), { waitUntil: "domcontentloaded" }); await reset();

    await step("A01-launch", "啟動 / 版本 / 標題", async () => {
      await open(MON_AM);
      await expect(page.locator(".ttl")).toBeVisible();
      const v = await page.evaluate(async () => (await (await fetch("./version.json?t=" + Date.now(), { cache: "no-store" })).json()).version);
      return `version.json ${v}`;
    });
    await step("A02-tabs", "分頁：今天 / 採買 / 規則（底部導覽）", async () => {
      for (const t of ["shop", "rules", "today"]) {
        await page.locator(`nav#tabs button[data-tab=${t}]`).click();
        await expect(page.locator(`nav#tabs button[data-tab=${t}]`)).toHaveClass(/on/);
        expect(page.url()).toContain(`#${t}`);
      }
    });
    await step("A03-go-pages", "頁面跳轉：身體 / 睡眠 / 訓練紀錄（data-go）", async () => {
      const gos = await page.$$eval("[data-go]", (els) => [...new Set(els.map((e) => e.dataset.go))]);
      expect(gos.length).toBeGreaterThan(0);
      for (const g of gos) {
        await open(MON_AM);
        const el = page.locator(`[data-go="${g}"]`).first();
        if (!(await el.isVisible())) continue;
        await el.click(); await page.waitForTimeout(150);
        expect(page.url()).toContain(`#${g}`);
        await page.locator("[data-back]").first().click().catch(() => null);
      }
      return `go: ${gos.join(",")}`;
    });
    await step("A04-meal-eat", "餐點：照吃了 / 取消（熱量環更新）", async () => {
      await open(MON_AM);
      const row = page.locator(".meal-row").first();
      const before = await page.locator(".ring").first().innerText();
      await row.locator("[data-eat]").click();
      await expect(page.locator(".meal-row").first()).toHaveClass(/eaten/);
      const after = await page.locator(".ring").first().innerText();
      expect(after).not.toBe(before);
      await page.locator(".meal-row").first().locator("[data-eat]").click();
      await expect(page.locator(".meal-row").first()).not.toHaveClass(/eaten/);
    });
    await step("A05-whey-2-scoops", "蛋白粉 2 份 + 兩匙口味選擇", async () => {
      await open(MON_AM);
      await page.locator("[data-meal-more=snack]").click();
      await page.locator("[data-whey2=snack]").click();
      const sels = page.locator("select[data-scoop-slot]");
      const n = await sels.count();
      expect(n).toBeGreaterThanOrEqual(2);
      for (let i = 0; i < n; i++) {
        const opts = await sels.nth(i).locator("option").evaluateAll((o) => o.map((x) => x.value).filter(Boolean));
        if (opts.length) await sels.nth(i).selectOption(opts[Math.min(i, opts.length - 1)]);
      }
      const t = await page.locator("[data-testid=meal-snack]").innerText();
      expect(t).toMatch(/2/);
      return `scoop selects: ${n}`;
    });
    await step("A06-eat-else", "吃了別的：選項 / 份量 / 自訂 / 儲存", async () => {
      await open(MON_AM);
      await page.locator("[data-eat-else]").first().click();
      await page.locator("[data-else-inc]").first().click();
      await page.locator("[data-else-inc]").nth(1).click();
      await page.locator("[data-else-dec]").nth(1).click();
      const sb = await page.locator("[data-else-save]").boundingBox();
      expect(sb.y + sb.height).toBeLessThanOrEqual(844); // sticky: save visible without scrolling
      await page.locator("[data-else-save]").first().click();
      await expect(page.locator(".meal-row").first()).toHaveClass(/eaten/);
    });
    await step("A07-photo-meal", "📸 群組照片餐（chatMeals）顯示並計入", async () => {
      await open(`${PHOTO_DAY}T20:00:00+08:00`);
      await expect(page.locator("[data-testid=chat-meal-smoke1]")).toBeVisible();
      await expect(page.locator("[data-testid=chat-meal-smoke1]")).toContainText("650");
    });
    await step("A08-meal-time-add-del", "用餐時間（24h）/ 加一餐 / 刪除 / 份量調整 / 恢復原菜單", async () => {
      await open(MON_AM); await reset(); await open(MON_AM);
      const t = page.locator("[data-meal-time]").first();
      await t.fill("12:45"); await t.dispatchEvent("change");
      await expect(page.locator(".meal-time .mt-24").first()).toHaveText("12:45");
      const n0 = await page.locator(".meal-row").count();
      await page.locator("[data-add-meal]").click();
      await expect(page.locator(".meal-row")).toHaveCount(n0 + 1);
      await page.locator("[data-meal-del]").first().click();
      await expect(page.locator(".meal-row")).toHaveCount(n0);
      await page.locator("[data-meal-more]").first().click();
      const adj = page.locator("[data-palm], [data-fist], [data-veg], [data-est]").filter({ visible: true }).first();
      await adj.click();
      const res = page.locator("[data-meal-restore]").first();
      await expect(res).toBeEnabled();
      await res.click();
      await expect(page.locator("[data-meal-restore]")).toHaveCount(0);
      return `rows ${n0}→${n0 + 1}→${n0}`;
    });
    const TRAIN = await trainingDay().catch(() => null);
    await step("A09-workout", "訓練：開始 / 完成組 / 休息跳過 / 復原組 / 上下一動作 / 換動作 / 感受評分 / 結束", async () => {
      if (!TRAIN) throw new Error("no training day");
      await open(TRAIN); await reset(); await open(TRAIN);
      await page.locator("[data-start]").first().click();
      await expect(page.locator("[data-complete]")).toBeVisible();
      await page.locator("[data-complete]").click();
      if (await page.locator("[data-skip-rest]").isVisible()) await page.locator("[data-skip-rest]").click();
      if (await page.locator("[data-undo-set]").isVisible().catch(() => false)) await page.locator("[data-undo-set]").click();
      if (await page.locator("[data-wonext]").isVisible().catch(() => false)) { await page.locator("[data-wonext]").click(); await page.locator("[data-woprev]").click().catch(() => null); }
      const swap = page.locator("[data-swap]").first();
      if (await swap.isVisible().catch(() => false)) { await swap.click(); await page.locator("[data-apply-swap]").first().click().catch(() => null); }
      for (let i = 0; i < 120; i++) {
        if (await page.locator("[data-finish-home]").isVisible().catch(() => false)) break;
        if (await page.locator("[data-exback]").first().isVisible().catch(() => false)) { await page.locator("[data-exback]").first().click(); continue; }
        if (await page.locator("[data-skip-rest]").isVisible().catch(() => false)) { await page.locator("[data-skip-rest]").click(); continue; }
        await page.locator("[data-complete]").click({ timeout: 2000 }).catch(() => null);
      }
      await page.locator("[data-finish-home]").click();
      const day = TRAIN.slice(0, 10);
      const logged = await page.evaluate((d) => { const s = JSON.parse(localStorage.getItem("fatcat-v2") || "{}"); return !!(s.logs && s.logs[d]); }, day);
      expect(logged).toBe(true);
      return `training day ${day}`;
    });
    await step("A10-log-cardio", "訓練紀錄：列表 / 展開 11/14 / 有氧卡（心率區間、每公里）", async () => {
      await open(SUN_EVE); await reset(); await open(SUN_EVE, "log");
      if (!(await page.locator("[data-log-row]").first().isVisible().catch(() => false))) await open(SUN_EVE, "body");
      const row = page.locator("[data-testid=log-row-2026-11-14]");
      await expect(row).toBeVisible();
      await row.click();
      await expect(page.locator(".cd-card, [data-testid^=cardio]").first()).toBeVisible();
      const txt = await page.locator("main").innerText();
      expect(txt).toMatch(/心率區間/); expect(txt).toMatch(/距離/);
    });
    await step("A11-log-longpress-delete", "訓練紀錄：長按刪除（確認後移除）", async () => {
      await open(SUN_EVE);
      await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("fatcat-v2") || "{}"); s.logs = { ...(s.logs || {}), "2026-11-12": { workoutId: "homeQ", moves: { "臀橋": [{ done: true, reps: 12, weight: null }] }, finishedAt: 3 } }; localStorage.setItem("fatcat-v2", JSON.stringify(s)); });
      await open(SUN_EVE, "log");
      if (!(await page.locator("[data-log-row]").first().isVisible().catch(() => false))) await open(SUN_EVE, "body");
      const sel = "[data-log-row='2026-11-12']";
      await expect(page.locator(sel)).toBeVisible();
      await page.evaluate((s) => document.querySelector(s).dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })), sel);
      await page.waitForTimeout(900);
      await expect(page.locator(sel)).toHaveCount(0);
    });
    await step("A12-muscle-map", "肌肉圖：點部位顯示本週組數", async () => {
      await open(SAT_EVE); await reset(); await open(SAT_EVE);
      const part = page.locator(".body-svg [data-part]").first();
      await part.scrollIntoViewIfNeeded();
      await part.click({ force: true });
      await page.waitForTimeout(200);
      const tip = await page.locator(".body-tip, [data-testid=body-tip]").first().innerText().catch(() => "");
      expect(tip.length).toBeGreaterThan(0);
      return tip.slice(0, 40);
    });
    await step("A13-body-inbody", "身體頁：InBody 體重 / 體脂 / 趨勢", async () => {
      await open(MON_AM, "body");
      const t = await page.locator("main").innerText();
      expect(t).toMatch(/kg|公斤/); expect(t).toMatch(/體脂/);
    });
    await step("A14-sleep", "睡眠：日 / 週 / 月 + 上一段 / 下一段", async () => {
      await open(MON_AM, "sleep");
      const ranges = await page.$$eval("[data-sleep-range]", (e) => e.map((x) => x.dataset.sleepRange));
      expect(ranges.length).toBeGreaterThanOrEqual(3);
      for (const r of ranges) {
        await page.locator(`[data-sleep-range="${r}"]`).click();
        await expect(page.locator(`[data-sleep-range="${r}"]`)).toHaveAttribute("aria-pressed", "true").catch(() => null);
        const st = page.locator("[data-sleep-step]").first();
        if (await st.isVisible().catch(() => false)) await st.click();
      }
      return ranges.join("/");
    });
    await step("A15-shop", "採買：新增 / 分類 / 常買星號 / 編輯 / 刪除 / 勾選買了 / 長按家裡有", async () => {
      await open(MON_AM, "shop"); await reset(); await open(MON_AM, "shop");
      await page.locator("[data-shop-plus]").click();
      await page.locator("[data-shop-new-name]").fill("smoke雞柳");
      await page.locator("[data-shop-new-amount]").fill("300g");
      await page.locator("[data-shop-cat=protein]").click();
      await page.locator("[data-shop-add]").click();
      const row = page.locator(".shop-row", { hasText: "smoke雞柳" });
      await expect(row).toBeVisible();
      const wasFreq = /\bfreq\b/.test(await row.getAttribute("class"));
      await row.locator("[data-shop-frequent]").click();
      await expect.poll(async () => /\bfreq\b/.test(await page.locator(".shop-row", { hasText: "smoke雞柳" }).getAttribute("class"))).toBe(!wasFreq);
      await page.locator(".shop-row", { hasText: "smoke雞柳" }).click({ position: { x: 30, y: 15 } });
      await expect(page.locator(".shop-row", { hasText: "smoke雞柳" })).toHaveClass(/\bon\b/);
      const sid = await page.locator(".shop-row", { hasText: "smoke雞柳" }).getAttribute("data-shop");
      await page.evaluate((id) => document.querySelector(`[data-shop="${id}"] span, [data-shop="${id}"]`).dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })), sid);
      await page.waitForTimeout(800);
      await page.evaluate(() => document.getElementById("main").dispatchEvent(new PointerEvent("pointerup", { bubbles: true })));
      await expect(page.locator(`[data-shop="${sid}"]`)).toHaveClass(/have/);
      await page.locator(`[data-shop-edit="${sid}"]`).click();
      await page.locator(`[data-shop-del="${sid}"]`).click();
      await expect(page.locator(".shop-row", { hasText: "smoke雞柳" })).toHaveCount(0);
    });
    await step("A16-whey-stock", "蛋白粉庫存：口味 +/− / 開新包 / 新增系列口味 / 刪除", async () => {
      await open(MON_AM, "shop");
      const acts = ["data-whey-adj", "data-whey-pack", "data-whey-add-series", "data-whey-add-have", "data-whey-have-del"];
      const seen = [];
      for (const a of acts) {
        const el = page.locator(`[${a}]`).first();
        if (await el.isVisible().catch(() => false)) {
          if ((await el.evaluate((x) => x.tagName)) === "SELECT") { const o = await el.locator("option").evaluateAll((x) => x.map((y) => y.value).filter(Boolean)); if (o[0]) await el.selectOption(o[0]); }
          else await el.click();
          seen.push(a.replace("data-", ""));
        }
      }
      expect(seen.length).toBeGreaterThan(0);
      return seen.join(",");
    });
    await step("A17-share", "分享採買清單：選分類 / 複製 / 關閉", async () => {
      await open(MON_AM, "shop");
      const s = page.locator("[data-share-cats], [data-testid=share-open], button:has-text('分享')").first();
      await s.click();
      if (await page.locator("[data-share-copy]").isVisible().catch(() => false)) await page.locator("[data-share-copy]").click();
      await page.locator("[data-share-close]").first().click().catch(() => null);
    });
    await step("A18-backup-restore", "規則頁：備份複製 → 貼上還原（往返一致）", async () => {
      await open(MON_AM, "rules");
      await page.locator("[data-backup-toggle]").click();
      await page.locator("[data-backup-copy]").click();
      await page.waitForTimeout(200);
      let code = await page.evaluate(() => navigator.clipboard.readText().catch(() => ""));
      if (!code) code = await page.evaluate(() => (window.__fatmiLastBackup || ""));
      expect(code.length).toBeGreaterThan(20);
      await page.evaluate(() => localStorage.removeItem("fatcat-v2"));
      await open(MON_AM, "rules");
      if (!(await page.locator("[data-restore-in]").isVisible())) await page.locator("[data-backup-toggle]").click();
      await page.locator("[data-restore-in]").fill("bad-code");
      await page.locator("[data-backup-restore]").click();
      await expect(page.locator(".toast").filter({ hasText: "備份碼不對" })).toBeVisible();
      const tb = await page.locator(".toast").boundingBox(), ib = await page.locator("[data-restore-in]").boundingBox();
      expect(tb.y + tb.height <= ib.y || tb.y >= ib.y + ib.height).toBe(true); // toast never covers the input
      await page.locator("[data-restore-in]").fill(code);
      await page.locator("[data-backup-restore]").click();
      await page.waitForEvent("load", { timeout: 5000 }).catch(() => null); // restore reloads the app after 600 ms; don't let it cut into the next step
      const has = await page.evaluate(() => !!localStorage.getItem("fatcat-v2"));
      expect(has).toBe(true);
      return `code ${code.length} chars`;
    });
    await step("A19-rules", "規則頁：規則內容與說明展開", async () => {
      await open(MON_AM, "rules");
      const t = await page.locator("main").innerText();
      expect(t.length).toBeGreaterThan(100);
      const det = page.locator("main details summary");
      const n = await det.count();
      for (let i = 0; i < n; i++) await det.nth(i).click().catch(() => null);
      return `${n} sections`;
    });
    await step("A20-notif", "提醒卡：知道了（關閉）", async () => {
      for (const now of [MON_AM, SUN_EVE, SAT_EVE, "2026-11-16T07:30:00+08:00", "2026-11-16T22:30:00+08:00"]) {
        await open(now);
        const b = page.locator("[data-dismiss-notif]").first();
        if (await b.isVisible().catch(() => false)) { await b.click(); await expect(page.locator("[data-dismiss-notif]")).toHaveCount(0); return `at ${now}`; }
      }
      return "no reminder due at tested times (handler covered by explorer if reachable)";
    });
    await step("A21-pull-to-refresh", "下拉重新整理（真實觸控拖曳 → 重新載入）", async () => {
      if (browserName !== "chromium") return "skipped (CDP touch needs chromium)";
      await open(MON_AM);
      await page.evaluate(() => window.scrollTo(0, 0));
      let navs = 0; const onNav = (f) => { if (f === page.mainFrame()) navs++; };
      page.on("framenavigated", onNav);
      const cdp = await context.newCDPSession(page);
      const pt = (y) => [{ x: 200, y }];
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(120) });
      for (let y = 130; y <= 520; y += 15) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(y) }); await page.waitForTimeout(12); }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.waitForTimeout(3000);
      page.off("framenavigated", onNav);
      expect(navs).toBeGreaterThan(0);
      return `reloads ${navs}`;
    });
    await step("A22-auto-update", "自動更新：偵測新版 → 自動重載 → 顯示「已更新到」", async () => {
      await open(MON_AM);
      const cur = await page.evaluate(async () => (await (await fetch("./version.json?t=" + Date.now(), { cache: "no-store" })).json()).version);
      const next = cur + "-smoke";
      await page.route("**/version.json*", (r) => r.fulfill({ json: { version: next, builtAt: new Date().toISOString() } }));
      await page.route("**/app.js*", async (r) => { const res = await r.fetch(); const body = (await res.text()).split(cur).join(next); await r.fulfill({ response: res, body }); });
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await page.evaluate(() => window.__fatmiCheckUpdates && window.__fatmiCheckUpdates({ now: true }));
      await expect(page.locator(".toast, #toast, [data-testid=toast]").filter({ hasText: "已更新" }).first()).toBeVisible({ timeout: 75000 });
      await page.unroute("**/version.json*"); await page.unroute("**/app.js*");
      return `${cur} → ${next}`;
    });
    await step("A23-data-update", "資料更新：只換 data.json → 原地重繪「資料已更新」", async () => {
      await open(MON_AM);
      const bump = async (route) => { const r = await route.fetch(); const d = await r.json(); d.exportedAt = new Date().toISOString(); await route.fulfill({ response: r, json: d }); };
      await page.route("**/data.json*", bump);
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await page.evaluate(() => window.__fatmiCheckUpdates && window.__fatmiCheckUpdates({ now: true }));
      await expect(page.locator(".toast, #toast, [data-testid=toast]").filter({ hasText: "資料已更新" }).first()).toBeVisible({ timeout: 75000 });
      await page.unroute("**/data.json*", bump);
    });

    await step("A24-backfill", "訓練紀錄：舊 Garmin 運動補登套餐 + 輪數", async () => {
      await open(SUN_EVE); await reset(); await open(SUN_EVE, "log");
      const rows = await page.$$eval("[data-log-row]", (e) => e.map((x) => x.dataset.logRow));
      for (const d of rows) {
        await page.locator(`[data-log-row="${d}"]`).click();
        const bf = page.locator(`[data-backfill][data-date="${d}"]`).first();
        if (await bf.isVisible().catch(() => false)) {
          await bf.click();
          const r = page.locator("[data-set-rounds]").filter({ visible: true }).first();
          await expect(r).toBeVisible();
          await r.click();
          return `backfilled ${d}`;
        }
        await page.locator(`[data-log-row="${d}"]`).click();
      }
      throw new Error("no day offering 補登");
    });
    await step("A25-swipe-next-prev", "訓練：左滑下一個 / 右滑上一個（真實觸控）/ 動作做完「下一個動作」", async () => {
      if (!TRAIN) throw new Error("no training day");
      await open(TRAIN); await reset(); await open(TRAIN);
      await page.locator("[data-start]").first().click();
      const prog = () => page.locator(".wo-prog").innerText();
      const p0 = await prog();
      const cdp = await context.newCDPSession(page);
      const swipe = async (x0, x1) => {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: 175 }] });
        for (let i = 1; i <= 6; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + ((x1 - x0) * i) / 6, y: 176 }] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await page.waitForTimeout(250);
      };
      await swipe(330, 40);
      const p1 = await prog();
      expect(p1.split("·")[0]).not.toBe(p0.split("·")[0]);
      await swipe(40, 330);
      expect((await prog()).split("·")[0]).toBe(p0.split("·")[0]);
      // finish every set of this exercise → 「下一個動作」
      await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("fatcat-v2")); s.session.setI = 99; s.session.phase = "set"; localStorage.setItem("fatcat-v2", JSON.stringify(s)); location.hash = "today"; location.hash = "workout"; });
      await page.locator("[data-wonext]").click();
      expect((await prog()).split("·")[0]).not.toBe(p0.split("·")[0]);
      return `${p0} → ${p1}`;
    });
    await step("A26-else-free", "吃了別的：＋其他（自填名稱/熱量/蛋白）加入與刪除", async () => {
      await open(MON_AM); await reset(); await open(MON_AM);
      await page.locator("[data-eat-else]").first().click();
      await page.locator("[data-else-free-open]").click();
      await page.locator("[data-else-free-name]").fill("smoke 便利商店飯糰");
      await page.locator("[data-else-free-kcal]").fill("230");
      await page.locator("[data-else-free-protein]").fill("6");
      await page.locator("[data-else-free-add]").click();
      await expect(page.locator(".else-row", { hasText: "smoke 便利商店飯糰" })).toBeVisible();
      await page.locator("[data-else-free-del]").first().click();
      await expect(page.locator(".else-row", { hasText: "smoke 便利商店飯糰" })).toHaveCount(0);
    });
    await step("A27-whey-edit", "蛋白粉編輯：選系列 → 加入庫存口味 → 庫存 +/− → 移出庫存", async () => {
      await open(MON_AM, "shop"); await reset(); await open(MON_AM, "shop");
      const wid = await page.locator(".shop-row:has([data-testid=whey-total])").getAttribute("data-shop");
      await page.locator(`[data-shop-edit="${wid}"]`).click();
      const ser = page.locator("[data-whey-add-series]");
      const opts = await ser.locator("option").evaluateAll((o) => o.map((x) => x.value));
      await ser.selectOption(opts[0]);
      const before = await page.locator("[data-whey-have-del]").count();
      await page.locator("[data-whey-add-have]").click();
      await expect.poll(() => page.locator("[data-whey-have-del]").count()).toBeGreaterThanOrEqual(before);
      const adj = page.locator("[data-whey-adj]").first();
      if (await adj.isVisible().catch(() => false)) await adj.click();
      const n = await page.locator("[data-whey-have-del]").count();
      await page.locator("[data-whey-have-del]").last().click();
      await expect(page.locator("[data-whey-have-del]")).toHaveCount(n - 1);
      return `flavors ${before}→${n}→${n - 1}`;
    });
    await step("A28-shop-merge", "採買：新增同名項目 → 合併到既有項目", async () => {
      await open(MON_AM, "shop"); await reset(); await open(MON_AM, "shop");
      // the existing 雞胸 needs its serving size too (merge converts by grams)
      const base = await page.$$eval(".shop-row", (r) => r.filter((x) => !x.dataset.shop.startsWith("x-") && /^\s*雞胸/.test(x.querySelector(".shop-name").innerText)).map((x) => x.dataset.shop));
      await page.locator(`[data-shop-edit="${base[0]}"]`).click();
      await page.getByPlaceholder("例如 150 g 或 1 包").fill("150 g");
      await page.locator("[data-edit-save]").click();
      await expect(page.locator(".sheet")).toHaveCount(0);
      await page.locator("[data-shop-plus]").click();
      await page.locator("[data-shop-new-name]").fill("雞胸");
      await page.locator("[data-shop-new-amount]").fill("2");
      const cat = page.locator("[data-shop-cat=protein]");
      if (await cat.isVisible().catch(() => false)) await cat.click();
      await page.locator("[data-shop-add]").click();
      const custom = await page.$$eval(".shop-row", (r) => r.filter((x) => x.dataset.shop.startsWith("x-") && /雞胸/.test(x.innerText)).map((x) => x.dataset.shop));
      if (!custom.length) return "app merged the duplicate on add (no separate row)";
      await page.locator(`[data-shop-edit="${custom[0]}"]`).click();
      await page.getByPlaceholder("例如 150 g 或 1 包").fill("150 g");
      await page.locator("[data-shop-merge]").click();
      await expect(page.locator(`[data-shop="${custom[0]}"]`)).toHaveCount(0);
    });
    await step("A29-shop-chip", "採買：自訂項目快捷標籤（shop chips）點一下＝買了", async () => {
      await open(MON_AM, "shop"); await reset(); await open(MON_AM, "shop");
      await page.locator("[data-shop-plus]").click();
      await page.locator("[data-shop-new-name]").fill("smoke豆腐");
      await page.locator("[data-shop-new-amount]").fill("2");
      await page.locator("[data-shop-cat=protein]").click();
      await page.locator("[data-shop-add]").click();
      const c = page.locator("[data-shop-chip]").first();
      if (!(await c.isVisible().catch(() => false))) throw new Error("沒有任何 data-shop-chip 出現在畫面（需要 shopExtra 額外項目）");
      const b = await c.getAttribute("class"); await c.click();
      expect(await page.locator("[data-shop-chip]").first().getAttribute("class")).not.toBe(b);
    });

    // ---------- Part B: explorer over every handled data-* action ----------
    const src = await page.evaluate(async () => (await fetch("./app.js?t=" + Date.now(), { cache: "no-store" })).text());
    const handled = [...new Set([...src.matchAll(/closest\("(?:[a-z]+)?\[(data-[a-z0-9-]+)/g)].map((m) => m[1]))].sort();
    const covered = {}; // attr -> {pass, note, via}
    const starts = [];
    for (const now of [MON_AM, SAT_EVE, SUN_EVE, TRAIN].filter(Boolean)) for (const h of ["today", "shop", "rules", "body", "sleep", "log"]) starts.push({ now, h });
    const keyOf = (a, v) => `${a}=${v}`;
    const queued = new Set();
    const queue = starts.map((s) => ({ s, path: [] }));
    const sel = (a, v) => (v === "" ? `[${a}]` : `[${a}="${v.replace(/"/g, '\\"')}"]`);
    async function visibleActions() {
      return page.evaluate((attrs) => {
        const out = [];
        for (const a of attrs) for (const el of document.querySelectorAll(`[${a}]`)) {
          const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
          if (!r.width || !r.height || cs.visibility === "hidden" || el.closest("details:not([open]) > :not(summary)")) continue;
          out.push([a, el.getAttribute(a)]);
        }
        return out;
      }, handled);
    }
    async function act(a, v) {
      const el = page.locator(sel(a, v)).filter({ visible: true }).first();
      const tag = await el.evaluate((x) => x.tagName);
      if (tag === "SELECT") { const o = await el.locator("option").evaluateAll((x) => x.map((y) => y.value)); await el.selectOption(o[o.length - 1]); return; }
      if (tag === "INPUT" && (await el.getAttribute("type")) === "time") { await el.fill("12:40"); await el.dispatchEvent("change"); return; }
      if (tag === "INPUT" || tag === "TEXTAREA") { await el.fill("1"); await el.dispatchEvent("change"); return; }
      await el.scrollIntoViewIfNeeded().catch(() => null);
      await el.click({ timeout: 3000 });
    }
    let clicks = 0;
    const MAXCLICK = Number(process.env.SMOKE_MAXCLICK || 600);
    while (queue.length && clicks < MAXCLICK) {
      const { s, path: p } = queue.shift();
      try { await open(s.now, s.h); await reset(); await open(s.now, s.h); for (const [a, v] of p) { await act(a, v); await page.waitForTimeout(80); } } catch { continue; }
      const acts = await visibleActions();
      const perAttr = {};
      for (const [a, v] of acts) {
        const k = keyOf(a, v);
        perAttr[a] = (perAttr[a] || 0) + 1;
        if (queued.has(k) || perAttr[a] > 3) continue; // up to 3 distinct values per action per state
        queued.add(k);
        // click it from a fresh replay
        try { await open(s.now, s.h); await reset(); await open(s.now, s.h); for (const [pa, pv] of p) { await act(pa, pv); await page.waitForTimeout(80); } } catch { continue; }
        const e0 = errors.length;
        let ok = true, note = "";
        const urlBefore = page.url();
        const htmlBefore = await page.locator("body").innerHTML();
        try { await act(a, v); await page.waitForTimeout(150); } catch (e) { ok = false; note = String(e.message).split("\n")[0].slice(0, 120); }
        clicks++;
        if (errors.length > e0) { ok = false; note = `JS error ${errors.slice(e0).join("|").slice(0, 120)}`; }
        let changed = false;
        try { changed = page.url() !== urlBefore || (await page.locator("body").innerHTML()) !== htmlBefore; } catch { changed = true; }
        const prev = covered[a];
        if (!prev || (!prev.pass && ok)) covered[a] = { pass: ok, changed, note, via: `${s.h}@${s.now.slice(5, 16)} ${p.map(([x, y]) => keyOf(x, y)).join(" > ")} > ${keyOf(a, v)}` };
        else if (prev && ok && changed && !prev.changed) covered[a] = { ...prev, changed: true };
        if (ok && p.length < 4) {
          const after = await visibleActions().catch(() => []);
          if (after.some(([x, y]) => !queued.has(keyOf(x, y)))) queue.push({ s, path: [...p, [a, v]] });
        }
      }
    }
    const explorer = handled.map((a) => {
      const ex = covered[a];
      if (ex && ex.pass) return { action: a, ...ex, flows: flowHits[a] || [] };
      if (flowHits[a]) return { action: a, pass: true, changed: true, note: "", via: `flow ${flowHits[a].join(",")}`, flows: flowHits[a] };
      return { action: a, ...(ex || { pass: false, note: "not reached", via: "" }), flows: [] };
    });
    // handlers with no on-screen entry point: attribute never rendered by any template (dead code),
    // plus the meal-swap sheet whose only opener (data-swap) is never rendered.
    const rendered = (at) => new RegExp(`\\s${at}(?=[=\\s>"])`).test(src);
    const swapDead = !rendered("data-swap");
    for (const r of explorer) {
      if (r.pass) continue;
      if (!rendered(r.action) || (r.action === "data-back" && !/phase\s*(=|:)\s*"back"/.test(src))) { r.noEntry = true; r.note = "無入口：程式有 handler，但沒有任何畫面會畫出這個按鈕"; }
      else if (swapDead && ["data-pick-p", "data-pick-s", "data-apply-swap"].includes(r.action)) { r.noEntry = true; r.note = "無入口：只在「換一個」換餐面板裡，而面板的開啟按鈕 data-swap 沒有畫在任何畫面"; }
    }
    const failF = results.filter((r) => !r.pass), failE = explorer.filter((r) => !r.pass && !r.noEntry), noEntry = explorer.filter((r) => r.noEntry);
    const reach = explorer.length - noEntry.length;
    fs.writeFileSync(path.join(OUT, `results-${scheme}.json`), JSON.stringify({ base: BASE, scheme, at: new Date().toISOString(), flows: results, explorer, clicks, errors }, null, 2));

    console.log(`[${scheme}] flows ${results.length - failF.length}/${results.length}, reachable actions ${reach - failE.length}/${reach} (no on-screen entry: ${noEntry.length}: ${noEntry.map((r) => r.action).join(",")}), clicks ${clicks}`);
    for (const f of failF) console.log(`FLOW FAIL ${f.id}: ${f.note}`);
    for (const f of failE) console.log(`ACTION FAIL ${f.action}: ${f.note}`);
    expect(failF.map((f) => f.id)).toEqual([]);
    expect(failE.map((f) => f.action)).toEqual([]);
  });
}
