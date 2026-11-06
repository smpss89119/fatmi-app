const VIDEOS = {
  goblet: { label: "高腳杯深蹲示範", url: "https://www.youtube.com/watch?v=jZOvxOKYUFc" },
  floor: { label: "地板臥推示範", url: "https://www.youtube.com/watch?v=uUGDRwge4F8" },
  row1: { label: "單臂划船示範", url: "https://www.youtube.com/watch?v=epSR-ma7BsY" },
  bridge: { label: "臀橋示範", url: "https://www.youtube.com/watch?v=Q_Bpj91Yiis" },
  deadbug: { label: "死蟲示範", url: "https://www.youtube.com/watch?v=lqnuY3wiBzA" },
  legpress: { label: "腿推示範", url: "https://www.youtube.com/watch?v=K5n2vg3oZa4" },
  chest: { label: "胸推示範", url: "https://www.youtube.com/watch?v=2y6ntGVg4dw" },
  hip: { label: "髖推示範", url: "https://www.youtube.com/watch?v=xDmFkJxPzeM" },
  press: { label: "坐姿肩推示範", url: "https://www.youtube.com/watch?v=8kwDkC8JhdY" },
  seatedrow: { label: "坐姿划船示範", url: "https://www.youtube.com/watch?v=vwHG9Jfu4sw" },
  pulldown: { label: "下拉示範", url: "https://www.youtube.com/watch?v=z-lxcsIN4T4" },
  kneelpush: { label: "跪姿伏地挺身示範", url: "https://www.youtube.com/watch?v=IODxDxX7oi4" },
  birddog: { label: "鳥狗示範", url: "https://www.youtube.com/watch?v=xEDnlOxeJH4" },
  face: { label: "面拉示範（選做）", url: "https://www.youtube.com/watch?v=HSoHeSjvIdY" },
};

const WORKOUTS = {
  quick: {
    id: "quick",
    name: "家裡啞鈴快版",
    time: "約 25 分",
    where: "家裡",
    tag: "睡眠或心率未達標時的替代",
    warm: "可選：關節繞圈 1–2 分鐘，不用拉很久。",
    steps: [
      { name: "高腳杯深蹲", dose: "3 × 10", video: "goblet" },
      { name: "地板臥推", dose: "3 × 10", video: "floor" },
      { name: "單臂划船", dose: "3 × 10 / 側", video: "row1" },
      { name: "臀橋", dose: "3 × 12", video: "bridge" },
      { name: "死蟲", dose: "2 × 8 / 側", video: "deadbug" },
    ],
  },
  homeA: {
    id: "homeA",
    name: "家用完整 A",
    time: "約 40 分",
    where: "家裡啞鈴",
    tag: "推＋腿日",
    warm: "關節繞圈 + 空蹲 5 下。機器動作改成啞鈴／地板版。",
    steps: [
      { name: "高腳杯深蹲", dose: "3 × 10–12", video: "goblet" },
      { name: "地板臥推", dose: "3 × 8–10", video: "floor" },
      { name: "臀橋", dose: "3 × 10–12", video: "bridge" },
      { name: "坐姿啞鈴肩推", dose: "3 × 8–10", video: "press" },
      { name: "單臂划船", dose: "3 × 10–12 / 側", video: "row1" },
      { name: "死蟲", dose: "3 × 8–10 / 側", video: "deadbug" },
    ],
  },
  homeB: {
    id: "homeB",
    name: "家用完整 B",
    time: "約 40 分",
    where: "家裡啞鈴",
    tag: "拉＋核心日",
    warm: "貓牛式 6 下 + 臀橋 8 下。沒有下拉機就用單臂划船。",
    steps: [
      { name: "高腳杯深蹲", dose: "3 × 10–12", video: "goblet" },
      { name: "單臂划船（代替下拉）", dose: "3 × 10–12 / 側", video: "row1" },
      { name: "臀橋", dose: "3 × 10–12", video: "bridge" },
      { name: "地板臥推或跪姿伏地", dose: "3 × 8–10", video: "kneelpush", alt: "floor" },
      { name: "鳥狗", dose: "3 × 8 / 側", video: "birddog" },
      { name: "死蟲", dose: "2 × 8 / 側", video: "deadbug" },
    ],
  },
  gymA: {
    id: "gymA",
    name: "健身房 A",
    time: "約 45 分",
    where: "健身房",
    tag: "推＋腿日",
    warm: "走路或腳踏車 5 分鐘。",
    steps: [
      { name: "腿推或高腳杯深蹲", dose: "3 × 10–12", video: "legpress", alt: "goblet" },
      { name: "胸推或啞鈴臥推", dose: "3 × 8–10", video: "chest", alt: "floor" },
      { name: "臀橋或髖推", dose: "3 × 10–12", video: "hip", alt: "bridge" },
      { name: "坐姿啞鈴肩推", dose: "3 × 8–10", video: "press" },
      { name: "坐姿划船", dose: "3 × 10–12", video: "seatedrow" },
      { name: "死蟲", dose: "3 × 8–10 / 側", video: "deadbug" },
    ],
  },
  gymB: {
    id: "gymB",
    name: "健身房 B",
    time: "約 45 分",
    where: "健身房",
    tag: "拉＋核心日",
    warm: "走路或划船機輕划 5 分鐘。",
    steps: [
      { name: "高腳杯深蹲或腿推", dose: "3 × 10–12", video: "goblet", alt: "legpress" },
      { name: "下拉", dose: "3 × 10–12", video: "pulldown" },
      { name: "臀橋", dose: "3 × 10–12", video: "bridge" },
      { name: "單臂划船或坐姿划船", dose: "3 × 10–12", video: "row1", alt: "seatedrow" },
      { name: "胸推或跪姿伏地", dose: "3 × 8–10", video: "chest", alt: "kneelpush" },
      { name: "鳥狗", dose: "3 × 8 / 側", video: "birddog" },
      { name: "面拉（選做）", dose: "2 × 12", video: "face", optional: true },
    ],
  },
};

const GROCERY = [
  { id: "eggs", name: "雞蛋", hint: "早餐兩顆，家常炒菜也用" },
  { id: "yogurt", name: "無糖原味優格", hint: "早餐 200g、午後或練前" },
  { id: "oats", name: "燕麥或全麥吐司", hint: "早餐碳水，二選一即可" },
  { id: "chicken", name: "雞胸或去皮雞腿（可冷凍）", hint: "便當、電鍋主菜" },
  { id: "fish", name: "罐頭魚或豆腐", hint: "來不及備餐時用" },
  { id: "veg", name: "冷凍蔬菜", hint: "大量蔬菜、少油" },
  { id: "carb", name: "白米或地瓜", hint: "訓練日半碗～大半碗；休息日減半" },
  { id: "banana", name: "香蕉", hint: "練前 1–2 小時可加半根" },
  { id: "whey", name: "樂維根無糖蛋白粉", hint: "1 scoop 40 g，練前 16:00；估計每 scoop 約 22 g 蛋白、185 kcal" },
  { id: "tea", name: "無糖茶／黑咖啡", hint: "飲料改無糖" },
];

const COOKS = [
  {
    name: "蛋炒芽菜＋半碗飯＋優格",
    time: "15 分",
    steps: "蛋 2–3 顆炒豆芽／高麗菜，半碗飯，旁邊一盒無糖優格。油少、醬少。",
  },
  {
    name: "電鍋雞胸＋菜＋地瓜",
    time: "20 分（電鍋等）",
    steps: "雞胸加薑鹽，旁邊放地瓜與冷凍蔬菜一起蒸。出鍋淋少許醬油或胡椒。",
  },
  {
    name: "豆腐絞肉炒菜＋半碗飯",
    time: "15–20 分",
    steps: "絞肉少油炒香，加板豆腐與大量青菜。休息日飯再減半或改地瓜。",
  },
];

const PARTS = {
  quads: "股四頭",
  glutes: "臀",
  hams: "腿後",
  core: "核心",
  chest: "胸",
  tris: "三頭",
  frontDelts: "前三角",
  delts: "三角肌",
  lats: "背闊",
  midback: "中背",
  bis: "二頭",
  rearDelts: "後三角",
  upperback: "上背",
  rotator: "旋轉肌",
  lowback: "下背穩定",
};

const MAIN_PARTS = ["quads", "glutes", "hams", "chest", "delts", "lats", "midback", "core"];

const MOVE_MUSCLES = [
  { keys: ["腿推"], primary: ["quads", "glutes"], secondary: ["hams"] },
  { keys: ["高腳杯深蹲", "深蹲"], primary: ["quads", "glutes"], secondary: ["core"] },
  { keys: ["臀橋", "臀推", "髖推"], primary: ["glutes"], secondary: ["hams"] },
  { keys: ["胸推", "地板臥推", "臥推", "伏地挺身", "跪姿伏地"], primary: ["chest"], secondary: ["tris", "frontDelts"] },
  { keys: ["坐姿啞鈴肩推", "肩推"], primary: ["delts"], secondary: ["tris"] },
  { keys: ["坐姿划船", "單臂划船", "單手划船"], primary: ["lats", "midback"], secondary: ["bis", "rearDelts"] },
  { keys: ["下拉", "滑輪下拉"], primary: ["lats"], secondary: ["bis"] },
  { keys: ["面拉"], primary: ["rearDelts", "upperback"], secondary: ["rotator"] },
  { keys: ["死蟲"], primary: ["core"], secondary: ["lowback"] },
  { keys: ["鳥狗"], primary: ["core"], secondary: ["lowback"] },
];

const EXTRA_FOR_PART = {
  quads: { name: "腿推", dose: "1 × 10–12", video: "legpress" },
  glutes: { name: "臀橋", dose: "1 × 10–12", video: "bridge" },
  hams: { name: "臀橋", dose: "1 × 10–12", video: "bridge" },
  chest: { name: "胸推或啞鈴臥推", dose: "1 × 8–10", video: "chest" },
  delts: { name: "坐姿啞鈴肩推", dose: "1 × 8–10", video: "press" },
  lats: { name: "下拉", dose: "1 × 10–12", video: "pulldown" },
  midback: { name: "坐姿划船", dose: "1 × 10–12", video: "seatedrow" },
  core: { name: "死蟲", dose: "1 × 8–10 / 側", video: "deadbug" },
};

const NO_WEIGHT = /死蟲|鳥狗|伏地|跪姿伏地/;

const PROTEIN_SWAPS = [
  { id: "chicken200", name: "雞胸 200g", kcal: 220, protein: 46 },
  { id: "shrimp150", name: "蝦仁 150g", kcal: 150, protein: 32 },
  { id: "tilapia", name: "吳郭魚排 1 片", kcal: 150, protein: 30 },
  { id: "eggs3", name: "雞蛋 3 顆", kcal: 210, protein: 19 },
];

const STARCH_SWAPS = [
  { id: "rice150", name: "飯 150g", kcal: 195, protein: 4 },
  { id: "yam150", name: "地瓜 150g", kcal: 130, protein: 2 },
  { id: "sourdough2", name: "酸種麵包 2 片", kcal: 170, protein: 6 },
];

const VEG_ADDON = { name: "青菜", kcal: 40, protein: 2 };

function composeSwapMeal(proteinId, starchId) {
  const p = PROTEIN_SWAPS.find((x) => x.id === proteinId) || PROTEIN_SWAPS[0];
  const s = STARCH_SWAPS.find((x) => x.id === starchId) || STARCH_SWAPS[0];
  return {
    name: `${p.name}＋${s.name}＋${VEG_ADDON.name}`,
    kcal: p.kcal + s.kcal + VEG_ADDON.kcal,
    protein: p.protein + s.protein + VEG_ADDON.protein,
    proteinId: p.id,
    starchId: s.id,
  };
}

const MEAL_DEFS = {
  breakfast: {
    id: "breakfast",
    label: "早餐",
    base: { name: "蛋 2 顆＋無糖優格 200g＋燕麥 40g", kcal: 430, protein: 36 },
  },
  lunch: {
    id: "lunch",
    label: "午餐",
    train: { name: "瘦肉便當、飯半碗到大半碗、大量青菜", kcal: 680, protein: 42 },
    rest: { name: "瘦肉便當、飯半碗、大量青菜少油", kcal: 600, protein: 42 },
  },
  snack: {
    id: "snack",
    label: "午後",
    train: { name: "樂維根無糖蛋白粉 1 scoop（40 g）", kcal: 185, protein: 22 },
    rest: { name: "乳清或無糖優格", kcal: 150, protein: 24 },
  },
  dinner: {
    id: "dinner",
    label: "晚餐",
    train: { name: "雞胸 200g＋大份蔬菜＋半碗飯或地瓜", kcal: 650, protein: 52 },
    rest: { name: "手掌大蛋白質＋大份蔬菜＋碳水再減半", kcal: 500, protein: 45 },
  },
};

const MEAL_ORDER = ["breakfast", "lunch", "snack", "dinner"];
