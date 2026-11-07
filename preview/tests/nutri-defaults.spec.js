const { test, expect } = require("@playwright/test");
const P = `${process.env.FATMI_PREFIX || ""}${process.env.FATMI_PATH || "/preview/"}`;
const TUE_15 = "2026-11-10T15:00:00+07:00";
const url = `${P}?debug=1&sleep=8&now=${encodeURIComponent(TUE_15)}#shop`;
const shot = (n) => (process.env.SHOT_DIR ? { path: `${process.env.SHOT_DIR}/${n}` } : {});
test.use({ viewport: { width: 390, height: 844 } });

test("r15) Nutri official per-份 defaults: 雞胸/地瓜/毛豆 + whey; custom stays 待確認", async ({ page }) => {
  await page.goto(url); await page.waitForSelector(".ttl");
  await page.locator("[data-tab=shop]").click();

  await page.locator("[data-testid=shop-edit-chicken]").click();
  await expect(page.locator("[data-testid=edit-kcal]")).toHaveValue("140");
  await expect(page.locator("[data-testid=edit-prot]")).toHaveValue("28");
  await expect(page.locator("[data-testid=edit-nutri-src]")).toHaveText("食藥署");
  await page.screenshot(shot("fatmi_r15_chicken.png"));
  await page.locator("[data-edit-close]").click();

  await page.locator("[data-testid=shop-edit-yam]").click();
  await expect(page.locator("[data-testid=edit-kcal]")).toHaveValue("182");
  await expect(page.locator("[data-testid=edit-prot]")).toHaveValue("2");
  await expect(page.locator("[data-testid=edit-nutri-src]")).toHaveText("食藥署");
  await page.screenshot(shot("fatmi_r15_yam.png"));
  await page.locator("[data-edit-close]").click();

  await page.locator("[data-testid=shop-edit-edamame]").click();
  await expect(page.locator("[data-testid=edit-portion]")).toHaveValue("100 g");
  await expect(page.locator("[data-testid=edit-kcal]")).toHaveValue("129");
  await expect(page.locator("[data-testid=edit-prot]")).toHaveValue("15");
  await expect(page.locator("[data-testid=edit-nutri-src]")).toHaveText("食藥署");
  await page.screenshot(shot("fatmi_r15_edamame.png"));
  await page.locator("[data-edit-close]").click();

  await page.locator("[data-testid=shop-edit-whey]").click();
  await expect(page.locator("[data-testid=whey-kcal-sesame]")).toHaveValue("183");
  await expect(page.locator("[data-testid=whey-kcal-soymilk]")).toHaveValue("183");
  await expect(page.locator("[data-testid=whey-kcal-almond]")).toHaveValue("183");
  await expect(page.locator("[data-testid=whey-kcal-plant]")).toHaveValue("");
  await expect(page.locator("[data-testid=whey-pend-plant]")).toHaveText("待確認");
  await page.screenshot(shot("fatmi_r15_whey.png"));
  await page.locator("[data-edit-close]").click();

  // custom without nutrition stays 待確認; else uses chicken defaults
  await page.locator("[data-testid=shop-plus]").click();
  await page.locator("[data-testid=shop-add] [data-shop-new-name]").fill("燕麥");
  await page.locator("[data-testid=shop-add] [data-shop-new-amount]").fill("500g");
  await page.locator("[data-testid=shop-cat-starch]").click();
  await page.locator("[data-shop-add]").click();
  const id = await page.evaluate(() => JSON.parse(localStorage.getItem("fatcat-v2")).shopExtra.find((x) => x.name.startsWith("燕麥")).id);
  await expect(page.locator(`[data-testid=shop-nutri-pend-${id}]`)).toHaveText("待確認");
  await page.reload(); await page.waitForSelector(".ttl");
  await page.locator("[data-tab=shop]").click();
  await expect(page.locator(`[data-testid=shop-nutri-pend-${id}]`)).toHaveText("待確認");

  await page.locator("[data-tab=today]").click();
  await page.locator("[data-eat-else=dinner]").click();
  await page.locator('[data-testid="else-inc-chicken"]').click();
  await expect(page.locator("[data-testid=else-total]")).toContainText("140");
  await expect(page.locator("[data-testid=else-total]")).toContainText("28");
  await page.locator(`[data-testid="else-inc-${id}"]`).click();
  await expect(page.locator(`[data-testid="else-pend-${id}"]`)).toHaveText("待確認");
  await page.screenshot(shot("fatmi_r15_else.png"));
});
