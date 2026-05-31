const ADMIN_CODE = "admin061";

const adminModeBtn = document.getElementById("adminModeBtn");
const adminModal = document.getElementById("adminModal");
const adminCodeInput = document.getElementById("adminCodeInput");
const adminCodeError = document.getElementById("adminCodeError");
const adminCancel = document.getElementById("adminCancel");
const adminConfirm = document.getElementById("adminConfirm");

function updateAdminModeButton() {
  if (!adminModeBtn) return;

  const on = MedQuizStorage.isAdminMode();
  adminModeBtn.classList.toggle("admin-mode-btn--on", on);
  adminModeBtn.textContent = on ? "Admin mode: ON" : "Admin mode";
  adminModeBtn.setAttribute("aria-pressed", String(on));
}

function setAdminCodeError(message) {
  if (!adminCodeError) return;
  if (message) {
    adminCodeError.textContent = message;
    adminCodeError.classList.remove("hidden");
  } else {
    adminCodeError.textContent = "";
    adminCodeError.classList.add("hidden");
  }
}

function openAdminModal() {
  adminModal?.classList.remove("hidden");
  setAdminCodeError("");
  if (adminCodeInput) {
    adminCodeInput.value = "";
    adminCodeInput.focus();
  }
  if (adminConfirm) adminConfirm.disabled = true;
}

function closeAdminModal() {
  adminModal?.classList.add("hidden");
  setAdminCodeError("");
  if (adminCodeInput) adminCodeInput.value = "";
  if (adminConfirm) adminConfirm.disabled = true;
}

function isCodeValid() {
  return adminCodeInput?.value.trim() === ADMIN_CODE;
}

function enableAdminMode() {
  MedQuizStorage.setAdminMode(true);
  updateAdminModeButton();
  closeAdminModal();
}

adminModeBtn?.addEventListener("click", () => {
  if (MedQuizStorage.isAdminMode()) {
    MedQuizStorage.setAdminMode(false);
    updateAdminModeButton();
    return;
  }
  openAdminModal();
});

adminCancel?.addEventListener("click", closeAdminModal);

adminModal?.querySelectorAll("[data-admin-close]").forEach((el) => {
  el.addEventListener("click", closeAdminModal);
});

adminCodeInput?.addEventListener("input", () => {
  setAdminCodeError("");
  if (adminConfirm) adminConfirm.disabled = !isCodeValid();
});

adminCodeInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && adminConfirm && !adminConfirm.disabled) {
    enableAdminMode();
  }
  if (e.key === "Escape") {
    closeAdminModal();
  }
});

adminConfirm?.addEventListener("click", () => {
  if (!isCodeValid()) {
    setAdminCodeError("รหัสไม่ถูกต้อง");
    return;
  }
  enableAdminMode();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && adminModal && !adminModal.classList.contains("hidden")) {
    closeAdminModal();
  }
});

updateAdminModeButton();
