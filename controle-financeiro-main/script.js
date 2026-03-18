const balance = document.getElementById('balance');
const transactionList = document.getElementById('transaction-list');
const form = document.getElementById('transaction-form');
const descriptionInput = document.getElementById('description');
const amountInput = document.getElementById('amount');

const STORAGE_KEYS = {
    transactions: 'transactions',
    recurringCosts: 'recurring_costs',
    variableCostOverrides: 'variable_cost_overrides',
    creditCards: 'credit_cards'
};

// Funções genéricas para Local Storage
function getJSONFromLocalStorage(key, fallback) {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
}

function setJSONToLocalStorage(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

// Função para obter transações do Local Storage
function getTransactionsFromLocalStorage() {
    return getJSONFromLocalStorage(STORAGE_KEYS.transactions, []);
}

// Função para salvar transações no Local Storage
function saveTransactionsToLocalStorage(transactions) {
    setJSONToLocalStorage(STORAGE_KEYS.transactions, transactions);
}

let transactions = getTransactionsFromLocalStorage();
let recurringCosts = getJSONFromLocalStorage(STORAGE_KEYS.recurringCosts, []);
let variableCostOverrides = getJSONFromLocalStorage(STORAGE_KEYS.variableCostOverrides, []);
let creditCards = getJSONFromLocalStorage(STORAGE_KEYS.creditCards, []);

// -------------------------
// UI: alternar "telas"
// -------------------------
function showView(targetId) {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const views = document.querySelectorAll('.view');

    tabButtons.forEach(btn => {
        const isActive = btn.dataset.target === targetId;
        btn.classList.toggle('active', isActive);
    });

    views.forEach(view => {
        const isActive = view.id === targetId;
        view.classList.toggle('active-view', isActive);
    });
}

const tabButtons = document.querySelectorAll('.tab-btn');
tabButtons.forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.target));
});

// -------------------------
// Transações (existente)
// -------------------------
// Função para adicionar uma transação ao DOM
function addTransactionDOM(transaction) {
    const sign = transaction.amount < 0 ? '-' : '+';
    const item = document.createElement('li');

    item.classList.add(transaction.amount < 0 ? 'minus' : 'plus');

    item.innerHTML = `
        ${transaction.description} <span>${sign} R$ ${Math.abs(transaction.amount).toFixed(2)}</span>
        <button class="delete-btn" onclick="removeTransaction(${transaction.id})">x</button>
    `;

    transactionList.appendChild(item);
}

// Função para atualizar o saldo
function updateBalance() {
    const total = transactions.reduce((acc, transaction) => acc + transaction.amount, 0);
    balance.innerText = `R$ ${total.toFixed(2)}`;

    if (total < 0) {
        balance.classList.add('negative');
        balance.classList.remove('positive'); // Apenas para garantir que nao tenha ambas
    } else {
        balance.classList.remove('negative');
        balance.classList.add('positive');
    }
}

// Função para adicionar uma nova transação
function addTransaction(e) {
    e.preventDefault();

    if (descriptionInput.value.trim() === '' || amountInput.value.trim() === '') {
        alert('Por favor, adicione uma descrição e um valor.');
        return;
    }

    const transaction = {
        id: generateID(),
        description: descriptionInput.value,
        amount: +amountInput.value // O '+' converte para número
    };

    transactions.push(transaction);
    addTransactionDOM(transaction);
    updateBalance();
    saveTransactionsToLocalStorage(transactions);

    descriptionInput.value = '';
    amountInput.value = '';
}

// Gerar ID aleatório
function generateID() {
    return Math.floor(Math.random() * 100000000);
}

// Remover transação por ID
function removeTransaction(id) {
    transactions = transactions.filter(transaction => transaction.id !== id);
    saveTransactionsToLocalStorage(transactions);
    init(); // Re-inicializa para atualizar o DOM e o saldo
}

// Inicializar o aplicativo
function init() {
    transactionList.innerHTML = ''; // Limpa a lista antes de adicionar novamente
    transactions.forEach(addTransactionDOM);
    updateBalance();
}

// Event Listeners (Transações)
if (form) {
    form.addEventListener('submit', addTransaction);
}

init();

// -------------------------
// Custos por mês (novo)
// -------------------------
const costMonthInput = document.getElementById('cost-month');
const recurringCostList = document.getElementById('recurring-cost-list');
const monthlyTotalEl = document.getElementById('monthly-total');
const postMonthCostsBtn = document.getElementById('post-month-costs-btn');
const postMonthCostsHint = document.getElementById('post-month-costs-hint');

const costRecurringForm = document.getElementById('cost-recurring-form');
const costDescriptionInput = document.getElementById('cost-description');
const costTypeSelect = document.getElementById('cost-type');
const costAmountInput = document.getElementById('cost-amount');
const costStartMonthInput = document.getElementById('cost-start-month');
const costEndMonthInput = document.getElementById('cost-end-month');

function getCurrentMonthYYYYMM() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}`;
}

function isCostActiveForMonth(cost, monthYYYYMM) {
    if (!monthYYYYMM) return false;
    if (!cost.startMonth) return false;

    // Como é "YYYY-MM", comparação lexicográfica funciona como data
    const afterStart = monthYYYYMM >= cost.startMonth;
    const beforeEnd = cost.endMonth ? monthYYYYMM <= cost.endMonth : true;
    return afterStart && beforeEnd;
}

function getVariableOverrideAmount(costId, monthYYYYMM) {
    const found = variableCostOverrides.find(o => o.costId === costId && o.month === monthYYYYMM);
    return found ? found.amount : null;
}

function setVariableOverrideAmount(costId, monthYYYYMM, amount) {
    const cleanAmount = Math.abs(amount);
    const existingIndex = variableCostOverrides.findIndex(o => o.costId === costId && o.month === monthYYYYMM);

    if (existingIndex >= 0) {
        variableCostOverrides[existingIndex].amount = cleanAmount;
    } else {
        variableCostOverrides.push({ costId, month: monthYYYYMM, amount: cleanAmount });
    }

    setJSONToLocalStorage(STORAGE_KEYS.variableCostOverrides, variableCostOverrides);
}

function upsertCostTransaction(cost, monthYYYYMM, amountAbs) {
    const expenseAmount = -Math.abs(amountAbs);
    const description = `${cost.description} (${monthYYYYMM})`;

    if (!Array.isArray(transactions)) return;

    const metaType = 'recurring_cost';
    const idx = transactions.findIndex(t => {
        const m = t.meta;
        return m && m.type === metaType && m.month === monthYYYYMM && m.recurringCostId === cost.id;
    });

    if (idx >= 0) {
        transactions[idx].amount = expenseAmount;
        transactions[idx].description = description;
    } else {
        transactions.push({
            id: generateID(),
            description,
            amount: expenseAmount,
            meta: {
                type: metaType,
                month: monthYYYYMM,
                recurringCostId: cost.id
            }
        });
    }

    saveTransactionsToLocalStorage(transactions);
}

function renderRecurringCostsForMonth(monthYYYYMM) {
    if (!recurringCostList || !monthlyTotalEl) return;

    const activeCosts = recurringCosts.filter(c => isCostActiveForMonth(c, monthYYYYMM));

    const overridesForMonth = variableCostOverrides.filter(o => o.month === monthYYYYMM);
    const overridesMap = new Map(overridesForMonth.map(o => [o.costId, o.amount]));

    let total = 0;
    recurringCostList.innerHTML = '';

    if (activeCosts.length === 0) {
        const li = document.createElement('li');
        li.className = 'empty-list-item';
        li.textContent = 'Nenhuma conta recorrente ativa para este mês.';
        recurringCostList.appendChild(li);
        monthlyTotalEl.textContent = 'R$ 0.00';
        return;
    }

    activeCosts.forEach(cost => {
        const amount =
            cost.type === 'fixo'
                ? Math.abs(cost.amount)
                : overridesMap.has(cost.id)
                    ? Math.abs(overridesMap.get(cost.id))
                    : Math.abs(cost.amount);

        total += amount;

        const li = document.createElement('li');
        li.className = 'cost-item';

        li.innerHTML = `
            <div class="cost-left">
                <div class="cost-description">${cost.description}</div>
                <div class="cost-meta">Tipo: ${cost.type === 'fixo' ? 'Fixo' : 'Variável'}</div>
            </div>
            <div class="cost-right">
                ${
                    cost.type === 'fixo'
                        ? `<div class="cost-amount-display">R$ ${amount.toFixed(2)}</div>`
                        : `
                            <div class="cost-amount-input-wrap">
                                <input
                                    type="number"
                                    step="0.01"
                                    class="variable-amount-input"
                                    data-cost-id="${cost.id}"
                                    value="${amount.toFixed(2)}"
                                />
                            </div>
                          `
                }
            </div>
        `;

        if (cost.type === 'variavel') {
            const input = li.querySelector('.variable-amount-input');
            input.addEventListener('change', (e) => {
                const value = +e.target.value;
                const clean = Number.isFinite(value) ? Math.abs(value) : 0;
                setVariableOverrideAmount(cost.id, monthYYYYMM, clean);

                // Mantem o histórico sincronizado para este custo/mês
                upsertCostTransaction(cost, monthYYYYMM, clean);

                // Re-renderiza saldo e histórico (mesmo estando em outra "tela")
                init();
                renderRecurringCostsForMonth(monthYYYYMM);

                if (postMonthCostsHint) {
                    postMonthCostsHint.textContent = 'Valor variável atualizado no histórico.';
                }
            });
        }

        recurringCostList.appendChild(li);
    });

    monthlyTotalEl.textContent = `R$ ${total.toFixed(2)}`;
}

function postMonthCostsToHistory() {
    const monthYYYYMM = costMonthInput ? costMonthInput.value : '';
    if (!monthYYYYMM) return;

    const activeCosts = recurringCosts.filter(c => isCostActiveForMonth(c, monthYYYYMM));

    activeCosts.forEach(cost => {
        const amount =
            cost.type === 'fixo'
                ? Math.abs(cost.amount)
                : getVariableOverrideAmount(cost.id, monthYYYYMM) ?? Math.abs(cost.amount);

        upsertCostTransaction(cost, monthYYYYMM, amount);
    });

    init();
    if (postMonthCostsHint) {
        postMonthCostsHint.textContent = 'Custos lançados/atualizados no histórico.';
    }
}

if (costMonthInput) {
    // Define mês inicial como o mês atual
    if (!costMonthInput.value) {
        costMonthInput.value = getCurrentMonthYYYYMM();
    }
    if (costStartMonthInput && !costStartMonthInput.value) {
        costStartMonthInput.value = costMonthInput.value;
    }

    costMonthInput.addEventListener('change', () => {
        renderRecurringCostsForMonth(costMonthInput.value);
        if (postMonthCostsHint) postMonthCostsHint.textContent = '';
    });
}

if (costRecurringForm) {
    costRecurringForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const description = costDescriptionInput.value.trim();
        const type = costTypeSelect.value;
        const amount = +costAmountInput.value;
        const startMonth = costStartMonthInput.value;
        const endMonthRaw = costEndMonthInput.value;
        const endMonth = endMonthRaw ? endMonthRaw : null;

        if (!description || !type || !startMonth || !Number.isFinite(amount)) {
            alert('Preencha descrição, tipo, valor e mês de início.');
            return;
        }

        const recurringCost = {
            id: generateID(),
            description,
            type,
            amount: Math.abs(amount),
            startMonth,
            endMonth
        };

        recurringCosts.push(recurringCost);
        setJSONToLocalStorage(STORAGE_KEYS.recurringCosts, recurringCosts);

        // Re-renderiza a lista do mês atual
        if (costMonthInput) {
            renderRecurringCostsForMonth(costMonthInput.value);
        }

        costDescriptionInput.value = '';
        // Mantem tipo e valor para facilitar múltiplos lançamentos com mesma configuração
        costAmountInput.value = '';
        if (postMonthCostsHint) postMonthCostsHint.textContent = '';
    });
}

if (postMonthCostsBtn) {
    postMonthCostsBtn.addEventListener('click', postMonthCostsToHistory);
}

// -------------------------
// Cartões de Crédito (novo)
// -------------------------
const creditCardsList = document.getElementById('credit-cards-list');
const creditCardForm = document.getElementById('credit-card-form');
const creditCardNameInput = document.getElementById('credit-card-name');
const creditCardAnnualTotalInput = document.getElementById('credit-card-annual-total');

function renderCreditCardsList() {
    if (!creditCardsList) return;

    creditCardsList.innerHTML = '';

    if (!Array.isArray(creditCards) || creditCards.length === 0) {
        const li = document.createElement('li');
        li.className = 'empty-list-item';
        li.textContent = 'Nenhum cartão cadastrado.';
        creditCardsList.appendChild(li);
        return;
    }

    creditCards.forEach(card => {
        const avgMonthly = Math.abs(card.annualTotal) / 12;

        const li = document.createElement('li');
        li.className = 'credit-card-item';
        li.innerHTML = `
            <div class="credit-card-left">
                <div class="credit-card-name">${card.name}</div>
                <div class="credit-card-meta">Média mensal: R$ ${avgMonthly.toFixed(2)}</div>
            </div>
            <div class="credit-card-right">
                <div class="credit-card-total">R$ ${Math.abs(card.annualTotal).toFixed(2)} / ano</div>
            </div>
        `;

        creditCardsList.appendChild(li);
    });
}

if (creditCardForm) {
    creditCardForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const name = creditCardNameInput.value.trim();
        const annualTotal = +creditCardAnnualTotalInput.value;

        if (!name || !Number.isFinite(annualTotal)) {
            alert('Preencha nome do cartão e valor anual.');
            return;
        }

        const cleanAnnualTotal = Math.abs(annualTotal);

        const existingIndex = creditCards.findIndex(c => c.name && c.name.trim().toLowerCase() === name.toLowerCase());
        if (existingIndex >= 0) {
            creditCards[existingIndex].annualTotal = cleanAnnualTotal;
        } else {
            creditCards.push({
                id: generateID(),
                name,
                annualTotal: cleanAnnualTotal
            });
        }

        setJSONToLocalStorage(STORAGE_KEYS.creditCards, creditCards);
        renderCreditCardsList();

        creditCardNameInput.value = '';
        creditCardAnnualTotalInput.value = '';
    });
}

// Render inicial das novas telas (se existir)
if (costMonthInput) {
    renderRecurringCostsForMonth(costMonthInput.value);
}
renderCreditCardsList();
