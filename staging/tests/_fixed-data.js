// Keep date-based tests independent of the hourly Garmin export: drop real activities on/after the test week.
const CUTOFF = "2026-11-10";
// ...and recovery signals (Body Battery / resting HR) that would flip plans to the quick version.
const RECOVERY = ["bodyBattery", "bodyBatteryHigh", "bodyBatteryLow", "bodyBatteryCharged", "bodyBatteryDrained", "restingHR", "hrv"];
const strip = (d) => {
  if (d && d.garmin && d.garmin.activities) d.garmin.activities = d.garmin.activities.filter((a) => !a.date || a.date < CUTOFF);
  if (d && d.garmin && d.garmin.daily) for (const r of d.garmin.daily) if (r.date >= CUTOFF) for (const k of RECOVERY) delete r[k];
  return d;
};
async function fixData(page) {
  await page.route("**/data.json*", async (route) => {
    const r = await route.fetch();
    let d; try { d = await r.json(); } catch { return route.fulfill({ response: r }); }
    await route.fulfill({ response: r, json: strip(d) });
  });
}
module.exports = { fixData, strip };
