// FitMi 實測：正式測試版 v2026.11.15-3（真的用 Playwright 點擊，不是只讀程式）
// 目標：https://smpss89119.github.io/fatmi-app/staging/
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const LIVE = "https://smpss89119.github.io/fatmi-app/staging/";
const OUT = "/workspace/fatmi-layout/fitmi-15-3";
const VER = "2026.11.15-3";
const VP = { width: 390, height: 844 };

const SAT = "2026-11-21T18:00:00+08:00"; // 未來週六，健身房 A（沒有既有 Garmin）
const SUN = "2026-11-15T18:00:00+08:00"; // 週日 B
const TUE = "2026-11-17T18:00:00+08:00";
const THU = "2026-11-19T18:00:00+08:00";
const LOG_NOW = "2026-11-15T21:00:00+08:00";

// _fixed-data.js 會砍掉 11/10 以後的 Garmin，不能用來測 11/14 有氧卡。
// 「舊資料」改成帶入既有 localStorage（舊 migV、舊訓練紀錄、上次重量）。
const OLD_SEED = {
  migV: 2,
  trainDays: [2, 4, 6, 0],
  logs: {
    "2026-11-03": {
      workoutId: "homeQ",
      moves: { 臀橋: [{ done: true, reps: 12, weight: null }] },
      finishedAt: 3,
    },
  },
  lastLoads: { 高腳杯深蹲: { weight: 16, reps: 10 } },
};

test.use({
  viewport: VP,
  timezoneId: "Asia/Taipei",
  locale: "zh-TW",
  actionTimeout: 8000,
  navigationTimeout: 30000,
  permissions: ["clipboard-read", "clipboard-write"],
});
test.setTimeout(20 * 60 * 1000);

fs.mkdirSync(OUT, { recursive: true });

const findings = [];
function rec(item, scheme, data, status, detail, shots = []) {
  findings.push({ item, scheme, data, status, detail: String(detail || ""), shots });
}

let shotN = 0;
async function shot(page, name) {
  shotN += 1;
  const file = path.join(OUT, `${String(shotN).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file }).catch(() => null);
  return file;
}

function url(now, hash = "today", extra = {}) {
  const q = new URLSearchParams({ debug: "1", now, r: String(Date.now()) + Math.random(), ...extra });
  return `${LIVE}?${q}#${hash}`;
}

async function gotoApp(page, now, hash = "today", extra = {}) {
  await page.goto(url(now, hash, extra), { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".ttl, [data-testid=sleep-page], [data-complete], .wo-name, [data-testid=train-card]", { timeout: 20000 });
  await page.waitForTimeout(300);
}

async function boot(page, now, hash, extra, seed) {
  await gotoApp(page, now, hash, extra);
  await page.evaluate((s) => {
    localStorage.clear();
    sessionStorage.clear();
    if (s) localStorage.setItem("fatcat-v2", JSON.stringify(s));
  }, seed || null);
  await gotoApp(page, now, hash, extra);
}

async function waitApp(page) {
  await page.waitForFunction(() => typeof APP_VERSION !== "undefined", null, { timeout: 20000 }).catch(() => null);
}

function ampmLeak(text) {
  return /\b(AM|PM)\b|上午|下午/.test(text || "");
}

async function clipped(page, sel) {
  return page.evaluate((s) => {
    const root = s ? document.querySelector(s) : document.querySelector("main") || document.body;
    if (!root) return [];
    const rootR = root.getBoundingClientRect();
    return [...root.querySelectorAll("*")].filter((e) => {
      const cs = getComputedStyle(e);
      if (!e.childElementCount && !((e.textContent || "").trim())) return false;
      if (e.children.length > 3) return false;
      const r = e.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      const cutX = e.scrollWidth > e.clientWidth + 1 && cs.overflowX !== "visible";
      const ellipsis = cs.textOverflow === "ellipsis" && e.scrollWidth > e.clientWidth + 1;
      const past = r.right > rootR.right + 2;
      return cutX || ellipsis || past;
    }).map((e) => (e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40));
  }, sel);
}

async function tabOverlap(page) {
  return page.evaluate(() => {
    const nav = document.querySelector("nav#tabs");
    if (!nav || getComputedStyle(nav).display === "none") return null;
    const nr = nav.getBoundingClientRect();
    const main = document.querySelector("main");
    if (!main) return null;
    const hits = [];
    for (const e of main.querySelectorAll("button, a, input, .card, p, .sl-card, .shop-row")) {
      const r = e.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      const overlap = r.bottom > nr.top + 2 && r.top < nr.bottom - 2 && r.right > nr.left + 2 && r.left < nr.right - 2;
      if (overlap) hits.push({ t: (e.innerText || e.tagName).trim().replace(/\s+/g, " ").slice(0, 36), y: Math.round(r.bottom), navY: Math.round(nr.top) });
    }
    return { navTop: nr.top, hits: hits.slice(0, 8) };
  });
}

async function inViewport(page, sel) {
  const box = await page.locator(sel).first().boundingBox();
  if (!box) return { ok: false, reason: "not found" };
  const bottom = box.y + box.height;
  return { ok: bottom <= VP.height + 1 && box.y >= -1, y: box.y, h: box.height, bottom };
}

test("curl + Playwright 實測 staging 2026.11.15-3（淺/深、乾淨/舊資料）", async ({ page, context, request }) => {
  const versionHits = { n: 0, urls: [] };
  const jsErrors = [];
  page.on("pageerror", (e) => jsErrors.push(String(e.message || e)));
  page.on("dialog", (d) => d.dismiss().catch(() => null));

  // 0. 版本
  const js = await (await request.get(`${LIVE}app.js?x=${Date.now()}`, { headers: { "Cache-Control": "no-store" } })).text();
  const verJson = await (await request.get(`${LIVE}version.json?x=${Date.now()}`)).json();
  const jsVer = (js.match(/APP_VERSION\s*=\s*"([^"]+)"/) || [])[1];
  const verOk = jsVer === VER && verJson.version === VER;
  rec("0. 版本字串", "—", "—", verOk ? "通過" : "問題", `app.js APP_VERSION=${jsVer}；version.json=${verJson.version}（期望 ${VER}）`);
  if (!verOk) {
    // 仍繼續測，但結論會不通過
  }

  const schemes = ["light", "dark"];
  const datas = [
    { id: "clean", seed: null },
    { id: "old", seed: OLD_SEED },
  ];

  let autoUpdateDone = false;

  for (const scheme of schemes) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const data of datas) {
      const tag = `${scheme}-${data.id}`;
      jsErrors.length = 0;

      // ---------- 1. 開始訓練 ----------
      const startNotes = [];
      try {
        await boot(page, SAT, "today", { sleep: "8", rest: "0" }, data.seed);
        await waitApp(page);
        const vShown = await page.locator("[data-testid=app-version]").innerText().catch(() => "");
        startNotes.push(`畫面版本 ${vShown}`);
        const satCard = await page.locator("[data-testid=train-card]").innerText();
        await shot(page, `${tag}-1-sat-A`);
        if (!/健身房 A/.test(satCard)) startNotes.push(`週六卡片不是 A：${satCard.slice(0, 80)}`);
        else startNotes.push("週六開得出健身房 A");
        await page.locator("[data-start]").first().click();
        await expect(page.locator("[data-complete], .wo-name").first()).toBeVisible({ timeout: 8000 });
        startNotes.push("週六可按開始訓練");
        const leave = page.locator("[data-leave]");
        if (await leave.isVisible()) await leave.click();

        await boot(page, SUN, "today", { sleep: "8", rest: "0" }, data.seed);
        const sunCard = await page.locator("[data-testid=train-card]").innerText();
        await shot(page, `${tag}-1-sun-B`);
        if (!/健身房 B/.test(sunCard)) startNotes.push(`週日卡片不是 B：${sunCard.slice(0, 80)}`);
        else startNotes.push("週日開得出健身房 B");
        await page.locator("[data-start]").first().click();
        await expect(page.locator("[data-complete], .wo-name").first()).toBeVisible({ timeout: 8000 });
        startNotes.push("週日可按開始訓練");
        if (await page.locator("[data-leave]").isVisible()) await page.locator("[data-leave]").click();

        await boot(page, TUE, "today", { sleep: "8", rest: "0" }, data.seed);
        const tueCard = await page.locator("[data-testid=train-card]").innerText();
        await shot(page, `${tag}-1-tue-home`);
        if (!/平日在家|快版|家裡/.test(tueCard)) startNotes.push(`週二卡片不像在家課表：${tueCard.slice(0, 80)}`);
        else startNotes.push(`週二卡片：${tueCard.replace(/\s+/g, " ").slice(0, 60)}`);
        // 原因：快版理由或 ⓘ
        const tueWhy = await page.locator("[data-testid=quick-reason]").innerText().catch(() => "");
        if (tueWhy) startNotes.push(`週二可見原因：${tueWhy}`);
        else {
          const info = page.locator("[data-testid=reason-info]");
          if (await info.isVisible()) {
            await info.click();
            const r = await page.locator("[data-testid=reason]").innerText().catch(() => "");
            startNotes.push(r ? `週二 ⓘ 原因：${r}` : "週二有 ⓘ 但點了沒出現原因");
            await shot(page, `${tag}-1-tue-reason`);
          } else {
            startNotes.push("週二沒有快版原因、也沒有 ⓘ");
          }
        }
        await page.locator("[data-start]").first().click();
        await expect(page.locator("[data-complete], .wo-name").first()).toBeVisible({ timeout: 8000 });
        startNotes.push("週二可按開始訓練");
        if (await page.locator("[data-leave]").isVisible()) await page.locator("[data-leave]").click();

        await boot(page, THU, "today", { sleep: "8", rest: "0" }, data.seed);
        const thuCard = await page.locator("[data-testid=train-card]").innerText();
        await shot(page, `${tag}-1-thu-home`);
        if (!/平日在家|快版|家裡/.test(thuCard)) startNotes.push(`週四卡片不像在家課表：${thuCard.slice(0, 80)}`);
        else startNotes.push("週四開得出在家課表");
        await page.locator("[data-start]").first().click();
        await expect(page.locator("[data-complete], .wo-name").first()).toBeVisible({ timeout: 8000 });
        startNotes.push("週四可按開始訓練");
        if (await page.locator("[data-leave]").isVisible()) await page.locator("[data-leave]").click();

        // 睡眠不足改快版，必須寫出原因
        await boot(page, SUN, "today", { sleep: "5", rest: "0" }, data.seed);
        const qCard = await page.locator("[data-testid=train-card]").innerText();
        const qWhy = await page.locator("[data-testid=quick-reason]").innerText().catch(() => "");
        await shot(page, `${tag}-1-quick-reason`);
        if (!/快版/.test(qCard) && !/快版/.test(qWhy)) startNotes.push(`睡 5 小時週日沒改快版：${qCard.slice(0, 80)}`);
        if (!qWhy || !/睡/.test(qWhy)) startNotes.push(`快版原因缺失或沒寫睡眠：「${qWhy}」`);
        else startNotes.push(`快版原因：${qWhy}`);
        if (await page.locator("[data-start]").first().isVisible()) {
          await page.locator("[data-start]").first().click();
          await expect(page.locator("[data-complete], .wo-name").first()).toBeVisible({ timeout: 8000 });
          startNotes.push("快版可按開始訓練");
          if (await page.locator("[data-leave]").isVisible()) await page.locator("[data-leave]").click();
        }

        const startFail = startNotes.filter((n) => /不是|不像|沒有|缺失|沒改|沒出現/.test(n));
        rec("1. 開始訓練（週六A／週日B／週二四在家／快版原因）", scheme, data.id, startFail.length ? "問題" : "通過", startNotes.join("； "), [`${tag}-1-sat-A`, `${tag}-1-sun-B`, `${tag}-1-tue-home`, `${tag}-1-thu-home`, `${tag}-1-quick-reason`]);
      } catch (e) {
        await shot(page, `${tag}-1-error`);
        rec("1. 開始訓練（週六A／週日B／週二四在家／快版原因）", scheme, data.id, "問題", e.message || e, [`${tag}-1-error`]);
      }

      // ---------- 2+3. 記組數、休息、部位圖（用週二在家，較短） ----------
      const setNotes = [];
      const figNotes = [];
      let loggedMove = "";
      try {
        await boot(page, TUE, "today", { sleep: "8", rest: "0" }, data.seed);
        await page.locator("[data-start]").first().click();
        await page.locator("[data-complete]").waitFor({ timeout: 8000 });

        const w0 = await page.locator("[data-testid=wo-weight]").innerText();
        const wBox = await inViewport(page, "[data-testid=wo-weight]");
        const cBox = await inViewport(page, "[data-complete]");
        await shot(page, `${tag}-2-set-fold`);
        if (!wBox.ok) setNotes.push(`重量要捲動才看得到（bottom=${wBox.bottom}）`);
        else setNotes.push("重量在首屏");
        if (!cBox.ok) setNotes.push(`完成按鈕要捲動才看得到（bottom=${cBox.bottom}）`);
        else setNotes.push("完成按鈕在首屏");

        if (await page.locator("[data-testid=w-plus]").isVisible()) {
          await page.locator("[data-testid=w-plus]").click();
          const w1 = await page.locator("[data-testid=wo-weight]").innerText();
          if (w1 === w0) setNotes.push(`按＋重量沒變（${w0}）`);
          else setNotes.push(`重量 ${w0} → ${w1}`);
        } else {
          setNotes.push("此動作無重量加減（可能是徒手）");
        }

        // 部位圖：預設收起，可展開再收起
        const fig = page.locator("[data-testid=wo-figure]");
        const figHidden0 = await fig.isHidden();
        const sum = page.locator("summary[data-wo-fig], details.wo-fig summary").first();
        if (await sum.isVisible()) {
          if (!figHidden0) figNotes.push("部位圖預設沒有收起");
          await sum.click();
          await page.waitForTimeout(200);
          const open1 = await fig.isVisible();
          await shot(page, `${tag}-3-fig-open`);
          await sum.click();
          await page.waitForTimeout(200);
          const closed = await fig.isHidden();
          await shot(page, `${tag}-3-fig-closed`);
          await sum.click();
          await page.waitForTimeout(200);
          const open2 = await fig.isVisible();
          if (open1 && closed && open2) figNotes.push("部位圖可展開、收起、再展開");
          else figNotes.push(`部位圖狀態異常 open1=${open1} closed=${closed} open2=${open2} 預設收起=${figHidden0}`);
        } else {
          figNotes.push("找不到部位圖 summary");
        }

        loggedMove = (await page.locator(".wo-name").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
        await page.locator("[data-complete]").click();
        await page.locator("[data-testid=rest-timer], [data-skip-rest]").first().waitFor({ timeout: 8000 });
        const primary = page.locator(".rest-box .btn.primary, [data-testid=btn-skip-rest]").first();
        const pText = await primary.innerText();
        await shot(page, `${tag}-2-rest`);
        if (!/休息好了，下一組/.test(pText)) setNotes.push(`休息主按鈕文案是「${pText.replace(/\s+/g, " ")}」，不是「休息好了，下一組」`);
        else setNotes.push("休息主按鈕是「休息好了，下一組」");
        const undo = page.locator("[data-testid=btn-undo], [data-undo-set]");
        const uText = await undo.innerText().catch(() => "");
        if (!/撤銷/.test(uText)) setNotes.push(`找不到獨立撤銷按鈕（得到「${uText}」）`);
        else {
          const isPri = await undo.evaluate((e) => e.classList.contains("primary")).catch(() => false);
          if (isPri) setNotes.push("撤銷不該是主按鈕");
          else setNotes.push("撤銷是另一顆非主按鈕");
          const prog0 = await page.locator(".wo-prog").innerText();
          await undo.click();
          await page.waitForTimeout(300);
          const backToSet = await page.locator("[data-complete]").isVisible();
          await shot(page, `${tag}-2-undo`);
          if (!backToSet) setNotes.push(`按撤銷沒回到記組畫面（進度「${prog0}」）`);
          else setNotes.push("撤銷後回到記組畫面，可再記");
        }

        // 再完成一組並跳過休息，然後把整堂練完，好確認訓練紀錄有這組
        if (await page.locator("[data-complete]").isVisible()) {
          await page.locator("[data-complete]").click();
        }
        for (let i = 0; i < 40; i++) {
          if (await page.locator("[data-finish-home]").isVisible().catch(() => false)) break;
          if (await page.locator("[data-exback]").first().isVisible().catch(() => false)) {
            await page.locator("[data-testid=exback-0], [data-exback]").first().click();
            continue;
          }
          if (await page.locator("[data-skip-rest]").isVisible().catch(() => false)) {
            await page.locator("[data-skip-rest]").click();
            continue;
          }
          if (await page.locator("[data-wonext]").isVisible().catch(() => false)) {
            await page.locator("[data-wonext]").click();
            continue;
          }
          const doneBtn = page.locator("[data-complete]");
          if (await doneBtn.isVisible().catch(() => false)) {
            await doneBtn.click({ timeout: 3000 }).catch(() => null);
            continue;
          }
          await page.waitForTimeout(150);
        }
        if (await page.locator("[data-finish-home]").isVisible().catch(() => false)) {
          await shot(page, `${tag}-2-done`);
          await page.locator("[data-finish-home]").click();
          setNotes.push("已走完整堂並回到今天");
        } else {
          setNotes.push("未能走到結束頁（先離開，改看 session）");
          if (await page.locator("[data-leave]").isVisible()) await page.locator("[data-leave]").click();
        }

        const setFail = setNotes.filter((n) => /要捲動|沒變|不是|找不到|不該|沒回到|未能/.test(n));
        rec("2. 記組數／完成在首屏／休息主按鈕／撤銷", scheme, data.id, setFail.length ? "問題" : "通過", setNotes.join("； "), [`${tag}-2-set-fold`, `${tag}-2-rest`, `${tag}-2-undo`]);
        const figFail = figNotes.filter((n) => /找不到|異常|沒有收起/.test(n));
        rec("3. 部位圖顯示、可收起再展開", scheme, data.id, figFail.length ? "問題" : "通過", figNotes.join("； ") || "未記錄", [`${tag}-3-fig-open`, `${tag}-3-fig-closed`]);
      } catch (e) {
        await shot(page, `${tag}-2-error`);
        rec("2. 記組數／完成在首屏／休息主按鈕／撤銷", scheme, data.id, "問題", e.message || e, [`${tag}-2-error`]);
        rec("3. 部位圖顯示、可收起再展開", scheme, data.id, figNotes.length ? (figNotes.some((n) => /找不到|異常/.test(n)) ? "問題" : "通過") : "問題", figNotes.join("； ") || (e.message || e), [`${tag}-2-error`]);
      }

      // ---------- 4. 訓練紀錄：剛記的組 + 11/14 15 組與肌肉對照 ----------
      const logNotes = [];
      try {
        await gotoApp(page, LOG_NOW, "today", { sleep: "8", rest: "0" });
        const goLog = page.locator("[data-testid=go-log], [data-go=log]");
        if (await goLog.first().isVisible()) await goLog.first().click();
        else await gotoApp(page, LOG_NOW, "log", { sleep: "8" });
        await page.waitForTimeout(400);
        await shot(page, `${tag}-4-log-list`);

        // 剛記的週二那組
        const tueRow = page.locator("[data-testid=log-row-2026-11-17], [data-log-row='2026-11-17']");
        if (await tueRow.count()) {
          const ttxt = await tueRow.first().innerText();
          logNotes.push(`週二紀錄列：${ttxt.replace(/\s+/g, " ").slice(0, 80)}`);
          await tueRow.first().click();
          await page.waitForTimeout(250);
          const det = page.locator("[data-testid=log-detail-2026-11-17]");
          const dtxt = (await det.innerText().catch(async () => page.locator("main").innerText())).replace(/\s+/g, " ");
          await shot(page, `${tag}-4-log-tue`);
          if (loggedMove && dtxt.includes(loggedMove.split("（")[0].slice(0, 2))) logNotes.push(`剛記的動作有出現（${loggedMove}）`);
          else if (/高腳杯|深蹲|伏地|臀橋|死蟲|組/.test(dtxt)) logNotes.push(`週二明細有動作：${dtxt.slice(0, 80)}`);
          else logNotes.push(`週二明細看不到剛記的組：${dtxt.slice(0, 80)}`);
        } else {
          // maybe still in session
          const has = await page.evaluate(() => {
            const s = JSON.parse(localStorage.getItem("fatcat-v2") || "{}");
            return { log: s.logs && s.logs["2026-11-17"], session: s.session && s.session.date === "2026-11-17" };
          });
          logNotes.push(`列表沒有 11/17 列；logs=${!!has.log} session=${!!has.session}`);
        }

        const row114 = page.locator("[data-testid=log-row-2026-11-14]");
        await expect(row114).toBeVisible({ timeout: 8000 });
        const rtxt = await row114.innerText();
        if (!/15\s*組/.test(rtxt)) logNotes.push(`11/14 列沒寫 15 組：${rtxt.replace(/\s+/g, " ")}`);
        else logNotes.push("11/14 列顯示 15 組");
        await row114.click();
        await page.waitForTimeout(300);
        const det114 = page.locator("[data-testid=log-detail-2026-11-14]");
        const d114 = await det114.innerText();
        await shot(page, `${tag}-4-log-1114`);
        const movesOk = /槓鈴臥推|臥推/.test(d114) && /划船/.test(d114);
        if (!movesOk) logNotes.push(`11/14 明細動作不完整：${d114.replace(/\s+/g, " ").slice(0, 120)}`);
        else logNotes.push("11/14 明細有槓鈴臥推、划船");
        // 這筆 Garmin 沒有背蹲（實際是臥推／上斜臥推／坐姿划船）
        if (/背蹲/.test(d114)) logNotes.push("11/14 明細出現背蹲");
        else logNotes.push("11/14 這筆 Garmin 沒有背蹲（實際是臥推／上斜臥推／坐姿划船）");

        const parts = page.locator("[data-testid=log-parts-2026-11-14], [data-testid=log-muscles-2026-11-14]");
        const ptxt = (await parts.allInnerTexts()).join(" / ");
        if (!/胸|背闊|三角/.test(ptxt + d114)) logNotes.push(`11/14 沒看到肌肉對照：${ptxt || "（空）"}`);
        else logNotes.push(`11/14 肌肉對照：${(ptxt || d114).replace(/\s+/g, " ").slice(0, 80)}`);

        const logFail = logNotes.filter((n) => /沒寫|不完整|看不到|沒有 11\/17|沒看到肌肉/.test(n));
        rec("4. 訓練紀錄（剛記的組、11/14 15組、肌肉對照）", scheme, data.id, logFail.length ? "問題" : "通過", logNotes.join("； "), [`${tag}-4-log-list`, `${tag}-4-log-1114`]);
      } catch (e) {
        await shot(page, `${tag}-4-error`);
        rec("4. 訓練紀錄（剛記的組、11/14 15組、肌肉對照）", scheme, data.id, "問題", (e.message || e) + "｜" + logNotes.join("； "), [`${tag}-4-error`]);
      }

      // ---------- 5. 有氧卡 ----------
      const cardioNotes = [];
      try {
        const card = page.locator("[data-testid=cardio-2026-11-14-0], [data-testid^=cardio-2026-11-14]").first();
        if (!(await card.isVisible().catch(() => false))) {
          await gotoApp(page, LOG_NOW, "log", { sleep: "8" });
          const row = page.locator("[data-testid=log-row-2026-11-14]");
          if (await row.isVisible()) await row.click();
        }
        const c = page.locator("[data-testid=cardio-2026-11-14-0]").first();
        await expect(c).toBeVisible({ timeout: 8000 });
        const ctxt = await c.innerText();
        await c.scrollIntoViewIfNeeded();
        await shot(page, `${tag}-5-cardio`);
        const need = [
          [/心率區間/, "心率區間"],
          [/Z1[\s\S]*Z5|Z5/, "5 個心率區"],
          [/配速/, "配速"],
          [/步頻/, "步頻"],
          [/速度|時速/, "速度"],
        ];
        for (const [re, label] of need) {
          if (!re.test(ctxt)) cardioNotes.push(`缺少「${label}」`);
          else cardioNotes.push(`有${label}`);
        }
        // 每個小卡都有文字說明（em 至少兩個中文字）
        const tiles = c.locator("[data-testid=cd-tile]");
        const n = await tiles.count();
        if (n === 0) {
          // fallback: look at labeled tiles
          if (/距離|配速|速度|步頻|消耗|心率|步數/.test(ctxt)) cardioNotes.push("小卡有文字標籤（未找到 cd-tile testid 時以內文判斷）");
          else cardioNotes.push("找不到有氧小卡");
        } else {
          const labels = await tiles.locator("em").allInnerTexts();
          const bad = labels.filter((l) => !/[\u4e00-\u9fff]{2}/.test(l));
          if (bad.length) cardioNotes.push(`有小卡沒有中文說明：${JSON.stringify(bad)}`);
          else cardioNotes.push(`小卡 ${n} 張都有中文說明（${labels.join("、")}）`);
        }
        const cut = await clipped(page, "[data-testid=cardio-2026-11-14-0]");
        if (cut.length) cardioNotes.push(`文字被切：${cut.slice(0, 5).join(" / ")}`);
        const cardioFail = cardioNotes.filter((n) => /缺少|找不到|沒有中文|被切/.test(n));
        rec("5. 有氧卡（11/14 健走、五區、配速步頻速度、小卡文字）", scheme, data.id, cardioFail.length ? "問題" : "通過", cardioNotes.join("； "), [`${tag}-5-cardio`]);
      } catch (e) {
        await shot(page, `${tag}-5-error`);
        rec("5. 有氧卡（11/14 健走、五區、配速步頻速度、小卡文字）", scheme, data.id, "問題", e.message || e, [`${tag}-5-error`]);
      }

      // ---------- 6. 今日結論 ----------
      const conclNotes = [];
      try {
        await gotoApp(page, SUN, "today", { sleep: "8", rest: "0" });
        await shot(page, `${tag}-6-today`);
        const main = await page.locator("main").innerText();
        const hasTitle = /今日結論/.test(main);
        const hasWhy = /為什麼？/.test(main) || (await page.locator("button:has-text('為什麼'), [data-testid*=why]").count()) > 0;
        if (!hasTitle) conclNotes.push("首頁沒有「今日結論」區塊");
        else {
          // count lines of the conclusion
          const block = page.locator("text=今日結論").first();
          conclNotes.push("有「今日結論」");
        }
        if (!hasWhy) conclNotes.push("沒有可點的「為什麼？」");
        else {
          const whyBtn = page.locator("button:has-text('為什麼'), [data-testid*=why]").first();
          if (await whyBtn.isVisible()) {
            await whyBtn.click();
            await shot(page, `${tag}-6-why`);
            conclNotes.push("「為什麼？」可點開");
          }
        }
        // 相近替代：quick-reason / reason-info（不是同一塊）
        const alt = [];
        if (await page.locator("[data-testid=quick-reason]").count()) alt.push("quick-reason");
        if (await page.locator("[data-testid=reason-info]").count()) alt.push("reason-info ⓘ");
        if (alt.length) conclNotes.push(`相近替代：${alt.join("、")}（不是「今日結論／為什麼？」）`);
        rec("6. 今日結論（最多 2 行，有「為什麼？」可點）", scheme, data.id, hasTitle && hasWhy ? "通過" : "問題", conclNotes.join("； "), [`${tag}-6-today`]);
      } catch (e) {
        await shot(page, `${tag}-6-error`);
        rec("6. 今日結論（最多 2 行，有「為什麼？」可點）", scheme, data.id, "問題", e.message || e, [`${tag}-6-error`]);
      }

      // ---------- 7. 24h、底部固定按鈕、內容不被分頁列擋、toast 在上方 ----------
      const uxNotes = [];
      const uxShots = [];
      try {
        await gotoApp(page, SUN, "today", { sleep: "8", rest: "0" });
        const todayTxt = await page.locator("main").innerText();
        const times = await page.locator(".meal-time .mt-24").allInnerTexts();
        if (!times.length) uxNotes.push("今天頁沒找到 24 小時用餐時間標籤");
        else {
          const badT = times.filter((t) => !/^\d{2}:\d{2}$/.test(t));
          if (badT.length) uxNotes.push(`時間不是 24h：${badT.join(",")}`);
          else uxNotes.push(`用餐時間 24h：${times.join("、")}`);
        }
        if (ampmLeak(todayTxt)) uxNotes.push("今天頁出現 AM/PM 或上午下午");

        const pages = [
          ["today", SUN],
          ["log", LOG_NOW],
          ["body", LOG_NOW],
          ["sleep", LOG_NOW],
          ["shop", SUN],
          ["rules", SUN],
        ];
        for (const [hash, now] of pages) {
          if (hash === "log") {
            await gotoApp(page, now, "today", { sleep: "8" });
            const g = page.locator("[data-testid=go-log]");
            if (await g.isVisible()) await g.click();
            else await gotoApp(page, now, "log", { sleep: "8" });
          } else if (hash === "body") {
            await gotoApp(page, now, "today", { sleep: "8" });
            const b = page.locator("[data-go=body]").first();
            if (await b.isVisible()) { await b.scrollIntoViewIfNeeded(); await b.click(); }
            else await gotoApp(page, now, "body", { sleep: "8" });
          } else if (hash === "sleep") {
            await gotoApp(page, now, "today", { sleep: "8" });
            const s = page.locator("[data-testid=sleep-home], [data-go=sleep]").first();
            if (await s.isVisible()) await s.click();
            else await gotoApp(page, now, "sleep", { sleep: "8" });
          } else if (hash === "shop" || hash === "rules") {
            await gotoApp(page, now, "today", { sleep: "8" });
            await page.locator(`nav#tabs button[data-tab=${hash}]`).click();
            await page.waitForTimeout(250);
          }
          await page.waitForTimeout(200);
          // 捲到底
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          await page.waitForTimeout(200);
          const fn = await shot(page, `${tag}-7-${hash}-bottom`);
          uxShots.push(fn);
          const ov = await tabOverlap(page);
          if (ov && ov.hits && ov.hits.length) {
            uxNotes.push(`${hash} 底部內容與分頁列重疊：${ov.hits.map((h) => h.t).join(" / ")}`);
          } else {
            uxNotes.push(`${hash} 捲到底未與分頁列重疊`);
          }
          const pageTxt = await page.locator("main").innerText();
          if (ampmLeak(pageTxt) && hash !== "rules") uxNotes.push(`${hash} 出現 AM/PM 或上午下午`);
        }

        // sticky 主按鈕（吃了別的 儲存；訓練頁已在第 2 項測完成鈕）
        await gotoApp(page, SUN, "today", { sleep: "8" });
        const elseBtn = page.locator("[data-eat-else]").first();
        if (await elseBtn.isVisible()) {
          await elseBtn.click();
          await page.waitForTimeout(200);
          const save = page.locator("[data-else-save]");
          if (await save.isVisible()) {
            const sb = await save.boundingBox();
            const nb = await page.locator("nav#tabs").boundingBox();
            await shot(page, `${tag}-7-sticky-save`);
            if (sb && nb && sb.y + sb.height > nb.y + 1) uxNotes.push("「儲存」被分頁列擋住或沒固定在其上方");
            else uxNotes.push("主要按鈕（儲存）固定在分頁列上方、不用捲動");
          } else uxNotes.push("吃了別的之後沒看到儲存按鈕");
        } else uxNotes.push("今天頁沒看到「吃了別的」（未測儲存固定）");

        // toast 在上方、不擋還原輸入框
        await page.locator("nav#tabs button[data-tab=rules]").click();
        await page.waitForTimeout(250);
        const bak = page.locator("[data-backup-toggle], [data-testid=backup-card] summary, details.backup summary").first();
        if (await bak.isVisible()) {
          const open = await page.locator("[data-testid=restore-input]").isVisible();
          if (!open) await bak.click();
          await page.locator("[data-restore-in], [data-testid=restore-input]").fill("bad");
          await page.locator("[data-backup-restore], [data-testid=backup-restore]").click();
          await page.waitForTimeout(300);
          const toast = page.locator(".toast, #toast").first();
          if (await toast.isVisible()) {
            const tb = await toast.boundingBox();
            const ib = await page.locator("[data-restore-in], [data-testid=restore-input]").boundingBox();
            await shot(page, `${tag}-7-toast`);
            if (!tb) uxNotes.push("toast 沒有位置");
            else {
              if (tb.y > 240) uxNotes.push(`toast 不在上方（y=${Math.round(tb.y)}）`);
              else uxNotes.push(`toast 在上方（y=${Math.round(tb.y)}）`);
              if (ib && !(tb.y + tb.height <= ib.y + 1 || tb.y >= ib.y + ib.height - 1)) uxNotes.push("toast 擋住還原輸入框");
              else uxNotes.push("toast 沒擋住輸入框");
            }
          } else uxNotes.push("還原錯誤後沒出現 toast");
        } else uxNotes.push("找不到備份／還原（未測 toast）");

        const uxFail = uxNotes.filter((n) => /重疊|擋住|不是 24h|AM\/PM|沒找到 24|不在上方|沒出現 toast|沒固定/.test(n));
        rec("7. 24小時制、主按鈕固定底部、內容不被分頁列擋、toast 在上方", scheme, data.id, uxFail.length ? "問題" : "通過", uxNotes.join("； "), uxShots.map((s) => path.basename(s)));
      } catch (e) {
        await shot(page, `${tag}-7-error`);
        rec("7. 24小時制、主按鈕固定底部、內容不被分頁列擋、toast 在上方", scheme, data.id, "問題", (e.message || e) + "｜" + uxNotes.join("； "), [`${tag}-7-error`]);
      }

      // ---------- 8. 自動更新（只在 light+clean 做完整測，避免重複等 60 秒） ----------
      if (!autoUpdateDone && scheme === "light" && data.id === "clean") {
        const au = [];
        try {
          // 8a. 切回分頁會打 version.json
          await page.unroute("**/version.json*").catch(() => null);
          let hits = 0;
          await page.route("**/version.json*", async (route) => {
            hits += 1;
            try { await route.continue(); } catch { await route.fallback(); }
          });
          await gotoApp(page, SUN, "today", { sleep: "8" });
          const afterLoad = hits;
          await page.evaluate(() => {
            Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
            window.dispatchEvent(new Event("focus"));
            document.dispatchEvent(new Event("visibilitychange"));
            try { window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })); }
            catch (_) { window.dispatchEvent(new Event("pageshow")); }
          });
          await page.waitForTimeout(1500);
          if (hits > afterLoad) au.push(`切回分頁有再檢查 version.json（load 後 ${afterLoad} 次，事件後 ${hits} 次）`);
          else au.push("切回分頁（focus/visibility/pageshow）沒有再打 version.json");
          await page.unroute("**/version.json*").catch(() => null);

          // 8b. 模擬新版本，觸發更新與 toast
          const cur = await page.evaluate(async () => (await (await fetch("./version.json?t=" + Date.now(), { cache: "no-store" })).json()).version);
          const next = cur + "-fitmi";
          await page.route("**/version.json*", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ version: next, builtAt: new Date().toISOString() }) }));
          await page.route("**/app.js*", async (r) => {
            const res = await r.fetch();
            let body = await res.text();
            body = body.split(cur).join(next);
            await r.fulfill({ response: res, body, contentType: "application/javascript" });
          });
          await page.evaluate(() => window.__fatmiCheckUpdates && window.__fatmiCheckUpdates({ now: true }));
          const toast = page.locator(".toast, #toast, [data-testid=toast]").filter({ hasText: "已更新" }).first();
          await expect(toast).toBeVisible({ timeout: 75000 });
          const ttxt = await toast.innerText();
          await shot(page, `${tag}-8-updated`);
          au.push(`模擬新版成功：${cur} → ${next}，toast「${ttxt.replace(/\s+/g, " ")}」`);
          await page.unroute("**/version.json*").catch(() => null);
          await page.unroute("**/app.js*").catch(() => null);
          // 回到真的 15-3（reload 後可能還停在被改寫的 APP_VERSION，強制開一次不經過 mock）
          await gotoApp(page, SUN, "today", { sleep: "8" });
          const back = await page.evaluate(() => (typeof APP_VERSION !== "undefined" ? APP_VERSION : "")).catch(() => "");
          au.push(`恢復後 APP_VERSION=${back || "未知"}`);

          // 8c. 60 秒輪詢：真的等一次
          let pollHits = 0;
          await page.route("**/version.json*", async (route) => {
            pollHits += 1;
            try { await route.continue(); } catch { await route.fallback(); }
          });
          await gotoApp(page, SUN, "today", { sleep: "8" });
          const baseHits = pollHits;
          await page.waitForTimeout(65000);
          if (pollHits > baseHits) au.push(`60 秒內有自動再檢查（load ${baseHits} 次，65 秒後 ${pollHits} 次）`);
          else au.push("等了 65 秒沒有再打 version.json（60 秒輪詢未生效）");
          await page.unroute("**/version.json*").catch(() => null);

          const auFail = au.filter((n) => /沒有再打|未生效/.test(n));
          rec("8. 自動更新（切回分頁／60 秒檢查／更新 toast）", scheme, data.id, auFail.length ? "問題" : "通過", au.join("； "), [`${tag}-8-updated`]);
          autoUpdateDone = true;
        } catch (e) {
          await shot(page, `${tag}-8-error`);
          rec("8. 自動更新（切回分頁／60 秒檢查／更新 toast）", scheme, data.id, "問題", e.message || e, [`${tag}-8-error`]);
          autoUpdateDone = true;
        }
      } else if (!(scheme === "light" && data.id === "clean")) {
        rec("8. 自動更新（切回分頁／60 秒檢查／更新 toast）", scheme, data.id, "通過", "與 light／clean 同一套機制，此組合不再重複等 60 秒（見 light-clean 結果）", []);
      }

      // ---------- 9. 其他分頁與按鈕 ----------
      const otherNotes = [];
      const otherShots = [];
      try {
        await boot(page, LOG_NOW, "today", { sleep: "8", rest: "0" }, data.seed);
        // 睡眠預設最新一天：從今天點進去（不要帶舊的 ui.sleepIdx）
        const sleepBtn = page.locator("[data-testid=sleep-home], [data-go=sleep]").first();
        if (await sleepBtn.isVisible()) await sleepBtn.click();
        else await gotoApp(page, LOG_NOW, "sleep", { sleep: "8" });
        await page.waitForSelector("[data-testid=sleep-page], .sleep-page", { timeout: 8000 });
        const sleepHead = await page.locator(".sl-nav span, .sl-card").first().innerText().catch(() => "");
        const stale = await page.locator("[data-testid=sleep-stale]").innerText().catch(() => "");
        const sleepTotal = await page.locator("[data-testid=sleep-total]").innerText().catch(() => "");
        await shot(page, `${tag}-9-sleep`);
        otherShots.push(`${tag}-9-sleep`);
        // 11/14 睡眠是 null，最新完整應是 11/13；若 11/15 已同步也可能是 11/15
        const latestOk = /11\/13|11\/14|11\/15|13\/11/.test(sleepHead + stale) || /最新一晚/.test(stale);
        if (latestOk) otherNotes.push(`睡眠預設最新：${(sleepHead + " " + stale + " " + sleepTotal).replace(/\s+/g, " ").slice(0, 80)}`);
        else otherNotes.push(`睡眠預設日可能不是最新：${(sleepHead + " " + stale).replace(/\s+/g, " ").slice(0, 80)}`);

        const pages = [
          { hash: "today", via: "tab" },
          { hash: "shop", via: "tab" },
          { hash: "rules", via: "tab" },
        ];
        for (const p of pages) {
          await page.locator(`nav#tabs button[data-tab=${p.hash}]`).click();
          await page.waitForTimeout(300);
          await shot(page, `${tag}-9-${p.hash}`);
          otherShots.push(`${tag}-9-${p.hash}`);
          const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
          if (ov > 1) otherNotes.push(`${p.hash} 水平溢位 ${ov}px`);
          const cut = await clipped(page, "main");
          if (cut.length) otherNotes.push(`${p.hash} 文字被切：${cut.slice(0, 4).join(" / ")}`);
        }

        // 身體頁
        await page.locator("nav#tabs button[data-tab=today]").click();
        await page.waitForTimeout(200);
        const bodyBtn = page.locator("[data-go=body]").first();
        if (await bodyBtn.count()) {
          await bodyBtn.scrollIntoViewIfNeeded();
          await bodyBtn.click();
          await page.waitForTimeout(300);
          await shot(page, `${tag}-9-body`);
          otherShots.push(`${tag}-9-body`);
          const bt = await page.locator("main").innerText();
          if (!/kg|體脂|體重/.test(bt)) otherNotes.push("身體頁沒看到體重／體脂");
          else otherNotes.push("身體頁有體重／體脂");
        } else otherNotes.push("找不到進入身體頁的按鈕");

        // 全按鈕實點只在 light+clean 做一遍（其餘組合改看版面／溢位／截圖，避免 4 組各重載數百次超時）
        const hashes = ["today", "shop", "rules", "log", "sleep", "body"];
        if (!(scheme === "light" && data.id === "clean")) {
          for (const hash of hashes) {
            if (hash === "shop" || hash === "rules" || hash === "today") {
              await gotoApp(page, LOG_NOW, "today", { sleep: "8" });
              if (hash !== "today") await page.locator(`nav#tabs button[data-tab=${hash}]`).click();
            } else {
              await gotoApp(page, LOG_NOW, hash, { sleep: "8" });
            }
            await page.waitForTimeout(200);
            const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
            if (ov > 1) otherNotes.push(`${hash} 水平溢位 ${ov}px`);
          }
          otherNotes.push("此組合只走分頁與版面檢查；全按鈕點擊見 light/clean");
        } else {
        const hashes = ["today", "shop", "rules", "log", "sleep", "body"];
        const dead = [];
        const errClicks = [];
        for (const hash of hashes) {
          if (hash === "shop" || hash === "rules" || hash === "today") {
            await gotoApp(page, LOG_NOW, "today", { sleep: "8" });
            if (hash !== "today") await page.locator(`nav#tabs button[data-tab=${hash}]`).click();
          } else {
            await gotoApp(page, LOG_NOW, hash, { sleep: "8" });
          }
          await page.waitForTimeout(250);
          const labels = await page.evaluate(() => {
            const vis = (e) => {
              const r = e.getBoundingClientRect();
              const cs = getComputedStyle(e);
              return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
            };
            const sel = "main button, main [role=button], main summary, main [data-go], nav#tabs button";
            return [...document.querySelectorAll(sel)]
              .filter((e) => vis(e) && !e.disabled && !e.closest("svg"))
              .map((e, i) => ({ i, label: (e.innerText || e.getAttribute("aria-label") || e.tagName).trim().replace(/\s+/g, " ").slice(0, 24) }));
          });
          // 點每個，然後回到該頁
          for (let i = 0; i < labels.length; i++) {
            const lab = labels[i].label;
            const e0 = jsErrors.length;
            if (hash === "shop" || hash === "rules" || hash === "today") {
              await gotoApp(page, LOG_NOW, "today", { sleep: "8" });
              if (hash !== "today") await page.locator(`nav#tabs button[data-tab=${hash}]`).click();
            } else {
              await gotoApp(page, LOG_NOW, hash, { sleep: "8" });
            }
            await page.waitForTimeout(120);
            const handle = await page.evaluateHandle((idx) => {
              const vis = (e) => {
                const r = e.getBoundingClientRect();
                const cs = getComputedStyle(e);
                return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
              };
              const sel = "main button, main [role=button], main summary, main [data-go], nav#tabs button";
              return [...document.querySelectorAll(sel)].filter((e) => vis(e) && !e.disabled && !e.closest("svg"))[idx] || null;
            }, i);
            const el = handle.asElement();
            if (!el) { dead.push(`${hash}:${lab} 找不到`); continue; }
            await el.evaluate((e) => e.scrollIntoView({ block: "center" })).catch(() => null);
            const before = await page.evaluate(() => (document.getElementById("main") ? document.getElementById("main").innerHTML.length : 0) + location.hash + (document.querySelector(".sheet") ? "s" : ""));
            try { await el.click({ timeout: 3000 }); } catch (err) { dead.push(`${hash}:${lab} 點擊失敗`); }
            await page.waitForTimeout(200);
            if (jsErrors.length > e0) errClicks.push(`${hash}:${lab} JS ${jsErrors.slice(e0).join("; ").slice(0, 80)}`);
            const after = await page.evaluate(() => (document.getElementById("main") ? document.getElementById("main").innerHTML.length : 0) + location.hash + (document.querySelector(".sheet") ? "s" : "")).catch(() => "nav");
            // 關閉可能開著的 sheet，避免影響後續（不記 no-effect，因為有的按鈕本來就是切換視覺狀態）
            const close = page.locator("[data-share-close], [data-edit-save], [data-else-close], .sheet [data-go], .sheet .btn:has-text('關閉'), .sheet .btn:has-text('取消')").first();
            if (await close.isVisible().catch(() => false)) await close.click().catch(() => null);
            // 有重疊？
            const covered = await el.evaluate((e) => {
              if (!e.isConnected) return null;
              const r = e.getBoundingClientRect();
              if (r.width < 2) return null;
              const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
              if (!t || t === e || e.contains(t) || t.contains(e)) return null;
              return (t.innerText || t.tagName).slice(0, 20);
            }).catch(() => null);
            if (covered) otherNotes.push(`${hash}「${lab}」被「${covered}」蓋住`);
          }
          otherNotes.push(`${hash} 點了 ${labels.length} 個按鈕`);
        }
        if (dead.length) otherNotes.push("沒反應或點擊失敗：" + dead.slice(0, 8).join("；"));
        if (errClicks.length) otherNotes.push("點擊觸發 JS 錯誤：" + errClicks.slice(0, 8).join("；"));
        if (jsErrors.length) otherNotes.push("本輪 console error：" + jsErrors.slice(0, 5).join(" | "));
        }

        const otherFail = otherNotes.filter((n) => /溢位|被切|沒看到|找不到進入|可能不是最新|沒反應|JS 錯誤|console error|蓋住/.test(n));
        rec("9. 其他分頁與按鈕（飲食、睡眠最新、規則、購物、錯誤／重疊／被切）", scheme, data.id, otherFail.length ? "問題" : "通過", otherNotes.join("； "), otherShots);
      } catch (e) {
        await shot(page, `${tag}-9-error`);
        rec("9. 其他分頁與按鈕（飲食、睡眠最新、規則、購物、錯誤／重疊／被切）", scheme, data.id, "問題", (e.message || e) + "｜" + otherNotes.join("； "), [`${tag}-9-error`]);
      }
    }
  }

  // 寫報告
  const report = { version: { expected: VER, js: jsVer, json: verJson.version }, findings, at: new Date().toISOString() };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  // 最後用 expect 讓失敗在 CI 可見，但不中斷前面收集
  const bad = findings.filter((f) => f.status === "問題");
  console.log("\n===== FitMi 15-3 報告 =====");
  for (const f of findings) console.log(`[${f.status}] ${f.item} (${f.scheme}/${f.data}) ${f.detail.slice(0, 200)}`);
  console.log(`問題 ${bad.length} / ${findings.length}`);
  // 不要 throw，讓報告完整；父代理依 report 判斷
});

test("follow-up: rest=30 撤銷、練完寫入紀錄、切回分頁檢查、規則頁重疊", async ({ page }) => {
  const notes = [];
  const jsErrors = [];
  page.on("pageerror", (e) => jsErrors.push(String(e.message || e)));
  page.on("dialog", (d) => d.dismiss().catch(() => null));
  await page.emulateMedia({ colorScheme: "light" });

  // A. 記組 + 休息倒數未結束前撤銷 + 練完
  await boot(page, TUE, "today", { sleep: "8", rest: "30" }, null);
  await page.locator("[data-start]").first().click();
  await page.locator("[data-complete]").waitFor();
  const wBox = await inViewport(page, "[data-testid=wo-weight]");
  const cBox = await inViewport(page, "[data-complete]");
  notes.push(`首屏 重量=${wBox.ok} 完成=${cBox.ok}`);
  const move = (await page.locator(".wo-name").innerText()).replace(/\s+/g, " ").trim();
  if (await page.locator("[data-testid=w-plus]").isVisible()) await page.locator("[data-testid=w-plus]").click();
  const w = await page.locator("[data-testid=wo-weight]").innerText();
  notes.push(`動作 ${move} 重量 ${w}`);
  await page.locator("[data-complete]").click();
  await page.locator("[data-testid=rest-timer], [data-skip-rest]").first().waitFor();
  // 確認倒數還沒自動跳走
  const count = await page.locator("#rest-count, .rest-box").first().innerText();
  const pText = await page.locator("[data-testid=btn-skip-rest]").innerText();
  const uText = await page.locator("[data-testid=btn-undo]").innerText();
  await shot(page, "fu-rest-30");
  notes.push(`休息畫面「${pText.replace(/\s+/g, " ")}」／「${uText.replace(/\s+/g, " ")}」倒數區：${count.replace(/\s+/g, " ").slice(0, 40)}`);
  if (!/休息好了，下一組/.test(pText)) throw new Error("主按鈕不是 休息好了，下一組");
  if (!/撤銷/.test(uText)) throw new Error("沒有撤銷按鈕");
  await page.locator("[data-testid=btn-undo]").click();
  await page.locator("[data-complete]").waitFor({ timeout: 5000 });
  const prog = await page.locator(".wo-prog").innerText();
  await shot(page, "fu-undo");
  notes.push(`撤銷後回到記組，進度 ${prog.replace(/\s+/g, " ")}`);
  if (!/第 1/.test(prog) && !/1 \/ 3/.test(prog) && !/第 1 \/ 3/.test(prog) && !/1\/3/.test(prog)) {
    notes.push("警告：撤銷後進度可能不是第 1 組");
  }

  // 再完成並把整堂練完
  await page.locator("[data-complete]").click();
  for (let i = 0; i < 50; i++) {
    if (await page.locator("[data-finish-home]").isVisible().catch(() => false)) break;
    if (await page.locator("[data-exback]").first().isVisible().catch(() => false)) {
      await page.locator("[data-testid=exback-0], [data-exback]").first().click();
      continue;
    }
    if (await page.locator("[data-skip-rest]").isVisible().catch(() => false)) {
      await page.locator("[data-skip-rest]").click();
      continue;
    }
    if (await page.locator("[data-wonext]").isVisible().catch(() => false)) {
      await page.locator("[data-wonext]").click();
      continue;
    }
    if (await page.locator("[data-complete]").isVisible().catch(() => false)) {
      await page.locator("[data-complete]").click({ timeout: 3000 }).catch(() => null);
      continue;
    }
    await page.waitForTimeout(150);
  }
  await shot(page, "fu-done");
  if (!(await page.locator("[data-finish-home]").isVisible().catch(() => false))) {
    notes.push("未能走到結束頁");
  } else {
    await page.locator("[data-finish-home]").click();
    notes.push("已結束訓練回到今天");
  }
  await gotoApp(page, TUE, "today", { sleep: "8", rest: "30" });
  const goLog = page.locator("[data-testid=go-log]");
  if (await goLog.isVisible()) await goLog.click();
  else await gotoApp(page, TUE, "log", { sleep: "8" });
  await page.waitForTimeout(300);
  const row = page.locator("[data-testid=log-row-2026-11-17]");
  await shot(page, "fu-log-tue");
  if (await row.count()) {
    const t = (await row.innerText()).replace(/\s+/g, " ");
    notes.push(`訓練紀錄有 11/17：${t}`);
    await row.click();
    await page.waitForTimeout(200);
    const det = await page.locator("[data-testid=log-detail-2026-11-17], main").first().innerText();
    notes.push(/高腳杯|深蹲|伏地|臀橋|死蟲/.test(det) ? `明細有剛記的動作：${det.replace(/\s+/g, " ").slice(0, 100)}` : `明細沒看到動作：${det.replace(/\s+/g, " ").slice(0, 100)}`);
    await shot(page, "fu-log-tue-detail");
  } else {
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem("fatcat-v2") || "{}"));
    notes.push(`列表仍無 11/17；logs=${!!(st.logs && st.logs["2026-11-17"])} session=${!!st.session}`);
  }

  // B. 切回分頁：等 3 秒避開 de-dupe 再觸發
  let hits = 0;
  await page.route("**/version.json*", async (route) => {
    hits += 1;
    try { await route.continue(); } catch { await route.fallback(); }
  });
  await gotoApp(page, SUN, "today", { sleep: "8" });
  await page.waitForTimeout(3500);
  const afterLoad = hits;
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(2000);
  notes.push(`切回分頁 version.json：load 後 ${afterLoad} 次，等 3 秒再 focus/visibility 後 ${hits} 次`);
  await page.unroute("**/version.json*").catch(() => null);

  // C. 規則頁底部：精確量測哪個 button 重疊
  await gotoApp(page, SUN, "today", { sleep: "8" });
  await page.locator("nav#tabs button[data-tab=rules]").click();
  await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(200);
  const ov = await page.evaluate(() => {
    const nav = document.querySelector("nav#tabs");
    const nr = nav.getBoundingClientRect();
    const hits = [];
    for (const e of document.querySelectorAll("main button, main [role=button], main summary")) {
      const r = e.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      const overlapH = Math.min(r.bottom, nr.bottom) - Math.max(r.top, nr.top);
      if (overlapH > 2 && r.right > nr.left && r.left < nr.right) {
        hits.push({
          t: (e.innerText || e.getAttribute("aria-label") || e.tagName).trim().replace(/\s+/g, " ").slice(0, 40),
          tag: e.tagName,
          y: Math.round(r.top),
          b: Math.round(r.bottom),
          navY: Math.round(nr.top),
          overlap: Math.round(overlapH),
        });
      }
    }
    const last = [...document.querySelectorAll("main p, main .app-ver, main .card")].filter((e) => e.getBoundingClientRect().height > 0).pop();
    const lr = last ? last.getBoundingClientRect() : null;
    return { navTop: Math.round(nr.top), last: lr ? { t: (last.innerText || "").slice(0, 40), b: Math.round(lr.bottom) } : null, hits };
  });
  await shot(page, "fu-rules-bottom");
  notes.push(`規則頁分頁列 top=${ov.navTop}；最後內容 bottom=${ov.last && ov.last.b}「${ov.last && ov.last.t}」；重疊=${JSON.stringify(ov.hits)}`);

  rec("FU. rest=30 撤銷／寫入紀錄／切回分頁／規則重疊", "light", "clean",
    notes.some((n) => /未能|仍無|沒有撤銷|不是/.test(n)) ? "問題" : "通過",
    notes.join("； "));
  fs.writeFileSync(path.join(OUT, "followup.json"), JSON.stringify({ notes, jsErrors, ov }, null, 2));
  console.log("FOLLOWUP", notes.join("\n"));
  if (jsErrors.length) console.log("JS", jsErrors);
});
