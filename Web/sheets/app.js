const PUBLIC_SB = await import('../js/supabase-config.js').catch((err) => {
  console.warn("[Sheets] Supabase config unavailable, using local PDF storage only", err);
  return {};
});
const LOCAL_SB =
  typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname)
    ? await import('../js/supabase-config.local.js').catch(() => ({}))
    : {};
const SB = { ...PUBLIC_SB, ...LOCAL_SB };

const DEFAULT_SHEETS = [
  /*
  {
    title: "Example sheet",
    file: "files/example.pdf"
  }
  */
];

const DB_NAME = "clinical_sheets_db";
const DB_VERSION = 1;
const STORE_NAME = "pdfs";
const RECENT_SHEETS_KEY = "clinical_sheets_recent_v1";
const SIDEBAR_COLLAPSED_KEY = "clinical_sheets_sidebar_collapsed_v1";
const SHEET_SUBJECTS_KEY = "clinical_sheets_subjects_v1";
const SHEET_META_KEY = "clinical_sheets_meta_v1";
const MAX_RECENT_SHEETS = 3;
const DEFAULT_SUBJECT = "Uncategorized";
const SHEETS_BUCKET = SB.SHEETS_STORAGE_BUCKET || "sheets";
const SHEETS_TABLE = SB.SHEETS_TABLE || "sheet_files";
const SUPABASE_READY = Boolean(
  SB.SHEETS_USE_SUPABASE !== false &&
    SB.SUPABASE_URL &&
    SB.SUPABASE_ANON_KEY &&
    !String(SB.SUPABASE_URL).includes("YOUR_PROJECT") &&
    !String(SB.SUPABASE_ANON_KEY).includes("YOUR_ANON")
);
let supabase = null;
let supabaseLoadPromise = null;

const sheetList = document.getElementById("sheetList");
const sheetCount = document.getElementById("sheetCount");
const sheetSearchInput = document.getElementById("sheetSearchInput");
const recentSheetsSection = document.getElementById("recentSheetsSection");
const recentSheetsList = document.getElementById("recentSheetsList");
const recentSheetsCount = document.getElementById("recentSheetsCount");
const pdfFrame = document.getElementById("pdfFrame");
const readerTitle = document.getElementById("readerTitle");
const emptyState = document.getElementById("emptyState");
const openPdfLink = document.getElementById("openPdfLink");
const showSheetListBtn = document.getElementById("showSheetListBtn");
const toggleSheetListBtn = document.getElementById("toggleSheetListBtn");
const pdfFileInput = document.getElementById("pdfFileInput");
const uploadPdfControl = document.getElementById("uploadPdfControl");
const sheetHintTitle = document.getElementById("sheetHintTitle");
const sheetHintText = document.getElementById("sheetHintText");
const emptyStateText = document.getElementById("emptyStateText");
const adminOrganizer = document.getElementById("adminOrganizer");
const uploadSubjectSelect = document.getElementById("uploadSubjectSelect");
const subjectFilterSelect = document.getElementById("subjectFilterSelect");
const addSubjectForm = document.getElementById("addSubjectForm");
const newSubjectInput = document.getElementById("newSubjectInput");

let activeObjectUrl = "";
let activeId = "";
let uploadedSheets = [];
let sheetsRemoteOk = false;
let sheetSubjects = [];
let sheetMeta = {};

async function getSupabaseClient() {
  if (!SUPABASE_READY) return null;
  if (supabase) return supabase;

  if (!supabaseLoadPromise) {
    supabaseLoadPromise = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/+esm')
      .then(({ createClient }) => createClient(SB.SUPABASE_URL, SB.SUPABASE_ANON_KEY))
      .catch((err) => {
        console.warn("[Sheets] Supabase client unavailable, using local PDF storage only", err);
        sheetsRemoteOk = false;
        return null;
      });
  }

  supabase = await supabaseLoadPromise;
  return supabase;
}

const IS_ADMIN = new URLSearchParams(window.location.search).get("admin") === "1";

if (IS_ADMIN) {
  document.body.classList.add("sheets-admin");
  uploadPdfControl.hidden = false;
  adminOrganizer.hidden = false;
  sheetHintTitle.textContent = "Admin upload mode";
  sheetHintText.textContent =
    "Upload PDFs, add subjects, and assign each sheet to keep the student list organized.";
  emptyStateText.textContent = "Upload a PDF to add it to the list, then open it here for scrolling review.";
} else {
  document.body.classList.add("sheets-student");
}

const IS_EMBEDDED = new URLSearchParams(window.location.search).get("embed") === "1";
if (IS_EMBEDDED) {
  document.body.classList.add("is-embedded");
}

loadSheetOrganizerState();

function setSheetListCollapsed(collapsed, persist = true) {
  document.body.classList.toggle("sheets-sidebar-collapsed", collapsed);
  if (toggleSheetListBtn) {
    toggleSheetListBtn.textContent = collapsed ? "Show list" : "Hide list";
    toggleSheetListBtn.setAttribute("aria-pressed", String(collapsed));
  }
  if (persist) {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      // Non-critical preference storage.
    }
  }
}

function initSheetListPreference() {
  let collapsed = false;
  try {
    collapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    collapsed = false;
  }
  setSheetListCollapsed(collapsed, false);
}

initSheetListPreference();

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function readJsonStorage(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJsonStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Non-critical local organizer cache.
  }
}

function normalizeSubject(value) {
  return String(value || "").trim() || DEFAULT_SUBJECT;
}

function loadSheetOrganizerState() {
  sheetSubjects = readJsonStorage(SHEET_SUBJECTS_KEY, []);
  sheetMeta = readJsonStorage(SHEET_META_KEY, {});
  if (!Array.isArray(sheetSubjects)) sheetSubjects = [];
  if (!sheetMeta || typeof sheetMeta !== "object") sheetMeta = {};
}

function saveSubjects() {
  writeJsonStorage(SHEET_SUBJECTS_KEY, sheetSubjects);
}

function saveSheetMeta() {
  writeJsonStorage(SHEET_META_KEY, sheetMeta);
}

function addSubject(subject) {
  const next = normalizeSubject(subject);
  if (!sheetSubjects.some((item) => item.toLowerCase() === next.toLowerCase())) {
    sheetSubjects.push(next);
    sheetSubjects.sort((a, b) => a.localeCompare(b));
    saveSubjects();
  }
  return next;
}

function sheetSubject(sheet) {
  return normalizeSubject(sheet.subject || sheetMeta[sheet.id]?.subject || sheetMeta[sheet.storagePath]?.subject);
}

function sheetOrder(sheet) {
  const value = sheet.sortOrder ?? sheetMeta[sheet.id]?.sortOrder ?? sheetMeta[sheet.storagePath]?.sortOrder;
  const order = Number(value);
  return Number.isFinite(order) ? order : sheet.createdAt || 0;
}

function getSubjectOptions() {
  const found = uploadedSheets.map(sheetSubject);
  return [...new Set([DEFAULT_SUBJECT, ...sheetSubjects, ...found])].sort((a, b) => {
    if (a === DEFAULT_SUBJECT) return -1;
    if (b === DEFAULT_SUBJECT) return 1;
    return a.localeCompare(b);
  });
}

function renderSubjectControls() {
  if (!IS_ADMIN || !uploadSubjectSelect || !subjectFilterSelect) return;
  const currentUpload = uploadSubjectSelect.value || DEFAULT_SUBJECT;
  const currentFilter = subjectFilterSelect.value || "all";
  const options = getSubjectOptions();
  uploadSubjectSelect.innerHTML = "";
  subjectFilterSelect.innerHTML = '<option value="all">All subjects</option>';
  options.forEach((subject) => {
    const uploadOption = document.createElement("option");
    uploadOption.value = subject;
    uploadOption.textContent = subject;
    uploadSubjectSelect.append(uploadOption);

    const filterOption = document.createElement("option");
    filterOption.value = subject;
    filterOption.textContent = subject;
    subjectFilterSelect.append(filterOption);
  });
  uploadSubjectSelect.value = options.includes(currentUpload) ? currentUpload : DEFAULT_SUBJECT;
  subjectFilterSelect.value = currentFilter === "all" || options.includes(currentFilter) ? currentFilter : "all";
}

async function withStore(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const result = fn(store);
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function loadLocalSheets() {
  return withStore("readonly", (store) => {
    const req = store.getAll();
    return new Promise((resolve, reject) => {
      req.onsuccess = () =>
        resolve((req.result || []).map((item) => ({ ...item, source: "local" })));
      req.onerror = () => reject(req.error);
    });
  });
}

async function saveLocalPdf(file) {
  const subject = normalizeSubject(uploadSubjectSelect?.value);
  const record = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: "local",
    title: file.name.replace(/\.pdf$/i, ""),
    fileName: file.name,
    size: file.size,
    type: file.type || "application/pdf",
    subject,
    createdAt: Date.now(),
    blob: file
  };
  await withStore("readwrite", (store) => store.put(record));
  return record;
}

async function deleteLocalPdf(id) {
  await withStore("readwrite", (store) => store.delete(id));
}

function safePdfName(name) {
  return String(name || "sheet.pdf")
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "sheet.pdf";
}

function remoteRowToSheet(row) {
  return {
    id: row.id,
    source: "supabase",
    title: row.title || row.file_name || "Uploaded PDF",
    fileName: row.file_name || "sheet.pdf",
    size: row.size_bytes || 0,
    type: row.mime_type || "application/pdf",
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    storagePath: row.storage_path,
    publicUrl: row.public_url,
    subject: normalizeSubject(row.subject || sheetMeta[row.id]?.subject || sheetMeta[row.storage_path]?.subject),
    sortOrder: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : undefined
  };
}

async function loadRemoteSheets() {
  const client = await getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client
    .from(SHEETS_TABLE)
    .select("id,title,file_name,storage_path,public_url,size_bytes,mime_type,created_at,subject,sort_order")
    .order("created_at", { ascending: false });
  if (error && /subject|sort_order/i.test(String(error.message || ""))) {
    const fallback = await client
      .from(SHEETS_TABLE)
      .select("id,title,file_name,storage_path,public_url,size_bytes,mime_type,created_at")
      .order("created_at", { ascending: false });
    if (fallback.error) throw fallback.error;
    sheetsRemoteOk = true;
    return (fallback.data || []).map(remoteRowToSheet);
  }
  if (error) throw error;
  sheetsRemoteOk = true;
  return (data || []).map(remoteRowToSheet);
}

async function saveRemotePdf(file) {
  const client = await getSupabaseClient();
  if (!client) throw new Error("Supabase not configured");
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safePdfName(file.name)}`;
  const { error: uploadError } = await client.storage
    .from(SHEETS_BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/pdf",
      upsert: false
    });
  if (uploadError) throw uploadError;

  const { data: publicData } = client.storage.from(SHEETS_BUCKET).getPublicUrl(path);
  const publicUrl = publicData?.publicUrl || "";
  const row = {
    title: file.name.replace(/\.pdf$/i, ""),
    file_name: file.name,
    storage_path: path,
    public_url: publicUrl,
    size_bytes: file.size,
    mime_type: file.type || "application/pdf",
    subject: normalizeSubject(uploadSubjectSelect?.value),
    sort_order: Date.now()
  };
  let { data, error: insertError } = await client
    .from(SHEETS_TABLE)
    .insert(row)
    .select("id,title,file_name,storage_path,public_url,size_bytes,mime_type,created_at,subject,sort_order")
    .single();
  if (insertError && /subject|sort_order/i.test(String(insertError.message || ""))) {
    const { subject, sort_order, ...rowWithoutSubject } = row;
    const fallback = await client
      .from(SHEETS_TABLE)
      .insert(rowWithoutSubject)
      .select("id,title,file_name,storage_path,public_url,size_bytes,mime_type,created_at")
      .single();
    data = fallback.data;
    insertError = fallback.error;
  }
  if (insertError) {
    await client.storage.from(SHEETS_BUCKET).remove([path]).catch(() => {});
    throw insertError;
  }
  const subject = normalizeSubject(row.subject);
  const sortOrder = row.sort_order;
  if (data?.id) sheetMeta[data.id] = { ...(sheetMeta[data.id] || {}), subject, sortOrder };
  if (data?.storage_path) sheetMeta[data.storage_path] = { ...(sheetMeta[data.storage_path] || {}), subject, sortOrder };
  saveSheetMeta();
  sheetsRemoteOk = true;
  return remoteRowToSheet(data);
}

async function deleteRemotePdf(sheet) {
  const client = await getSupabaseClient();
  if (!client) throw new Error("Supabase not configured");
  if (sheet.storagePath) {
    const { error: storageError } = await client.storage.from(SHEETS_BUCKET).remove([sheet.storagePath]);
    if (storageError) throw storageError;
  }
  const { error } = await client.from(SHEETS_TABLE).delete().eq("id", sheet.id);
  if (error) throw error;
}

async function loadUploadedSheets() {
  const localSheets = await loadLocalSheets().catch(() => []);
  if (!SUPABASE_READY) return localSheets;
  try {
    const remoteSheets = await loadRemoteSheets();
    return [...remoteSheets, ...localSheets];
  } catch (err) {
    console.warn("[Sheets] Supabase unavailable, using local PDFs only", err);
    sheetsRemoteOk = false;
    return localSheets;
  }
}

async function saveUploadedPdf(file) {
  if (SUPABASE_READY) {
    try {
      return await saveRemotePdf(file);
    } catch (err) {
      console.warn("[Sheets] Supabase upload failed, saving local draft", err);
      alert("Supabase upload did not complete. The PDF will be stored in this browser first.");
    }
  }
  return saveLocalPdf(file);
}

async function deleteUploadedPdf(sheet) {
  if (sheet.source === "supabase") {
    await deleteRemotePdf(sheet);
  } else {
    await deleteLocalPdf(sheet.id);
  }
  if (activeId === sheet.id) {
    revokeActiveObjectUrl();
    pdfFrame.hidden = true;
    pdfFrame.removeAttribute("src");
    emptyState.hidden = false;
    openPdfLink.href = "#";
    openPdfLink.removeAttribute("download");
    openPdfLink.classList.add("is-disabled");
    openPdfLink.setAttribute("aria-disabled", "true");
    readerTitle.textContent = "No sheet selected";
    document.body.classList.remove("pdf-active");
    activeId = "";
  }
  delete sheetMeta[sheet.id];
  if (sheet.storagePath) delete sheetMeta[sheet.storagePath];
  saveSheetMeta();
}

async function updateSheetSubject(sheet, subject) {
  const nextSubject = addSubject(subject);
  sheet.subject = nextSubject;
  sheetMeta[sheet.id] = { ...(sheetMeta[sheet.id] || {}), subject: nextSubject, sortOrder: sheetOrder(sheet) };
  if (sheet.storagePath) sheetMeta[sheet.storagePath] = { ...(sheetMeta[sheet.storagePath] || {}), subject: nextSubject, sortOrder: sheetOrder(sheet) };
  saveSheetMeta();

  if (sheet.source === "local") {
    await withStore("readwrite", (store) => store.put(sheet));
    return;
  }

  const client = await getSupabaseClient();
  if (!client) return;
  const { error } = await client.from(SHEETS_TABLE).update({ subject: nextSubject }).eq("id", sheet.id);
  if (error && !String(error.message || "").includes("subject")) throw error;
}

async function persistSheetOrder(sheet) {
  const sortOrder = sheetOrder(sheet);
  sheetMeta[sheet.id] = { ...(sheetMeta[sheet.id] || {}), subject: sheetSubject(sheet), sortOrder };
  if (sheet.storagePath) sheetMeta[sheet.storagePath] = { ...(sheetMeta[sheet.storagePath] || {}), subject: sheetSubject(sheet), sortOrder };
  saveSheetMeta();

  if (sheet.source === "local") {
    await withStore("readwrite", (store) => store.put(sheet));
    return;
  }

  const client = await getSupabaseClient();
  if (!client) return;
  const { error } = await client.from(SHEETS_TABLE).update({ sort_order: sortOrder }).eq("id", sheet.id);
  if (error && !/sort_order/i.test(String(error.message || ""))) throw error;
}

async function moveSheet(sheetId, direction) {
  const sheet = uploadedSheets.find((item) => item.id === sheetId);
  if (!sheet) return;
  const subject = sheetSubject(sheet);
  const group = uploadedSheets
    .filter((item) => sheetSubject(item) === subject)
    .sort((a, b) => sheetOrder(a) - sheetOrder(b) || String(a.title).localeCompare(String(b.title)));
  const index = group.findIndex((item) => item.id === sheetId);
  const swapIndex = index + direction;
  if (index < 0 || swapIndex < 0 || swapIndex >= group.length) return;

  const a = group[index];
  const b = group[swapIndex];
  const aOrder = sheetOrder(a);
  const bOrder = sheetOrder(b);
  a.sortOrder = bOrder;
  b.sortOrder = aOrder;
  await Promise.all([persistSheetOrder(a), persistSheetOrder(b)]);
  renderSheetList();
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "PDF";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeSearchValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function readRecentSheets() {
  try {
    const raw = localStorage.getItem(RECENT_SHEETS_KEY);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRecentSheets(items) {
  try {
    localStorage.setItem(RECENT_SHEETS_KEY, JSON.stringify(items.slice(0, MAX_RECENT_SHEETS)));
  } catch {
    // Ignore storage failures and keep the reader usable.
  }
}

function rememberRecentSheet({ id, title }) {
  if (!id) return;
  const nextItems = [
    { id, title: title || "Sheet", openedAt: Date.now() },
    ...readRecentSheets().filter((item) => item?.id !== id)
  ];
  writeRecentSheets(nextItems);
}

function matchesSheetQuery(query, ...fields) {
  if (!query) return true;
  return fields.some((field) => normalizeSearchValue(field).includes(query));
}

function selectedSubjectFilter() {
  return subjectFilterSelect?.value || "all";
}

function revokeActiveObjectUrl() {
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = "";
  }
}

function pdfEmbedUrl(url) {
  const separator = String(url).includes("#") ? "&" : "#";
  return `${url}${separator}toolbar=0&navpanes=0&scrollbar=1`;
}

function fileNameFromUrl(url) {
  try {
    const pathname = new URL(url, window.location.href).pathname;
    const name = decodeURIComponent(pathname.split("/").pop() || "");
    return name || "sheet.pdf";
  } catch {
    return "sheet.pdf";
  }
}

function displayPdf({ id, title, url, downloadName, objectUrl = false }) {
  if (!objectUrl) revokeActiveObjectUrl();
  activeId = id;
  readerTitle.textContent = title;
  pdfFrame.src = pdfEmbedUrl(url);
  pdfFrame.hidden = false;
  emptyState.hidden = true;
  document.body.classList.add("pdf-active");
  openPdfLink.href = url;
  openPdfLink.download = downloadName || fileNameFromUrl(url);
  openPdfLink.classList.remove("is-disabled");
  openPdfLink.setAttribute("aria-disabled", "false");
  rememberRecentSheet({ id, title });
  renderRecentSheets(getAllSheetEntries());

  document.querySelectorAll(".sheet-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.sheetId === id);
  });
}

function showSheetListOverview() {
  document.body.classList.remove("pdf-active");
  setSheetListCollapsed(false);
  const listPanel = document.querySelector(".sheet-list-panel");
  if (!listPanel) return;
  try {
    listPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch {
    listPanel.scrollIntoView();
  }
}

async function downloadActivePdf(event) {
  event.preventDefault();
  if (openPdfLink.classList.contains("is-disabled")) return;
  const url = openPdfLink.href;
  const fileName = openPdfLink.download || "sheet.pdf";
  if (!url || url.endsWith("#")) return;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  } catch (err) {
    console.error(err);
    window.open(url, "_blank", "noopener");
  }
}

function createSheetButton({ id, title, meta, onOpen }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "sheet-item";
  button.dataset.sheetId = id;
  button.title = title;

  const strong = document.createElement("strong");
  strong.textContent = title;
  const span = document.createElement("span");
  span.textContent = meta;
  button.append(strong, span);
  button.addEventListener("click", onOpen);
  return button;
}

function getStaticSheetEntries(query = "") {
  return DEFAULT_SHEETS.flatMap((sheet, index) => {
    const id = `static-${index}`;
    if (!matchesSheetQuery(query, sheet.title, sheet.file)) return [];
    return [{
      id,
      title: sheet.title,
      meta: sheet.file,
      onOpen: () =>
        displayPdf({
          id,
          title: sheet.title,
          url: sheet.file,
          downloadName: fileNameFromUrl(sheet.file)
        })
    }];
  });
}

function getUploadedSheetEntries(query = "") {
  const subjectFilter = selectedSubjectFilter();
  return uploadedSheets
    .slice()
    .sort((a, b) => sheetSubject(a).localeCompare(sheetSubject(b)) || sheetOrder(a) - sheetOrder(b) || b.createdAt - a.createdAt)
    .flatMap((sheet) => {
      const subject = sheetSubject(sheet);
      if (subjectFilter !== "all" && subject !== subjectFilter) return [];
      if (!matchesSheetQuery(query, sheet.title, sheet.fileName, subject)) return [];
      return [{
        id: sheet.id,
        title: sheet.title || sheet.fileName || "Uploaded PDF",
        meta: `${subject} · ${sheet.source === "supabase" ? "Supabase" : "Local"} · ${formatBytes(sheet.size)}`,
        subject,
        sheet,
        onOpen: () => {
          if (sheet.source === "supabase") {
            displayPdf({
              id: sheet.id,
              title: sheet.title || sheet.fileName || "Uploaded PDF",
              url: sheet.publicUrl,
              downloadName: sheet.fileName || `${sheet.title || "sheet"}.pdf`
            });
            return;
          }

          revokeActiveObjectUrl();
          activeObjectUrl = URL.createObjectURL(sheet.blob);
          displayPdf({
            id: sheet.id,
            title: sheet.title || sheet.fileName || "Uploaded PDF",
            url: activeObjectUrl,
            downloadName: sheet.fileName || `${sheet.title || "sheet"}.pdf`,
            objectUrl: true
          });
        }
      }];
    });
}

function getAllSheetEntries(query = "") {
  return [...getUploadedSheetEntries(query), ...getStaticSheetEntries(query)];
}

function renderRecentSheets(entries) {
  if (!recentSheetsSection || !recentSheetsList || !recentSheetsCount) return;
  const query = normalizeSearchValue(sheetSearchInput?.value);
  recentSheetsList.innerHTML = "";

  if (query) {
    recentSheetsSection.hidden = true;
    return;
  }

  const recentIds = readRecentSheets().map((item) => item?.id).filter(Boolean);
  const entryMap = new Map(entries.map((entry) => [entry.id, entry]));
  const recentEntries = recentIds
    .map((id) => entryMap.get(id))
    .filter(Boolean)
    .slice(0, MAX_RECENT_SHEETS);

  recentSheetsCount.textContent = String(recentEntries.length);
  recentSheetsSection.hidden = recentEntries.length === 0;
  if (!recentEntries.length) return;

  const fragment = document.createDocumentFragment();
  recentEntries.forEach((entry) => {
    fragment.append(
      createSheetButton({
        id: entry.id,
        title: entry.title,
        meta: entry.meta,
        onOpen: entry.onOpen
      })
    );
  });
  recentSheetsList.append(fragment);
}

function renderSheetList() {
  const total = DEFAULT_SHEETS.length + uploadedSheets.length;
  const query = normalizeSearchValue(sheetSearchInput?.value);
  sheetList.innerHTML = "";
  sheetCount.textContent = query ? `0/${total}` : String(total);

  if (IS_ADMIN) {
    sheetHintText.textContent = sheetsRemoteOk
      ? `Supabase connected: bucket "${SHEETS_BUCKET}", table "${SHEETS_TABLE}"`
      : "Supabase is not ready or the policy check failed. Uploads will fall back to this browser first.";
  }

  if (!total) {
    const empty = document.createElement("p");
    empty.className = "hint-box";
    empty.textContent = IS_ADMIN
      ? "No PDFs yet. Click Upload PDF to add the first sheet."
      : "No PDFs are available yet.";
    sheetList.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  const entries = getAllSheetEntries(query);
  renderRecentSheets(getAllSheetEntries());
  const visibleCount = entries.length;
  sheetCount.textContent = query ? `${visibleCount}/${total}` : String(total);

  if (!visibleCount) {
    const empty = document.createElement("p");
    empty.className = "hint-box";
    empty.textContent = `No sheets match "${sheetSearchInput.value.trim()}"`;
    sheetList.append(empty);
    return;
  }

  let currentSubject = "";
  entries.forEach((entry) => {
    if (entry.subject && entry.subject !== currentSubject) {
      currentSubject = entry.subject;
      const heading = document.createElement("div");
      heading.className = "sheet-subject-heading";
      heading.textContent = currentSubject;
      fragment.append(heading);
    }

    const row = document.createElement("div");
    row.className = "sheet-row";
    row.append(
      createSheetButton({
        id: entry.id,
        title: entry.title,
        meta: entry.meta,
        onOpen: entry.onOpen
      })
    );

    if (IS_ADMIN && entry.sheet) {
      const orderControls = document.createElement("div");
      orderControls.className = "sheet-order-controls";
      const moveUp = document.createElement("button");
      moveUp.type = "button";
      moveUp.textContent = "↑";
      moveUp.title = "Move up";
      moveUp.addEventListener("click", async () => {
        try {
          await moveSheet(entry.sheet.id, -1);
        } catch (err) {
          console.error(err);
          alert("Could not move sheet.");
        }
      });
      const moveDown = document.createElement("button");
      moveDown.type = "button";
      moveDown.textContent = "↓";
      moveDown.title = "Move down";
      moveDown.addEventListener("click", async () => {
        try {
          await moveSheet(entry.sheet.id, 1);
        } catch (err) {
          console.error(err);
          alert("Could not move sheet.");
        }
      });
      orderControls.append(moveUp, moveDown);

      const subjectSelect = document.createElement("select");
      subjectSelect.className = "sheet-subject-select";
      getSubjectOptions().forEach((subject) => {
        const option = document.createElement("option");
        option.value = subject;
        option.textContent = subject;
        subjectSelect.append(option);
      });
      subjectSelect.value = entry.subject || DEFAULT_SUBJECT;
      subjectSelect.addEventListener("change", async () => {
        try {
          await updateSheetSubject(entry.sheet, subjectSelect.value);
          renderSubjectControls();
          renderSheetList();
        } catch (err) {
          console.error(err);
          alert("Could not update subject.");
        }
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "sheet-delete";
      remove.textContent = "Del";
      remove.addEventListener("click", async () => {
        if (!confirm(`Delete "${entry.title}"?`)) return;
        await deleteUploadedPdf(entry.sheet);
        await refreshUploadedSheets();
      });
      row.append(orderControls, subjectSelect, remove);
    }

    fragment.append(row);
  });

  sheetList.append(fragment);
}

async function refreshUploadedSheets() {
  uploadedSheets = await loadUploadedSheets();
  uploadedSheets.forEach((sheet) => addSubject(sheetSubject(sheet)));
  renderSubjectControls();
  renderSheetList();
}

pdfFileInput.addEventListener("change", async () => {
  const file = pdfFileInput.files && pdfFileInput.files[0];
  if (!file) return;
  if ((file.type && file.type !== "application/pdf") || !/\.pdf$/i.test(file.name)) {
    alert("Please choose a PDF file.");
    pdfFileInput.value = "";
    return;
  }

  try {
    const saved = await saveUploadedPdf(file);
    await refreshUploadedSheets();
    if (saved.source === "supabase") {
      displayPdf({
        id: saved.id,
        title: saved.title,
        url: saved.publicUrl,
        downloadName: saved.fileName || `${saved.title || "sheet"}.pdf`
      });
    } else {
      revokeActiveObjectUrl();
      activeObjectUrl = URL.createObjectURL(saved.blob);
      displayPdf({
        id: saved.id,
        title: saved.title,
        url: activeObjectUrl,
        downloadName: saved.fileName || `${saved.title || "sheet"}.pdf`,
        objectUrl: true
      });
    }
  } catch (err) {
    console.error(err);
    alert("Could not save the PDF.");
  } finally {
    pdfFileInput.value = "";
  }
});

openPdfLink.addEventListener("click", downloadActivePdf);
showSheetListBtn?.addEventListener("click", showSheetListOverview);
toggleSheetListBtn?.addEventListener("click", () => {
  setSheetListCollapsed(!document.body.classList.contains("sheets-sidebar-collapsed"));
});
sheetSearchInput?.addEventListener("input", renderSheetList);
subjectFilterSelect?.addEventListener("change", renderSheetList);
uploadSubjectSelect?.addEventListener("change", () => {
  addSubject(uploadSubjectSelect.value);
  renderSubjectControls();
});
addSubjectForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const subject = addSubject(newSubjectInput.value);
  newSubjectInput.value = "";
  renderSubjectControls();
  uploadSubjectSelect.value = subject;
  subjectFilterSelect.value = subject;
  renderSheetList();
});
window.addEventListener("beforeunload", revokeActiveObjectUrl);

refreshUploadedSheets().catch((err) => {
  console.error(err);
  renderSheetList();
});
