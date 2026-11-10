const { test, expect } = require("@playwright/test");

const BASE = `${process.env.FATMI_PREFIX || ""}${process.env.FATMI_PATH || "/staging/"}`;
const SHOTS = process.env.FATMI_SHOTS || "";

function userKeys() {
  const o = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith("fatcat-") && k !== "fatcat-live" && k !== "fatcat-demo") o[k] = JSON.parse(localStorage.getItem(k));
  }
  return o;
}

const SOURCE = {
  mealLogs: { "2026-11-09": { breakfast: { eaten: true }, snack: { eaten: true, note: "蛋白粉 2 份 鯛魚排" } } },
  grocery: { chicken: true },
  hideSuggestReasons: true,
};

test("backup in one app restores identical storage in another", async ({ browser }) => {
  const a = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  await a.addInitScript((d) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("fatcat-v2", JSON.stringify(d));
      localStorage.setItem("fatcat-live", JSON.stringify({ cache: 1 }));
      sessionStorage.setItem("seeded", "1");
    }
  }, SOURCE);
  const pa = await a.newPage();
  await pa.goto(`${BASE}#rules`);
  await pa.waitForSelector("[data-testid=backup-card]");
  await pa.locator("[data-backup-toggle]").click();
  if (SHOTS) await pa.screenshot({ path: `${SHOTS}-1-rules.png`, fullPage: false });
  await pa.locator("[data-testid=backup-card]").scrollIntoViewIfNeeded();
  if (SHOTS) await pa.screenshot({ path: `${SHOTS}-2-card.png` });
  await pa.getByRole("button", { name: "複製備份" }).click();
  await expect(pa.locator("#toast")).toHaveText("已複製");
  if (SHOTS) await pa.screenshot({ path: `${SHOTS}-3-copied.png` });
  const code = await pa.evaluate(() => navigator.clipboard.readText());
  expect(code.startsWith("FATMI1:")).toBe(true);
  const before = await pa.evaluate(userKeys);
  expect(Object.keys(before)).toContain("fatcat-v2");
  expect(Object.keys(before)).not.toContain("fatcat-live");

  const b = await browser.newContext();
  await b.addInitScript(() => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("fatcat-v2", JSON.stringify({ grocery: { eggs: true }, junk: 1 }));
      sessionStorage.setItem("seeded", "1");
    }
  });
  const pb = await b.newPage();
  await pb.goto(`${BASE}#rules`);
  await pb.waitForSelector("[data-testid=backup-card]");
  await pb.locator("[data-backup-toggle]").click();
  // bad code is rejected without touching storage
  await pb.getByTestId("restore-input").fill("hello");
  await pb.getByRole("button", { name: "貼上還原" }).click();
  await expect(pb.locator("#toast")).toContainText("備份碼不對");
  await pb.getByTestId("restore-input").fill(code);
  await expect(pb.locator("#toast")).toBeHidden({ timeout: 5000 });
  await pb.locator("[data-testid=backup-card]").scrollIntoViewIfNeeded();
  if (SHOTS) await pb.screenshot({ path: `${SHOTS}-4-pasted.png` });
  let msg = "";
  pb.once("dialog", (d) => { msg = d.message(); d.accept(); });
  const nav = pb.waitForEvent("load");
  await pb.getByRole("button", { name: "貼上還原" }).click();
  await nav;
  expect(msg).toBe("會覆蓋這裡的紀錄，確定？");
  await pb.waitForSelector(".ttl");
  const after = await pb.evaluate(userKeys);
  expect(after).toEqual(before);
  if (SHOTS) {
    await pb.goto(`${BASE}#rules`);
    await pb.waitForSelector("[data-testid=backup-card]");
  await pb.locator("[data-backup-toggle]").click();
    await pb.evaluate(() => window.scrollTo(0, 0));
    await pb.screenshot({ path: `${SHOTS}-5-restored-rules.png` });
  }
  await a.close();
  await b.close();
});
