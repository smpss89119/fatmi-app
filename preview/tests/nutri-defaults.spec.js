const { test, expect } = require("@playwright/test");
const P = `${process.env.FATMI_PREFIX || ""}${process.env.FATMI_PATH || "/preview/"}`;
const TUE_15 = "2026-11-10T15:00:00+07:00";
const url = `${P}?debug=1&sleep=8&now=${encodeURIComponent(TUE_15)}#shop`;
const shot = (n) => (process.env.SHOT_DIR ? { path: `${process.env.SHOT_DIR}/${n}` } : {});
test.use({ viewport: { width: 390, height: 844 } });

test("r15) Nutri official per-份 defaults: 雞胸/地瓜/毛豆 + 7 whey flavors", async ({ page }) => {
  await page.goto(url); await page.waitForSelector(".ttl");
  await page.locator("[data-tab=shop]").click();

  await page.locator("[data-testid=shop-edit-chicken]").click();
  await expect(page.locator("[data-testid=edit-kcal]")).toHaveValue("140");
  await expect(page.locator("[data-testid=edit-prot]")).toHaveValue("28");
  await expect(page.locator("[data-testid=edit-nutri-src]")).toHaveText("食藥署");
  await page.locator("[data-edit-close]").click();

  await page.locator("[data-testid=shop-edit-yam]").click();
  await expect(page.locator("[data-testid=edit-kcal]")).toHaveValue("182");
  await expect(page.locator("[data-testid=edit-prot]")).toHaveValue("2");
  await page.locator("[data-edit-close]").click();

  await page.locator("[data-testid=shop-edit-edamame]").click();
  await expect(page.locator("[data-testid=edit-portion]")).toHaveValue("100 g");
  await expect(page.locator("[data-testid=edit-kcal]")).toHaveValue("129");
  await expect(page.locator("[data-testid=edit-prot]")).toHaveValue("15");
  await page.locator("[data-edit-close]").click();

  await page.locator("[data-testid=shop-edit-whey]").click();
  const expectW = async (id, kcal, prot, src = "樂維根標示") => {
    await expect(page.locator(`[data-testid=whey-kcal-${id}]`)).toHaveValue(String(kcal));
    await expect(page.locator(`[data-whey-p=${id}]`)).toHaveValue(String(prot));
    await expect(page.locator(`[data-testid=whey-src-${id}]`)).toContainText(src);
  };
  await expectW("sesame", 158, 24);
  await expectW("soymilk", 172, 26);
  await expectW("almond", 172, 21);
  // 15 new classics; sesameSweet must not overwrite sesame
  await expectW("peanut", 176, 24);
  await expectW("coffeeUS", 152, 23);
  await expectW("choco", 162, 22);
  await expectW("milkTea", 162, 20);
  await expectW("teaSoy", 160, 25);
  await expectW("matchaMilk", 154, 22);
  await expectW("vanilla", 172, 24);
  await expectW("jasmine", 167, 22);
  await expectW("miencha", 170, 22);
  await expectW("yuanyang", 162, 23);
  await expectW("brownSugar", 164, 21);
  await expectW("sesameSweet", 170, 21);
  await expectW("tieguanyin", 157, 22);
  await expectW("coffeeSweet", 160, 23);
  await expectW("oatMilk", 159, 21);
  await expectW("hfStrawberry", 122, 18);
  await expectW("hfPeach", 121, 18);
  await expectW("hfMelon", 122, 18);
  await expect(page.locator("[data-whey-g=hfStrawberry]")).toHaveValue("35");
  await expect(page.locator("[data-whey-g=hfPeach]")).toHaveValue("35");
  await expect(page.locator("[data-whey-g=hfMelon]")).toHaveValue("35");
  await expectW("hcSoymilk", 176, 20);
  await expectW("hcOatMilk", 165, 17);
  await expectW("hcAlmond", 170, 19);
  await expect(page.locator("[data-whey-g=hcSoymilk]")).toHaveValue("40");
  // classics not overwritten
  await expectW("soymilk", 172, 26);
  await expectW("almond", 172, 21);
  await expect(page.locator("[data-testid=whey-edit-sesame]")).toContainText("無糖芝麻");
  await expect(page.locator("[data-testid=whey-edit-sesameSweet]")).toContainText("芝麻（有糖）");
  await expect(page.locator("[data-testid=whey-edit-coffeeUS]")).toContainText("無糖咖啡");
  await expect(page.locator("[data-testid=whey-edit-coffeeSweet]")).toContainText("咖啡（有糖）");
  await expectW("plant", 164, 27);
  await expectW("plantChoco", 148, 23);
  await expectW("plantOat", 152, 25);
  await expectW("plantAlmond", 183, 26);
  await expect(page.locator("[data-testid=whey-src-plantAlmond]")).toContainText("182.6");
  await page.screenshot(shot("fatmi_r15_whey.png"), { fullPage: true });
  await page.locator("[data-edit-close]").click();

  // 建毅項 = 純淨杏仁 183/26
  await page.locator("[data-tab=today]").click();
  await page.locator("[data-eat-else=dinner]").click();
  await expect(page.locator('[data-testid="else-whey:plantAlmond"]')).toContainText("純淨杏仁");
  await page.locator('[data-testid="else-inc-whey:plantAlmond"]').click();
  await expect(page.locator("[data-testid=else-total]")).toHaveText("183 kcal · 蛋白 26 g");
  await page.locator("[data-testid=else-save]").click();
  await expect(page.locator("[data-testid=meal-dinner] .nums")).toHaveText("183 · 蛋白 26g");
  await expect(page.locator("[data-testid=meal-pick-dinner]")).toContainText("純淨杏仁");
  await page.screenshot(shot("fatmi_r16_plant_almond_log.png"));
  // spot-check a new classic on a fresh meal (snack)
  await page.locator("[data-eat-else=snack]").click();
  await page.locator('[data-testid="else-inc-whey:peanut"]').click();
  await expect(page.locator("[data-testid=else-total]")).toHaveText("176 kcal · 蛋白 24 g");
  await page.locator("[data-testid=else-save]").click();
  await expect(page.locator("[data-testid=meal-snack] .nums")).toHaveText("176 · 蛋白 24g");
  await page.screenshot(shot("fatmi_r17_peanut_log.png"));
  await page.locator("[data-eat-else=eggs21]").click();
  await page.locator('[data-testid="else-inc-whey:hfStrawberry"]').click();
  await expect(page.locator("[data-testid=else-total]")).toHaveText("122 kcal · 蛋白 18 g");
  await expect(page.locator('[data-testid="else-whey:hfStrawberry"]')).toContainText("高纖草莓35g");
  await page.locator("[data-testid=else-save]").click();
  await expect(page.locator("[data-testid=meal-eggs21] .nums")).toHaveText("122 · 蛋白 18g");
  await page.screenshot(shot("fatmi_r18_hifiber_log.png"));
});
