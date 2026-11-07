const { test, expect } = require("@playwright/test");

const TUE_10 = "2026-11-10T10:00:00+07:00";
const TUE_15 = "2026-11-10T15:00:00+07:00";
const WED_10 = "2026-11-11T10:00:00+07:00";
const FRI_10 = "2026-11-13T10:00:00+07:00";
const SAT_10 = "2026-11-07T10:00:00+07:00";

function url(extra = {}) {
  const q = new URLSearchParams({ debug: "1", rest: "1", ...extra });
  return `${process.env.FATMI_PREFIX || ""}/preview/?${q.toString()}`;
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
  test("1) Tue → Plan A", async ({ page }) => {
    await open(page, { now: TUE_10, sleep: "8" }, withBreakfast("2026-11-10"));
    await expect(page.locator("[data-testid=train-card]")).toContainText("健身房 A");
  });

  test("2) sleep 5h → quick version, reason behind ⓘ", async ({ page }) => {
    await open(page, { now: TUE_10, sleep: "5" });
    await expect(page.locator("[data-testid=train-card]")).toContainText("家裡啞鈴快版");
    await page.locator("[data-testid=reason-info]").click();
    await expect(page.locator("[data-testid=reason]")).toContainText("昨晚睡 5 小時");
  });

  test("10) tap a muscle shows weekly sets", async ({ page }) => {
    await open(page, { now: TUE_10, sleep: "8" }, {
      logs: {
        "2026-11-10": {
          moves: {
            腿推: [{ done: true }, { done: true }, { done: true }],
            深蹲: [{ done: true }, { done: true }],
          },
        },
      },
    });
    await page.locator(".body-svg [data-part=quads]").first().click();
    const tip = page.locator("[data-testid=body-tip]");
    await expect(tip).toContainText("本週");
    await expect(tip).toContainText("組");
    await expect(tip).toContainText("來自");
    await expect(tip).toContainText("腿推");
    await expect(tip).toContainText("深蹲");
  });

  test("11) body battery low → quick version, can override", async ({ page }) => {
    await open(page, { now: TUE_10, sleep: "8", bb: "22" });
    await expect(page.locator("[data-testid=train-card]")).toContainText("家裡啞鈴快版");
    await page.locator("[data-testid=reason-info]").click();
    await expect(page.locator("[data-testid=reason]")).toContainText("Body Battery");
    await page.locator("[data-override=original]").click();
    await expect(page.locator("[data-testid=train-card]")).toContainText("健身房 A");
  });

  test("12) missed Tuesday shifts Friday to Plan A", async ({ page }) => {
    await open(page, { now: FRI_10, sleep: "8" }, withBreakfast("2026-11-13"));
    await expect(page.locator("[data-testid=train-card]")).toContainText("健身房 A");
  });

  test("13) Tuesday session then Friday is Plan B", async ({ page }) => {
    await open(page, { now: FRI_10, sleep: "8" }, withBreakfast("2026-11-13", {
      logs: { "2026-11-10": { workoutId: "gymA", finishedAt: "2026-11-10T11:00:00+07:00", moves: { 腿推: [{ done: true }] } } },
    }));
    await expect(page.locator("[data-testid=train-card]")).toContainText("健身房 B");
  });
});

test.describe("NUTRI", () => {
  test("1) ring and label share rest 1950 / train 2150", async ({ page }) => {
    await open(page, { now: SAT_10, sleep: "8" });
    const eat = page.locator("[data-testid=eat-card]");
    await expect(eat).toContainText("1950");
    await expect(eat).not.toContainText("2152");
    await expect(eat).not.toContainText("1900–2000");
    await expect(eat).not.toContainText("2100–2200");
    const ring = eat.locator(".ring").first();
    await expect(ring).toContainText("1950");

    await open(page, { now: TUE_15, sleep: "8" });
    const trainEat = page.locator("[data-testid=eat-card]");
    await expect(trainEat).toContainText("2150");
    await expect(trainEat).not.toContainText("2100–2200");
    await expect(trainEat).not.toContainText("1900–2000");
    await expect(trainEat.locator(".ring").first()).toContainText("2150");
  });

  test("2) only 16:00, 18:30, 21:00 meal slots", async ({ page }) => {
    await open(page, { now: TUE_15, sleep: "8" });
    const eat = page.locator("[data-testid=eat-card]");
    await expect(eat.locator("[data-testid=meal-snack]")).toContainText("16:00");
    await expect(eat.locator("[data-testid=meal-dinner]")).toContainText("18:30");
    await expect(eat.locator("[data-testid=meal-eggs21]")).toContainText("21:00");
    await expect(eat.locator(".meal-row")).toHaveCount(3);
    await expect(eat).not.toContainText("早餐");
    await expect(eat).not.toContainText("午餐");
  });

  test("3) whey 芝麻/豆漿/杏仁 20g, 極致 25g, chicken 200/150", async ({ page }) => {
    await open(page, { now: TUE_15, sleep: "8" });
    const snack = page.locator("[data-testid=meal-snack]");
    await expect(snack).toContainText("芝麻");
    await expect(snack).toContainText("豆漿");
    await expect(snack).toContainText("杏仁");
    await expect(snack).toContainText("極致");
    await expect(page.locator("[data-testid=meal-dinner]")).toContainText("雞胸 200g");
    await expect(snack).toContainText("蛋白 42g");
    await page.locator("[data-scoop-slot='0'][data-scoop-id='plant']").first().click();
    await expect(page.locator("[data-testid=meal-dinner]")).toContainText("雞胸 150g");
    await expect(snack).toContainText("蛋白 47g");
  });

  test("4) shop add, bars, frequent, starch plan not zero", async ({ page }) => {
    await open(page, { now: TUE_10, sleep: "8" });
    await page.locator("[data-tab=shop]").click();
    await expect(page.locator("[data-testid=shop-bars]")).toBeVisible();
    await expect(page.locator("[data-testid=shop-starch-plan]")).not.toHaveText("0");
    await expect(page.locator("[data-testid=shop-hint]")).toContainText("澱粉夠吃");
    await expect(page.locator("[data-testid=shop-hint]")).toContainText("/");
    await page.locator("[data-testid=shop-yam] .ck").click();
    await expect(page.locator("[data-testid=shop-starch-days]")).not.toHaveText("0");
    await page.locator("[data-testid=shop-plus]").click();
    await page.locator("[data-testid=shop-add] [data-shop-new-name]").fill("自製雞胸");
    await page.locator("[data-testid=shop-add] [data-shop-new-amount]").fill("300g");
    await expect(page.locator("[data-testid=shop-cats]")).toBeVisible();
    await page.locator("[data-shop-cat=protein]").click();
    await page.locator("[data-testid=shop-add] [data-shop-add]").click();
    await expect(page.locator("[data-testid=shop-chips]")).toContainText("自製雞胸");
    await expect(page.locator("[data-testid=shop-chips]")).toContainText("300g");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".ttl");
    await page.locator("[data-tab=shop]").click();
    await expect(page.locator("[data-testid=shop-chips]")).toContainText("自製雞胸");
    await expect(page.locator("[data-testid=shop-chips]")).toContainText("300g");
    await expect(page.locator("[data-testid=shop-frequent-rice]")).toHaveClass(/on/);
  });

  test("5) meal first layer is ✓ 吃了 + 吃了別的; portions on second layer", async ({ page }) => {
    await open(page, { now: TUE_15, sleep: "8" });
    const dinner = page.locator("[data-testid=meal-dinner]");
    await expect(dinner.locator("[data-eat]")).toHaveText("✓ 吃了");
    await expect(dinner.locator("[data-eat-else]")).toContainText("吃了別的");
    await expect(dinner.locator("[data-testid=palm-dinner]")).toHaveCount(0);
    await dinner.locator("[data-testid=meal-more-dinner]").click();
    await expect(dinner.locator("[data-testid=palm-dinner]")).toBeVisible();
    await expect(dinner.locator("[data-testid=portion-dinner]")).toBeVisible();
  });

  test("6) 傳給喵喵們 preview sheet before and after copy", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await open(page, { now: TUE_10, sleep: "8" }, {
      logs: {
        "2026-11-10": {
          workoutId: "gymA",
          backScore: 2,
          moves: { 腿推: [{ done: true, weight: 50, reps: 10 }] },
        },
      },
    });
    await page.locator("[data-testid=share-cats]").click();
    const sheet = page.locator("[data-testid=share-sheet]");
    await expect(sheet).toBeVisible();
    await expect(sheet.locator("[data-testid=share-sheet-text]")).toContainText("今天吃");
    await expect(sheet.locator("[data-testid=share-sheet-text]")).toContainText("18:30");
    await expect(sheet.locator("[data-testid=share-copy]")).toHaveText("複製");
    await sheet.locator("[data-testid=share-copy]").click();
    await expect(sheet.locator("[data-testid=share-copy]")).toContainText("已複製");
    await expect(sheet.locator("[data-testid=share-sheet-text]")).toContainText("今天吃");
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toMatch(/今天吃/);
    expect(text).toMatch(/今天訓練/);
    expect(text).toMatch(/腿推/);
    expect(text).toMatch(/下背：2/);
  });
});

test.describe("FOOD", () => {
  test("eat toggle marks and unmarks ✓ 吃了", async ({ page }) => {
    await open(page, { now: TUE_15, sleep: "8" });
    const btn = page.locator("[data-testid=meal-dinner] [data-eat]");
    await expect(page.locator("[data-testid=meal-dinner]")).not.toHaveClass(/eaten/);
    await btn.click();
    await expect(page.locator("[data-testid=meal-dinner]")).toHaveClass(/eaten/);
    await btn.click();
    await expect(page.locator("[data-testid=meal-dinner]")).not.toHaveClass(/eaten/);
    await expect(page.locator("body")).not.toContainText("復原");
  });

  test("portions and 外食 update after opening 份量", async ({ page }) => {
    await open(page, { now: TUE_15, sleep: "8" });
    await page.locator("[data-testid=meal-more-dinner]").click();
    await page.locator("[data-testid=meal-dinner] [data-palm][data-delta='1']").click();
    await expect(page.locator("[data-testid=palm-dinner]")).toContainText("1 掌");
    await expect(page.locator("[data-testid=meal-dinner]")).toContainText("30");
    await page.locator("[data-testid=meal-dinner] [data-out-type][data-oid='bento']").click();
    await expect(page.locator("[data-testid=meal-dinner]")).toContainText("外食便當");
  });

  test("all three logged meals add protein", async ({ page }) => {
    await open(page, { now: TUE_15, sleep: "8" });
    await page.locator("[data-testid=meal-snack] [data-eat]").click();
    await page.locator("[data-testid=meal-dinner] [data-eat]").click();
    await page.locator("[data-testid=meal-eggs21] [data-eat]").click();
    const ring = page.locator("[data-testid=eat-card] .ring").nth(1);
    await expect(ring).toContainText("106");
  });
});

test.describe("FITMI", () => {
  test("rest day shows 今天也想練 and shift-aware A/B picker", async ({ page }) => {
    await open(page, { now: SAT_10, sleep: "8" });
    await expect(page.locator("[data-testid=rest-line]")).toContainText("休息日");
    await expect(page.locator("[data-testid=want-train]")).toHaveText("今天也想練");
    await expect(page.locator("[data-testid=train-card]")).toHaveCount(0);
    await page.locator("[data-testid=want-train]").click();
    await expect(page.locator("[data-testid=rest-picks]")).toBeVisible();
    await expect(page.locator("[data-testid=rest-train-gymA]")).toContainText("這週下一堂");
    await page.locator("[data-testid=rest-train-gymA]").click();
    await expect(page.locator("[data-testid=train-card]")).toContainText("健身房 A");
    await expect(page.locator("[data-start]")).toBeVisible();

    await open(page, { now: SAT_10, sleep: "8" }, {
      logs: { "2026-11-03": { workoutId: "gymA", finishedAt: "2026-11-03T11:00:00+07:00", moves: { 腿推: [{ done: true }] } } },
    });
    await page.locator("[data-testid=want-train]").click();
    await expect(page.locator("[data-testid=rest-train-gymB]")).toContainText("這週下一堂");
    await page.locator("[data-testid=rest-train-gymB]").click();
    await expect(page.locator("[data-testid=train-card]")).toContainText("健身房 B");
  });

  test("rest day one-liner says whether quick version is OK", async ({ page }) => {
    await open(page, { now: SAT_10, sleep: "5", bb: "18" });
    await expect(page.locator("[data-testid=rest-quick]")).toContainText("快版");
    await expect(page.locator("[data-testid=rest-quick]")).toContainText(/睡|Body Battery/);

    await open(page, { now: SAT_10, sleep: "8" });
    await expect(page.locator("[data-testid=rest-quick]")).toContainText("可以練原課表");
  });

  test("unticking 16:00 protein subtracts the 340 kcal", async ({ page }) => {
    await open(page, { now: SAT_10, sleep: "8" });
    const snack = page.locator("[data-testid=meal-snack]");
    await snack.locator("[data-testid=meal-more-snack]").click();
    await snack.locator("[data-testid=whey2-snack]").click();
    const ring = page.locator("[data-testid=eat-card] .ring").first().locator("b");
    await expect(ring).toHaveText("340");
    await expect(snack).toHaveClass(/eaten/);
    await snack.locator("[data-eat]").click();
    await expect(snack).not.toHaveClass(/eaten/);
    await expect(ring).toHaveText("0");
  });

  test("full workout: exercise page, prefilled weight, done + rest, back score, export", async ({ page, context }) => {
    test.setTimeout(60000);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await open(page, { now: TUE_10, sleep: "8", rest: "1" }, withBreakfast("2026-11-10", {
      lastLoads: { "腿推": { weight: 80, reps: 12, date: "2026-11-06" } },
      logs: {
        "2026-11-06": {
          workoutId: "gymA",
          finishedAt: "2026-11-06T11:00:00+07:00",
          backScore: 1,
          moves: { 腿推: [{ done: true, weight: 80, reps: 12 }] },
        },
      },
    }));
    await page.locator("[data-start]").click();
    await expect(page.locator(".wo-name")).toContainText("腿推");
    await expect(page.locator("[data-testid=wo-figure]")).toBeVisible();
    await expect(page.locator("[data-testid=wo-cue]")).not.toHaveText("");
    await expect(page.locator(".load .num").first()).toContainText("80");
    await page.locator("[data-complete]").click();
    await expect(page.locator("[data-testid=rest-timer]")).toBeVisible();
    await page.locator("[data-skip-rest]").click();

    for (let i = 0; i < 60; i++) {
      const back = page.locator("[data-testid=done-screen], [data-finish-home]").first();
      const exb = page.locator("[data-exback='2']");
      const skip = page.locator("[data-skip-rest]");
      const done = page.locator("[data-complete]");
      try {
        await page.locator("[data-finish-home], [data-exback], [data-skip-rest], [data-complete]").first().waitFor({ state: "visible", timeout: 5000 });
      } catch (err) {
        throw new Error("workout flow stuck at step " + i);
      }
      if (await back.isVisible()) break;
      if (await exb.isVisible()) {
        await exb.click();
        continue;
      }
      if (await skip.isVisible()) {
        await skip.click();
        continue;
      }
      if (await done.isVisible()) {
        await done.click();
        continue;
      }
      throw new Error("workout flow stuck at step " + i);
    }
    await expect(page.locator("main")).toContainText("下背 2");
    await page.locator("[data-finish-home]").click();
    await page.locator("[data-testid=share-cats]").click();
    const text = page.locator("[data-testid=share-sheet-text]");
    await expect(text).toContainText("今天訓練");
    await expect(text).toContainText("腿推");
    await expect(text).toContainText("80kg×");
    await expect(text).toContainText("下背：2");
  });
});

test.describe("FITMI2", () => {
  test("1) chest counts stay 3 when log and session overlap", async ({ page }) => {
    const sets = [{ done: true }, { done: true }, { done: true }];
    await open(page, { now: TUE_10, sleep: "8" }, {
      logs: { "2026-11-10": { workoutId: "gymA", finishedAt: 1, moves: { 胸推: sets } } },
      session: { date: "2026-11-10", workoutId: "gymA", phase: "done", moves: { 胸推: sets } },
    });
    await expect(page.locator("[data-testid=week-chip-chest]")).toHaveText("胸 3 組");
    await page.locator(".body-svg [data-part=chest]").first().click();
    const tip = page.locator("[data-testid=body-tip]");
    await expect(tip).toContainText("本週 3 組");
    await expect(tip).toContainText("來自");
    await expect(tip).toContainText("胸推");
    await expect(tip).not.toContainText("本週 6 組");
  });

  test("2+3) export is 腿推 60kg×10×3 and workout comes first", async ({ page }) => {
    await open(page, { now: TUE_10, sleep: "8" }, {
      logs: {
        "2026-11-10": {
          workoutId: "gymA",
          backScore: 2,
          moves: {
            腿推: [
              { done: true, weight: 60, reps: 10 },
              { done: true, weight: 60, reps: 10 },
              { done: true, weight: 60, reps: 10 },
            ],
          },
        },
      },
    });
    await page.locator("[data-testid=share-cats]").click();
    const text = await page.locator("[data-testid=share-sheet-text]").innerText();
    expect(text).toContain("腿推 60kg×10×3");
    expect(text.indexOf("今天訓練")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("今天訓練")).toBeLessThan(text.indexOf("今天吃"));
  });

  test("4) back score >= 3 swaps row and press, not only squat", async ({ page }) => {
    await open(page, { now: TUE_10, sleep: "8" }, withBreakfast("2026-11-10", {
      logs: {
        "2026-11-06": {
          workoutId: "gymA",
          backScore: 3,
          finishedAt: "2026-11-06T11:00:00+07:00",
          moves: { 腿推: [{ done: true }] },
        },
      },
    }));
    await page.locator("[data-start]").click();
    const steps = await page.evaluate(() => JSON.parse(localStorage.getItem("fatcat-v2")).session.steps.map((s) => s.name));
    expect(steps).toContain("胸靠划船");
    expect(steps).toContain("坐姿有靠背肩推");
    expect(steps).toContain("地板臥推");
    expect(steps).not.toContain("坐姿划船");
    expect(steps).not.toContain("坐姿啞鈴肩推");
  });

  test("5) 腿推 cue is 下背別離開椅背", async ({ page }) => {
    await open(page, { now: TUE_10, sleep: "8" }, withBreakfast("2026-11-10", {
      logs: {
        "2026-11-06": {
          workoutId: "gymA",
          finishedAt: "2026-11-06T11:00:00+07:00",
          backScore: 1,
          moves: { 腿推: [{ done: true, weight: 80, reps: 12 }] },
        },
      },
    }));
    await page.locator("[data-start]").click();
    await expect(page.locator(".wo-name")).toContainText("腿推");
    await expect(page.locator("[data-testid=wo-cue]")).toHaveText("下背別離開椅背");
  });

  test("6) swap suggestions show right after scoring 3+", async ({ page }) => {
    await open(page, { now: TUE_10, sleep: "8" }, {
      session: {
        date: "2026-11-10",
        workoutId: "gymA",
        phase: "back",
        steps: [],
        moves: { 腿推: [{ done: true, weight: 60, reps: 10 }] },
        backScore: null,
      },
    });
    await page.evaluate(() => { location.hash = "workout"; });
    await page.waitForSelector("[data-back='3']");
    await page.locator("[data-back='3']").click();
    await expect(page.locator("[data-testid=back-score]")).toContainText("下背 3 分");
    const swaps = page.locator("[data-testid=back-swaps]");
    await expect(swaps).toBeVisible();
    await expect(swaps).toContainText("下次換動作");
    await expect(swaps).toContainText("胸靠划船");
    await expect(swaps).toContainText("坐姿有靠背肩推");
    await expect(page.locator("body")).not.toContainText("復原");
  });

  test("7) pantry 雞胸 600g does not duplicate qty or inflate days", async ({ page }) => {
    await open(page, { now: TUE_10, sleep: "8" });
    await page.locator("[data-tab=shop]").click();
    await expect(page.locator("[data-testid=shop-protein-plan]")).toHaveText("14");
    await page.locator("[data-testid=shop-plus]").click();
    await page.locator("[data-shop-new-name]").fill("雞胸");
    await page.locator("[data-shop-new-amount]").fill("600g");
    const cats = page.locator("[data-testid=shop-cats]");
    if (await cats.isVisible()) await page.locator("[data-shop-cat=protein]").click();
    await page.locator("[data-shop-add]").click();
    const chip = page.locator("[data-testid=shop-chips]");
    await expect(chip).toContainText("雞胸 600g");
    await expect(chip).not.toContainText("600g600g");
    const chipText = await chip.innerText();
    expect(chipText.split("600g").length - 1).toBe(1);
    const row = page.locator(".item", { hasText: "雞胸 600g" }).first();
    await expect(row).toBeVisible();
    const rowText = await row.innerText();
    expect(rowText).not.toContain("600g600g");
    expect((rowText.match(/600g/g) || []).length).toBe(1);
    await expect(page.locator("[data-testid=shop-protein-plan]")).toHaveText("14");
    await expect(page.locator("[data-testid=shop-bars]")).not.toContainText("314");
  });
});

test.describe("ROUND3", () => {
  const gymA = (extra = {}) => withBreakfast("2026-11-10", extra);
  test("0) pantry from 3/14 stays X/14 after adding 雞胸 600g", async ({ page }) => {
    await open(page, { now: TUE_10, sleep: "8" });
    await page.locator("[data-tab=shop]").click();
    for (const id of ["shop-item-chicken", "shop-item-seafood"]) {
      const el = page.locator(`[data-testid=${id}]`);
      if (await el.count()) await el.first().click();
    }
    const before = await page.locator("[data-testid=shop-bars]").innerText();
    await page.locator("[data-testid=shop-plus]").click();
    await page.locator("[data-shop-new-name]").fill("雞胸");
    await page.locator("[data-shop-new-amount]").fill("600g");
    if (await page.locator("[data-testid=shop-cats]").isVisible()) await page.locator("[data-shop-cat=protein]").click();
    await page.locator("[data-shop-add]").click();
    const after = await page.locator("[data-testid=shop-bars]").innerText();
    expect(after).toMatch(/蛋白質 \d+\/14 天/);
    expect(after).not.toContain("314");
    expect(after.match(/蛋白質 (\d+)/)[1]).toBe(before.match(/蛋白質 (\d+)/)[1]);
    expect(await page.getByText("600g600g").count()).toBe(0);
    expect(await page.locator(".item").filter({ hasText: "雞胸 600g" }).count()).toBe(1);
  });
  test("1) training-day share puts workout first even before training", async ({ page }) => {
    await open(page, { now: TUE_10, sleep: "8" }, gymA());
    await page.locator("[data-testid=share-cats]").click();
    const text = await page.locator("[data-testid=share-sheet-text]").innerText();
    expect(text.indexOf("今天訓練")).toBeGreaterThan(0);
    expect(text.indexOf("今天訓練")).toBeLessThan(text.indexOf("今天吃"));
  });
  test("2+3) default weights, 徒手, last-used, ±2.5", async ({ page }) => {
    await open(page, { now: TUE_10, sleep: "8" }, gymA({ lastLoads: { 腿推: { weight: 80, reps: 12 } }, logs: { "2026-11-06": { workoutId: "gymB", finishedAt: "2026-11-06T11:00:00+07:00", backScore: 1, moves: { 腿推: [{ done: true, weight: 80, reps: 12 }] } } } }));
    await page.locator("[data-start]").click();
    await expect(page.locator("[data-testid=wo-weight]")).toContainText("80");
    await page.locator("[data-testid=w-plus]").click();
    await expect(page.locator("[data-testid=wo-weight]")).toContainText("82.5");
    await page.locator("[data-testid=w-minus]").click();
    await page.locator("[data-testid=w-minus]").click();
    await expect(page.locator("[data-testid=wo-weight]")).toContainText("77.5");
    const seen = {};
    for (let i = 0; i < 6; i++) {
      const name = (await page.locator(".wo-name").innerText()).split("\n")[0].trim();
      seen[name] = (await page.locator("[data-testid=wo-weight]").innerText()).trim();
      await page.evaluate((n) => {
        const s = JSON.parse(localStorage.getItem("fatcat-v2"));
        s.session.i = n; s.session.setI = 0; s.session.editWeight = null;
        localStorage.setItem("fatcat-v2", JSON.stringify(s));
      }, i + 1);
      await page.evaluate(() => { location.hash = "today"; });
      await page.evaluate(() => { location.hash = "workout"; });
      await page.waitForTimeout(100);
      if (i + 1 >= 6) break;
    }
    expect(Object.keys(seen).length).toBeGreaterThanOrEqual(5);
    for (const [n, w] of Object.entries(seen)) {
      if (/死蟲/.test(n)) expect(w).toBe("徒手");
      else { expect(w).toMatch(/^\d+(\.\d)? kg$/); expect(w).not.toContain("—"); }
    }
  });
  test("4) per-exercise 下背 OK 嗎, >=3 swaps that exercise only", async ({ page }) => {
    await open(page, { now: TUE_10, sleep: "8", rest: "0" }, gymA());
    await page.locator("[data-start]").click();
    // finish exercise 1 (腿推, 3 sets)
    for (let s = 0; s < 3; s++) {
      await page.locator("[data-complete]").click();
      if (s < 2) await page.locator("[data-skip-rest]").click();
    }
    await expect(page.locator("[data-testid=exback]")).toContainText("下背 OK 嗎");
    await page.locator("[data-exback='1']").click();
    await page.locator("[data-skip-rest]").click();
    // exercise 2 (胸推)
    for (let s = 0; s < 3; s++) {
      await page.locator("[data-complete]").click();
      if (s < 2) await page.locator("[data-skip-rest]").click();
    }
    await page.locator("[data-exback='4']").click();
    await expect(page.locator("[data-testid=ex-swap-note]")).toHaveText("下次這動作換成 地板臥推");
    const sw = await page.evaluate(() => JSON.parse(localStorage.getItem("fatcat-v2")).backSwap);
    expect(Object.values(sw)).toEqual(["地板臥推"]);
  });
  test("4b) next session swaps only that exercise", async ({ page }) => {
    await open(page, { now: TUE_10, sleep: "8" }, gymA({ backSwap: { 胸推: "地板臥推" } }));
    await page.locator("[data-start]").click();
    const steps = await page.evaluate(() => JSON.parse(localStorage.getItem("fatcat-v2")).session.steps.map((s) => s.name));
    expect(steps).toContain("地板臥推");
    expect(steps).toContain("坐姿划船");
    expect(steps).toContain("坐姿啞鈴肩推");
  });
  test("5+6) home shows 今天已練 ✓ and 今天也想練 A/B/快版", async ({ page }) => {
    await open(page, { now: TUE_15, sleep: "8" }, gymA({ logs: { "2026-11-10": { workoutId: "gymA", finishedAt: 1, backScore: 1, moves: { 腿推: [{ done: true, weight: 60, reps: 10 }] } } } }));
    await expect(page.locator("[data-testid=trained-today]")).toHaveText("今天已練 ✓");
    await expect(page.locator("[data-start]")).toHaveCount(0);
    await page.locator("[data-testid=want-train]").click();
    await expect(page.locator("[data-testid=rest-train-gymA]")).toBeVisible();
    await expect(page.locator("[data-testid=rest-train-gymB]")).toBeVisible();
    await expect(page.locator("[data-testid=rest-train-quick]")).toBeVisible();
  });
  test("6b) training day home offers 今天也想練 picker before training", async ({ page }) => {
    await open(page, { now: TUE_10, sleep: "8" }, gymA());
    await page.locator("[data-testid=want-train]").click();
    await page.locator("[data-testid=rest-train-quick]").click();
    await expect(page.locator("[data-testid=train-card]")).toContainText("快版");
  });
  test("7) version shown on screen", async ({ page }) => {
    await open(page, { now: TUE_10, sleep: "8" }, gymA());
    const v = await (await page.request.get(`${process.env.FATMI_PREFIX || ""}/preview/version.json?t=${Date.now()}`)).json();
    await expect(page.locator("[data-testid=app-version]")).toHaveText(`v${v.version}`);
  });
});
