// Keep date-based tests independent of the hourly Garmin export: drop real activities on/after the test week.
const CUTOFF = "2026-11-10";
const strip = (d) => { if (d && d.garmin && d.garmin.activities) d.garmin.activities = d.garmin.activities.filter((a) => !a.date || a.date < CUTOFF); return d; };
async function fixData(page) {
  await page.route("**/data.json*", async (route) => {
    const r = await route.fetch();
    let d; try { d = await r.json(); } catch { return route.fulfill({ response: r }); }
    await route.fulfill({ response: r, json: strip(d) });
  });
}
module.exports = { fixData, strip };
