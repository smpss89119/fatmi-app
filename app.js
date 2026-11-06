const STORE = "fatcat-v1";
const DOW = ["日", "一", "二", "三", "四", "五", "六"];
const GOAL = new Date(2026, 11, 31);
const DEFAULT_DAYS = [2, 5];

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORE) || "{}");
  } catch {
    return {};
  }
}
function save(patch) {
  const s = { ...load(), ...patch };
  localStorage.setItem(STORE, JSON.stringify(s));
  return s;
}
function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function state() {
  const s = load();
  return {
    tab: location.hash.slice(1) || "today",
    trainDays: Array.isArray(s.trainDays) ? s.trainDays : DEFAULT_DAYS.slice(),
    workout: s.workout || "quick",
    grocery: s.grocery || {},
    checks: s.checks || {},
    logs: s.logs || {},
    mealMode: s.mealMode || "auto",
  };
}

function isTrainDay(st, d = new Date()) {
  return st.trainDays.includes(d.getDay());
}
function mealIsTrain(st) {
  if (st.mealMode === "train") return true;
  if (st.mealMode === "rest") return false;
  return isTrainDay(st);
}
function sessionsThisWeek(st, now = new Date()) {
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
  let n = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i);
    if (st.logs[todayKey(d)]) n += 1;
  }
  return n;
}

function yt(key) {
  const v = VIDEOS[key];
  if (!v) return "";
  return `<a class="yt" href="${v.url}" target="_blank" rel="noopener noreferrer">▶ ${v.label}</a>`;
}

function renderToday(st) {
  const now = new Date();
  const train = isTrainDay(st);
  const daysLeft = Math.max(0, Math.ceil((GOAL - now) / 86400000));
  const sessions = sessionsThisWeek(st);
  const logged = !!st.logs[todayKey(now)];
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    const offset = i - now.getDay();
    d.setDate(now.getDate() + offset);
    const on = st.trainDays.includes(i);
    const isToday = i === now.getDay();
    return `<button type="button" class="wd${on ? " on" : ""}${isToday ? " today" : ""}" data-dow="${i}">
      ${DOW[i]}<small>${on ? "練" : "休"}</small>
    </button>`;
  }).join("");

  return `
    <section class="card hero">
      <div class="k">${now.getMonth() + 1}/${now.getDate()}（週${DOW[now.getDay()]}）</div>
      <div class="big">${train ? "今天練" : "今天休"}</div>
      <div class="lab">${train ? "預設：家裡啞鈴快版約 25 分，算一次訓練。" : "走路、睡眠、蛋白質照吃。中間隔一天再練即可。"}</div>
      <div class="acts">
        ${train ? `<button class="btn" data-go="train">開始快版</button>` : `<button class="btn" data-go="eat">看休息日菜單</button>`}
        <button class="btn" data-go="shop">採買</button>
      </div>
    </section>
    <p class="sec">本週節奏（點一下改訓練日）</p>
    <div class="week">${week}</div>
    <p class="note">預設週二、週五。任意兩天都行，中間至少隔一天休息。目標每週 ≥ 2 次。回台第一週重量抓上次七成；前晚睡不到 6 小時改做 25 分鐘快版。</p>
    <div class="card">
      <div class="stat"><span>本週已打卡</span><span class="${sessions >= 2 ? "ok" : "warn"}">${sessions} / 2 次</span></div>
      <div class="stat"><span>今天打卡</span><span>${logged ? "已完成喵" : "還沒"}</span></div>
      <div class="stat"><span>減脂目標</span><span>12/31 前減脂 3–4kg、體脂 15–16%</span></div>
      <div class="stat"><span>剩下天數</span><span>${daysLeft} 天</span></div>
      <div class="stat"><span>熱量／蛋白</span><span>2000–2200 kcal · 140–170g</span></div>
    </div>
    <p class="sec">快捷</p>
    <div class="grid2">
      <button class="qa" data-go="train"><b>🏋️</b>今天練什麼</button>
      <button class="qa" data-go="eat"><b>🍱</b>${mealIsTrain(st) ? "訓練日菜單" : "休息日菜單"}</button>
      <button class="qa" data-go="shop"><b>🛒</b>採買清單</button>
      <button class="qa" data-go="rules"><b>🛡️</b>下背規則</button>
    </div>
  `;
}

function renderTrain(st) {
  const w = WORKOUTS[st.workout] || WORKOUTS.quick;
  const key = `${todayKey()}:${w.id}`;
  const done = st.checks[key] || [];
  const logged = !!st.logs[todayKey()];
  const chips = Object.values(WORKOUTS)
    .map(
      (x) =>
        `<button type="button" class="chip${x.id === w.id ? " on" : ""}" data-wo="${x.id}">${x.name}</button>`
    )
    .join("");
  const steps = w.steps
    .map((s, i) => {
      const on = done.includes(i);
      const extra = s.alt ? yt(s.alt) : "";
      return `<div class="step">
        <button type="button" class="ck${on ? " on" : ""}" data-step="${i}" aria-pressed="${on}">${on ? "✓" : ""}</button>
        <div>
          <h3>${s.name}${s.optional ? '<span class="badge">選做</span>' : ""}</h3>
          <p>${s.dose}</p>
          ${yt(s.video)}${extra}
        </div>
      </div>`;
    })
    .join("");

  return `
    <section class="card hero">
      <div class="k">${w.where} · ${w.time}</div>
      <div class="big">${w.name}</div>
      <div class="lab">${w.tag}。完成就算一次訓練日。</div>
    </section>
    <p class="sec">選課表</p>
    <div class="pick">${chips}</div>
    <p class="note">${w.warm}</p>
    <div class="card">${steps}</div>
    <button type="button" class="btn primary full" data-log="${logged ? "off" : "on"}">
      ${logged ? "取消今天打卡" : "完成，打卡今天"}
    </button>
    <p class="muted" style="margin-top:10px">影片開新分頁。下背不適就減重量、少蹲到底，改腿推／臀橋。</p>
  `;
}

function renderEat(st) {
  const train = mealIsTrain(st);
  const mode = st.mealMode;
  return `
    <section class="card hero">
      <div class="k">約 2000–2200 kcal · 蛋白 140–170g</div>
      <div class="big">${train ? "訓練日吃法" : "休息日吃法"}</div>
      <div class="lab">InBody 10/8：78.4kg／體脂 19.9%。休息日晚餐碳水減半。</div>
    </section>
    <div class="tog">
      <button type="button" data-meal="auto" class="${mode === "auto" ? "on" : ""}">跟課表</button>
      <button type="button" data-meal="train" class="${mode === "train" ? "on" : ""}">訓練日</button>
      <button type="button" data-meal="rest" class="${mode === "rest" ? "on" : ""}">休息日</button>
    </div>
    <div class="card meal">
      <h3>早餐</h3>
      <p>2 顆蛋 ＋ 無糖優格 200g ＋ 燕麥 40g（或全麥吐司 2 片）。</p>
      <h3>午餐便當</h3>
      <p>手掌大瘦肉、飯${train ? "半碗到大半碗" : "半碗"}、大量蔬菜。少炸、少醬。</p>
      <h3>午後</h3>
      <p>乳清或優格。${train ? "練前 1–2 小時可加半根香蕉。" : "不額外加香蕉也行。"}</p>
      <h3>晚餐</h3>
      <p>手掌大蛋白質 ＋ 大份蔬菜 ＋ ${train ? "半碗飯或地瓜" : "碳水再減半（1/4 碗飯或小塊地瓜）"}。</p>
      ${
        train
          ? `<h3>練前 1–2 小時</h3><p>優格／乳清 ＋ 半根香蕉。若正餐剛吃飽可略過。</p>
             <h3>練後 2 小時內</h3><p>用雞、蛋或乳清補當日蛋白質；不夠再加半碗飯或地瓜。</p>`
          : ""
      }
    </div>
    <p class="sec">便當快換</p>
    <div class="swap">
      排骨 → 去皮雞肉 ＋ 半碗飯<br>
      油炸菜 → 燙青菜<br>
      含糖飲料 → 無糖茶或白開水
    </div>
    <p class="sec">家常輪替（15–20 分）</p>
    ${COOKS.map(
      (c) => `<div class="card meal"><h3>${c.name}</h3><p class="muted">${c.time}</p><p>${c.steps}</p></div>`
    ).join("")}
  `;
}

function renderShop(st) {
  const n = GROCERY.filter((g) => st.grocery[g.id]).length;
  return `
    <section class="card hero">
      <div class="k">備餐底料</div>
      <div class="big">採買清單</div>
      <div class="lab">已勾 ${n} / ${GROCERY.length}。勾選存在這支手機。</div>
    </section>
    <div class="acts">
      <button class="btn" data-clear-shop>清除勾選</button>
    </div>
    ${GROCERY.map((g) => {
      const on = !!st.grocery[g.id];
      return `<button type="button" class="item${on ? " on" : ""}" data-g="${g.id}">
        <span class="ck${on ? " on" : ""}">${on ? "✓" : ""}</span>
        <span><b>${g.name}</b><br><span class="muted">${g.hint}</span></span>
      </button>`;
    }).join("")}
  `;
}

function renderRules() {
  return `
    <section class="card hero">
      <div class="k">減脂喵守則</div>
      <div class="big">規則與目標</div>
      <div class="lab">下背友善、每週至少兩練、吃夠蛋白質。</div>
    </section>
    <p class="sec">目標</p>
    <div class="card prose">
      <div class="stat"><span>體位參考</span><span>78.4kg／體脂 19.9%／骨骼肌 35.9kg（InBody 10/8）</span></div>
      <div class="stat"><span>減脂</span><span>年底前減 3–4kg 脂肪，保住肌肉</span></div>
      <div class="stat"><span>訓練</span><span>每週 ≥ 2 次</span></div>
      <div class="stat"><span>熱量</span><span>約 2000–2200 kcal</span></div>
      <div class="stat"><span>蛋白質</span><span>140–170g</span></div>
    </div>
    <p class="sec">下背：少做</p>
    <ul class="no">
      <li><span class="bad">少做</span> 傳統硬舉、槓鈴深蹲加重、早安式、彎腰划船</li>
    </ul>
    <p class="sec">下背：改做</p>
    <ul class="no">
      <li><span class="good">改做</span> 高腳杯深蹲、腿推</li>
      <li><span class="good">改做</span> 臀橋、髖推</li>
      <li><span class="good">改做</span> 坐姿划船、胸部支撐划船</li>
      <li><span class="good">改做</span> 死蟲、鳥狗當核心</li>
    </ul>
    <p class="sec">節奏</p>
    <div class="card prose">
      <p>預設週二、週五練；任意兩天都可以，中間隔一天休息。</p>
      <p>沒時間就做「家裡啞鈴快版」25 分鐘，仍算訓練日。</p>
      <p>外食便當先換主菜與少油，再調飯量。飲料一律無糖。</p>
    </div>
    <p class="muted">這是個人備忘小工具，不是醫療建議。下背痛持續請找物理治療或醫師。</p>
  `;
}

function render() {
  const st = state();
  const tab = ["today", "train", "eat", "shop", "rules"].includes(st.tab) ? st.tab : "today";
  document.querySelectorAll("#tabs button").forEach((b) => {
    b.classList.toggle("on", b.dataset.tab === tab);
  });
  const map = { today: renderToday, train: renderTrain, eat: renderEat, shop: renderShop, rules: renderRules };
  document.getElementById("main").innerHTML = map[tab](st);
}

function tick() {
  const n = new Date();
  const pad = (x) => String(x).padStart(2, "0");
  const el = document.getElementById("clock");
  if (el) el.textContent = `${n.getMonth() + 1}/${n.getDate()} ${pad(n.getHours())}:${pad(n.getMinutes())}`;
}

function go(tab) {
  location.hash = tab;
  render();
  window.scrollTo(0, 0);
}

document.getElementById("tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-tab]");
  if (b) go(b.dataset.tab);
});

document.getElementById("main").addEventListener("click", (e) => {
  const st = state();
  const goBtn = e.target.closest("[data-go]");
  if (goBtn) {
    const t = goBtn.dataset.go;
    if (t === "train") save({ workout: "quick" });
    go(t);
    return;
  }
  const dow = e.target.closest("[data-dow]");
  if (dow) {
    const d = Number(dow.dataset.dow);
    let days = st.trainDays.slice();
    if (days.includes(d)) days = days.filter((x) => x !== d);
    else days.push(d);
    days.sort();
    save({ trainDays: days });
    render();
    return;
  }
  const wo = e.target.closest("[data-wo]");
  if (wo) {
    save({ workout: wo.dataset.wo, checks: st.checks });
    render();
    return;
  }
  const step = e.target.closest("[data-step]");
  if (step) {
    const w = WORKOUTS[st.workout] || WORKOUTS.quick;
    const key = `${todayKey()}:${w.id}`;
    const i = Number(step.dataset.step);
    const cur = new Set(st.checks[key] || []);
    if (cur.has(i)) cur.delete(i);
    else cur.add(i);
    save({ checks: { ...st.checks, [key]: [...cur] } });
    render();
    return;
  }
  const log = e.target.closest("[data-log]");
  if (log) {
    const logs = { ...st.logs };
    if (log.dataset.log === "on") logs[todayKey()] = st.workout || "quick";
    else delete logs[todayKey()];
    save({ logs });
    render();
    return;
  }
  const meal = e.target.closest("[data-meal]");
  if (meal) {
    save({ mealMode: meal.dataset.meal });
    render();
    return;
  }
  const g = e.target.closest("[data-g]");
  if (g) {
    const grocery = { ...st.grocery, [g.dataset.g]: !st.grocery[g.dataset.g] };
    save({ grocery });
    render();
    return;
  }
  if (e.target.closest("[data-clear-shop]")) {
    save({ grocery: {} });
    render();
  }
});

window.addEventListener("hashchange", render);
tick();
setInterval(tick, 15000);
render();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
