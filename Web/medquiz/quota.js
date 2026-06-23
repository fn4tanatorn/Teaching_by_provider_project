const RESET_WORD = "reset";

const countEl = document.getElementById("correctCount");
if (countEl) {
  countEl.textContent = String(MedQuizStorage.loadCorrectTotal());
}

async function loadBankTotal() {
  const bankEl = document.getElementById("bankTotal");
  if (!bankEl) return;

  try {
    const res = await fetch("/api/stats");
    const data = await res.json();
    if (res.ok && typeof data.total === "number") {
      bankEl.textContent = String(data.total);
    }
  } catch {
    bankEl.textContent = "—";
  }
}

loadBankTotal();

const resetBtn = document.getElementById("resetBtn");
const resetModal = document.getElementById("resetModal");
const resetInput = document.getElementById("resetInput");
const resetCancel = document.getElementById("resetCancel");
const resetConfirm = document.getElementById("resetConfirm");

function openResetModal() {
  resetModal?.classList.remove("hidden");
  if (resetInput) {
    resetInput.value = "";
    resetInput.focus();
  }
  if (resetConfirm) resetConfirm.disabled = true;
}

function closeResetModal() {
  resetModal?.classList.add("hidden");
  if (resetInput) resetInput.value = "";
  if (resetConfirm) resetConfirm.disabled = true;
}

function performReset() {
  MedQuizStorage.clearAll();
  window.location.href = "index.html";
}

resetBtn?.addEventListener("click", openResetModal);

resetCancel?.addEventListener("click", closeResetModal);

resetModal?.querySelectorAll("[data-reset-close]").forEach((el) => {
  el.addEventListener("click", closeResetModal);
});

resetInput?.addEventListener("input", () => {
  const match = resetInput.value.trim().toLowerCase() === RESET_WORD;
  if (resetConfirm) resetConfirm.disabled = !match;
});

resetInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && resetConfirm && !resetConfirm.disabled) {
    performReset();
  }
  if (e.key === "Escape") {
    closeResetModal();
  }
});

resetConfirm?.addEventListener("click", () => {
  if (resetInput?.value.trim().toLowerCase() !== RESET_WORD) return;
  performReset();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && resetModal && !resetModal.classList.contains("hidden")) {
    closeResetModal();
  }
});

if (typeof MedQuizConfig !== "undefined" && MedQuizConfig.TEST_MODE) {
  const section = document.querySelector(".quota");
  if (section) {
    const note = document.createElement("p");
    note.className = "quota-test-note";
    note.textContent = "Test mode: you can keep practicing. Refresh or use the button below.";

    const link = document.createElement("a");
    link.href = "quiz.html";
    link.className = "btn primary quota-btn";
    link.textContent = "Continue";

    section.appendChild(note);
    section.appendChild(link);
  }
}
