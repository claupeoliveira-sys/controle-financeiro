const balance = document.getElementById('balance');
const transactionList = document.getElementById('transaction-list');
const form = document.getElementById('transaction-form');
const descriptionInput = document.getElementById('description');
const transactionMonthInput = document.getElementById('transaction-month');
const transactionAreaInput = document.getElementById('transaction-area');
const amountInput = document.getElementById('amount');
const transactionFormSubmitBtn = form ? form.querySelector('button[type="submit"]') : null;

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

    if (targetId !== 'view-transactions') {
        cancelEditTransaction();
    }

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

    const area = transaction.area ? String(transaction.area) : '';
    const monthLabel = transaction.meta && transaction.meta.month ? transaction.meta.month : '';

    item.innerHTML = `
        <div>
            <div class="tx-desc">${transaction.description}</div>
            <div class="tx-meta">${[monthLabel ? `Mês: ${monthLabel}` : '', area ? `Área: ${area}` : ''].filter(Boolean).join(' | ')}</div>
        </div>
        <span>${sign} R$ ${Math.abs(transaction.amount).toFixed(2)}</span>
        <button class="edit-btn" type="button" onclick="startEditTransaction(${transaction.id})">Editar</button>
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

let editingTransactionId = null;

function startEditTransaction(id) {
    const t = transactions.find(tx => tx.id === id);
    if (!t) return;

    editingTransactionId = id;

    // Se for um lançamento gerado por recorrência, mostra só a descrição base.
    if (t.meta && t.meta.type === 'recurring_cost' && t.meta.recurringCostId) {
        const cost = recurringCosts.find(c => c.id === t.meta.recurringCostId);
        descriptionInput.value = cost ? (cost.description ?? '') : (t.description ?? '');
    } else {
        descriptionInput.value = t.description ?? '';
    }
    amountInput.value = t.amount ?? 0;
    transactionMonthInput.value = t.meta && t.meta.month ? t.meta.month : (transactionMonthInput.value || getCurrentMonthYYYYMM());
    transactionAreaInput.value = t.area ?? '';

    if (transactionFormSubmitBtn) {
        transactionFormSubmitBtn.textContent = 'Salvar Alteração';
    }
}

function cancelEditTransaction() {
    editingTransactionId = null;
    descriptionInput.value = '';
    amountInput.value = '';
    transactionAreaInput.value = '';
    transactionMonthInput.value = getCurrentMonthYYYYMM();

    if (transactionFormSubmitBtn) {
        transactionFormSubmitBtn.textContent = 'Adicionar Transação';
    }
}

// Função para adicionar uma nova transação
function addTransaction(e) {
    e.preventDefault();

    if (descriptionInput.value.trim() === '' || amountInput.value.trim() === '') {
        alert('Por favor, adicione uma descrição e um valor.');
        return;
    }

    const monthYYYYMM = transactionMonthInput ? transactionMonthInput.value : '';
    const area = transactionAreaInput ? transactionAreaInput.value.trim() : '';
    const newAmount = +amountInput.value; // O '+' converte para número
    const description = descriptionInput.value.trim();

    if (editingTransactionId !== null) {
        const idx = transactions.findIndex(t => t.id === editingTransactionId);
        if (idx >= 0) {
            const prevMeta = transactions[idx].meta || {};
            const prevMonth = prevMeta.month;

            // Edição de lançamento gerado por recorrência: sincroniza com o "modelo" (recorrente/override)
            if (prevMeta.type === 'recurring_cost' && prevMeta.recurringCostId) {
                const cost = recurringCosts.find(c => c.id === prevMeta.recurringCostId);
                if (cost) {
                    // Se o usuário alterar o mês, remove o lançamento antigo daquele mês (evita duplicar).
                    if (prevMonth && prevMonth !== monthYYYYMM) {
                        transactions = transactions.filter(tx => {
                            return !(
                                tx.meta &&
                                tx.meta.type === 'recurring_cost' &&
                                tx.meta.recurringCostId === prevMeta.recurringCostId &&
                                tx.meta.month === prevMonth
                            );
                        });

                        if (cost.type === 'variavel') {
                            variableCostOverrides = variableCostOverrides.filter(o => {
                                return !(o.costId === prevMeta.recurringCostId && o.month === prevMonth);
                            });
                            setJSONToLocalStorage(STORAGE_KEYS.variableCostOverrides, variableCostOverrides);
                        }
                    }

                    cost.description = description;
                    cost.area = area;

                    if (cost.type === 'fixo') {
                        cost.amount = Math.abs(newAmount);
                    } else {
                        setVariableOverrideAmount(cost.id, monthYYYYMM, Math.abs(newAmount));
                    }

                    setJSONToLocalStorage(STORAGE_KEYS.recurringCosts, recurringCosts);
                    upsertCostTransaction(cost, monthYYYYMM, Math.abs(newAmount));

                    saveTransactionsToLocalStorage(transactions);
                    init();
                    const invMonth = document.getElementById('invoice-month');
                    if (invMonth && invMonth.value) {
                        renderInvoicesForMonth(invMonth.value);
                    }
                    const anaMonth = document.getElementById('analytics-month');
                    if (anaMonth && anaMonth.value && typeof renderAnalyticsForMonth === 'function') {
                        renderAnalyticsForMonth(anaMonth.value);
                    }
                    cancelEditTransaction();
                    return;
                }
            }

            // Edição padrão (transação manual / compra no cartão)
            transactions[idx].description = description;
            transactions[idx].amount = newAmount;
            transactions[idx].area = area;
            if (!transactions[idx].meta) transactions[idx].meta = {};
            transactions[idx].meta.month = monthYYYYMM;

            saveTransactionsToLocalStorage(transactions);
            init();
            const anaMonth = document.getElementById('analytics-month');
            if (anaMonth && anaMonth.value && typeof renderAnalyticsForMonth === 'function') {
                renderAnalyticsForMonth(anaMonth.value);
            }
            cancelEditTransaction();
            return;
        }
    }

    const transaction = {
        id: generateID(),
        description,
        amount: newAmount,
        area,
        meta: {
            month: monthYYYYMM,
            type: 'manual_transaction'
        }
    };

    transactions.push(transaction);
    addTransactionDOM(transaction);
    updateBalance();
    saveTransactionsToLocalStorage(transactions);

    const anaMonth = document.getElementById('analytics-month');
    if (anaMonth && anaMonth.value && typeof renderAnalyticsForMonth === 'function' && anaMonth.value === monthYYYYMM) {
        renderAnalyticsForMonth(anaMonth.value);
    }

    descriptionInput.value = '';
    amountInput.value = '';
    transactionAreaInput.value = '';
}

// Gerar ID aleatório
function generateID() {
    return Math.floor(Math.random() * 100000000);
}

// Remover transação por ID
function removeTransaction(id) {
    transactions = transactions.filter(transaction => transaction.id !== id);
    saveTransactionsToLocalStorage(transactions);
    if (editingTransactionId === id) {
        cancelEditTransaction();
    }
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

if (transactionMonthInput && !transactionMonthInput.value) {
    transactionMonthInput.value = getCurrentMonthYYYYMM();
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
const costAreaInput = document.getElementById('cost-area');
const costCreditCardSelect = document.getElementById('cost-credit-card');
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
        if (!transactions[idx].meta) transactions[idx].meta = {};
        transactions[idx].meta.creditCardId = cost.creditCardId ?? null;
        transactions[idx].area = cost.area ?? '';
        transactions[idx].meta.costType = cost.type;
    } else {
        transactions.push({
            id: generateID(),
            description,
            amount: expenseAmount,
            area: cost.area ?? '',
            meta: {
                type: metaType,
                month: monthYYYYMM,
                recurringCostId: cost.id,
                creditCardId: cost.creditCardId ?? null,
                costType: cost.type
            }
        });
    }

    saveTransactionsToLocalStorage(transactions);
}

function renderCostCreditCardSelectOptions() {
    if (!costCreditCardSelect) return;

    const currentValue = costCreditCardSelect.value;
    costCreditCardSelect.innerHTML = '';

    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = 'Sem cartão';
    costCreditCardSelect.appendChild(noneOpt);

    creditCards.forEach(card => {
        const opt = document.createElement('option');
        opt.value = String(card.id);
        opt.textContent = card.name;
        costCreditCardSelect.appendChild(opt);
    });

    if (currentValue && creditCards.some(c => String(c.id) === currentValue)) {
        costCreditCardSelect.value = currentValue;
    } else {
        costCreditCardSelect.value = '';
    }
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

        const costCardId = cost.creditCardId ?? null;
        const cardName =
            costCardId
                ? (creditCards.find(c => String(c.id) === String(costCardId))?.name ?? 'Cartão')
                : 'Sem cartão';
        const areaName = cost.area ? String(cost.area) : 'Sem área';

        const li = document.createElement('li');
        li.className = 'cost-item';

        li.innerHTML = `
            <div class="cost-left">
                <div class="cost-description">${cost.description}</div>
                <div class="cost-meta">Tipo: ${cost.type === 'fixo' ? 'Fixo' : 'Variável'} | Cartão: ${cardName} | Área: ${areaName}</div>
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
                if (invoiceMonthInput && invoiceMonthInput.value === monthYYYYMM) {
                    renderInvoicesForMonth(monthYYYYMM);
                }

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

    if (invoiceMonthInput && invoiceMonthInput.value === monthYYYYMM) {
        renderInvoicesForMonth(monthYYYYMM);
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

        const creditCardIdRaw = costCreditCardSelect ? costCreditCardSelect.value : '';
        const creditCardId = creditCardIdRaw ? +creditCardIdRaw : null;
        const area = costAreaInput ? costAreaInput.value.trim() : '';

        const recurringCost = {
            id: generateID(),
            description,
            type,
            amount: Math.abs(amount),
            area,
            startMonth,
            endMonth,
            creditCardId
        };

        recurringCosts.push(recurringCost);
        setJSONToLocalStorage(STORAGE_KEYS.recurringCosts, recurringCosts);

        // Re-renderiza a lista do mês atual
        if (costMonthInput) {
            renderRecurringCostsForMonth(costMonthInput.value);
        }

        if (invoiceMonthInput && invoiceMonthInput.value) {
            renderInvoicesForMonth(invoiceMonthInput.value);
        }

        costDescriptionInput.value = '';
        if (costAreaInput) costAreaInput.value = '';
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
        renderCostCreditCardSelectOptions();
        if (typeof renderPurchaseCardSelectOptions === 'function') {
            renderPurchaseCardSelectOptions();
        }
        if (invoiceMonthInput && invoiceMonthInput.value) {
            renderInvoicesForMonth(invoiceMonthInput.value);
        }

        creditCardNameInput.value = '';
        creditCardAnnualTotalInput.value = '';
    });
}

// Render inicial das novas telas (se existir)
if (costMonthInput) {
    renderRecurringCostsForMonth(costMonthInput.value);
}
renderCreditCardsList();

// -------------------------
// Fatura por Cartão (novo)
// -------------------------
const invoiceMonthInput = document.getElementById('invoice-month');
const invoiceList = document.getElementById('invoice-list');
const invoiceMonthlyTotalEl = document.getElementById('invoice-monthly-total');

function renderInvoicesForMonth(monthYYYYMM) {
    if (!invoiceList || !invoiceMonthlyTotalEl) return;

    const activeCosts = recurringCosts.filter(c => isCostActiveForMonth(c, monthYYYYMM));
    const overridesForMonth = variableCostOverrides.filter(o => o.month === monthYYYYMM);
    const overridesMap = new Map(overridesForMonth.map(o => [o.costId, o.amount]));

    const grouped = new Map();
    activeCosts.forEach(cost => {
        const amount =
            cost.type === 'fixo'
                ? Math.abs(cost.amount)
                : overridesMap.has(cost.id)
                    ? Math.abs(overridesMap.get(cost.id))
                    : Math.abs(cost.amount);

        const cardKey = cost.creditCardId ? String(cost.creditCardId) : 'none';
        if (!grouped.has(cardKey)) {
            const card = cost.creditCardId ? creditCards.find(c => String(c.id) === cardKey) : null;
            const cardName = cardKey === 'none' ? 'Sem cartão' : (card?.name ?? 'Cartão');
            grouped.set(cardKey, { cardName, total: 0 });
        }
        grouped.get(cardKey).total += amount;
    });

    // Inclui compras lançadas diretamente no cartão (avulsas) do mês
    const purchasesForMonth = transactions.filter(t => {
        return t.amount < 0 && t.meta && t.meta.type === 'credit_card_purchase' && t.meta.month === monthYYYYMM;
    });

    purchasesForMonth.forEach(tx => {
        const cardId = tx.meta && tx.meta.creditCardId ? tx.meta.creditCardId : null;
        const cardKey = cardId ? String(cardId) : 'none';

        if (!grouped.has(cardKey)) {
            const card = cardId ? creditCards.find(c => String(c.id) === String(cardId)) : null;
            const cardName = cardKey === 'none' ? 'Sem cartão' : (card?.name ?? 'Cartão');
            grouped.set(cardKey, { cardName, total: 0 });
        }

        grouped.get(cardKey).total += Math.abs(tx.amount);
    });

    const groupsArr = Array.from(grouped.entries())
        .map(([key, v]) => ({ key, ...v }))
        .sort((a, b) => a.cardName.localeCompare(b.cardName, 'pt-BR'));

    invoiceList.innerHTML = '';

    const total = groupsArr.reduce((acc, g) => acc + g.total, 0);
    invoiceMonthlyTotalEl.textContent = `R$ ${total.toFixed(2)}`;

    if (groupsArr.length === 0) {
        const li = document.createElement('li');
        li.className = 'empty-list-item';
        li.textContent = 'Nenhum custo/compra no cartão para este mês.';
        invoiceList.appendChild(li);
        return;
    }

    groupsArr.forEach(g => {
        const li = document.createElement('li');
        li.className = 'invoice-item';
        li.innerHTML = `
            <div class="invoice-name">${g.cardName}</div>
            <div class="invoice-total">R$ ${g.total.toFixed(2)}</div>
        `;
        invoiceList.appendChild(li);
    });
}

if (invoiceMonthInput) {
    if (!invoiceMonthInput.value) {
        const defaultMonth = (costMonthInput && costMonthInput.value) ? costMonthInput.value : getCurrentMonthYYYYMM();
        invoiceMonthInput.value = defaultMonth;
    }

    invoiceMonthInput.addEventListener('change', () => {
        renderInvoicesForMonth(invoiceMonthInput.value);
    });

    renderInvoicesForMonth(invoiceMonthInput.value);
}

renderCostCreditCardSelectOptions();

// -------------------------
// Cartões: lançamento avulso por mês
// -------------------------
const purchaseMonthInput = document.getElementById('purchase-month');
const purchaseCardSelect = document.getElementById('purchase-card-select');
const purchaseForm = document.getElementById('credit-card-purchase-form');
const purchaseDescriptionInput = document.getElementById('purchase-description');
const purchaseAmountInput = document.getElementById('purchase-amount');
const purchaseAreaInput = document.getElementById('purchase-area');

function renderPurchaseCardSelectOptions() {
    if (!purchaseCardSelect) return;

    const currentValue = purchaseCardSelect.value;
    purchaseCardSelect.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Selecione';
    purchaseCardSelect.appendChild(placeholder);

    (creditCards || []).forEach(card => {
        const opt = document.createElement('option');
        opt.value = String(card.id);
        opt.textContent = card.name;
        purchaseCardSelect.appendChild(opt);
    });

    if (currentValue && creditCards.some(c => String(c.id) === String(currentValue))) {
        purchaseCardSelect.value = currentValue;
    }
}

if (purchaseMonthInput && !purchaseMonthInput.value) {
    purchaseMonthInput.value = invoiceMonthInput && invoiceMonthInput.value ? invoiceMonthInput.value : getCurrentMonthYYYYMM();
}

if (invoiceMonthInput && purchaseMonthInput) {
    invoiceMonthInput.addEventListener('change', () => {
        purchaseMonthInput.value = invoiceMonthInput.value;
    });
}

if (purchaseForm) {
    renderPurchaseCardSelectOptions();

    purchaseForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const monthYYYYMM = purchaseMonthInput ? purchaseMonthInput.value : '';
        const cardIdRaw = purchaseCardSelect ? purchaseCardSelect.value : '';
        const cardId = cardIdRaw ? +cardIdRaw : null;
        const description = purchaseDescriptionInput ? purchaseDescriptionInput.value.trim() : '';
        const amount = purchaseAmountInput ? +purchaseAmountInput.value : NaN;
        const area = purchaseAreaInput ? purchaseAreaInput.value.trim() : '';

        if (!monthYYYYMM || !cardId || !description || !Number.isFinite(amount)) {
            alert('Preencha mês, cartão, descrição e valor.');
            return;
        }

        const tx = {
            id: generateID(),
            description: description,
            amount: -Math.abs(amount),
            area,
            meta: {
                type: 'credit_card_purchase',
                month: monthYYYYMM,
                creditCardId: cardId,
                costType: 'Cartão (compra avulsa)'
            }
        };

        transactions.push(tx);
        addTransactionDOM(tx);
        updateBalance();
        saveTransactionsToLocalStorage(transactions);

        if (invoiceMonthInput && invoiceMonthInput.value === monthYYYYMM) {
            renderInvoicesForMonth(monthYYYYMM);
        }
        if (analyticsMonthInput && analyticsMonthInput.value === monthYYYYMM) {
            renderAnalyticsForMonth(monthYYYYMM);
        }

        if (purchaseDescriptionInput) purchaseDescriptionInput.value = '';
        if (purchaseAmountInput) purchaseAmountInput.value = '';
        if (purchaseAreaInput) purchaseAreaInput.value = '';
    });
}

// -------------------------
// Análises (novo): área e gráfico de pizza por tipo
// -------------------------
const analyticsMonthInput = document.getElementById('analytics-month');
const analyticsAreaList = document.getElementById('analytics-area-list');
const typePieCanvas = document.getElementById('type-pie-chart');
let typePieChartInstance = null;

function renderAnalyticsForMonth(monthYYYYMM) {
    if (!analyticsMonthInput || !analyticsAreaList) return;

    const areaTotals = new Map();
    const typeTotals = new Map();

    function addToMaps(areaKey, typeKey, amountAbs) {
        const a = areaKey ? String(areaKey) : 'Sem área';
        const t = typeKey ? String(typeKey) : 'Outros';
        areaTotals.set(a, (areaTotals.get(a) || 0) + amountAbs);
        typeTotals.set(t, (typeTotals.get(t) || 0) + amountAbs);
    }

    // Recorrentes (previsto/esperado para o mês)
    const activeCosts = recurringCosts.filter(c => isCostActiveForMonth(c, monthYYYYMM));
    const overridesForMonth = variableCostOverrides.filter(o => o.month === monthYYYYMM);
    const overridesMap = new Map(overridesForMonth.map(o => [o.costId, o.amount]));

    activeCosts.forEach(cost => {
        const amountAbs =
            cost.type === 'fixo'
                ? Math.abs(cost.amount)
                : overridesMap.has(cost.id)
                    ? Math.abs(overridesMap.get(cost.id))
                    : Math.abs(cost.amount);

        const areaKey = cost.area ? cost.area : 'Sem área';
        const typeKey = cost.type === 'fixo' ? 'Fixo' : 'Variável';
        addToMaps(areaKey, typeKey, amountAbs);
    });

    // Compras avulsas no cartão (lançadas no mês)
    const purchases = transactions.filter(t => {
        return t.amount < 0 && t.meta && t.meta.type === 'credit_card_purchase' && t.meta.month === monthYYYYMM;
    });

    purchases.forEach(tx => {
        addToMaps(tx.area ? tx.area : 'Sem área', 'Cartão (compra avulsa)', Math.abs(tx.amount));
    });

    // Outras despesas manuais (não contam as recorrências já modeladas)
    const manualExpenses = transactions.filter(t => {
        const txType = t.meta ? t.meta.type : null;
        const txMonth = t.meta && t.meta.month ? t.meta.month : getCurrentMonthYYYYMM();
        return t.amount < 0 && txType !== 'recurring_cost' && txType !== 'credit_card_purchase' && txMonth === monthYYYYMM;
    });

    manualExpenses.forEach(tx => {
        addToMaps(tx.area ? tx.area : 'Sem área', 'Outras despesas', Math.abs(tx.amount));
    });

    // Render lista por área
    const areaArr = Array.from(areaTotals.entries())
        .map(([area, total]) => ({ area, total }))
        .sort((a, b) => b.total - a.total);

    analyticsAreaList.innerHTML = '';

    if (areaArr.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'Nenhuma despesa neste mês.';
        analyticsAreaList.appendChild(li);
    } else {
        areaArr.forEach(item => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span>${item.area}</span>
                <span class="analysis-total">R$ ${item.total.toFixed(2)}</span>
            `;
            analyticsAreaList.appendChild(li);
        });
    }

    // Render gráfico pizza por tipo
    const typeArr = Array.from(typeTotals.entries())
        .map(([type, total]) => ({ type, total }))
        .sort((a, b) => b.total - a.total);

    if (!typePieCanvas || typeof Chart === 'undefined') return;

    const labels = typeArr.map(x => x.type);
    const data = typeArr.map(x => Number(x.total.toFixed(2)));

    const colors = [
        '#0d6efd', '#6610f2', '#dc3545', '#fd7e14', '#20c997', '#6f42c1', '#198754', '#e83e8c'
    ];

    if (typePieChartInstance) {
        typePieChartInstance.destroy();
    }

    typePieChartInstance = new Chart(typePieCanvas.getContext('2d'), {
        type: 'pie',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: labels.map((_, i) => colors[i % colors.length])
            }]
        },
        options: {
            responsive: false,
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const val = context.parsed;
                            return `${context.label}: R$ ${Number(val).toFixed(2)}`;
                        }
                    }
                }
            }
        }
    });
}

if (analyticsMonthInput) {
    if (!analyticsMonthInput.value) {
        const defaultMonth = (costMonthInput && costMonthInput.value) ? costMonthInput.value : getCurrentMonthYYYYMM();
        analyticsMonthInput.value = defaultMonth;
    }

    analyticsMonthInput.addEventListener('change', () => {
        renderAnalyticsForMonth(analyticsMonthInput.value);
    });

    renderAnalyticsForMonth(analyticsMonthInput.value);
}

// Ao adicionar/alterar cartão, atualiza select de lançamentos
renderPurchaseCardSelectOptions();
