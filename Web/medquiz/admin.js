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
  setAdminCodeError("Use an admin or teacher session from Clinical Study Hub.");
  if (adminCodeInput) adminCodeInput.hidden = true;
  if (adminConfirm) adminConfirm.disabled = false;
}

function closeAdminModal() {
  adminModal?.classList.add("hidden");
  setAdminCodeError("");
}

function readSupabaseAccessToken() {
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i) || "";
      if (!key.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
      const parsed = JSON.parse(localStorage.getItem(key) || "null");
      const token = parsed?.access_token || parsed?.currentSession?.access_token;
      if (typeof token === "string" && token) return token;
    }
  } catch {
    /* private mode or malformed storage */
  }
  return "";
}

async function loadSupabaseConfig() {
  const configUrl = new URL("../js/supabase-config.js", window.location.href).href;
  return import(configUrl);
}

async function fetchCurrentSupabaseUser(config, token) {
  const res = await fetch(`${config.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: config.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error("Sign in again from Clinical Study Hub.");
  const user = await res.json();
  if (!user?.id) throw new Error("Could not verify the current user.");
  return user;
}

async function fetchRole(config, token, uid) {
  const roleRes = await fetch(
    `${config.SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${encodeURIComponent(uid)}&select=role&limit=1`,
    {
      headers: {
        apikey: config.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    },
  );
  if (roleRes.ok) {
    const rows = await roleRes.json();
    const role = Array.isArray(rows) ? rows[0]?.role : "";
    if (role) return role;
  }

  const legacyRes = await fetch(
    `${config.SUPABASE_URL}/rest/v1/admin_users?user_id=eq.${encodeURIComponent(uid)}&select=user_id&limit=1`,
    {
      headers: {
        apikey: config.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    },
  );
  if (!legacyRes.ok) return "student";
  const legacyRows = await legacyRes.json();
  return Array.isArray(legacyRows) && legacyRows.length ? "admin" : "student";
}

async function verifyAdminRole() {
  const token = readSupabaseAccessToken();
  if (!token) throw new Error("No Clinical Study Hub session found. Sign in as admin or teacher first.");
  const config = await loadSupabaseConfig();
  const user = await fetchCurrentSupabaseUser(config, token);
  const role = await fetchRole(config, token, user.id);
  if (role !== "admin" && role !== "teacher") {
    throw new Error("Admin or teacher role required.");
  }
  return role;
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

adminCodeInput?.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeAdminModal();
  }
});

adminConfirm?.addEventListener("click", async () => {
  if (adminConfirm) adminConfirm.disabled = true;
  setAdminCodeError("Checking role...");
  try {
    await verifyAdminRole();
    enableAdminMode();
  } catch (err) {
    setAdminCodeError(err?.message || "Could not verify admin access.");
  } finally {
    if (adminConfirm) adminConfirm.disabled = false;
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && adminModal && !adminModal.classList.contains("hidden")) {
    closeAdminModal();
  }
});

updateAdminModeButton();
