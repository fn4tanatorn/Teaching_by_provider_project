(function () {
  const page = document.body.dataset.page;
  const params = new URLSearchParams(window.location.search);
  const letters = ["A", "B", "C", "D", "E"];
  const apiBase = String(window.LiveQuizConfig?.apiBase || "api").replace(/\/+$/, "");

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function storageKey(kind, code) {
    return `livequiz:${kind}:${String(code || "").toUpperCase()}`;
  }

  async function api(path, options = {}) {
    const cleanPath = String(path || "").replace(/^\/api\/?/, "").replace(/^\/+/, "");
    const res = await fetch(`${apiBase}/${cleanPath}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  function setStatus(el, message, type) {
    if (!el) return;
    el.textContent = message || "";
    el.className = `status ${type || ""}`.trim();
  }

  function secondsLeft(endsAt) {
    if (!endsAt) return null;
    return Math.max(0, Math.ceil((Date.parse(endsAt) - Date.now()) / 1000));
  }

  function renderTimer(el, endsAt, state) {
    if (!el) return;
    if (state !== "question_active") {
      el.textContent = "--";
      return;
    }
    el.textContent = String(secondsLeft(endsAt));
  }

  function renderQuestionBlock(question, index) {
    if (!question) return "";
    const image = question.imageUrl
      ? `<img class="question-image" src="${escapeHtml(question.imageUrl)}" alt="Question image" />`
      : "";
    return `
      <div class="list-item">
        <span class="pill">Question ${index + 1}</span>
        ${question.state === "voided" ? '<span class="pill danger">Voided</span>' : ""}
        <h1>${escapeHtml(question.prompt || "Image question")}</h1>
        ${image}
      </div>
    `;
  }

  function choiceName(question, id) {
    if (!question || !id) return "";
    const choice = question.choices.find((item) => item.id === id);
    return choice ? `${choice.id}. ${choice.text}` : id;
  }

  function initHome() {
    const roomParam = params.get("room");
    if (roomParam && $("joinCode")) $("joinCode").value = roomParam;

    $("joinRoomForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const code = $("joinCode").value.trim().toUpperCase();
      const username = $("joinUsername").value.trim();
      const existing = localStorage.getItem(storageKey("participant", code));
      setStatus($("joinStatus"), "Joining room...");
      try {
        const data = await api("/api/join", {
          method: "POST",
          body: JSON.stringify({ code, username, sessionToken: existing }),
        });
        localStorage.setItem(storageKey("participant", data.roomCode), data.sessionToken);
        let redirectUrl = data.participantUrl;
        if (window.location.search.includes("embed=1")) {
          redirectUrl += (redirectUrl.includes("?") ? "&" : "?") + "embed=1";
        }
        window.location.href = redirectUrl;
      } catch (err) {
        setStatus($("joinStatus"), err.message, "error");
      }
    });
  }

  function setupCreateRoomForm() {
    const form = $("createRoomForm");
    if (!form) return;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setStatus($("createStatus"), "Creating room...");
      try {
        const data = await api("/api/rooms", {
          method: "POST",
          body: JSON.stringify({ globalTimeLimitSeconds: $("defaultTime").value }),
        });
        localStorage.setItem(storageKey("host", data.roomCode), data.hostToken);
        let redirectUrl = data.hostUrl;
        if (window.location.search.includes("embed=1")) {
          redirectUrl += (redirectUrl.includes("?") ? "&" : "?") + "embed=1";
        }
        window.location.href = redirectUrl;
      } catch (err) {
        setStatus($("createStatus"), err.message, "error");
      }
    });
  }

  function connectSSE(url, onMessage) {
    let es;
    function open() {
      es = new EventSource(url);
      es.onmessage = (event) => {
        try { onMessage(JSON.parse(event.data)); } catch {}
      };
      es.onerror = () => {
        es.close();
        setTimeout(open, 3000);
      };
    }
    open();
    return { close() { es.close(); } };
  }

  function initHost() {
    const code = (params.get("room") || "").trim().toUpperCase();
    const queryToken = params.get("token");
    const hostToken = queryToken || localStorage.getItem(storageKey("host", code));
    let lastState = null;
    let editQuestionId = null;

    if (code && queryToken) localStorage.setItem(storageKey("host", code), queryToken);

    if (!code || !hostToken) {
      $("hostCreatePanel")?.classList.remove("hidden");
      $("hostConsole")?.classList.add("hidden");
      setupCreateRoomForm();
      return;
    }

    $("hostCreatePanel")?.classList.add("hidden");
    $("hostConsole")?.classList.remove("hidden");

    $("roomCode").textContent = code || "------";
    $("exportCsv").href = `${apiBase}/rooms/${code}/export.csv?token=${encodeURIComponent(hostToken || "")}`;

    function hostHeaders() {
      return { "X-Host-Token": hostToken };
    }

    async function refresh() {
      if (!code || !hostToken) {
        setStatus($("hostStatus"), "Missing host token. Use the private host link created with the room.", "error");
        return;
      }
      try {
        lastState = await api(`/api/rooms/${code}/host`, { headers: hostHeaders() });
        renderHost(lastState);
      } catch (err) {
        setStatus($("hostStatus"), err.message, "error");
      }
    }

    function renderHost(state) {
      const canEditQuestions = ["lobby", "draft"].includes(state.state);
      $("roomState").textContent = state.state.replace(/_/g, " ");
      $("globalTime").value = state.globalTimeLimitSeconds;
      $("questionCount").textContent = `${state.questions.length} question${state.questions.length === 1 ? "" : "s"}`;
      $("participantCount").textContent = `${state.participants.length} joined`;
      $("openLobby").classList.toggle("hidden", state.state !== "draft");
      $("startQuiz").disabled = state.state !== "lobby";
      $("builderPanel").classList.remove("hidden");
      $("questionForm").classList.toggle("hidden", !canEditQuestions);
      $("importDropZone")?.classList.toggle("hidden", !canEditQuestions);
      $("importStatus")?.classList.toggle("hidden", !canEditQuestions);
      $("settingsForm")?.querySelectorAll("input, button").forEach((el) => {
        el.disabled = !canEditQuestions;
      });
      $("livePanel").classList.toggle("hidden", ["lobby", "draft"].includes(state.state));
      $("exportCsv").classList.toggle("hidden", state.state !== "finished");
      $("exportXlsx").classList.toggle("hidden", state.state !== "finished");
      renderTimer($("timer"), state.endsAt, state.state);
      renderParticipants(state);
      renderQuestionList(state);
      renderHostLive(state);
    }

    function renderParticipants(state) {
      const list = $("participantList");
      if (state.state === "draft") {
        list.innerHTML = '<div class="list-item muted">Lobby is not open yet. Add questions, then open the lobby for participants.</div>';
        return;
      }
      if (!state.participants.length) {
        list.innerHTML = '<div class="list-item muted">No participants yet.</div>';
        return;
      }
      list.innerHTML = state.participants
        .map(
          (p) => `
            <div class="list-item split">
              <div>
                <strong>${escapeHtml(p.username)}</strong>
                <div class="hint">${p.active ? "Active" : "Stale lock released"} · Score ${p.totalScore}</div>
              </div>
              <div class="item-actions">
                <button type="button" class="button-secondary" data-release="${escapeHtml(p.id)}">Release lock</button>
                <button type="button" class="button-danger" data-kick="${escapeHtml(p.id)}">Kick</button>
              </div>
            </div>
          `
        )
        .join("");
      list.querySelectorAll("[data-kick]").forEach((button) => {
        button.addEventListener("click", async () => {
          await api(`/api/rooms/${code}/kick`, {
            method: "POST",
            headers: hostHeaders(),
            body: JSON.stringify({ participantId: button.dataset.kick }),
          });
          refresh();
        });
      });
      list.querySelectorAll("[data-release]").forEach((button) => {
        button.addEventListener("click", async () => {
          await api(`/api/rooms/${code}/release`, {
            method: "POST",
            headers: hostHeaders(),
            body: JSON.stringify({ participantId: button.dataset.release }),
          });
          refresh();
        });
      });
    }

    function renderQuestionList(state) {
      const list = $("questionList");
      if (!state.questions.length) {
        list.innerHTML = '<div class="list-item muted">Add at least one MCQ before starting.</div>';
        return;
      }
      list.innerHTML = state.questions
        .map((q) => {
          const time = q.timeLimitSeconds ? `${q.timeLimitSeconds}s override` : `${state.globalTimeLimitSeconds}s default`;
          const canEdit = ["lobby", "draft"].includes(state.state);
          const canVoid = q.state !== "voided" && state.state !== "finished";
          const canMoveUp = canEdit && q.position > 1;
          const canMoveDown = canEdit && q.position < state.questions.length;
          return `
            <div class="list-item">
              <div class="split">
                <strong>${q.position}. ${escapeHtml(q.prompt || "Image question")}</strong>
                <span class="pill ${q.state === "voided" ? "danger" : ""}">${escapeHtml(q.state)}</span>
              </div>
              <div class="hint">${escapeHtml(time)} · Correct ${escapeHtml(q.correctChoiceId)}</div>
              <div class="item-actions" style="margin-top: 0.65rem">
                ${
                  canEdit
                    ? `<button type="button" class="button-ghost" data-move-question="${escapeHtml(q.id)}" data-direction="up" ${canMoveUp ? "" : "disabled"}>Up</button>
                       <button type="button" class="button-ghost" data-move-question="${escapeHtml(q.id)}" data-direction="down" ${canMoveDown ? "" : "disabled"}>Down</button>
                       <button type="button" class="button-secondary" data-edit-question="${escapeHtml(q.id)}">Edit</button>
                       <button type="button" class="button-ghost" data-delete-question="${escapeHtml(q.id)}">Delete</button>`
                    : ""
                }
                ${canVoid ? `<button type="button" class="button-danger" data-void-question="${escapeHtml(q.id)}">Void</button>` : ""}
              </div>
            </div>
          `;
        })
        .join("");
      list.querySelectorAll("[data-edit-question]").forEach((button) => {
        button.addEventListener("click", () => {
          const question = lastState?.questions.find((q) => q.id === button.dataset.editQuestion);
          if (question) startEditingQuestion(question);
        });
      });
      list.querySelectorAll("[data-move-question]").forEach((button) => {
        button.addEventListener("click", async () => {
          if (button.disabled) return;
          lastState = await api(`/api/rooms/${code}/questions/${button.dataset.moveQuestion}/move`, {
            method: "POST",
            headers: hostHeaders(),
            body: JSON.stringify({ direction: button.dataset.direction }),
          });
          renderHost(lastState);
        });
      });
      list.querySelectorAll("[data-delete-question]").forEach((button) => {
        button.addEventListener("click", async () => {
          if (!window.confirm("Delete this question before starting the quiz?")) return;
          lastState = await api(`/api/rooms/${code}/questions/${button.dataset.deleteQuestion}`, {
            method: "DELETE",
            headers: hostHeaders(),
          });
          if (editQuestionId === button.dataset.deleteQuestion) resetQuestionForm();
          renderHost(lastState);
          setStatus($("hostStatus"), "Question deleted.", "ok");
        });
      });
      list.querySelectorAll("[data-void-question]").forEach((button) => {
        button.addEventListener("click", async () => {
          if (!window.confirm("Void this question? It will not affect scores.")) return;
          lastState = await api(`/api/rooms/${code}/questions/${button.dataset.voidQuestion}/void`, {
            method: "POST",
            headers: hostHeaders(),
          });
          renderHost(lastState);
          setStatus($("hostStatus"), "Question voided.", "ok");
        });
      });
    }

    function renderHostLive(state) {
      if (["lobby", "draft"].includes(state.state)) return;
      const question = state.currentQuestion;
      $("liveTitle").textContent = state.state === "finished" ? "Quiz finished" : "Live question";
      $("hostQuestion").innerHTML = question
        ? renderQuestionBlock(question, state.currentQuestionIndex)
        : '<div class="list-item muted">No active question.</div>';
      $("voidQuestion").disabled = !question || question.state === "voided" || state.state === "finished";
      $("nextQuestion").disabled = state.state !== "question_reveal";
      $("nextQuestion").textContent = state.currentQuestionIndex >= state.questions.length - 1 ? "Finish quiz" : "Next question";

      if (state.state === "finished") {
        $("hostReveal").innerHTML = `<p class="status ok">Final scores are ready for CSV export.</p>`;
        return;
      }
      if (state.state !== "question_reveal" || !state.revealStats || !question) {
        $("hostReveal").innerHTML = '<p class="hint">Waiting for the server timer to expire.</p>';
        return;
      }
      const total = Math.max(1, state.revealStats.totalParticipants);
      const rows = question.choices
        .map((choice) => {
          const group = state.revealStats.groups[choice.id] || { count: 0, names: [] };
          const pct = Math.round((group.count / total) * 100);
          return distributionRow(`${choice.id}. ${choice.text}`, group, pct, choice.id === question.correctChoiceId);
        })
        .join("");
      const noAnswer = state.revealStats.groups.NO_ANSWER || { count: 0, names: [] };
      $("hostReveal").innerHTML = `
        <h3>Distribution</h3>
        ${rows}
        ${distributionRow("No answer", noAnswer, Math.round((noAnswer.count / total) * 100), false)}
        <p><strong>Correct answer:</strong> ${escapeHtml(choiceName(question, question.correctChoiceId))}</p>
        ${question.explanation ? `<p><strong>Explanation:</strong> ${escapeHtml(question.explanation)}</p>` : ""}
      `;
    }

    function questionFormPayload() {
      return {
        prompt: $("prompt").value,
        imageUrl: $("imageUrl").value,
        choices: letters.map((letter) => $(`choice${letter}`).value),
        correctChoiceId: $("correctChoice").value,
        explanation: $("explanation").value,
        timeLimitSeconds: $("timeLimit").value,
      };
    }

    function renderImagePreview() {
      const preview = $("imagePreview");
      const value = $("imageUrl").value.trim();
      if (!value) {
        preview.classList.add("hidden");
        preview.innerHTML = "";
        return;
      }
      preview.classList.remove("hidden");
      preview.innerHTML = `<img src="${escapeHtml(value)}" alt="Question image preview" />`;
    }

    function resetQuestionForm() {
      editQuestionId = null;
      $("questionForm").reset();
      $("questionSubmit").textContent = "Add question";
      $("cancelEditQuestion").classList.add("hidden");
      renderImagePreview();
    }

    function startEditingQuestion(question) {
      editQuestionId = question.id;
      $("prompt").value = question.prompt || "";
      $("imageUrl").value = question.imageUrl || "";
      for (const letter of letters) {
        const choice = question.choices.find((item) => item.id === letter);
        $(`choice${letter}`).value = choice?.text || "";
      }
      $("correctChoice").value = question.correctChoiceId || "A";
      $("explanation").value = question.explanation || "";
      $("timeLimit").value = question.timeLimitSeconds || "";
      $("questionSubmit").textContent = "Save question";
      $("cancelEditQuestion").classList.remove("hidden");
      renderImagePreview();
      $("questionForm").scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function setupImageUploadEvents() {
      const input = $("imageFile");
      const pick = $("pickImageFile");
      const clear = $("clearImage");
      if (!input || !pick || !clear) return;

      pick.addEventListener("click", () => input.click());
      clear.addEventListener("click", () => {
        $("imageUrl").value = "";
        input.value = "";
        renderImagePreview();
      });
      $("imageUrl").addEventListener("input", renderImagePreview);
      input.addEventListener("change", () => {
        const file = input.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) {
          setStatus($("hostStatus"), "Please choose an image file.", "error");
          return;
        }
        if (file.size > 2_500_000) {
          setStatus($("hostStatus"), "Image is too large for the local prototype. Use an image URL or a smaller file.", "error");
          input.value = "";
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          $("imageUrl").value = String(reader.result || "");
          renderImagePreview();
          setStatus($("hostStatus"), "Image attached to question.", "ok");
        };
        reader.onerror = () => setStatus($("hostStatus"), "Could not read image file.", "error");
        reader.readAsDataURL(file);
      });
    }

    function exportResultsXlsx() {
      if (!lastState || lastState.state !== "finished") return;
      if (!window.XLSX) {
        setStatus($("hostStatus"), "XLSX library is still loading. Try again in a moment.", "error");
        return;
      }
      const rows = [["username", "total_score"]].concat(
        lastState.participants.map((participant) => [participant.username, participant.totalScore])
      );
      const workbook = window.XLSX.utils.book_new();
      const worksheet = window.XLSX.utils.aoa_to_sheet(rows);
      window.XLSX.utils.book_append_sheet(workbook, worksheet, "Results");
      window.XLSX.writeFile(workbook, `livequiz-${lastState.code}-results.xlsx`);
    }

    function distributionRow(label, group, pct, correct) {
      return `
        <div class="bar">
          <div><strong>${escapeHtml(label)}</strong>${correct ? ' <span class="pill">Correct</span>' : ""}</div>
          <div>
            <div class="bar-track">
              <div class="bar-fill" style="width: ${pct}%"></div>
              <div class="bar-text">${group.count} · ${pct}%</div>
            </div>
            <div class="names">${group.names.length ? escapeHtml(group.names.join(", ")) : "No participants"}</div>
          </div>
        </div>
      `;
    }

    function normalizeImportKey(key) {
      const normalized = String(key || "")
        .trim()
        .toLowerCase()
        .replace(/^\uFEFF/, "")
        .replace(/[\s-]+/g, "_")
        .replace(/[^a-z0-9_]/g, "");
      return {
        choicea: "choice_a",
        choiceb: "choice_b",
        choicec: "choice_c",
        choiced: "choice_d",
        choicee: "choice_e",
        correct: "correct_answer",
        answer: "correct_answer",
        correctanswer: "correct_answer",
        image: "image_url",
        imageurl: "image_url",
        time_limit: "time_limit_seconds",
        timelimit: "time_limit_seconds",
        seconds: "time_limit_seconds",
      }[normalized] || normalized;
    }

    function normalizeImportRow(row) {
      const out = {};
      Object.entries(row || {}).forEach(([key, value]) => {
        out[normalizeImportKey(key)] = value == null ? "" : String(value).trim();
      });
      return out;
    }

    function parseCsv(text) {
      const rows = [];
      let row = [];
      let cell = "";
      let quoted = false;

      for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        const next = text[i + 1];
        if (quoted) {
          if (ch === '"' && next === '"') {
            cell += '"';
            i += 1;
          } else if (ch === '"') {
            quoted = false;
          } else {
            cell += ch;
          }
        } else if (ch === '"') {
          quoted = true;
        } else if (ch === ",") {
          row.push(cell);
          cell = "";
        } else if (ch === "\n") {
          row.push(cell);
          rows.push(row);
          row = [];
          cell = "";
        } else if (ch !== "\r") {
          cell += ch;
        }
      }
      row.push(cell);
      rows.push(row);

      const headers = (rows.shift() || []).map(normalizeImportKey);
      return rows
        .filter((items) => items.some((item) => String(item || "").trim()))
        .map((items) => {
          const object = {};
          headers.forEach((header, index) => {
            object[header] = items[index] || "";
          });
          return object;
        });
    }

    async function rowsFromImportFile(file) {
      const name = file.name.toLowerCase();
      if (name.endsWith(".csv")) {
        const text = await file.text();
        return parseCsv(text);
      }

      if (!window.XLSX) {
        throw new Error("XLSX import library is still loading. Try again in a moment, or use CSV.");
      }

      const buffer = await file.arrayBuffer();
      const workbook = window.XLSX.read(buffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      return window.XLSX.utils.sheet_to_json(firstSheet, { defval: "" }).map(normalizeImportRow);
    }

    function questionFromImportRow(row) {
      const normalized = normalizeImportRow(row);
      const choices = letters.map((letter) => normalized[`choice_${letter.toLowerCase()}`] || "");
      const rawCorrect = String(normalized.correct_answer || "").trim();
      let correctChoiceId = rawCorrect.toUpperCase();

      if (!letters.includes(correctChoiceId)) {
        const matchIndex = choices.findIndex(
          (choice) => choice.trim().toLocaleLowerCase() === rawCorrect.toLocaleLowerCase()
        );
        correctChoiceId = matchIndex >= 0 ? letters[matchIndex] : rawCorrect;
      }

      return {
        prompt: normalized.prompt || normalized.question || "",
        imageUrl: normalized.image_url || "",
        choices,
        correctChoiceId,
        explanation: normalized.explanation || "",
        timeLimitSeconds: normalized.time_limit_seconds || "",
      };
    }

    async function importQuestionsFromFile(file) {
      const status = $("importStatus");
      setStatus(status, `Reading ${file.name}...`);
      const rows = await rowsFromImportFile(file);
      if (!rows.length) {
        throw new Error("No question rows found in the file.");
      }

      let imported = 0;
      const failures = [];
      for (let index = 0; index < rows.length; index += 1) {
        try {
          const payload = questionFromImportRow(rows[index]);
          lastState = await api(`/api/rooms/${code}/questions`, {
            method: "POST",
            headers: hostHeaders(),
            body: JSON.stringify(payload),
          });
          imported += 1;
          setStatus(status, `Imported ${imported}/${rows.length} questions...`);
        } catch (err) {
          failures.push(`row ${index + 2}: ${err.message}`);
        }
      }

      if (lastState) renderHost(lastState);
      if (failures.length) {
        setStatus(status, `Imported ${imported}. Failed ${failures.length}: ${failures.slice(0, 3).join("; ")}`, "warn");
      } else {
        setStatus(status, `Imported ${imported} question${imported === 1 ? "" : "s"}.`, "ok");
      }
    }

    function setupImportEvents() {
      const zone = $("importDropZone");
      const input = $("importFile");
      const picker = $("pickImportFile");
      if (!zone || !input || !picker) return;

      const handleFile = async (file) => {
        if (!file) return;
        try {
          await importQuestionsFromFile(file);
        } catch (err) {
          setStatus($("importStatus"), err.message, "error");
        } finally {
          input.value = "";
          zone.classList.remove("dragging");
        }
      };

      picker.addEventListener("click", (event) => {
        event.stopPropagation();
        input.click();
      });
      zone.addEventListener("click", () => input.click());
      zone.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          input.click();
        }
      });
      input.addEventListener("change", () => handleFile(input.files?.[0]));

      ["dragenter", "dragover"].forEach((type) => {
        zone.addEventListener(type, (event) => {
          event.preventDefault();
          zone.classList.add("dragging");
        });
      });
      ["dragleave", "drop"].forEach((type) => {
        zone.addEventListener(type, (event) => {
          event.preventDefault();
          if (type === "drop") handleFile(event.dataTransfer?.files?.[0]);
          else zone.classList.remove("dragging");
        });
      });
    }

    $("copyHostLink").addEventListener("click", async () => {
      await navigator.clipboard.writeText(window.location.href);
      setStatus($("hostStatus"), "Host link copied.", "ok");
    });

    $("exportXlsx").addEventListener("click", exportResultsXlsx);

    $("openLobby").addEventListener("click", async () => {
      try {
        lastState = await api(`/api/rooms/${code}/open-lobby`, { method: "POST", headers: hostHeaders() });
        renderHost(lastState);
        setStatus($("hostStatus"), "Lobby is open. Participants can join now.", "ok");
      } catch (err) {
        setStatus($("hostStatus"), err.message, "error");
      }
    });

    $("settingsForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        lastState = await api(`/api/rooms/${code}/settings`, {
          method: "PATCH",
          headers: hostHeaders(),
          body: JSON.stringify({ globalTimeLimitSeconds: $("globalTime").value }),
        });
        renderHost(lastState);
        setStatus($("hostStatus"), "Settings saved.", "ok");
      } catch (err) {
        setStatus($("hostStatus"), err.message, "error");
      }
    });

    $("questionForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const wasEditing = Boolean(editQuestionId);
        const path = editQuestionId
          ? `/api/rooms/${code}/questions/${editQuestionId}`
          : `/api/rooms/${code}/questions`;
        lastState = await api(path, {
          method: editQuestionId ? "PATCH" : "POST",
          headers: hostHeaders(),
          body: JSON.stringify(questionFormPayload()),
        });
        resetQuestionForm();
        renderHost(lastState);
        setStatus($("hostStatus"), wasEditing ? "Question saved." : "Question added.", "ok");
      } catch (err) {
        setStatus($("hostStatus"), err.message, "error");
      }
    });

    $("cancelEditQuestion").addEventListener("click", resetQuestionForm);

    $("startQuiz").addEventListener("click", async () => {
      try {
        lastState = await api(`/api/rooms/${code}/start`, { method: "POST", headers: hostHeaders() });
        renderHost(lastState);
      } catch (err) {
        setStatus($("hostStatus"), err.message, "error");
      }
    });

    $("nextQuestion").addEventListener("click", async () => {
      try {
        lastState = await api(`/api/rooms/${code}/next`, { method: "POST", headers: hostHeaders() });
        renderHost(lastState);
      } catch (err) {
        setStatus($("hostStatus"), err.message, "error");
      }
    });

    $("voidQuestion").addEventListener("click", async () => {
      if (!lastState?.currentQuestion) return;
      if (!window.confirm("Void this question? It will not affect scores.")) return;
      try {
        lastState = await api(`/api/rooms/${code}/questions/${lastState.currentQuestion.id}/void`, {
          method: "POST",
          headers: hostHeaders(),
        });
        renderHost(lastState);
      } catch (err) {
        setStatus($("hostStatus"), err.message, "error");
      }
    });

    refresh();
    setupImportEvents();
    setupImageUploadEvents();
    const sseUrl = `${apiBase}/rooms/${code}/events?role=host&token=${encodeURIComponent(hostToken)}`;
    const es = connectSSE(sseUrl, (state) => {
      lastState = state;
      renderHost(state);
    });
    const timerId = setInterval(() => {
      if (lastState) renderTimer($("timer"), lastState.endsAt, lastState.state);
    }, 1000);
    window.addEventListener("pagehide", () => { es.close(); clearInterval(timerId); });
  }

  function initParticipant() {
    const code = (params.get("room") || "").trim().toUpperCase();
    const querySession = params.get("session");
    const sessionToken = querySession || localStorage.getItem(storageKey("participant", code));
    let selectedChoiceId = null;

    if (code && querySession) localStorage.setItem(storageKey("participant", code), querySession);

    async function refresh() {
      if (!code || !sessionToken) {
        setStatus($("participantStatus"), "Missing participant session. Join again from the home screen.", "error");
        return;
      }
      try {
        const state = await api(`/api/rooms/${code}/participant`, {
          headers: { "X-Participant-Token": sessionToken },
        });
        selectedChoiceId = state.selectedChoiceId;
        renderParticipant(state);
      } catch (err) {
        setStatus($("participantStatus"), err.message, "error");
      }
    }

    function renderParticipant(state) {
      $("participantMeta").textContent = `${state.username} · Room ${state.code}`;
      renderTimer($("participantTimer"), state.endsAt, state.state);
      $("participantChoices").innerHTML = "";
      $("participantReveal").innerHTML = "";

      if (state.state === "kicked") {
        $("participantTitle").textContent = "Removed from room";
        setStatus($("participantStatus"), "The host removed this session.", "error");
        $("participantQuestion").innerHTML = "";
        return;
      }

      if (state.state === "lobby") {
        $("participantTitle").textContent = "Lobby";
        setStatus($("participantStatus"), "You are in. Waiting for the host to start.");
        $("participantQuestion").innerHTML = `<div class="list-item"><span class="pill">Room ${escapeHtml(state.code)}</span><h1>Ready</h1></div>`;
        return;
      }

      if (state.state === "finished") {
        $("participantTitle").textContent = "Finished";
        setStatus($("participantStatus"), `Final score: ${state.totalScore}`);
        $("participantQuestion").innerHTML = `<div class="list-item"><h1>Quiz complete</h1></div>`;
        return;
      }

      const question = state.currentQuestion;
      $("participantTitle").textContent = state.state === "question_active" ? "Question active" : "Reveal";
      setStatus(
        $("participantStatus"),
        state.state === "question_active" ? "Select an answer. Your latest selection before time expires is counted." : "Answers are locked."
      );
      $("participantQuestion").innerHTML = renderQuestionBlock(question, state.currentQuestionIndex);

      if (state.state === "question_active") {
        $("participantChoices").innerHTML = question.choices
          .map(
            (choice) => `
              <button type="button" class="choice ${selectedChoiceId === choice.id ? "selected" : ""}" data-choice="${choice.id}">
                <span class="choice-label">${choice.id}</span>
                <span>${escapeHtml(choice.text)}</span>
              </button>
            `
          )
          .join("");
        $("participantChoices").querySelectorAll("[data-choice]").forEach((button) => {
          button.addEventListener("click", async () => {
            try {
              const nextState = await api(`/api/rooms/${code}/answer`, {
                method: "POST",
                headers: { "X-Participant-Token": sessionToken },
                body: JSON.stringify({ choiceId: button.dataset.choice }),
              });
              selectedChoiceId = nextState.selectedChoiceId;
              renderParticipant(nextState);
            } catch (err) {
              setStatus($("participantStatus"), err.message, "error");
            }
          });
        });
        return;
      }

      renderParticipantReveal(state);
    }

    function renderParticipantReveal(state) {
      const question = state.currentQuestion;
      const selected = state.selectedChoiceId;
      const selectedText = selected ? choiceName(question, selected) : "No answer submitted";
      $("participantChoices").innerHTML = question.choices
        .map((choice) => {
          const classes = [
            "choice",
            choice.id === question.correctChoiceId ? "correct" : "",
            selected === choice.id && selected !== question.correctChoiceId ? "wrong" : "",
          ].join(" ");
          return `
            <div class="${classes}">
              <span class="choice-label">${choice.id}</span>
              <span>${escapeHtml(choice.text)}</span>
            </div>
          `;
        })
        .join("");
      $("participantReveal").innerHTML = `
        <div class="list-item">
          <p><strong>Your answer:</strong> ${escapeHtml(selectedText)}</p>
          <p><strong>Correct answer:</strong> ${escapeHtml(choiceName(question, question.correctChoiceId))}</p>
          <p><strong>Result:</strong> ${selected && state.isCorrect ? "Correct, 1 point" : "0 points"}</p>
          ${question.explanation ? `<p><strong>Explanation:</strong> ${escapeHtml(question.explanation)}</p>` : ""}
        </div>
      `;
    }

    let lastEndsAt = null;
    let lastRoomState = null;
    refresh();
    const sseUrl = `${apiBase}/rooms/${code}/events?role=participant&session=${encodeURIComponent(sessionToken)}`;
    const es = connectSSE(sseUrl, (state) => {
      selectedChoiceId = state.selectedChoiceId;
      lastEndsAt = state.endsAt;
      lastRoomState = state.state;
      renderParticipant(state);
    });
    const timerId = setInterval(() => {
      renderTimer($("participantTimer"), lastEndsAt, lastRoomState);
    }, 1000);
    window.addEventListener("pagehide", () => { es.close(); clearInterval(timerId); });
  }

  if (page === "home") initHome();
  if (page === "host") initHost();
  if (page === "participant") initParticipant();
})();
