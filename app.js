const boardElement = document.querySelector("#board");
const rowInput = document.querySelector("#rowInput");
const columnInput = document.querySelector("#columnInput");
const applySizeButton = document.querySelector("#applySizeButton");
const sampleButton = document.querySelector("#sampleButton");
const resetRunButton = document.querySelector("#resetRunButton");
const statusText = document.querySelector("#statusText");
const progressCount = document.querySelector("#progressCount");
const stepCount = document.querySelector("#stepCount");
const questionCount = document.querySelector("#questionCount");
const questionList = document.querySelector("#questionList");
const selectedCellLabel = document.querySelector("#selectedCellLabel");
const questionInput = document.querySelector("#questionInput");
const answerInput = document.querySelector("#answerInput");
const saveQuestionButton = document.querySelector("#saveQuestionButton");
const clearQuestionButton = document.querySelector("#clearQuestionButton");
const modeButtons = [...document.querySelectorAll(".mode-button")];
const questionDialog = document.querySelector("#questionDialog");
const questionForm = document.querySelector("#questionForm");
const dialogQuestion = document.querySelector("#dialogQuestion");
const dialogAnswer = document.querySelector("#dialogAnswer");
const answerFeedback = document.querySelector("#answerFeedback");
const cancelQuestionButton = document.querySelector("#cancelQuestionButton");

const sampleGame = {
  rows: 6,
  cols: 7,
  start: "0,0",
  goal: "5,6",
  walkable: [
    "0,0",
    "0,1",
    "0,2",
    "1,2",
    "2,2",
    "2,3",
    "2,4",
    "1,4",
    "0,4",
    "0,5",
    "1,5",
    "2,5",
    "3,5",
    "3,4",
    "4,4",
    "5,4",
    "5,5",
    "5,6",
    "3,2",
    "4,2",
    "4,3",
  ],
  questions: {
    "0,2": { question: "HTML ย่อมาจาก HyperText Markup Language ใช่หรือไม่", answer: "ใช่" },
    "2,4": { question: "5 + 7 = ?", answer: "12" },
    "3,5": { question: "CSS ใช้จัดรูปแบบหน้าเว็บ ใช่หรือไม่", answer: "ใช่" },
    "4,3": { question: "JavaScript ทำให้หน้าเว็บโต้ตอบได้ ใช่หรือไม่", answer: "ใช่" },
    "5,6": { question: "พิมพ์คำว่า finish เพื่อจบเกม", answer: "finish" },
  },
};

let state = structuredClone(sampleGame);
let player = state.start;
let selectedCell = state.start;
let mode = "play";
let pendingMove = null;
let solved = new Set();
let steps = 0;

function key(row, col) {
  return `${row},${col}`;
}

function parseKey(cellKey) {
  const [row, col] = cellKey.split(",").map(Number);
  return { row, col };
}

function isAdjacent(a, b) {
  const first = parseKey(a);
  const second = parseKey(b);
  return Math.abs(first.row - second.row) + Math.abs(first.col - second.col) === 1;
}

function normalizeAnswer(value) {
  return value.trim().toLowerCase();
}

function clampBoardSize() {
  state.rows = Math.min(10, Math.max(3, Number(rowInput.value) || 6));
  state.cols = Math.min(12, Math.max(3, Number(columnInput.value) || 7));
  rowInput.value = state.rows;
  columnInput.value = state.cols;
}

function resetRun() {
  player = state.start;
  selectedCell = state.start;
  solved = new Set();
  steps = 0;
  pendingMove = null;
  statusText.textContent = "เลือกช่องติดกันเพื่อเริ่มเดิน";
  render();
}

function applyBoardSize() {
  clampBoardSize();
  const validCells = new Set();

  for (let row = 0; row < state.rows; row += 1) {
    for (let col = 0; col < state.cols; col += 1) {
      validCells.add(key(row, col));
    }
  }

  state.walkable = state.walkable.filter((cellKey) => validCells.has(cellKey));
  Object.keys(state.questions).forEach((cellKey) => {
    if (!validCells.has(cellKey)) {
      delete state.questions[cellKey];
    }
  });

  if (!validCells.has(state.start)) {
    state.start = "0,0";
  }

  if (!validCells.has(state.goal)) {
    state.goal = key(state.rows - 1, state.cols - 1);
  }

  state.walkable = [...new Set([state.start, state.goal, ...state.walkable])];
  resetRun();
}

function setMode(nextMode) {
  mode = nextMode;
  modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });
  statusText.textContent =
    mode === "play"
      ? "เลือกช่องติดกันเพื่อเริ่มเดิน"
      : mode === "path"
        ? "เลือกช่องเพื่อเปิดหรือปิดทางเดิน"
        : mode === "question"
          ? "เลือกช่องทางเดินเพื่อแก้โจทย์"
          : "เลือกจุดเริ่ม แล้วกดช่องเดิมอีกครั้งเพื่อสลับเป็นจุดจบ";
  render();
}

function selectCell(cellKey) {
  selectedCell = cellKey;
  selectedCellLabel.textContent = cellKey;
  const question = state.questions[cellKey];
  questionInput.value = question?.question ?? "";
  answerInput.value = question?.answer ?? "";
}

function handleCellClick(cellKey) {
  if (mode === "path") {
    togglePath(cellKey);
    return;
  }

  if (mode === "question") {
    if (!state.walkable.includes(cellKey)) {
      state.walkable.push(cellKey);
    }
    selectCell(cellKey);
    render();
    return;
  }

  if (mode === "marker") {
    updateMarker(cellKey);
    return;
  }

  movePlayer(cellKey);
}

function togglePath(cellKey) {
  if (cellKey === state.start || cellKey === state.goal) {
    statusText.textContent = "จุดเริ่มและจุดจบต้องเป็นทางเดิน";
    return;
  }

  if (state.walkable.includes(cellKey)) {
    state.walkable = state.walkable.filter((item) => item !== cellKey);
    delete state.questions[cellKey];
  } else {
    state.walkable.push(cellKey);
  }

  selectCell(cellKey);
  render();
}

function updateMarker(cellKey) {
  if (cellKey === state.start) {
    state.goal = cellKey;
    statusText.textContent = `ตั้ง ${cellKey} เป็นจุดจบ`;
  } else {
    state.start = cellKey;
    statusText.textContent = `ตั้ง ${cellKey} เป็นจุดเริ่ม`;
  }

  if (!state.walkable.includes(cellKey)) {
    state.walkable.push(cellKey);
  }

  resetRun();
}

function movePlayer(cellKey) {
  const canMove = state.walkable.includes(cellKey) && isAdjacent(player, cellKey);

  if (!canMove) {
    statusText.textContent = "เลือกได้เฉพาะช่องทางเดินที่ติดกับตัวผู้เล่น";
    render();
    return;
  }

  const question = state.questions[cellKey];
  if (question && !solved.has(cellKey)) {
    pendingMove = cellKey;
    dialogQuestion.textContent = question.question;
    dialogAnswer.value = "";
    answerFeedback.textContent = "";
    questionDialog.showModal();
    dialogAnswer.focus();
    return;
  }

  completeMove(cellKey);
}

function completeMove(cellKey) {
  player = cellKey;
  selectedCell = cellKey;
  steps += 1;

  if (player === state.goal) {
    statusText.textContent = "ถึงเส้นชัยแล้ว";
  } else {
    statusText.textContent = "เลือกช่องติดกันเพื่อเดินต่อ";
  }

  render();
}

function saveQuestion() {
  if (!selectedCell) {
    return;
  }

  if (!state.walkable.includes(selectedCell)) {
    state.walkable.push(selectedCell);
  }

  const question = questionInput.value.trim();
  const answer = answerInput.value.trim();

  if (!question || !answer) {
    statusText.textContent = "ใส่คำถามและคำตอบก่อนบันทึก";
    return;
  }

  state.questions[selectedCell] = { question, answer };
  statusText.textContent = `บันทึกโจทย์ที่ช่อง ${selectedCell}`;
  render();
}

function clearQuestion() {
  if (!selectedCell) {
    return;
  }

  delete state.questions[selectedCell];
  questionInput.value = "";
  answerInput.value = "";
  solved.delete(selectedCell);
  statusText.textContent = `ลบโจทย์ที่ช่อง ${selectedCell}`;
  render();
}

function submitAnswer(event) {
  event.preventDefault();

  if (!pendingMove) {
    return;
  }

  const question = state.questions[pendingMove];
  const isCorrect = normalizeAnswer(dialogAnswer.value) === normalizeAnswer(question.answer);

  if (!isCorrect) {
    answerFeedback.textContent = "ยังไม่ถูก ลองอีกครั้ง";
    dialogAnswer.select();
    return;
  }

  solved.add(pendingMove);
  questionDialog.close();
  completeMove(pendingMove);
  pendingMove = null;
}

function renderQuestionList() {
  const entries = Object.entries(state.questions);
  questionCount.textContent = entries.length;
  questionList.innerHTML = "";

  if (entries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "question-item";
    empty.textContent = "ยังไม่มีโจทย์";
    questionList.append(empty);
    return;
  }

  entries.forEach(([cellKey, value]) => {
    const item = document.createElement("button");
    item.className = "question-item";
    item.type = "button";
    item.innerHTML = `<strong>${cellKey}</strong><span>${value.question}</span>`;
    item.addEventListener("click", () => {
      setMode("question");
      selectCell(cellKey);
      render();
    });
    questionList.append(item);
  });
}

function render() {
  boardElement.style.setProperty("--rows", state.rows);
  boardElement.style.setProperty("--cols", state.cols);
  boardElement.innerHTML = "";
  progressCount.textContent = solved.size;
  stepCount.textContent = steps;
  selectedCellLabel.textContent = selectedCell ?? "-";

  for (let row = 0; row < state.rows; row += 1) {
    for (let col = 0; col < state.cols; col += 1) {
      const cellKey = key(row, col);
      const cell = document.createElement("button");
      const hasQuestion = Boolean(state.questions[cellKey]);
      const isWalkable = state.walkable.includes(cellKey);
      const canMove = mode === "play" && isWalkable && isAdjacent(player, cellKey);

      cell.type = "button";
      cell.className = "cell";
      cell.textContent = cellKey;
      cell.setAttribute("aria-label", `ช่อง ${cellKey}`);
      cell.classList.toggle("walkable", isWalkable);
      cell.classList.toggle("available", canMove);
      cell.classList.toggle("start", cellKey === state.start);
      cell.classList.toggle("goal", cellKey === state.goal);
      cell.classList.toggle("player", cellKey === player);
      cell.classList.toggle("selected", cellKey === selectedCell);
      cell.classList.toggle("locked", hasQuestion && !solved.has(cellKey));
      cell.classList.toggle("solved", hasQuestion && solved.has(cellKey));
      cell.addEventListener("click", () => handleCellClick(cellKey));
      boardElement.append(cell);
    }
  }

  renderQuestionList();
}

applySizeButton.addEventListener("click", applyBoardSize);
sampleButton.addEventListener("click", () => {
  state = structuredClone(sampleGame);
  rowInput.value = state.rows;
  columnInput.value = state.cols;
  resetRun();
});
resetRunButton.addEventListener("click", resetRun);
saveQuestionButton.addEventListener("click", saveQuestion);
clearQuestionButton.addEventListener("click", clearQuestion);
questionForm.addEventListener("submit", submitAnswer);
cancelQuestionButton.addEventListener("click", () => {
  pendingMove = null;
  questionDialog.close();
});
modeButtons.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

rowInput.value = sampleGame.rows;
columnInput.value = sampleGame.cols;
selectCell(state.start);
render();
