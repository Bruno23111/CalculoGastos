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
  outros:      { label: "Outros",      icon: "circle" },
};

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

const CAT_COLORS = [
  "#5c7cfa","#7048e8","#c2255c","#e8590c","#2f9e44",
  "#e67700","#1971c2","#0f9460","#6b7280",
];

// ══════════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════════
let currentUser  = null;
let expenses     = [];
let currentMonth = new Date().getMonth() + 1;
let currentYear  = new Date().getFullYear();
let viewYear     = new Date().getFullYear();
let chartCat     = null;
let chartMonths  = null;

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

const icons = () => {
  if (window.lucide) lucide.createIcons();
};

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
    const [y, m] = e.date.split("-");
    return parseInt(m) === currentMonth && parseInt(y) === currentYear;
  });
}

function yearExpenses(year) {
  return expenses.filter((e) => parseInt(e.date.split("-")[0]) === year);
}

// ══════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════
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
  } catch (err) {
    loading(false);
    showErr("register-error", authMsg(err.code));
  }
});

document.getElementById("btn-logout").addEventListener("click", () => signOut(auth));

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
    "auth/user-not-found":       "Usuário não encontrado.",
    "auth/wrong-password":       "Senha incorreta.",
    "auth/email-already-in-use": "E-mail já cadastrado.",
    "auth/invalid-email":        "E-mail inválido.",
    "auth/invalid-credential":   "E-mail ou senha incorretos.",
    "auth/too-many-requests":    "Muitas tentativas. Tente mais tarde.",
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
}

function showApp() {
  document.getElementById("login-screen").classList.remove("active");
  document.getElementById("app-screen").classList.add("active");
  refreshDashboard();
}

// ══════════════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════════════
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

  const filtered = expenses.filter((e) => {
    const [, m] = e.date.split("-");
    if (month  && parseInt(m) !== parseInt(month)) return false;
    if (cat    && e.category !== cat) return false;
    if (search && !e.description.toLowerCase().includes(search)) return false;
    return true;
  });

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

["filter-month", "filter-category", "filter-search"].forEach((id) => {
  document.getElementById(id).addEventListener("input",  applyFilters);
  document.getElementById(id).addEventListener("change", applyFilters);
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
  openModal("Editar gasto");
};

window.confirmDelete = async (id) => {
  if (!confirm("Deseja excluir este gasto?")) return;
  loading(true);
  await removeExpense(id);
  loading(false);
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

  loading(true);
  try {
    const data = { amount, date, category: cat, description: desc };
    if (id) await editExpense(id, data);
    else    await addExpense(data);
    closeModal();
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
