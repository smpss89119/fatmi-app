// App stays open & visible; a deploy lands; it must update itself (no taps) within ~65 s.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { fixData } = require('./_fixed-data');
const ROOT = path.join(__dirname, '..');
const CUR = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8')).version;
const NEW = '2099.01.01-1';
const URL = 'http://127.0.0.1:43123/staging/?debug=1&sleep=8&now=2026-11-14T20:00:00%2B08:00';
test.setTimeout(240000);

async function deployable(page, state) {
  // state.deployed=false → serve current files; true → version.json + app.js say NEW
  await page.route('**/staging/version.json*', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: state.deployed ? NEW : CUR }) }));
  await page.route('**/staging/app.js*', (route) => {
    let js = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    if (state.deployed) js = js.replace(`const APP_VERSION = "${CUR}";`, `const APP_VERSION = "${NEW}";`);
    state.appLoads = (state.appLoads || 0) + 1;
    return route.fulfill({ contentType: 'application/javascript', body: js });
  });
}

test('new version while open → reloads itself within 65 s, toast, no loop', async ({ page }) => {
  const state = { deployed: false };
  await fixData(page);
  await deployable(page, state);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(URL + '#today'); await page.waitForSelector('.ttl');
  expect(await page.evaluate(() => APP_VERSION)).toBe(CUR);
  await page.evaluate(() => { window.__marker = 1; });
  state.deployed = true;
  const t0 = Date.now();
  await page.waitForFunction((v) => typeof APP_VERSION !== 'undefined' && APP_VERSION === v, NEW, { timeout: 70000, polling: 500 });
  const secs = (Date.now() - t0) / 1000;
  expect(secs).toBeLessThan(66);
  expect(await page.evaluate(() => window.__marker)).toBeUndefined();
  await expect(page.locator('#toast')).toContainText(`已更新到 v${NEW}`);
  const loads = state.appLoads;
  await page.waitForTimeout(65000); // one more poll: same version → no further reload
  expect(state.appLoads).toBe(loads);
  expect(errs).toEqual([]);
  console.log(`updated in ${secs.toFixed(1)} s`);
});

test('resume (pageshow/visibility) checks immediately; data-only change re-renders in place', async ({ page }) => {
  const state = { deployed: false };
  let exported = '2026-11-14T20:00:00+07:00';
  await deployable(page, state);
  await page.route('**/staging/data.json*', async (route) => {
    const r = await route.fetch({ url: 'http://127.0.0.1:43123/staging/data.json' }); const d = await r.json();
    d.exportedAt = exported; d.garmin.activities = (d.garmin.activities || []).filter((a) => a.date < '2026-11-10');
    if (exported.includes('21:00')) d.garmin.activities.push({ type: 'walking', date: '2026-11-14', startTime: '2026-11-14 19:00:00', durationMin: 25, avgHR: 120, kcal: 150, name: '健走', cardio: { type: 'walking', durationMin: 25, distanceKm: 2.5, avgHR: 120, zones: [{ z: 2, min: 25, low: 114 }] } });
    await route.fulfill({ response: r, json: d });
  });
  await page.goto(URL + '#today'); await page.waitForSelector('.ttl');
  await page.evaluate(() => { window.__marker = 1; });
  await expect(page.getByTestId('week-cardio')).toHaveCount(0);
  exported = '2026-11-14T21:00:00+07:00';
  await page.waitForTimeout(2500); // resume happens later than launch
  const t0 = Date.now();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(page.getByTestId('week-cardio')).toContainText('本週有氧 25 分鐘', { timeout: 8000 });
  expect(Date.now() - t0).toBeLessThan(8000);
  await expect(page.locator('#toast')).toContainText('資料已更新');
  expect(await page.evaluate(() => window.__marker)).toBe(1); // no reload for data
});

test('busy mid-set → update waits, then applies right after the set ends', async ({ page }) => {
  const state = { deployed: false };
  await fixData(page);
  await deployable(page, state);
  await page.goto(URL + '#today'); await page.waitForSelector('.ttl');
  // simulate an active set today
  await page.evaluate(() => { const s = load(); s.session = { date: todayKey(), phase: 'set', steps: [], i: 0, moves: {} }; localStorage.setItem(STORE, JSON.stringify(s)); window.__marker = 1; });
  state.deployed = true;
  await page.evaluate(() => window.__fatmiCheckUpdates({}));
  await page.waitForTimeout(5000);
  expect(await page.evaluate(() => [window.__marker, APP_VERSION])).toEqual([1, CUR]); // deferred, not reloaded
  // stale session from another day must not block forever
  await page.evaluate(() => { const s = load(); s.session.date = '2026-11-01'; localStorage.setItem(STORE, JSON.stringify(s)); });
  await page.waitForFunction((v) => typeof APP_VERSION !== 'undefined' && APP_VERSION === v, NEW, { timeout: 15000 });
});

test('loop guard: server says new version but app.js stays old → at most 3 reloads in 10 min', async ({ page }) => {
  let appLoads = 0; // page loads (navigations of the main frame)
  await fixData(page);
  await page.route('**/staging/version.json*', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: NEW }) }));
  page.on('load', () => { appLoads++; });
  await page.clock.install();
  await page.goto(URL + '#today');
  for (let i = 0; i < 12; i++) { await page.clock.runFor(30000); await page.waitForTimeout(400); }
  // first load + ≤3 retries
  expect(appLoads).toBeLessThanOrEqual(4);
  expect(appLoads).toBeGreaterThanOrEqual(2);
});
