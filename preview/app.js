const DEMO = (() => { try { return new URLSearchParams(location.search).get("demo") === "legacy"; } catch (_) { return false; } })();
const STORE = DEMO ? "fatcat-demo" : "fatcat-v2";
const LEGACY_DEMO = {
  grocery: { chicken: true, eggs: true },
  shopExtra: [
    { id: "x-old", group: "protein", name: "雞柳 一包", custom: true, amount: "一包", palms: 2, fists: 0 },
    { id: "x-w", group: "starch", name: "燕麥 500g", custom: true, amount: "500g", palms: 0, fists: 0 },
    { id: "x-veg", group: "veg", name: "花椰菜 300g", custom: true, amount: "300g", palms: 0, fists: 0 },
    { id: "x-q", group: "protein", name: "豆腐 2", custom: true, amount: "2", palms: 2, fists: 0 },
  ],
};
if (DEMO) { try { localStorage.setItem("fatcat-demo", JSON.stringify(LEGACY_DEMO)); } catch (_) {} }
function normName(s) { return String(s || "").normalize("NFKC").replace(/[\s\u3000]+/g, ""); }
const DOW = ["日", "一", "二", "三", "四", "五", "六"];
const GOAL = new Date(2026, 11, 31);
const DEFAULT_DAYS = [2, 5];
const PROTEIN_MIN = 140;
const PROTEIN_TARGET = 150;
const PROTEIN_MAX = 160;
const KCAL_FLOOR = 1800;
const HIGH_STEPS = 15000;
const REST_SEC = 90;

let LIVE = { garmin: { daily: [], activities: [] }, inbody: [], exportedAt: null, ok: {} };
let ui = { swap: null, bodyPart: null, showReason: false, mealMore: null, shareSheet: null, wantTrain: false, shopAdd: false, shopCat: "protein", shopDraftName: "", shopDraftAmount: "" };

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}
function load() {
  try {
    const raw = localStorage.getItem(STORE) || localStorage.getItem("fatcat-v1") || "{}";
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
function save(patch) {
  const s = { ...load(), ...patch };
  localStorage.setItem(STORE, JSON.stringify(s));
  return s;
}
function debugParams() {
  try {
    const q = new URLSearchParams(location.search);
    if (q.get("debug") !== "1" && q.get("test") !== "1") return {};
    const out = {};
    if (q.get("now")) {
      const n = new Date(q.get("now"));
      if (!Number.isNaN(+n)) out.now = n;
    }
    if (q.has("sleep")) out.sleep = Number(q.get("sleep"));
    if (q.has("rhr")) out.rhr = Number(q.get("rhr"));
    if (q.has("rhrAvg")) out.rhrAvg = Number(q.get("rhrAvg"));
    if (q.has("rest")) out.rest = Number(q.get("rest"));
    if (q.has("bb")) out.bb = Number(q.get("bb"));
    return out;
  } catch {
    return {};
  }
}
function now() {
  return debugParams().now || new Date();
}
function restMs() {
  const s = debugParams().rest;
  return ((s != null && !Number.isNaN(s)) ? s : REST_SEC) * 1000;
}
function sleepText(sleep) {
  if (sleep == null || Number.isNaN(Number(sleep))) return "";
  const n = Number(sleep);
  const label = Number.isInteger(n) ? String(n) : String(n);
  return `昨晚睡 ${label} 小時`;
}
function todayKey(d = now()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseISO(s) {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function fmtMD(s) {
  if (!s) return "";
  const [y, m, d] = String(s).split("-");
  return `${Number(m)}/${Number(d)}`;
}
function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function tabNow() {
  const t = location.hash.slice(1) || "today";
  return ["today", "shop", "rules", "workout", "body", "sleep"].includes(t) ? t : "today";
}
function state() {
  const s = load();
  return {
    tab: tabNow(),
    trainDays: Array.isArray(s.trainDays) ? s.trainDays : DEFAULT_DAYS.slice(),
    grocery: s.grocery || {},
    logs: s.logs || {},
    mealLogs: s.mealLogs || {},
    lastLoads: s.lastLoads || {},
    loadHistory: s.loadHistory || {},
    suggest: s.suggest || {},
    override: s.override || {},
    notifs: s.notifs || {},
    session: s.session || null,
    returnUntil: s.returnUntil || null,
    fasted: s.fasted || {},
    wheyEst: s.wheyEst || {},
    scoopPick: s.scoopPick || {},
    dinnerAlt: s.dinnerAlt || {},
    lastAdvice: s.lastAdvice || "",
    shopWeek: s.shopWeek || null,
    shopChecked: s.shopChecked || {},
    shopHave: s.shopHave || {},
    shopHide: s.shopHide || {},
    wheyPacks: s.wheyPacks != null ? Number(s.wheyPacks) : 14,
    shopHintCollapsed: !!s.shopHintCollapsed,
    hideSuggestReasons: !!s.hideSuggestReasons,
    shopExtra: Array.isArray(s.shopExtra) ? s.shopExtra : [],
    shopFrequent: s.shopFrequent || {},
    restTrain: s.restTrain || {},
    backSwap: s.backSwap || {},
    mealTimes: s.mealTimes || {},
    extraMeals: s.extraMeals || {},
    shopPortions: s.shopPortions || {},
    shopQty: s.shopQty || {},
    shopUsed: s.shopUsed || {},
    shopNames: s.shopNames || {},
    shopAdj: s.shopAdj || {},
  };
}

function dailyMap() {
  const m = {};
  for (const r of LIVE.garmin.daily || []) m[r.date] = r;
  return m;
}
function dailyOn(date) {
  return dailyMap()[date] || null;
}
function lastNightSleep(d = now()) {
  const dbg = debugParams();
  if (dbg.sleep != null && !Number.isNaN(dbg.sleep)) return dbg.sleep;
  const row = dailyOn(todayKey(d));
  return row && row.sleepHours != null ? Number(row.sleepHours) : null;
}
function rhrOn(d = now()) {
  const dbg = debugParams();
  if (dbg.rhr != null && !Number.isNaN(dbg.rhr)) return dbg.rhr;
  const row = dailyOn(todayKey(d));
  return row && row.restingHR != null ? Number(row.restingHR) : null;
}
function rhrAvg7(d = now()) {
  const dbg = debugParams();
  if (dbg.rhrAvg != null && !Number.isNaN(dbg.rhrAvg)) return dbg.rhrAvg;
  const vals = [];
  for (let i = 1; i <= 7; i++) {
    const row = dailyOn(todayKey(addDays(d, -i)));
    if (row && row.restingHR != null) vals.push(Number(row.restingHR));
  }
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
function isTrainDay(st, d = now()) {
  return (st.trainDays || DEFAULT_DAYS).includes(d.getDay());
}
function isGarminWorkout(a) {
  if (!a) return false;
  return /strength|multi_sport|training|fitness_equipment/i.test(a.type || "")
    || /strength|肌力|重量|重訓/i.test(a.name || "");
}
function dateHasSession(st, date) {
  const log = (st.logs || {})[date];
  if (log && (log.workoutId || log.finishedAt != null || log.backScore != null || (log.moves && Object.keys(log.moves).length))) return true;
  return (LIVE.garmin.activities || []).some((a) => a.date === date && isGarminWorkout(a));
}
function pickScheduled(st, d = now()) {
  const { mon } = weekRange(d);
  const today = todayKey(d);
  let n = 0;
  for (let i = 0; i < 7; i++) {
    const key = todayKey(addDays(mon, i));
    if (key >= today) break;
    if (dateHasSession(st, key)) n += 1;
  }
  return n % 2 === 0 ? "gymA" : "gymB";
}
function yesterdaySteps(d = now()) {
  const row = dailyOn(todayKey(addDays(d, -1))) || dailyOn(todayKey(d));
  return row && row.steps != null ? Number(row.steps) : 0;
}
function isHighStep(d = now()) {
  const today = dailyOn(todayKey(d));
  const yday = dailyOn(todayKey(addDays(d, -1)));
  const steps = Math.max(today && today.steps != null ? today.steps : 0, yday && yday.steps != null ? yday.steps : 0);
  return steps >= HIGH_STEPS;
}
function bodyBatteryOn(d = now()) {
  const dbg = debugParams();
  if (dbg.bb != null && !Number.isNaN(dbg.bb)) return dbg.bb;
  const row = dailyOn(todayKey(d));
  if (!row) return null;
  const v = row.bodyBattery != null ? row.bodyBattery : row.bodyBatteryMostRecent;
  return v != null && v !== "" ? Number(v) : null;
}
function shouldQuick(d = now()) {
  const sleep = lastNightSleep(d);
  const rhr = rhrOn(d);
  const avg = rhrAvg7(d);
  const bb = bodyBatteryOn(d);
  const reasons = [];
  let quick = false;
  if (sleep != null && sleep < 6) {
    quick = true;
    reasons.push(sleepText(sleep));
  }
  if (rhr != null && avg != null && rhr >= avg + 5) {
    quick = true;
    reasons.push(`靜止心率 ${Math.round(rhr)}，比 7 日平均高 ${Math.round(rhr - avg)} 下`);
  }
  if (bb != null && !Number.isNaN(bb) && bb < 30) {
    quick = true;
    reasons.push(`Body Battery ${Math.round(bb)}，身體還很累`);
  }
  if (!reasons.length) {
    if (sleep != null) reasons.push(`${sleepText(sleep)}，心率正常`);
    else reasons.push("還沒有昨晚的睡眠資料，先照課表");
  }
  return { quick, reasons, sleep, rhr, avg, bb };
}
function markedFasted(st, d = now()) {
  return !!(st.fasted || {})[todayKey(d)];
}
function hasPreWorkoutMeal(st, d = now()) {
  const meals = (st.mealLogs || {})[todayKey(d)] || {};
  return ["breakfast", "lunch", "snack"].some((id) => meals[id] && meals[id].eaten);
}
function resolveWhey(st, id) {
  const base = (typeof WHEY_OPTIONS !== "undefined" ? WHEY_OPTIONS : []).find((x) => x.id === id) || (WHEY_OPTIONS && WHEY_OPTIONS[0]);
  if (!base) return { id: "sesame", name: "樂維根 無糖芝麻", scoopG: 40, protein: 20, kcal: 170 };
  const ov = ((st.wheyEst || {}).byId || {})[base.id] || {};
  return {
    id: base.id,
    name: base.name,
    scoopG: ov.scoopG != null ? Number(ov.scoopG) : base.scoopG,
    protein: ov.protein != null ? Number(ov.protein) : base.protein,
    kcal: ov.kcal !== undefined ? ov.kcal : base.kcal,
  };
}
function selectedScoops(st, d = now()) {
  const day = todayKey(d);
  const logged = ((st.mealLogs || {})[day] || {}).snack;
  if (logged && Array.isArray(logged.scoopIds) && logged.scoopIds.length === 2) return logged.scoopIds.slice();
  if ((st.scoopPick || {})[day]) return (st.scoopPick[day] || []).slice();
  return ["sesame", "soymilk"];
}
function twoScoopMeal(st, d = now()) {
  const ids = selectedScoops(st, d);
  const a = resolveWhey(st, ids[0] || "sesame");
  const b = resolveWhey(st, ids[1] || "soymilk");
  const yamKcal = 130;
  const yamP = 2;
  const kcalUnknown = a.kcal == null || b.kcal == null;
  const kcal = (Number(a.kcal) || 0) + (Number(b.kcal) || 0) + yamKcal;
  const protein = Number(a.protein) + Number(b.protein) + yamP;
  const hasPlant = a.id === "plant" || b.id === "plant";
  return {
    id: "loveigen2",
    name: `${a.name}＋${b.name}`,
    extraLine: "地瓜 150g",
    kcal,
    protein,
    scoopIds: [a.id, b.id],
    estimate: true,
    hasPlant,
    chickenG: hasPlant ? 150 : 200,
    kcalUnknown,
  };
}
function dinnerFor(st, d = now()) {
  const shake = twoScoopMeal(st, d);
  const grams = shake.hasPlant ? 150 : 200;
  const chickenId = grams === 150 ? "chicken150" : "chicken200";
  const meal = composeSwapMeal(chickenId, "rice150");
  meal.name = `18:30 雞胸 ${grams}g＋飯 150g＋青菜`;
  meal.chickenG = grams;
  meal.eggsAlt = !shake.hasPlant;
  return meal;
}
function wheySettings(st) {
  const id = ((st.wheyEst || {}).editId) || selectedScoops(st)[0] || "sesame";
  const w = resolveWhey(st, id);
  return { scoopG: w.scoopG, protein: w.protein, kcal: w.kcal == null ? 170 : w.kcal, id: w.id };
}
function wheyMeal(st) {
  return twoScoopMeal(st);
}
const DEFAULT_MEAL_TIMES = { snack: "16:00", dinner: "18:30", eggs21: "21:00" };
function mealTime(st, id, d = now()) {
  const ex = ((st.extraMeals || {})[todayKey(d)] || []).find((m) => m.id === id);
  if (ex) return ex.time;
  return ((st.mealTimes || {})[id]) || DEFAULT_MEAL_TIMES[id] || "";
}
function mealIdsFor(st, d = now()) {
  const ids = MEAL_ORDER.slice().concat(((st.extraMeals || {})[todayKey(d)] || []).map((m) => m.id));
  return ids.sort((x, y) => String(mealTime(st, x, d)).localeCompare(String(mealTime(st, y, d))));
}
function isExtraMeal(id) { return /^m-/.test(String(id)); }
function mealLabel(id, trainDay, st) {
  const t = st ? mealTime(st, id) : DEFAULT_MEAL_TIMES[id];
  if (t) return t;
  return (MEAL_DEFS[id] && MEAL_DEFS[id].label) || id;
}
function restTrainPick(st, d = now()) {
  return (st.restTrain || {})[todayKey(d)] || null;
}
function isActiveTrainDay(st, d = now()) {
  return isTrainDay(st, d) || !!restTrainPick(st, d);
}
function restQuickLine(chk) {
  if (!chk) return "還沒有睡眠和 Body Battery 資料";
  if (chk.quick) return `今天較適合快版：${chk.reasons[0]}`;
  const bit = chk.reasons[0] || "睡眠和 Body Battery 都還可以";
  if (/可以練原課表/.test(bit)) return bit;
  return `${bit}，可以練原課表`;
}
function todayPlan(st, d = now()) {
  const train = isTrainDay(st, d);
  const scheduled = pickScheduled(st, d);
  const chk = shouldQuick(d);
  const ov = (st.override || {})[todayKey(d)];
  const fasted = markedFasted(st, d);
  const extra = restTrainPick(st, d);
  if (!train && !extra) {
    return {
      train: false, id: null, scheduled, workout: null,
      reason: "休息日，走走路就好", collapsed: true, chk, canOverride: false, fasted: false,
    };
  }
  let wantQuick = chk.quick || fasted;
  if (ov === "original") wantQuick = false;
  if (ov === "quick") wantQuick = true;
  let id = extra || (wantQuick ? "quick" : scheduled);
  if (extra) {
    id = extra;
    wantQuick = extra === "quick";
  }
  let reason = chk.reasons[0];
  if (fasted && wantQuick) {
    reason = chk.quick ? `空腹練，改 25 分鐘快版，不追重量（${chk.reasons[0]}）` : "空腹練，改 25 分鐘快版，不追重量";
  } else if (fasted) {
    reason = `${chk.reasons[0]}。空腹不追重量`;
  }
  return {
    train: true, id, scheduled, workout: WORKOUTS[id],
    reason, chk, wantQuick, fasted, restPick: !train && !!extra,
    canOverride: !extra && wantQuick && id === "quick",
  };
}

function lastInbody() {
  const list = LIVE.inbody || [];
  if (list.length) return list[list.length - 1];
  return { date: "2026-10-08", weightKg: 78.4, bfmKg: 15.6, pbf: 19.9, smmKg: 35.9, bmi: 25.2, whr: 0.9 };
}
function weight7avg(d = now()) {
  const vals = [];
  for (let i = 0; i < 7; i++) {
    const row = dailyOn(todayKey(addDays(d, -i)));
    if (row && row.weightKg != null) vals.push(Number(row.weightKg));
  }
  if (vals.length) {
    return { value: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10, source: "7 日平均", stale: false };
  }
  const cut = todayKey(addDays(d, -6));
  const scans = (LIVE.inbody || []).filter((s) => s.date >= cut && s.weightKg != null);
  if (scans.length) {
    const v = scans.reduce((a, s) => a + Number(s.weightKg), 0) / scans.length;
    return { value: Math.round(v * 10) / 10, source: "近 7 日 InBody 平均", stale: false };
  }
  const last = lastInbody();
  return { value: last.weightKg, source: `近一次 ${fmtMD(last.date)}`, stale: true, date: last.date };
}
function dayHasMealLog(st, date) {
  const meals = ((st && st.mealLogs) || {})[date] || {};
  return Object.values(meals).some((m) => m && m.eaten === true);
}
function weightOnDate(date) {
  const row = dailyOn(date);
  if (row && row.weightKg != null) return Number(row.weightKg);
  const scan = (LIVE.inbody || []).find((s) => s.date === date && s.weightKg != null);
  return scan ? Number(scan.weightKg) : null;
}
function loggedWeightAvg(st, fromDays, toDays, d) {
  const xs = [];
  for (let i = fromDays; i < toDays; i++) {
    const date = todayKey(addDays(d, -i));
    if (!dayHasMealLog(st, date)) continue;
    const w = weightOnDate(date);
    if (w != null && !Number.isNaN(w)) xs.push(w);
  }
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function computeKcalAdjust(st, d = now()) {
  const scans = LIVE.inbody || [];
  if (scans.length < 2) return { adj: 0, note: null };
  const last = scans[scans.length - 1];
  const age = (d - parseISO(last.date)) / 86400000;
  if (age > 21) {
    return { adj: 0, note: `最近一次 InBody 是 ${fmtMD(last.date)}，回台再量之後才自動調熱量` };
  }
  const prev = scans[scans.length - 2];
  if (last.smmKg != null && prev.smmKg != null && Number(last.smmKg) <= Number(prev.smmKg) - 0.5) {
    return { adj: 150, note: `骨骼肌從 ${prev.smmKg} 降到 ${last.smmKg} kg，熱量先加回 150` };
  }
  const w0 = loggedWeightAvg(st, 0, 14, d);
  const w1 = loggedWeightAvg(st, 14, 28, d);
  if (w0 != null && w1 != null && Math.abs(w0 - w1) < 0.25 && w0 >= w1 - 0.15) {
    return { adj: -125, note: "兩週平均體重幾乎沒降，目標再減 125 kcal" };
  }
  return { adj: 0, note: null };
}
function kcalInfo(st, d = now()) {
  const trainLike = isActiveTrainDay(st, d);
  const y = dailyOn(todayKey(addDays(d, -1)));
  const adj = computeKcalAdjust(st, d);
  let target = trainLike ? 2150 : 1950;
  if (adj.adj) target = Math.max(KCAL_FLOOR, target + adj.adj);
  const sleep = lastNightSleep(d);
  const label = String(target);
  return {
    target,
    source: trainLike ? `訓練日 ${target}` : `休息日 ${target}`,
    adj,
    trainLike,
    band: label,
    bandLabel: label,
    sleepLow: sleep != null && sleep < 6,
    yesterdayKcal: y && y.kcal != null ? Number(y.kcal) : null,
  };
}

function weekRange(d = now()) {
  const mondayOffset = d.getDay() === 0 ? -6 : 1 - d.getDay();
  const mon = addDays(d, mondayOffset);
  return { mon, sun: addDays(mon, 6) };
}
function mealOf(def, trainLike) {
  if (def.base) return { ...def.base };
  return trainLike ? { ...def.train } : { ...def.rest };
}
function currentMeal(st, id, d = now()) {
  const logs = (st.mealLogs || {})[todayKey(d)] || {};
  if (logs[id]) return logs[id];
  return { ...suggestionOf(st, id, d), eaten: false };
}
function mealTotals(st, d = now()) {
  let kcal = 0;
  let protein = 0;
  const ids = mealIdsFor(st, d);
  for (const id of ids) {
    const m = ((st.mealLogs || {})[todayKey(d)] || {})[id];
    if (m && m.eaten === true) {
      kcal += Number(m.kcal) || 0;
      protein += Number(m.protein) || 0;
    }
  }
  return { kcal, protein };
}


function whey2Macros(st, d = now()) {
  const ids = selectedScoops(st, d);
  const a = resolveWhey(st, ids[0] || "sesame");
  const b = resolveWhey(st, ids[1] || "soymilk");
  return {
    kcal: (Number(a.kcal) || 170) + (Number(b.kcal) || 170),
    protein: Number(a.protein) + Number(b.protein),
    name: "蛋白粉 2 份",
    scoopIds: [a.id, b.id],
  };
}
function portionMacros(p, st, d = now()) {
  if (!p) return { kcal: 0, protein: 0, name: "" };
  if (p.mode === "whey2") {
    const w = whey2Macros(st, d);
    return { kcal: w.kcal, protein: w.protein, name: w.name };
  }
  if (p.mode === "out") {
    const base = (OUT_MEALS || []).find((x) => x.id === p.outType) || (OUT_MEALS || [])[0];
    const size = (OUT_SIZES || []).find((x) => x.id === p.outSize) || (OUT_SIZES || [])[1];
    const kcal = Math.round((base.kcal || 0) * (size.mult || 1));
    const protein = Math.round((base.protein || 0) * (size.mult || 1));
    return { kcal, protein, name: `外食${base.name}／${size.name}` };
  }
  const palms = Number(p.palms) || 0;
  const fists = Number(p.fists) || 0;
  const veg = !!p.veg;
  if (!palms && !fists && !veg) return { kcal: 0, protein: 0, name: "" };
  const bits = [];
  if (palms) bits.push(`${palms} 掌蛋白`);
  if (fists) bits.push(`${fists} 拳澱粉`);
  if (veg) bits.push("蔬菜半盤");
  return {
    kcal: palms * PALM_KCAL + fists * FIST_KCAL + (veg ? VEG_KCAL : 0),
    protein: palms * PALM_PROTEIN + fists * FIST_PROTEIN + (veg ? VEG_PROTEIN : 0),
    name: bits.join("＋"),
  };
}
function suggestionOf(st, id, d = now()) {
  if (id === "snack") return { ...twoScoopMeal(st, d), eaten: false };
  if (id === "dinner") return { ...dinnerFor(st, d), eaten: false };
  if (id === "eggs21") {
    return { name: "雞蛋 2 顆", kcal: 140, protein: 12, id: "eggs2", eaten: false };
  }
  const def = MEAL_DEFS[id];
  if (!def) return { name: "", kcal: 0, protein: 0, eaten: false };
  return { ...mealOf(def, isTrainDay(st, d)), id: "default", eaten: false };
}
function hasCustomPortions(m) {
  if (!m) return false;
  if (m.mode === "whey2" || m.mode === "out") return true;
  if (m.mode === "else") return false;
  return !!(Number(m.palms) || Number(m.fists) || m.veg);
}
function mealEstimate(st, id, d = now()) {
  const logged = ((st.mealLogs || {})[todayKey(d)] || {})[id];
  const sug = suggestionOf(st, id, d);
  if (logged && hasCustomPortions(logged)) {
    const est = portionMacros(logged, st, d);
    return { ...sug, ...logged, ...est, suggestName: sug.name };
  }
  if (logged && logged.mode === "else") return { ...sug, ...logged, suggestName: sug.name };
  if (logged && logged.eaten && (logged.kcal || logged.protein) && !hasCustomPortions(logged)) {
    return { ...sug, ...logged, suggestName: sug.name };
  }
  return { ...sug, ...(logged || {}), kcal: sug.kcal, protein: sug.protein, name: logged && logged.name ? logged.name : sug.name, suggestName: sug.name };
}

function shopWeekKey(d = now()) {
  return todayKey(weekRange(d).mon);
}
function readShop(st) {
  const wk = shopWeekKey();
  if (st.shopWeek === wk) {
    return {
      week: wk,
      checked: st.shopChecked || {},
      have: st.shopHave || {},
      hide: st.shopHide || {},
      wheyPacks: st.wheyPacks != null ? Number(st.wheyPacks) : 14,
      hintCollapsed: !!st.shopHintCollapsed,
    };
  }
  return {
    week: wk,
    checked: {},
    have: {},
    hide: st.shopHave || {},
    wheyPacks: st.wheyPacks != null ? Number(st.wheyPacks) : 14,
    hintCollapsed: !!st.shopHintCollapsed,
  };
}
function persistShopWeek(st) {
  const shop = readShop(st);
  if (st.shopWeek !== shop.week) {
    save({ shopWeek: shop.week, shopChecked: {}, shopHave: {}, shopHide: shop.hide });
  }
  return shop;
}
function shopAcquired(shop, id) {
  return !!(shop.checked[id] || shop.have[id] || shop.hide[id]);
}
function shopAllItems(st) {
  return (SHOP_ITEMS || []).concat((st && st.shopExtra) || []);
}
function matchShopItem(st, name) {
  const q = String(name || "").trim();
  if (!q) return null;
  const items = shopAllItems(st);
  return items.find((it) => {
    const n = String(it.name || "");
    const stem = n.split(/[約（(]/)[0].trim();
    if (!stem) return false;
    return q === n || q === stem || n.startsWith(q) || q.startsWith(stem);
  }) || null;
}
function isShopFrequent(st, item) {
  const flag = ((st && st.shopFrequent) || {})[item.id];
  if (flag === false) return false;
  if (flag) return true;
  return !!item.frequent;
}
const SERVING_G = { protein: 120, starch: 150, veg: 100 };
function parseAmt(s) {
  const t = String(s || "").replace(/約/g, "").trim();
  let m = t.match(/^([\d.]+)\s*(kg|公斤)$/i);
  if (m) return { kind: "w", g: Number(m[1]) * 1000 };
  m = t.match(/^([\d.]+)\s*(g|克)$/i);
  if (m) return { kind: "w", g: Number(m[1]) };
  m = t.match(/^([\d.]+)\s*([^\d\s.]*)$/);
  if (m) return { kind: "c", n: Number(m[1]), unit: m[2] || "" };
  return null;
}
function shopQtyOf(st, it) {
  const ov = (st.shopQty || {})[it.id];
  if (ov != null) return ov;
  return shopSplit(it).qty;
}
// Servings for nutrition. Only explicit weights auto-convert; ambiguous items keep
// their original palms/fists and are flagged pending (待確認) until 一份是多少 is set.
function shopServings(st, it) {
  if (it.whey) return { n: st.wheyPacks != null ? Number(st.wheyPacks) : 14, pending: false };
  const adj = Number((st.shopAdj || {})[it.id]) || 0;
  const r = shopServingsBase(st, it);
  return { n: r.n + adj, pending: r.pending };
}
function r1(x) { return Math.round(x * 10) / 10; }
function fmtServ(l) { if (l.pending && !l.n) return "? 份"; const n = Number(l.n) || 0; return Number.isInteger(r1(n)) && Math.abs(n - r1(n)) < 1e-9 ? `${r1(n)} 份` : `約 ${r1(n)} 份`; }
function fmtG(g) { return `${Math.round(g * 10) / 10}g`; }
function shopServingsBase(st, it) {
  const orig = Number(it.group === "starch" ? it.fists : it.palms) || 0;
  const portion = (st.shopPortions || {})[it.id];
  const q = parseAmt(shopQtyOf(st, it));
  if (q && q.kind === "c" && q.unit === "份") return { n: q.n, pending: false };
  const ovQty = (st.shopQty || {})[it.id] != null;
  if (portion) {
    const pp = parseAmt(portion);
    if (q && pp && q.kind === "w" && pp.kind === "w" && pp.g > 0) return { n: q.g / pp.g, pending: false };
    if (q && pp && q.kind === "c" && pp.kind === "c" && pp.n > 0 && (!pp.unit || !q.unit || pp.unit === q.unit)) return { n: q.n / pp.n, pending: false };
    return { n: orig, pending: true };
  }
  if (!it.custom && !ovQty) return { n: orig || (q && q.kind === "c" ? q.n : 0), pending: false };
  if (it.group === "veg" && q && q.kind === "c") return { n: q.n, pending: false };
  if (q && q.kind === "w") return { n: q.g / (SERVING_G[it.group] || 120), pending: false };
  return { n: orig, pending: true };
}
// grams per 份 if known: explicit weight portion, or the auto-convert basis. null = no basis (adopts target's); "pending" = unknown.
function shopBasisG(st, it) {
  if (it.whey) return null;
  const portion = (st.shopPortions || {})[it.id];
  const pp = portion ? parseAmt(portion) : null;
  if (pp && pp.kind === "w" && pp.g > 0) return pp.g;
  if (shopServings(st, it).pending) return "pending";
  if (portion) return null;
  if (!it.custom) return SERVING_G[it.group] || 120;
  const q = parseAmt(shopQtyOf(st, it));
  if (q && q.kind === "w") return SERVING_G[it.group] || 120;
  return null;
}
function shopOrigWeight(st, it) {
  const o = (st.shopOrig || {})[it.id];
  if (o) return o;
  const q = parseAmt(shopQtyOf(st, it));
  return q && q.kind === "w" ? String(shopQtyOf(st, it)).replace(/\s+/g, "") : "";
}
// single source of truth: write the current count as "N 份" everywhere (qty/name), clear adj/used.
function shopSetCountPatch(st, it, n, base = {}) {
  const patch = { ...base };
  const shopAdj = { ...(patch.shopAdj || st.shopAdj || {}) }; delete shopAdj[it.id];
  const shopUsed = { ...(patch.shopUsed || st.shopUsed || {}) }; delete shopUsed[it.id];
  const shopOrig = { ...(patch.shopOrig || st.shopOrig || {}) };
  const ow = shopOrigWeight(st, it); if (ow && !shopOrig[it.id]) shopOrig[it.id] = ow;
  const shopPortions = { ...(patch.shopPortions || st.shopPortions || {}) };
  const bg = shopBasisG(st, it);
  if (!shopPortions[it.id] && typeof bg === "number") shopPortions[it.id] = `${bg} g`;
  Object.assign(patch, { shopAdj, shopUsed, shopOrig, shopPortions });
  const amt = typeof bg === "number" ? `${Math.round(n * bg * 1000) / 1000} g` : `${n} 份`;
  if (it.custom) patch.shopExtra = (patch.shopExtra || st.shopExtra || []).map((x) => x.id === it.id ? { ...x, amount: amt, name: shopDisplayName(shopLabel(st, it), amt) } : x);
  else patch.shopQty = { ...(patch.shopQty || st.shopQty || {}), [it.id]: amt };
  return patch;
}
function round05(x) { return Math.round(x * 2) / 2; }
// returns true when merged (or user cancelled handled); shows confirm/alert per rules
function shopTryMerge(st, src, dst, srcN) {
  const gS = shopBasisG(st, src), gT = shopBasisG(st, dst);
  if (typeof gS !== "number" || typeof gT !== "number") { window.alert("請先設定「一份是多少」再合併"); return false; }
  const left = srcN != null ? srcN : shopLeft(st, src).n;
  const grams = left * gS + shopLeft(st, dst).n * gT;
  const total = grams / gT;
  const lab = fmtServ({ n: total }).replace(" 份", "");
  if (!window.confirm(`合併成${lab.startsWith("約") ? lab : " " + lab} 份（${fmtG(grams)}，以 ${gT}g/份計）？`)) return false;
  const base = {};
  if (src.custom) base.shopExtra = (st.shopExtra || []).filter((x) => x.id !== src.id);
  else base.shopHide = { ...(st.shopHide || {}), [src.id]: true };
  save(shopSetCountPatch(st, dst, total, base));
  return true;
}
function shopDaysStats(st) {
  const shop = readShop(st);
  let planP = 0, planS = 0, gotP = 0, gotS = 0;
  for (const item of shopAllItems(st)) {
    const sv = item.whey ? { n: Number(item.palms) || 0 } : shopServings(st, item);
    const palms = item.group === "protein" ? sv.n : 0;
    const fists = item.group === "starch" ? sv.n : 0;
    planP += palms;
    planS += fists;
    if (shopAcquired(shop, item.id)) {
      gotP += palms;
      gotS += fists;
    }
  }
  return {
    proteinBought: Math.floor(gotP / 2),
    proteinPlan: Math.floor(planP / 2),
    starchBought: Math.floor(gotS / 2),
    starchPlan: Math.floor(planS / 2),
  };
}
function shopDaysHint(st) {
  const s = shopDaysStats(st);
  return `蛋白質夠吃 ${Number(s.proteinBought)}/${Number(s.proteinPlan)} 天 · 澱粉夠吃 ${Number(s.starchBought)}/${Number(s.starchPlan)} 天`;
}
function parseShopQty(amount) {
  const a = String(amount || "").trim();
  if (!a) return 0;
  if (/^\d+(\.\d+)?$/.test(a)) return Number(a);
  return 0;
}
function shopDisplayName(label, amount) {
  const name = String(label || "").trim();
  const amt = String(amount || "").trim();
  if (!amt) return name;
  if (name.includes(amt)) return name;
  return `${name} ${amt}`.trim();
}
function shopLabel(st, it) {
  return ((st && st.shopNames) || {})[it.id] || shopSplit(it).label;
}
function shopLeft(st, it) {
  const sv = shopServings(st, it);
  if (it.whey) return sv;
  return { n: Math.max(0, sv.n - (Number((st.shopUsed || {})[it.id]) || 0)), pending: sv.pending };
}
function shopSplit(it) {
  if (it && it.label != null) return { label: it.label, qty: it.qty || "" };
  if (it && it.custom && it.amount != null && String(it.amount).trim()) {
    const amt = String(it.amount).trim();
    const nm = String(it.name || "").trim();
    return { label: (nm.endsWith(amt) ? nm.slice(0, nm.length - amt.length) : nm).trim() || nm, qty: amt.replace(/([\d.])\s*(kg|g|ml|L)$/i, "$1 $2") };
  }
  const name = String((it && it.name) || "").trim();
  const m = name.match(/^(.*?)[\s約]*((?:約\s*)?[\d.]+\s*(?:kg|g|公斤|克|顆|片|包|條|份|盒|罐|ml|L)?)$/i);
  if (m && m[1]) return { label: m[1].trim(), qty: m[2].replace(/^約\s*/, "").replace(/([\d.])\s*(kg|g|ml|L)$/i, "$1 $2") };
  return { label: name, qty: "" };
}
function shopItemHint(it) {
  const hint = String((it && it.hint) || "");
  const name = String((it && it.name) || "");
  if (!hint || hint === "自訂") return "";
  if (name.includes(hint)) return "";
  return hint;
}

function mealLineText(st, id) {
  const m = ((st.mealLogs || {})[todayKey()] || {})[id];
  const est = mealEstimate(st, id);
  const mark = m && m.eaten ? "✓" : "○";
  if (m && m.eaten) {
    return `${mark} ${est.name || est.suggestName}（約 ${Math.round(est.kcal || 0)} kcal／蛋白 ${Math.round(est.protein || 0)} g）`;
  }
  return `${mark} 還沒吃（建議：${est.suggestName || est.name}）`;
}
function formatSetLine(sets) {
  const done = (sets || []).filter((x) => x.done);
  if (!done.length) return "尚未記錄";
  const groups = [];
  for (const x of done) {
    const w = (x.weight != null && x.weight !== "") ? Number(x.weight) : null;
    const r = x.reps;
    const key = `${w}::${r}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.n += 1;
    else groups.push({ key, w, r, n: 1 });
  }
  return groups.map((g) => {
    if (g.w != null && !Number.isNaN(g.w)) return `${g.w}kg×${g.r}×${g.n}`;
    return `${g.r}下×${g.n}`;
  }).join("、");
}
function shareCatsText(st) {
  const t = now();
  const day = todayKey(t);
  const trainDay = isActiveTrainDay(st, t);
  const kcal = kcalInfo(st, t);
  const totals = mealTotals(st, t);
  const mealIds = mealIdsFor(st, t);
  const mealLines = mealIds.map((id) => `${mealTime(st, id, t) || id}：${mealLineText(st, id)}`).join("\n");
  const remainK = Math.round(kcal.target - totals.kcal);
  const remainP = Math.round(PROTEIN_TARGET - totals.protein);
  const remain = remainK >= 0
    ? `還剩 ${remainK} kcal，蛋白${remainP >= 0 ? `還差 ${remainP}` : `已多 ${-remainP}`} g`
    : `熱量超出 ${-remainK} kcal，蛋白 ${Math.round(totals.protein)} g`;

  const shop = readShop(st);
  const shopLines = (SHOP_GROUPS || []).map((g) => {
    const items = (SHOP_ITEMS || []).filter((it) => it.group === g.id);
    const bits = items.map((it) => {
      if (shop.hide[it.id]) return `${it.name}（家裡有）`;
      if (shop.have[it.id]) return `${it.name}（家裡有）`;
      if (shop.checked[it.id]) return `${it.name} ✓`;
      return `${it.name} ○`;
    });
    return `${g.name}：${bits.join("、")}`;
  }).join("\n");
  const vegN = (SHOP_ITEMS || []).filter((it) => it.pick && shopAcquired(shop, it.id)).length;

  const log = (st.logs || {})[day];
  const session = st.session && st.session.date === day ? st.session : null;
  const src = log || session;
  let trainBlock;
  if (!trainDay && !src) {
    trainBlock = "休息日，沒有訓練";
  } else if (!src) {
    trainBlock = "今天還沒訓練";
  } else {
    const wid = src.workoutId || (session && session.workoutId);
    const w = (typeof WORKOUTS !== "undefined" && wid && WORKOUTS[wid]) ? WORKOUTS[wid] : null;
    const title = w ? `${w.name}${w.tag ? `（${w.tag}）` : ""}` : (wid || "訓練");
    const moves = src.moves || {};
    const names = (session && session.steps) ? session.steps.map((s) => s.name) : Object.keys(moves);
    const seen = new Set();
    const lines = [];
    for (const name of names) {
      if (seen.has(name)) continue;
      seen.add(name);
      lines.push(`${name} ${formatSetLine(moves[name])}`);
    }
    for (const name of Object.keys(moves)) {
      if (seen.has(name)) continue;
      lines.push(`${name} ${formatSetLine(moves[name])}`);
    }
    const score = src.backScore != null ? src.backScore : (session && session.backScore);
    const scoreLine = score != null ? `\n下背：${score} 分` : "";
    trainBlock = `課表：${title}\n${lines.join("\n") || "還沒有動作紀錄"}${scoreLine}`;
  }

  const header = `【${t.getMonth() + 1}/${t.getDate()} 週${DOW[t.getDay()]}】`;
  const eatSection = `■ 今天吃
${mealLines}
合計：${Math.round(totals.kcal)} kcal／蛋白 ${Math.round(totals.protein)} g（目標 ${kcal.band} kcal，蛋白 140–160 g）
${remain}`;
  const shopSection = `■ 採買／家裡
${shopLines}
蔬菜已選 ${vegN} 種（建議 4–5 種）
蛋白粉剩 ${shop.wheyPacks} 份${shop.wheyPacks < 6 ? "（不到 6 份，該補貨）" : ""}
${shopDaysHint(st)}`;
  const trainSection = `■ 今天訓練
${trainBlock}`;
  if (trainDay || src) {
    return `${header}

${trainSection}

${eatSection}

${shopSection}`;
  }
  return `${header}

${eatSection}

${shopSection}

${trainSection}`;
}
async function copyShareText(st) {
  const text = shareCatsText(st);
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (__) {}
    ta.remove();
  }
  showToast("已複製，貼給喵喵們就好");
}
function shareCatsBtn() {
  return `<button type="button" class="btn primary xl" data-share-cats data-testid="share-cats">傳給喵喵們</button>`;
}
function renderShareSheet() {
  if (!ui.shareSheet) return "";
  const copied = !!ui.shareSheet.copied;
  return `<div class="sheet" data-testid="share-sheet">
    <div class="sheet-card">
      <div class="k">傳給喵喵們</div>
      <pre class="sheet-text" data-testid="share-sheet-text">${esc(ui.shareSheet.text)}</pre>
      <div class="acts">
        <button type="button" class="btn primary xl" data-share-copy data-testid="share-copy">${copied ? "已複製" : "複製"}</button>
        <button type="button" class="btn full" data-share-close data-testid="share-close">關閉</button>
      </div>
    </div>
  </div>`;
}

function musclesFor(name) {
  for (const m of MOVE_MUSCLES) {
    if (m.keys.some((k) => String(name).includes(k))) return m;
  }
  return { primary: [], secondary: [] };
}
function moveKey(name) {
  for (const m of MOVE_MUSCLES) {
    const hit = m.keys.find((k) => String(name).includes(k));
    if (hit) return hit;
  }
  return String(name);
}
function parseDose(dose) {
  const m = String(dose || "").match(/(\d+)\s*×\s*(\d+)(?:\s*[–\-]\s*(\d+))?/);
  return {
    sets: m ? Number(m[1]) : 3,
    repsLow: m ? Number(m[2]) : 10,
    repsHigh: m && m[3] ? Number(m[3]) : m ? Number(m[2]) : 10,
    perSide: /側/.test(dose || ""),
  };
}
function lastBackScore(st) {
  const dates = Object.keys(st.logs || {}).sort();
  for (let i = dates.length - 1; i >= 0; i--) {
    const lg = st.logs[dates[i]];
    if (lg.exBack) return 0;
    const sc = lg.backScore;
    if (sc != null) return Number(sc);
  }
  return 0;
}
function lookSafer(name, video) {
  const raw = String(name || "").replace(/（選做）/g, "").trim();
  const list = (typeof BACK_SAFER !== "undefined" && BACK_SAFER) ? BACK_SAFER : [];
  for (const s of list) {
    if (s.test.test(raw) && raw !== s.name) {
      return { name: s.name, video: s.video || video, swapped: true };
    }
  }
  return null;
}
function resolveName(step, backScore) {
  const raw = String(step.name || "").replace(/（選做）/g, "").trim();
  const pick = (name, video, swapped) => ({ name, video: video || step.video, swapped: !!swapped });
  if (Number(backScore) >= 3) {
    if (raw.includes("或")) {
      const parts = raw.split("或").map((x) => x.trim()).filter(Boolean);
      for (const part of parts) {
        if (!lookSafer(part, step.video)) return pick(part, step.video, part !== parts[0]);
      }
      const safer = lookSafer(parts[0], step.video);
      if (safer) return pick(safer.name, safer.video, true);
    } else {
      const safer = lookSafer(raw, step.video);
      if (safer) return pick(safer.name, safer.video, true);
    }
  }
  if (raw.includes("或")) {
    const parts = raw.split("或").map((x) => x.trim()).filter(Boolean);
    return pick(parts[0] || raw, step.video, false);
  }
  return pick(raw, step.video, false);
}
function upcomingBackSwaps(workoutId, score) {
  if (!(Number(score) >= 3)) return [];
  const w = (typeof WORKOUTS !== "undefined" && workoutId) ? WORKOUTS[workoutId] : null;
  if (!w) return [];
  const hints = [];
  const seen = new Set();
  for (const step of w.steps || []) {
    const cur = resolveName(step, 0);
    const nxt = resolveName(step, score);
    if (nxt.swapped && nxt.name !== cur.name) {
      const key = `${cur.name}→${nxt.name}`;
      if (!seen.has(key)) {
        seen.add(key);
        hints.push(key);
      }
    }
  }
  return hints;
}
function lastStrengthBefore(st, d = now()) {
  const today = todayKey(d);
  const dates = [];
  for (const a of LIVE.garmin.activities || []) {
    if (a.date && a.date < today && /strength|multi_sport|training|fitness/i.test(a.type || "")) {
      dates.push(a.date);
    }
  }
  for (const k of Object.keys(st.logs || {})) {
    if (k < today) dates.push(k);
  }
  dates.sort();
  return dates.length ? dates[dates.length - 1] : null;
}
function isReturnWeek(st, d = now()) {
  const today = todayKey(d);
  if (st.returnUntil && today <= st.returnUntil) return true;
  if (st.returnUntil && today > st.returnUntil) return false;
  const last = lastStrengthBefore(st, d);
  if (!last) return true;
  return (d - parseISO(last)) / 86400000 >= 14;
}
function matchGarmin(date) {
  const acts = (LIVE.garmin.activities || []).filter((a) => a.date === date);
  if (!acts.length) return null;
  const pref =
    acts.find((a) => a.type === "strength_training") ||
    acts.find((a) => /strength|multi_sport|training|fitness_equipment/i.test(a.type || "")) ||
    acts[0];
  return {
    type: pref.type,
    durationMin: pref.durationMin,
    avgHR: pref.avgHR,
    kcal: pref.kcal,
    name: pref.name || null,
  };
}

function bumpPart(counts, part, n) {
  counts[part] = (counts[part] || 0) + n;
  if (part === "frontDelts" || part === "rearDelts") counts.delts = (counts.delts || 0) + n;
}
function countMoves(moves) {
  const counts = {};
  if (!moves) return counts;
  for (const [name, sets] of Object.entries(moves)) {
    const n = (sets || []).filter((s) => s.done).length;
    if (!n) continue;
    const m = musclesFor(name);
    for (const p of m.primary) bumpPart(counts, p, n);
    for (const p of m.secondary) bumpPart(counts, p, n);
  }
  return counts;
}
function countPlanned(steps) {
  const counts = {};
  for (const step of steps || []) {
    const n = parseDose(step.dose).sets;
    const m = musclesFor(step.name);
    for (const p of m.primary) bumpPart(counts, p, n);
    for (const p of m.secondary) bumpPart(counts, p, n);
  }
  return counts;
}
function weekPartSources(st, d = now(), opts = {}) {
  const { mon } = weekRange(d);
  const today = todayKey(d);
  const counts = {};
  const sources = {};
  function addMoves(moves) {
    if (!moves) return;
    for (const [name, sets] of Object.entries(moves)) {
      const n = (sets || []).filter((s) => s.done).length;
      if (!n) continue;
      const clean = String(name).replace(/（選做）/g, "").trim();
      const m = musclesFor(name);
      const parts = [...(m.primary || []), ...(m.secondary || [])];
      for (const part of parts) {
        bumpPart(counts, part, n);
        (sources[part] ||= new Set()).add(clean);
        if (part === "frontDelts" || part === "rearDelts") (sources.delts ||= new Set()).add(clean);
      }
    }
  }
  const sessionDate = (opts.includeSession && st.session && st.session.date) ? st.session.date : null;
  for (let i = 0; i < 7; i++) {
    const key = todayKey(addDays(mon, i));
    if (opts.excludeToday && key === today) continue;
    if (sessionDate && key === sessionDate) {
      addMoves(st.session.moves);
      continue;
    }
    const log = (st.logs || {})[key];
    if (log) addMoves(log.moves);
  }
  const lists = {};
  for (const [k, set] of Object.entries(sources)) lists[k] = [...set];
  return { counts, sources: lists };
}
function weekSetCounts(st, d = now(), opts = {}) {
  return weekPartSources(st, d, opts).counts;
}
function fridayExtras(st, baseSteps, d = now()) {
  if (d.getDay() !== 5) return [];
  const week = weekSetCounts(st, d, { excludeToday: true });
  const planned = countPlanned(baseSteps);
  const combined = { ...week };
  for (const [k, v] of Object.entries(planned)) combined[k] = (combined[k] || 0) + v;
  const extras = [];
  const used = new Set();
  for (const p of MAIN_PARTS) {
    if ((combined[p] || 0) >= 6) continue;
    const ex = EXTRA_FOR_PART[p];
    if (!ex || used.has(ex.name)) continue;
    used.add(ex.name);
    extras.push({ name: ex.name, dose: ex.dose, video: ex.video, extra: true, extraFor: PARTS[p] });
    const more = countPlanned([ex]);
    for (const [k, v] of Object.entries(more)) combined[k] = (combined[k] || 0) + v;
  }
  return extras;
}

function lineChart(values, color, w, h, cls) {
  const nums = values.map((v, i) => [i, v]).filter((x) => x[1] != null && !Number.isNaN(x[1]));
  if (!nums.length) {
    return `<svg class="${cls || "chart"}" viewBox="0 0 ${w} ${h}"></svg>`;
  }
  const ys = nums.map((x) => x[1]);
  let min = Math.min(...ys);
  let max = Math.max(...ys);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.18;
  const y0 = min - pad;
  const y1 = max + pad;
  const last = Math.max(values.length - 1, 1);
  const xOf = (i) => 6 + (i / last) * (w - 12);
  const yOf = (v) => h - 6 - ((v - y0) / (y1 - y0)) * (h - 12);
  const pts = nums.map(([i, v]) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");
  const dots = nums.length <= 24
    ? nums.map(([i, v]) => `<circle cx="${xOf(i).toFixed(1)}" cy="${yOf(v).toFixed(1)}" r="2.4" fill="${color}"/>`).join("")
    : "";
  return `<svg class="${cls || "chart"}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <polyline fill="none" stroke="${color}" stroke-width="2.6" stroke-linejoin="round" points="${pts}"/>${dots}
  </svg>`;
}
function ringEl(value, max, top, sub, ok) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, max ? value / max : 0));
  const dash = c * pct;
  const color = ok ? "#166534" : "#C2410C";
  return `<div class="ring${ok ? " ok" : ""}" role="img" aria-label="${esc(top)} ${esc(sub)}" data-ok="${ok ? "1" : "0"}">
    <svg viewBox="0 0 122 122">
      <circle cx="61" cy="61" r="${r}" fill="none" stroke="#F4E6D0" stroke-width="10"/>
      <circle cx="61" cy="61" r="${r}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round"
        stroke-dasharray="${dash.toFixed(1)} ${c.toFixed(1)}"/>
    </svg>
    <div class="n"><b>${Math.round(value)}</b><span>${esc(top)}</span><span>${esc(sub)}</span></div>
  </div>`;
}

function partClass(id, pri, sec, week, selected) {
  if (!id || id === "skin") return "skin";
  const mapped = id === "frontDelts" || id === "rearDelts" ? "delts" : id;
  const isPri = pri.has(id)
    || (id === "frontDelts" && pri.has("delts"))
    || (id === "rearDelts" && (pri.has("delts") || pri.has("rotator")));
  const isSec = sec.has(id)
    || (id === "frontDelts" && sec.has("delts"))
    || (id === "rearDelts" && (sec.has("delts") || sec.has("rotator")));
  let cls = "m";
  if (isPri) cls += " pri";
  else if (isSec) cls += " sec";
  if (MAIN_PARTS.includes(mapped) && (week[mapped] || 0) < 6) cls += " low";
  if (selected === id) cls += " is-on";
  return cls;
}
function partAliases(id) {
  if (id === "frontDelts" || id === "rearDelts") return [id, "delts"];
  if (id === "obliques") return [id, "core"];
  if (id === "upperback") return [id, "midback"];
  return [id];
}
function partWeekCount(id, week) {
  week = week || {};
  let n = 0;
  for (const k of partAliases(id)) n = Math.max(n, Number(week[k]) || 0);
  return n;
}
function partSourceNames(id, sources) {
  sources = sources || {};
  const seen = new Set();
  const names = [];
  for (const k of partAliases(id)) {
    for (const name of (sources[k] || [])) {
      if (!seen.has(name)) { seen.add(name); names.push(name); }
    }
  }
  return names;
}
function partTip(id, week, sources) {
  const n = partWeekCount(id, week);
  const names = partSourceNames(id, sources);
  const label = (typeof PARTS !== "undefined" && PARTS[id]) ? PARTS[id] : id;
  const from = names.length ? `，來自${names.join("、")}` : "";
  return `${label}：本週 ${n} 組${from}`;
}
function muscleIdFromEvent(e) {
  const direct = e.target && e.target.closest && e.target.closest(".body-svg [data-part]");
  if (direct) return direct.getAttribute("data-part");
  if (typeof document.elementsFromPoint !== "function") return null;
  const x = e.clientX;
  const y = e.clientY;
  if (x == null || y == null) return null;
  for (const node of document.elementsFromPoint(x, y)) {
    const el = node.closest && node.closest(".body-svg [data-part]");
    if (el) return el.getAttribute("data-part");
  }
  return null;
}
function bodyMap(priList, secList, weekCounts, sourceMap) {
  const pri = new Set(priList || []);
  const sec = new Set(secList || []);
  const detail = weekPartSources(state(), now(), { includeSession: true });
  const week = detail.counts;
  const sources = detail.sources;
  const selected = ui.bodyPart || null;
  const svg = (typeof bodySvgMarkup === "function")
    ? bodySvgMarkup((id) => partClass(id, pri, sec, week, selected))
    : `<svg class="body-svg" viewBox="0 0 100 40"></svg>`;
  const tip = selected ? partTip(selected, week, sources) : "點一下部位，看本週練了幾組";
  return `<div class="body-wrap">
    <div class="legend"><span><i class="p"></i>主要</span><span><i class="s"></i>輔助</span><span>不到 6 組會標橘色外框</span></div>
    ${svg}
    <div class="body-tip" data-testid="body-tip"${selected ? "" : " data-empty=\"1\""}>${esc(tip)}</div>
    <p class="body-credit">輪廓改編自 react-body-highlighter（MIT）</p>
  </div>`;
}

function yt(key) {
  const v = VIDEOS[key];
  if (!v) return "";
  return `<a class="yt" href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">▶ ${esc(v.label)}</a>`;
}
function cueFor(name) {
  if (/腿推/.test(name)) return "下背別離開椅背";
  if (/深蹲/.test(name)) return "不要蹲太深，胸口打直，下背保持中立。";
  if (/胸靠划船|胸部支撐/.test(name)) return "胸口貼穩，不要用腰拉。";
  if (/臀橋|髖推|臀推/.test(name)) return "用臀部發力，不要靠腰撐起來。";
  if (/地板臥推|胸推|臥推|伏地/.test(name)) return "肩胛收穩，腰別過度拱起。";
  if (/有靠背肩推/.test(name)) return "背靠穩椅背，不要後仰或聳肩。";
  if (/肩推/.test(name)) return "核心收緊，不要聳肩或後仰。";
  if (/划船/.test(name)) return "保持坐姿，不要彎腰拉。";
  if (/下拉/.test(name)) return "胸口上挺，不要晃腰借力。";
  if (/面拉/.test(name)) return "輕鬆外旋，不要聳肩。";
  if (/死蟲/.test(name)) return "下背全程貼地，不要拱腰。";
  if (/鳥狗/.test(name)) return "脊椎保持中立，不要塌腰。";
  return "下背有不適就減重量或換替代動作。";
}
function todayPartsFromMoves(moves) {
  const pri = new Set();
  const sec = new Set();
  for (const name of Object.keys(moves || {})) {
    const done = (moves[name] || []).some((s) => s.done);
    if (!done) continue;
    const m = musclesFor(name);
    m.primary.forEach((p) => pri.add(p));
    m.secondary.forEach((p) => sec.add(p));
  }
  return { pri: [...pri], sec: [...sec] };
}


function dueNotifs(st) {
  const key = todayKey();
  const shown = (st.notifs || {})[key] || [];
  const left = 2 - shown.length;
  if (left <= 0) return [];
  const out = [];
  const totals = mealTotals(st);
  const hour = now().getHours();
  if (hour >= 16 && totals.protein < PROTEIN_TARGET * 0.5 && !shown.includes("protein")) {
    out.push({ id: "protein", text: "蛋白還不到一半，先補一份。" });
  }
  const log = (st.logs || {})[key];
  const gToday = (LIVE.garmin.activities || []).some((a) => a.date === key && /strength|multi_sport|training/i.test(a.type || ""));
  const meals = (st.mealLogs || {})[key] || {};
  const recovered = !!(meals.snack && meals.snack.eaten) || !!(meals.dinner && meals.dinner.eaten);
  if ((log || gToday) && !recovered && !shown.includes("post") && out.length < left) {
    out.push({ id: "post", text: "練完了，把蛋白質補上。" });
  }
  return out.slice(0, left);
}

function homeSuggestion(st, kcal) {
  const sf = proteinShortfall(st);
  if (sf) return { testid: "shortfall", text: sf, warn: true };
  const notes = dueNotifs(st);
  if (notes[0]) return { testid: "suggest-" + notes[0].id, text: notes[0].text, notif: notes[0].id };
  if (st.lastAdvice) return { testid: "next-advice", text: st.lastAdvice };
  if (kcal && kcal.sleepLow) return { testid: "protein-reminder", text: "昨晚睡不夠，蛋白質還是要吃滿。" };
  return null;
}
function renderSuggestion(st, kcal) {
  const s = homeSuggestion(st, kcal);
  if (!s) return "";
  const dismiss = s.notif
    ? `<button type="button" class="btn" data-dismiss-notif="${esc(s.notif)}">知道了</button>`
    : "";
  return `<div class="note${s.warn ? " warn" : ""} suggest-card" data-testid="${esc(s.testid)}"><p>${esc(s.text)}</p>${dismiss}</div>`;
}

function renderSunday(st) {
  if (now().getDay() !== 0) return "";
  const { mon } = weekRange();
  let proteinDays = 0;
  let loggedDays = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(mon, i);
    if (d > now()) break;
    const t = mealTotals(st, d);
    if (t.protein || t.kcal) loggedDays += 1;
    if (t.protein >= PROTEIN_MIN) proteinDays += 1;
  }
  const last = lastInbody();
  const adj = computeKcalAdjust(st);
  const w = weight7avg();
  return `<section class="card">
    <div class="k" style="font-weight:800;color:#5C4A36">每週小結</div>
    <div class="stat"><span>體重</span><span>${w.value} kg · ${esc(w.source)}</span></div>
    <div class="stat"><span>最近體脂／骨骼肌</span><span>${last.pbf}% ／ ${last.smmKg} kg（${fmtMD(last.date)}）</span></div>
    <div class="stat"><span>本週蛋白達標</span><span>${proteinDays} 天${loggedDays ? `（有記錄 ${loggedDays} 天）` : ""}</span></div>
    <p class="note">${esc(adj.note || "體重有往下、骨骼肌持平就繼續這樣吃。")}</p>
  </section>`;
}

function scoopPicker(st, slot) {
  const ids = selectedScoops(st);
  const label = (o) => o.id === "plant" ? "極致" : String(o.name || "").replace("樂維根 ", "").replace("無糖", "").trim();
  return `<div class="chips" data-scoop-row="${slot}">${WHEY_OPTIONS.map((o) =>
    `<button type="button" class="chip${ids[slot] === o.id ? " on" : ""}" data-scoop-slot="${slot}" data-scoop-id="${esc(o.id)}">${esc(label(o))}</button>`
  ).join("")}</div>`;
}
function proteinShortfall(st) {
  const t = now();
  if (!isTrainDay(st, t) || t.getHours() >= 21) return null;
  const logs = (st.mealLogs || {})[todayKey(t)] || {};
  const snackOk = !!(logs.snack && logs.snack.eaten);
  const others = ["breakfast", "lunch", "dinner", "eggs21"].some((id) => logs[id] && logs[id].eaten);
  if (snackOk && !others && mealTotals(st).protein < PROTEIN_MIN) {
    return "蛋白粉已記，晚上前把雞胸或蛋補上。";
  }
  return null;
}
function remainText(st, totals, kcal) {
  const leftK = Math.round((kcal.target || 0) - (totals.kcal || 0));
  const leftP = Math.round(PROTEIN_TARGET - (totals.protein || 0));
  if (leftK >= 0) {
    return `還剩 ${leftK} kcal（目標 ${kcal.band}）· 蛋白${leftP >= 0 ? `還差 ${leftP}` : `已多 ${-leftP}`} g（140–160 g）`;
  }
  return `熱量超出 ${-leftK} kcal（目標 ${kcal.band}）· 蛋白 ${Math.round(totals.protein || 0)} g（140–160 g）`;
}
function patchMeal(st, id, patch) {
  const day = todayKey();
  const prev = { ...(((st.mealLogs || {})[day] || {})[id] || {}) };
  const next = { ...prev, ...patch };
  const est = mealEstimate({ ...st, mealLogs: { ...(st.mealLogs || {}), [day]: { ...((st.mealLogs || {})[day] || {}), [id]: next } } }, id);
  next.kcal = est.kcal;
  next.protein = est.protein;
  if (est.name) next.name = est.name;
  const meals = { ...((st.mealLogs || {})[day] || {}), [id]: next };
  save({ mealLogs: { ...(st.mealLogs || {}), [day]: meals } });
}
function renderMealRow(st, id, trainDay) {
  const logged = ((st.mealLogs || {})[todayKey()] || {})[id] || {};
  const sug = suggestionOf(st, id);
  if (sug.hidden) return "";
  const est = mealEstimate(st, id);
  const eaten = !!logged.eaten;
  const palms = Number(logged.palms) || 0;
  const fists = Number(logged.fists) || 0;
  const veg = !!logged.veg;
  const outType = logged.outType || "";
  const outSize = logged.outSize || "normal";
  const suggestLine = [sug.name || est.suggestName || "", sug.extraLine].filter(Boolean).join("＋");
  const more = ui.mealMore === id;
  const portionPane = more ? `
    <div class="portion-pane" data-testid="portion-${id}">
      <div class="portion-row">
        <span>🥩</span>
        <div class="stepper">
          <button type="button" data-palm="${id}" data-delta="-1" aria-label="少一掌">−</button>
          <b data-testid="palm-${id}">${palms} 掌</b>
          <button type="button" data-palm="${id}" data-delta="1" aria-label="加一掌">+</button>
        </div>
        <span>🍞</span>
        <div class="stepper">
          <button type="button" data-fist="${id}" data-delta="-1" aria-label="少一拳">−</button>
          <b data-testid="fist-${id}">${fists} 拳</b>
          <button type="button" data-fist="${id}" data-delta="1" aria-label="加一拳">+</button>
        </div>
      </div>
      <button type="button" class="chip${veg ? " on" : ""}" data-veg="${id}" data-testid="veg-${id}">蔬菜半盤</button>
      <button type="button" class="btn" data-whey2="${id}" data-testid="whey2-${id}">蛋白粉 2 份</button>
      <div class="out-row">
        <span>外食</span>
        ${(OUT_MEALS || []).map((o) => `<button type="button" class="chip${logged.mode === "out" && outType === o.id ? " on" : ""}" data-out-type="${id}" data-oid="${o.id}">${esc(o.name)}</button>`).join("")}
      </div>
      <div class="out-row">
        <span>份量</span>
        ${(OUT_SIZES || []).map((s) => `<button type="button" class="chip${outSize === s.id ? " on" : ""}" data-out-size="${id}" data-sid="${s.id}">${esc(s.name)}</button>`).join("")}
      </div>
      ${hasCustomPortions(logged) && est.name ? `<p class="now-pick">${esc(est.name)}</p>` : ""}
    </div>` : (hasCustomPortions(logged) && est.name ? `<p class="now-pick">${esc(est.name)}</p>` : "");
  return `<div class="meal-row${eaten ? " eaten" : ""}" data-testid="meal-${id}"${id === "snack" ? ' data-top="powder"' : ""}>
    <div class="who"><input type="time" class="meal-time" data-meal-time="${id}" data-testid="meal-time-${id}" value="${esc(mealLabel(id, trainDay, st))}" aria-label="時間"> <span class="nums">${Math.round(est.kcal || 0)} · 蛋白 ${Math.round(est.protein || 0)}g</span>${isExtraMeal(id) ? `<button type="button" class="ic meal-del" data-meal-del="${id}" data-testid="meal-del-${id}" aria-label="刪除這餐">✕</button>` : ""}</div>
    ${suggestLine ? `<p class="suggest">建議：${esc(suggestLine)}</p>` : ""}
    ${id === "snack" ? `${scoopPicker(st, 0)}${scoopPicker(st, 1)}` : ""}
    <div class="row-acts">
      <button type="button" class="btn primary xl eat-toggle${eaten ? " yes" : ""}" data-eat="${id}">✓ 吃了</button>
      <button type="button" class="btn xl" data-eat-else="${id}">吃了別的</button>
    </div>
    <button type="button" class="btn ghost short-btn" data-meal-more="${id}" data-testid="meal-more-${id}">${more ? "收起份量" : "份量"}</button>
    ${portionPane}
  </div>`;
}

function renderHome(st) {
  const t = now();
  const plan = todayPlan(st);
  const kcal = kcalInfo(st);
  const totals = mealTotals(st);
  const last = lastInbody();
  const w7 = weight7avg();
  const daysLeft = Math.max(0, Math.ceil((GOAL - t) / 86400000));
  const scans = (LIVE.inbody || []).slice(-16);
  const wt = scans.map((s) => s.weightKg);
  const pbf = scans.map((s) => s.pbf);
  const smm = scans.map((s) => s.smmKg);
  const week = weekSetCounts(st, t, { includeSession: true });
  const todayLog = (st.logs || {})[todayKey()];
  const parts = todayLog ? todayPartsFromMoves(todayLog.moves) : { pri: [], sec: [] };
  const session = st.session && st.session.date === todayKey() && st.session.phase !== "done" ? st.session : null;
  const returning = isReturnWeek(st);

  const trainedToday = !!(todayLog && todayLog.finishedAt) && !session;
  const pickRow = ui.wantTrain
    ? `<div class="rest-picks" data-testid="rest-picks">
        <button type="button" class="btn${plan.scheduled === "gymA" ? " primary" : ""}" data-rest-train="gymA" data-testid="rest-train-gymA">健身房 A</button>
        <button type="button" class="btn${plan.scheduled === "gymB" ? " primary" : ""}" data-rest-train="gymB" data-testid="rest-train-gymB">健身房 B</button>
        <button type="button" class="btn${plan.chk && plan.chk.quick ? " primary" : ""}" data-rest-train="quick" data-testid="rest-train-quick">快版</button>
      </div>`
    : `<button type="button" class="btn full" data-want-train data-testid="want-train">今天也想練</button>`;
  let trainCard;
  if (trainedToday && !(ui.wantTrain === "picked")) {
    trainCard = `<section class="card hero" data-testid="train-card">
      <div class="big" data-testid="trained-today" data-log-row="${todayKey()}">今天已練 ✓</div>
      <div class="acts">${pickRow}</div>
    </section>`;
  } else if (!plan.train) {
    const picks = ui.wantTrain
      ? `<div class="rest-picks" data-testid="rest-picks">
          <button type="button" class="btn${plan.scheduled === "gymA" ? " primary" : ""}" data-rest-train="gymA" data-testid="rest-train-gymA">健身房 A${plan.scheduled === "gymA" ? " · 這週下一堂" : ""}</button>
          <button type="button" class="btn${plan.scheduled === "gymB" ? " primary" : ""}" data-rest-train="gymB" data-testid="rest-train-gymB">健身房 B${plan.scheduled === "gymB" ? " · 這週下一堂" : ""}</button>
          <button type="button" class="btn${plan.chk && plan.chk.quick ? " primary" : ""}" data-rest-train="quick" data-testid="rest-train-quick">快版${plan.chk && plan.chk.quick ? " · 今天建議" : ""}</button>
        </div>`
      : `<button type="button" class="btn primary xl" data-want-train data-testid="want-train">今天也想練</button>`;
    trainCard = `<div class="rest-home">
      <div class="rest-line" data-testid="rest-line">休息日，走走路就好</div>
      <div class="rest-quick" data-testid="rest-quick">${esc(restQuickLine(plan.chk))}</div>
      ${picks}
    </div>`;
  } else {
    const w = plan.workout;
    const primary = session
      ? `<button type="button" class="btn primary xl" data-go="workout">繼續訓練</button>`
      : `<button type="button" class="btn primary xl" data-start>開始訓練</button>`;
    const ov = plan.canOverride
      ? `<button type="button" class="btn full" data-override="original">改回原課表（${esc(WORKOUTS[plan.scheduled].name)}）</button>`
      : (st.override || {})[todayKey()] === "original"
        ? `<button type="button" class="btn full" data-override="auto">改用建議課表</button>`
        : "";
    const fastedOn = markedFasted(st);
    const fastedBtn = `<button type="button" class="btn full" data-fasted="${fastedOn ? "off" : "on"}">${fastedOn ? "取消空腹" : "今天空腹練"}</button>`;
    const reasonBtn = (!st.hideSuggestReasons && plan.reason)
      ? `<button type="button" class="info-i" data-toggle-reason data-testid="reason-info" aria-label="原因">ⓘ</button>`
      : "";
    trainCard = `<section class="card hero" data-testid="train-card">
      <div class="k">${t.getMonth() + 1}/${t.getDate()} 週${DOW[t.getDay()]}${returning ? ' · <span data-testid="buffer-week">緩衝週</span>' : ""}</div>
      <div class="big">${esc(w.name)} · ${esc(w.time)}${reasonBtn}</div>
      ${(!st.hideSuggestReasons && ui.showReason && plan.reason) ? `<p class="reason" data-testid="reason">${esc(plan.reason)}</p>` : ""}
      <div class="acts">${primary}</div>
      <div class="acts">${fastedBtn}${ov}</div>
      <div class="acts">${pickRow}</div>
    </section>`;
  }

  const trainDay = isTrainDay(st);
  const mealIds = mealIdsFor(st);
  const meals = mealIds.map((id) => renderMealRow(st, id, trainDay)).join("") +
    `<button type="button" class="btn full add-meal" data-add-meal data-testid="add-meal">＋ 加一餐</button>`;

  const chips = MAIN_PARTS.map((p) => {
    const n = week[p] || 0;
    return `<span class="chip${n < 6 ? " low" : ""}" data-testid="week-chip-${p}">${esc(PARTS[p])} ${n} 組</span>`;
  }).join("");

  const gAttach = todayLog && (todayLog.garmin || matchGarmin(todayKey()));
  const gLine = gAttach
    ? `<p class="muted">Garmin${gAttach.name ? ` · ${esc(gAttach.name)}` : ""}：${gAttach.durationMin != null ? `${gAttach.durationMin} 分` : ""}${gAttach.avgHR != null ? ` · 心率 ${Math.round(gAttach.avgHR)}` : ""}${gAttach.kcal != null ? ` · ${Math.round(gAttach.kcal)} kcal` : ""}</p>`
    : "";

  return `
    ${trainCard}
    ${renderSuggestion(st, kcal)}
    <p class="sec">今天吃</p>
    <section class="card" data-testid="eat-card">
      <div class="rings">
        ${ringEl(totals.kcal, kcal.target, "kcal", String(kcal.target), false)}
        ${ringEl(totals.protein, PROTEIN_TARGET, "蛋白 g", "140–160", totals.protein >= PROTEIN_MIN)}
      </div>
      <p class="remain" data-testid="remain">${esc(remainText(st, totals, kcal))}</p>
      ${meals}
      ${shareCatsBtn()}
    </section>
    <p class="sec">身體趨勢</p>
    ${sleepHomeCard()}
    <button type="button" class="trend-item" data-go="body">
      <div class="lbl">體重 ${w7.stale ? "（近一次）" : "7 日平均"}</div>
      <div class="val">${w7.value} kg</div>
      ${lineChart(wt, "#C2410C", 320, 72)}
    </button>
    <button type="button" class="trend-item" data-go="body">
      <div class="lbl">體脂率</div>
      <div class="val">${last.pbf}% <span class="muted">（${fmtMD(last.date)}）</span></div>
      ${lineChart(pbf, "#9A3412", 320, 72)}
    </button>
    <button type="button" class="trend-item" data-go="body">
      <div class="lbl">骨骼肌</div>
      <div class="val">${last.smmKg} kg</div>
      ${lineChart(smm, "#166534", 320, 72)}
    </button>
    <p class="muted">InBody ${fmtMD(last.date)}：${last.weightKg} kg／體脂 ${last.pbf}%／骨骼肌 ${last.smmKg} kg。點圖看睡眠、心率細節。</p>
    <p class="sec">部位圖</p>
    ${bodyMap(parts.pri, parts.sec, week)}
    <div class="chips">${chips}</div>
    ${gLine}
    ${renderSunday(st)}
    <p class="muted">目標：12/31 前減脂 3–4 kg，體脂 15–16%，保肌。還有 ${daysLeft} 天。${LIVE.exportedAt ? `資料更新 ${esc(String(LIVE.exportedAt).replace("T", " ").slice(0, 16))}（曼谷時間）。` : ""}</p>
  `;
}

function openSwap(st, mealId) {
  const cur = currentMeal(st, mealId);
  const trainDay = isTrainDay(st);
  const wheyDefault = mealId === "snack" && trainDay;
  ui.swap = {
    meal: mealId,
    mode: cur.id === "loveigen2" || cur.id === "loveigen" || wheyDefault ? "whey" : "groups",
    proteinId: cur.proteinId || (trainDay ? (twoScoopMeal(st).chickenG === 150 ? "chicken150" : "chicken200") : "chicken200"),
    starchId: cur.starchId || "rice150",
    editEst: false,
    elseMode: false,
  };
}
const PER_SERVING = { protein: { kcal: PALM_KCAL, protein: PALM_PROTEIN }, starch: { kcal: FIST_KCAL, protein: FIST_PROTEIN }, veg: { kcal: 40, protein: 2 } };
function elseItems(st) {
  const out = [];
  for (const it of shopAllItems(st)) {
    if (it.whey) {
      for (const o of WHEY_OPTIONS || []) {
        const w = resolveWhey(st, o.id);
        out.push({ key: `whey:${o.id}`, name: o.name.replace("樂維根 ", ""), left: shopLeft(st, it).n, kcal: w.kcal == null ? 170 : Number(w.kcal), protein: Number(w.protein), whey: true });
      }
      continue;
    }
    const l = shopLeft(st, it);
    const m = PER_SERVING[it.group] || PER_SERVING.protein;
    out.push({ key: it.id, name: shopLabel(st, it), left: l.n, pending: l.pending, kcal: m.kcal, protein: m.protein });
  }
  return out;
}
function elseTotals(st) {
  const sel = (ui.elseSel || {});
  let kcal = 0, protein = 0;
  const names = [];
  for (const x of elseItems(st)) {
    const n = Number(sel[x.key]) || 0;
    if (!n) continue;
    kcal += n * x.kcal; protein += n * x.protein; names.push(`${x.name} ${n} 份`);
  }
  if (ui.elseOut) {
    const base = (OUT_MEALS || []).find((o) => o.id === ui.elseOut);
    const size = (OUT_SIZES || []).find((s) => s.id === (ui.elseOutSize || "normal")) || { mult: 1, name: "" };
    if (base) { kcal += Math.round(base.kcal * size.mult); protein += Math.round(base.protein * size.mult); names.push(`外食${base.name}${size.name ? "／" + size.name : ""}`); }
  }
  for (const f of ui.elseFree || []) { kcal += Number(f.kcal) || 0; protein += Number(f.protein) || 0; names.push(f.name); }
  return { kcal: Math.round(kcal), protein: Math.round(protein), name: names.join("＋") };
}
function renderElse(st) {
  const id = ui.elseMeal;
  if (!id) return renderHome(st);
  const sel = ui.elseSel || {};
  const rows = elseItems(st).map((x) => {
    const n = Number(sel[x.key]) || 0;
    return `<div class="else-row" data-testid="else-${x.key}"><span class="nm">${esc(x.name)}${x.pending ? '<span class="pend">待確認</span>' : ""}</span>
      <span class="left">剩 ${fmtServ({ n: x.left, pending: x.pending })}</span>
      <span class="stp"><button type="button" data-else-dec="${x.key}" aria-label="少一份">−</button><b data-testid="else-n-${x.key}">${n}</b><button type="button" data-else-inc="${x.key}" data-testid="else-inc-${x.key}" aria-label="多一份">+</button></span></div>`;
  }).join("");
  const outs = (OUT_MEALS || []).map((o) => `<button type="button" class="chip${ui.elseOut === o.id ? " on" : ""}" data-else-out="${o.id}" data-testid="else-out-${o.id}">${esc(o.name)}</button>`).join("");
  const sizes = ui.elseOut ? (OUT_SIZES || []).map((s) => `<button type="button" class="chip${(ui.elseOutSize || "normal") === s.id ? " on" : ""}" data-else-size="${s.id}">${esc(s.name)}</button>`).join("") : "";
  const free = (ui.elseFree || []).map((f, i) => `<div class="else-row"><span class="nm">${esc(f.name)}</span><span class="left">${f.kcal} kcal</span><span class="stp"><button type="button" data-else-free-del="${i}" aria-label="移除">✕</button></span></div>`).join("");
  const tot = elseTotals(st);
  return `<button type="button" class="btn" data-go="today">← 回到今天</button>
    <h2 class="sheet-title">吃了別的 · ${esc(mealTime(st, id))}</h2>
    <p class="sec">家裡有的</p>
    <div class="card else-list" data-testid="else-list">${rows}</div>
    <p class="sec">外食</p>
    <div class="chips" data-testid="else-out">${outs}</div>${sizes ? `<div class="chips">${sizes}</div>` : ""}
    <p class="sec">其他</p>
    ${free}
    ${ui.elseFreeOpen ? `<div class="card shop-add" data-testid="else-free-form">
        <input type="text" data-else-free-name placeholder="名稱" aria-label="名稱">
        <input type="number" inputmode="numeric" data-else-free-kcal placeholder="kcal" aria-label="kcal">
        <input type="number" inputmode="numeric" data-else-free-protein placeholder="蛋白 g" aria-label="蛋白">
        <button type="button" class="btn primary" data-else-free-add data-testid="else-free-add">加入</button></div>`
      : `<button type="button" class="btn full" data-else-free-open data-testid="else-free-open">＋ 其他</button>`}
    <div class="else-total" data-testid="else-total">${tot.kcal} kcal · 蛋白 ${tot.protein} g</div>
    <button type="button" class="btn primary xl" data-else-save data-testid="else-save"${tot.kcal || tot.protein ? "" : " disabled"}>✓ 吃了</button>`;
}
function renderSwap(st) {
  if (ui.elseMeal) return renderElse(st);
  const sw = ui.swap;
  if (!sw || !sw.meal) return renderHome(st);
  const def = MEAL_DEFS[sw.meal] || { label: sw.meal };
  const trainDay = isTrainDay(st);
  const shake = twoScoopMeal(st);
  const composed = composeSwapMeal(sw.proteinId, sw.starchId);
  const preview = sw.mode === "whey" ? shake : composed;
  const pantryP = PROTEIN_SWAPS.filter((it) => !/罐頭/.test(it.name));
  const protBtns = pantryP.map((it) => `<button type="button" class="${sw.mode === "groups" && sw.proteinId === it.id ? "on" : ""}" data-pick-p="${esc(it.id)}">
      ${esc(it.name)}<small>${it.kcal} kcal · 蛋白 ${it.protein} g</small>
    </button>`).join("");
  const starchBtns = STARCH_SWAPS.map((it) => `<button type="button" class="${sw.mode === "groups" && sw.starchId === it.id ? "on" : ""}" data-pick-s="${esc(it.id)}">
      ${esc(it.name)}<small>${it.kcal} kcal · 蛋白 ${it.protein} g</small>
    </button>`).join("");
  return `<button type="button" class="btn" data-go="today">← 回到今天</button>
    <h2 class="sheet-title">換${esc(mealLabel(sw.meal, trainDay, st))}</h2>
    <p class="sec">16:00 兩份蛋白粉</p>
    <p class="muted">第一份</p>${scoopPicker(st, 0)}
    <p class="muted">第二份</p>${scoopPicker(st, 1)}
    <p class="note">地瓜 150g</p>
    <p class="sec">蛋白質（可互換，僅家常食材）</p>
    <div class="swap-list">${protBtns}</div>
    <p class="sec">澱粉（可互換）</p>
    <div class="swap-list">${starchBtns}</div>
    <section class="card">
      <div class="who">預覽</div>
      <h3>${esc(preview.name)}</h3>
      ${preview.extraLine ? `<p class="meta">${esc(preview.extraLine)}</p>` : ""}
      <p class="meta">${Math.round(preview.kcal || 0)} kcal · 蛋白 ${Math.round(preview.protein || 0)} g${preview.estimate ? "（估計值）" : ""}</p>
    </section>
    <button type="button" class="btn primary xl" data-apply-swap>照這個吃</button>`;
}

function deleteLog(date) {
  const st = state();
  const logs = { ...(st.logs || {}) };
  if (!logs[date]) return;
  delete logs[date];
  const lastLoads = {};
  for (const d of Object.keys(logs).sort()) {
    for (const [name, sets] of Object.entries(logs[d].moves || {})) {
      const done = (sets || []).filter((s) => s.done && s.weight != null);
      if (done.length) { const l = done[done.length - 1]; lastLoads[moveKey(name)] = { weight: l.weight, reps: l.reps, date: d, returning: !!logs[d].returning }; }
    }
  }
  const backSwap = {};
  for (const [k, v] of Object.entries(st.backSwap || {})) if (!(v && v.date === date) && logs[v && v.date]) backSwap[k] = v;
  const loadHistory = {};
  for (const [k, arr] of Object.entries(st.loadHistory || {})) loadHistory[k] = (arr || []).filter((x) => x.date !== date);
  const suggest = {};
  for (const [k, arr] of Object.entries(loadHistory)) if (arr.length >= 2 && arr[arr.length - 1].hitAll && arr[arr.length - 2].hitAll) suggest[k] = { add: 2.5 };
  const session = st.session && st.session.date === date ? null : st.session;
  const restTrain = { ...(st.restTrain || {}) }; delete restTrain[date];
  save({ logs, lastLoads, backSwap, loadHistory, suggest, session, restTrain });
  showToast("已刪除這筆訓練");
  render();
}
function renderLogRows(st) {
  const dates = Object.keys(st.logs || {}).filter((d) => st.logs[d].finishedAt || Object.keys(st.logs[d].moves || {}).length).sort().reverse();
  if (!dates.length) return `<p class="muted">還沒有訓練紀錄。</p>`;
  return dates.map((d) => {
    const l = st.logs[d];
    const w = WORKOUTS[l.workoutId];
    const n = Object.values(l.moves || {}).reduce((s, x) => s + (x || []).filter((y) => y.done).length, 0);
    return `<div class="stat" data-log-row="${d}" data-testid="log-row-${d}"><span>${fmtMD(d)} ${esc(w ? w.name : "訓練")}</span><span>${n} 組</span></div>`;
  }).join("") + `<p class="muted">長按一筆可刪除</p>`;
}
const SLEEP_COLORS = { awake: "#FF7F50", rem: "#3BC5F5", core: "#2F80ED", deep: "#5B4BDB" };
const SLEEP_NAMES = { awake: "清醒", rem: "REM", core: "核心", deep: "深層" };
const SLEEP_ORDER = ["awake", "rem", "core", "deep"];
function hm(min) {
  const m = Math.round(Number(min) || 0);
  return { h: Math.floor(m / 60), m: m % 60 };
}
function hmHtml(min) {
  const x = hm(min);
  return `${x.h}<small>小時</small>${x.m ? ` ${x.m}<small>分</small>` : ""}`;
}
function sleepRows() {
  return (LIVE.garmin.daily || []).filter((r) => r.sleepHours != null).sort((x, y) => x.date.localeCompare(y.date));
}
function sleepMinOf(r) {
  if (r.sleep) return (r.sleep.deepMin || 0) + (r.sleep.coreMin || 0) + (r.sleep.remMin || 0);
  return Math.round((Number(r.sleepHours) || 0) * 60);
}
function sleepHomeCard() {
  const rows = sleepRows();
  const last = rows[rows.length - 1];
  if (!last) return "";
  return `<button type="button" class="sleep-mini" data-go="sleep" data-testid="sleep-home">
    <span class="k">睡眠時間</span><span class="v">${hmHtml(sleepMinOf(last))}</span>
    ${last.sleep ? `<span class="bar">${SLEEP_ORDER.slice().reverse().map((s) => `<i style="flex:${last.sleep[s + "Min"] || 0};background:${SLEEP_COLORS[s]}"></i>`).join("")}</span>` : ""}
  </button>`;
}
function clockOf(iso) { return iso ? String(iso).slice(11, 16) : ""; }
function renderHypnogram(sl) {
  const segs = sl.segments || [];
  if (!segs.length) return "";
  const total = segs[segs.length - 1][1] || 1;
  const W = 320, rowH = 22, gap = 8, H = SLEEP_ORDER.length * (rowH + gap);
  const y = (s) => SLEEP_ORDER.indexOf(s) * (rowH + gap);
  const rects = segs.map(([a, b, s]) => `<rect x="${(a / total * W).toFixed(1)}" y="${y(s)}" width="${Math.max(1.5, (b - a) / total * W).toFixed(1)}" height="${rowH}" rx="4" fill="${SLEEP_COLORS[s]}"/>`).join("");
  const grid = SLEEP_ORDER.map((s) => `<line x1="0" x2="${W}" y1="${y(s) + rowH / 2}" y2="${y(s) + rowH / 2}" stroke="#3A3A3C" stroke-dasharray="2 4"/>`).join("");
  return `<div class="hyp" data-testid="sleep-hypnogram">
    <div class="hyp-l">${SLEEP_ORDER.map((s) => `<span style="height:${rowH}px;margin-bottom:${gap}px">${SLEEP_NAMES[s]}</span>`).join("")}</div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${grid}${rects}</svg>
    <div class="hyp-t"><span>${clockOf(sl.start)}</span><span>${clockOf(sl.end)}</span></div>
  </div>`;
}
function renderSleepBars(rows, n) {
  if (!rows.length) return "";
  // Calendar days ending at the latest night; missing nights stay empty (no estimate).
  const byDate = {};
  for (const r of rows) byDate[r.date] = r;
  const end = parseISO(rows[rows.length - 1].date);
  const list = [];
  for (let i = n - 1; i >= 0; i--) {
    const key = todayKey(addDays(end, -i));
    list.push(byDate[key] || { date: key, missing: true });
  }
  const have = list.filter((r) => !r.missing);
  const mins = list.map((r) => (r.missing ? 0 : sleepMinOf(r)));
  const maxH = Math.max(10, Math.ceil(Math.max(...mins) / 60 / 2) * 2);
  const maxM = maxH * 60;
  const avg = have.length ? have.reduce((s, r) => s + sleepMinOf(r), 0) / have.length : 0;
  const W = 320, H = 160, bw = W / list.length;
  const bars = list.map((r, i) => {
    if (r.missing) return "";
    const x = i * bw + bw * 0.2, w = bw * 0.6;
    if (r.sleep) {
      let yb = H;
      return ["deep", "core", "rem"].map((s) => {
        const h = (r.sleep[s + "Min"] || 0) / maxM * H; yb -= h;
        return `<rect x="${x.toFixed(1)}" y="${yb.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${SLEEP_COLORS[s]}"/>`;
      }).join("");
    }
    const h = mins[i] / maxM * H;
    return `<rect class="nostage" data-nostage="${r.date}" x="${x.toFixed(1)}" y="${(H - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="#8E8E93"/>`;
  }).join("");
  const ticks = [];
  for (let hh = 0; hh <= maxH; hh += 2) ticks.push(hh);
  const grid = ticks.map((hh) => `<line x1="0" x2="${W}" y1="${(H - hh * 60 / maxM * H).toFixed(1)}" y2="${(H - hh * 60 / maxM * H).toFixed(1)}" stroke="${hh === 0 ? "#48484A" : "#2C2C2E"}"/>`).join("");
  const tickLabels = ticks.map((hh) => `<span data-testid="sleep-tick-${hh}" style="top:${((1 - hh / maxH) * 100).toFixed(1)}%">${hh}h</span>`).join("");
  const ya = H - avg / maxM * H;
  const labels = n <= 7
    ? list.map((r, i) => `<span style="left:${((i + 0.5) * bw / W * 100).toFixed(1)}%">${"日一二三四五六"[parseISO(r.date).getDay()]}</span>`).join("")
    : [0, Math.floor(list.length / 2), list.length - 1].map((i) => `<span style="left:${((i + 0.5) * bw / W * 100).toFixed(1)}%">${fmtMD(list[i].date)}</span>`).join("");
  const missN = list.filter((r) => r.missing).length;
  const noStageN = have.filter((r) => !r.sleep).length;
  return `<div class="sl-avg"><span class="k">平均睡眠時間</span><span class="v" data-testid="sleep-avg">${have.length ? hmHtml(avg) : "—"}</span><span class="d">${fmtMD(list[0].date)}–${fmtMD(list[list.length - 1].date)}${missN ? ` · ${missN} 晚無資料` : ""}</span></div>
    <div class="sl-chart" data-testid="sleep-bars"><div class="sl-plot"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      ${grid}${bars}${have.length ? `<line x1="0" x2="${W}" y1="${ya.toFixed(1)}" y2="${ya.toFixed(1)}" stroke="#30D158" stroke-width="2" stroke-dasharray="5 4"/>` : ""}</svg>
      <div class="sl-y" data-testid="sleep-yaxis">${tickLabels}</div></div>
      <div class="sl-x">${labels}</div>${noStageN ? `<p class="sl-note" data-testid="sleep-nostage-note">灰色＝無階段資料</p>` : ""}</div>`;
}
function renderSleep(st) {
  const rows = sleepRows();
  const range = ui.sleepRange || "D";
  const seg = ["D", "W", "M"].map((r) => `<button type="button" class="${range === r ? "on" : ""}" data-sleep-range="${r}" data-testid="sleep-range-${r}">${{ D: "日", W: "週", M: "月" }[r]}</button>`).join("");
  const head = `<div class="sl-top"><button type="button" class="sl-back" data-go="today">‹ 今天</button><b>睡眠</b><span></span></div>
    <div class="sl-seg">${seg}</div>`;
  if (!rows.length) return `<div class="sleep-page" data-testid="sleep-page">${head}<div class="sl-card"><div class="sl-k">睡眠時間</div><div class="sl-big">—</div><p class="sl-empty" data-testid="sleep-empty">還沒有睡眠資料</p></div></div>`;
  let body = "";
  if (range === "D") {
    const idx = Math.min(rows.length - 1, Math.max(0, ui.sleepIdx != null ? ui.sleepIdx : rows.length - 1));
    const r = rows[idx];
    const sl = r.sleep;
    const total = sleepMinOf(r);
    const inBed = sl ? total + (sl.awakeMin || 0) : null;
    const stages = sl ? SLEEP_ORDER.map((s) => {
      const m = sl[s + "Min"] || 0;
      const pct = inBed ? Math.round(m / inBed * 100) : 0;
      return `<div class="sl-stage" data-testid="sleep-stage-${s}"><i style="background:${SLEEP_COLORS[s]}"></i><span>${SLEEP_NAMES[s]}</span><b>${hmHtml(m)}</b><em>${pct}%</em></div>`;
    }).join("") : `<p class="sl-empty" data-testid="sleep-nostage">無階段資料</p>`;
    body = `<div class="sl-card">
        <div class="sl-nav"><button type="button" data-sleep-step="-1" aria-label="前一天"${idx === 0 ? " disabled" : ""}>‹</button>
          <span>${fmtMD(r.date)} 週${DOW[parseISO(r.date).getDay()]}</span>
          <button type="button" data-sleep-step="1" aria-label="後一天"${idx === rows.length - 1 ? " disabled" : ""}>›</button></div>
        <div class="sl-k">睡眠時間</div>
        <div class="sl-big" data-testid="sleep-total">${hmHtml(total)}</div>
        ${sl ? `<div class="sl-sched" data-testid="sleep-schedule">🛏 ${clockOf(sl.start)} – ${clockOf(sl.end)}${inBed ? ` · 在床 ${hm(inBed).h}:${String(hm(inBed).m).padStart(2, "0")}` : ""}</div>` : ""}
        ${sl ? renderHypnogram(sl) : ""}
      </div>
      <div class="sl-card">${stages}</div>`;
  } else {
    body = `<div class="sl-card">${renderSleepBars(rows, range === "W" ? 7 : 30)}</div>
      <div class="sl-card sl-legend">${SLEEP_ORDER.filter((s) => s !== "awake").map((s) => `<span><i style="background:${SLEEP_COLORS[s]}"></i>${SLEEP_NAMES[s]}</span>`).join("")}<span><i class="avg"></i>平均</span></div>`;
  }
  return `<div class="sleep-page" data-testid="sleep-page">${head}${body}</div>`;
}
function renderBody(st) {
  const last = lastInbody();
  const daily = LIVE.garmin.daily || [];
  const sleep = daily.map((r) => r.sleepHours);
  const rhr = daily.map((r) => r.restingHR);
  const scans = (LIVE.inbody || []).slice(-52);
  const acts = LIVE.garmin.activities || [];
  const w7 = weight7avg();
  const rows = [...scans].reverse().slice(0, 12).map((s) =>
    `<div class="stat"><span>${fmtMD(s.date)}</span><span>${s.weightKg} kg · 體脂 ${s.pbf}% · 肌 ${s.smmKg} kg</span></div>`
  ).join("");
  const actRows = [...acts].reverse().map((a) =>
    `<div class="stat"><span>${fmtMD(a.date)} ${esc(a.name || a.type)}</span><span>${a.durationMin != null ? a.durationMin + " 分" : ""}${a.avgHR != null ? " · " + Math.round(a.avgHR) + " bpm" : ""}</span></div>`
  ).join("") || `<p class="muted">最近 30 天沒有運動紀錄。</p>`;
  return `<button type="button" class="btn" data-go="today">← 回到今天</button>
    <section class="card hero">
      <div class="k">InBody ${fmtMD(last.date)}</div>
      <div class="big">${last.weightKg} kg</div>
      <div class="lab">體脂 ${last.pbf}% · 骨骼肌 ${last.smmKg} kg · BMI ${last.bmi}</div>
    </section>
    <p class="sec">體重（7 日平均 ${w7.value} kg）</p>
    <div class="card">${lineChart(scans.map((s) => s.weightKg), "#C2410C", 320, 140, "chart chart-lg")}</div>
    <p class="sec">體脂率</p>
    <div class="card">${lineChart(scans.map((s) => s.pbf), "#9A3412", 320, 140, "chart chart-lg")}</div>
    <p class="sec">骨骼肌</p>
    <div class="card">${lineChart(scans.map((s) => s.smmKg), "#166534", 320, 140, "chart chart-lg")}</div>
    <button type="button" class="btn full" data-go="sleep">睡眠</button>
    <p class="sec">睡眠（小時）</p>
    <div class="card">${lineChart(sleep, "#7C3AED", 320, 140, "chart chart-lg")}<p class="muted">看有沒有滿 6 小時。不到就改快版，蛋白質照吃。</p></div>
    <p class="sec">靜止心率</p>
    <div class="card">${lineChart(rhr, "#B45309", 320, 140, "chart chart-lg")}<p class="muted">比 7 日平均高 5 下以上，今天改家裡快版。</p></div>
    <p class="sec">最近 InBody</p>
    <div class="card">${rows}</div>
    <p class="sec">訓練紀錄</p>
    <div class="card" data-testid="log-list">${renderLogRows(st)}</div>
    <p class="sec">運動心率／時長</p>
    <div class="card">${actRows}</div>`;
}

function sessionLoad(session, st) {
  const step = session.steps[session.i];
  if (!step) return { weight: null, target: 10, sets: 3, perSide: false };
  const dose = parseDose(step.dose);
  const key = moveKey(step.name);
  const prev = (session.moves[step.name] || []).filter((s) => s.done);
  const lastSet = prev[prev.length - 1];
  const hist = (st.lastLoads || {})[key];
  const sug = (st.suggest || {})[key];
  let weight = session.editWeight;
  if (weight == null && lastSet && lastSet.weight != null) weight = lastSet.weight;
  if (weight == null && hist && hist.weight != null) {
    weight = session.returning && !hist.returning ? Math.round(Number(hist.weight) * 0.7 * 2) / 2 : Number(hist.weight);
    if (!session.returning && !session.fasted && sug && sug.add) weight = Number(hist.weight) + Number(sug.add);
  }
  const noWeight = NO_WEIGHT.test(step.name);
  if (weight == null && !noWeight) weight = startKgFor(step.name);
  let target = dose.repsLow;
  if (hist && hist.reps && !session.returning) target = hist.reps;
  if (session.editTarget != null) target = session.editTarget;
  return { weight, target, sets: dose.sets, perSide: dose.perSide, hist, sug, noWeight };
}

function renderWorkout(st) {
  const session = st.session;
  if (!session) {
    return `<p class="note">還沒開始訓練。</p><button type="button" class="btn primary xl" data-go="today">回到今天</button>`;
  }
  if (session.phase === "done") return renderDone(st, session);
  if (session.phase === "back") return renderBack(session);
  if (session.phase === "exback") return renderExBack(session);
  if (session.phase === "rest") return renderRest(session);

  const step = session.steps[session.i];
  const load = sessionLoad(session, st);
  const setNo = session.setI + 1;
  if (session.setI >= load.sets) {
    return `<div class="wo-top"><button type="button" class="btn" data-leave>先離開</button>
      <div class="wo-prog">${session.i + 1}/${session.steps.length}</div></div>
      <div class="wo-name">${esc(step.name)}</div>
      <p class="note">這個動作已完成，左滑繼續下一個。</p>
      <button type="button" class="btn primary xl" data-wonext>下一個動作</button>`;
  }
  const note = session.fasted
    ? "空腹練，不追重量。用上次重量或更輕，留餘力就好。"
    : session.returning
    ? "回台第一週，重量約上次七成，每組留 3 下餘力。"
    : load.sug && load.sug.add
      ? `連續兩次做滿且有餘力，建議加到 ${load.weight} kg（+${load.sug.add}）。不想加就改回原重量再按完成。`
      : null;
  const weightBlock = load.noWeight
    ? `<div class="load"><div class="num" data-testid="wo-weight">徒手</div></div>`
    : `<div class="load">
        <div><div class="num" data-testid="wo-weight">${load.weight}<span class="unit"> kg</span></div>
          <div class="muted">${load.hist && load.hist.weight != null ? `上次 ${load.hist.weight} kg` : "起始重量"}</div>
        </div>
        <div class="stepper">
          <button type="button" data-wdelta="-${WEIGHT_STEP}" data-testid="w-minus" aria-label="減 ${WEIGHT_STEP} 公斤">−</button>
          <button type="button" data-wdelta="${WEIGHT_STEP}" data-testid="w-plus" aria-label="加 ${WEIGHT_STEP} 公斤">+</button>
        </div>
      </div>`;

  if (session.phase === "short") {
    return `<div class="wo-top"><button type="button" class="btn" data-leave>先離開</button>
      <div class="wo-prog">${session.i + 1}/${session.steps.length} · 第 ${setNo}/${load.sets} 組</div></div>
      <p class="muted">實際做了幾下？</p>
      <div class="load"><div class="num">${session.shortReps ?? Math.max(1, load.target - 2)}<span class="unit"> 下</span></div>
        <div class="stepper">
          <button type="button" data-rdelta="-1">−</button>
          <button type="button" data-rdelta="1">+</button>
        </div>
      </div>
      <button type="button" class="btn primary xl" data-short-save>記下來</button>`;
  }

  return `
    <div class="wo-top">
      <button type="button" class="btn" data-leave>先離開</button>
      <div class="wo-prog">${session.i + 1} / ${session.steps.length} · 第 ${setNo} / ${load.sets} 組</div>
    </div>
    <div class="wo-name">${esc(step.name)}${step.extra ? '<span class="chip">補強</span>' : ""}${step.swapped ? '<span class="chip">換動作</span>' : ""}${session.returning ? '<span class="chip" data-testid="buffer-week">緩衝週</span>' : ""}</div>
    <div data-testid="wo-figure">${bodyMap((musclesFor(step.name).primary), (musclesFor(step.name).secondary), weekSetCounts(st, now(), { includeSession: true }))}</div>
    <p class="muted">${esc(step.dose)}${load.perSide ? "（單側次數）" : ""} · 目標 ${load.target} 下${load.hist && load.hist.reps ? ` · 上次 ${load.hist.reps} 下` : ""}</p>
    <p class="wo-cue" data-testid="wo-cue">${esc(cueFor(step.name))}</p>
    ${yt(step.video)}
    ${weightBlock}
    ${note ? `<p class="note">${esc(note)}</p>` : ""}
    <button type="button" class="btn primary xl" data-complete>完成</button>
    <button type="button" class="btn ghost short-btn" data-short>少做了</button>
    <p class="muted">左滑下一個動作，右滑回上一個。重量有變再按 ＋－，次數不夠才按「少做了」。</p>
  `;
}

function renderRest(session) {
  const left = Math.max(0, Math.ceil(((session.restUntil || 0) - Date.now()) / 1000));
  return `<div class="rest-box" data-testid="rest-timer">
    <div class="muted">休息</div>
    <div class="t" id="rest-count">${left}</div>
    <p class="muted">秒後繼續下一組</p>
    ${session.swapNote ? `<p class="note" data-testid="ex-swap-note">${esc(session.swapNote)}</p>` : ""}
    <button type="button" class="btn primary xl eat-toggle yes" data-undo-set data-testid="btn-undo">✓ 完成</button>
    <button type="button" class="btn full" data-skip-rest>跳過休息</button>
  </div>`;
}

function renderExBack(session) {
  const step = session.steps[session.exBackI != null ? session.exBackI : session.i];
  const btns = Array.from({ length: 11 }, (_, i) => `<button type="button" data-exback="${i}" data-testid="exback-${i}">${i}</button>`).join("");
  return `<section class="card hero" data-testid="exback"><div class="k">${esc(step ? step.name : "")}</div><div class="big">下背 OK 嗎</div>
    <div class="lab">0 很好 · 10 很痛</div></section>
    <div class="back-grid">${btns}</div>`;
}
function exSwapTarget(name) {
  const s = lookSafer(name, null);
  return s ? s.name || s : null;
}
function renderBack(session) {
  const cur = session.backScore;
  const btns = Array.from({ length: 11 }, (_, i) =>
    `<button type="button" class="${cur === i ? "on" : ""}" data-back="${i}">${i}</button>`
  ).join("");
  return `<section class="card hero"><div class="big">下背感覺？</div>
    <div class="lab">0 沒感覺，10 很不適。點一下就好。</div></section>
    <div class="back-grid">${btns}</div>
    <p class="muted">3 分以上，下次改成較安全的動作。</p>`;
}

function renderDone(st, session) {
  const week = weekSetCounts(st, now(), { includeSession: true });
  const parts = todayPartsFromMoves(session.moves);
  const g = session.garmin || matchGarmin(session.date);
  const chips = MAIN_PARTS.map((p) => `<span class="chip${(week[p] || 0) < 6 ? " low" : ""}" data-testid="week-chip-${p}">${esc(PARTS[p])} ${week[p] || 0} 組</span>`).join("");
  const exSw = Object.entries(session.exSwaps || {}).map(([n, t]) => `${n}：${t.replace(/^下次這動作/, "")}`);
  const swaps = exSw.length ? exSw : (session.exBack ? [] : upcomingBackSwaps(session.workoutId, session.backScore));
  const swapLine = swaps.length
    ? `<p class="note" data-testid="back-swaps">下次換動作：${esc(swaps.join("、"))}</p>`
    : "";
  return `<section class="card hero">
      <div class="k">練完了</div>
      <div class="big">今天部位</div>
      <div class="lab" data-testid="back-score">下背 ${session.backScore} 分</div>
    </section>
    ${swapLine}
    ${bodyMap(parts.pri, parts.sec, week)}
    <div class="chips">${chips}</div>
    ${g ? `<p class="muted">Garmin：${g.durationMin != null ? g.durationMin + " 分" : ""}${g.avgHR != null ? " · 平均心率 " + Math.round(g.avgHR) : ""}${g.kcal != null ? " · " + Math.round(g.kcal) + " kcal" : ""}</p>` : `<p class="muted">今天的 Garmin 紀錄之後同步，會自動對上這次訓練的心率和時間。</p>`}
    <button type="button" class="btn primary xl" data-finish-home>回到今天</button>`;
}

function renderShop(st) {
  const shop = persistShopWeek(st);
  const stats = shopDaysStats(st);
  const visible = shopAllItems(st).filter((it) => !shop.hide[it.id] || isShopFrequent(st, it));
  const hint = shopDaysHint(st);
  const wheyWarn = shop.wheyPacks < 6
    ? `<p class="note warn" data-testid="whey-low">蛋白粉剩 ${shop.wheyPacks} 份</p>`
    : "";
  const pPct = stats.proteinPlan ? Math.min(100, Math.round(100 * stats.proteinBought / stats.proteinPlan)) : 0;
  const sPct = stats.starchPlan ? Math.min(100, Math.round(100 * stats.starchBought / stats.starchPlan)) : 0;
  const bars = `<div class="shop-bars" data-testid="shop-bars">
      <div class="shop-bar"><span class="lab">蛋白質</span>
        <div class="bar" role="progressbar" aria-valuenow="${pPct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pPct}%"></i></div>
        <span class="val"><b data-testid="shop-protein-days">${stats.proteinBought}</b>/<span data-testid="shop-protein-plan">${stats.proteinPlan}</span> 天</span>
      </div>
      <div class="shop-bar"><span class="lab">澱粉</span>
        <div class="bar" role="progressbar" aria-valuenow="${sPct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${sPct}%"></i></div>
        <span class="val"><b data-testid="shop-starch-days">${stats.starchBought}</b>/<span data-testid="shop-starch-plan">${stats.starchPlan}</span> 天</span>
      </div>
    </div>`;
  const groups = (SHOP_GROUPS || []).map((g) => {
    const items = visible.filter((it) => it.group === g.id);
    if (!items.length) return "";
    const vegN = g.id === "veg" ? `<span class="sec-n">${shopAllItems(st).filter((it) => it.pick && shopAcquired(shop, it.id)).length}/4–5</span>` : "";
    return `<p class="sec shop-sec">${esc(g.name)}${vegN}</p>${items.map((it) => {
      const on = !!shop.checked[it.id];
      const have = !!shop.have[it.id];
      const freq = isShopFrequent(st, it);
      const sp = shopSplit(it);
      const qty = it.whey
        ? `<span class="shop-qty whey-stock"><button type="button" data-whey-pack="-1" aria-label="少一份">−</button><b data-testid="whey-packs">${shop.wheyPacks}</b><button type="button" data-whey-pack="1" aria-label="多一份">+</button><small>份</small></span>`
        : `<span class="shop-qty" data-testid="shop-qty-${it.id}">${(() => { const l = shopLeft(st, it); return fmtServ(l); })()}</span>`;
      const pend = shopServings(st, it).pending ? `<span class="pend" data-testid="shop-pending-${it.id}">待確認</span>` : "";
      const del = `<button type="button" class="ic" data-shop-edit="${it.id}" data-testid="shop-edit-${it.id}" aria-label="編輯">⋯</button>`;
      return `<div class="item shop-row${on ? " on" : ""}${have ? " have" : ""}${freq ? " freq" : ""}" data-shop="${it.id}" data-testid="shop-${it.id}" role="button" tabindex="0">
        <span class="ck${on ? " on" : ""}">${on ? "✓" : ""}</span>
        <span class="shop-name"><b>${esc(shopLabel(st, it))}</b>${pend}${have ? `<span class="have-tag">家裡有</span>` : ""}</span>
        ${qty}
        <span class="shop-acts"><button type="button" class="star${freq ? " on" : ""}" data-shop-frequent="${it.id}" data-testid="shop-frequent-${it.id}" aria-label="常買">${freq ? "★" : "☆"}</button>${del}</span>
      </div>`;
    }).join("")}`;
  }).join("");
  const extras = (st.shopExtra || []);
  const chips = `<div class="chips shop-chips" data-testid="shop-chips">${extras.map((it) => {
    const on = !!(shop.checked[it.id] || shop.have[it.id]);
    return `<button type="button" class="chip${on ? " on" : ""}" data-shop-chip="${it.id}" data-testid="shop-chip-${it.id}">${esc(shopLabel(st, it))} ${fmtServ(shopLeft(st, it))}</button>`;
  }).join("")}</div>`;
  const knownDraft = matchShopItem(st, ui.shopDraftName);
  const add = ui.shopAdd ? `<div class="shop-add card" data-testid="shop-add">
      <input type="text" data-shop-new-name placeholder="名稱，例如 雞柳" aria-label="名稱" value="${esc(ui.shopDraftName || "")}">
      <input type="text" data-shop-new-amount placeholder="份量，例如 300g 或 2" aria-label="份量" value="${esc(ui.shopDraftAmount || "")}">
      <div class="shop-cats" data-testid="shop-cats"${knownDraft ? " hidden" : ""}>
        <button type="button" class="chip${(ui.shopCat || "protein") === "protein" ? " on" : ""}" data-shop-cat="protein">蛋白質</button>
        <button type="button" class="chip${ui.shopCat === "starch" ? " on" : ""}" data-shop-cat="starch">澱粉</button>
        <button type="button" class="chip${ui.shopCat === "veg" ? " on" : ""}" data-shop-cat="veg">蔬菜</button>
      </div>
      <select data-shop-new-group aria-label="分類">
        <option value="protein"${(ui.shopCat || "protein") === "protein" ? " selected" : ""}>蛋白質</option>
        <option value="starch"${ui.shopCat === "starch" ? " selected" : ""}>澱粉</option>
        <option value="veg"${ui.shopCat === "veg" ? " selected" : ""}>蔬菜</option>
      </select>
      <button type="button" class="btn primary" data-shop-add>新增</button>
    </div>` : "";
  const editIt = ui.shopEdit ? shopAllItems(st).find((x) => x.id === ui.shopEdit) : null;
  let editSheet = "";
  if (editIt) {
    const sp = shopSplit(editIt);
    const body = editIt.whey
      ? (WHEY_OPTIONS || []).map((o) => { const w = resolveWhey(st, o.id); return `<div class="edit-row"><span>${esc(o.name.replace("樂維根 ", ""))}</span>
          <label>一份 <input type="number" inputmode="decimal" data-whey-g="${o.id}" value="${w.scoopG}"> g</label>
          <label>蛋白 <input type="number" inputmode="decimal" data-whey-p="${o.id}" value="${w.protein}"> g</label></div>`; }).join("")
      : `<label class="edit-row"><span>名稱</span><input type="text" data-edit-name data-testid="edit-name" value="${esc(shopLabel(st, editIt))}"></label>
         <label class="edit-row"><span>份數</span><input type="number" inputmode="numeric" data-edit-n data-testid="edit-n" value="${shopLeft(st, editIt).pending && !shopLeft(st, editIt).n ? "" : r1(shopLeft(st, editIt).n)}" step="0.1" placeholder="?"></label>
         <label class="edit-row"><span>購買量</span><input type="text" data-edit-qty data-testid="edit-qty" value="${esc(shopQtyOf(st, editIt))}" placeholder="例如 600 g"></label>
         <label class="edit-row"><span>一份是多少</span><input type="text" data-edit-portion data-testid="edit-portion" value="${esc((st.shopPortions || {})[editIt.id] || (typeof shopBasisG(st, editIt) === "number" ? `${shopBasisG(st, editIt)} g` : ""))}" placeholder="例如 150 g 或 1 包"></label>${shopOrigWeight(st, editIt) ? `<small class="muted" data-testid="edit-orig">原 ${esc(shopOrigWeight(st, editIt))}</small>` : ""}
         <p class="muted">${shopServings(st, editIt).pending ? "待確認：填一份是多少才會算進天數" : fmtServ(shopLeft(st, editIt))}</p>${!shopServings(st, editIt).pending && typeof shopBasisG(st, editIt) === "number" ? `<small class="muted" data-testid="edit-left">剩 ${fmtG(shopLeft(st, editIt).n * shopBasisG(st, editIt))}</small>` : ""}`;
    const dup = editIt.whey ? null : shopAllItems(st).find((x) => x.id !== editIt.id && x.group === editIt.group && normName(shopLabel(st, x)) === normName(shopLabel(st, editIt)));
    const mergeBtn = dup ? `<button type="button" class="btn" data-shop-merge="${editIt.id}" data-merge-into="${dup.id}" data-testid="edit-merge">合併到「${esc(shopLabel(st, dup))}」</button>` : "";
    editSheet = `<div class="sheet" data-testid="shop-edit-sheet"><div class="sheet-card">
      <div class="k">${esc(shopLabel(st, editIt))}</div>${body}${mergeBtn}
      <div class="acts"><button type="button" class="btn primary xl" data-edit-save="${editIt.id}" data-testid="edit-save">儲存</button>
      ${editIt.custom ? `<button type="button" class="btn" data-shop-del="${editIt.id}" data-testid="edit-del">刪除</button>` : ""}
      <button type="button" class="btn full" data-edit-close>關閉</button></div></div></div>`;
  }
  return `${editSheet}<section class="card hero">
      <div class="k">每週補貨</div>
      <div class="big">採買清單</div>
    </section>
    <button type="button" class="shop-hint${shop.hintCollapsed ? " collapsed" : ""}" data-toggle-hint data-testid="shop-hint">${shop.hintCollapsed ? "本週存量提示" : esc(hint)}</button>
    ${bars}
    ${wheyWarn}
    <div class="acts">
      <button type="button" class="btn" data-clear-shop>清除勾選</button>
      <button type="button" class="btn shop-plus" data-shop-plus data-testid="shop-plus" aria-label="新增食材">＋</button>
    </div>
    ${chips}
    ${groups}
    ${add}
    <p class="muted shop-legend">點＝已買 · 長按＝家裡有 · ☆＝常買</p>
    ${shareCatsBtn()}`;
}

function renderRules(st) {
  const last = lastInbody();
  return `<section class="card hero">
      <div class="k">減脂喵守則</div>
      <div class="big">規則與目標</div>
      <div class="lab">下背友善、每週至少兩練、吃夠蛋白質。</div>
    </section>
    <p class="sec">設定</p>
    <div class="card">
      <button type="button" class="item" data-toggle-reasons data-testid="toggle-reasons">
        <span class="ck${st && st.hideSuggestReasons ? " on" : ""}">${st && st.hideSuggestReasons ? "✓" : ""}</span>
        <span><b>隱藏建議原因</b><br><span class="muted">課表只說改快版，不寫睡眠或 Body Battery 的原因。提醒只在打開 App 時顯示一張卡片。</span></span>
      </button>
    </div>
    <p class="sec">目標</p>
    <div class="card">
      <div class="stat"><span>體位參考</span><span>${last.weightKg} kg／體脂 ${last.pbf}%／骨骼肌 ${last.smmKg} kg（${fmtMD(last.date)}）</span></div>
      <div class="stat"><span>減脂</span><span>12/31 前減脂 3–4 kg，體脂 15–16%，保肌</span></div>
      <div class="stat"><span>訓練</span><span>週二 A、週五 B，每週 ≥ 2 次</span></div>
      <div class="stat"><span>熱量</span><span>工作日 1900–2000 kcal；訓練日或步數多 2100–2200 kcal。有 Garmin 時依昨天消耗 −450，最低 1800</span></div>
      <div class="stat"><span>蛋白質</span><span>140–160 g</span></div>
    </div>
    <p class="sec">今天怎麼決定課表</p>
    <div class="card prose">
      <p>睡滿 6 小時、心率正常、Body Battery ≥ 30 就練原課表，否則改 25 分鐘快版。Garmin 有重訓也算一堂；錯過就延後，不跳過。熱量只看有吃飯紀錄的日子，用兩週體重平均。</p>
      <p>訓練日建議 16:00 喝兩份樂維根（芝麻／豆漿／杏仁各約 20 g 蛋白，極致約 25 g）加地瓜。一份極致則 18:30 雞胸 150g；兩份 20 g 則雞胸 200g 或 21:00 加蛋 2 顆。</p>
      <p>標示「今天空腹練」，或開始訓練前早餐、午餐、練前餐都沒記錄，就改 25 分鐘快版，而且不追重量。</p>
      <p>回台第一週重量抓上次七成，每組留 3 下。某個動作連續兩次做滿且有餘力，下次提示加 1–2.5 kg。</p>
      <p>當週有部位不到 6 組，週五會自動加一組補強。下背 3 分以上，下次改成較安全的動作。</p>
      <p>換餐時蛋白質可互選：雞胸 200g、蝦仁 150g、吳郭魚排 1 片、雞蛋 3 顆。澱粉可互選：飯 150g、地瓜 150g、酸種麵包 2 片。</p>
    </div>
    <p class="sec">下背：少做</p>
    <ul class="no"><li><span class="bad">少做</span> 傳統硬舉、槓鈴深蹲加重、早安式、彎腰划船</li></ul>
    <p class="sec">下背：改做</p>
    <ul class="no">
      <li><span class="good">改做</span> 高腳杯深蹲、腿推</li>
      <li><span class="good">改做</span> 臀橋、髖推</li>
      <li><span class="good">改做</span> 坐姿划船、胸部支撐划船</li>
      <li><span class="good">改做</span> 死蟲、鳥狗當核心</li>
    </ul>
    <p class="sec">家常輪替（15–20 分）</p>
    ${COOKS.map((c) => `<div class="card"><h3>${esc(c.name)}</h3><p class="muted">${esc(c.time)}</p><p>${esc(c.steps)}</p></div>`).join("")}
    <p class="muted">這是個人備忘小工具，不是醫療建議。下背痛持續請找物理治療或醫師。</p>`;
}


function go(tab) {
  ui.swap = null;
  ui.elseMeal = null;
  location.hash = tab;
  render();
  window.scrollTo(0, 0);
  maybeApplyDeferredUpdate();
}

function buildSteps(st, workout) {
  const back = lastBackScore(st);
  const steps = workout.steps.map((s) => {
    let r = resolveName(s, back);
    const swv = (st.backSwap || {})[moveKey(r.name)];
    const sw = swv && (swv.to || swv);
    if (sw && typeof sw === "string") r = { name: sw, video: r.video, swapped: true };
    return {
      name: r.name,
      dose: s.dose,
      video: r.video || s.video,
      optional: s.optional,
      swapped: r.swapped,
      extra: false,
    };
  });
  if (now().getDay() === 5) {
    for (const ex of fridayExtras(st, steps, now())) {
      const r = resolveName(ex, back);
      steps.push({ name: r.name, dose: ex.dose, video: r.video || ex.video, extra: true, extraFor: ex.extraFor, swapped: r.swapped });
    }
  }
  return steps;
}

function startWorkout() {
  let st = state();
  const noMeal = false;
  const plan = todayPlan(st);
  if (!plan.train || !plan.workout) return;
  if (isReturnWeek(st) && !st.returnUntil) {
    save({ returnUntil: todayKey(addDays(now(), 6)) });
    st = state();
  }
  const session = {
    date: todayKey(),
    startedAt: Date.now(),
    workoutId: plan.id,
    steps: buildSteps(st, plan.workout),
    i: 0,
    setI: 0,
    moves: {},
    phase: "set",
    returning: isReturnWeek(st),
    fasted: markedFasted(st) || noMeal,
    reason: plan.reason,
    backScore: null,
    restUntil: null,
    editWeight: null,
    editTarget: null,
    shortReps: null,
    garmin: null,
  };
  save({ session });
  go("workout");
}

function applySet(short, reps) {
  const st = state();
  const session = { ...st.session, moves: { ...st.session.moves } };
  session.undoStack = [...(session.undoStack || []), JSON.parse(JSON.stringify({
    i: session.i, setI: session.setI, moves: session.moves, phase: "set", restUntil: null, editWeight: session.editWeight, shortReps: null,
  }))];
  const step = session.steps[session.i];
  const load = sessionLoad(session, st);
  const entry = {
    weight: load.noWeight ? null : load.weight,
    reps: short ? Number(reps) : load.target,
    target: load.target,
    done: true,
    short: !!short,
  };
  session.moves[step.name] = [...(session.moves[step.name] || []), entry];
  session.editWeight = load.weight;
  session.shortReps = null;
  const finishedEx = session.setI + 1 >= load.sets;
  const finishedAll = finishedEx && session.i + 1 >= session.steps.length;
  session.swapNote = null;
  if (finishedEx) {
    session.exBackI = session.i;
    session.phase = "exback";
    session.restUntil = null;
  } else {
    session.setI += 1;
    session.phase = "rest";
    session.restUntil = Date.now() + restMs();
  }
  save({ session });
  render();
}

function applyExBack(score) {
  const st = state();
  const session = { ...st.session };
  const idx = session.exBackI != null ? session.exBackI : session.i;
  const step = session.steps[idx];
  const n = Number(score);
  session.exBack = { ...(session.exBack || {}), [step.name]: n };
  const backSwap = { ...(st.backSwap || {}) };
  const key = moveKey(step.name);
  session.swapNote = null;
  if (n >= 3) {
    const to = exSwapTarget(step.name);
    if (to) {
      backSwap[key] = { to, date: session.date };
      session.swapNote = `下次這動作換成 ${to}`;
    } else {
      session.swapNote = "下次這動作減輕重量";
    }
    session.exSwaps = { ...(session.exSwaps || {}), [step.name]: session.swapNote };
  } else {
    delete backSwap[key];
  }
  save({ backSwap });
  if (idx + 1 >= session.steps.length) {
    save({ session });
    const vals = Object.values(session.exBack);
    finishWithScore(Math.max(...vals));
    return;
  }
  session.i = idx + 1;
  session.setI = 0;
  session.editWeight = null;
  session.exBackI = null;
  session.phase = "rest";
  session.restUntil = Date.now() + restMs();
  save({ session });
  render();
}

function finishWithScore(score) {
  const st = state();
  const session = { ...st.session, backScore: Number(score), phase: "done", garmin: matchGarmin(st.session.date) };
  const lastLoads = { ...st.lastLoads };
  const loadHistory = { ...st.loadHistory };
  const suggest = { ...st.suggest };
  for (const [name, sets] of Object.entries(session.moves || {})) {
    const done = (sets || []).filter((s) => s.done);
    if (!done.length) continue;
    const last = done[done.length - 1];
    lastLoads[moveKey(name)] = { weight: last.weight, reps: last.reps, date: session.date, returning: !!session.returning };
  }
  if (!session.fasted) {
    for (const [name, sets] of Object.entries(session.moves || {})) {
      const done = (sets || []).filter((s) => s.done);
      if (!done.length) continue;
      const key = moveKey(name);
      const hitAll = done.every((s) => !s.short && Number(s.reps) >= Number(s.target));
      const arr = [...(loadHistory[key] || []), { date: session.date, hitAll }].slice(-4);
      loadHistory[key] = arr;
      if (arr.length >= 2 && arr[arr.length - 1].hitAll && arr[arr.length - 2].hitAll) {
        suggest[key] = { add: 2.5 };
      } else {
        delete suggest[key];
      }
    }
  }
  const prevLog = (st.logs || {})[session.date];
  const mergedMoves = prevLog && prevLog.finishedAt && prevLog.sessionStart !== session.startedAt
    ? { ...(prevLog.moves || {}), ...session.moves } : session.moves;
  const logs = {
    ...st.logs,
    [session.date]: {
      workoutId: session.workoutId,
      sessionStart: session.startedAt,
      exBack: session.exBack || null,
      moves: mergedMoves,
      backScore: session.backScore,
      reason: session.reason,
      returning: session.returning,
      fasted: !!session.fasted,
      garmin: session.garmin,
      finishedAt: Date.now(),
    },
  };
  save({ session, logs, lastLoads, loadHistory, suggest });
  render();
}

function woNav(dir) {
  const st = state();
  if (!st.session || !["set", "short"].includes(st.session.phase)) return;
  const session = { ...st.session };
  const next = session.i + dir;
  if (next < 0 || next >= session.steps.length) return;
  session.i = next;
  const step = session.steps[next];
  const done = ((session.moves || {})[step.name] || []).filter((s) => s.done).length;
  session.setI = done;
  session.phase = "set";
  session.editWeight = null;
  session.shortReps = null;
  save({ session });
  render();
}

function render() {
  const st = state();
  if (st.tab === "workout" && !st.session) {
    if (location.hash.slice(1) === "workout") location.hash = "today";
    st.tab = "today";
  }
  document.body.classList.toggle("mode-workout", st.tab === "workout");
  document.body.classList.toggle("mode-sleep", st.tab === "sleep");
  document.documentElement.classList.toggle("mode-sleep", st.tab === "sleep");
  const tabHi = st.tab === "body" || st.tab === "workout" || st.tab === "sleep" ? "today" : st.tab;
  document.querySelectorAll("#tabs button").forEach((b) => {
    b.classList.toggle("on", b.dataset.tab === tabHi);
  });
  const main = document.getElementById("main");
  if (!main) return;
  if (ui.swap || ui.elseMeal) main.innerHTML = renderSwap(st);
  else if (st.tab === "shop") main.innerHTML = renderShop(st);
  else if (st.tab === "rules") main.innerHTML = renderRules(st);
  else if (st.tab === "workout") main.innerHTML = renderWorkout(st);
  else if (st.tab === "body") main.innerHTML = renderBody(st);
  else if (st.tab === "sleep") main.innerHTML = renderSleep(st);
  else main.innerHTML = renderHome(st);
  if (ui.shareSheet) main.insertAdjacentHTML("beforeend", renderShareSheet());
  if (st.tab !== "workout") main.insertAdjacentHTML("beforeend", `<p class="app-ver" data-testid="app-version">v${APP_VERSION}</p>`);
}

function tick() {
  const n = now();
  const pad = (x) => String(x).padStart(2, "0");
  const el = document.getElementById("clock");
  if (el) el.textContent = `${n.getMonth() + 1}/${n.getDate()} ${pad(n.getHours())}:${pad(n.getMinutes())}`;
  const s = load().session;
  if (s && s.phase === "rest" && s.restUntil) {
    if (Date.now() >= s.restUntil) {
      try { navigator.vibrate?.(200); } catch (_) {}
      save({ session: { ...s, phase: "set", restUntil: null } });
      if (tabNow() === "workout") render();
    } else {
      const c = document.getElementById("rest-count");
      if (c) c.textContent = String(Math.max(0, Math.ceil((s.restUntil - Date.now()) / 1000)));
    }
  }
}

document.getElementById("tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-tab]");
  if (b) go(b.dataset.tab);
});

document.getElementById("main").addEventListener("click", (e) => {
  const st = state();
  const goBtn = e.target.closest("[data-go]");
  if (goBtn) {
    go(goBtn.dataset.go);
    return;
  }

  const muscleId = muscleIdFromEvent(e);
  if (muscleId) {
    ui.bodyPart = ui.bodyPart === muscleId ? null : muscleId;
    render();
    return;
  }
  if (e.target.closest("[data-share-cats]")) {
    ui.shareSheet = { text: shareCatsText(st), copied: false };
    render();
    return;
  }
  if (e.target.closest("[data-share-copy]")) {
    copyShareText(st).then(() => {
      if (ui.shareSheet) ui.shareSheet.copied = true;
      render();
    });
    return;
  }
  if (e.target.closest("[data-share-close]")) {
    ui.shareSheet = null;
    render();
    return;
  }
  const mealMore = e.target.closest("[data-meal-more]");
  if (mealMore) {
    const id = mealMore.dataset.mealMore;
    ui.mealMore = ui.mealMore === id ? null : id;
    render();
    return;
  }
  const palm = e.target.closest("[data-palm]");
  if (palm) {
    const id = palm.dataset.palm;
    const cur = Number((((st.mealLogs || {})[todayKey()] || {})[id] || {}).palms) || 0;
    patchMeal(st, id, { mode: "portions", palms: Math.max(0, cur + Number(palm.dataset.delta)), outType: undefined });
    render();
    return;
  }
  const fist = e.target.closest("[data-fist]");
  if (fist) {
    const id = fist.dataset.fist;
    const cur = Number((((st.mealLogs || {})[todayKey()] || {})[id] || {}).fists) || 0;
    patchMeal(st, id, { mode: "portions", fists: Math.max(0, cur + Number(fist.dataset.delta)) });
    render();
    return;
  }
  const veg = e.target.closest("[data-veg]");
  if (veg) {
    const id = veg.dataset.veg;
    const cur = !!((((st.mealLogs || {})[todayKey()] || {})[id] || {}).veg);
    patchMeal(st, id, { mode: "portions", veg: !cur });
    render();
    return;
  }
  const whey2 = e.target.closest("[data-whey2]");
  if (whey2) {
    const w = whey2Macros(st);
    const prev = ((st.mealLogs || {})[todayKey()] || {})[whey2.dataset.whey2] || {};
    patchMeal(st, whey2.dataset.whey2, {
      mode: "whey2", eaten: !!prev.eaten, palms: 0, fists: 0, veg: false,
      name: w.name, kcal: w.kcal, protein: w.protein, scoopIds: w.scoopIds,
    });
    render();
    return;
  }
  const outType = e.target.closest("[data-out-type]");
  if (outType) {
    const prev = ((st.mealLogs || {})[todayKey()] || {})[outType.dataset.outType] || {};
    patchMeal(st, outType.dataset.outType, { mode: "out", outType: outType.dataset.oid, outSize: prev.outSize || "normal" });
    render();
    return;
  }
  const outSize = e.target.closest("[data-out-size]");
  if (outSize) {
    const prev = ((st.mealLogs || {})[todayKey()] || {})[outSize.dataset.outSize] || {};
    patchMeal(st, outSize.dataset.outSize, { mode: "out", outType: prev.outType || "bento", outSize: outSize.dataset.sid });
    render();
    return;
  }
  const wheyPack = e.target.closest("[data-whey-pack]");
  if (wheyPack) {
    const shop = persistShopWeek(st);
    save({ wheyPacks: Math.max(0, shop.wheyPacks + Number(wheyPack.dataset.wheyPack)), shopWeek: shop.week });
    render();
    return;
  }
  if (e.target.closest("[data-toggle-hint]")) {
    save({ shopHintCollapsed: !st.shopHintCollapsed });
    render();
    return;
  }
  if (e.target.closest("[data-toggle-reasons]")) {
    save({ hideSuggestReasons: !st.hideSuggestReasons });
    render();
    return;
  }
  if (e.target.closest("[data-toggle-reason]")) {
    ui.showReason = !ui.showReason;
    render();
    return;
  }
  const shopFreq = e.target.closest("[data-shop-frequent]");
  if (shopFreq) {
    const id = shopFreq.dataset.shopFrequent;
    const next = { ...(st.shopFrequent || {}) };
    next[id] = !isShopFrequent(st, shopAllItems(st).find((it) => it.id === id) || { id, frequent: false });
    save({ shopFrequent: next });
    render();
    return;
  }
  const shopEdit = e.target.closest("[data-shop-edit]");
  if (shopEdit) { ui.shopEdit = shopEdit.dataset.shopEdit; render(); return; }
  if (e.target.closest("[data-edit-close]")) { ui.shopEdit = null; render(); return; }
  const merge = e.target.closest("[data-shop-merge]");
  if (merge) {
    const src = shopAllItems(st).find((x) => x.id === merge.dataset.shopMerge);
    const dst = shopAllItems(st).find((x) => x.id === merge.dataset.mergeInto);
    if (src && dst && !shopTryMerge(st, src, dst)) return;
    ui.shopEdit = null;
    render();
    return;
  }
  const editSave = e.target.closest("[data-edit-save]");
  if (editSave) {
    const id = editSave.dataset.editSave;
    const it = shopAllItems(st).find((x) => x.id === id);
    if (it && it.whey) {
      const byId = { ...(((st.wheyEst || {}).byId) || {}) };
      document.querySelectorAll("[data-whey-g]").forEach((el) => { byId[el.dataset.wheyG] = { ...(byId[el.dataset.wheyG] || {}), scoopG: Number(el.value) || 40 }; });
      document.querySelectorAll("[data-whey-p]").forEach((el) => { byId[el.dataset.wheyP] = { ...(byId[el.dataset.wheyP] || {}), protein: Number(el.value) || 0 }; });
      save({ wheyEst: { ...(st.wheyEst || {}), byId } });
    } else if (it) {
      const qty = String((document.querySelector("[data-edit-qty]") || {}).value || "").trim();
      const portion = String((document.querySelector("[data-edit-portion]") || {}).value || "").trim();
      const nameV = String((document.querySelector("[data-edit-name]") || {}).value || "").trim();
      const nV = String((document.querySelector("[data-edit-n]") || {}).value || "").trim();
      const dupT = nameV && shopAllItems(st).find((x) => x.id !== id && !x.whey && x.group === it.group && normName(shopLabel(st, x)) === normName(nameV));
      if (dupT) {
        const srcN = nV !== "" && !Number.isNaN(Number(nV)) ? Number(nV) : null;
        if (!shopTryMerge(st, it, dupT, srcN)) return;
        ui.shopEdit = null;
        render();
        return;
      }
      const shopPortions = { ...(st.shopPortions || {}) };
      if (portion) shopPortions[id] = portion; else delete shopPortions[id];
      const shopNames = { ...(st.shopNames || {}) };
      if (nameV && nameV !== shopSplit(it).label) shopNames[id] = nameV; else delete shopNames[id];
      const patch = { shopPortions, shopNames };
      if (it.custom) {
        const label = shopSplit(it).label;
        patch.shopExtra = (st.shopExtra || []).map((x) => x.id === id ? { ...x, amount: qty, name: shopDisplayName(label, qty) } : x);
      } else {
        const shopQty = { ...(st.shopQty || {}) };
        if (qty && qty !== shopSplit(it).qty) shopQty[id] = qty; else delete shopQty[id];
        patch.shopQty = shopQty;
      }
      save(patch);
      if (nV !== "" && !Number.isNaN(Number(nV))) {
        const s2 = state();
        const l = shopLeft(s2, it);
        if (Number(nV) !== r1(l.n) || l.pending) save(shopSetCountPatch(s2, it, Number(nV)));
      }
    }
    ui.shopEdit = null;
    render();
    return;
  }
  const sr = e.target.closest("[data-sleep-range]");
  if (sr) { ui.sleepRange = sr.dataset.sleepRange; render(); return; }
  const ss = e.target.closest("[data-sleep-step]");
  if (ss) {
    const rows = sleepRows();
    const cur = ui.sleepIdx != null ? ui.sleepIdx : rows.length - 1;
    ui.sleepIdx = Math.min(rows.length - 1, Math.max(0, cur + Number(ss.dataset.sleepStep)));
    render();
    return;
  }
  if (e.target.closest("[data-add-meal]")) {
    const n = now();
    const time = `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
    const day = todayKey();
    const id = "m-" + Date.now();
    const list = ((st.extraMeals || {})[day] || []).concat([{ id, time }]);
    save({ extraMeals: { ...(st.extraMeals || {}), [day]: list } });
    ui.mealMore = id;
    render();
    return;
  }
  const mealDel = e.target.closest("[data-meal-del]");
  if (mealDel) {
    const id = mealDel.dataset.mealDel;
    const day = todayKey();
    const meals = { ...((st.mealLogs || {})[day] || {}) };
    const packs = (st.wheyPacks != null ? Number(st.wheyPacks) : 14) + (meals[id] && meals[id].eaten ? Number(meals[id].wheyUsed) || 0 : 0);
    delete meals[id];
    save({
      extraMeals: { ...(st.extraMeals || {}), [day]: ((st.extraMeals || {})[day] || []).filter((m) => m.id !== id) },
      mealLogs: { ...st.mealLogs, [day]: meals },
      wheyPacks: packs,
    });
    render();
    return;
  }
  const shopDel = e.target.closest("[data-shop-del]");
  if (shopDel) {
    ui.shopEdit = null;
    const id = shopDel.dataset.shopDel;
    save({ shopExtra: (st.shopExtra || []).filter((it) => it.id !== id) });
    render();
    return;
  }
  if (e.target.closest("[data-shop-plus]")) {
    ui.shopAdd = !ui.shopAdd;
    render();
    return;
  }
  const shopCat = e.target.closest("[data-shop-cat]");
  if (shopCat) {
    ui.shopCat = shopCat.dataset.shopCat;
    ui.shopDraftName = (document.querySelector("[data-shop-new-name]") || {}).value || ui.shopDraftName || "";
    ui.shopDraftAmount = (document.querySelector("[data-shop-new-amount]") || {}).value || ui.shopDraftAmount || "";
    render();
    return;
  }
  const shopChip = e.target.closest("[data-shop-chip]");
  if (shopChip) {
    const shop = persistShopWeek(st);
    const id = shopChip.dataset.shopChip;
    save({ shopWeek: shop.week, shopChecked: { ...shop.checked, [id]: !shop.checked[id] } });
    render();
    return;
  }
  if (e.target.closest("[data-shop-add]")) {
    ui.shopDraftName = (document.querySelector("[data-shop-new-name]") || {}).value || "";
    ui.shopDraftAmount = (document.querySelector("[data-shop-new-amount]") || {}).value || "";
    const label = String(ui.shopDraftName || "").trim();
    const amount = String(ui.shopDraftAmount || "").trim();
    const known = matchShopItem(st, label);
    const selGroup = (document.querySelector("[data-shop-new-group]") || {}).value;
    const group = known ? known.group : (ui.shopCat || selGroup || "protein");
    const qty = parseShopQty(amount);
    if (label) {
      const item = {
        id: "x-" + Date.now(),
        group,
        name: shopDisplayName(label, amount),
        hint: "",
        custom: true,
        amount,
        palms: group === "protein" ? qty : 0,
        fists: group === "starch" ? qty : 0,
      };
      save({ shopExtra: (st.shopExtra || []).concat([item]), shopFrequent: { ...(st.shopFrequent || {}), [item.id]: true } });
      ui.shopDraftName = "";
      ui.shopDraftAmount = "";
      ui.shopAdd = false;
    }
    render();
    return;
  }
  const shopItem = e.target.closest("[data-shop]");
  if (shopItem && !e.target.closest("[data-whey-pack]") && !e.target.closest("[data-shop-frequent]") && !e.target.closest("[data-shop-del]") && !e.target.closest("[data-shop-edit]")) {
    if (window.__shopHaveLock) { window.__shopHaveLock = false; return; }
    const shop = persistShopWeek(st);
    const id = shopItem.dataset.shop;
    save({ shopWeek: shop.week, shopChecked: { ...shop.checked, [id]: !shop.checked[id] } });
    render();
    return;
  }

  if (e.target.closest("[data-want-train]")) {
    ui.wantTrain = true;
    render();
    return;
  }
  const restTrain = e.target.closest("[data-rest-train]");
  if (restTrain) {
    const pick = restTrain.getAttribute("data-rest-train") || restTrain.dataset.restTrain;
    if (pick && typeof WORKOUTS !== "undefined" && WORKOUTS[pick]) {
      const next = { ...((load().restTrain) || {}) };
      next[todayKey()] = pick;
      save({ restTrain: next });
      ui.wantTrain = false;
      const tl = (load().logs || {})[todayKey()];
      if (tl && tl.finishedAt) { startWorkout(); return; }
    }
    render();
    return;
  }
  if (e.target.closest("[data-start]")) {
    startWorkout();
    return;
  }
  const ov = e.target.closest("[data-override]");
  if (ov) {
    const override = { ...(st.override || {}) };
    const key = todayKey();
    if (ov.dataset.override === "auto") delete override[key];
    else override[key] = ov.dataset.override;
    save({ override });
    render();
    return;
  }
  const eat = e.target.closest("[data-eat]");
  if (eat) {
    const id = eat.dataset.eat;
    const day = todayKey();
    const meals = { ...((st.mealLogs || {})[day] || {}) };
    let packs = st.wheyPacks != null ? Number(st.wheyPacks) : 14;
    let shopUsed = { ...(st.shopUsed || {}) };
    if (meals[id] && meals[id].eaten) {
      packs += Number(meals[id].wheyUsed) || 0;
      for (const [k, n] of Object.entries(meals[id].pantryUsed || {})) shopUsed[k] = Math.max(0, (shopUsed[k] || 0) - n);
      const keep = meals[id].mode ? { ...meals[id] } : {};
      if (keep.mode === "else") { keep.pantryPlan = keep.pantryUsed || {}; keep.wheyPlan = Number(keep.wheyUsed) || 0; }
      delete keep.wheyUsed; delete keep.pantryUsed;
      meals[id] = { ...keep, eaten: false };
    } else {
      const prevM = meals[id] || {};
      if (prevM.mode === "else") {
        const pantryUsed = { ...(prevM.pantryPlan || {}) };
        for (const [k, n] of Object.entries(pantryUsed)) shopUsed[k] = (shopUsed[k] || 0) + n;
        const wu = Number(prevM.wheyPlan) || 0;
        packs = Math.max(0, packs - wu);
        const m2 = { ...prevM, eaten: true, pantryUsed, wheyUsed: wu };
        delete m2.pantryPlan; delete m2.wheyPlan;
        meals[id] = m2;
      } else {
      const est = mealEstimate(st, id);
      const used = Array.isArray(est.scoopIds) ? est.scoopIds.length : 0;
      packs = Math.max(0, packs - used);
      meals[id] = { ...(meals[id] || {}), ...est, eaten: true, wheyUsed: used };
      }
    }
    save({ mealLogs: { ...st.mealLogs, [day]: meals }, wheyPacks: packs, shopUsed });
    render();
    return;
  }
  const sw = e.target.closest("[data-swap]");
  if (sw) {
    openSwap(st, sw.dataset.swap);
    render();
    window.scrollTo(0, 0);
    return;
  }
  const scoopPick = e.target.closest("[data-scoop-slot]");
  if (scoopPick) {
    const slot = Number(scoopPick.dataset.scoopSlot);
    const id = scoopPick.dataset.scoopId;
    const cur = selectedScoops(st);
    cur[slot] = id;
    save({ scoopPick: { ...(st.scoopPick || {}), [todayKey()]: cur } });
    render();
    return;
  }
  const eatElse = e.target.closest("[data-eat-else]");
  if (eatElse) {
    ui.elseMeal = eatElse.dataset.eatElse;
    ui.elseSel = {}; ui.elseOut = null; ui.elseOutSize = null; ui.elseFree = []; ui.elseFreeOpen = false;
    ui.swap = null;
    render();
    window.scrollTo(0, 0);
    return;
  }
  const eInc = e.target.closest("[data-else-inc]");
  const eDec = e.target.closest("[data-else-dec]");
  if ((eInc || eDec) && ui.elseMeal) {
    const k = (eInc || eDec).dataset[eInc ? "elseInc" : "elseDec"];
    const sel = { ...(ui.elseSel || {}) };
    sel[k] = Math.max(0, (Number(sel[k]) || 0) + (eInc ? 1 : -1));
    ui.elseSel = sel; render(); return;
  }
  const eOut = e.target.closest("[data-else-out]");
  if (eOut && ui.elseMeal) { ui.elseOut = ui.elseOut === eOut.dataset.elseOut ? null : eOut.dataset.elseOut; render(); return; }
  const eSize = e.target.closest("[data-else-size]");
  if (eSize && ui.elseMeal) { ui.elseOutSize = eSize.dataset.elseSize; render(); return; }
  if (e.target.closest("[data-else-free-open]")) { ui.elseFreeOpen = true; render(); return; }
  if (e.target.closest("[data-else-free-add]")) {
    const nm = String((document.querySelector("[data-else-free-name]") || {}).value || "").trim();
    const kc = Number((document.querySelector("[data-else-free-kcal]") || {}).value) || 0;
    const pr = Number((document.querySelector("[data-else-free-protein]") || {}).value) || 0;
    if (nm || kc || pr) ui.elseFree = (ui.elseFree || []).concat([{ name: nm || "其他", kcal: kc, protein: pr }]);
    ui.elseFreeOpen = false; render(); return;
  }
  const eFreeDel = e.target.closest("[data-else-free-del]");
  if (eFreeDel) { ui.elseFree = (ui.elseFree || []).filter((_, i) => i !== Number(eFreeDel.dataset.elseFreeDel)); render(); return; }
  if (e.target.closest("[data-else-save]") && ui.elseMeal) {
    const tot = elseTotals(st);
    const day = todayKey();
    const meals = { ...((st.mealLogs || {})[day] || {}) };
    const prev = meals[ui.elseMeal] || {};
    let packs = (st.wheyPacks != null ? Number(st.wheyPacks) : 14) + (prev.eaten ? Number(prev.wheyUsed) || 0 : 0);
    const shopUsed = { ...(st.shopUsed || {}) };
    for (const [k, n] of Object.entries(prev.eaten ? prev.pantryUsed || {} : {})) shopUsed[k] = Math.max(0, (shopUsed[k] || 0) - n);
    const pantryUsed = {};
    let wheyUsed = 0;
    for (const [k, n0] of Object.entries(ui.elseSel || {})) {
      const n = Number(n0) || 0;
      if (!n) continue;
      if (k.startsWith("whey:")) { wheyUsed += n; continue; }
      pantryUsed[k] = n;
      shopUsed[k] = (shopUsed[k] || 0) + n;
    }
    packs = Math.max(0, packs - wheyUsed);
    meals[ui.elseMeal] = { mode: "else", name: tot.name, kcal: tot.kcal, protein: tot.protein, eaten: true, pantryUsed, wheyUsed };
    save({ mealLogs: { ...st.mealLogs, [day]: meals }, shopUsed, wheyPacks: packs });
    ui.elseMeal = null; ui.elseSel = {}; ui.elseOut = null; ui.elseOutSize = null; ui.elseFree = []; ui.elseFreeOpen = false;
    go("today");
    return;
  }
  const elsePick = e.target.closest("[data-else-pick]");
  if (elsePick && ui.elseMeal) {
    const item = (BENTO_ELSE || []).find((x) => x.id === elsePick.dataset.elsePick);
    if (item) {
      const day = todayKey();
      const meals = { ...((st.mealLogs || {})[day] || {}) };
      meals[ui.elseMeal] = { name: item.name, kcal: item.kcal, protein: item.protein, id: item.id, eaten: true, advice: item.advice };
      save({ mealLogs: { ...st.mealLogs, [day]: meals }, lastAdvice: item.advice || "下一餐照計劃吃即可。" });
    }
    ui.elseMeal = null;
    go("today");
    return;
  }
  const dinnerAlt = e.target.closest("[data-dinner-alt]");
  if (dinnerAlt) {
    save({ dinnerAlt: { ...(st.dinnerAlt || {}), [todayKey()]: dinnerAlt.dataset.dinnerAlt } });
    render();
    return;
  }
  if (e.target.closest("[data-undo-set]") && st.session) {
    const stack = st.session.undoStack || [];
    if (stack.length) {
      const prev = stack[stack.length - 1];
      save({ session: { ...st.session, ...prev, undoStack: stack.slice(0, -1) } });
      render();
    }
    return;
  }
  const pickP = e.target.closest("[data-pick-p]");
  if (pickP && ui.swap) {
    ui.swap = { ...ui.swap, mode: "groups", proteinId: pickP.dataset.pickP };
    render();
    return;
  }
  const pickS = e.target.closest("[data-pick-s]");
  if (pickS && ui.swap) {
    ui.swap = { ...ui.swap, mode: "groups", starchId: pickS.dataset.pickS };
    render();
    return;
  }
  if (e.target.closest("[data-mode-whey]") && ui.swap) {
    ui.swap = { ...ui.swap, mode: "whey" };
    render();
    return;
  }
  const scoop = e.target.closest("[data-scoop]");
  if (scoop && ui.swap) {
    ui.swap = { ...ui.swap, scoops: Math.max(1, (Number(ui.swap.scoops) || 1) + Number(scoop.dataset.scoop)) };
    render();
    return;
  }
  if (e.target.closest("[data-edit-est]") && ui.swap) {
    ui.swap = { ...ui.swap, editEst: true };
    render();
    return;
  }
  const est = e.target.closest("[data-est]");
  if (est) {
    const field = est.dataset.est;
    const cur = wheySettings(st);
    const next = { ...cur, [field]: Math.max(1, Number(cur[field]) + Number(est.dataset.edelta)) };
    save({ wheyEst: next });
    render();
    return;
  }
  if (e.target.closest("[data-apply-swap]") && ui.swap) {
    const preview = ui.swap.mode === "whey"
      ? twoScoopMeal(st)
      : composeSwapMeal(ui.swap.proteinId, ui.swap.starchId);
    const day = todayKey();
    const meals = { ...((st.mealLogs || {})[day] || {}) };
    meals[ui.swap.meal] = { ...preview, eaten: true };
    save({ mealLogs: { ...st.mealLogs, [day]: meals } });
    ui.swap = null;
    go("today");
    return;
  }
  const fastedBtn = e.target.closest("[data-fasted]");
  if (fastedBtn) {
    const fasted = { ...(st.fasted || {}) };
    const key = todayKey();
    if (fastedBtn.dataset.fasted === "off") delete fasted[key];
    else fasted[key] = true;
    save({ fasted });
    render();
    return;
  }
  const wdelta = e.target.closest("[data-wdelta]");
  if (wdelta && st.session) {
    const load = sessionLoad(st.session, st);
    const cur = load.weight != null ? Number(load.weight) : startKgFor(st.session.steps[st.session.i].name);
    const next = Math.max(0, Math.round((cur + Number(wdelta.dataset.wdelta)) * 2) / 2);
    save({ session: { ...st.session, editWeight: next } });
    render();
    return;
  }
  const rdelta = e.target.closest("[data-rdelta]");
  if (rdelta && st.session) {
    const load = sessionLoad(st.session, st);
    const cur = st.session.shortReps != null ? Number(st.session.shortReps) : Math.max(1, load.target - 2);
    save({ session: { ...st.session, shortReps: Math.max(1, cur + Number(rdelta.dataset.rdelta)) } });
    render();
    return;
  }
  if (e.target.closest("[data-complete]")) {
    applySet(false);
    return;
  }
  if (e.target.closest("[data-short]")) {
    const load = sessionLoad(st.session, st);
    save({ session: { ...st.session, phase: "short", shortReps: Math.max(1, load.target - 2) } });
    render();
    return;
  }
  if (e.target.closest("[data-short-save]")) {
    applySet(true, st.session.shortReps);
    return;
  }
  if (e.target.closest("[data-skip-rest]")) {
    save({ session: { ...st.session, phase: "set", restUntil: null } });
    render();
    return;
  }
  const exb = e.target.closest("[data-exback]");
  if (exb) {
    applyExBack(exb.dataset.exback);
    return;
  }
  const back = e.target.closest("[data-back]");
  if (back) {
    finishWithScore(back.dataset.back);
    return;
  }
  if (e.target.closest("[data-finish-home]")) {
    save({ session: null });
    go("today");
    maybeApplyDeferredUpdate();
    return;
  }
  if (e.target.closest("[data-leave]")) {
    go("today");
    return;
  }
  if (e.target.closest("[data-wonext]")) {
    woNav(1);
    return;
  }
  if (e.target.closest("[data-woprev]")) {
    woNav(-1);
    return;
  }
  const dismiss = e.target.closest("[data-dismiss-notif]");
  if (dismiss) {
    const key = todayKey();
    const list = new Set((st.notifs || {})[key] || []);
    list.add(dismiss.dataset.dismissNotif);
    save({ notifs: { ...st.notifs, [key]: [...list] } });
    render();
    return;
  }
  const g = e.target.closest("[data-g]");
  if (g) {
    save({ grocery: { ...st.grocery, [g.dataset.g]: !st.grocery[g.dataset.g] } });
    render();
    return;
  }
  if (e.target.closest("[data-clear-shop]")) {
    const shop = persistShopWeek(st);
    save({ grocery: {}, shopChecked: {}, shopWeek: shop.week });
    render();
  }
});


document.getElementById("main").addEventListener("input", (e) => {
  if (e.target.matches("[data-shop-new-name]")) {
    ui.shopDraftName = e.target.value;
    const known = matchShopItem(state(), e.target.value);
    const cats = document.querySelector("[data-testid=shop-cats]");
    if (cats) cats.hidden = !!known;
  }
  if (e.target.matches("[data-shop-new-amount]")) ui.shopDraftAmount = e.target.value;
  if (e.target.matches("[data-shop-new-group]")) ui.shopCat = e.target.value;
});

(function setupLogLongPress() {
  const main = document.getElementById("main");
  let timer = null;
  const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
  main.addEventListener("pointerdown", (e) => {
    const row = e.target.closest("[data-log-row]");
    if (!row) return;
    timer = setTimeout(() => {
      timer = null;
      const d = row.dataset.logRow;
      if (window.confirm(`刪除 ${fmtMD(d)} 這筆訓練？`)) deleteLog(d);
    }, 600);
  });
  main.addEventListener("pointerup", clear);
  main.addEventListener("pointercancel", clear);
  main.addEventListener("pointermove", (e) => { if (Math.abs(e.movementY) > 6) clear(); });
})();
window.__fatmiDeleteLog = deleteLog;

(function setupShopLongPress() {
  const main = document.getElementById("main");
  let timer = null;
  let fired = false;
  const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
  main.addEventListener("pointerdown", (e) => {
    const item = e.target.closest("[data-shop]");
    if (!item || e.target.closest("[data-whey-pack],[data-shop-frequent],[data-shop-del],[data-shop-edit],[data-shop-add],[data-shop-plus],[data-shop-chip],[data-shop-cat],input,select,button")) return;
    fired = false;
    timer = setTimeout(() => {
      fired = true;
      window.__shopHaveLock = true;
      const st = state();
      const shop = persistShopWeek(st);
      const id = item.dataset.shop;
      save({ shopWeek: shop.week, shopHave: { ...shop.have, [id]: !shop.have[id] } });
      render();
    }, 550);
  });
  main.addEventListener("pointerup", clear);
  main.addEventListener("pointercancel", clear);
  main.addEventListener("pointerleave", (e) => {
    if (e.target && e.target.closest && e.target.closest("[data-shop]")) clear();
  }, true);
})();


let touchX = null;
document.getElementById("main").addEventListener("touchstart", (e) => {
  if (e.target.closest("button,a,input")) {
    touchX = null;
    return;
  }
  touchX = e.changedTouches[0].clientX;
}, { passive: true });
document.getElementById("main").addEventListener("touchend", (e) => {
  if (touchX == null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  touchX = null;
  if (Math.abs(dx) < 60) return;
  if (tabNow() !== "workout") return;
  woNav(dx < 0 ? 1 : -1);
}, { passive: true });

window.addEventListener("hashchange", () => {
  ui.swap = null;
  ui.elseMeal = null;
  render();
});


const ASSETS = ["./", "./index.html", "./app.js", "./app.css", "./data.js", "./data.json", "./body-svg.js", "./version.json", "./sw.js", "./manifest.webmanifest", "./icon-180.png", "./icon-512.png"];
let loadedVersion = null;
const APP_VERSION = "2026.11.07-preview-17";
const CACHE_PREFIX = /\/preview\//.test(location.pathname) ? "fatcat-preview-" : "fatcat-2-";
let pendingReload = false;
let reloading = false;

function showToast(msg) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { el.hidden = true; }, 2800);
}
function isBusy() {
  if (ui.swap || ui.elseMeal) return true;
  const s = load().session;
  if (s && ["set", "rest", "short", "back"].includes(s.phase)) return true;
  const el = document.activeElement;
  if (el && /INPUT|TEXTAREA|SELECT/.test(el.tagName)) return true;
  return false;
}
function safeReload() {
  if (reloading) return;
  reloading = true;
  location.reload();
}
async function activateWaitingSW() {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;
  try { await reg.update(); } catch (_) {}
  const w = reg.waiting || reg.installing;
  if (w) w.postMessage({ type: "SKIP_WAITING" });
  navigator.serviceWorker.controller?.postMessage({ type: "SKIP_WAITING" });
}
async function fetchNoStore(url) {
  return fetch(url, { cache: "no-store" });
}
async function hardRefresh() {
  showToast("重新整理中…");
  await Promise.all(ASSETS.map((u) => fetchNoStore(u).catch(() => null)));
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => String(k).startsWith(CACHE_PREFIX)).map((k) => caches.delete(k)));
  } catch (_) {}
  await activateWaitingSW();
  safeReload();
}
async function checkUpdates(opts) {
  const force = !!(opts && opts.force);
  try {
    const [vr, dr] = await Promise.all([
      fetchNoStore("./version.json").catch(() => null),
      fetchNoStore("./data.json").catch(() => null),
    ]);
    if (dr && dr.ok) {
      const data = await dr.json();
      if (data && data.exportedAt && data.exportedAt !== LIVE.exportedAt) {
        LIVE = data;
        try { localStorage.setItem("fatcat-live", JSON.stringify(LIVE)); } catch (_) {}
        if (!isBusy() || force) render();
      }
    }
    if (vr && vr.ok) {
      const ver = await vr.json();
      if (ver && ver.version && loadedVersion && ver.version !== loadedVersion) {
        if (force || !isBusy()) {
          await activateWaitingSW();
          safeReload();
        } else {
          pendingReload = true;
          showToast("已更新");
        }
      }
    }
  } catch (_) {}
}
function maybeApplyDeferredUpdate() {
  if (pendingReload && !isBusy()) {
    pendingReload = false;
    activateWaitingSW().then(() => safeReload());
  }
}

let ptrY = null;
window.addEventListener("touchstart", (e) => {
  if (window.scrollY > 2) { ptrY = null; return; }
  ptrY = e.touches[0].clientY;
}, { passive: true });
window.addEventListener("touchmove", (e) => {
  if (ptrY == null) return;
  const dy = e.touches[0].clientY - ptrY;
  let bar = document.getElementById("ptr");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "ptr";
    bar.textContent = "放開以重新整理全部";
    document.body.appendChild(bar);
  }
  bar.classList.toggle("on", dy > 56);
}, { passive: true });
window.addEventListener("touchend", (e) => {
  if (ptrY == null) return;
  const dy = e.changedTouches[0].clientY - ptrY;
  ptrY = null;
  const bar = document.getElementById("ptr");
  if (bar) bar.classList.remove("on");
  if (dy > 80) hardRefresh();
}, { passive: true });

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") checkUpdates();
});
setInterval(() => {
  if (document.visibilityState === "visible") checkUpdates();
}, 10 * 60 * 1000);

if (navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!navigator.serviceWorker.__hadController) return;
    if (!isBusy()) safeReload();
    else pendingReload = true;
  });
  navigator.serviceWorker.__hadController = !!navigator.serviceWorker.controller;
}

if (navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data && e.data.type === "SW_UPDATED") {
      if (!isBusy()) safeReload(); else pendingReload = true;
    }
  });
}
window.__fatmiHardRefresh = hardRefresh;
window.__fatmiCheckUpdates = checkUpdates;

function migrateGrocery() {
  try {
    const s = load();
    if (s.groceryMigrated) return;
    const map = { chicken: "chicken", eggs: "eggs", whey: "whey", carb: "rice", fish: "seafood" };
    const g = s.grocery || {};
    const shopChecked = { ...(s.shopChecked || {}) };
    for (const [k, v] of Object.entries(g)) if (v && map[k] && shopChecked[map[k]] == null) shopChecked[map[k]] = true;
    save({ shopChecked, groceryMigrated: true });
  } catch (_) {}
}
async function boot() {
  if (DEMO) { const h = document.querySelector(".ttl"); if (h) h.parentElement.insertAdjacentHTML("afterend", `<span class="demo-tag" data-testid="demo-tag">示範舊資料（不影響你的資料）</span>`); }
  migrateGrocery();
  try {
    const v = await fetch("./version.json", { cache: "no-store" });
    if (v.ok) {
      const ver = await v.json();
      loadedVersion = ver && ver.version;
      if (loadedVersion && loadedVersion !== APP_VERSION) {
        const k = "fatmi-ver-fix";
        if (sessionStorage.getItem(k) !== loadedVersion) {
          sessionStorage.setItem(k, loadedVersion);
          if (!isBusy()) { hardRefresh(); return; }
          pendingReload = true;
        }
      }
    }
  } catch (_) {}
  try {
    const r = await fetch("./data.json", { cache: "no-store" });
    if (r.ok) {
      LIVE = await r.json();
      try {
        localStorage.setItem("fatcat-live", JSON.stringify(LIVE));
      } catch (_) {}
    }
  } catch (_) {}
  if (!(LIVE.inbody || []).length) {
    try {
      const c = localStorage.getItem("fatcat-live");
      if (c) LIVE = JSON.parse(c);
    } catch (_) {}
  }
  tick();
  render();
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
}
tick();
setInterval(tick, 500);
boot();

document.getElementById("main").addEventListener("change", (e) => {
  const el = e.target.closest && e.target.closest("[data-meal-time]");
  if (!el || !el.value) return;
  const st = state();
  const id = el.dataset.mealTime;
  if (isExtraMeal(id)) {
    const day = todayKey();
    const list = ((st.extraMeals || {})[day] || []).map((m) => m.id === id ? { ...m, time: el.value } : m);
    save({ extraMeals: { ...(st.extraMeals || {}), [day]: list } });
  } else {
    save({ mealTimes: { ...(st.mealTimes || {}), [id]: el.value } });
  }
  render();
});
