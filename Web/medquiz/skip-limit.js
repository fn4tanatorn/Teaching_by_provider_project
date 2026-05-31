const skipLimitBtn = document.getElementById("skipLimitBtn");

if (skipLimitBtn && MedQuizStorage.isAdminMode()) {
  skipLimitBtn.classList.remove("hidden");
}
