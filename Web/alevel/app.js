const PUBLIC_SB = await import('../js/supabase-config.js').catch((err) => {
  console.warn("[A-Level] Supabase config unavailable, using local storage only", err);
  return {};
});
const LOCAL_SB =
  typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname)
    ? await import('../js/supabase-config.local.js').catch(() => ({}))
    : {};
const SB = { ...PUBLIC_SB, ...LOCAL_SB };

const SUPABASE_READY = Boolean(
  SB.SUPABASE_URL &&
    SB.SUPABASE_ANON_KEY &&
    !String(SB.SUPABASE_URL).includes("YOUR_PROJECT") &&
    !String(SB.SUPABASE_ANON_KEY).includes("YOUR_ANON")
);

let supabase = null;
let supabaseLoadPromise = null;

async function getSupabaseClient() {
  if (!SUPABASE_READY) return null;
  if (supabase) return supabase;

  if (!supabaseLoadPromise) {
    supabaseLoadPromise = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/+esm')
      .then(({ createClient }) => createClient(SB.SUPABASE_URL, SB.SUPABASE_ANON_KEY))
      .catch((err) => {
        console.warn("[A-Level] Supabase client unavailable", err);
        return null;
      });
  }

  supabase = await supabaseLoadPromise;
  return supabase;
}

const STORAGE_KEY = 'clinical-alevel-mcq:v1';
const ACCESS_KEY = 'clinical-alevel-access:v1';
const ACCESS_CODE = 'admin061';
const LETTERS = ['A', 'B', 'C', 'D', 'E'];

let questions = [];
let filtered = [];
let currentIndex = 0;
let selected = '';
let answered = false;
let score = 0;
let attempts = 0;

const $ = (id) => document.getElementById(id);

const els = {
  accessGate: $('access-gate'),
  accessForm: $('access-form'),
  accessCode: $('access-code'),
  accessError: $('access-error'),
  tabPractice: $('tab-practice'),
  tabBank: $('tab-bank'),
  practiceView: $('practice-view'),
  bankView: $('bank-view'),
  pageTitle: $('page-title'),
  subjectFilter: $('subject-filter'),
  statTotal: $('stat-total'),
  statScore: $('stat-score'),
  statSubject: $('stat-subject'),
  questionCount: $('question-count'),
  questionSubject: $('question-subject'),
  questionStem: $('question-stem'),
  choiceList: $('choice-list'),
  feedback: $('feedback'),
  submitAnswer: $('submit-answer'),
  nextQuestion: $('next-question'),
  resetProgress: $('reset-progress'),
  form: $('question-form'),
  editingId: $('editing-id'),
  editorTitle: $('editor-title'),
  clearForm: $('clear-form'),
  subjectInput: $('question-subject-input'),
  stemInput: $('question-stem-input'),
  correctAnswer: $('correct-answer'),
  explanationInput: $('explanation-input'),
  bankList: $('bank-list'),
  exportJson: $('export-json'),
  importJson: $('import-json'),
  downloadSample: $('download-sample'),
  toast: $('toast'),
};

const choiceInputs = LETTERS.map((letter) => $(`choice-${letter.toLowerCase()}`));

function hasAccess() {
  return sessionStorage.getItem(ACCESS_KEY) === '1';
}

function unlockAccess() {
  sessionStorage.setItem(ACCESS_KEY, '1');
  els.accessGate.hidden = true;
}

function initAccessGate() {
  if (hasAccess()) {
    els.accessGate.hidden = true;
    return;
  }
  els.accessGate.hidden = false;
  setTimeout(() => els.accessCode.focus(), 50);
}

function uid() {
  return window.crypto?.randomUUID?.() || `q-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => {
    els.toast.hidden = true;
  }, 2200);
}

function normalizeQuestion(question) {
  const rawChoices = question.choices || question.options || [
    question.choice_a,
    question.choice_b,
    question.choice_c,
    question.choice_d,
    question.choice_e,
  ];
  const choices = Array.isArray(rawChoices)
    ? rawChoices.slice(0, 5)
    : LETTERS.map((letter) => rawChoices?.[letter] || rawChoices?.[letter.toLowerCase()]);
  const rawAnswer = String(question.answer || question.correct_answer || question.correct || 'A').trim().toUpperCase();
  const answer = LETTERS.includes(rawAnswer) ? rawAnswer : LETTERS[choices.findIndex((choice) => choice === rawAnswer)] || 'A';
  while (choices.length < 5) choices.push('');
  return {
    id: String(question.id || uid()),
    subject: String(question.subject || 'General').trim(),
    stem: String(question.stem || question.question || question.prompt || '').trim(),
    choices: choices.map((choice) => String(choice || '').trim()),
    answer,
    explanation: String(question.explanation || question.rationale || question.explain || '').trim(),
  };
}

function validQuestion(question) {
  return question.stem && question.explanation && question.choices.every(Boolean);
}

async function loadQuestions() {
  const client = await getSupabaseClient();
  if (client) {
    const { data, error } = await client
      .from('alevel_questions')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.warn("Could not fetch from Supabase, falling back to local", error);
    } else if (data) {
      questions = data.map((row) => ({
        id: row.id,
        subject: row.subject,
        stem: row.stem,
        choices: row.choices,
        answer: row.answer,
        explanation: row.explanation
      })).map(normalizeQuestion).filter(validQuestion);
      saveQuestions();
      return;
    }
  }

  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    questions = JSON.parse(saved).questions.map(normalizeQuestion).filter(validQuestion);
    return;
  }

  const response = await fetch('questions.json');
  const data = await response.json();
  questions = data.questions.map(normalizeQuestion).filter(validQuestion);
  saveQuestions();
}

function saveQuestions() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ questions }, null, 2));
}

function updateSubjects() {
  const current = els.subjectFilter.value || 'all';
  const subjects = [...new Set(questions.map((question) => question.subject).filter(Boolean))].sort();
  els.subjectFilter.innerHTML = '<option value="all">All subjects</option>';
  for (const subject of subjects) {
    const option = document.createElement('option');
    option.value = subject;
    option.textContent = subject;
    els.subjectFilter.appendChild(option);
  }
  els.subjectFilter.value = subjects.includes(current) ? current : 'all';
}

function applyFilter() {
  const subject = els.subjectFilter.value;
  filtered = subject === 'all'
    ? [...questions]
    : questions.filter((question) => question.subject === subject);
  if (currentIndex >= filtered.length) currentIndex = 0;
  els.statSubject.textContent = subject === 'all' ? 'All' : subject;
}

function renderStats() {
  els.statTotal.textContent = String(filtered.length);
  els.statScore.textContent = `${score}/${attempts}`;
}

function renderQuestion() {
  applyFilter();
  renderStats();
  selected = '';
  answered = false;
  els.feedback.hidden = true;
  els.submitAnswer.disabled = true;
  els.submitAnswer.hidden = false;
  els.nextQuestion.hidden = true;

  if (!filtered.length) {
    els.questionCount.textContent = 'No questions';
    els.questionSubject.textContent = 'Bank empty';
    els.questionStem.textContent = 'Add or import MCQs in the question bank.';
    els.choiceList.innerHTML = '';
    return;
  }

  const question = filtered[currentIndex];
  els.questionCount.textContent = `Question ${currentIndex + 1} of ${filtered.length}`;
  els.questionSubject.textContent = question.subject;
  els.questionStem.textContent = question.stem;
  els.choiceList.innerHTML = '';

  question.choices.forEach((choice, index) => {
    const letter = LETTERS[index];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice';
    button.innerHTML = `<strong>${letter}</strong><span>${escapeHtml(choice)}</span>`;
    button.addEventListener('click', () => {
      if (answered) return;
      selected = letter;
      els.submitAnswer.disabled = false;
      document.querySelectorAll('.choice').forEach((item) => item.classList.remove('selected'));
      button.classList.add('selected');
    });
    els.choiceList.appendChild(button);
  });
}

function submitAnswer() {
  if (!selected || !filtered.length) return;
  const question = filtered[currentIndex];
  answered = true;
  attempts += 1;
  const correct = selected === question.answer;
  if (correct) score += 1;

  document.querySelectorAll('.choice').forEach((button, index) => {
    const letter = LETTERS[index];
    if (letter === question.answer) button.classList.add('correct');
    if (letter === selected && !correct) button.classList.add('wrong');
  });

  els.feedback.hidden = false;
  els.feedback.innerHTML = `<strong>${correct ? 'Correct' : `Answer ${question.answer}`}</strong><br>${escapeHtml(question.explanation)}`;
  els.submitAnswer.hidden = true;
  els.nextQuestion.hidden = false;
  renderStats();
}

function nextQuestion() {
  if (!filtered.length) return;
  currentIndex = (currentIndex + 1) % filtered.length;
  renderQuestion();
}

function renderBank() {
  els.bankList.innerHTML = '';
  if (!questions.length) {
    els.bankList.innerHTML = '<p class="muted">No questions yet.</p>';
    return;
  }

  for (const question of questions) {
    const item = document.createElement('div');
    item.className = 'bank-item';
    item.innerHTML = `
      <div>
        <h4>${escapeHtml(question.stem)}</h4>
        <p>${escapeHtml(question.subject)} · Answer ${question.answer}</p>
      </div>
      <div class="bank-actions">
        <button class="ghost" type="button" data-edit="${question.id}">Edit</button>
        <button class="ghost danger" type="button" data-delete="${question.id}">Delete</button>
      </div>
    `;
    els.bankList.appendChild(item);
  }
}

function showMode(mode) {
  const bank = mode === 'bank';
  els.practiceView.hidden = bank;
  els.bankView.hidden = !bank;
  els.tabPractice.classList.toggle('active', !bank);
  els.tabBank.classList.toggle('active', bank);
  els.pageTitle.textContent = bank ? 'Question bank' : 'A-Level MCQ';
  if (bank) renderBank();
  else renderQuestion();
}

function readForm() {
  return normalizeQuestion({
    id: els.editingId.value || uid(),
    subject: els.subjectInput.value,
    stem: els.stemInput.value,
    choices: choiceInputs.map((input) => input.value),
    answer: els.correctAnswer.value,
    explanation: els.explanationInput.value,
  });
}

function clearForm() {
  els.editingId.value = '';
  els.editorTitle.textContent = 'Add MCQ';
  els.subjectInput.value = '';
  els.stemInput.value = '';
  choiceInputs.forEach((input) => {
    input.value = '';
  });
  els.correctAnswer.value = 'A';
  els.explanationInput.value = '';
}

function editQuestion(id) {
  const question = questions.find((item) => item.id === id);
  if (!question) return;
  els.editingId.value = question.id;
  els.editorTitle.textContent = 'Edit MCQ';
  els.subjectInput.value = question.subject;
  els.stemInput.value = question.stem;
  question.choices.forEach((choice, index) => {
    choiceInputs[index].value = choice;
  });
  els.correctAnswer.value = question.answer;
  els.explanationInput.value = question.explanation;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteQuestion(id) {
  if (!confirm('Delete this question?')) return;

  const client = await getSupabaseClient();
  if (client) {
    const { error } = await client.from('alevel_questions').delete().eq('id', id);
    if (error) {
      console.error(error);
      toast('Could not delete question from database');
      return;
    }
  }

  questions = questions.filter((question) => question.id !== id);
  saveQuestions();
  updateSubjects();
  renderBank();
  renderQuestion();
  toast('Question deleted');
}

function download(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted && char === '"' && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === ',') {
      row.push(cell);
      cell = '';
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function rowsToQuestions(rows) {
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => header.trim().toLowerCase());
  return rows.slice(1).map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index] || '';
    });
    return record;
  });
}

function parseImportText(text, filename = '') {
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (/\.csv$/i.test(filename)) {
    return rowsToQuestions(parseCsv(trimmed));
  }

  try {
    const data = JSON.parse(trimmed);
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.questions)) return data.questions;
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.data)) return data.data;
  } catch {
    return rowsToQuestions(parseCsv(trimmed));
  }

  return [];
}

els.tabPractice.addEventListener('click', () => showMode('practice'));
els.tabBank.addEventListener('click', () => showMode('bank'));
els.accessForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (els.accessCode.value.trim() !== ACCESS_CODE) {
    els.accessError.hidden = false;
    els.accessCode.select();
    return;
  }
  els.accessError.hidden = true;
  unlockAccess();
});
els.subjectFilter.addEventListener('change', renderQuestion);
els.submitAnswer.addEventListener('click', submitAnswer);
els.nextQuestion.addEventListener('click', nextQuestion);
els.resetProgress.addEventListener('click', () => {
  score = 0;
  attempts = 0;
  currentIndex = 0;
  renderQuestion();
  toast('Progress reset');
});

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const question = readForm();
  if (!validQuestion(question)) {
    toast('Complete all fields');
    return;
  }

  const client = await getSupabaseClient();
  if (client) {
    const payload = {
      subject: question.subject,
      stem: question.stem,
      choices: question.choices,
      answer: question.answer,
      explanation: question.explanation
    };
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(question.id);
    if (isUuid) {
      payload.id = question.id;
    }

    const { data, error } = await client
      .from('alevel_questions')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      console.error(error);
      toast('Could not save question to database');
      return;
    }

    if (data) {
      question.id = data.id;
    }
  }

  const index = questions.findIndex((item) => item.id === question.id);
  if (index >= 0) questions[index] = question;
  else questions.unshift(question);

  saveQuestions();
  updateSubjects();
  renderBank();
  renderQuestion();
  clearForm();
  toast('Question saved');
});

els.clearForm.addEventListener('click', clearForm);
els.bankList.addEventListener('click', (event) => {
  const editId = event.target.closest('[data-edit]')?.dataset.edit;
  const deleteId = event.target.closest('[data-delete]')?.dataset.delete;
  if (editId) editQuestion(editId);
  if (deleteId) deleteQuestion(deleteId);
});

els.exportJson.addEventListener('click', () => download('a-level-mcq-bank.json', { questions }));
els.downloadSample.addEventListener('click', () => download('a-level-mcq-sample.json', { questions: questions.slice(0, 3) }));
els.importJson.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const incoming = parseImportText(await file.text(), file.name).map(normalizeQuestion).filter(validQuestion);
    if (!incoming.length) throw new Error('No valid questions. Need stem/question, five choices, answer, and explanation.');

    const client = await getSupabaseClient();
    if (client) {
      const payloads = incoming.map((q) => {
        const payload = {
          subject: q.subject,
          stem: q.stem,
          choices: q.choices,
          answer: q.answer,
          explanation: q.explanation
        };
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(q.id);
        if (isUuid) {
          payload.id = q.id;
        }
        return payload;
      });

      const { data, error } = await client
        .from('alevel_questions')
        .upsert(payloads, { onConflict: 'id' })
        .select();

      if (error) {
        throw new Error('Database import failed: ' + error.message);
      }

      if (data) {
        questions = data.map((row) => ({
          id: row.id,
          subject: row.subject,
          stem: row.stem,
          choices: row.choices,
          answer: row.answer,
          explanation: row.explanation
        })).map(normalizeQuestion).filter(validQuestion);
      }
    } else {
      questions = incoming;
    }

    saveQuestions();
    updateSubjects();
    renderBank();
    renderQuestion();
    toast(`Imported ${questions.length} questions`);
  } catch (error) {
    toast(error.message || 'Import failed');
  } finally {
    event.target.value = '';
  }
});

initAccessGate();

loadQuestions()
  .then(() => {
    updateSubjects();
    showMode(new URLSearchParams(location.search).get('admin') === '1' ? 'bank' : 'practice');
  })
  .catch(() => {
    questions = [];
    showMode('bank');
    toast('Could not load questions');
  });
