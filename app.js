import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendEmailVerification,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  writeBatch,
  query,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAHWAq297J9b_r4sykqqAJMv_NFvlmbsN8",
  authDomain: "calculogastos.firebaseapp.com",
  projectId: "calculogastos",
  storageBucket: "calculogastos.firebasestorage.app",
  messagingSenderId: "832244318534",
  appId: "1:832244318534:web:60c541485523a0c48da547",
  measurementId: "G-GTMZRGTBV9",
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ══════════════════════════════════════════════════════════
//  CONSTANTS
// ══════════════════════════════════════════════════════════
const CATEGORIES = {
  alimentacao: { label: "Alimentação", icon: "utensils" },
  transporte:  { label: "Transporte",  icon: "car" },
  moradia:     { label: "Moradia",     icon: "home" },
  lazer:       { label: "Lazer",       icon: "film" },
  saude:       { label: "Saúde",       icon: "heart" },
  vestuario:   { label: "Vestuário",   icon: "shopping-bag" },
  educacao:    { label: "Educação",    icon: "book-open" },
  contas:      { label: "Contas",      icon: "zap" },
  jogos:       { label: "Jogos",       icon: "gamepad-2" },
  musica:      { label: "Música",      icon: "music" },
  outros:      { label: "Outros",      icon: "circle" },
};

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

const CAT_COLORS = [
  "#5c7cfa","#7048e8","#c2255c","#e8590c","#2f9e44",
  "#e67700","#1971c2","#0f9460","#9c36b5","#0ca678","#6b7280",
];

// ══════════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════════
let currentUser  = null;
let verifyUser   = null;
let expenses     = [];
let budgets      = {};
let closingDay   = 0;
let salary       = 0;
let chartCat     = null;
let chartMonths  = null;

let currentMonth, currentYear, viewYear;

function applyClosingDay() {
  const day = new Date().getDate();
  let m = new Date().getMonth() + 1;
  let y = new Date().getFullYear();
  if (closingDay && day < closingDay) { m--; if (m < 1) { m = 12; y--; } }
  currentMonth = m;
  currentYear  = y;
  viewYear     = y;
}
applyClosingDay();

// ══════════════════════════════════════════════════════════
//  UTILS
// ══════════════════════════════════════════════════════════
const fmt = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (s) => {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
};

const todayISO = () => new Date().toISOString().split("T")[0];

const loading = (show) =>
  (document.getElementById("loading").style.display = show ? "flex" : "none");

const showErr = (id, msg) => {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.remove("hidden");
};

const clearErr = (id) =>
  document.getElementById(id).classList.add("hidden");

const escHtml = (s) =>
  s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

// Returns which billing period (month, year) an expense date belongs to.
// With no closingDay: same as calendar month.
// With closingDay=6: Jun 1-5 → May cycle; Jun 6-30 → June cycle.
function expenseCyclePeriod(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!closingDay || d >= closingDay) return { month: m, year: y };
  // d < closingDay: belongs to previous month's cycle
  const prevM = m === 1 ? 12 : m - 1;
  const prevY = m === 1 ? y - 1 : y;
  return { month: prevM, year: prevY };
}

function showToast(msg, type = "success") {
  const icon = type === "success" ? "check-circle" : "alert-circle";
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<i data-lucide="${icon}"></i><span>${escHtml(msg)}</span>`;
  document.getElementById("toast-container").appendChild(el);
  icons();
  setTimeout(() => {
    el.classList.add("out");
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }, 3000);
}

let _confirmResolve = null;

function showConfirm(msg) {
  return new Promise((resolve) => {
    _confirmResolve = resolve;
    document.getElementById("confirm-message").textContent = msg;
    document.getElementById("confirm-overlay").classList.remove("hidden");
  });
}

function _resolveConfirm(result) {
  document.getElementById("confirm-overlay").classList.add("hidden");
  if (_confirmResolve) { _confirmResolve(result); _confirmResolve = null; }
}

document.getElementById("confirm-ok").addEventListener("click",      () => _resolveConfirm(true));
document.getElementById("confirm-cancel").addEventListener("click",  () => _resolveConfirm(false));
document.getElementById("confirm-overlay").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) _resolveConfirm(false);
});

const icons = () => {
  if (window.lucide) lucide.createIcons();
};

// ══════════════════════════════════════════════════════════
//  SETTINGS MODAL
// ══════════════════════════════════════════════════════════
function openSettingsModal() {
  document.getElementById("settings-salary").value      = salary      || "";
  document.getElementById("settings-closing-day").value = closingDay  || "";
  document.getElementById("settings-overlay").classList.remove("hidden");
}

function closeSettingsModal() {
  document.getElementById("settings-overlay").classList.add("hidden");
}

document.getElementById("btn-settings").addEventListener("click",     openSettingsModal);
document.getElementById("settings-close").addEventListener("click",   closeSettingsModal);
document.getElementById("settings-cancel").addEventListener("click",  closeSettingsModal);
document.getElementById("settings-overlay").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeSettingsModal();
});

document.getElementById("settings-save").addEventListener("click", async () => {
  const salaryVal = parseFloat(document.getElementById("settings-salary").value);
  salary     = salaryVal > 0 ? salaryVal : 0;

  const cdVal = parseInt(document.getElementById("settings-closing-day").value);
  closingDay = (cdVal >= 1 && cdVal <= 28) ? cdVal : 0;

  applyClosingDay();

  loading(true);
  try {
    await saveSettings({ salary, closingDay });
    closeSettingsModal();
    refreshDashboard();
    showToast("Configurações salvas!", "success");
  } catch (err) {
    console.error("saveSettings:", err.code, err.message);
    showToast("Erro ao salvar configurações.", "error");
  }
  loading(false);
});

// ══════════════════════════════════════════════════════════
//  THEME
// ══════════════════════════════════════════════════════════
(function initTheme() {
  const saved = localStorage.getItem("ff-theme") || "light";
  document.documentElement.setAttribute("data-theme", saved);
  icons();
})();

function setThemeIcon(theme) {
  const btn = document.getElementById("btn-theme");
  if (!btn) return;
  btn.innerHTML = theme === "dark"
    ? `<i data-lucide="sun"></i>`
    : `<i data-lucide="moon"></i>`;
  icons();
}

document.getElementById("btn-theme").addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("ff-theme", next);
  setThemeIcon(next);
  redrawActiveCharts();
});

setThemeIcon(document.documentElement.getAttribute("data-theme"));

// ══════════════════════════════════════════════════════════
//  CHART HELPERS
// ══════════════════════════════════════════════════════════
function chartColors() {
  const s = getComputedStyle(document.documentElement);
  return {
    text:    s.getPropertyValue("--text-m").trim(),
    text2:   s.getPropertyValue("--text-2").trim(),
    border:  s.getPropertyValue("--border").trim(),
    surface: s.getPropertyValue("--surface").trim(),
  };
}

function redrawActiveCharts() {
  const active = document.querySelector(".view.active")?.id;
  if (active === "view-dashboard") {
    renderCatChart(monthExpenses());
  } else if (active === "view-year") {
    renderMonthChart(yearExpenses(viewYear));
  }
}

function monthExpenses() {
  return expenses.filter((e) => {
    const { month, year } = expenseCyclePeriod(e.date);
    return month === currentMonth && year === currentYear;
  });
}

function yearExpenses(year) {
  return expenses.filter((e) => expenseCyclePeriod(e.date).year === year);
}

// ══════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════
onAuthStateChanged(auth, async (user) => {
  if (user) {
    if (!user.emailVerified) {
      verifyUser = user;
      showVerifyPanel(user.email);
      loading(false);
      return;
    }
    currentUser = user;
    setUserUI(user);
    await Promise.all([loadSettings(), loadExpenses(), loadBudgets()]);
    showApp();
  } else {
    currentUser = null;
    expenses   = [];
    budgets    = {};
    salary     = 0;
    closingDay = 0;
    applyClosingDay();
    showLogin();
  }
  loading(false);
});

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearErr("login-error");
  loading(true);
  try {
    await signInWithEmailAndPassword(
      auth,
      document.getElementById("login-email").value.trim(),
      document.getElementById("login-password").value
    );
  } catch (err) {
    loading(false);
    showErr("login-error", authMsg(err.code));
  }
});

document.getElementById("register-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearErr("register-error");
  const name  = document.getElementById("register-name").value.trim();
  const email = document.getElementById("register-email").value.trim();
  const pass  = document.getElementById("register-password").value;
  if (pass.length < 6) {
    showErr("register-error", "A senha deve ter pelo menos 6 caracteres.");
    return;
  }
  loading(true);
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });
    await sendEmailVerification(cred.user);
    // onAuthStateChanged dispara e mostra o painel de verificação
  } catch (err) {
    loading(false);
    showErr("register-error", authMsg(err.code));
  }
});

document.getElementById("btn-logout").addEventListener("click", () => signOut(auth));

// ── Esqueceu a senha ──────────────────────────────────────
function showForgotForm() {
  document.getElementById("auth-tabs").classList.add("hidden");
  document.querySelectorAll(".auth-form").forEach((f) => f.classList.remove("active"));
  clearErr("forgot-error");
  document.getElementById("forgot-success").classList.add("hidden");
  const loginEmail = document.getElementById("login-email").value.trim();
  if (loginEmail) document.getElementById("forgot-email").value = loginEmail;
  document.getElementById("forgot-form").classList.add("active");
}

function showLoginForm() {
  document.getElementById("forgot-form").classList.remove("active");
  document.getElementById("auth-tabs").classList.remove("hidden");
  document.querySelectorAll(".auth-tab").forEach((t) => t.classList.remove("active"));
  document.querySelector('[data-tab="login"]').classList.add("active");
  document.getElementById("login-form").classList.add("active");
}

document.getElementById("btn-forgot").addEventListener("click", (e) => {
  e.preventDefault();
  showForgotForm();
});

document.getElementById("btn-back-login").addEventListener("click", (e) => {
  e.preventDefault();
  showLoginForm();
});

document.getElementById("forgot-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearErr("forgot-error");
  document.getElementById("forgot-success").classList.add("hidden");
  const email = document.getElementById("forgot-email").value.trim();
  loading(true);
  try {
    await sendPasswordResetEmail(auth, email);
    loading(false);
    document.getElementById("forgot-success").textContent = "E-mail enviado! Verifique sua caixa de entrada.";
    document.getElementById("forgot-success").classList.remove("hidden");
  } catch (err) {
    loading(false);
    showErr("forgot-error", authMsg(err.code));
  }
});

// ── Verificação de e-mail ─────────────────────────────────
function showVerifyPanel(email) {
  document.getElementById("login-screen").classList.add("active");
  document.getElementById("app-screen").classList.remove("active");
  document.querySelectorAll(".auth-form").forEach((f) => f.classList.remove("active"));
  document.getElementById("auth-tabs").classList.add("hidden");
  document.getElementById("verify-email-addr").textContent = email;
  clearErr("verify-error");
  document.getElementById("verify-success").classList.add("hidden");
  document.getElementById("verify-panel").classList.add("active");
  lucide.createIcons();
}

function hideVerifyPanel() {
  verifyUser = null;
  document.getElementById("verify-panel").classList.remove("active");
  document.getElementById("auth-tabs").classList.remove("hidden");
  document.querySelectorAll(".auth-tab").forEach((t) => t.classList.remove("active"));
  document.querySelector('[data-tab="login"]').classList.add("active");
  document.getElementById("login-form").classList.add("active");
}

document.getElementById("btn-check-verify").addEventListener("click", async () => {
  if (!verifyUser) return;
  clearErr("verify-error");
  document.getElementById("verify-success").classList.add("hidden");
  loading(true);
  try {
    await verifyUser.reload();
    if (verifyUser.emailVerified) {
      const verified = verifyUser;
      hideVerifyPanel();
      currentUser = verified;
      setUserUI(verified);
      await Promise.all([loadSettings(), loadExpenses(), loadBudgets()]);
      showApp();
      loading(false);
    } else {
      loading(false);
      showErr("verify-error", "E-mail ainda não verificado. Verifique sua caixa de entrada.");
    }
  } catch {
    loading(false);
    showErr("verify-error", "Erro ao verificar. Tente novamente.");
  }
});

document.getElementById("btn-resend-verify").addEventListener("click", async () => {
  if (!verifyUser) return;
  clearErr("verify-error");
  document.getElementById("verify-success").classList.add("hidden");
  try {
    await sendEmailVerification(verifyUser);
    document.getElementById("verify-success").textContent = "E-mail reenviado! Verifique sua caixa de entrada.";
    document.getElementById("verify-success").classList.remove("hidden");
  } catch (err) {
    showErr("verify-error", authMsg(err.code));
  }
});

document.getElementById("btn-cancel-verify").addEventListener("click", async (e) => {
  e.preventDefault();
  await signOut(auth);
  hideVerifyPanel();
});

document.querySelectorAll(".auth-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".auth-tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".auth-form").forEach((f) => f.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`${tab.dataset.tab}-form`).classList.add("active");
  });
});

function authMsg(code) {
  const m = {
    "auth/user-not-found":          "Usuário não encontrado.",
    "auth/wrong-password":          "Senha incorreta.",
    "auth/email-already-in-use":    "E-mail já cadastrado.",
    "auth/invalid-email":           "E-mail inválido.",
    "auth/invalid-credential":      "E-mail ou senha incorretos.",
    "auth/too-many-requests":       "Muitas tentativas. Tente novamente mais tarde.",
    "auth/user-disabled":           "Esta conta foi desativada.",
    "auth/network-request-failed":  "Erro de conexão. Verifique sua internet.",
    "auth/missing-email":           "Informe um endereço de e-mail.",
  };
  return m[code] || "Ocorreu um erro. Tente novamente.";
}

function setUserUI(user) {
  const name = user.displayName || user.email.split("@")[0];
  document.getElementById("user-name").textContent  = name;
  document.getElementById("user-email").textContent = user.email;
  document.getElementById("user-avatar").textContent = name.charAt(0).toUpperCase();
}

// ══════════════════════════════════════════════════════════
//  SCREENS
// ══════════════════════════════════════════════════════════
function showLogin() {
  document.getElementById("login-screen").classList.add("active");
  document.getElementById("app-screen").classList.remove("active");
  // reset to login tab (in case user was in verify/forgot panels)
  document.getElementById("auth-tabs").classList.remove("hidden");
  document.querySelectorAll(".auth-form").forEach((f) => f.classList.remove("active"));
  document.querySelectorAll(".auth-tab").forEach((t) => t.classList.remove("active"));
  document.querySelector('[data-tab="login"]').classList.add("active");
  document.getElementById("login-form").classList.add("active");
}

function showApp() {
  document.getElementById("login-screen").classList.remove("active");
  document.getElementById("app-screen").classList.add("active");
  refreshDashboard();
}

// ══════════════════════════════════════════════════════════
//  NAVIGATION + MOBILE SIDEBAR
// ══════════════════════════════════════════════════════════
function openSidebar() {
  document.querySelector(".sidebar").classList.add("open");
  document.getElementById("sidebar-overlay").classList.add("active");
}

function closeSidebar() {
  document.querySelector(".sidebar").classList.remove("open");
  document.getElementById("sidebar-overlay").classList.remove("active");
}

document.getElementById("btn-menu").addEventListener("click", openSidebar);
document.getElementById("sidebar-overlay").addEventListener("click", closeSidebar);

document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    item.classList.add("active");
    document.getElementById(`view-${item.dataset.view}`).classList.add("active");
    if (item.dataset.view === "year")     renderYearView();
    if (item.dataset.view === "expenses") renderExpensesView();
    closeSidebar();
  });
});

// ══════════════════════════════════════════════════════════
//  FIRESTORE CRUD
// ══════════════════════════════════════════════════════════
async function loadExpenses() {
  const ref  = collection(db, "users", currentUser.uid, "expenses");
  const snap = await getDocs(query(ref, orderBy("date", "desc")));
  expenses   = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function addExpense(data) {
  const ref    = collection(db, "users", currentUser.uid, "expenses");
  const docRef = await addDoc(ref, { ...data, createdAt: serverTimestamp() });
  expenses.unshift({ id: docRef.id, ...data });
}

async function editExpense(id, data) {
  await updateDoc(doc(db, "users", currentUser.uid, "expenses", id), data);
  const i = expenses.findIndex((e) => e.id === id);
  if (i !== -1) expenses[i] = { ...expenses[i], ...data };
}

async function removeExpense(id) {
  await deleteDoc(doc(db, "users", currentUser.uid, "expenses", id));
  expenses = expenses.filter((e) => e.id !== id);
}

async function loadBudgets() {
  try {
    const snap = await getDoc(doc(db, "users", currentUser.uid, "budgets", "config"));
    budgets = snap.exists() ? snap.data() : {};
  } catch {
    budgets = {};
  }
}

async function saveBudgets(data) {
  await setDoc(doc(db, "users", currentUser.uid, "budgets", "config"), data);
  budgets = data;
}

async function loadSettings() {
  try {
    const snap = await getDoc(doc(db, "users", currentUser.uid, "settings", "config"));
    if (snap.exists()) {
      const data = snap.data();
      salary     = data.salary     || 0;
      closingDay = data.closingDay || 0;
      applyClosingDay();
    }
  } catch {
    // mantém os valores padrão
  }
}

async function saveSettings(data) {
  await setDoc(doc(db, "users", currentUser.uid, "settings", "config"), data);
}

// Adds N months to a YYYY-MM-DD date string, clamping to last day of resulting month
function addMonths(dateStr, months) {
  const [y, m, d] = dateStr.split("-").map(Number);
  let newM = m + months;
  let newY = y + Math.floor((newM - 1) / 12);
  newM = ((newM - 1) % 12) + 1;
  const lastDay = new Date(newY, newM, 0).getDate();
  return `${newY}-${String(newM).padStart(2,"0")}-${String(Math.min(d, lastDay)).padStart(2,"0")}`;
}

async function addExpensesBatch(items) {
  const colRef = collection(db, "users", currentUser.uid, "expenses");
  const batch  = writeBatch(db);
  const newExpenses = items.map((data) => {
    const ref = doc(colRef);
    batch.set(ref, { ...data, createdAt: serverTimestamp() });
    return { id: ref.id, ...data };
  });
  await batch.commit();
  expenses.push(...newExpenses);
  expenses.sort((a, b) => b.date.localeCompare(a.date));
}

// ══════════════════════════════════════════════════════════
//  BUDGET BARS + MODAL
// ══════════════════════════════════════════════════════════
function renderSalaryCard(total) {
  const card = document.getElementById("salary-card");
  if (!salary || salary <= 0) { card.classList.add("hidden"); return; }

  card.classList.remove("hidden");

  const available = salary - total;
  const pct       = Math.min(100, Math.round((total / salary) * 100));
  const status    = pct >= 100 ? "over" : pct >= 75 ? "warn" : "ok";

  const availEl    = document.getElementById("salary-available");
  const progressEl = document.getElementById("salary-progress");
  const pctEl      = document.getElementById("salary-pct");

  availEl.textContent = available >= 0
    ? `${fmt(available)} disponível`
    : `${fmt(Math.abs(available))} acima do salário`;
  availEl.className = `salary-available ${status}`;

  progressEl.value     = pct;
  progressEl.className = `salary-progress ${status !== "ok" ? status : ""}`;

  pctEl.textContent = `${pct}%`;
  pctEl.style.color = status === "over" ? "var(--danger)" : status === "warn" ? "var(--warning)" : "var(--text-m)";

  document.getElementById("salary-amount").textContent = fmt(salary);
  document.getElementById("salary-spent").textContent  = fmt(total);
}

function renderBudgetBars(mExp) {
  const el = document.getElementById("budget-bars");
  const totals = {};
  mExp.forEach((e) => { totals[e.category] = (totals[e.category] || 0) + e.amount; });

  const items = Object.entries(budgets).filter(([, limit]) => limit > 0);
  if (items.length === 0) { el.innerHTML = ""; return; }

  el.innerHTML = items.map(([cat, limit]) => {
    const spent = totals[cat] || 0;
    const pct   = Math.min(100, Math.round((spent / limit) * 100));
    const over  = pct >= 90;
    const label = CATEGORIES[cat]?.label ?? cat;
    return `
      <div class="budget-bar-item">
        <div class="budget-bar-header">
          <span class="budget-bar-label">${label}</span>
          <span class="budget-bar-values">${fmt(spent)} / ${fmt(limit)}</span>
        </div>
        <progress class="budget-progress${over ? " over" : ""}" value="${pct}" max="100"></progress>
      </div>`;
  }).join("");
}

function openBudgetModal() {
  const list = document.getElementById("budget-category-list");
  list.innerHTML = Object.entries(CATEGORIES).map(([key, cat]) => `
    <div class="budget-cat-row">
      <span class="budget-cat-label">${cat.label}</span>
      <input type="number" id="budget-${key}" placeholder="Sem limite"
             min="0" step="0.01" value="${budgets[key] || ""}" />
    </div>
  `).join("");
  clearErr("budget-error");
  document.getElementById("budget-overlay").classList.remove("hidden");
}

function closeBudgetModal() {
  document.getElementById("budget-overlay").classList.add("hidden");
}

document.getElementById("btn-budgets").addEventListener("click",   openBudgetModal);
document.getElementById("budget-close").addEventListener("click",  closeBudgetModal);
document.getElementById("budget-cancel").addEventListener("click", closeBudgetModal);
document.getElementById("budget-overlay").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeBudgetModal();
});

document.getElementById("budget-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearErr("budget-error");
  loading(true);
  const data = {};
  Object.keys(CATEGORIES).forEach((key) => {
    const val = parseFloat(document.getElementById(`budget-${key}`)?.value);
    if (val > 0) data[key] = val;
  });
  try {
    await saveBudgets(data);
    closeBudgetModal();
    refreshDashboard();
    showToast("Orçamentos salvos!", "success");
  } catch (err) {
    console.error(err);
    showErr("budget-error", "Erro ao salvar. Tente novamente.");
  }
  loading(false);
});

// ══════════════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════════════
function refreshDashboard() {
  const mExp  = monthExpenses();
  const yExp  = yearExpenses(currentYear);
  const total = mExp.reduce((s, e) => s + e.amount, 0);
  const yTot  = yExp.reduce((s, e) => s + e.amount, 0);
  const days  = new Date(currentYear, currentMonth, 0).getDate();

  document.getElementById("current-month-label").textContent =
    `${MONTHS[currentMonth - 1]} ${currentYear}`;

  const rangeEl = document.getElementById("cycle-range-label");
  if (closingDay) {
    const prevM = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevY = currentMonth === 1 ? currentYear - 1 : currentYear;
    const startDay = Math.min(closingDay + 1, new Date(prevY, prevM, 0).getDate());
    const endDay   = Math.min(closingDay, new Date(currentYear, currentMonth, 0).getDate());
    rangeEl.textContent = `${startDay} ${MONTHS[prevM-1].slice(0,3)} → ${endDay} ${MONTHS[currentMonth-1].slice(0,3)}`;
    rangeEl.classList.remove("hidden");
  } else {
    rangeEl.classList.add("hidden");
  }

  document.getElementById("total-month").textContent       = fmt(total);
  document.getElementById("total-month-count").textContent =
    `${mExp.length} gasto${mExp.length !== 1 ? "s" : ""}`;

  const top = mExp.reduce((m, e) => (e.amount > (m?.amount ?? 0) ? e : m), null);
  document.getElementById("highest-expense").textContent     = top ? fmt(top.amount) : fmt(0);
  document.getElementById("highest-expense-cat").textContent = top
    ? (CATEGORIES[top.category]?.label ?? top.category) : "–";

  document.getElementById("daily-avg").textContent     = fmt(total / days);
  document.getElementById("daily-avg-sub").textContent = `${days} dias no mês`;

  document.getElementById("total-year").textContent     = fmt(yTot);
  document.getElementById("total-year-sub").textContent = `em ${currentYear}`;

  renderCatChart(mExp);
  renderRecentList(mExp.slice(0, 8));
  renderBudgetBars(mExp);
  renderSalaryCard(total);
}

document.getElementById("prev-month").addEventListener("click", () => {
  currentMonth--;
  if (currentMonth < 1) { currentMonth = 12; currentYear--; }
  refreshDashboard();
});

document.getElementById("next-month").addEventListener("click", () => {
  currentMonth++;
  if (currentMonth > 12) { currentMonth = 1; currentYear++; }
  refreshDashboard();
});

// ══════════════════════════════════════════════════════════
//  CHARTS
// ══════════════════════════════════════════════════════════
function renderCatChart(data) {
  const totals = {};
  data.forEach((e) => { totals[e.category] = (totals[e.category] || 0) + e.amount; });

  const labels = Object.keys(totals).map((k) => CATEGORIES[k]?.label ?? k);
  const values = Object.values(totals);
  const c = chartColors();
  const isSmall = window.innerWidth < 700;

  if (chartCat) chartCat.destroy();
  const ctx = document.getElementById("chart-categories").getContext("2d");

  if (values.length === 0) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = c.text;
    ctx.font = "13px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Sem gastos neste mês", ctx.canvas.width / 2, ctx.canvas.height / 2);
    return;
  }

  chartCat = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: CAT_COLORS,
        borderWidth: 0,
        hoverOffset: 5,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: !isSmall,
          position: "right",
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            padding: 12,
            font: { size: 12, family: "Inter, system-ui" },
            color: c.text2,
            usePointStyle: true,
            pointStyle: "circle",
          },
        },
        tooltip: {
          callbacks: { label: (ctx) => `  ${fmt(ctx.raw)}` },
          bodyFont: { family: "Inter, system-ui" },
        },
      },
      cutout: "68%",
    },
  });
}

function renderMonthChart(data) {
  const byMonth = Array.from({ length: 12 }, (_, i) =>
    data.filter((e) => parseInt(e.date.split("-")[1]) === i + 1)
        .reduce((s, e) => s + e.amount, 0)
  );

  const c = chartColors();

  if (chartMonths) chartMonths.destroy();
  const ctx = document.getElementById("chart-months").getContext("2d");

  chartMonths = new Chart(ctx, {
    type: "bar",
    data: {
      labels: MONTHS.map((m) => m.slice(0, 3)),
      datasets: [{
        data: byMonth,
        backgroundColor: byMonth.map((_, i) =>
          (i + 1 === currentMonth && viewYear === currentYear)
            ? "var(--primary)" : c.border
        ),
        borderRadius: 6,
        borderSkipped: false,
        hoverBackgroundColor: byMonth.map((_, i) =>
          (i + 1 === currentMonth && viewYear === currentYear)
            ? "var(--primary-d)" : c.text
        ),
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (ctx) => `  ${fmt(ctx.raw)}` },
          bodyFont: { family: "Inter, system-ui" },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: c.text, font: { size: 12, family: "Inter, system-ui" } },
          border: { display: false },
        },
        y: {
          grid: { color: c.border },
          border: { display: false, dash: [4, 4] },
          ticks: {
            color: c.text,
            font: { size: 11, family: "Inter, system-ui" },
            callback: (v) => `R$ ${(v / 1000).toFixed(0)}k`,
          },
        },
      },
    },
  });
}

// ══════════════════════════════════════════════════════════
//  RECENT LIST
// ══════════════════════════════════════════════════════════
function renderRecentList(data) {
  const el = document.getElementById("recent-list");
  if (data.length === 0) {
    el.innerHTML = `<div class="empty-state" style="padding:32px 0">
      <i data-lucide="inbox"></i><p>Sem gastos neste mês</p></div>`;
    icons();
    return;
  }
  el.innerHTML = data.map((e) => expenseHTML(e, false)).join("");
  icons();
}

// ══════════════════════════════════════════════════════════
//  YEAR VIEW
// ══════════════════════════════════════════════════════════
function renderYearView() {
  document.getElementById("current-year-label").textContent = viewYear;
  const yExp = yearExpenses(viewYear);
  renderMonthChart(yExp);

  document.getElementById("months-grid").innerHTML = MONTHS.map((name, i) => {
    const m    = i + 1;
    const mExp = yExp.filter((e) => parseInt(e.date.split("-")[1]) === m);
    const tot  = mExp.reduce((s, e) => s + e.amount, 0);
    const cur  = m === currentMonth && viewYear === currentYear;
    return `
      <div class="month-card ${cur ? "current" : ""}"
           onclick="goToMonth(${m}, ${viewYear})">
        <div class="month-card-name">${name}</div>
        <div class="month-card-total">${fmt(tot)}</div>
        <div class="month-card-count">${mExp.length} gasto${mExp.length !== 1 ? "s" : ""}</div>
      </div>`;
  }).join("");
}

window.goToMonth = (month, year) => {
  currentMonth = month;
  currentYear  = year;
  document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.querySelector('[data-view="dashboard"]').classList.add("active");
  document.getElementById("view-dashboard").classList.add("active");
  refreshDashboard();
};

document.getElementById("prev-year").addEventListener("click", () => { viewYear--; renderYearView(); });
document.getElementById("next-year").addEventListener("click", () => { viewYear++; renderYearView(); });

// ══════════════════════════════════════════════════════════
//  EXPENSES VIEW
// ══════════════════════════════════════════════════════════
function renderExpensesView() { applyFilters(); }

function applyFilters() {
  const month  = document.getElementById("filter-month").value;
  const cat    = document.getElementById("filter-category").value;
  const search = document.getElementById("filter-search").value.toLowerCase();
  const sort   = document.getElementById("sort-expenses").value;

  const filtered = expenses.filter((e) => {
    if (month && expenseCyclePeriod(e.date).month !== parseInt(month)) return false;
    if (cat    && e.category !== cat) return false;
    if (search && !e.description.toLowerCase().includes(search)) return false;
    return true;
  });

  if (sort === "date-asc")       filtered.sort((a, b) => a.date.localeCompare(b.date));
  else if (sort === "date-desc") filtered.sort((a, b) => b.date.localeCompare(a.date));
  else if (sort === "amount-desc") filtered.sort((a, b) => b.amount - a.amount);
  else if (sort === "amount-asc")  filtered.sort((a, b) => a.amount - b.amount);
  else if (sort === "cat-az")
    filtered.sort((a, b) =>
      (CATEGORIES[a.category]?.label ?? a.category)
        .localeCompare(CATEGORIES[b.category]?.label ?? b.category)
    );

  const list  = document.getElementById("expenses-list");
  const empty = document.getElementById("expenses-empty");

  if (filtered.length === 0) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    icons();
    return;
  }

  empty.classList.add("hidden");
  list.innerHTML = filtered.map((e) => expenseHTML(e, true)).join("");
  icons();
}

["filter-month", "filter-category", "filter-search", "sort-expenses"].forEach((id) => {
  document.getElementById(id).addEventListener("input",  applyFilters);
  document.getElementById(id).addEventListener("change", applyFilters);
});

document.getElementById("btn-export-csv").addEventListener("click", () => {
  const month  = document.getElementById("filter-month").value;
  const cat    = document.getElementById("filter-category").value;
  const search = document.getElementById("filter-search").value.toLowerCase();

  const filtered = expenses.filter((e) => {
    if (month && expenseCyclePeriod(e.date).month !== parseInt(month)) return false;
    if (cat    && e.category !== cat) return false;
    if (search && !e.description.toLowerCase().includes(search)) return false;
    return true;
  });

  const BOM    = "﻿";
  const header = "Data,Descrição,Categoria,Valor";
  const rows   = filtered.map((e) => [
    fmtDate(e.date),
    `"${e.description.replace(/"/g, '""')}"`,
    CATEGORIES[e.category]?.label ?? e.category,
    e.amount.toFixed(2).replace(".", ","),
  ].join(","));

  const csv  = BOM + [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = month
    ? `financeflow-${String(month).padStart(2, "0")}.csv`
    : "financeflow-todos.csv";
  a.click();
  URL.revokeObjectURL(url);
  showToast("CSV exportado!", "success");
});

// ══════════════════════════════════════════════════════════
//  EXPENSE ITEM HTML
// ══════════════════════════════════════════════════════════
function expenseHTML(e, showActions) {
  const cat = CATEGORIES[e.category] ?? { label: e.category, icon: "circle" };
  return `
    <div class="expense-item" data-cat="${e.category}">
      <div class="expense-icon"><i data-lucide="${cat.icon}"></i></div>
      <div class="expense-info">
        <div class="expense-desc">${escHtml(e.description)}</div>
        <div class="expense-meta">${cat.label} &middot; ${fmtDate(e.date)}</div>
      </div>
      <div class="expense-amount">${fmt(e.amount)}</div>
      ${showActions ? `
      <div class="expense-actions">
        <button class="icon-btn" onclick="openEdit('${e.id}')" title="Editar">
          <i data-lucide="pencil"></i>
        </button>
        <button class="icon-btn danger" onclick="confirmDelete('${e.id}')" title="Excluir">
          <i data-lucide="trash-2"></i>
        </button>
      </div>` : ""}
    </div>`;
}

// ══════════════════════════════════════════════════════════
//  MODAL
// ══════════════════════════════════════════════════════════
function openModal(title) {
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-overlay").classList.remove("hidden");
  clearErr("expense-error");
  icons();
}

function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
  document.getElementById("expense-form").reset();
  document.getElementById("expense-id").value = "";
  document.getElementById("expense-recurring").checked = false;
  document.getElementById("recurring-options").classList.add("hidden");
  document.getElementById("recurring-group").classList.remove("hidden");
}

document.getElementById("btn-add-expense").addEventListener("click",  openAddModal);
document.getElementById("btn-add-expense-2").addEventListener("click", openAddModal);
document.getElementById("modal-close").addEventListener("click",  closeModal);
document.getElementById("modal-cancel").addEventListener("click", closeModal);
document.getElementById("modal-overlay").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeModal();
});

function openAddModal() {
  document.getElementById("expense-date").value = todayISO();
  document.getElementById("recurring-group").classList.remove("hidden");
  openModal("Novo gasto");
}

window.openEdit = (id) => {
  const e = expenses.find((x) => x.id === id);
  if (!e) return;
  document.getElementById("expense-id").value          = id;
  document.getElementById("expense-amount").value      = e.amount;
  document.getElementById("expense-date").value        = e.date;
  document.getElementById("expense-category").value    = e.category;
  document.getElementById("expense-description").value = e.description;
  document.getElementById("recurring-group").classList.add("hidden");
  openModal("Editar gasto");
};

// Recurring toggle
document.getElementById("expense-recurring").addEventListener("change", (ev) => {
  document.getElementById("recurring-options").classList.toggle("hidden", !ev.target.checked);
});

document.getElementById("recurring-type").addEventListener("change", () => {
  const type = document.getElementById("recurring-type").value;
  document.getElementById("recurring-count-label").textContent =
    type === "installment" ? "Nº de parcelas" : "Meses a repetir";
});

window.confirmDelete = async (id) => {
  if (!await showConfirm("Deseja excluir este gasto?")) return;
  loading(true);
  await removeExpense(id);
  loading(false);
  showToast("Gasto excluído.", "success");
  afterChange();
};

document.getElementById("expense-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearErr("expense-error");

  const id     = document.getElementById("expense-id").value;
  const amount = parseFloat(document.getElementById("expense-amount").value);
  const date   = document.getElementById("expense-date").value;
  const cat    = document.getElementById("expense-category").value;
  const desc   = document.getElementById("expense-description").value.trim();

  if (!amount || amount <= 0) { showErr("expense-error", "Informe um valor válido."); return; }
  if (!date)  { showErr("expense-error", "Informe a data."); return; }
  if (!cat)   { showErr("expense-error", "Selecione uma categoria."); return; }
  if (!desc)  { showErr("expense-error", "Informe a descrição."); return; }

  const isRecurring = !id && document.getElementById("expense-recurring").checked;
  if (isRecurring) {
    const type     = document.getElementById("recurring-type").value;
    const count    = parseInt(document.getElementById("recurring-count").value);
    const interval = parseInt(document.getElementById("recurring-interval").value) || 1;
    if (!count || count < 2) { showErr("expense-error", "Informe a quantidade (mínimo 2)."); return; }

    const items = Array.from({ length: count }, (_, i) => ({
      amount,
      date:     addMonths(date, i * interval),
      category: cat,
      description: type === "installment" ? `${desc} (${i + 1}/${count})` : desc,
    }));

    loading(true);
    try {
      await addExpensesBatch(items);
      closeModal();
      showToast(
        type === "installment" ? `${count} parcelas criadas!` : `${count} meses agendados!`,
        "success"
      );
      afterChange();
    } catch (err) {
      loading(false);
      showErr("expense-error", "Erro ao salvar. Tente novamente.");
      console.error(err);
    }
    return;
  }

  loading(true);
  try {
    const data = { amount, date, category: cat, description: desc };
    if (id) await editExpense(id, data);
    else    await addExpense(data);
    closeModal();
    showToast(id ? "Gasto atualizado!" : "Gasto salvo!", "success");
    afterChange();
  } catch (err) {
    loading(false);
    showErr("expense-error", "Erro ao salvar. Tente novamente.");
    console.error(err);
  }
});

// ══════════════════════════════════════════════════════════
//  AFTER CHANGE
// ══════════════════════════════════════════════════════════
function afterChange() {
  loading(false);
  const active = document.querySelector(".view.active")?.id;
  refreshDashboard();
  if (active === "view-year")     renderYearView();
  if (active === "view-expenses") renderExpensesView();
}

// Redraw charts on resize (handles orientation change + responsive legend)
let _resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(redrawActiveCharts, 250);
});
