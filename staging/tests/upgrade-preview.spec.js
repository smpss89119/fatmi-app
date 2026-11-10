// His phone icon points at /fatmi-app/preview/. After ./promote.sh, the SAME URL must serve the official build
// without losing localStorage (same origin + same key "fatcat-v2"), and the stale-trainDays migration must apply.
const { test, expect } = require("@playwright/test");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const REPO = path.resolve(__dirname, "../..");
const OLD_REV = process.env.FATMI_OLD_REV || "44b1911"; // preview-38, what the phone ran before this change
let tmp, oldDir, newRoot;

test.beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fatmi-upg-"));
  oldDir = path.join(tmp, "old");
  fs.mkdirSync(oldDir);
  execSync(`git -C ${REPO} archive ${OLD_REV} preview | tar -x -C ${oldDir}`);
  oldDir = path.join(oldDir, "preview");
  newRoot = path.join(tmp, "new");
  execSync(`DEST=${newRoot} ${REPO}/promote.sh`, { stdio: "ignore" });
  const { strip } = require("./_fixed-data");
  const fixed = JSON.stringify(strip(JSON.parse(fs.readFileSync(path.join(REPO, "data.json"), "utf8"))));
  for (const d of [newRoot, path.join(newRoot, "preview"), oldDir]) fs.writeFileSync(path.join(d, "data.json"), fixed);
});

const TYPES = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json", ".png": "image/png", ".webmanifest": "application/manifest+json" };
async function serve(page, dirRef) {
  await page.route("**/upg/**", (route) => {
    const u = new URL(route.request().url());
    let rel = u.pathname.replace(/^.*\/upg\//, "");
    let base = dirRef.dir;
    if (rel.startsWith("preview/")) rel = rel.slice(8);
    else base = newRoot; // root (live)
    if (!rel || rel.endsWith("/")) rel += "index.html";
    const f = path.join(base, rel);
    if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: "nf" });
    route.fulfill({ status: 200, body: fs.readFileSync(f), headers: { "content-type": TYPES[path.extname(f)] || "application/octet-stream" } });
  });
}

test("promote keeps his /preview/ icon data, applies trainDays fix, and matches root version", async ({ page }) => {
  const ref = { dir: oldDir };
  await serve(page, ref);
  const TUE = encodeURIComponent("2026-11-10T10:00:00+07:00");
  const url = `/upg/preview/?debug=1&sleep=8&now=${TUE}#today`;
  const seed = {
    trainDays: [1, 4],
    mealLogs: { "2026-11-09": { snack: { eaten: true, name: "蛋白粉 2 份", kcal: 366, protein: 52 }, dinner: { eaten: true, name: "鯛魚排＋花椰菜＋手指蘿蔔", kcal: 250, protein: 40 } } },
    logs: { "2026-11-06": { workoutId: "B", finishedAt: 1, backScore: 2 } },
    wheyStockG: { plantAlmond: 480 },
  };
  await page.goto(url);
  await page.waitForSelector(".ttl");
  await page.evaluate((d) => localStorage.setItem("fatcat-v2", JSON.stringify(d)), seed);
  await page.reload();
  await page.waitForSelector(".ttl");
  await expect(page.locator("[data-testid=app-version]")).toContainText("preview-38");
  await expect(page.locator("[data-testid=rest-line]")).toBeVisible(); // the bug: Tuesday shown as 休息日

  ref.dir = path.join(newRoot, "preview"); // simulate ./promote.sh + Pages deploy
  await page.reload();
  await page.waitForSelector(".ttl");
  const rootVer = JSON.parse(fs.readFileSync(path.join(newRoot, "version.json"), "utf8")).version;
  expect(rootVer).not.toMatch(/preview|staging/);
  await expect(page.locator("[data-testid=app-version]")).toHaveText(`v${rootVer}`);
  await expect(page.locator("[data-testid=staging-tag]")).toHaveCount(0);
  expect(await page.title()).toBe("減脂喵");
  await expect(page.locator("[data-testid=rest-line]")).toHaveCount(0);
  await expect(page.locator("[data-testid=train-card]")).toContainText("平日在家");
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem("fatcat-v2")));
  expect(s.mealLogs).toEqual(seed.mealLogs);
  expect(s.logs).toEqual(seed.logs);
  expect(s.wheyStockG).toEqual(seed.wheyStockG);
  expect(s.trainDays).toEqual([2, 4, 6, 0]);
  // preview and root are byte-identical (except data.json, owned by the hourly job)
  for (const f of ["app.js", "app.css", "sw.js", "index.html", "manifest.webmanifest", "version.json", "data.js", "body-svg.js"]) {
    expect(fs.readFileSync(path.join(newRoot, "preview", f)).equals(fs.readFileSync(path.join(newRoot, f))), f).toBe(true);
  }
});
