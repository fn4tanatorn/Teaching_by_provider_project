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
const MAX_RECENT_SHEETS = 3;
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
const pdfFileInput = document.getElementById("pdfFileInput");
const uploadPdfControl = document.getElementById("uploadPdfControl");
const sheetHintTitle = document.getElementById("sheetHintTitle");
const sheetHintText = document.getElementById("sheetHintText");
const emptyStateText = document.getElementById("emptyStateText");

let activeObjectUrl = "";
let activeId = "";
let uploadedSheets = [];
let sheetsRemoteOk = false;

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
  sheetHintTitle.textContent = "Admin upload mode";
  sheetHintText.textContent =
    "Upload จะส่งเข้า Supabase Storage เมื่อ bucket/table พร้อม; ถ้ายังไม่พร้อมจะ fallback เก็บใน browser นี้ก่อน";
  emptyStateText.textContent = "กด Upload PDF เพื่อเพิ่มชีทลงรายการ แล้วเปิดอ่านในหน้านี้แบบเลื่อนขึ้นลงได้";
} else {
  document.body.classList.add("sheets-student");
}

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
  const record = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: "local",
    title: file.name.replace(/\.pdf$/i, ""),
    fileName: file.name,
    size: file.size,
    type: file.type || "application/pdf",
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
    publicUrl: row.public_url
  };
}

async function loadRemoteSheets() {
  const client = await getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client
    .from(SHEETS_TABLE)
    .select("id,title,file_name,storage_path,public_url,size_bytes,mime_type,created_at")
    .order("created_at", { ascending: false });
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
    mime_type: file.type || "application/pdf"
  };
  const { data, error: insertError } = await client
    .from(SHEETS_TABLE)
    .insert(row)
    .select("id,title,file_name,storage_path,public_url,size_bytes,mime_type,created_at")
    .single();
  if (insertError) {
    await client.storage.from(SHEETS_BUCKET).remove([path]).catch(() => {});
    throw insertError;
  }
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
      alert("Supabase upload ยังไม่สำเร็จ ระบบจะเก็บ PDF ใน browser นี้ก่อน");
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
    readerTitle.textContent = "ยังไม่ได้เลือกชีท";
    document.body.classList.remove("pdf-active");
    activeId = "";
  }
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
  return uploadedSheets
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .flatMap((sheet) => {
      if (!matchesSheetQuery(query, sheet.title, sheet.fileName)) return [];
      return [{
        id: sheet.id,
        title: sheet.title || sheet.fileName || "Uploaded PDF",
        meta: `${sheet.source === "supabase" ? "Supabase" : "Local"} · ${formatBytes(sheet.size)}`,
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
      : "Supabase ยังไม่พร้อมหรือ policy ยังไม่ผ่าน; upload จะ fallback เก็บใน browser นี้ก่อน";
  }

  if (!total) {
    const empty = document.createElement("p");
    empty.className = "hint-box";
    empty.textContent = IS_ADMIN
      ? "ยังไม่มี PDF ในระบบ กด Upload PDF เพื่อเพิ่มชีทแรก"
      : "ยังไม่มี PDF ในระบบ";
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
    empty.textContent = `ไม่พบชีทที่ตรงกับ "${sheetSearchInput.value.trim()}"`;
    sheetList.append(empty);
    return;
  }

  entries.forEach((entry) => {
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
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "sheet-delete";
      remove.textContent = "ลบ";
      remove.addEventListener("click", async () => {
        if (!confirm(`ลบ "${entry.title}"?`)) return;
        await deleteUploadedPdf(entry.sheet);
        await refreshUploadedSheets();
      });
      row.append(remove);
    }

    fragment.append(row);
  });

  sheetList.append(fragment);
}

async function refreshUploadedSheets() {
  uploadedSheets = await loadUploadedSheets();
  renderSheetList();
}

pdfFileInput.addEventListener("change", async () => {
  const file = pdfFileInput.files && pdfFileInput.files[0];
  if (!file) return;
  if ((file.type && file.type !== "application/pdf") || !/\.pdf$/i.test(file.name)) {
    alert("กรุณาเลือกไฟล์ PDF");
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
    alert("บันทึก PDF ไม่สำเร็จ");
  } finally {
    pdfFileInput.value = "";
  }
});

openPdfLink.addEventListener("click", downloadActivePdf);
showSheetListBtn?.addEventListener("click", showSheetListOverview);
sheetSearchInput?.addEventListener("input", renderSheetList);
window.addEventListener("beforeunload", revokeActiveObjectUrl);

refreshUploadedSheets().catch((err) => {
  console.error(err);
  renderSheetList();
});
