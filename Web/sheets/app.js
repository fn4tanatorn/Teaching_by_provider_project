import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/+esm';
import * as PUBLIC_SB from '../js/supabase-config.js';

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
const SHEETS_BUCKET = SB.SHEETS_STORAGE_BUCKET || "sheets";
const SHEETS_TABLE = SB.SHEETS_TABLE || "sheet_files";
const SUPABASE_READY = Boolean(
  SB.SHEETS_USE_SUPABASE !== false &&
    SB.SUPABASE_URL &&
    SB.SUPABASE_ANON_KEY &&
    !String(SB.SUPABASE_URL).includes("YOUR_PROJECT") &&
    !String(SB.SUPABASE_ANON_KEY).includes("YOUR_ANON")
);
const supabase = SUPABASE_READY ? createClient(SB.SUPABASE_URL, SB.SUPABASE_ANON_KEY) : null;

const sheetList = document.getElementById("sheetList");
const sheetCount = document.getElementById("sheetCount");
const pdfFrame = document.getElementById("pdfFrame");
const readerTitle = document.getElementById("readerTitle");
const emptyState = document.getElementById("emptyState");
const openPdfLink = document.getElementById("openPdfLink");
const pdfFileInput = document.getElementById("pdfFileInput");
const uploadPdfControl = document.getElementById("uploadPdfControl");
const sheetHintTitle = document.getElementById("sheetHintTitle");
const sheetHintText = document.getElementById("sheetHintText");
const emptyStateText = document.getElementById("emptyStateText");

let activeObjectUrl = "";
let activeId = "";
let uploadedSheets = [];
let sheetsRemoteOk = false;

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
  if (!supabase) return [];
  const { data, error } = await supabase
    .from(SHEETS_TABLE)
    .select("id,title,file_name,storage_path,public_url,size_bytes,mime_type,created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  sheetsRemoteOk = true;
  return (data || []).map(remoteRowToSheet);
}

async function saveRemotePdf(file) {
  if (!supabase) throw new Error("Supabase not configured");
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safePdfName(file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from(SHEETS_BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/pdf",
      upsert: false
    });
  if (uploadError) throw uploadError;

  const { data: publicData } = supabase.storage.from(SHEETS_BUCKET).getPublicUrl(path);
  const publicUrl = publicData?.publicUrl || "";
  const row = {
    title: file.name.replace(/\.pdf$/i, ""),
    file_name: file.name,
    storage_path: path,
    public_url: publicUrl,
    size_bytes: file.size,
    mime_type: file.type || "application/pdf"
  };
  const { data, error: insertError } = await supabase
    .from(SHEETS_TABLE)
    .insert(row)
    .select("id,title,file_name,storage_path,public_url,size_bytes,mime_type,created_at")
    .single();
  if (insertError) {
    await supabase.storage.from(SHEETS_BUCKET).remove([path]).catch(() => {});
    throw insertError;
  }
  sheetsRemoteOk = true;
  return remoteRowToSheet(data);
}

async function deleteRemotePdf(sheet) {
  if (!supabase) throw new Error("Supabase not configured");
  if (sheet.storagePath) {
    const { error: storageError } = await supabase.storage.from(SHEETS_BUCKET).remove([sheet.storagePath]);
    if (storageError) throw storageError;
  }
  const { error } = await supabase.from(SHEETS_TABLE).delete().eq("id", sheet.id);
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
    openPdfLink.hidden = true;
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

function displayPdf({ id, title, url, objectUrl = false }) {
  if (!objectUrl) revokeActiveObjectUrl();
  activeId = id;
  readerTitle.textContent = title;
  pdfFrame.src = pdfEmbedUrl(url);
  pdfFrame.hidden = false;
  emptyState.hidden = true;
  document.body.classList.add("pdf-active");
  openPdfLink.href = url;
  openPdfLink.hidden = true;

  document.querySelectorAll(".sheet-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.sheetId === id);
  });
}

function createSheetButton({ id, title, meta, onOpen }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "sheet-item";
  button.dataset.sheetId = id;

  const strong = document.createElement("strong");
  strong.textContent = title;
  const span = document.createElement("span");
  span.textContent = meta;
  button.append(strong, span);
  button.addEventListener("click", onOpen);
  return button;
}

function renderStaticSheets(fragment) {
  DEFAULT_SHEETS.forEach((sheet, index) => {
    const id = `static-${index}`;
    fragment.append(
      createSheetButton({
        id,
        title: sheet.title,
        meta: sheet.file,
        onOpen: () => displayPdf({ id, title: sheet.title, url: sheet.file })
      })
    );
  });
}

function renderUploadedSheets(fragment) {
  uploadedSheets
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .forEach((sheet) => {
      const row = document.createElement("div");
      row.className = "sheet-row";

      const button = createSheetButton({
        id: sheet.id,
        title: sheet.title || sheet.fileName || "Uploaded PDF",
        meta: `${sheet.source === "supabase" ? "Supabase" : "Local"} · ${formatBytes(sheet.size)}`,
        onOpen: () => {
          if (sheet.source === "supabase") {
            displayPdf({
              id: sheet.id,
              title: sheet.title || sheet.fileName || "Uploaded PDF",
              url: sheet.publicUrl
            });
            return;
          }

          revokeActiveObjectUrl();
          activeObjectUrl = URL.createObjectURL(sheet.blob);
          displayPdf({
            id: sheet.id,
            title: sheet.title || sheet.fileName || "Uploaded PDF",
            url: activeObjectUrl,
            objectUrl: true
          });
        }
      });

      row.append(button);

      if (IS_ADMIN) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "sheet-delete";
        remove.textContent = "ลบ";
        remove.addEventListener("click", async () => {
          if (!confirm(`ลบ "${sheet.title || sheet.fileName}"?`)) return;
          await deleteUploadedPdf(sheet);
          await refreshUploadedSheets();
        });
        row.append(remove);
      }

      fragment.append(row);
    });
}

function renderSheetList() {
  const total = DEFAULT_SHEETS.length + uploadedSheets.length;
  sheetList.innerHTML = "";
  sheetCount.textContent = String(total);

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
  renderUploadedSheets(fragment);
  renderStaticSheets(fragment);
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
      displayPdf({ id: saved.id, title: saved.title, url: saved.publicUrl });
    } else {
      revokeActiveObjectUrl();
      activeObjectUrl = URL.createObjectURL(saved.blob);
      displayPdf({
        id: saved.id,
        title: saved.title,
        url: activeObjectUrl,
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

window.addEventListener("beforeunload", revokeActiveObjectUrl);

refreshUploadedSheets().catch((err) => {
  console.error(err);
  renderSheetList();
});
