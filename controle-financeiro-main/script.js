const balance = document.getElementById('balance');
const transactionList = document.getElementById('transaction-list');
const form = document.getElementById('transaction-form');
const descriptionInput = document.getElementById('description');
const transactionMonthInput = document.getElementById('transaction-month');
const transactionAreaInput = document.getElementById('transaction-area');
const transactionTypeInput = document.getElementById('transaction-type');
const transactionOriginInput = document.getElementById('transaction-origin');
const transactionStatusInput = document.getElementById('transaction-status');
const amountInput = document.getElementById('amount');
const transactionFormSubmitBtn = form ? form.querySelector('button[type="submit"]') : null;

const STORAGE_KEYS = {
    transactions: 'transactions',
    recurringCosts: 'recurring_costs',
    variableCostOverrides: 'variable_cost_overrides',
    creditCards: 'credit_cards',
    creditCardMonthlyStatements: 'credit_card_monthly_statements'
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
let creditCardMonthlyStatements = getJSONFromLocalStorage(STORAGE_KEYS.creditCardMonthlyStatements, []);

// -------------------------
// UI: toast e colapsos
// -------------------------
const toastEl = document.getElementById('toast');
let toastTimer = null;

function showToast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toastEl.classList.remove('show');
    }, 2500);
}

function setInvalid(inputEl, invalid) {
    if (!inputEl) return;
    inputEl.classList.toggle('input-invalid', !!invalid);
}

function setupCollapsible(toggleId, targetId) {
    const toggleBtn = document.getElementById(toggleId);
    const target = document.getElementById(targetId);
    if (!toggleBtn || !target) return;

    toggleBtn.addEventListener('click', () => {
        const isExpanded = target.classList.contains('expanded');
        target.classList.toggle('expanded', !isExpanded);
        if (!isExpanded) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
}

setupCollapsible('transaction-toggle-btn', 'transaction-form-collapsible');
setupCollapsible('cost-recurring-toggle-btn', 'cost-recurring-form-collapsible');
setupCollapsible('purchase-toggle-btn', 'purchase-form-collapsible');
setupCollapsible('card-statement-item-toggle-btn', 'card-statement-item-form-collapsible');

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
function getTipoLabel(tipoCode) {
    const code = (tipoCode ?? '').toString();
    if (code === 'fixo_automatico') return 'Fixo Automático';
    if (code === 'fixo_manual') return 'Fixo Manual';
    if (code === 'variavel_manual') return 'Variável Manual';
    if (code === 'temporario_manual') return 'Temporário Manual';

    // Compatibilidade com versões antigas
    if (code === 'fixo') return 'Fixo Manual';
    if (code === 'variavel') return 'Variável Manual';

    return 'Temporário Manual';
}

function isVariableTipoCode(tipoCode) {
    const code = (tipoCode ?? '').toString();
    return code === 'variavel_manual' || code === 'variavel';
}

function getOrigemLabel(meta) {
    if (!meta) return 'Outros';
    if (meta.origem) return meta.origem;
    if (meta.creditCardId) return 'Cartão';
    return 'Outros';
}

function getStatusLabel(meta) {
    if (!meta || !meta.status) return 'OK';
    return meta.status;
}

// Função para adicionar uma transação ao DOM
function addTransactionDOM(transaction) {
    const sign = transaction.amount < 0 ? '-' : '+';
    const item = document.createElement('li');

    item.classList.add(transaction.amount < 0 ? 'minus' : 'plus');

    const area = transaction.area ? String(transaction.area) : '';
    const monthLabel = transaction.meta && transaction.meta.month ? transaction.meta.month : '';
    const meta = transaction.meta || {};
    const tipoLabel = getTipoLabel(meta.tipo ?? meta.costType ?? meta.manualType);
    const origemLabel = getOrigemLabel(meta);
    const statusLabel = getStatusLabel(meta);

    item.innerHTML = `
        <div>
            <div class="tx-desc">${transaction.description}</div>
            <div class="tx-meta">${[
                monthLabel ? `Mês: ${monthLabel}` : '',
                area ? `Área: ${area}` : '',
                `Tipo: ${tipoLabel}`,
                `Origem: ${origemLabel}`,
                `Status: ${statusLabel}`
            ].filter(Boolean).join(' | ')}</div>
        </div>
        <span>${sign} R$ ${Math.abs(transaction.amount).toFixed(2)}</span>
        <button class="edit-btn" type="button" onclick="startEditTransaction(${transaction.id})" aria-label="Editar transação">
            <span class="action-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 20h9"></path>
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
                </svg>
            </span>
            Editar
        </button>
        <button class="delete-btn" onclick="removeTransaction(${transaction.id})" type="button" aria-label="Remover">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18"></path>
                <path d="M8 6V4h8v2"></path>
                <path d="M19 6l-1 14H6L5 6"></path>
                <path d="M10 11v6"></path>
                <path d="M14 11v6"></path>
            </svg>
        </button>
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
        transactionTypeInput.value = (cost && cost.type) ? cost.type : (t.meta?.tipo ?? 'temporario_manual');
        transactionOriginInput.value = (cost && cost.origem) ? cost.origem : (t.meta?.origem ?? getOrigemLabel(t.meta));
        transactionStatusInput.value = (cost && cost.statusPadrao) ? cost.statusPadrao : (t.meta?.status ?? 'OK');
        transactionAreaInput.value = (t.area ?? (cost ? cost.area : '')) || '';
    } else {
        descriptionInput.value = t.description ?? '';
        transactionTypeInput.value = t.meta?.tipo ?? t.meta?.costType ?? 'temporario_manual';
        transactionOriginInput.value = t.meta?.origem ?? getOrigemLabel(t.meta);
        transactionStatusInput.value = t.meta?.status ?? 'OK';
        transactionAreaInput.value = t.area ?? '';
    }
    amountInput.value = t.amount ?? 0;
    transactionMonthInput.value = t.meta && t.meta.month ? t.meta.month : (transactionMonthInput.value || getCurrentMonthYYYYMM());

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
    if (transactionTypeInput) transactionTypeInput.value = 'temporario_manual';
    if (transactionOriginInput) transactionOriginInput.value = 'Outros';
    if (transactionStatusInput) transactionStatusInput.value = 'OK';

    if (transactionFormSubmitBtn) {
        transactionFormSubmitBtn.textContent = 'Adicionar Transação';
    }
}

// Função para adicionar uma nova transação
function addTransaction(e) {
    e.preventDefault();

    setInvalid(amountInput, false);
    if (descriptionInput.value.trim() === '' || amountInput.value.trim() === '') {
        setInvalid(amountInput, true);
        showToast('Preencha descrição e valor.');
        descriptionInput.focus();
        return;
    }

    const monthYYYYMM = transactionMonthInput ? transactionMonthInput.value : '';
    const area = transactionAreaInput ? transactionAreaInput.value.trim() : '';
    const tipo = transactionTypeInput ? transactionTypeInput.value : 'temporario_manual';
    const origem = transactionOriginInput ? transactionOriginInput.value : 'Outros';
    const status = transactionStatusInput ? transactionStatusInput.value : 'OK';
    const newAmount = +amountInput.value; // O '+' converte para número
    const description = descriptionInput.value.trim();

    if (!Number.isFinite(newAmount)) {
        setInvalid(amountInput, true);
        showToast('Valor inválido. Informe um número.');
        amountInput.focus();
        return;
    }

    if (editingTransactionId !== null) {
        const idx = transactions.findIndex(t => t.id === editingTransactionId);
        if (idx >= 0) {
            const prevMeta = transactions[idx].meta || {};
            const prevMonth = prevMeta.month;

            // Edição de lançamento gerado por recorrência: sincroniza com o "modelo" (recorrente/override)
            if (prevMeta.type === 'recurring_cost' && prevMeta.recurringCostId) {
                const cost = recurringCosts.find(c => c.id === prevMeta.recurringCostId);
                if (cost) {
                    cost.type = tipo;
                    cost.origem = origem;
                    cost.statusPadrao = status;

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

                        const prevTipo = prevMeta.tipo ?? prevMeta.costType ?? '';
                        if (prevTipo === 'variavel_manual' || prevTipo === 'variavel') {
                            variableCostOverrides = variableCostOverrides.filter(o => {
                                return !(o.costId === prevMeta.recurringCostId && o.month === prevMonth);
                            });
                            setJSONToLocalStorage(STORAGE_KEYS.variableCostOverrides, variableCostOverrides);
                        }
                    }

                    cost.description = description;
                    cost.area = area;

                    if (isVariableTipoCode(cost.type)) {
                        setVariableOverrideAmount(cost.id, monthYYYYMM, Math.abs(newAmount));
                    } else {
                        cost.amount = Math.abs(newAmount);
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
                    showToast('Transação atualizada com sucesso!');
                    return;
                }
            }

            // Edição padrão (transação manual / compra no cartão)
            transactions[idx].description = description;
            transactions[idx].amount = newAmount;
            transactions[idx].area = area;
            if (!transactions[idx].meta) transactions[idx].meta = {};
            transactions[idx].meta.month = monthYYYYMM;
            transactions[idx].meta.tipo = tipo;
            transactions[idx].meta.origem = origem;
            transactions[idx].meta.status = status;

            saveTransactionsToLocalStorage(transactions);
            init();
            const anaMonth = document.getElementById('analytics-month');
            if (anaMonth && anaMonth.value && typeof renderAnalyticsForMonth === 'function') {
                renderAnalyticsForMonth(anaMonth.value);
            }
            cancelEditTransaction();
            showToast('Transação atualizada com sucesso!');
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
            type: 'manual_transaction',
            tipo,
            origem,
            status
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

    showToast('Transação adicionada com sucesso!');
    setInvalid(amountInput, false);
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
    showToast('Transação removida.');
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
const costOriginSelect = document.getElementById('cost-origin');
const costStatusPadraoSelect = document.getElementById('cost-status-padrao');
const costAmountInput = document.getElementById('cost-amount');
const costStartMonthInput = document.getElementById('cost-start-month');
const costEndMonthInput = document.getElementById('cost-end-month');
const costRecurringSubmitBtn = document.getElementById('cost-recurring-submit-btn');
const costRecurringCancelBtn = document.getElementById('cost-recurring-cancel-btn');

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
    const tipoCode = cost.type;
    const origem = cost.origem ?? 'Outros';
    const status = isVariableTipoCode(cost.type) ? 'OK' : (cost.statusPadrao ?? 'OK');

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
        transactions[idx].meta.costType = cost.type; // compatibilidade
        transactions[idx].meta.tipo = tipoCode;
        transactions[idx].meta.origem = origem;
        transactions[idx].meta.status = status;
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
                costType: cost.type, // compatibilidade
                tipo: tipoCode,
                origem,
                status
            }
        });
    }

    saveTransactionsToLocalStorage(transactions);
}

// -------------------------
// Recorrências: editar/remover
// -------------------------
let editingRecurringCostId = null;

function expandCostRecurringForm() {
    const collapsible = document.getElementById('cost-recurring-form-collapsible');
    if (!collapsible) return;
    collapsible.classList.add('expanded');
}

function resetCostRecurringFormMode() {
    editingRecurringCostId = null;
    if (costRecurringSubmitBtn) costRecurringSubmitBtn.textContent = 'Adicionar recorrência';
    if (costRecurringCancelBtn) costRecurringCancelBtn.style.display = 'none';
}

function startEditRecurringCost(costId) {
    const cost = recurringCosts.find(c => c.id === costId);
    if (!cost) return;

    editingRecurringCostId = costId;
    if (costRecurringSubmitBtn) costRecurringSubmitBtn.textContent = 'Salvar alterações';
    if (costRecurringCancelBtn) costRecurringCancelBtn.style.display = 'block';

    if (costDescriptionInput) costDescriptionInput.value = cost.description ?? '';
    if (costAreaInput) costAreaInput.value = cost.area ?? '';
    if (costTypeSelect) costTypeSelect.value = cost.type ?? 'temporario_manual';
    if (costAmountInput) costAmountInput.value = Math.abs(cost.amount ?? 0);
    if (costCreditCardSelect) costCreditCardSelect.value = cost.creditCardId ? String(cost.creditCardId) : '';
    if (costOriginSelect) costOriginSelect.value = cost.origem ?? 'Outros';
    if (costStatusPadraoSelect) costStatusPadraoSelect.value = cost.statusPadrao ?? 'OK';
    if (costStartMonthInput) costStartMonthInput.value = cost.startMonth ?? getCurrentMonthYYYYMM();
    if (costEndMonthInput) costEndMonthInput.value = cost.endMonth ?? '';

    expandCostRecurringForm();
    showToast('Editando recorrência...');
    if (costDescriptionInput) costDescriptionInput.focus();
}

function syncExistingTransactionsForRecurringCost(cost) {
    if (!cost) return;

    // remove meses que não ficam mais ativos
    transactions = transactions.filter(tx => {
        const m = tx.meta;
        if (!m || m.type !== 'recurring_cost' || m.recurringCostId !== cost.id) return true;
        return isCostActiveForMonth(cost, m.month);
    });

    const existingMonths = new Set(
        (transactions || [])
            .filter(tx => tx.meta && tx.meta.type === 'recurring_cost' && tx.meta.recurringCostId === cost.id && tx.meta.month)
            .map(tx => tx.meta.month)
    );

    existingMonths.forEach(month => {
        const amountAbs = isVariableTipoCode(cost.type)
            ? (getVariableOverrideAmount(cost.id, month) ?? Math.abs(cost.amount))
            : Math.abs(cost.amount);
        upsertCostTransaction(cost, month, amountAbs);
    });
}

function removeRecurringCost(costId) {
    const cost = recurringCosts.find(c => c.id === costId);
    if (!cost) return;

    const confirmed = confirm(`Remover a recorrência "${cost.description}"?`);
    if (!confirmed) return;

    recurringCosts = recurringCosts.filter(c => c.id !== costId);
    variableCostOverrides = variableCostOverrides.filter(o => o.costId !== costId);
    transactions = transactions.filter(tx => {
        const m = tx.meta;
        return !(m && m.type === 'recurring_cost' && m.recurringCostId === costId);
    });

    setJSONToLocalStorage(STORAGE_KEYS.recurringCosts, recurringCosts);
    setJSONToLocalStorage(STORAGE_KEYS.variableCostOverrides, variableCostOverrides);
    saveTransactionsToLocalStorage(transactions);

    if (editingRecurringCostId === costId) resetCostRecurringFormMode();

    if (costMonthInput && costMonthInput.value) {
        renderRecurringCostsForMonth(costMonthInput.value);
    }
    if (invoiceMonthInput && invoiceMonthInput.value) {
        renderInvoicesForMonth(invoiceMonthInput.value);
    }
    if (typeof renderAnalyticsForMonth === 'function' && analyticsMonthInput && analyticsMonthInput.value) {
        renderAnalyticsForMonth(analyticsMonthInput.value);
    }
    init();
    showToast('Recorrência removida com sucesso!');
}

if (costRecurringCancelBtn) {
    costRecurringCancelBtn.addEventListener('click', () => {
        resetCostRecurringFormMode();
        const collapsible = document.getElementById('cost-recurring-form-collapsible');
        if (collapsible) collapsible.classList.remove('expanded');
        showToast('Edição cancelada.');
    });
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
            isVariableTipoCode(cost.type)
                ? (overridesMap.has(cost.id)
                    ? Math.abs(overridesMap.get(cost.id))
                    : Math.abs(cost.amount))
                : Math.abs(cost.amount);

        total += amount;

        const costCardId = cost.creditCardId ?? null;
        const cardName =
            costCardId
                ? (creditCards.find(c => String(c.id) === String(costCardId))?.name ?? 'Cartão')
                : 'Sem cartão';
        const areaName = cost.area ? String(cost.area) : 'Sem área';
        const origemName = cost.origem ? String(cost.origem) : 'Outros';
        const statusName = isVariableTipoCode(cost.type) ? 'OK' : (cost.statusPadrao ?? 'OK');

        const li = document.createElement('li');
        li.className = 'cost-item';

        li.innerHTML = `
            <div class="cost-left">
                <div class="cost-description">${cost.description}</div>
                <div class="cost-meta">Tipo: ${getTipoLabel(cost.type)} | Origem: ${origemName} | Status: ${statusName} | Cartão: ${cardName} | Área: ${areaName}</div>
            </div>
            <div class="cost-right">
                <div class="cost-value">
                    ${
                        isVariableTipoCode(cost.type)
                            ? `
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
                            : `<div class="cost-amount-display">R$ ${amount.toFixed(2)}</div>`
                    }
                </div>

                <div class="cost-actions" aria-hidden="true">
                    <button class="icon-action-btn" type="button" onclick="startEditRecurringCost(${cost.id})" aria-label="Editar recorrência">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M12 20h9"></path>
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
                        </svg>
                        Editar
                    </button>
                    <button class="icon-action-btn recurring-remove-btn" type="button" onclick="removeRecurringCost(${cost.id})" aria-label="Remover recorrência">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M3 6h18"></path>
                            <path d="M8 6V4h8v2"></path>
                            <path d="M19 6l-1 14H6L5 6"></path>
                            <path d="M10 11v6"></path>
                            <path d="M14 11v6"></path>
                        </svg>
                        Remover
                    </button>
                </div>
            </div>
        `;

        if (isVariableTipoCode(cost.type)) {
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
            isVariableTipoCode(cost.type)
                ? getVariableOverrideAmount(cost.id, monthYYYYMM) ?? Math.abs(cost.amount)
                : Math.abs(cost.amount);

        upsertCostTransaction(cost, monthYYYYMM, amount);
    });

    init();
    if (postMonthCostsHint) {
        postMonthCostsHint.textContent = 'Custos lançados/atualizados no histórico.';
    }
    showToast('Custos lançados no histórico com sucesso!');

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
        const origem = costOriginSelect ? costOriginSelect.value : 'Outros';
        let statusPadrao = costStatusPadraoSelect ? costStatusPadraoSelect.value : 'OK';
        if (type !== 'fixo_automatico') {
            // As categorias manuais (fixo manual/variável manual/temporário manual) devem sair como OK por padrão
            statusPadrao = 'OK';
        }

        if (!description || !type || !origem || !startMonth || !Number.isFinite(amount)) {
            setInvalid(costAmountInput, true);
            alert('Preencha descrição, tipo, valor, origem e mês de início.');
            return;
        }
        setInvalid(costAmountInput, false);

        const creditCardIdRaw = costCreditCardSelect ? costCreditCardSelect.value : '';
        const creditCardId = creditCardIdRaw ? +creditCardIdRaw : null;
        const area = costAreaInput ? costAreaInput.value.trim() : '';

        const isEditing = editingRecurringCostId !== null;
        const target = isEditing ? recurringCosts.find(c => c.id === editingRecurringCostId) : null;

        if (isEditing && target) {
            const wasVariable = isVariableTipoCode(target.type);
            const willBeVariable = isVariableTipoCode(type);

            target.description = description;
            target.type = type;
            target.amount = Math.abs(amount);
            target.area = area;
            target.startMonth = startMonth;
            target.endMonth = endMonth;
            target.creditCardId = creditCardId;
            target.origem = origem;
            target.statusPadrao = statusPadrao;

            if (wasVariable && !willBeVariable) {
                variableCostOverrides = variableCostOverrides.filter(o => o.costId !== target.id);
                setJSONToLocalStorage(STORAGE_KEYS.variableCostOverrides, variableCostOverrides);
            }

            setJSONToLocalStorage(STORAGE_KEYS.recurringCosts, recurringCosts);
            syncExistingTransactionsForRecurringCost(target);
            init();
        } else {
            const recurringCost = {
                id: generateID(),
                description,
                type,
                amount: Math.abs(amount),
                area,
                startMonth,
                endMonth,
                creditCardId,
                origem,
                statusPadrao
            };

            recurringCosts.push(recurringCost);
            setJSONToLocalStorage(STORAGE_KEYS.recurringCosts, recurringCosts);
        }

        // Re-renderiza a lista do mês atual
        if (costMonthInput) {
            renderRecurringCostsForMonth(costMonthInput.value);
        }

        if (invoiceMonthInput && invoiceMonthInput.value) {
            renderInvoicesForMonth(invoiceMonthInput.value);
        }

        if (!isEditing) costDescriptionInput.value = '';
        if (costAreaInput) costAreaInput.value = '';
        // Mantem tipo e valor para facilitar múltiplos lançamentos com mesma configuração
        costAmountInput.value = '';
        if (postMonthCostsHint) postMonthCostsHint.textContent = '';
        if (isEditing) {
            resetCostRecurringFormMode();
            const collapsible = document.getElementById('cost-recurring-form-collapsible');
            if (collapsible) collapsible.classList.remove('expanded');
            showToast('Recorrência atualizada com sucesso!');
        } else {
            showToast('Recorrência adicionada com sucesso!');
        }
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
        if (typeof renderCardStatementSelectOptions === 'function') {
            renderCardStatementSelectOptions();
        }
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
            isVariableTipoCode(cost.type)
                ? (overridesMap.has(cost.id)
                    ? Math.abs(overridesMap.get(cost.id))
                    : Math.abs(cost.amount))
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
        const status = t.meta?.status ?? 'OK';
        return t.amount < 0 && t.meta && t.meta.type === 'credit_card_purchase' && t.meta.month === monthYYYYMM && status !== 'Pendente';
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
const purchaseOriginSelect = document.getElementById('purchase-origin');
const purchaseStatusSelect = document.getElementById('purchase-status');

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
        const origem = purchaseOriginSelect ? purchaseOriginSelect.value : 'Cartão';
        const status = purchaseStatusSelect ? purchaseStatusSelect.value : 'OK';

        if (!monthYYYYMM || !cardId || !description || !Number.isFinite(amount) || !origem || !status) {
            setInvalid(purchaseAmountInput, true);
            alert('Preencha mês, cartão, descrição e valor.');
            return;
        }
        setInvalid(purchaseAmountInput, false);

        const tx = {
            id: generateID(),
            description: description,
            amount: -Math.abs(amount),
            area,
            meta: {
                type: 'credit_card_purchase',
                month: monthYYYYMM,
                creditCardId: cardId,
                costType: 'temporario_manual',
                tipo: 'temporario_manual',
                origem,
                status
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

        showToast('Compra no cartão lançada com sucesso!');

        if (purchaseDescriptionInput) purchaseDescriptionInput.value = '';
        if (purchaseAmountInput) purchaseAmountInput.value = '';
        if (purchaseAreaInput) purchaseAreaInput.value = '';
    });
}

// -------------------------
// Cartões: fechamento do cartão por mês (deduções)
// -------------------------
const cardStatementMonthInput = document.getElementById('card-statement-month');
const cardStatementSelect = document.getElementById('card-statement-select');
const cardStatementClosingTotalInput = document.getElementById('card-statement-closing-total');
const cardStatementSaveBtn = document.getElementById('card-statement-save-btn');
const cardStatementUsedTotalEl = document.getElementById('card-statement-used-total');
const cardStatementRemainingTotalEl = document.getElementById('card-statement-remaining-total');

const cardStatementItemForm = document.getElementById('card-statement-item-form');
const cardStatementItemDescriptionInput = document.getElementById('card-statement-item-description');
const cardStatementItemAmountInput = document.getElementById('card-statement-item-amount');
const cardStatementItemAreaInput = document.getElementById('card-statement-item-area');
const cardStatementItemOriginSelect = document.getElementById('card-statement-item-origin');
const cardStatementItemStatusSelect = document.getElementById('card-statement-item-status');
const cardStatementItemList = document.getElementById('card-statement-item-list');

function renderCardStatementSelectOptions() {
    if (!cardStatementSelect) return;

    const currentValue = cardStatementSelect.value;
    cardStatementSelect.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Selecione';
    cardStatementSelect.appendChild(placeholder);

    (creditCards || []).forEach(card => {
        const opt = document.createElement('option');
        opt.value = String(card.id);
        opt.textContent = card.name;
        cardStatementSelect.appendChild(opt);
    });

    if (currentValue && creditCards.some(c => String(c.id) === String(currentValue))) {
        cardStatementSelect.value = currentValue;
    }
}

function findCardStatementIndex(creditCardId, monthYYYYMM) {
    return (creditCardMonthlyStatements || []).findIndex(s => {
        return String(s.creditCardId) === String(creditCardId) && s.month === monthYYYYMM;
    });
}

function getSelectedStatementContext() {
    const monthYYYYMM = cardStatementMonthInput ? cardStatementMonthInput.value : '';
    const creditCardIdRaw = cardStatementSelect ? cardStatementSelect.value : '';
    const creditCardId = creditCardIdRaw ? +creditCardIdRaw : null;
    return { monthYYYYMM, creditCardId };
}

function upsertCardStatement(creditCardId, monthYYYYMM) {
    if (!creditCardId || !monthYYYYMM) return null;

    const idx = findCardStatementIndex(creditCardId, monthYYYYMM);
    if (idx >= 0) return creditCardMonthlyStatements[idx];

    const created = {
        id: generateID(),
        creditCardId,
        month: monthYYYYMM,
        closingTotal: 0,
        items: []
    };

    creditCardMonthlyStatements.push(created);
    setJSONToLocalStorage(STORAGE_KEYS.creditCardMonthlyStatements, creditCardMonthlyStatements);
    return created;
}

function calculateCardStatementTotals(statement) {
    const closingTotal = statement && Number.isFinite(+statement.closingTotal) ? +statement.closingTotal : 0;
    const items = statement && Array.isArray(statement.items) ? statement.items : [];
    const usedTotal = items.reduce((acc, it) => {
        const status = it && it.status ? it.status : 'OK';
        if (status !== 'OK') return acc;
        const amt = Math.abs(Number(it.amount) || 0);
        return acc + amt;
    }, 0);
    const remaining = closingTotal - usedTotal;
    return { closingTotal, usedTotal, remaining };
}

function renderCardStatementForSelected() {
    if (!cardStatementMonthInput || !cardStatementSelect || !cardStatementClosingTotalInput) return;

    const { monthYYYYMM, creditCardId } = getSelectedStatementContext();
    if (!monthYYYYMM || !creditCardId) return;

    const idx = findCardStatementIndex(creditCardId, monthYYYYMM);
    const statement = idx >= 0 ? creditCardMonthlyStatements[idx] : null;

    const totals = calculateCardStatementTotals(statement || {
        creditCardId,
        month: monthYYYYMM,
        closingTotal: 0,
        items: []
    });

    // Sincroniza input e totais
    cardStatementClosingTotalInput.value = statement && Number.isFinite(+statement.closingTotal) ? +statement.closingTotal : '';
    if (cardStatementUsedTotalEl) cardStatementUsedTotalEl.textContent = `R$ ${totals.usedTotal.toFixed(2)}`;
    if (cardStatementRemainingTotalEl) cardStatementRemainingTotalEl.textContent = `R$ ${totals.remaining.toFixed(2)}`;

    // Itens
    if (!cardStatementItemList) return;
    cardStatementItemList.innerHTML = '';

    const items = statement && Array.isArray(statement.items) ? statement.items : [];
    if (items.length === 0) {
        const li = document.createElement('li');
        li.className = 'empty-list-item';
        li.textContent = 'Nenhuma despesa deduzida para este fechamento.';
        cardStatementItemList.appendChild(li);
        return;
    }

    items.forEach(item => {
        const li = document.createElement('li');
        li.className = 'statement-item';
        li.dataset.itemId = String(item.id);
        li.innerHTML = `
            <div class="statement-left">
                <div class="statement-desc">${item.description}</div>
                <div class="statement-meta">${[
                    item.area ? `Área: ${item.area}` : 'Área: (não informada)',
                    item.origem ? `Origem: ${item.origem}` : '',
                    item.status ? `Status: ${item.status}` : ''
                ].filter(Boolean).join(' | ')}</div>
            </div>
            <div class="statement-right" style="display:flex; gap:10px; align-items:center;">
                <div class="invoice-total">R$ ${Number(item.amount).toFixed(2)}</div>
                <button class="remove-btn" type="button" onclick="removeCardStatementItemById(${item.id})" aria-label="Remover">
                    <span class="action-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 6h18"></path>
                            <path d="M8 6V4h8v2"></path>
                            <path d="M19 6l-1 14H6L5 6"></path>
                            <path d="M10 11v6"></path>
                            <path d="M14 11v6"></path>
                        </svg>
                    </span>
                    Remover
                </button>
            </div>
        `;
        cardStatementItemList.appendChild(li);
    });
}

function removeCardStatementItemById(itemId) {
    if (!itemId) return;

    let changed = false;
    creditCardMonthlyStatements = (creditCardMonthlyStatements || []).map(statement => {
        const items = Array.isArray(statement.items) ? statement.items : [];
        const filtered = items.filter(it => it.id !== itemId);
        if (filtered.length !== items.length) changed = true;
        return { ...statement, items: filtered };
    });

    if (!changed) return;
    setJSONToLocalStorage(STORAGE_KEYS.creditCardMonthlyStatements, creditCardMonthlyStatements);

    renderCardStatementForSelected();
    if (typeof renderAnalyticsForMonth === 'function' && analyticsMonthInput && analyticsMonthInput.value) {
        renderAnalyticsForMonth(analyticsMonthInput.value);
    }
    showToast('Item removido do fechamento.');
}

if (cardStatementMonthInput && cardStatementSelect) {
    if (!cardStatementMonthInput.value) {
        cardStatementMonthInput.value = getCurrentMonthYYYYMM();
    }

    renderCardStatementSelectOptions();

    cardStatementMonthInput.addEventListener('change', () => {
        renderCardStatementForSelected();
        if (analyticsMonthInput && analyticsMonthInput.value === cardStatementMonthInput.value && typeof renderAnalyticsForMonth === 'function') {
            renderAnalyticsForMonth(cardStatementMonthInput.value);
        }
    });

    cardStatementSelect.addEventListener('change', () => {
        renderCardStatementForSelected();
    });
}

if (cardStatementSaveBtn) {
    cardStatementSaveBtn.addEventListener('click', () => {
        const { monthYYYYMM, creditCardId } = getSelectedStatementContext();
        if (!monthYYYYMM || !creditCardId) {
            alert('Selecione cartão e mês.');
            return;
        }

        const closingTotal = +cardStatementClosingTotalInput.value;
        if (!Number.isFinite(closingTotal)) {
            alert('Informe o valor de fechamento.');
            return;
        }

        const statement = upsertCardStatement(creditCardId, monthYYYYMM);
        if (!statement) return;

        statement.closingTotal = Math.abs(closingTotal);
        setJSONToLocalStorage(STORAGE_KEYS.creditCardMonthlyStatements, creditCardMonthlyStatements);

        renderCardStatementForSelected();
        if (typeof renderAnalyticsForMonth === 'function' && analyticsMonthInput && analyticsMonthInput.value === monthYYYYMM) {
            renderAnalyticsForMonth(monthYYYYMM);
        }
        showToast('Fechamento do cartão salvo com sucesso!');
    });
}

if (cardStatementItemForm) {
    cardStatementItemForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const { monthYYYYMM, creditCardId } = getSelectedStatementContext();
        if (!monthYYYYMM || !creditCardId) {
            alert('Selecione cartão e mês.');
            return;
        }

        const description = cardStatementItemDescriptionInput ? cardStatementItemDescriptionInput.value.trim() : '';
        const amount = cardStatementItemAmountInput ? +cardStatementItemAmountInput.value : NaN;
        const area = cardStatementItemAreaInput ? cardStatementItemAreaInput.value.trim() : '';
        const origem = cardStatementItemOriginSelect ? cardStatementItemOriginSelect.value : 'Cartão';
        const status = cardStatementItemStatusSelect ? cardStatementItemStatusSelect.value : 'OK';

        if (!description || !Number.isFinite(amount) || !origem || !status) {
            setInvalid(cardStatementItemAmountInput, true);
            alert('Preencha descrição, valor, origem e status.');
            return;
        }
        setInvalid(cardStatementItemAmountInput, false);

        const statement = upsertCardStatement(creditCardId, monthYYYYMM);
        if (!statement) return;

        if (!Array.isArray(statement.items)) statement.items = [];
        statement.items.push({
            id: generateID(),
            description,
            amount: Math.abs(amount),
            area,
            origem,
            status,
            tipo: 'temporario_manual'
        });

        // Se o fechamento ainda não existir, tenta usar o valor digitado
        if (!Number.isFinite(+statement.closingTotal) || +statement.closingTotal === 0) {
            const closingInput = +cardStatementClosingTotalInput.value;
            if (Number.isFinite(closingInput)) statement.closingTotal = Math.abs(closingInput);
        }

        setJSONToLocalStorage(STORAGE_KEYS.creditCardMonthlyStatements, creditCardMonthlyStatements);

        // Feedback e render
        if (cardStatementItemDescriptionInput) cardStatementItemDescriptionInput.value = '';
        if (cardStatementItemAmountInput) cardStatementItemAmountInput.value = '';
        if (cardStatementItemAreaInput) cardStatementItemAreaInput.value = '';

        renderCardStatementForSelected();
        if (typeof renderAnalyticsForMonth === 'function' && analyticsMonthInput && analyticsMonthInput.value === monthYYYYMM) {
            renderAnalyticsForMonth(monthYYYYMM);
        }

        showToast('Despesa deduzida adicionada com sucesso!');
    });
}

// -------------------------
// Análises (novo): área e gráfico de pizza por tipo
// -------------------------
const analyticsMonthInput = document.getElementById('analytics-month');
const analyticsAreaList = document.getElementById('analytics-area-list');
const analyticsOriginList = document.getElementById('analytics-origin-list');
const typePieCanvas = document.getElementById('type-pie-chart');
let typePieChartInstance = null;
const typeBarCanvas = document.getElementById('type-bar-chart');
let typeBarChartInstance = null;

function renderAnalyticsForMonth(monthYYYYMM) {
    if (!analyticsAreaList) return;

    const areaTotals = new Map();
    const typeTotals = new Map(); // key = label (Fixo Manual etc)
    const originTotals = new Map();

    function addExpense(areaKey, tipoCode, origem, status, amountAbs) {
        const s = status ?? 'OK';
        if (s === 'Pendente') return;
        const a = areaKey ? String(areaKey) : 'Sem área';
        const tipoLabel = getTipoLabel(tipoCode);
        const o = origem ? String(origem) : 'Outros';
        const amt = Math.abs(Number(amountAbs) || 0);
        if (!amt) return;

        areaTotals.set(a, (areaTotals.get(a) || 0) + amt);
        typeTotals.set(tipoLabel, (typeTotals.get(tipoLabel) || 0) + amt);
        originTotals.set(o, (originTotals.get(o) || 0) + amt);
    }

    // Recorrentes (previsto/esperado para o mês)
    const activeCosts = recurringCosts.filter(c => isCostActiveForMonth(c, monthYYYYMM));
    const overridesForMonth = variableCostOverrides.filter(o => o.month === monthYYYYMM);
    const overridesMap = new Map(overridesForMonth.map(o => [o.costId, o.amount]));

    activeCosts.forEach(cost => {
        const amountAbs =
            isVariableTipoCode(cost.type)
                ? (overridesMap.has(cost.id)
                    ? Math.abs(overridesMap.get(cost.id))
                    : Math.abs(cost.amount))
                : Math.abs(cost.amount);

        const status = isVariableTipoCode(cost.type) ? 'OK' : (cost.statusPadrao ?? 'OK');
        addExpense(cost.area, cost.type, cost.origem, status, amountAbs);
    });

    // Compras avulsas no cartão (lançadas no mês)
    const purchases = transactions.filter(t => {
        const meta = t.meta || {};
        return t.amount < 0 && meta.type === 'credit_card_purchase' && meta.month === monthYYYYMM;
    });

    purchases.forEach(tx => {
        addExpense(tx.area, tx.meta?.tipo ?? 'temporario_manual', tx.meta?.origem ?? getOrigemLabel(tx.meta), tx.meta?.status ?? 'OK', tx.amount);
    });

    // Itens do fechamento do cartão (deduções) no mês
    const statementsForMonth = (creditCardMonthlyStatements || []).filter(s => s && s.month === monthYYYYMM);
    statementsForMonth.forEach(statement => {
        const items = Array.isArray(statement.items) ? statement.items : [];
        let usedTotal = 0;

        items.forEach(it => {
            const status = it.status ?? 'OK';
            if (status === 'Pendente') return;
            const amountAbs = Math.abs(Number(it.amount) || 0);
            if (!amountAbs) return;
            usedTotal += amountAbs;

            addExpense(it.area, 'temporario_manual', it.origem ?? 'Cartão', status, amountAbs);
        });

        const closingTotal = statement && Number.isFinite(+statement.closingTotal) ? +statement.closingTotal : 0;
        const remaining = closingTotal - usedTotal;
        if (remaining > 0.000001) {
            addExpense('Outros', 'temporario_manual', 'Cartão', 'OK', remaining);
        }
    });

    // Lançamentos manuais (não contam recorrências/compra avulsa)
    const manualExpenses = transactions.filter(t => {
        const meta = t.meta || {};
        const txMonth = meta.month ? meta.month : getCurrentMonthYYYYMM();
        const txType = meta.type;
        const isManualLike = !txType || txType === 'manual_transaction';
        return t.amount < 0 && isManualLike && meta.type !== 'recurring_cost' && meta.type !== 'credit_card_purchase' && txMonth === monthYYYYMM;
    });

    manualExpenses.forEach(tx => {
        addExpense(
            tx.area,
            tx.meta?.tipo ?? tx.meta?.costType ?? 'temporario_manual',
            tx.meta?.origem ?? getOrigemLabel(tx.meta),
            tx.meta?.status ?? 'OK',
            Math.abs(tx.amount)
        );
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

    // Render lista por origem
    if (analyticsOriginList) {
        const originArr = Array.from(originTotals.entries())
            .map(([origin, total]) => ({ origin, total }))
            .sort((a, b) => b.total - a.total);

        analyticsOriginList.innerHTML = '';
        if (originArr.length === 0) {
            const li = document.createElement('li');
            li.textContent = 'Nenhuma despesa por origem neste mês.';
            analyticsOriginList.appendChild(li);
        } else {
            originArr.forEach(item => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <span>${item.origin}</span>
                    <span class="analysis-total">R$ ${item.total.toFixed(2)}</span>
                `;
                analyticsOriginList.appendChild(li);
            });
        }
    }

    // Gráficos (pizza e barras) por tipo
    if (!typePieCanvas || typeof Chart === 'undefined') return;

    const typeArr = Array.from(typeTotals.entries())
        .map(([type, total]) => ({ type, total }))
        .sort((a, b) => b.total - a.total);

    const labels = typeArr.map(x => x.type);
    const data = typeArr.map(x => Number(x.total.toFixed(2)));

    const colorsByType = {
        'Fixo Automático': '#4dabf7',
        'Fixo Manual': '#20c997',
        'Variável Manual': '#ffd43b',
        'Temporário Manual': '#ff922b'
    };

    const getColor = (label) => colorsByType[label] ?? '#6f42c1';

    if (typePieChartInstance) typePieChartInstance.destroy();
    typePieChartInstance = new Chart(typePieCanvas.getContext('2d'), {
        type: 'pie',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: labels.map(l => getColor(l))
            }]
        },
        options: {
            responsive: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#e6edf3' } },
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

    // Barras comparando os 4 tipos principais
    if (typeBarCanvas && typeof Chart !== 'undefined') {
        const barCategories = ['Fixo Automático', 'Fixo Manual', 'Variável Manual', 'Temporário Manual'];
        const barData = barCategories.map(c => Number((typeTotals.get(c) || 0).toFixed(2)));

        if (typeBarChartInstance) typeBarChartInstance.destroy();

        typeBarChartInstance = new Chart(typeBarCanvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: barCategories,
                datasets: [{
                    label: 'Total no mês',
                    data: barData,
                    backgroundColor: barCategories.map(c => getColor(c))
                }]
            },
            options: {
                responsive: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        ticks: { color: '#e6edf3' },
                        grid: { color: 'rgba(255,255,255,0.06)' }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#e6edf3' },
                        grid: { color: 'rgba(255,255,255,0.06)' }
                    }
                }
            }
        });
    }
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
