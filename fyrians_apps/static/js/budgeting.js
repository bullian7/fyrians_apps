const STORAGE_KEY = 'fyrians_budgeting_v1';
const DEFAULT_CATEGORIES = [
    'housing', 'utilities', 'groceries', 'transportation', 'dining', 'health',
    'insurance', 'debt', 'savings', 'entertainment', 'shopping', 'travel', 'income'
];

const monthPicker = document.getElementById('month-picker');
const exportCsvBtn = document.getElementById('export-csv-btn');
const clearMonthBtn = document.getElementById('clear-month-btn');
const txSearch = document.getElementById('tx-search');
const txTypeFilter = document.getElementById('tx-type-filter');
const txCategoryFilter = document.getElementById('tx-category-filter');

const sumIncome = document.getElementById('sum-income');
const sumExpense = document.getElementById('sum-expense');
const sumNet = document.getElementById('sum-net');
const sumRate = document.getElementById('sum-rate');

const txType = document.getElementById('tx-type');
const txAmount = document.getElementById('tx-amount');
const txDate = document.getElementById('tx-date');
const txCategory = document.getElementById('tx-category');
const txNote = document.getElementById('tx-note');
const addTxBtn = document.getElementById('add-tx-btn');

const budgetCategory = document.getElementById('budget-category');
const budgetLimit = document.getElementById('budget-limit');
const setBudgetBtn = document.getElementById('set-budget-btn');
const budgetStatus = document.getElementById('budget-status');
const budgetList = document.getElementById('budget-list');

const insightsEl = document.getElementById('insights');
const txStatus = document.getElementById('tx-status');
const txBody = document.getElementById('tx-body');

let state = loadState();

function todayISO() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
}

function monthKeyFromDate(dateStr) {
    return String(dateStr || '').slice(0, 7);
}

function currentMonthKey() {
    return monthPicker.value;
}

function fmtMoney(value) {
    const n = Number(value) || 0;
    return `$${n.toFixed(2)}`;
}

function normCategory(text) {
    return String(text || '').trim().toLowerCase();
}

function uid() {
    return `tx_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { transactions: [], budgetsByMonth: {} };
        const parsed = JSON.parse(raw);
        return {
            transactions: Array.isArray(parsed.transactions)
                ? parsed.transactions.map((t) => ({
                    id: String(t.id || uid()),
                    type: t.type === 'income' ? 'income' : 'expense',
                    amount: Number(t.amount) || 0,
                    date: String(t.date || todayISO()),
                    category: String(t.category || '').trim() || 'uncategorized',
                    note: String(t.note || ''),
                    createdAt: Number(t.createdAt) || Date.now()
                }))
                : [],
            budgetsByMonth: parsed.budgetsByMonth && typeof parsed.budgetsByMonth === 'object'
                ? parsed.budgetsByMonth
                : {}
        };
    } catch {
        return { transactions: [], budgetsByMonth: {} };
    }
}

function persistState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function monthTransactions() {
    const mk = currentMonthKey();
    return state.transactions.filter((t) => monthKeyFromDate(t.date) === mk);
}

function filteredTransactions() {
    const q = txSearch.value.trim().toLowerCase();
    const type = txTypeFilter.value;
    const cat = txCategoryFilter.value;

    return monthTransactions()
        .filter((t) => (type === 'all' ? true : t.type === type))
        .filter((t) => (cat === 'all' ? true : normCategory(t.category) === cat))
        .filter((t) => {
            if (!q) return true;
            return t.note.toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
        })
        .sort((a, b) => (b.date.localeCompare(a.date) || (b.createdAt - a.createdAt)));
}

function monthBudgets() {
    const mk = currentMonthKey();
    const obj = state.budgetsByMonth[mk];
    if (!obj || typeof obj !== 'object') return {};
    return obj;
}

function setMonthBudget(category, limit) {
    const mk = currentMonthKey();
    if (!state.budgetsByMonth[mk] || typeof state.budgetsByMonth[mk] !== 'object') {
        state.budgetsByMonth[mk] = {};
    }
    state.budgetsByMonth[mk][normCategory(category)] = Number(limit);
}

function removeMonthBudget(category) {
    const mk = currentMonthKey();
    if (!state.budgetsByMonth[mk]) return;
    delete state.budgetsByMonth[mk][normCategory(category)];
}

function categorySpendMap() {
    const map = {};
    monthTransactions().forEach((t) => {
        if (t.type !== 'expense') return;
        const cat = normCategory(t.category) || 'uncategorized';
        map[cat] = (map[cat] || 0) + t.amount;
    });
    return map;
}

function refreshCategoryFilterOptions() {
    const fromTransactions = monthTransactions().map((t) => normCategory(t.category)).filter(Boolean);
    const fromBudgets = Object.keys(monthBudgets());
    const merged = Array.from(new Set([...DEFAULT_CATEGORIES, ...fromTransactions, ...fromBudgets])).sort((a, b) => a.localeCompare(b));

    const prev = txCategoryFilter.value;
    txCategoryFilter.innerHTML = '<option value="all">All Categories</option>';
    merged.forEach((cat) => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        txCategoryFilter.appendChild(option);
    });
    txCategoryFilter.value = merged.includes(prev) ? prev : 'all';
}

function renderSummary() {
    const rows = monthTransactions();
    const income = rows.filter((t) => t.type === 'income').reduce((a, b) => a + b.amount, 0);
    const expense = rows.filter((t) => t.type === 'expense').reduce((a, b) => a + b.amount, 0);
    const net = income - expense;
    const rate = income > 0 ? ((net / income) * 100) : 0;

    sumIncome.textContent = fmtMoney(income);
    sumExpense.textContent = fmtMoney(expense);
    sumNet.textContent = fmtMoney(net);
    sumNet.classList.toggle('income', net >= 0);
    sumNet.classList.toggle('expense', net < 0);
    sumRate.textContent = `${rate.toFixed(1)}%`;
}

function renderBudgets() {
    budgetList.innerHTML = '';
    const budgets = monthBudgets();
    const spendMap = categorySpendMap();

    const categories = Object.keys(budgets).sort((a, b) => a.localeCompare(b));
    if (!categories.length) {
        const empty = document.createElement('div');
        empty.className = 'status-text';
        empty.textContent = 'No category budgets set for this month.';
        budgetList.appendChild(empty);
        return;
    }

    categories.forEach((cat) => {
        const limit = Number(budgets[cat]) || 0;
        const spent = Number(spendMap[cat] || 0);
        const pct = limit > 0 ? (spent / limit) * 100 : 0;
        const card = document.createElement('div');
        card.className = 'budget-item';

        const head = document.createElement('div');
        head.className = 'budget-head';
        head.innerHTML = `<span>${cat}</span><span>${fmtMoney(spent)} / ${fmtMoney(limit)}</span>`;

        const track = document.createElement('div');
        track.className = 'budget-track';
        const fill = document.createElement('div');
        fill.className = 'budget-fill';
        if (pct >= 100) fill.classList.add('over');
        else if (pct >= 80) fill.classList.add('warn');
        fill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
        track.appendChild(fill);

        const actions = document.createElement('div');
        actions.style.marginTop = '0.38rem';
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'mini-btn danger';
        del.textContent = 'Remove';
        del.addEventListener('click', () => {
            removeMonthBudget(cat);
            persistState();
            budgetStatus.textContent = `Removed budget for "${cat}".`;
            renderAll();
        });
        actions.appendChild(del);

        card.appendChild(head);
        card.appendChild(track);
        card.appendChild(actions);
        budgetList.appendChild(card);
    });
}

function renderInsights() {
    const rows = monthTransactions();
    const expenseRows = rows.filter((t) => t.type === 'expense');
    const income = rows.filter((t) => t.type === 'income').reduce((a, b) => a + b.amount, 0);
    const expense = expenseRows.reduce((a, b) => a + b.amount, 0);
    const net = income - expense;

    const byCat = {};
    expenseRows.forEach((r) => {
        const cat = normCategory(r.category) || 'uncategorized';
        byCat[cat] = (byCat[cat] || 0) + r.amount;
    });

    const topCategory = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
    const daysWithData = new Set(rows.map((r) => r.date)).size || 0;
    const avgDailySpend = daysWithData ? expense / daysWithData : 0;

    const lines = [];
    lines.push(`<div><strong>Total transactions:</strong> ${rows.length}</div>`);
    lines.push(`<div><strong>Top expense category:</strong> ${topCategory ? `${topCategory[0]} (${fmtMoney(topCategory[1])})` : '--'}</div>`);
    lines.push(`<div><strong>Average daily spend (days with activity):</strong> ${fmtMoney(avgDailySpend)}</div>`);
    lines.push(`<div><strong>Cashflow:</strong> ${net >= 0 ? 'Positive' : 'Negative'} (${fmtMoney(net)})</div>`);

    insightsEl.innerHTML = lines.join('');
}

function renderTransactions() {
    const rows = filteredTransactions();
    txBody.innerHTML = '';

    txStatus.textContent = rows.length
        ? `${rows.length} transaction${rows.length === 1 ? '' : 's'} shown.`
        : 'No transactions match this view.';

    rows.forEach((t) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${t.date}</td>
            <td><span class="type-pill ${t.type}">${t.type}</span></td>
            <td>${t.category}</td>
            <td>${t.note || '--'}</td>
            <td class="num">${t.type === 'expense' ? '-' : '+'}${fmtMoney(t.amount)}</td>
            <td></td>
        `;
        const actionsTd = tr.querySelector('td:last-child');
        const actions = document.createElement('div');
        actions.className = 'row-actions';

        const dupBtn = document.createElement('button');
        dupBtn.type = 'button';
        dupBtn.className = 'mini-btn';
        dupBtn.textContent = 'Duplicate';
        dupBtn.addEventListener('click', () => {
            state.transactions.push({
                ...t,
                id: uid(),
                date: txDate.value || todayISO(),
                createdAt: Date.now()
            });
            persistState();
            renderAll();
        });

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'mini-btn danger';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', async () => {
            const ok = await window.FyrianPopup.confirm('Delete this transaction?', {
                title: 'Budgeting Planner',
                okText: 'Delete',
                cancelText: 'Cancel',
                danger: true
            });
            if (!ok) return;
            state.transactions = state.transactions.filter((x) => x.id !== t.id);
            persistState();
            renderAll();
        });

        actions.appendChild(dupBtn);
        actions.appendChild(delBtn);
        actionsTd.appendChild(actions);
        txBody.appendChild(tr);
    });
}

function renderAll() {
    refreshCategoryFilterOptions();
    renderSummary();
    renderBudgets();
    renderInsights();
    renderTransactions();
}

function addTransaction() {
    const type = txType.value;
    const amount = Number(txAmount.value);
    const date = txDate.value || todayISO();
    const category = txCategory.value.trim();
    const note = txNote.value.trim();

    if (!Number.isFinite(amount) || amount <= 0) {
        txStatus.textContent = 'Enter a valid amount greater than 0.';
        return;
    }
    if (!category) {
        txStatus.textContent = 'Enter a category.';
        return;
    }

    state.transactions.push({
        id: uid(),
        type: type === 'income' ? 'income' : 'expense',
        amount: Math.round(amount * 100) / 100,
        date,
        category,
        note,
        createdAt: Date.now()
    });

    txAmount.value = '';
    txCategory.value = '';
    txNote.value = '';
    persistState();
    renderAll();
}

function setBudget() {
    const cat = budgetCategory.value.trim();
    const limit = Number(budgetLimit.value);
    if (!cat) {
        budgetStatus.textContent = 'Enter a category.';
        return;
    }
    if (!Number.isFinite(limit) || limit <= 0) {
        budgetStatus.textContent = 'Enter a valid monthly limit greater than 0.';
        return;
    }
    setMonthBudget(cat, Math.round(limit * 100) / 100);
    budgetCategory.value = '';
    budgetLimit.value = '';
    persistState();
    budgetStatus.textContent = `Budget set for "${normCategory(cat)}".`;
    renderAll();
}

function exportCsv() {
    const rows = filteredTransactions();
    const headers = ['date', 'type', 'category', 'note', 'amount'];
    const lines = [headers.join(',')];
    rows.forEach((r) => {
        const values = [r.date, r.type, r.category, r.note, r.amount.toFixed(2)];
        lines.push(values.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `budget_${currentMonthKey() || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

async function clearMonth() {
    const mk = currentMonthKey();
    const ok = await window.FyrianPopup.confirm(`Delete all transactions for ${mk}?`, {
        title: 'Budgeting Planner',
        okText: 'Clear Month',
        cancelText: 'Cancel',
        danger: true
    });
    if (!ok) return;

    state.transactions = state.transactions.filter((t) => monthKeyFromDate(t.date) !== mk);
    persistState();
    renderAll();
}

function initialize() {
    const now = new Date();
    monthPicker.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    txDate.value = todayISO();
    txCategory.placeholder = 'Category (e.g. groceries)';
    [txAmount, budgetLimit].forEach((el) => {
        el.addEventListener('wheel', (event) => {
            event.preventDefault();
            el.blur();
        }, { passive: false });
    });
    renderAll();
}

addTxBtn.addEventListener('click', addTransaction);
setBudgetBtn.addEventListener('click', setBudget);
exportCsvBtn.addEventListener('click', exportCsv);
clearMonthBtn.addEventListener('click', clearMonth);
monthPicker.addEventListener('change', renderAll);
txSearch.addEventListener('input', renderTransactions);
txTypeFilter.addEventListener('change', renderTransactions);
txCategoryFilter.addEventListener('change', renderTransactions);

txAmount.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        addTransaction();
    }
});
txNote.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        addTransaction();
    }
});

initialize();
