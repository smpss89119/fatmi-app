const { test, expect } = require("@playwright/test");

const TUE_10 = "2026-11-10T10:00:00+07:00";
const TUE_15 = "2026-11-10T15:00:00+07:00";
const WED_10 = "2026-11-11T10:00:00+07:00";
const FRI_10 = "2026-11-13T10:00:00+07:00";
const SAT_10 = "2026-11-07T10:00:00+07:00";

function url(extra = {}) {
  const q = new URLSearchParams({ debug: "1", rest: "1", ...extra });
  return `/preview/?${q.toString()}`;
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

    for (let i = 0; i < 40; i++) {
      const back = page.locator("[data-back]").first();
      const skip = page.locator("[data-skip-rest]");
      const done = page.locator("[data-complete]");
      try {
        await page.locator("[data-back], [data-skip-rest], [data-complete]").first().waitFor({ state: "visible", timeout: 5000 });
      } catch (err) {
        throw new Error("workout flow stuck at step " + i);
      }
      if (await back.isVisible()) break;
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
    await page.locator("[data-back='2']").click();
    await expect(page.locator("main")).toContainText("下背 2");
    await page.locator("[data-finish-home]").click();
    await page.locator("[data-testid=share-cats]").click();
    const text = page.locator("[data-testid=share-sheet-text]");
    await expect(text).toContainText("今天訓練");
    await expect(text).toContainText("腿推");
    await expect(text).toContainText("80 kg");
    await expect(text).toContainText("下背：2");
  });
});
