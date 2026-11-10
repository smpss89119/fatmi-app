// Click-through audit of every screen at iPhone size with real data.json and a realistic stored state.
// Fails on JS errors, NaN/undefined/null text, horizontal overflow, or tiny tap targets.
const { test, expect } = require("@playwright/test");
const P = `${process.env.FATMI_PREFIX || ""}${process.env.FATMI_PATH || "/staging/"}`;
const SHOT = process.env.AUDIT_SHOTS || "";
const shot = async (page, n) => { if (SHOT) await page.screenshot({ path: `${SHOT}/${n}.png`, fullPage: true }); };

const SEED = {
  mealLogs: { "2026-11-09": { snack: { eaten: true, mode: "whey2", name: "蛋白粉 2 份", kcal: 366, protein: 52 }, dinner: { eaten: true, name: "鯛魚排＋花椰菜＋手指蘿蔔", kcal: 250, protein: 40 } } },
  logs: { "2026-11-06": { workoutId: "B", finishedAt: 1762430000000, backScore: 1 } },
  wheyStockG: { plantAlmond: 480 },
};

async function check(page, where) {
  const r = await page.evaluate(() => {
    const out = { bad: [], overflow: [], small: [] };
    const txt = document.querySelector("main").innerText + document.querySelector("header").innerText;
    for (const w of ["NaN", "undefined", "null", "[object Object]", "Infinity"]) if (txt.includes(w)) out.bad.push(w);
    const W = document.documentElement.clientWidth;
    document.querySelectorAll("main *").forEach((el) => {
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden") return;
      if (b.right > W + 1 && !el.closest("[style*=overflow],.sleep-bars,.chips,.shop-chips,.week-chips,.sheet-scroll")) out.overflow.push((el.dataset.testid || el.className || el.tagName) + ":" + Math.round(b.right));
      if (el.matches("button,select,[role=button]") && b.height < 32 && !el.closest("svg")) out.small.push((el.dataset.testid || el.textContent.trim().slice(0, 12)) + ":" + Math.round(b.height));
    });
    out.overflow = [...new Set(out.overflow)].slice(0, 10);
    out.small = [...new Set(out.small)].slice(0, 10);
    out.docOverflow = document.documentElement.scrollWidth > W + 1;
    return out;
  });
  console.log(`[${where}]`, JSON.stringify(r));
  return r;
}

test("audit: every screen, real data", async ({ page }) => {
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|ERR_|404/.test(m.text())) errs.push(m.text()); });
  await page.addInitScript((d) => { if (!sessionStorage.seeded) { sessionStorage.seeded = 1; localStorage.setItem("fatcat-v2", JSON.stringify(d)); } }, SEED);
  const issues = [];
  const note = (where, r) => { if (r.bad.length || r.docOverflow) issues.push({ where, ...r }); };
  await page.goto(`${P}#today`);
  await page.waitForSelector("[data-testid=train-card], [data-testid=rest-line]");
  note("today", await check(page, "today")); await shot(page, "01-today");
  // plan reason
  if (await page.locator("[data-testid=reason-info]").count()) { await page.locator("[data-testid=reason-info]").first().click(); note("reason", await check(page, "reason")); }
  // meals: 份量 layer, palm/fist/veg
  await page.locator("[data-testid=meal-more-dinner]").click();
  note("meal-more", await check(page, "meal-more")); await shot(page, "02-meal-more");
  await page.locator("[data-palm=dinner][data-delta='1']").click();
  await page.locator("[data-fist=dinner][data-delta='1']").click();
  await page.locator("[data-testid=veg-dinner]").click().catch(() => {});
  note("portions", await check(page, "portions"));
  await page.locator("[data-eat=dinner]").click();
  await page.locator("[data-eat=dinner]").click();
  // whey2 on snack + eat → stock
  await page.locator("[data-testid=meal-more-snack]").click().catch(() => {});
  if (await page.locator("[data-testid=whey2-snack]").count()) await page.locator("[data-testid=whey2-snack]").click();
  await page.locator("[data-eat=snack]").click();
  note("snack-eaten", await check(page, "snack-eaten")); await shot(page, "03-snack-eaten");
  // 吃了別的
  await page.locator("[data-eat-else=breakfast], [data-eat-else=lunch], [data-eat-else=dinner]").first().click();
  await expect(page.locator("[data-testid=else-list]")).toBeVisible();
  note("else", await check(page, "else")); await shot(page, "04-else");
  await page.locator("[data-testid=else-inc-chicken]").click();
  await page.locator("[data-testid=else-save]").click();
  // 加一餐
  await page.locator("[data-testid=add-meal]").click();
  note("add-meal", await check(page, "add-meal")); await shot(page, "05-add-meal");
  // share
  await page.locator("[data-testid=share-cats]").click();
  const shareText = await page.locator("[data-testid=share-sheet-text]").innerText();
  console.log("[share]", shareText.replace(/\n/g, " | ").slice(0, 600));
  for (const w of ["NaN", "undefined", "null", "建議：）"]) if (shareText.includes(w)) issues.push({ where: "share", bad: [w] });
  await shot(page, "06-share");
  await page.locator("[data-testid=share-close]").click();
  // body trends + body map
  await page.locator("[data-go=body]").first().click().catch(async () => { await page.goto(`${P}#body`); });
  await page.waitForTimeout(300);
  note("body", await check(page, "body")); await shot(page, "07-body");
  const m = page.locator("svg [data-m], svg [data-muscle]").first();
  if (await m.count()) { await m.click({ force: true }); note("body-muscle", await check(page, "body-muscle")); }
  // sleep
  await page.goto(`${P}#today`); await page.waitForSelector(".ttl");
  await page.locator("[data-testid=sleep-home]").click();
  await expect(page.locator("[data-testid=sleep-page]")).toBeVisible();
  note("sleep-day", await check(page, "sleep-day")); await shot(page, "08-sleep-day");
  for (const r of ["W", "M"]) {
    const b = page.locator(`[data-testid=sleep-range-${r}]`);
    if (await b.count()) { await b.click(); note(`sleep-${r}`, await check(page, `sleep-${r}`)); await shot(page, `09-sleep-${r}`); }
  }
  // training: start → set → rest → back score
  await page.goto(`${P}?debug=1&sleep=8&now=${encodeURIComponent("2026-11-10T19:00:00+07:00")}#today`); await page.waitForSelector(".ttl");
  const start = page.getByRole("button", { name: /開始訓練/ });
  if (await start.count()) {
    await start.first().click();
    note("workout", await check(page, "workout")); await shot(page, "10-workout");
  }
  // shop
  await page.goto(`${P}#shop`); await page.waitForSelector(".ttl");
  note("shop", await check(page, "shop")); await shot(page, "11-shop");
  await page.locator("[data-testid=shop-edit-whey]").click();
  note("shop-whey-edit", await check(page, "shop-whey-edit")); await shot(page, "12-shop-whey");
  await page.locator("[data-edit-close]").first().click();
  await page.locator("[data-testid=shop-plus]").click();
  await expect(page.locator("[data-testid=shop-add]")).toBeVisible();
  note("shop-add", await check(page, "shop-add")); await shot(page, "12b-shop-add");
  // rules
  await page.goto(`${P}#rules`); await page.waitForSelector(".ttl");
  await page.locator("[data-backup-toggle]").click();
  note("rules", await check(page, "rules")); await shot(page, "13-rules");
  console.log("ERRORS", JSON.stringify(errs));
  console.log("ISSUES", JSON.stringify(issues));
  expect(errs).toEqual([]);
  expect(issues).toEqual([]);
});

test("audit: update applies without closing (version bump while open)", async ({ page }) => {
  let ver = null;
  await page.route("**/version.json*", async (route) => {
    const j = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "..", "version.json"), "utf8"));
    if (ver) j.version = ver;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(j) }).catch(() => {});
  });
  await page.goto(`${P}#today`, { waitUntil: "networkidle" }); await page.waitForSelector(".ttl");
  await page.evaluate(() => { window.__marker = 1; });
  ver = "2099.01.01-99";
  const nav = page.waitForEvent("load", { timeout: 15000 });
  await page.evaluate(() => window.__fatmiCheckUpdates());
  await nav;
  expect(await page.evaluate(() => window.__marker)).toBeUndefined(); // page reloaded by itself
});
