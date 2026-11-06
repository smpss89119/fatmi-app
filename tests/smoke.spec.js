const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const TUE_10 = "2026-11-10T10:00:00+07:00";
const TUE_15 = "2026-11-10T15:00:00+07:00";
const TUE_17 = "2026-11-10T17:00:00+07:00";
const WED_10 = "2026-11-11T10:00:00+07:00";
const FRI_10 = "2026-11-13T10:00:00+07:00";

function url(extra = {}) {
  const q = new URLSearchParams({ debug: "1", rest: "1", ...extra });
  return `/?${q.toString()}`;
}

function withBreakfast(day, extra = {}) {
  return {
    mealLogs: { [day]: { breakfast: { eaten: true } } },
    ...extra,
  };
}

async function open(page, extra = {}, storage = null) {
  if (storage) {
    await page.addInitScript((data) => {
      localStorage.setItem("fatcat-v2", JSON.stringify(data));
    }, storage);
  }
  await page.goto(url(extra), { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".ttl");
}

test.describe("TRAINING", () => {
  test("1) Tue → Plan A, figure, video, back cue", async ({ page }) => {
    await open(page, { now: TUE_10, sleep: "8" }, withBreakfast("2026-11-10"));
    await expect(page.locator("[data-testid=train-card]")).toContainText("健身房 A");
    await page.locator("[data-start]").click();
    await expect(page.locator("[data-testid=wo-figure] .body-svg")).toBeVisible();
    await expect(page.locator("a.yt")).toHaveAttribute("href", /youtube/);
    await expect(page.locator("[data-testid=wo-cue]")).not.toHaveText("");
  });

  test("2) sleep 5h → quick version + 昨晚睡 5 小時", async ({ page }) => {
    await open(page, { now: TUE_10, sleep: "5" });
    await expect(page.locator("[data-testid=train-card]")).toContainText("家裡啞鈴快版");
    await expect(page.locator("[data-testid=reason]")).toContainText("昨晚睡 5 小時");
  });

  test("3) 完成 starts rest, vibrate at end, 少做了 edits reps, 復原 undoes", async ({ page }) => {
    await page.addInitScript(() => {
      window.__vibrateCalls = [];
      navigator.vibrate = (p) => {
        window.__vibrateCalls.push(p);
        return true;
      };
    });
    await open(page, { now: TUE_10, sleep: "8", rest: "1" }, withBreakfast("2026-11-10"));
    await page.locator("[data-start]").click();
    await page.locator("[data-wdelta='2.5']").click();
    await page.locator("[data-complete]").click();
    await expect(page.locator("[data-testid=rest-timer]")).toBeVisible();
    await page.waitForTimeout(1400);
    const vib = await page.evaluate(() => window.__vibrateCalls || []);
    expect(vib.length).toBeGreaterThan(0);
    await page.locator("[data-short]").click();
    await expect(page.getByText("實際做了幾下")).toBeVisible();
    await page.locator("[data-rdelta='-1']").click();
    await page.locator("[data-short-save]").click();
    await expect(page.locator("[data-testid=rest-timer]")).toBeVisible();
    await page.locator("[data-testid=btn-undo]").click();
    await expect(page.locator("[data-short]")).toBeVisible();
  });

  test("4) buffer week 70% weights + 緩衝週", async ({ page }) => {
    await open(page, { now: TUE_10, sleep: "8" }, withBreakfast("2026-11-10", {
      lastLoads: { 腿推: { weight: 50, reps: 10, date: "2026-10-18" } },
    }));
    await expect(page.locator("[data-testid=buffer-week]")).toContainText("緩衝週");
    await page.locator("[data-start]").click();
    await expect(page.locator("[data-testid=buffer-week]")).toContainText("緩衝週");
    await expect(page.locator(".num")).toContainText("35");
  });

  test("5) back score 4 → next session squat → leg press", async ({ page }) => {
    await open(page, { now: FRI_10, sleep: "8" }, withBreakfast("2026-11-13", {
      logs: { "2026-11-06": { backScore: 4, moves: {} } },
    }));
    await page.locator("[data-start]").click();
    await expect(page.locator(".wo-name")).toContainText("腿推");
  });

  test("6) two full sessions → 3rd suggests +weight", async ({ page }) => {
    await open(page, { now: TUE_10, sleep: "8" }, withBreakfast("2026-11-10", {
      logs: { "2026-11-08": { backScore: 1, moves: {} } },
      lastLoads: { 腿推: { weight: 20, reps: 10, date: "2026-11-06" } },
      loadHistory: {
        腿推: [
          { date: "2026-11-03", hitAll: true },
          { date: "2026-11-06", hitAll: true },
        ],
      },
      suggest: { 腿推: { add: 2.5 } },
    }));
    await page.locator("[data-start]").click();
    await expect(page.locator(".note")).toContainText("建議加到");
  });

  test("7) post-workout map parts and weekly sums <6 orange", async ({ page }) => {
    await open(page, { now: TUE_10, sleep: "8" }, {
      logs: {
        "2026-11-10": {
          moves: {
            腿推: [{ done: true }, { done: true }, { done: true }],
            胸推: [{ done: true }, { done: true }, { done: true }],
          },
        },
      },
    });
    await expect(page.locator(".chip.low").first()).toBeVisible();
    await expect(page.locator(".body-svg")).toBeVisible();
    const low = await page.locator(".chip.low").allTextContents();
    expect(low.join(" ")).toMatch(/組/);
  });

  test("8) offline log a set persists after reload/online", async ({ page, context }) => {
    await open(page, { now: TUE_10, sleep: "8", rest: "1" }, withBreakfast("2026-11-10"));
    await page.locator("[data-start]").click();
    await page.locator("[data-wdelta='2.5']").click();
    await context.setOffline(true);
    await page.locator("[data-complete]").click();
    await expect(page.locator("[data-testid=rest-timer]")).toBeVisible();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("fatcat-v2") || "{}"));
    expect(saved.session).toBeTruthy();
    expect(Object.keys((saved.session && saved.session.moves) || {}).length).toBeGreaterThan(0);
    await context.setOffline(false);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".ttl, .wo-name, [data-testid=rest-timer]");
    if (await page.getByText("繼續訓練").count()) {
      await page.getByText("繼續訓練").click();
    }
    await expect(page.locator("body")).toContainText("組");
  });

  test("9) Wed → rest day, food moves up", async ({ page }) => {
    await open(page, { now: WED_10, sleep: "8" });
    await expect(page.locator("[data-testid=rest-line]")).toContainText("休息日，走走路就好");
    const restBox = await page.locator("[data-testid=rest-line]").boundingBox();
    const eatBox = await page.locator("[data-testid=eat-card]").boundingBox();
    expect(restBox.y).toBeLessThan(eatBox.y);
    expect(restBox.height).toBeLessThan(140);
  });
});

test.describe("FOOD", () => {
  test("1) 15:00 → top card 16:00 兩份蛋白粉", async ({ page }) => {
    await open(page, { now: TUE_15, sleep: "8" });
    await expect(page.locator("[data-testid=top-card]")).toContainText("16:00 兩份蛋白粉");
  });

  test("2) two 20g powders → chicken 200g; one 極致 → 150g", async ({ page }) => {
    await open(page, { now: TUE_15, sleep: "8" });
    await expect(page.locator("[data-testid=meal-dinner]")).toContainText("雞胸 200g");
    await page.locator("[data-scoop-slot='0'][data-scoop-id='plant']").first().click();
    await expect(page.locator("[data-testid=meal-dinner]")).toContainText("雞胸 150g");
  });

  test("3) all three 吃了 → protein ~150, rings green", async ({ page }) => {
    await open(page, { now: TUE_15, sleep: "8" });
    await page.locator("[data-testid=meal-breakfast] [data-eat]").click();
    await page.locator("[data-testid=meal-snack] [data-eat]").click();
    await page.locator("[data-testid=meal-dinner] [data-eat]").click();
    const txt = await page.locator(".ring").nth(1).innerText();
    const n = Number((txt.match(/(\d+)/) || [])[1]);
    expect(n).toBeGreaterThanOrEqual(135);
    expect(n).toBeLessThanOrEqual(165);
    await expect(page.locator(".ring.ok")).toHaveCount(1);
  });

  test("4) only 16:00 logged, before 21:00 shows shortfall tip", async ({ page }) => {
    await open(page, { now: TUE_17, sleep: "8" });
    await page.locator("[data-testid=meal-snack] [data-eat]").click();
    await expect(page.locator("[data-testid=shortfall]")).toBeVisible();
  });

  test("5) 換一個 only pantry foods, no canned", async ({ page }) => {
    await open(page, { now: TUE_15, sleep: "8" });
    await page.locator("[data-testid=meal-lunch] [data-swap]").click();
    await expect(page.locator("body")).not.toContainText("罐頭");
    await expect(page.locator("body")).toContainText("雞胸");
    await expect(page.locator("body")).toContainText("地瓜");
  });

  test("6) 吃了別的 → bento estimates + next-meal advice", async ({ page }) => {
    await open(page, { now: TUE_15, sleep: "8" });
    await page.locator("[data-testid=meal-lunch] [data-eat-else]").click();
    await expect(page.locator("[data-testid=else-list]")).toBeVisible();
    await expect(page.locator("[data-testid=else-list]")).toContainText("kcal");
    await page.locator("[data-testid=else-list] button").first().click();
    await expect(page.locator("[data-testid=next-advice]")).toBeVisible();
    await expect(page.locator("[data-testid=next-advice]")).toContainText("下一餐");
  });

  test("7) training day → target 2100–2200 and 地瓜 at 16:00", async ({ page }) => {
    await open(page, { now: TUE_15, sleep: "8" });
    await expect(page.locator("[data-testid=eat-card]")).toContainText("2100–2200");
    await expect(page.locator("[data-testid=top-card]")).toContainText("地瓜");
    await expect(page.locator("[data-testid=meal-snack]")).toContainText("地瓜 150g");
  });

  test("8) sleep 5h → kcal target unchanged + protein reminder", async ({ page }) => {
    await open(page, { now: TUE_15, sleep: "5" });
    await expect(page.locator("[data-testid=eat-card]")).toContainText("2100–2200");
    await expect(page.locator("[data-testid=protein-reminder]")).toContainText("蛋白質還是要吃滿");
  });

  test("9) undo works; offline reload keeps records", async ({ page, context }) => {
    await open(page, { now: TUE_15, sleep: "8" });
    await page.locator("[data-testid=meal-breakfast] [data-eat]").click();
    await expect(page.locator("[data-testid=meal-breakfast]")).toHaveClass(/eaten/);
    await page.locator("[data-testid=meal-breakfast] [data-eat]").click();
    await expect(page.locator("[data-testid=meal-breakfast]")).not.toHaveClass(/eaten/);
    await page.locator("[data-testid=meal-breakfast] [data-eat]").click();
    await context.setOffline(true);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("fatcat-v2") || "{}"));
    const day = Object.values(saved.mealLogs || {})[0] || {};
    expect(day.breakfast && day.breakfast.eaten).toBeTruthy();
    await context.setOffline(false);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-testid=meal-breakfast]")).toHaveClass(/eaten/);
  });
});

test.describe("UPDATE", () => {
  test("deploy-version bump detected and applied without manual relaunch", async ({ page }) => {
    const versionPath = path.join(__dirname, "..", "version.json");
    const original = fs.readFileSync(versionPath, "utf8");
    try {
      await open(page, { now: TUE_10, sleep: "8" });
      await page.waitForFunction(() => typeof window.__fatmiCheckUpdates === "function");
      fs.writeFileSync(versionPath, JSON.stringify({ version: "smoke-bump-1", builtAt: "2026-11-07T00:20:00+07:00" }));
      const nav = page.waitForNavigation({ timeout: 15000 });
      await page.evaluate(() => window.__fatmiCheckUpdates({ force: true }));
      await nav;
      await expect(page.locator(".ttl")).toContainText("減脂喵");
    } finally {
      fs.writeFileSync(versionPath, original);
    }
  });
});
