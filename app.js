// ════════════════════════════════════════════════════════════
//  CONFIGURAÇÃO FIREBASE
//  ► Substitua pelos seus dados em https://console.firebase.google.com
// ════════════════════════════════════════════════════════════
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
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
  measurementId: "G-GTMZRGTBV9"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ════════════════════════════════════════════════════════════
//  CONSTANTES
// ════════════════════════════════════════════════════════════
const CATEGORIES = {
  alimentacao: { label: "Alimentação", icon: "🍔" },
  transporte:  { label: "Transporte",  icon: "🚗" },
  moradia:     { label: "Moradia",     icon: "🏠" },
  lazer:       { label: "Lazer",       icon: "🎬" },
  saude:       { label: "Saúde",       icon: "💊" },
  vestuario:   { label: "Vestuário",   icon: "👕" },
  educacao:    { label: "Educação",    icon: "📚" },
  contas:      { label: "Contas",      icon: "💡" },
  outros:      { label: "Outros",      icon: "💳" },
};

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
];

const CAT_COLORS = [
  "#6366f1","#8b5cf6","#ec4899","#f59e0b","#10b981",
  "#3b82f6","#ef4444","#14b8a6","#f97316"
];

// ════════════════════════════════════════════════════════════
//  ESTADO
// ════════════════════════════════════════════════════════════
let currentUser   = null;
let expenses      = [];   // todos os gastos do usuário (cache)
let currentMonth  = new Date().getMonth() + 1;   // 1-12
let currentYear   = new Date().getFullYear();
let viewYear      = new Date().getFullYear();
let chartCategories = null;
let chartMonths     = null;

// ════════════════════════════════════════════════════════════
//  UTILITÁRIOS
// ════════════════════════════════════════════════════════════
const fmt = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (dateStr) => {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
};

const todayISO = () => new Date().toISOString().split("T")[0];

const loading = (show) => {
  document.getElementById("loading").style.display = show ? "flex" : "none";
};

const showError = (id, msg) => {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.remove("hidden");
};

const clearError = (id) => document.getElementById(id).classList.add("hidden");

// ════════════════════════════════════════════════════════════
//  AUTH
// ════════════════════════════════════════════════════════════
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    setUserUI(user);
    await loadExpenses();
    showApp();
  } else {
    currentUser = null;
    showLogin();
  }
  loading(false);
});

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError("login-error");
  const email    = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  loading(true);
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    loading(false);
    showError("login-error", friendlyAuthError(err.code));
  }
});

document.getElementById("register-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError("register-error");
  const name     = document.getElementById("register-name").value.trim();
  const email    = document.getElementById("register-email").value.trim();
  const password = document.getElementById("register-password").value;
  if (password.length < 6) {
    showError("register-error", "A senha deve ter pelo menos 6 caracteres.");
    return;
  }
  loading(true);
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
  } catch (err) {
    loading(false);
    showError("register-error", friendlyAuthError(err.code));
  }
});

document.getElementById("btn-logout").addEventListener("click", async () => {
  await signOut(auth);
});

// Auth-tab switching
document.querySelectorAll(".auth-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".auth-tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".auth-form").forEach((f) => f.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`${tab.dataset.tab}-form`).classList.add("active");
  });
});

function friendlyAuthError(code) {
  const map = {
    "auth/user-not-found":       "Usuário não encontrado.",
    "auth/wrong-password":       "Senha incorreta.",
    "auth/email-already-in-use": "E-mail já cadastrado.",
    "auth/invalid-email":        "E-mail inválido.",
    "auth/invalid-credential":   "E-mail ou senha incorretos.",
    "auth/too-many-requests":    "Muitas tentativas. Tente novamente mais tarde.",
  };
  return map[code] || "Ocorreu um erro. Tente novamente.";
}

function setUserUI(user) {
  const name = user.displayName || user.email.split("@")[0];
  document.getElementById("user-name").textContent  = name;
  document.getElementById("user-email").textContent = user.email;
  document.getElementById("user-avatar").textContent = name.charAt(0).toUpperCase();
}

// ════════════════════════════════════════════════════════════
//  TELAS
// ════════════════════════════════════════════════════════════
function showLogin() {
  document.getElementById("login-screen").classList.add("active");
  document.getElementById("app-screen").classList.remove("active");
}

function showApp() {
  document.getElementById("login-screen").classList.remove("active");
  document.getElementById("app-screen").classList.add("active");
  refreshDashboard();
}

// ════════════════════════════════════════════════════════════
//  NAVEGAÇÃO (views)
// ════════════════════════════════════════════════════════════
document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    item.classList.add("active");
    document.getElementById(`view-${item.dataset.view}`).classList.add("active");

    if (item.dataset.view === "year")     renderYearView();
    if (item.dataset.view === "expenses") renderExpensesView();
  });
});

// ════════════════════════════════════════════════════════════
//  FIRESTORE — CRUD
// ════════════════════════════════════════════════════════════
async function loadExpenses() {
  if (!currentUser) return;
  const ref  = collection(db, "users", currentUser.uid, "expenses");
  const snap = await getDocs(query(ref, orderBy("date", "desc")));
  expenses = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function addExpense(data) {
  const ref = collection(db, "users", currentUser.uid, "expenses");
  const docRef = await addDoc(ref, { ...data, createdAt: serverTimestamp() });
  expenses.unshift({ id: docRef.id, ...data });
}

async function editExpense(id, data) {
  const ref = doc(db, "users", currentUser.uid, "expenses", id);
  await updateDoc(ref, data);
  const idx = expenses.findIndex((e) => e.id === id);
  if (idx !== -1) expenses[idx] = { ...expenses[idx], ...data };
}

async function removeExpense(id) {
  const ref = doc(db, "users", currentUser.uid, "expenses", id);
  await deleteDoc(ref);
  expenses = expenses.filter((e) => e.id !== id);
}

// ════════════════════════════════════════════════════════════
//  DASHBOARD
// ════════════════════════════════════════════════════════════
function refreshDashboard() {
  const monthExpenses = expenses.filter((e) => {
    const [y, m] = e.date.split("-");
    return parseInt(m) === currentMonth && parseInt(y) === currentYear;
  });

  const yearExpenses = expenses.filter((e) => {
    const [y] = e.date.split("-");
    return parseInt(y) === currentYear;
  });

  const total = monthExpenses.reduce((s, e) => s + e.amount, 0);
  const yearTotal = yearExpenses.reduce((s, e) => s + e.amount, 0);

  document.getElementById("current-month-label").textContent =
    `${MONTHS[currentMonth - 1]} ${currentYear}`;

  document.getElementById("total-month").textContent = fmt(total);
  document.getElementById("total-month-count").textContent =
    `${monthExpenses.length} gasto${monthExpenses.length !== 1 ? "s" : ""}`;

  const highest = monthExpenses.reduce((m, e) => (e.amount > (m?.amount ?? 0) ? e : m), null);
  document.getElementById("highest-expense").textContent = highest ? fmt(highest.amount) : "R$ 0,00";
  document.getElementById("highest-expense-cat").textContent = highest
    ? CATEGORIES[highest.category]?.label ?? highest.category : "–";

  const days = new Date(currentYear, currentMonth, 0).getDate();
  document.getElementById("daily-avg").textContent = fmt(total / days);
  document.getElementById("daily-avg-sub").textContent = `em ${days} dias`;

  document.getElementById("total-year").textContent = fmt(yearTotal);
  document.getElementById("total-year-sub").textContent = `em ${currentYear}`;

  renderCategoryChart(monthExpenses);
  renderRecentList(monthExpenses.slice(0, 7));
}

// Month navigation
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

// ════════════════════════════════════════════════════════════
//  CHARTS
// ════════════════════════════════════════════════════════════
function renderCategoryChart(data) {
  const totals = {};
  data.forEach((e) => {
    totals[e.category] = (totals[e.category] || 0) + e.amount;
  });

  const labels = Object.keys(totals).map((k) => CATEGORIES[k]?.label ?? k);
  const values = Object.values(totals);

  if (chartCategories) chartCategories.destroy();

  const ctx = document.getElementById("chart-categories").getContext("2d");

  if (values.length === 0) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "14px Segoe UI";
    ctx.textAlign = "center";
    ctx.fillText("Nenhum gasto neste mês", ctx.canvas.width / 2, ctx.canvas.height / 2);
    return;
  }

  chartCategories = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: CAT_COLORS,
        borderWidth: 0,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "right", labels: { boxWidth: 12, padding: 10, font: { size: 12 } } },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${fmt(ctx.raw)}`,
          },
        },
      },
      cutout: "65%",
    },
  });
}

function renderMonthChart(yearData) {
  const byMonth = Array.from({ length: 12 }, (_, i) =>
    yearData.filter((e) => parseInt(e.date.split("-")[1]) === i + 1)
            .reduce((s, e) => s + e.amount, 0)
  );

  if (chartMonths) chartMonths.destroy();

  const ctx = document.getElementById("chart-months").getContext("2d");
  chartMonths = new Chart(ctx, {
    type: "bar",
    data: {
      labels: MONTHS.map((m) => m.slice(0, 3)),
      datasets: [{
        label: "Total",
        data: byMonth,
        backgroundColor: byMonth.map((_, i) =>
          (i + 1 === currentMonth && viewYear === currentYear)
            ? "#6366f1" : "#c7d2fe"
        ),
        borderRadius: 8,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => ` ${fmt(ctx.raw)}` } },
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          ticks: { callback: (v) => `R$ ${(v / 1000).toFixed(0)}k` },
          grid: { color: "#f1f5f9" },
        },
      },
    },
  });
}

// ════════════════════════════════════════════════════════════
//  RECENT LIST (dashboard)
// ════════════════════════════════════════════════════════════
function renderRecentList(data) {
  const el = document.getElementById("recent-list");
  if (data.length === 0) {
    el.innerHTML = `<div class="empty-state" style="padding:24px"><span>📭</span><p>Sem gastos neste mês</p></div>`;
    return;
  }
  el.innerHTML = data.map((e) => expenseItemHTML(e, true)).join("");
}

// ════════════════════════════════════════════════════════════
//  YEAR VIEW
// ════════════════════════════════════════════════════════════
function renderYearView() {
  document.getElementById("current-year-label").textContent = viewYear;

  const yearData = expenses.filter((e) => parseInt(e.date.split("-")[0]) === viewYear);

  renderMonthChart(yearData);

  const grid = document.getElementById("months-grid");
  grid.innerHTML = MONTHS.map((name, i) => {
    const m = i + 1;
    const monthData = yearData.filter((e) => parseInt(e.date.split("-")[1]) === m);
    const total = monthData.reduce((s, e) => s + e.amount, 0);
    const isCurrent = m === currentMonth && viewYear === currentYear;
    return `
      <div class="month-card ${isCurrent ? "current" : ""}"
           onclick="goToMonth(${m}, ${viewYear})">
        <div class="month-card-name">${name}</div>
        <div class="month-card-total">${fmt(total)}</div>
        <div class="month-card-count">${monthData.length} gasto${monthData.length !== 1 ? "s" : ""}</div>
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

document.getElementById("prev-year").addEventListener("click", () => {
  viewYear--;
  renderYearView();
});
document.getElementById("next-year").addEventListener("click", () => {
  viewYear++;
  renderYearView();
});

// ════════════════════════════════════════════════════════════
//  EXPENSES VIEW
// ════════════════════════════════════════════════════════════
function renderExpensesView() {
  applyFilters();
}

function applyFilters() {
  const month  = document.getElementById("filter-month").value;
  const cat    = document.getElementById("filter-category").value;
  const search = document.getElementById("filter-search").value.toLowerCase();

  const filtered = expenses.filter((e) => {
    const [y, m] = e.date.split("-");
    if (month && parseInt(m) !== parseInt(month)) return false;
    if (cat && e.category !== cat) return false;
    if (search && !e.description.toLowerCase().includes(search)) return false;
    return true;
  });

  const list  = document.getElementById("expenses-list");
  const empty = document.getElementById("expenses-empty");

  if (filtered.length === 0) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
  } else {
    empty.classList.add("hidden");
    list.innerHTML = filtered.map((e) => expenseItemHTML(e, false)).join("");
  }
}

["filter-month", "filter-category", "filter-search"].forEach((id) => {
  document.getElementById(id).addEventListener("input", applyFilters);
  document.getElementById(id).addEventListener("change", applyFilters);
});

// ════════════════════════════════════════════════════════════
//  EXPENSE ITEM HTML
// ════════════════════════════════════════════════════════════
function expenseItemHTML(e, compact) {
  const cat  = CATEGORIES[e.category] ?? { label: e.category, icon: "💳" };
  const cls  = compact ? "expense-item-compact" : "expense-item";
  const actions = compact ? "" : `
    <div class="expense-actions">
      <button class="btn-icon" onclick="openEdit('${e.id}')" title="Editar">✏️</button>
      <button class="btn-icon danger" onclick="confirmDelete('${e.id}')" title="Excluir">🗑️</button>
    </div>`;

  return `
    <div class="${cls}" data-cat="${e.category}">
      <div class="expense-icon">${cat.icon}</div>
      <div class="expense-info">
        <div class="expense-desc">${escHtml(e.description)}</div>
        <div class="expense-meta">${cat.label} · ${fmtDate(e.date)}</div>
      </div>
      <div class="expense-amount">${fmt(e.amount)}</div>
      ${actions}
    </div>`;
}

const escHtml = (s) =>
  s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

// ════════════════════════════════════════════════════════════
//  MODAL — ADD / EDIT
// ════════════════════════════════════════════════════════════
function openModal(title = "Novo Gasto") {
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-overlay").classList.remove("hidden");
  clearError("expense-error");
}

function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
  document.getElementById("expense-form").reset();
  document.getElementById("expense-id").value = "";
}

document.getElementById("btn-add-expense").addEventListener("click",  () => openAddModal());
document.getElementById("btn-add-expense-2").addEventListener("click", () => openAddModal());
document.getElementById("modal-close").addEventListener("click",  closeModal);
document.getElementById("modal-cancel").addEventListener("click", closeModal);
document.getElementById("modal-overlay").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeModal();
});

function openAddModal() {
  document.getElementById("expense-date").value = todayISO();
  openModal("Novo Gasto");
}

window.openEdit = (id) => {
  const e = expenses.find((x) => x.id === id);
  if (!e) return;
  document.getElementById("expense-id").value          = id;
  document.getElementById("expense-amount").value      = e.amount;
  document.getElementById("expense-date").value        = e.date;
  document.getElementById("expense-category").value    = e.category;
  document.getElementById("expense-description").value = e.description;
  openModal("Editar Gasto");
};

window.confirmDelete = async (id) => {
  if (!confirm("Deseja excluir este gasto?")) return;
  loading(true);
  await removeExpense(id);
  loading(false);
  refreshAfterChange();
};

// Form submit
document.getElementById("expense-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError("expense-error");

  const id     = document.getElementById("expense-id").value;
  const amount = parseFloat(document.getElementById("expense-amount").value);
  const date   = document.getElementById("expense-date").value;
  const cat    = document.getElementById("expense-category").value;
  const desc   = document.getElementById("expense-description").value.trim();

  if (!amount || amount <= 0) { showError("expense-error", "Informe um valor válido."); return; }
  if (!date)    { showError("expense-error", "Informe a data."); return; }
  if (!cat)     { showError("expense-error", "Selecione uma categoria."); return; }
  if (!desc)    { showError("expense-error", "Informe a descrição."); return; }

  const data = { amount, date, category: cat, description: desc };
  loading(true);

  try {
    if (id) {
      await editExpense(id, data);
    } else {
      await addExpense(data);
    }
    closeModal();
    refreshAfterChange();
  } catch (err) {
    loading(false);
    showError("expense-error", "Erro ao salvar. Tente novamente.");
    console.error(err);
  }
});

// ════════════════════════════════════════════════════════════
//  REFRESH GLOBAL
// ════════════════════════════════════════════════════════════
function refreshAfterChange() {
  loading(false);
  const activeView = document.querySelector(".view.active")?.id;
  refreshDashboard();
  if (activeView === "view-year")     renderYearView();
  if (activeView === "view-expenses") renderExpensesView();
}
