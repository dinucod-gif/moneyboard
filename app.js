'use strict';

/* ---------- Storage ---------- */
const DB_KEY = 'moneyboard.v1';
let db = load();

function load() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { accounts: [], transactions: [], budgets: {}, version: 1 };
}
function save() { localStorage.setItem(DB_KEY, JSON.stringify(db)); }

/* ---------- Categories ---------- */
const CATS = {
  groceries:  { label: 'Groceries',  emoji: '🛒' },
  dining:    { label: 'Dining',      emoji: '🍽️' },
  transport: { label: 'Transport',  emoji: '🚌' },
  home:      { label: 'Home',       emoji: '🏠' },
  bills:     { label: 'Bills',      emoji: '🧾' },
  health:    { label: 'Health',     emoji: '💊' },
  fun:       { label: 'Fun',        emoji: '🎬' },
  shopping:  { label: 'Shopping',   emoji: '🛍️' },
  travel:    { label: 'Travel',     emoji: '✈️' },
  other:     { label: 'Other',      emoji: '📦' },
  income:    { label: 'Income',     emoji: '💰' }
};

const ACC_TYPES = {
  checking: 'Checking', savings: 'Savings', credit: 'Credit card',
  cash: 'Cash', investment: 'Investment', other: 'Other'
};

/* ---------- Helpers ---------- */
const $  = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

function fmt(n) {
  const v = Number(n) || 0;
  const s = Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? '-' : '') + '$' + s;
}
function monthKey(d) { return d.slice(0, 7); }
function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}
function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 2200);
}

/* ---------- Derived data ---------- */
function accountBalance(acc) {
  if (acc.type === 'credit') {
    const txs = db.transactions.filter(t => t.accountId === acc.id);
    const spend = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const paid = txs.filter(t => t.type === 'payment').reduce((s, t) => s + t.amount, 0);
    return (Number(acc.startBalance) || 0) + spend - paid;
  }
  const txs = db.transactions.filter(t => t.accountId === acc.id);
  return txs.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), Number(acc.startBalance) || 0);
}
function netWorth() {
  return db.accounts.reduce((s, a) => s + accountBalance(a), 0);
}
function monthTotals(key) {
  const txs = db.transactions.filter(t => monthKey(t.date) === key && t.type !== 'payment');
  const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  return { income, expense, net: income - expense };
}
function monthByCategory(key) {
  const map = {};
  db.transactions.forEach(t => {
    if (t.type === 'expense' && monthKey(t.date) === key) {
      map[t.category] = (map[t.category] || 0) + t.amount;
    }
  });
  return map;
}

/* ---------- Views ---------- */
let currentView = 'dashboard';
let txMonth = todayISO().slice(0, 7);

function render() {
  const main = $('#main');
  if (currentView === 'dashboard') main.innerHTML = viewDashboard();
  else if (currentView === 'accounts') main.innerHTML = viewAccounts();
  else if (currentView === 'transactions') main.innerHTML = viewTransactions();
  else if (currentView === 'budgets') main.innerHTML = viewBudgets();

  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.view === currentView));

  if (currentView === 'dashboard') drawDonut(monthByCategory(todayISO().slice(0, 7)));

  $$('.tx-del').forEach(btn => btn.addEventListener('click', () => {
    if (!confirm('Delete this transaction?')) return;
    db.transactions = db.transactions.filter(t => t.id !== btn.dataset.id);
    save(); render(); toast('Transaction deleted');
  }));
}

function viewDashboard() {
  const nw = netWorth();
  const key = todayISO().slice(0, 7);
  const { income, expense, net } = monthTotals(key);
  const byCat = monthByCategory(key);

  let budgetRows = '';
  const cats = Object.keys(db.budgets).filter(c => (db.budgets[c] || 0) > 0);
  if (cats.length) {
    budgetRows = cats.map(c => {
      const b = db.budgets[c];
      const spent = byCat[c] || 0;
      const pct = Math.min(100, Math.round(spent / b * 100));
      const cls = spent > b ? 'over' : pct > 80 ? 'warn' : '';
      return `<div class="bar-row">
        <div class="top"><span>${CATS[c].emoji} ${CATS[c].label}</span><span class="amt">${fmt(spent)} / ${fmt(b)}</span></div>
        <div class="bar-track"><div class="bar-fill ${cls}" style="width:${pct}%"></div></div>
      </div>`;
    }).join('');
  } else {
    budgetRows = `<div class="empty" style="padding:12px">No budgets set yet — add one in the Budgets tab.</div>`;
  }

  if (!db.accounts.length && !db.transactions.length) {
    return `<div class="empty">
      👋 Welcome!<br><br>
      <b style="color:var(--text)">Get started:</b><br>
      1. Add an account in the <b>Accounts</b> tab<br>
      2. Tap the <b style="color:var(--accent)">+</b> button to log income &amp; spending<br>
      3. Set budgets to keep on track
    </div>`;
  }

  return `
  <div class="card hero">
    <h3>Net worth</h3>
    <div class="net ${nw < 0 ? 'neg' : ''}">${fmt(nw)}</div>
    <div class="sub">across ${db.accounts.length} account${db.accounts.length === 1 ? '' : 's'}</div>
    <div class="row">
      <div class="cell"><div class="lbl">Income this month</div><div class="val pos">+${fmt(income)}</div></div>
      <div class="cell"><div class="lbl">Spent this month</div><div class="val neg">-${fmt(expense)}</div></div>
      <div class="cell"><div class="lbl">Net this month</div><div class="val ${net < 0 ? 'neg' : 'pos'}">${net < 0 ? '-' : '+'}${fmt(Math.abs(net))}</div></div>
    </div>
  </div>

  <div class="card">
    <h3>Spending by category — ${monthLabel(key)}</h3>
    <div class="chart-wrap"><canvas id="donut"></canvas></div>
    <div class="legend" id="donutLegend"></div>
  </div>

  <div class="card">
    <h3>Budgets this month</h3>
    ${budgetRows}
  </div>`;
}

function viewAccounts() {
  const rows = db.accounts.map(a => {
    const bal = accountBalance(a);
    const isDebt = a.type === 'credit' && bal > 0;
    return `<div class="acct">
      <div class="acct-emoji">${a.emoji || '🏦'}</div>
      <div class="info">
        <div class="name">${esc(a.name)}</div>
        <div class="type">${ACC_TYPES[a.type] || a.type}</div>
      </div>
      <div class="bal ${bal < 0 || isDebt ? 'neg' : ''}">${fmt(bal)}</div>
      <button class="tx-del acct-edit" data-id="${a.id}">✏️</button>
    </div>`;
  }).join('');

  return `
  <button class="btn" id="addAccount">+ Add account</button>
  <div style="height:12px"></div>
  <div class="acct-grid">${rows || '<div class="empty">No accounts yet. Add one to start tracking.</div>'}</div>
  <div style="height:16px"></div>
  ${db.accounts.length ? '<button class="btn secondary" id="exportBtn">Export data (backup)</button>' : ''}`;
}

function viewTransactions() {
  const key = txMonth;
  const { income, expense } = monthTotals(key);
  const txs = db.transactions
    .filter(t => monthKey(t.date) === key)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const rows = txs.map(t => {
    const sign = t.type === 'income' ? '+' : t.type === 'payment' ? '↻' : '-';
    const cls = t.type === 'income' ? 'pos' : t.type === 'payment' ? '' : 'neg';
    const cat = CATS[t.category] || CATS.other;
    const acc = db.accounts.find(a => a.id === t.accountId);
    return `<div class="tx-item">
      <div class="tx-emoji">${cat.emoji}</div>
      <div class="tx-info">
        <div class="who">${esc(t.note || cat.label)}</div>
        <div class="meta">${t.date} · ${cat.label}${acc ? ' · ' + esc(acc.name) : ''}</div>
      </div>
      <div class="tx-amt ${cls}">${sign}${fmt(t.amount)}</div>
      <button class="tx-del" data-id="${t.id}" aria-label="Delete">✕</button>
    </div>`;
  }).join('');

  return `
  <div class="month-nav card" style="padding:10px 12px">
    <button id="prevMonth">‹</button>
    <span class="lbl">${monthLabel(key)}</span>
    <button id="nextMonth">›</button>
  </div>
  <div class="card" style="display:flex;justify-content:space-around;text-align:center;padding:12px">
    <div><div style="font-size:12px;color:var(--muted)">INCOME</div><div class="pos" style="font-weight:700;margin-top:3px">+${fmt(income)}</div></div>
    <div><div style="font-size:12px;color:var(--muted)">SPENT</div><div class="neg" style="font-weight:700;margin-top:3px">-${fmt(expense)}</div></div>
  </div>
  <div class="card"><div class="tx-list">${rows || '<div class="empty">No activity this month.</div>'}</div></div>`;
}

function viewBudgets() {
  const key = todayISO().slice(0, 7);
  const byCat = monthByCategory(key);
  const catKeys = Object.keys(CATS).filter(c => c !== 'income');

  const rows = catKeys.map(c => {
    const b = db.budgets[c] || 0;
    const spent = byCat[c] || 0;
    const pct = b > 0 ? Math.min(100, Math.round(spent / b * 100)) : 0;
    const cls = b > 0 && spent > b ? 'over' : b > 0 && pct > 80 ? 'warn' : '';
    return `<div class="bar-row">
      <div class="top">
        <span>${CATS[c].emoji} ${CATS[c].label}</span>
        <span class="amt">${fmt(spent)}${b > 0 ? ' / ' + fmt(b) : ''}</span>
      </div>
      <div class="bar-track"><div class="bar-fill ${cls}" style="width:${b > 0 ? pct : 0}%"></div></div>
    </div>`;
  }).join('');

  return `
  <div class="card">
    <h3>Monthly budgets — ${monthLabel(key)}</h3>
    ${rows}
    <div style="height:14px"></div>
    <p style="font-size:12.5px;color:var(--muted);line-height:1.5">Tap a category below to set its monthly spending limit. The bar turns <span style="color:var(--amber)">amber</span> near the limit and <span style="color:var(--red)">red</span> when over.</p>
  </div>
  <div class="card">
    <h3>Set a budget</h3>
    <div class="field">
      <label>Category</label>
      <select id="budgetCat">${catKeys.map(c => `<option value="${c}">${CATS[c].emoji} ${CATS[c].label}</option>`).join('')}</select>
    </div>
    <div class="field">
      <label>Monthly limit ($)</label>
      <input type="number" id="budgetAmt" inputmode="decimal" min="0" step="0.01" placeholder="e.g. 300">
    </div>
    <button class="btn" id="saveBudget">Save budget</button>
    <button class="btn secondary" id="clearBudgets">Clear all budgets</button>
  </div>`;
}

/* ---------- Donut chart ---------- */
const PALETTE = ['#4f8cff', '#2ecc8f', '#ffb648', '#ff5d73', '#b06cff', '#38c8d8', '#ff8b4f', '#7dffa8', '#ff7bd5', '#c8d2e8'];

function drawDonut(byCat) {
  const canvas = $('#donut');
  if (!canvas) return;
  const entries = Object.entries(byCat).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const legend = $('#donutLegend');
  if (!entries.length) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.style.height = '60px';
    legend.innerHTML = '<span style="color:var(--muted);font-size:13px">No spending logged this month yet.</span>';
    return;
  }
  canvas.style.height = '190px';

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 300;
  const h = 190;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const total = entries.reduce((s, [, v]) => s + v, 0);
  const cx = w / 2, cy = h / 2, rOuter = Math.min(w, h) / 2 - 4, rInner = rOuter - 26;
  let angle = -Math.PI / 2;

  ctx.clearRect(0, 0, w, h);
  entries.forEach(([cat, val], i) => {
    const slice = (val / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, rOuter, angle, angle + slice);
    ctx.arc(cx, cy, rInner, angle + slice, angle, true);
    ctx.closePath();
    ctx.fillStyle = PALETTE[i % PALETTE.length];
    ctx.fill();
    angle += slice;
  });

  ctx.fillStyle = '#eaf0fb';
  ctx.textAlign = 'center';
  ctx.font = '700 17px -apple-system, Roboto, sans-serif';
  ctx.fillText(fmt(total), cx, cy + 1);
  ctx.fillStyle = '#8ea0be';
  ctx.font = '600 11px -apple-system, Roboto, sans-serif';
  ctx.fillText('THIS MONTH', cx, cy + 18);

  legend.innerHTML = entries.map(([cat, val], i) =>
    `<span class="item"><span class="dot" style="background:${PALETTE[i % PALETTE.length]}"></span>${CATS[cat].label} · ${Math.round(val / total * 100)}%</span>`
  ).join('');
}

/* ---------- Modals ---------- */
function openModal(html) {
  $('#modal').innerHTML = html;
  $('#modalBackdrop').classList.remove('hidden');
}
function closeModal() { $('#modalBackdrop').classList.add('hidden'); }

function txModal(tx) {
  const isEdit = !!tx;
  tx = tx || { type: 'expense', category: 'groceries', date: todayISO() };
  const accOpts = db.accounts.map(a => `<option value="${a.id}" ${tx.accountId === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
  const catOpts = k => Object.keys(CATS).filter(c => c !== 'income')
    .map(c => `<option value="${c}" ${tx.category === c && k === 'exp' ? 'selected' : ''}>${CATS[c].emoji} ${CATS[c].label}</option>`).join('');

  openModal(`
    <h2>${isEdit ? 'Edit' : 'New'} transaction</h2>
    <div class="field">
      <label>Type</label>
      <div class="seg" id="txType">
        <button data-t="expense" class="${tx.type === 'expense' ? 'active' : ''}">− Expense</button>
        <button data-t="income" class="${tx.type === 'income' ? 'active' : ''}">+ Income</button>
        ${db.accounts.some(a => a.type === 'credit') ? `<button data-t="payment" class="${tx.type === 'payment' ? 'active' : ''}">↻ Card payment</button>` : ''}
      </div>
    </div>
    <div class="field-row">
      <div class="field"><label>Amount ($)</label><input id="txAmount" type="number" inputmode="decimal" min="0" step="0.01" value="${tx.amount || ''}" placeholder="0.00"></div>
      <div class="field"><label>Date</label><input id="txDate" type="date" value="${tx.date}"></div>
    </div>
    <div class="field" id="txCatField"><label>Category</label><select id="txCategory">${catOpts('exp')}</select></div>
    <div class="field"><label>Account</label><select id="txAccount"><option value="">— none —</option>${accOpts}</select></div>
    <div class="field"><label>Note (optional)</label><input id="txNote" type="text" maxlength="60" value="${tx.note ? esc(tx.note) : ''}" placeholder="e.g. weekly shop"></div>
    <button class="btn" id="txSave">Save</button>
    ${isEdit ? '<button class="btn danger" id="txDelete">Delete</button>' : ''}
    <button class="btn secondary" id="txCancel">Cancel</button>
  `);

  let type = tx.type;
  $$('#txType button').forEach(b => b.addEventListener('click', () => {
    type = b.dataset.t;
    $$('#txType button').forEach(x => x.classList.toggle('active', x === b));
    $('#txCatField').style.display = type === 'income' ? 'none' : '';
  }));
  $('#txCatField').style.display = type === 'income' ? 'none' : '';

  $('#txCancel').addEventListener('click', closeModal);
  $('#txSave').addEventListener('click', () => {
    const amount = Math.abs(parseFloat($('#txAmount').value));
    if (!amount || amount <= 0) { toast('Enter an amount first'); return; }
    const date = $('#txDate').value || todayISO();
    const category = type === 'income' ? 'income' : $('#txCategory').value;
    const accountId = $('#txAccount').value || null;
    const note = $('#txNote').value.trim();
    if (isEdit) {
      Object.assign(db.transactions.find(t => t.id === tx.id), { type, amount, date, category, accountId, note });
    } else {
      db.transactions.push({ id: uid(), type, amount, date, category, accountId, note });
    }
    save(); closeModal(); render();
    toast(isEdit ? 'Transaction updated' : 'Saved ✓');
  });
  if (isEdit) $('#txDelete').addEventListener('click', () => {
    if (!confirm('Delete this transaction?')) return;
    db.transactions = db.transactions.filter(t => t.id !== tx.id);
    save(); closeModal(); render(); toast('Transaction deleted');
  });
}

function accountModal(acc) {
  const isEdit = !!acc;
  acc = acc || { name: '', type: 'checking', startBalance: 0, emoji: '🏦' };
  const emojis = ['🏦', '💳', '💵', '💰', '📈', '🏠', '🚗', '📱'];

  openModal(`
    <h2>${isEdit ? 'Edit' : 'New'} account</h2>
    <div class="field"><label>Name</label><input id="accName" type="text" maxlength="30" value="${esc(acc.name)}" placeholder="e.g. Main bank"></div>
    <div class="field-row">
      <div class="field">
        <label>Type</label>
        <select id="accType">${Object.entries(ACC_TYPES).map(([k, v]) => `<option value="${k}" ${acc.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Starting balance ($)</label><input id="accBal" type="number" inputmode="decimal" step="0.01" value="${acc.startBalance}" placeholder="0.00"></div>
    </div>
    <div class="field"><label>Icon</label><div class="seg" id="accEmoji" style="flex-wrap:wrap">${emojis.map(e => `<button data-e="${e}" style="font-size:20px;${acc.emoji === e ? ';background:var(--accent);border-color:var(--accent)' : ''}">${e}</button>`).join('')}</div></div>
    <button class="btn" id="accSave">Save</button>
    ${isEdit ? '<button class="btn danger" id="accDelete">Delete account</button>' : ''}
    <button class="btn secondary" id="accCancel">Cancel</button>
  `);

  let emoji = acc.emoji;
  $$('#accEmoji button').forEach(b => b.addEventListener('click', () => {
    emoji = b.dataset.e;
    $$('#accEmoji button').forEach(x => x.style.cssText = 'font-size:20px');
    b.style.cssText = 'font-size:20px;background:var(--accent);border-color:var(--accent)';
  }));

  $('#accCancel').addEventListener('click', closeModal);
  $('#accSave').addEventListener('click', () => {
    const name = $('#accName').value.trim();
    if (!name) { toast('Give the account a name'); return; }
    const data = { name, type: $('#accType').value, startBalance: parseFloat($('#accBal').value) || 0, emoji };
    if (isEdit) Object.assign(db.accounts.find(a => a.id === acc.id), data);
    else db.accounts.push(Object.assign({ id: uid() }, data));
    save(); closeModal(); render();
    toast(isEdit ? 'Account updated' : 'Account added ✓');
  });
  if (isEdit) $('#accDelete').addEventListener('click', () => {
    if (!confirm('Delete this account and all its transactions?')) return;
    db.accounts = db.accounts.filter(a => a.id !== acc.id);
    db.transactions = db.transactions.filter(t => t.accountId !== acc.id);
    save(); closeModal(); render(); toast('Account deleted');
  });
}

/* ---------- Wiring ---------- */
$$('.tab').forEach(b => b.addEventListener('click', () => { currentView = b.dataset.view; render(); }));
$('#fab').addEventListener('click', () => {
  if (!db.accounts.length && !confirm('Tip: add an account first for full tracking.\n\nAdd a transaction anyway?')) return;
  txModal();
});
$('#modalBackdrop').addEventListener('click', e => { if (e.target === $('#modalBackdrop')) closeModal(); });

document.addEventListener('click', e => {
  const editBtn = e.target.closest('.acct-edit');
  if (editBtn) { accountModal(db.accounts.find(a => a.id === editBtn.dataset.id)); return; }
  if (e.target.closest('#addAccount')) { accountModal(); return; }
  if (e.target.closest('#prevMonth')) { txMonth = shiftMonth(txMonth, -1); render(); return; }
  if (e.target.closest('#nextMonth')) { txMonth = shiftMonth(txMonth, 1); render(); return; }
  if (e.target.closest('#saveBudget')) {
    const c = $('#budgetCat').value;
    const amt = parseFloat($('#budgetAmt').value);
    if (!amt || amt <= 0) { toast('Enter a limit amount'); return; }
    db.budgets[c] = amt; save(); render(); toast('Budget saved ✓'); return;
  }
  if (e.target.closest('#clearBudgets')) {
    if (!confirm('Clear all budgets?')) return;
    db.budgets = {}; save(); render(); toast('Budgets cleared'); return;
  }
  if (e.target.closest('#exportBtn')) {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'moneyboard-backup.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Backup downloaded'); return;
  }
});

render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
