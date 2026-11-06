const STORE = "fatcat-v2";
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
let ui = { swap: null };

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
  return ["today", "shop", "rules", "workout", "body"].includes(t) ? t : "today";
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
function pickScheduled(st, d = now()) {
  const days = (st.trainDays || DEFAULT_DAYS).slice().sort((a, b) => a - b);
  const pos = days.indexOf(d.getDay());
  if (pos <= 0) return "gymA";
  return pos % 2 === 0 ? "gymA" : "gymB";
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
function shouldQuick(d = now()) {
  const sleep = lastNightSleep(d);
  const rhr = rhrOn(d);
  const avg = rhrAvg7(d);
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
  if (!reasons.length) {
    if (sleep != null) reasons.push(`${sleepText(sleep)}，心率正常`);
    else reasons.push("還沒有昨晚的睡眠資料，先照課表");
  }
  return { quick, reasons, sleep, rhr, avg };
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
  const alt = ((st.dinnerAlt || {})[todayKey(d)]) === "eggs21";
  const grams = shake.hasPlant || alt ? 150 : 200;
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
function mealLabel(id, trainDay, st) {
  if (id === "snack" && trainDay) return "16:00";
  if (id === "dinner" && trainDay) return `18:30 雞胸 ${(st ? dinnerFor(st).chickenG : 200)}g`;
  if (id === "eggs21") return "21:00";
  return (MEAL_DEFS[id] && MEAL_DEFS[id].label) || id;
}
function todayPlan(st, d = now()) {
  const train = isTrainDay(st, d);
  const scheduled = pickScheduled(st, d);
  const chk = shouldQuick(d);
  const ov = (st.override || {})[todayKey(d)];
  const fasted = markedFasted(st, d);
  if (!train) {
    return {
      train: false, id: null, scheduled, workout: null,
      reason: "休息日，走走路就好", collapsed: true, chk, canOverride: false, fasted: false,
    };
  }
  let wantQuick = chk.quick || fasted;
  if (ov === "original") wantQuick = false;
  if (ov === "quick") wantQuick = true;
  const id = wantQuick ? "quick" : scheduled;
  let reason = chk.reasons[0];
  if (fasted && wantQuick) {
    reason = chk.quick ? `空腹練，改 25 分鐘快版，不追重量（${chk.reasons[0]}）` : "空腹練，改 25 分鐘快版，不追重量";
  } else if (fasted) {
    reason = `${chk.reasons[0]}。空腹不追重量`;
  }
  return {
    train: true, id, scheduled, workout: WORKOUTS[id],
    reason, chk, wantQuick, fasted,
    canOverride: wantQuick && id === "quick",
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
function computeKcalAdjust(d = now()) {
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
  const avgIn = (from, to) => {
    const xs = scans.filter((s) => {
      const days = (d - parseISO(s.date)) / 86400000;
      return days >= from && days < to && s.weightKg != null;
    });
    if (!xs.length) return null;
    return xs.reduce((a, s) => a + Number(s.weightKg), 0) / xs.length;
  };
  const w0 = avgIn(0, 7);
  const w1 = avgIn(7, 14);
  const w2 = avgIn(14, 21);
  if (w0 != null && w1 != null && w2 != null && Math.abs(w0 - w1) < 0.2 && Math.abs(w1 - w2) < 0.2 && w0 >= w2 - 0.15) {
    return { adj: -125, note: "兩週體重 7 日平均幾乎沒降，目標再減 125 kcal" };
  }
  return { adj: 0, note: null };
}
function kcalInfo(st, d = now()) {
  const trainLike = isTrainDay(st, d) || isHighStep(d);
  const y = dailyOn(todayKey(addDays(d, -1)));
  const adj = computeKcalAdjust(d);
  let target;
  let source;
  if (y && y.kcal) {
    target = Math.max(KCAL_FLOOR, Math.round(Number(y.kcal) - 450));
    source = `昨天消耗 ${Math.round(y.kcal)} kcal − 450`;
  } else {
    target = trainLike ? 2150 : 1950;
    source = trainLike ? "還沒有昨天的消耗，訓練日或步數多先抓 2100–2200" : "還沒有昨天的消耗，工作日先抓 1900–2000";
  }
  if (adj.adj) target = Math.max(KCAL_FLOOR, target + adj.adj);
  const sleep = lastNightSleep(d);
  return {
    target,
    source,
    adj,
    trainLike,
    band: trainLike ? "2100–2200" : "1900–2000",
    bandLabel: trainLike ? "訓練日或步數多 2100–2200 kcal" : "工作日 1900–2000 kcal",
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
  const trainLike = isTrainDay(st, d);
  if (id === "snack" && trainLike) return { ...twoScoopMeal(st, d), eaten: false };
  if (id === "dinner" && trainLike) return { ...dinnerFor(st, d), eaten: false };
  if (id === "eggs21") {
    if (((st.dinnerAlt || {})[todayKey(d)]) === "eggs21") {
      return { name: "21:00 雞蛋 2 顆", kcal: 140, protein: 12, id: "eggs2", eaten: false };
    }
    return { name: "", kcal: 0, protein: 0, eaten: false, hidden: true };
  }
  const base = mealOf(MEAL_DEFS[id], trainLike);
  return { ...base, id: "default", eaten: false };
}
function mealTotals(st, d = now()) {
  let kcal = 0;
  let protein = 0;
  const ids = MEAL_ORDER.concat(["eggs21"]);
  for (const id of ids) {
    const m = ((st.mealLogs || {})[todayKey(d)] || {})[id];
    if (m && m.eaten) {
      kcal += Number(m.kcal) || 0;
      protein += Number(m.protein) || 0;
    }
  }
  return { kcal, protein };
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
    const sc = st.logs[dates[i]].backScore;
    if (sc != null) return Number(sc);
  }
  return 0;
}
function resolveName(step, backScore) {
  const raw = String(step.name || "").replace(/（選做）/g, "").trim();
  const pick = (name, video, swapped) => ({ name, video, swapped: !!swapped });
  if (!raw.includes("或")) {
    if (backScore >= 3 && /深蹲/.test(raw)) return pick("腿推", "legpress", true);
    return pick(raw, step.video, false);
  }
  const parts = raw.split("或").map((s) => s.trim());
  if (backScore >= 3) {
    const lp = parts.find((p) => p.includes("腿推"));
    if (lp) return pick(lp, "legpress", parts[0] !== lp);
    if (parts.some((p) => /深蹲/.test(p))) return pick("腿推", "legpress", true);
  }
  return pick(parts[0], step.video, false);
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
function weekSetCounts(st, d = now(), opts = {}) {
  const { mon } = weekRange(d);
  const today = todayKey(d);
  const counts = {};
  for (let i = 0; i < 7; i++) {
    const key = todayKey(addDays(mon, i));
    if (opts.excludeToday && key === today) continue;
    const log = (st.logs || {})[key];
    if (!log) continue;
    const part = countMoves(log.moves);
    for (const [k, v] of Object.entries(part)) counts[k] = (counts[k] || 0) + v;
  }
  if (opts.includeSession && st.session && st.session.date === today) {
    const part = countMoves(st.session.moves);
    for (const [k, v] of Object.entries(part)) counts[k] = (counts[k] || 0) + v;
  }
  return counts;
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

function fillFor(svgPart, pri, sec) {
  if (pri.has(svgPart)) return "#9A3412";
  if (svgPart === "frontDelts" && pri.has("delts")) return "#9A3412";
  if (svgPart === "rearDelts" && pri.has("delts")) return "#9A3412";
  if (pri.has("rotator") && svgPart === "rearDelts") return "#9A3412";
  if (sec.has(svgPart)) return "#F0B27A";
  if (svgPart === "frontDelts" && sec.has("delts")) return "#F0B27A";
  if (svgPart === "rearDelts" && (sec.has("delts") || sec.has("rotator"))) return "#F0B27A";
  return "#E8D7C0";
}
function strokeFor(svgPart, week) {
  const mapped = svgPart === "frontDelts" || svgPart === "rearDelts" ? "delts" : svgPart;
  if (MAIN_PARTS.includes(mapped) && (week[mapped] || 0) < 6) return "#EA580C";
  if (MAIN_PARTS.includes(svgPart) && (week[svgPart] || 0) < 6) return "#EA580C";
  return "none";
}
function bodyMap(priList, secList, weekCounts) {
  const pri = new Set(priList || []);
  const sec = new Set(secList || []);
  const week = weekCounts || {};
  const p = (id, d) => {
    const f = fillFor(id, pri, sec);
    const s = strokeFor(id, week);
    const sw = s === "none" ? 0 : 2.2;
    return `data-part="${id}" fill="${f}" stroke="${s}" stroke-width="${sw}" d="${d}"`;
  };
  const e = (id, attrs) => {
    const f = fillFor(id, pri, sec);
    const s = strokeFor(id, week);
    const sw = s === "none" ? 0 : 2.2;
    return `${attrs} data-part="${id}" fill="${f}" stroke="${s}" stroke-width="${sw}"`;
  };
  return `<div class="body-wrap">
    <div class="legend"><span><i class="p"></i>主要</span><span><i class="s"></i>輔助</span><span>不到 6 組會標橘色</span></div>
    <svg class="body-svg" viewBox="0 0 420 360" role="img" aria-label="人體正面與背面部位圖">
      <text x="100" y="18" text-anchor="middle" fill="#5C4A36" font-size="14" font-weight="700">正面</text>
      <text x="320" y="18" text-anchor="middle" fill="#5C4A36" font-size="14" font-weight="700">背面</text>
      <circle cx="100" cy="48" r="20" fill="#F3E2C8"/>
      <rect x="92" y="66" width="16" height="12" rx="4" fill="#F3E2C8"/>
      <ellipse ${e("frontDelts", 'cx="68" cy="92" rx="20" ry="15"')}/>
      <ellipse ${e("frontDelts", 'cx="132" cy="92" rx="20" ry="15"')}/>
      <path ${p("chest", "M78 86h20c4 0 7 3 7 8v22c0 6-4 11-10 11h-8c-5 0-9-5-9-12V94c0-5 3-8 8-8z")}/>
      <path ${p("chest", "M102 86h20c5 0 8 3 8 8v21c0 7-4 12-9 12h-8c-6 0-10-5-10-11V94c0-5 3-8 7-8z")}/>
      <rect ${e("bis", 'x="44" y="98" width="18" height="42" rx="9"')}/>
      <rect ${e("bis", 'x="138" y="98" width="18" height="42" rx="9"')}/>
      <rect ${e("core", 'x="82" y="126" width="36" height="54" rx="10"')}/>
      <rect ${e("quads", 'x="74" y="198" width="24" height="78" rx="12"')}/>
      <rect ${e("quads", 'x="102" y="198" width="24" height="78" rx="12"')}/>
      <rect x="76" y="278" width="20" height="48" rx="9" fill="#EDE0CC"/>
      <rect x="104" y="278" width="20" height="48" rx="9" fill="#EDE0CC"/>
      <circle cx="320" cy="48" r="20" fill="#F3E2C8"/>
      <rect x="312" y="66" width="16" height="12" rx="4" fill="#F3E2C8"/>
      <ellipse ${e("rearDelts", 'cx="288" cy="92" rx="20" ry="15"')}/>
      <ellipse ${e("rearDelts", 'cx="352" cy="92" rx="20" ry="15"')}/>
      <rect ${e("upperback", 'x="298" y="78" width="44" height="24" rx="8"')}/>
      <path ${p("lats", "M276 104h22c3 8 4 22 3 38-1 8-6 14-14 14h-8c-5 0-7-6-6-14 2-16 2-30 3-38z")}/>
      <path ${p("lats", "M344 104h22c1 8 1 22 3 38 1 8-1 14-6 14h-8c-8 0-13-6-14-14-1-16 0-30 3-38z")}/>
      <rect ${e("midback", 'x="304" y="104" width="32" height="30" rx="8"')}/>
      <rect ${e("lowback", 'x="306" y="136" width="28" height="22" rx="7"')}/>
      <rect ${e("tris", 'x="264" y="98" width="18" height="42" rx="9"')}/>
      <rect ${e("tris", 'x="358" y="98" width="18" height="42" rx="9"')}/>
      <rect ${e("glutes", 'x="294" y="176" width="24" height="30" rx="10"')}/>
      <rect ${e("glutes", 'x="322" y="176" width="24" height="30" rx="10"')}/>
      <rect ${e("hams", 'x="294" y="208" width="24" height="70" rx="12"')}/>
      <rect ${e("hams", 'x="322" y="208" width="24" height="70" rx="12"')}/>
      <rect x="296" y="280" width="20" height="48" rx="9" fill="#EDE0CC"/>
      <rect x="324" y="280" width="20" height="48" rx="9" fill="#EDE0CC"/>
    </svg>
  </div>`;
}

function yt(key) {
  const v = VIDEOS[key];
  if (!v) return "";
  return `<a class="yt" href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">▶ ${esc(v.label)}</a>`;
}
function cueFor(name) {
  if (/腿推/.test(name)) return "腰靠穩在椅背上，不要用腰發力。";
  if (/深蹲/.test(name)) return "不要蹲太深，胸口打直，下背保持中立。";
  if (/臀橋|髖推|臀推/.test(name)) return "用臀部發力，不要靠腰撐起來。";
  if (/胸推|臥推|伏地/.test(name)) return "肩胛收穩，腰別過度拱起。";
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
    out.push({ id: "protein", text: "下午蛋白還不到一半，補一罐乳清或無糖優格。" });
  }
  const log = (st.logs || {})[key];
  const gToday = (LIVE.garmin.activities || []).some((a) => a.date === key && /strength|multi_sport|training/i.test(a.type || ""));
  const meals = (st.mealLogs || {})[key] || {};
  const recovered = !!(meals.snack && meals.snack.eaten) || !!(meals.dinner && meals.dinner.eaten);
  if ((log || gToday) && !recovered && !shown.includes("post") && out.length < left) {
    out.push({ id: "post", text: "練後 2 小時內用雞、蛋或乳清把蛋白質補滿。" });
  }
  return out.slice(0, left);
}

function renderBanners(st) {
  const notes = dueNotifs(st);
  if (!notes.length) return "";
  return notes.map((n) => `<div class="banner" data-notif="${esc(n.id)}"><p>${esc(n.text)}</p>
    <button type="button" class="btn" data-dismiss-notif="${esc(n.id)}">知道了</button></div>`).join("");
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
  const adj = computeKcalAdjust();
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
  return `<div class="chips" data-scoop-row="${slot}">${WHEY_OPTIONS.map((o) =>
    `<button type="button" class="chip${ids[slot] === o.id ? " on" : ""}" data-scoop-slot="${slot}" data-scoop-id="${esc(o.id)}">${esc(o.name.replace("樂維根 ", ""))}</button>`
  ).join("")}</div>`;
}
function proteinShortfall(st) {
  const t = now();
  if (!isTrainDay(st, t) || t.getHours() >= 21) return null;
  const logs = (st.mealLogs || {})[todayKey(t)] || {};
  const snackOk = !!(logs.snack && logs.snack.eaten);
  const others = ["breakfast", "lunch", "dinner", "eggs21"].some((id) => logs[id] && logs[id].eaten);
  if (snackOk && !others && mealTotals(st).protein < PROTEIN_MIN) {
    return "16:00 的蛋白粉已記，但今天蛋白質還不夠，21:00 前要把雞胸或蛋補上。";
  }
  return null;
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

  let trainCard;
  if (!plan.train) {
    trainCard = `<div class="rest-line" data-testid="rest-line">休息日，走走路就好<small>${esc(plan.reason)}</small></div>`;
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
    trainCard = `<section class="card hero" data-testid="train-card">
      <div class="k">${t.getMonth() + 1}/${t.getDate()}（週${DOW[t.getDay()]}）· ${esc(w.where)} · ${esc(w.time)}${returning ? ' · <span data-testid="buffer-week">緩衝週</span>' : ""}</div>
      <div class="big">今天：${esc(w.name)}</div>
      <p class="reason" data-testid="reason">${esc(plan.reason)}</p>
      <div class="acts">${primary}</div>
      <div class="acts">${fastedBtn}${ov}</div>
    </section>`;
  }

  const trainDay = isTrainDay(st);
  const hour = t.getHours();
  const shake = trainDay ? twoScoopMeal(st) : null;
  const topPowder = trainDay && hour < 16
    ? `<section class="card hero" data-testid="top-card" data-top="powder">
        <div class="k">訓練日</div>
        <div class="big">16:00 兩份蛋白粉</div>
        <p class="reason">選兩個口味，配地瓜 150g</p>
        <p class="sec">第一份</p>${scoopPicker(st, 0)}
        <p class="sec">第二份</p>${scoopPicker(st, 1)}
        <p class="note">地瓜 150g</p>
      </section>`
    : "";
  const mealIds = MEAL_ORDER.concat(((st.dinnerAlt || {})[todayKey()] === "eggs21") ? ["eggs21"] : []);
  const meals = mealIds.map((id) => {
    const m = currentMeal(st, id);
    if (m.hidden) return "";
    const est = m.estimate ? " · 估計值，可改" : "";
    const extra = m.extraLine ? `<div class="meta">${esc(m.extraLine)}</div>` : "";
    const alt = id === "dinner" && m.eggsAlt
      ? `<button type="button" class="btn full" data-dinner-alt="eggs21">或 21:00 再加蛋 2 顆（雞胸改 150g）</button>`
      : "";
    return `<div class="meal-row${m.eaten ? " eaten" : ""}" data-testid="meal-${id}">
      <div class="who">${esc(mealLabel(id, trainDay, st))}</div>
      <h3>${esc(m.name)}</h3>
      ${extra}
      <div class="meta">${Math.round(m.kcal || 0)} kcal · 蛋白 ${Math.round(m.protein || 0)} g${est}</div>
      <div class="row-acts">
        <button type="button" class="btn ${m.eaten ? "" : "primary"}" data-eat="${id}">${m.eaten ? "復原" : "照吃了"}</button>
        <button type="button" class="btn" data-swap="${id}">換一個</button>
        <button type="button" class="btn" data-eat-else="${id}">吃了別的</button>
      </div>
      ${alt}
    </div>`;
  }).join("");
  const shortfall = proteinShortfall(st);

  const chips = MAIN_PARTS.map((p) => {
    const n = week[p] || 0;
    return `<span class="chip${n < 6 ? " low" : ""}">${esc(PARTS[p])} ${n} 組</span>`;
  }).join("");

  const gAttach = todayLog && (todayLog.garmin || matchGarmin(todayKey()));
  const gLine = gAttach
    ? `<p class="muted">Garmin${gAttach.name ? ` · ${esc(gAttach.name)}` : ""}：${gAttach.durationMin != null ? `${gAttach.durationMin} 分` : ""}${gAttach.avgHR != null ? ` · 心率 ${Math.round(gAttach.avgHR)}` : ""}${gAttach.kcal != null ? ` · ${Math.round(gAttach.kcal)} kcal` : ""}</p>`
    : "";

  return `
    ${renderBanners(st)}
    ${topPowder}
    ${trainCard}
    <p class="sec">今天吃</p>
    <section class="card" data-testid="eat-card">
      <div class="rings">
        ${ringEl(totals.kcal, kcal.target, `/ ${kcal.target} kcal`, kcal.bandLabel, false)}
        ${ringEl(totals.protein, PROTEIN_TARGET, "蛋白 g", "目標 140–160 g", totals.protein >= PROTEIN_MIN)}
      </div>
      <p class="muted">${esc(kcal.source)}${kcal.adj.adj ? ` · ${esc(kcal.adj.note)}` : ""}</p>
      ${kcal.sleepLow ? `<p class="note" data-testid="protein-reminder">昨晚睡不夠，蛋白質還是要吃滿，不用再少吃。熱量不另外往下砍。</p>` : ""}
      ${trainDay ? `<p class="note">訓練日節奏：16:00 兩份蛋白粉＋地瓜，大約 18:30–19:00 再練，練完吃雞胸 ${shake ? shake.chickenG : 200}g。</p>` : ""}
      ${shortfall ? `<p class="note warn" data-testid="shortfall">${esc(shortfall)}</p>` : ""}
      ${st.lastAdvice ? `<p class="note" data-testid="next-advice">${esc(st.lastAdvice)}</p>` : ""}
      ${meals}
    </section>
    <p class="sec">身體趨勢</p>
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
function renderElse(st) {
  const id = ui.elseMeal;
  if (!id) return renderHome(st);
  const items = (typeof BENTO_ELSE !== "undefined" ? BENTO_ELSE : []).filter((x) => !/罐頭/.test(x.name));
  return `<button type="button" class="btn" data-go="today">← 回到今天</button>
    <h2 class="sheet-title">吃了別的</h2>
    <p class="note">便當估算熱量與蛋白質，選完會給下一餐建議。沒有罐頭食品。</p>
    <div class="swap-list" data-testid="else-list">
      ${items.map((it) => `<button type="button" data-else-pick="${esc(it.id)}">
        ${esc(it.name)}<small>${it.kcal} kcal · 蛋白 ${it.protein} g</small>
      </button>`).join("")}
    </div>`;
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
    <p class="sec">睡眠（小時）</p>
    <div class="card">${lineChart(sleep, "#7C3AED", 320, 140, "chart chart-lg")}<p class="muted">看有沒有滿 6 小時。不到就改快版，蛋白質照吃。</p></div>
    <p class="sec">靜止心率</p>
    <div class="card">${lineChart(rhr, "#B45309", 320, 140, "chart chart-lg")}<p class="muted">比 7 日平均高 5 下以上，今天改家裡快版。</p></div>
    <p class="sec">最近 InBody</p>
    <div class="card">${rows}</div>
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
    weight = session.returning ? Math.round(Number(hist.weight) * 0.7 * 2) / 2 : Number(hist.weight);
    if (!session.returning && !session.fasted && sug && sug.add) weight = Number(hist.weight) + Number(sug.add);
  }
  let target = dose.repsLow;
  if (hist && hist.reps && !session.returning) target = hist.reps;
  if (session.editTarget != null) target = session.editTarget;
  return { weight, target, sets: dose.sets, perSide: dose.perSide, hist, sug, noWeight: NO_WEIGHT.test(step.name) };
}

function renderWorkout(st) {
  const session = st.session;
  if (!session) {
    return `<p class="note">還沒開始訓練。</p><button type="button" class="btn primary xl" data-go="today">回到今天</button>`;
  }
  if (session.phase === "done") return renderDone(st, session);
  if (session.phase === "back") return renderBack(session);
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
    ? `<p class="muted">這個動作不用加重。</p>`
    : `<div class="load">
        <div><div class="num">${load.weight != null ? load.weight : "—"}<span class="unit"> kg</span></div>
          <div class="muted">${load.hist && load.hist.weight != null ? `上次 ${load.hist.weight} kg × ${load.hist.reps || "?"} 下` : "Garmin 沒有重量，第一次請先調好再按完成"}</div>
        </div>
        <div class="stepper">
          <button type="button" data-wdelta="-2.5" aria-label="減 2.5 公斤">−</button>
          <button type="button" data-wdelta="2.5" aria-label="加 2.5 公斤">+</button>
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
    <div class="wo-name">${esc(step.name)}${step.extra ? '<span class="chip">補強</span>' : ""}${step.swapped ? '<span class="chip">改腿推</span>' : ""}${session.returning ? '<span class="chip" data-testid="buffer-week">緩衝週</span>' : ""}</div>
    <div data-testid="wo-figure">${bodyMap((musclesFor(step.name).primary), (musclesFor(step.name).secondary), {})}</div>
    <p class="muted">${esc(step.dose)}${load.perSide ? "（單側次數）" : ""} · 目標 ${load.target} 下${load.hist && load.hist.reps ? ` · 上次 ${load.hist.reps} 下` : ""}</p>
    <p class="wo-cue" data-testid="wo-cue">${esc(cueFor(step.name))}</p>
    ${yt(step.video)}
    ${weightBlock}
    ${note ? `<p class="note">${esc(note)}</p>` : ""}
    <button type="button" class="btn primary xl" data-complete>完成</button>
    <div class="acts"><button type="button" class="btn full danger" data-short>少做了</button></div>
    ${((session.undoStack || []).length) ? `<div class="acts"><button type="button" class="btn full" data-undo-set data-testid="btn-undo">復原</button></div>` : ""}
    <p class="muted">左滑下一個動作，右滑回上一個。重量有變再按 ＋－，次數不夠才按「少做了」。</p>
  `;
}

function renderRest(session) {
  const left = Math.max(0, Math.ceil(((session.restUntil || 0) - Date.now()) / 1000));
  return `<div class="rest-box" data-testid="rest-timer">
    <div class="muted">休息</div>
    <div class="t" id="rest-count">${left}</div>
    <p class="muted">秒後繼續下一組</p>
    <button type="button" class="btn primary xl" data-skip-rest>跳過休息</button>
    <div class="acts"><button type="button" class="btn full" data-undo-set data-testid="btn-undo">復原</button></div>
  </div>`;
}

function renderBack(session) {
  const cur = session.backScore;
  const btns = Array.from({ length: 11 }, (_, i) =>
    `<button type="button" class="${cur === i ? "on" : ""}" data-back="${i}">${i}</button>`
  ).join("");
  return `<section class="card hero"><div class="big">下背感覺？</div>
    <div class="lab">0 沒感覺，10 很不適。點一下就好。</div></section>
    <div class="back-grid">${btns}</div>
    <p class="muted">3 分以上，下次深蹲會自動改成腿推。</p>`;
}

function renderDone(st, session) {
  const week = weekSetCounts({ ...st, logs: { ...st.logs, [session.date]: { moves: session.moves } } }, now());
  const parts = todayPartsFromMoves(session.moves);
  const g = session.garmin || matchGarmin(session.date);
  const chips = MAIN_PARTS.map((p) => `<span class="chip${(week[p] || 0) < 6 ? " low" : ""}">${esc(PARTS[p])} ${week[p] || 0} 組</span>`).join("");
  return `<section class="card hero">
      <div class="k">練完了</div>
      <div class="big">今天部位</div>
      <div class="lab">下背 ${session.backScore} 分${session.backScore >= 3 ? " · 下次深蹲改腿推" : ""}</div>
    </section>
    ${bodyMap(parts.pri, parts.sec, week)}
    <div class="chips">${chips}</div>
    ${g ? `<p class="muted">Garmin：${g.durationMin != null ? g.durationMin + " 分" : ""}${g.avgHR != null ? " · 平均心率 " + Math.round(g.avgHR) : ""}${g.kcal != null ? " · " + Math.round(g.kcal) + " kcal" : ""}</p>` : `<p class="muted">今天的 Garmin 紀錄之後同步，會自動對上這次訓練的心率和時間。</p>`}
    <button type="button" class="btn primary xl" data-finish-home>回到今天</button>`;
}

function renderShop(st) {
  const n = GROCERY.filter((g) => st.grocery[g.id]).length;
  return `<section class="card hero">
      <div class="k">備餐底料</div>
      <div class="big">採買清單</div>
      <div class="lab">已勾 ${n} / ${GROCERY.length}。勾選存在這支手機。</div>
    </section>
    <div class="acts"><button type="button" class="btn" data-clear-shop>清除勾選</button></div>
    ${GROCERY.map((g) => {
      const on = !!st.grocery[g.id];
      return `<button type="button" class="item${on ? " on" : ""}" data-g="${g.id}">
        <span class="ck${on ? " on" : ""}">${on ? "✓" : ""}</span>
        <span><b>${esc(g.name)}</b><br><span class="muted">${esc(g.hint)}</span></span>
      </button>`;
    }).join("")}`;
}

function renderRules() {
  const last = lastInbody();
  return `<section class="card hero">
      <div class="k">減脂喵守則</div>
      <div class="big">規則與目標</div>
      <div class="lab">下背友善、每週至少兩練、吃夠蛋白質。</div>
    </section>
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
      <p>前一晚睡滿 6 小時，且靜止心率沒有比 7 日平均高 5 下，就練原課表；任一項沒過，改家裡快版 25 分鐘。</p>
      <p>訓練日建議 16:00 喝兩份樂維根（芝麻／豆漿／杏仁各約 20 g 蛋白，極致約 25 g）加地瓜。一份極致則 18:30 雞胸 150g；兩份 20 g 則雞胸 200g 或 21:00 加蛋 2 顆。</p>
      <p>標示「今天空腹練」，或開始訓練前早餐、午餐、練前餐都沒記錄，就改 25 分鐘快版，而且不追重量。</p>
      <p>回台第一週重量抓上次七成，每組留 3 下。某個動作連續兩次做滿且有餘力，下次提示加 1–2.5 kg。</p>
      <p>當週有部位不到 6 組，週五會自動加一組補強。下背 3 分以上，下次深蹲改腿推。</p>
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
    const r = resolveName(s, back);
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
      steps.push({ name: ex.name, dose: ex.dose, video: ex.video, extra: true, extraFor: ex.extraFor, swapped: false });
    }
  }
  return steps;
}

function startWorkout() {
  let st = state();
  const noMeal = !hasPreWorkoutMeal(st);
  if (noMeal && !markedFasted(st)) {
    save({ fasted: { ...(st.fasted || {}), [todayKey()]: true } });
    st = state();
  }
  const plan = todayPlan(st);
  if (!plan.train || !plan.workout) return;
  if (isReturnWeek(st) && !st.returnUntil) {
    save({ returnUntil: todayKey(addDays(now(), 6)) });
    st = state();
  }
  const session = {
    date: todayKey(),
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
  if (finishedAll) {
    session.phase = "back";
    session.restUntil = null;
  } else if (finishedEx) {
    session.i += 1;
    session.setI = 0;
    session.editWeight = null;
    session.phase = "rest";
    session.restUntil = Date.now() + restMs();
  } else {
    session.setI += 1;
    session.phase = "rest";
    session.restUntil = Date.now() + restMs();
  }
  save({ session });
  render();
}

function finishWithScore(score) {
  const st = state();
  const session = { ...st.session, backScore: Number(score), phase: "done", garmin: matchGarmin(st.session.date) };
  const lastLoads = { ...st.lastLoads };
  const loadHistory = { ...st.loadHistory };
  const suggest = { ...st.suggest };
  if (!session.fasted) {
    for (const [name, sets] of Object.entries(session.moves || {})) {
      const done = (sets || []).filter((s) => s.done);
      if (!done.length) continue;
      const key = moveKey(name);
      const last = done[done.length - 1];
      lastLoads[key] = { weight: last.weight, reps: last.reps, date: session.date };
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
  const logs = {
    ...st.logs,
    [session.date]: {
      workoutId: session.workoutId,
      moves: session.moves,
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
  const tabHi = st.tab === "body" || st.tab === "workout" ? "today" : st.tab;
  document.querySelectorAll("#tabs button").forEach((b) => {
    b.classList.toggle("on", b.dataset.tab === tabHi);
  });
  const main = document.getElementById("main");
  if (!main) return;
  if (ui.swap || ui.elseMeal) main.innerHTML = renderSwap(st);
  else if (st.tab === "shop") main.innerHTML = renderShop(st);
  else if (st.tab === "rules") main.innerHTML = renderRules();
  else if (st.tab === "workout") main.innerHTML = renderWorkout(st);
  else if (st.tab === "body") main.innerHTML = renderBody(st);
  else main.innerHTML = renderHome(st);
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
    if (meals[id] && meals[id].eaten) {
      meals[id] = { ...meals[id], eaten: false };
    } else {
      const cur = currentMeal(st, id);
      meals[id] = { ...cur, eaten: true };
    }
    save({ mealLogs: { ...st.mealLogs, [day]: meals } });
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
    ui.swap = null;
    render();
    window.scrollTo(0, 0);
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
    const cur = load.weight != null ? Number(load.weight) : 20;
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
    save({ grocery: {} });
    render();
  }
});

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


const ASSETS = ["./", "./index.html", "./app.js", "./app.css", "./data.js", "./data.json", "./version.json", "./sw.js", "./manifest.webmanifest", "./icon-180.png", "./icon-512.png"];
let loadedVersion = null;
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
    await Promise.all(keys.map((k) => caches.delete(k)));
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
    if (pendingReload && !isBusy()) safeReload();
  });
}

window.__fatmiHardRefresh = hardRefresh;
window.__fatmiCheckUpdates = checkUpdates;

async function boot() {
  try {
    const v = await fetch("./version.json", { cache: "no-store" });
    if (v.ok) {
      const ver = await v.json();
      loadedVersion = ver && ver.version;
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
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
tick();
setInterval(tick, 500);
boot();
