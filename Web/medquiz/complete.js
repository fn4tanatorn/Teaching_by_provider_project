if (MedQuizStorage.isAdminMode()) {
  const homeBtn = document.querySelector(".quota-btn");
  if (homeBtn) homeBtn.classList.add("hidden");
}

if (typeof MedQuizConfig !== "undefined" && MedQuizConfig.TEST_MODE) {
  const homeBtn = document.querySelector(".quota-btn");
  if (homeBtn) homeBtn.classList.add("hidden");

  const section = document.querySelector(".quota");
  if (section) {
    const note = document.createElement("p");
    note.className = "quota-test-note";
    note.textContent = "โหมดทดสอบ — เริ่มชุดใหม่ได้";

    const link = document.createElement("a");
    link.href = "quiz.html";
    link.className = "btn primary quota-btn";
    link.textContent = "ทำต่อ";
    link.addEventListener("click", () => {
      MedQuizStorage.clearSession();
    });

    section.appendChild(note);
    section.appendChild(link);
  }
}
