const STORAGE_KEY = "medica-mist-levels-v1";
const STANDARD_SIZE = 100;
const GAME_VIEW = 5;
const ADMIN_VIEW = 15;

const screens = [...document.querySelectorAll(".screen")];
const continueButton = document.querySelector("#continueButton");
const levelList = document.querySelector("#levelList");
const levelMeta = document.querySelector("#levelMeta");
const levelTitle = document.querySelector("#levelTitle");
const gameBoard = document.querySelector("#gameBoard");
const positionText = document.querySelector("#positionText");
const bossText = document.querySelector("#bossText");
const stepText = document.querySelector("#stepText");
const gameStatus = document.querySelector("#gameStatus");
const restartLevelButton = document.querySelector("#restartLevelButton");
const bossDialog = document.querySelector("#bossDialog");
const bossForm = document.querySelector("#bossForm");
const bossDialogMeta = document.querySelector("#bossDialogMeta");
const bossDialogTitle = document.querySelector("#bossDialogTitle");
const bossAnswerInput = document.querySelector("#bossAnswerInput");
const bossFeedback = document.querySelector("#bossFeedback");
const cancelBossButton = document.querySelector("#cancelBossButton");
const adminLevelSelect = document.querySelector("#adminLevelSelect");
const adminLevelName = document.querySelector("#adminLevelName");
const adminRows = document.querySelector("#adminRows");
const adminCols = document.querySelector("#adminCols");
const newMapButton = document.querySelector("#newMapButton");
const saveMapButton = document.querySelector("#saveMapButton");
const toolButtons = [...document.querySelectorAll(".tool-button")];
const cameraRowInput = document.querySelector("#cameraRow");
const cameraColInput = document.querySelector("#cameraCol");
const adminBoard = document.querySelector("#adminBoard");
const selectedAdminCell = document.querySelector("#selectedAdminCell");
const bossDifficulty = document.querySelector("#bossDifficulty");
const bossQuestion = document.querySelector("#bossQuestion");
const bossAnswer = document.querySelector("#bossAnswer");
const saveBossButton = document.querySelector("#saveBossButton");
const removeBossButton = document.querySelector("#removeBossButton");
const adminBossList = document.querySelector("#adminBossList");

const bossNames = {
  1: "Herb Imp",
  2: "Plague Knight",
  3: "Mist Lich",
};

const directions = {
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1],
};

function makeKey(row, col) {
  return `${row},${col}`;
}

function parseKey(cellKey) {
  const [row, col] = cellKey.split(",").map(Number);
  return { row, col };
}

function cloneLevel(level) {
  return {
    ...level,
    path: [...level.path],
    bosses: JSON.parse(JSON.stringify(level.bosses)),
  };
}

function normalizeAnswer(value) {
  return value.trim().toLowerCase();
}

function inBounds(level, row, col) {
  return row >= 0 && col >= 0 && row < level.rows && col < level.cols;
}

function createPath(points) {
  const path = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    let row = from[0];
    let col = from[1];

    path.push(makeKey(row, col));
    while (row !== to[0]) {
      row += row < to[0] ? 1 : -1;
      path.push(makeKey(row, col));
    }
    while (col !== to[1]) {
      col += col < to[1] ? 1 : -1;
      path.push(makeKey(row, col));
    }
  }

  const last = points[points.length - 1];
  path.push(makeKey(last[0], last[1]));
  return [...new Set(path)];
}

function createDefaultLevels() {
  const academyPath = createPath([
    [50, 50],
    [50, 54],
    [46, 54],
    [46, 60],
    [54, 60],
    [54, 66],
    [49, 66],
    [49, 72],
  ]);

  const wardPath = createPath([
    [20, 20],
    [24, 20],
    [24, 27],
    [30, 27],
    [30, 35],
    [35, 35],
    [35, 43],
    [42, 43],
  ]);

  return [
    {
      id: "herbal-academy",
      name: "Herbal Academy",
      description: "เส้นทางฝึกฝนในป่าหมอก เรียนรู้สมุนไพรและพื้นฐานการรักษา",
      rows: STANDARD_SIZE,
      cols: STANDARD_SIZE,
      start: "50,50",
      goal: "49,72",
      path: academyPath,
      bosses: {
        "50,54": {
          difficulty: 1,
          question: "ยา ORS ใช้ช่วยภาวะใด",
          answer: "ขาดน้ำ",
        },
        "46,60": {
          difficulty: 2,
          question: "ก่อนให้ยาควรตรวจสอบชื่อผู้ป่วยและอะไรอีกอย่าง",
          answer: "ชื่อยา",
        },
        "54,66": {
          difficulty: 3,
          question: "สัญญาณชีพภาษาอังกฤษเรียกว่าอะไร",
          answer: "vital signs",
        },
        "49,72": {
          difficulty: 2,
          question: "พิมพ์คำว่า heal เพื่อปิดผนึกหมอก",
          answer: "heal",
        },
      },
    },
    {
      id: "crystal-ward",
      name: "Crystal Ward",
      description: "หอผู้ป่วยผลึกเวท มีทางเดินแคบและ Boss ระดับสูงขึ้น",
      rows: STANDARD_SIZE,
      cols: STANDARD_SIZE,
      start: "20,20",
      goal: "42,43",
      path: wardPath,
      bosses: {
        "24,27": {
          difficulty: 1,
          question: "อุณหภูมิร่างกายปกติประมาณกี่องศาเซลเซียส",
          answer: "37",
        },
        "30,35": {
          difficulty: 2,
          question: "คำว่า sterile หมายถึงปลอดอะไร",
          answer: "เชื้อ",
        },
        "35,43": {
          difficulty: 3,
          question: "CPR ย่อมาจาก Cardiopulmonary Resuscitation ใช่หรือไม่",
          answer: "ใช่",
        },
        "42,43": {
          difficulty: 3,
          question: "พิมพ์คำว่า ward เพื่อจบด่าน",
          answer: "ward",
        },
      },
    },
  ];
}

let levels = loadLevels();
let activeLevelIndex = 0;
let activeLevel = cloneLevel(levels[activeLevelIndex]);
let pathSet = new Set(activeLevel.path);
let player = parseKey(activeLevel.start);
let solvedBosses = new Set();
let steps = 0;
let pendingBossKey = null;
let adminLevel = cloneLevel(levels[0]);
let adminTool = "path";
let adminCamera = parseKey(adminLevel.start);
let adminSelected = adminLevel.start;

function loadLevels() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return createDefaultLevels();
  }

  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : createDefaultLevels();
  } catch {
    return createDefaultLevels();
  }
}

function saveLevels() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(levels));
}

function showScreen(screenId) {
  screens.forEach((screen) => {
    screen.classList.toggle("active", screen.id === screenId);
  });

  if (window.location.hash !== `#${screenId}`) {
    history.replaceState(null, "", `#${screenId}`);
  }

  if (screenId === "screen-levels") {
    renderLevelList();
  }

  if (screenId === "screen-admin") {
    renderAdminSelect();
    loadAdminLevel(activeLevelIndex);
  }
}

function startLevel(index) {
  activeLevelIndex = index;
  activeLevel = cloneLevel(levels[index]);
  pathSet = new Set(activeLevel.path);
  player = parseKey(activeLevel.start);
  solvedBosses = new Set();
  steps = 0;
  pendingBossKey = null;
  showScreen("screen-game");
  renderGame();
}

function renderLevelList() {
  levelList.innerHTML = "";

  levels.forEach((level, index) => {
    const card = document.createElement("article");
    card.className = "level-card";
    card.innerHTML = `
      <p class="eyebrow">${level.rows} x ${level.cols}</p>
      <h3>${level.name}</h3>
      <p>${level.description || "ด่านที่สร้างจากระบบหลังบ้าน"}</p>
      <p>${Object.keys(level.bosses).length} Boss / ${level.path.length} ช่องทางเดิน</p>
    `;

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "เข้าเล่น";
    button.addEventListener("click", () => startLevel(index));
    card.append(button);
    levelList.append(card);
  });
}

function getCellType(level, row, col) {
  const cellKey = makeKey(row, col);
  if (!inBounds(level, row, col)) {
    return "outside";
  }
  if (cellKey === level.start) {
    return "start";
  }
  if (cellKey === level.goal) {
    return "goal";
  }
  if (level.bosses[cellKey]) {
    return "boss";
  }
  if (pathSet.has(cellKey) || level.path.includes(cellKey)) {
    return "path";
  }
  return "wall";
}

function isAdjacentToPlayer(row, col) {
  return Math.abs(player.row - row) + Math.abs(player.col - col) === 1;
}

function renderGame() {
  const playerKey = makeKey(player.row, player.col);
  const bossTotal = Object.keys(activeLevel.bosses).length;

  levelMeta.textContent = `${activeLevel.rows} x ${activeLevel.cols} / fog 5 x 5`;
  levelTitle.textContent = activeLevel.name;
  positionText.textContent = playerKey;
  bossText.textContent = `${solvedBosses.size}/${bossTotal}`;
  stepText.textContent = steps;
  gameBoard.innerHTML = "";

  const half = Math.floor(GAME_VIEW / 2);
  for (let row = player.row - half; row <= player.row + half; row += 1) {
    for (let col = player.col - half; col <= player.col + half; col += 1) {
      const tile = document.createElement("button");
      const cellKey = makeKey(row, col);
      const boss = activeLevel.bosses[cellKey];
      const visible = inBounds(activeLevel, row, col);
      const type = visible ? getCellType(activeLevel, row, col) : "fog";

      tile.type = "button";
      tile.className = `tile ${type}`;
      tile.disabled = !visible;
      tile.textContent = visible ? tileLabel(cellKey, type, boss) : "??";
      tile.classList.toggle("player", cellKey === playerKey);
      tile.classList.toggle("available", visible && pathSet.has(cellKey) && isAdjacentToPlayer(row, col));
      tile.classList.toggle("boss", Boolean(boss));
      tile.classList.toggle("boss-1", boss?.difficulty === 1);
      tile.classList.toggle("boss-2", boss?.difficulty === 2);
      tile.classList.toggle("boss-3", boss?.difficulty === 3);
      tile.classList.toggle("solved", solvedBosses.has(cellKey));
      tile.addEventListener("click", () => tryMove(row, col));
      gameBoard.append(tile);
    }
  }
}

function tileLabel(cellKey, type, boss) {
  if (makeKey(player.row, player.col) === cellKey) {
    return "YOU";
  }
  if (boss) {
    return `B${boss.difficulty}`;
  }
  if (type === "start") {
    return "START";
  }
  if (type === "goal") {
    return "GOAL";
  }
  if (type === "path") {
    return "PATH";
  }
  return "FOG";
}

function tryMove(row, col) {
  const cellKey = makeKey(row, col);

  if (!inBounds(activeLevel, row, col) || !pathSet.has(cellKey) || !isAdjacentToPlayer(row, col)) {
    gameStatus.textContent = "เดินได้เฉพาะช่องทางเดินที่ติดกับตัวผู้เล่น";
    renderGame();
    return;
  }

  const boss = activeLevel.bosses[cellKey];
  if (boss && !solvedBosses.has(cellKey)) {
    pendingBossKey = cellKey;
    bossDialogMeta.textContent = `${bossNames[boss.difficulty]} / B${boss.difficulty}`;
    bossDialogTitle.textContent = boss.question;
    bossAnswerInput.value = "";
    bossFeedback.textContent = "";
    bossDialog.showModal();
    bossAnswerInput.focus();
    return;
  }

  moveTo(row, col);
}

function moveTo(row, col) {
  player = { row, col };
  steps += 1;
  const cellKey = makeKey(row, col);

  if (cellKey === activeLevel.goal) {
    gameStatus.textContent = "ถึงจุดจบแล้ว หมอกเวทมนตร์ถูกปิดผนึก";
  } else {
    gameStatus.textContent = "หมอกเปิดให้เห็นรอบตัว 5 x 5 เลือกเส้นทางต่อไป";
  }

  renderGame();
}

function submitBossAnswer(event) {
  event.preventDefault();
  const boss = activeLevel.bosses[pendingBossKey];

  if (!boss) {
    return;
  }

  if (normalizeAnswer(bossAnswerInput.value) !== normalizeAnswer(boss.answer)) {
    bossFeedback.textContent = "คำตอบยังไม่ผ่าน Boss";
    bossAnswerInput.select();
    return;
  }

  solvedBosses.add(pendingBossKey);
  const next = parseKey(pendingBossKey);
  bossDialog.close();
  pendingBossKey = null;
  moveTo(next.row, next.col);
}

function renderAdminSelect() {
  adminLevelSelect.innerHTML = "";
  levels.forEach((level, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = level.name;
    option.selected = index === activeLevelIndex;
    adminLevelSelect.append(option);
  });
}

function loadAdminLevel(index) {
  activeLevelIndex = Number(index);
  adminLevel = cloneLevel(levels[activeLevelIndex]);
  adminCamera = parseKey(adminLevel.start);
  adminSelected = adminLevel.start;
  adminLevelName.value = adminLevel.name;
  adminRows.value = adminLevel.rows;
  adminCols.value = adminLevel.cols;
  cameraRowInput.value = adminCamera.row;
  cameraColInput.value = adminCamera.col;
  loadBossEditor(adminSelected);
  renderAdmin();
}

function setAdminTool(tool) {
  adminTool = tool;
  toolButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === tool);
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function syncAdminBasics() {
  adminLevel.name = adminLevelName.value.trim() || "Untitled Medicine Map";
  adminLevel.rows = clamp(Number(adminRows.value) || STANDARD_SIZE, 10, STANDARD_SIZE);
  adminLevel.cols = clamp(Number(adminCols.value) || STANDARD_SIZE, 10, STANDARD_SIZE);
  adminRows.value = adminLevel.rows;
  adminCols.value = adminLevel.cols;
}

function renderAdmin() {
  const adminPathSet = new Set(adminLevel.path);
  selectedAdminCell.textContent = adminSelected;
  cameraRowInput.value = adminCamera.row;
  cameraColInput.value = adminCamera.col;
  adminBoard.innerHTML = "";

  const half = Math.floor(ADMIN_VIEW / 2);
  for (let row = adminCamera.row - half; row <= adminCamera.row + half; row += 1) {
    for (let col = adminCamera.col - half; col <= adminCamera.col + half; col += 1) {
      const cellKey = makeKey(row, col);
      const boss = adminLevel.bosses[cellKey];
      const tile = document.createElement("button");
      const valid = inBounds(adminLevel, row, col);
      let type = "outside";

      if (valid) {
        if (cellKey === adminLevel.start) {
          type = "start";
        } else if (cellKey === adminLevel.goal) {
          type = "goal";
        } else if (boss) {
          type = "boss";
        } else if (adminPathSet.has(cellKey)) {
          type = "path";
        } else {
          type = "wall";
        }
      }

      tile.type = "button";
      tile.disabled = !valid;
      tile.className = `admin-tile ${type}`;
      tile.textContent = valid ? adminTileLabel(cellKey, type, boss) : "--";
      tile.classList.toggle("selected", cellKey === adminSelected);
      tile.classList.toggle("boss-1", boss?.difficulty === 1);
      tile.classList.toggle("boss-2", boss?.difficulty === 2);
      tile.classList.toggle("boss-3", boss?.difficulty === 3);
      tile.addEventListener("click", () => editAdminCell(row, col));
      adminBoard.append(tile);
    }
  }

  renderAdminBossList();
}

function adminTileLabel(cellKey, type, boss) {
  if (boss) {
    return `B${boss.difficulty}`;
  }
  if (type === "start") {
    return "S";
  }
  if (type === "goal") {
    return "G";
  }
  if (type === "path") {
    return ".";
  }
  return "#";
}

function editAdminCell(row, col) {
  syncAdminBasics();
  const cellKey = makeKey(row, col);
  const path = new Set(adminLevel.path);

  adminSelected = cellKey;

  if (adminTool === "path") {
    path.add(cellKey);
  }

  if (adminTool === "wall") {
    path.delete(cellKey);
    delete adminLevel.bosses[cellKey];
    if (adminLevel.start === cellKey) {
      adminLevel.start = adminLevel.path[0] || "0,0";
    }
    if (adminLevel.goal === cellKey) {
      adminLevel.goal = adminLevel.start;
    }
  }

  if (adminTool === "start") {
    adminLevel.start = cellKey;
    path.add(cellKey);
  }

  if (adminTool === "goal") {
    adminLevel.goal = cellKey;
    path.add(cellKey);
  }

  if (adminTool === "boss") {
    path.add(cellKey);
    if (!adminLevel.bosses[cellKey]) {
      adminLevel.bosses[cellKey] = {
        difficulty: Number(bossDifficulty.value),
        question: "คำถาม Boss ใหม่",
        answer: "answer",
      };
    }
  }

  adminLevel.path = [...path];
  loadBossEditor(cellKey);
  renderAdmin();
}

function loadBossEditor(cellKey) {
  const boss = adminLevel.bosses[cellKey];
  selectedAdminCell.textContent = cellKey;
  bossDifficulty.value = String(boss?.difficulty ?? 1);
  bossQuestion.value = boss?.question ?? "";
  bossAnswer.value = boss?.answer ?? "";
}

function saveBoss() {
  syncAdminBasics();
  const path = new Set(adminLevel.path);
  path.add(adminSelected);
  adminLevel.path = [...path];
  adminLevel.bosses[adminSelected] = {
    difficulty: Number(bossDifficulty.value),
    question: bossQuestion.value.trim() || "คำถาม Boss ใหม่",
    answer: bossAnswer.value.trim() || "answer",
  };
  renderAdmin();
}

function removeBoss() {
  delete adminLevel.bosses[adminSelected];
  bossQuestion.value = "";
  bossAnswer.value = "";
  renderAdmin();
}

function renderAdminBossList() {
  const entries = Object.entries(adminLevel.bosses);
  adminBossList.innerHTML = "";

  if (entries.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "ยังไม่มี Boss";
    adminBossList.append(empty);
    return;
  }

  entries.forEach(([cellKey, boss]) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "boss-item";
    item.innerHTML = `<strong>${cellKey} / B${boss.difficulty}</strong><span>${boss.question}</span>`;
    item.addEventListener("click", () => {
      adminSelected = cellKey;
      adminCamera = parseKey(cellKey);
      loadBossEditor(cellKey);
      renderAdmin();
    });
    adminBossList.append(item);
  });
}

function saveAdminMap() {
  syncAdminBasics();
  const path = new Set(adminLevel.path);
  path.add(adminLevel.start);
  path.add(adminLevel.goal);
  Object.keys(adminLevel.bosses).forEach((cellKey) => path.add(cellKey));
  adminLevel.path = [...path];
  levels[activeLevelIndex] = cloneLevel(adminLevel);
  saveLevels();
  activeLevel = cloneLevel(levels[activeLevelIndex]);
  pathSet = new Set(activeLevel.path);
  renderAdminSelect();
  renderAdmin();
}

function createNewMap() {
  const nextNumber = levels.length + 1;
  const fresh = {
    id: `custom-map-${Date.now()}`,
    name: `Custom Medicine Map ${nextNumber}`,
    description: "ด่านใหม่จากระบบหลังบ้าน",
    rows: STANDARD_SIZE,
    cols: STANDARD_SIZE,
    start: "50,50",
    goal: "50,54",
    path: createPath([
      [50, 50],
      [50, 54],
    ]),
    bosses: {
      "50,54": {
        difficulty: 1,
        question: "พิมพ์คำว่า med เพื่อผ่าน Boss แรก",
        answer: "med",
      },
    },
  };

  levels.push(fresh);
  activeLevelIndex = levels.length - 1;
  saveLevels();
  renderAdminSelect();
  loadAdminLevel(activeLevelIndex);
}

function panAdmin(direction) {
  const [rowStep, colStep] = directions[direction];
  syncAdminBasics();
  adminCamera = {
    row: clamp(adminCamera.row + rowStep * 5, 0, adminLevel.rows - 1),
    col: clamp(adminCamera.col + colStep * 5, 0, adminLevel.cols - 1),
  };
  renderAdmin();
}

function jumpAdminCamera() {
  syncAdminBasics();
  adminCamera = {
    row: clamp(Number(cameraRowInput.value) || 0, 0, adminLevel.rows - 1),
    col: clamp(Number(cameraColInput.value) || 0, 0, adminLevel.cols - 1),
  };
  renderAdmin();
}

document.querySelectorAll("[data-screen-target]").forEach((button) => {
  button.addEventListener("click", () => showScreen(button.dataset.screenTarget));
});

document.querySelectorAll("[data-move]").forEach((button) => {
  button.addEventListener("click", () => {
    const [rowStep, colStep] = directions[button.dataset.move];
    tryMove(player.row + rowStep, player.col + colStep);
  });
});

document.querySelectorAll("[data-pan]").forEach((button) => {
  button.addEventListener("click", () => panAdmin(button.dataset.pan));
});

continueButton.addEventListener("click", () => startLevel(activeLevelIndex));
restartLevelButton.addEventListener("click", () => startLevel(activeLevelIndex));
bossForm.addEventListener("submit", submitBossAnswer);
cancelBossButton.addEventListener("click", () => {
  pendingBossKey = null;
  bossDialog.close();
});
adminLevelSelect.addEventListener("change", () => loadAdminLevel(adminLevelSelect.value));
newMapButton.addEventListener("click", createNewMap);
saveMapButton.addEventListener("click", saveAdminMap);
saveBossButton.addEventListener("click", saveBoss);
removeBossButton.addEventListener("click", removeBoss);
cameraRowInput.addEventListener("change", jumpAdminCamera);
cameraColInput.addEventListener("change", jumpAdminCamera);
toolButtons.forEach((button) => {
  button.addEventListener("click", () => setAdminTool(button.dataset.tool));
});

renderLevelList();
renderAdminSelect();
renderGame();

if (window.location.hash === "#screen-game") {
  startLevel(activeLevelIndex);
} else if (window.location.hash === "#screen-admin") {
  showScreen("screen-admin");
} else if (window.location.hash === "#screen-levels") {
  showScreen("screen-levels");
}
