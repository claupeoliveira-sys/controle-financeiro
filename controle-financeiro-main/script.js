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
    variableCostOverrides: 'variable_cost_overrides'
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

// Migração leve para o modelo simplificado (sem cartões)
// Normaliza tipos de recorrência para 'fixo' | 'variavel'.
recurringCosts = (recurringCosts || []).map(c => {
    const rawType = (c && c.type) ? String(c.type) : '';
    let type = rawType;
    if (rawType === 'fixo_automatico' || rawType === 'fixo_manual' || rawType === 'fixo') type = 'fixo';
    if (rawType === 'variavel_manual' || rawType === 'variavel') type = 'variavel';
    // fallback (casos antigos)
    if (rawType === 'temporario_manual') type = 'fixo';

    const amount = type === 'variavel' ? 0 : Math.abs(Number(c?.amount ?? 0));
    return {
        ...c,
        type,
        amount
    };
});

const recurringCostTypeMap = new Map((recurringCosts || []).map(c => [String(c.id), c.type]));
variableCostOverrides = (variableCostOverrides || [])
    .filter(o => o && recurringCostTypeMap.get(String(o.costId)) === 'variavel')
    .map(o => ({
        ...o,
        month: o.month,
        amount: Math.abs(Number(o.amount ?? 0))
    }));

// -------------------------
// UI: toast e colapsos
// -------------------------
const toastEl = document.getElementById('toast');
let toastTimer = null;

function showToast(message) {
    if (!toastEl) return;

    const normalized = (message || '').toString().toLowerCase();
    const isError = normalized.includes('preencha') || normalized.includes('invál') || normalized.includes('erro') || normalized.includes('invalid');

    toastEl.innerHTML = '';
    const badge = document.createElement('span');
    badge.className = `toast-badge${isError ? ' error' : ''}`;
    badge.textContent = isError ? 'ERRO' : 'OK';
    toastEl.appendChild(badge);
    toastEl.appendChild(document.createTextNode(` ${message}`));

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
    if (code === 'fixo') return 'Fixo';
    if (code === 'variavel') return 'Variável';
    if (code === 'despesa') return 'Despesa';
    if (code === 'receita') return 'Receita';

    // compatibilidade com versões antigas
    if (code === 'fixo_automatico' || code === 'fixo_manual') return 'Fixo';
    if (code === 'variavel_manual') return 'Variável';

    return 'Despesa';
}

function isVariableTipoCode(tipoCode) {
    const code = (tipoCode ?? '').toString();
    return code === 'variavel' || code === 'variavel_manual';
}

function getOrigemLabel(meta) {
    if (!meta) return 'Outros';
    if (meta.origem) return meta.origem;
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
    const tipoLabel = getTipoLabel(meta.recurringCostType ?? meta.tipo ?? meta.costType ?? meta.manualType);
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
        <button class="edit-btn" type="button" onclick="startEditTransaction(${transaction.id})" aria-label="Editar transação" title="Editar transação">
            <span class="action-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 20h9"></path>
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
                </svg>
            </span>
            <span class="btn-text">Editar</span>
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
        // Recorrências são sempre despesas no histórico
        transactionTypeInput.value = 'despesa';
        transactionOriginInput.value = (cost && cost.origem) ? cost.origem : (t.meta?.origem ?? getOrigemLabel(t.meta));
        transactionStatusInput.value = (cost && cost.statusPadrao) ? cost.statusPadrao : (t.meta?.status ?? 'OK');
        transactionAreaInput.value = (t.area ?? (cost ? cost.area : '')) || '';
    } else {
        descriptionInput.value = t.description ?? '';
        // Se dados antigos estiverem presentes, inferimos pelo sinal do amount
        if (t.meta?.manualOverrideFor === 'fixo') {
            transactionTypeInput.value = 'despesa';
        } else {
            transactionTypeInput.value =
                (t.meta?.tipo === 'receita' || t.meta?.tipo === 'despesa')
                    ? t.meta.tipo
                    : (t.amount < 0 ? 'despesa' : 'receita');
        }
        transactionOriginInput.value = t.meta?.origem ?? getOrigemLabel(t.meta);
        transactionStatusInput.value = t.meta?.status ?? 'OK';
        transactionAreaInput.value = t.area ?? '';
    }
    // UI sempre recebe valor positivo
    amountInput.value = Math.abs(t.amount ?? 0);
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
    if (transactionTypeInput) transactionTypeInput.value = 'despesa';
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
    const tipo = transactionTypeInput ? transactionTypeInput.value : 'despesa';
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

    const amountAbs = Math.abs(newAmount);
    const signedAmount = tipo === 'receita' ? amountAbs : -amountAbs;

    if (editingTransactionId !== null) {
        const idx = transactions.findIndex(t => t.id === editingTransactionId);
        if (idx >= 0) {
            const prevMeta = transactions[idx].meta || {};
            const prevMonth = prevMeta.month;

            // Edição de lançamento gerado por recorrência: sincroniza com o "modelo" (recorrente/override)
            if (prevMeta.type === 'recurring_cost' && prevMeta.recurringCostId) {
                const cost = recurringCosts.find(c => c.id === prevMeta.recurringCostId);
                if (cost) {
                    cost.origem = origem;
                    cost.statusPadrao = status;
                    // Se o usuário alterar o mês, remove o lançamento antigo daquele mês (evita duplicar).
                    if (prevMonth && prevMonth !== monthYYYYMM) {
                        // remove recorrência já materializada naquele mês
                        transactions = transactions.filter(tx => {
                            return !(
                                tx.meta &&
                                tx.meta.type === 'recurring_cost' &&
                                tx.meta.recurringCostId === prevMeta.recurringCostId &&
                                tx.meta.month === prevMonth
                            );
                        });

                        // remove override específico do mês antigo
                        if (cost.type === 'variavel') {
                            variableCostOverrides = variableCostOverrides.filter(o => {
                                return !(o.costId === prevMeta.recurringCostId && o.month === prevMonth);
                            });
                            setJSONToLocalStorage(STORAGE_KEYS.variableCostOverrides, variableCostOverrides);
                        }

                        if (cost.type === 'fixo') {
                            transactions = transactions.filter(tx => {
                                const m = tx.meta || {};
                                return !(
                                    m.type === 'manual_transaction' &&
                                    m.recurringCostId === prevMeta.recurringCostId &&
                                    m.manualOverrideFor === 'fixo' &&
                                    m.month === prevMonth
                                );
                            });
                        }
                    }

                    cost.description = description;
                    cost.area = area;

                    if (cost.type === 'variavel') {
                        setVariableOverrideAmount(cost.id, monthYYYYMM, amountAbs);
                        upsertCostTransaction(cost, monthYYYYMM, amountAbs);
                    } else {
                        // Fixo: override manual apenas para aquele mês
                        upsertFixedManualOverrideTransaction(cost, monthYYYYMM, amountAbs);
                    }

                    setJSONToLocalStorage(STORAGE_KEYS.recurringCosts, recurringCosts);
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

            // Edição padrão (transação manual / compra no cartão)
            transactions[idx].description = description;
            transactions[idx].amount = signedAmount;
            transactions[idx].area = area;
            if (!transactions[idx].meta) transactions[idx].meta = {};
            transactions[idx].meta.month = monthYYYYMM;
            transactions[idx].meta.tipo = tipo;
            transactions[idx].meta.origem = origem;
            transactions[idx].meta.status = status;

            // Se for override manual de um "Fixo" (criado pela matriz), evita duplicar com recurring_cost
            const m = transactions[idx].meta || {};
            if (m.type === 'manual_transaction' && m.manualOverrideFor === 'fixo' && m.recurringCostId) {
                const costId = m.recurringCostId;
                transactions = transactions.filter(tx => {
                    const tm = tx.meta || {};
                    return !(
                        tm.type === 'recurring_cost' &&
                        tm.recurringCostId === costId &&
                        (tm.month === prevMonth || tm.month === monthYYYYMM)
                    );
                });
            }

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
        amount: signedAmount,
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

// Horizon prático para "meses futuros" quando não existe endMonth.
// Mantemos limitado para não explodir o tamanho do histórico no front-end estático.
const POST_HORIZON_MONTHS = 24;

function monthYYYYMMToDate(yyyyMM) {
    if (!yyyyMM || typeof yyyyMM !== 'string') return null;
    const [y, m] = yyyyMM.split('-').map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
    return new Date(y, m - 1, 1);
}

function dateToMonthYYYYMM(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}`;
}

function addMonthsToMonthYYYYMM(yyyyMM, deltaMonths) {
    const date = monthYYYYMMToDate(yyyyMM);
    if (!date) return yyyyMM;
    date.setMonth(date.getMonth() + deltaMonths);
    return dateToMonthYYYYMM(date);
}

function* iterateMonthsInclusive(fromYYYYMM, toYYYYMM) {
    const fromDate = monthYYYYMMToDate(fromYYYYMM);
    const toDate = monthYYYYMMToDate(toYYYYMM);
    if (!fromDate || !toDate) return;

    const d = new Date(fromDate.getTime());
    while (d <= toDate) {
        yield dateToMonthYYYYMM(d);
        d.setMonth(d.getMonth() + 1);
    }
}

function getFixedManualOverrideAmount(costId, monthYYYYMM) {
    const tx = transactions.find(t => {
        const m = t.meta || {};
        return (
            m.type === 'manual_transaction' &&
            m.recurringCostId === costId &&
            m.manualOverrideFor === 'fixo' &&
            m.month === monthYYYYMM
        );
    });
    return tx ? Math.abs(tx.amount) : null;
}

function upsertFixedManualOverrideTransaction(cost, monthYYYYMM, amountAbs) {
    // 1) remove materialização da recorrência fixa naquele mês (pra evitar duplicidade)
    transactions = transactions.filter(tx => {
        const m = tx.meta || {};
        return !(
            m.type === 'recurring_cost' &&
            m.recurringCostId === cost.id &&
            m.month === monthYYYYMM
        );
    });

    const existingIdx = transactions.findIndex(tx => {
        const m = tx.meta || {};
        return (
            m.type === 'manual_transaction' &&
            m.recurringCostId === cost.id &&
            m.manualOverrideFor === 'fixo' &&
            m.month === monthYYYYMM
        );
    });

    const signedAmount = -Math.abs(amountAbs);
    const description = `${cost.description} (${monthYYYYMM})`;

    if (existingIdx >= 0) {
        transactions[existingIdx].description = description;
        transactions[existingIdx].amount = signedAmount;
        transactions[existingIdx].area = cost.area ?? '';
        if (!transactions[existingIdx].meta) transactions[existingIdx].meta = {};

        const m = transactions[existingIdx].meta;
        m.month = monthYYYYMM;
        m.recurringCostId = cost.id;
        m.manualOverrideFor = 'fixo';
        m.recurringCostType = 'fixo';
        m.tipo = 'despesa'; // para o formulário
        m.origem = cost.origem ?? 'Outros';
        m.status = cost.statusPadrao ?? 'OK';
        return;
    }

    transactions.push({
        id: generateID(),
        description,
        amount: signedAmount,
        area: cost.area ?? '',
        meta: {
            type: 'manual_transaction',
            month: monthYYYYMM,
            recurringCostId: cost.id,
            manualOverrideFor: 'fixo',
            recurringCostType: 'fixo',
            // dinheiro/fluxo:
            tipo: 'despesa',
            origem: cost.origem ?? 'Outros',
            status: cost.statusPadrao ?? 'OK'
        }
    });
}

function upsertCostTransaction(cost, monthYYYYMM, amountAbs) {
    const expenseAmount = -Math.abs(amountAbs);
    const description = `${cost.description} (${monthYYYYMM})`;
    const origem = cost.origem ?? 'Outros';
    const status = cost.type === 'variavel' ? 'OK' : (cost.statusPadrao ?? 'OK');

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
        transactions[idx].area = cost.area ?? '';
        transactions[idx].meta.recurringCostType = cost.type;
        transactions[idx].meta.tipo = cost.type; // compatibilidade com getTipoLabel
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
                recurringCostType: cost.type,
                tipo: cost.type, // compatibilidade
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
    if (costTypeSelect) costTypeSelect.value = cost.type ?? 'fixo';
    if (costAmountInput) costAmountInput.value = Math.abs(cost.amount ?? 0);
    if (costOriginSelect) costOriginSelect.value = cost.origem ?? 'Outros';
    if (costStatusPadraoSelect) costStatusPadraoSelect.value = cost.statusPadrao ?? 'OK';
    if (costStartMonthInput) costStartMonthInput.value = cost.startMonth ?? getCurrentMonthYYYYMM();
    if (costEndMonthInput) costEndMonthInput.value = cost.endMonth ?? '';

    expandCostRecurringForm();
    showToast('Editando recorrência...');
    if (costDescriptionInput) costDescriptionInput.focus();
}

function syncExistingTransactionsForRecurringCost(cost, fromMonthYYYYMM) {
    if (!cost) return;

    const start = fromMonthYYYYMM || (costMonthInput?.value ? costMonthInput.value : getCurrentMonthYYYYMM());
    const to = addMonthsToMonthYYYYMM(start, POST_HORIZON_MONTHS);

    // Se virou variável, remove overrides fixos manuais daquela recorrência
    if (cost.type !== 'fixo') {
        transactions = transactions.filter(tx => {
            const m = tx.meta || {};
            return !(
                m.type === 'manual_transaction' &&
                m.recurringCostId === cost.id &&
                m.manualOverrideFor === 'fixo'
            );
        });
    }

    // Remove materializações de recorrência (recurring_cost) que ficaram inválidas no horizonte
    transactions = transactions.filter(tx => {
        const m = tx.meta || {};
        if (m.type !== 'recurring_cost' || m.recurringCostId !== cost.id) return true;
        if (!m.month || m.month < start || m.month > to) return true;

        if (!isCostActiveForMonth(cost, m.month)) return false;
        if (cost.type === 'fixo') {
            const hasFixedOverride = getFixedManualOverrideAmount(cost.id, m.month) !== null;
            if (hasFixedOverride) return false;
        }
        return true;
    });

    // (Re)materializa para todos os meses ativos no horizonte
    for (const monthYYYYMM of iterateMonthsInclusive(start, to)) {
        if (!isCostActiveForMonth(cost, monthYYYYMM)) continue;

        if (cost.type === 'variavel') {
            const amountAbs = getVariableOverrideAmount(cost.id, monthYYYYMM) ?? 0;
            upsertCostTransaction(cost, monthYYYYMM, amountAbs);
        } else {
            const hasOverride = getFixedManualOverrideAmount(cost.id, monthYYYYMM) !== null;
            if (!hasOverride) {
                upsertCostTransaction(cost, monthYYYYMM, Math.abs(cost.amount ?? 0));
            } else {
                // garante que recurring_cost não exista enquanto o override manual está presente
                transactions = transactions.filter(tx => {
                    const m = tx.meta || {};
                    return !(
                        m.type === 'recurring_cost' &&
                        m.recurringCostId === cost.id &&
                        m.month === monthYYYYMM
                    );
                });
            }
        }
    }
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
        if (!m) return true;
        if (m.type === 'recurring_cost' && m.recurringCostId === costId) return false;
        if (m.type === 'manual_transaction' && m.manualOverrideFor === 'fixo' && m.recurringCostId === costId) return false;
        return true;
    });

    setJSONToLocalStorage(STORAGE_KEYS.recurringCosts, recurringCosts);
    setJSONToLocalStorage(STORAGE_KEYS.variableCostOverrides, variableCostOverrides);
    saveTransactionsToLocalStorage(transactions);

    if (editingRecurringCostId === costId) resetCostRecurringFormMode();

    if (costMonthInput && costMonthInput.value) {
        renderRecurringCostsForMonth(costMonthInput.value);
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
        let amount = 0;
        if (cost.type === 'fixo') {
            amount = getFixedManualOverrideAmount(cost.id, monthYYYYMM) ?? Math.abs(cost.amount ?? 0);
        } else {
            // variável: por padrão é 0.00; se existir override no mês, usa ele
            amount = overridesMap.has(cost.id) ? Math.abs(overridesMap.get(cost.id)) : 0;
        }

        total += amount;
        const areaName = cost.area ? String(cost.area) : 'Sem área';
        const origemName = cost.origem ? String(cost.origem) : 'Outros';
        const statusName = isVariableTipoCode(cost.type) ? 'OK' : (cost.statusPadrao ?? 'OK');

        const li = document.createElement('li');
        li.className = 'cost-item';

        li.innerHTML = `
            <div class="cost-left">
                <div class="cost-description">${cost.description}</div>
                <div class="cost-meta">Tipo: ${getTipoLabel(cost.type)} | Origem: ${origemName} | Status: ${statusName} | Área: ${areaName}</div>
            </div>
            <div class="cost-right">
                <div class="cost-value">
                    <div class="cost-amount-input-wrap">
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            class="recurring-amount-input"
                            data-cost-id="${cost.id}"
                            value="${amount.toFixed(2)}"
                        />
                    </div>
                </div>

                <div class="cost-actions" aria-hidden="true">
                    <button class="icon-action-btn" type="button" onclick="startEditRecurringCost(${cost.id})" aria-label="Editar recorrência">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M12 20h9"></path>
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
                        </svg>
                        <span class="btn-text">Editar</span>
                    </button>
                    <button class="icon-action-btn recurring-remove-btn" type="button" onclick="removeRecurringCost(${cost.id})" aria-label="Remover recorrência">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M3 6h18"></path>
                            <path d="M8 6V4h8v2"></path>
                            <path d="M19 6l-1 14H6L5 6"></path>
                            <path d="M10 11v6"></path>
                            <path d="M14 11v6"></path>
                        </svg>
                        <span class="btn-text">Remover</span>
                    </button>
                </div>
            </div>
        `;

        const input = li.querySelector('.recurring-amount-input');
        if (input) {
            input.addEventListener('change', (e) => {
                const value = +e.target.value;
                const clean = Number.isFinite(value) ? Math.abs(value) : 0;

                if (cost.type === 'variavel') {
                    setVariableOverrideAmount(cost.id, monthYYYYMM, clean);
                    upsertCostTransaction(cost, monthYYYYMM, clean);
                } else {
                    upsertFixedManualOverrideTransaction(cost, monthYYYYMM, clean);
                    saveTransactionsToLocalStorage(transactions);
                }

                init();
                renderRecurringCostsForMonth(monthYYYYMM);
                const anaMonthInput = document.getElementById('analytics-month');
                if (anaMonthInput && anaMonthInput.value === monthYYYYMM && typeof renderAnalyticsForMonth === 'function') {
                    renderAnalyticsForMonth(monthYYYYMM);
                }

                if (postMonthCostsHint) {
                    postMonthCostsHint.textContent = 'Valor atualizado no histórico para o mês selecionado.';
                }
            });
        }

        recurringCostList.appendChild(li);
    });

    monthlyTotalEl.textContent = `R$ ${total.toFixed(2)}`;
}

function postMonthCostsToHistory() {
    const fromMonthYYYYMM = costMonthInput ? costMonthInput.value : '';
    if (!fromMonthYYYYMM) return;

    const toMonthYYYYMM = addMonthsToMonthYYYYMM(fromMonthYYYYMM, POST_HORIZON_MONTHS);

    // Limpa materializações antigas dentro do horizonte quando a recorrência não está ativa mais.
    transactions = transactions.filter(tx => {
        const m = tx.meta || {};
        if (m.type === 'recurring_cost') {
            if (!m.month || m.month < fromMonthYYYYMM || m.month > toMonthYYYYMM) return true;
            const cost = recurringCosts.find(c => c.id === m.recurringCostId);
            if (!cost) return false;
            return isCostActiveForMonth(cost, m.month);
        }
        if (m.type === 'manual_transaction' && m.manualOverrideFor === 'fixo') {
            if (!m.month || m.month < fromMonthYYYYMM || m.month > toMonthYYYYMM) return true;
            const cost = recurringCosts.find(c => c.id === m.recurringCostId);
            if (!cost) return false;
            return isCostActiveForMonth(cost, m.month);
        }
        return true;
    });

    // (Re)materializa para todos os meses futuros onde a recorrência está ativa
    for (const cost of recurringCosts) {
        for (const monthYYYYMM of iterateMonthsInclusive(fromMonthYYYYMM, toMonthYYYYMM)) {
            if (!isCostActiveForMonth(cost, monthYYYYMM)) continue;

            if (cost.type === 'variavel') {
                const amountAbs = getVariableOverrideAmount(cost.id, monthYYYYMM) ?? 0;
                upsertCostTransaction(cost, monthYYYYMM, amountAbs);
            } else {
                const hasOverride = getFixedManualOverrideAmount(cost.id, monthYYYYMM) !== null;
                if (hasOverride) {
                    // garante que não existe recurring_cost materializado para esse mês
                    transactions = transactions.filter(tx => {
                        const m = tx.meta || {};
                        return !(
                            m.type === 'recurring_cost' &&
                            m.recurringCostId === cost.id &&
                            m.month === monthYYYYMM
                        );
                    });
                } else {
                    upsertCostTransaction(cost, monthYYYYMM, Math.abs(cost.amount ?? 0));
                }
            }
        }
    }

    init();
    if (postMonthCostsHint) postMonthCostsHint.textContent = 'Custos lançados/atualizados no histórico (futuros)!';
    showToast('Custos lançados no histórico com sucesso!');

    const anaMonth = document.getElementById('analytics-month');
    if (anaMonth && anaMonth.value && typeof renderAnalyticsForMonth === 'function' && anaMonth.value === fromMonthYYYYMM) {
        renderAnalyticsForMonth(fromMonthYYYYMM);
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

    // Render inicial das recorrências
    renderRecurringCostsForMonth(costMonthInput.value);
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
        // para este modelo simplificado, respeitamos o status padrão selecionado

        if (!description || !type || !origem || !startMonth || !Number.isFinite(amount)) {
            setInvalid(costAmountInput, true);
            alert('Preencha descrição, tipo, valor, origem e mês de início.');
            return;
        }
        setInvalid(costAmountInput, false);

        const area = costAreaInput ? costAreaInput.value.trim() : '';
        const storedAmount = type === 'variavel' ? 0 : Math.abs(amount);

        const isEditing = editingRecurringCostId !== null;
        const target = isEditing ? recurringCosts.find(c => c.id === editingRecurringCostId) : null;

        if (isEditing && target) {
            const wasVariable = isVariableTipoCode(target.type);
            const willBeVariable = isVariableTipoCode(type);

            target.description = description;
            target.type = type;
            target.amount = storedAmount;
            target.area = area;
            target.startMonth = startMonth;
            target.endMonth = endMonth;
            target.origem = origem;
            target.statusPadrao = statusPadrao;

            if (wasVariable && !willBeVariable) {
                variableCostOverrides = variableCostOverrides.filter(o => o.costId !== target.id);
                setJSONToLocalStorage(STORAGE_KEYS.variableCostOverrides, variableCostOverrides);
            }

            setJSONToLocalStorage(STORAGE_KEYS.recurringCosts, recurringCosts);
            syncExistingTransactionsForRecurringCost(target, costMonthInput?.value);
            init();
        } else {
            const recurringCost = {
                id: generateID(),
                description,
                type,
                amount: storedAmount,
                area,
                startMonth,
                endMonth,
                origem,
                statusPadrao
            };

            recurringCosts.push(recurringCost);
            setJSONToLocalStorage(STORAGE_KEYS.recurringCosts, recurringCosts);
            syncExistingTransactionsForRecurringCost(recurringCost, costMonthInput?.value);
        }

        // Re-renderiza a lista do mês atual
        if (costMonthInput) {
            renderRecurringCostsForMonth(costMonthInput.value);
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

    function addExpenseAreas(areaKey, origem, status, amountAbs) {
        const s = status ?? 'OK';
        if (s === 'Pendente') return;
        const a = areaKey ? String(areaKey) : 'Sem área';
        const o = origem ? String(origem) : 'Outros';
        const amt = Math.abs(Number(amountAbs) || 0);
        if (!amt) return;

        areaTotals.set(a, (areaTotals.get(a) || 0) + amt);
        originTotals.set(o, (originTotals.get(o) || 0) + amt);
    }

    function addTypeTotal(tipoCode, amountAbs) {
        const amt = Math.abs(Number(amountAbs) || 0);
        if (!amt) return;
        const tipoLabel = getTipoLabel(tipoCode);
        typeTotals.set(tipoLabel, (typeTotals.get(tipoLabel) || 0) + amt);
    }

    // Recorrentes (previsto/esperado para o mês) + overrides de mês
    const activeCosts = recurringCosts.filter(c => isCostActiveForMonth(c, monthYYYYMM));
    activeCosts.forEach(cost => {
        let amountAbs;
        if (cost.type === 'fixo') {
            amountAbs = getFixedManualOverrideAmount(cost.id, monthYYYYMM);
            if (amountAbs === null) amountAbs = Math.abs(cost.amount ?? 0);
        } else {
            // variável: por padrão é 0.00; se existir override no mês, usa
            amountAbs = getVariableOverrideAmount(cost.id, monthYYYYMM) ?? 0;
        }

        const status = cost.type === 'variavel' ? 'OK' : (cost.statusPadrao ?? 'OK');
        if ((status ?? 'OK') === 'Pendente') return;

        // Para áreas e origens, entram só despesas (recorrências)
        addExpenseAreas(cost.area, cost.origem, status, amountAbs);
        addTypeTotal(cost.type, amountAbs);
    });

    // Lançamentos manuais
    const manualTxs = (transactions || []).filter(t => {
        const meta = t.meta || {};
        return meta.type === 'manual_transaction' && meta.month === monthYYYYMM;
    });

    manualTxs.forEach(tx => {
        const meta = tx.meta || {};
        // override fixo já foi contabilizado como recorrência (matriz)
        if (meta.manualOverrideFor === 'fixo' && meta.recurringCostId) return;

        const status = meta.status ?? 'OK';
        if (status === 'Pendente') return;

        const amountAbs = Math.abs(Number(tx.amount) || 0);
        if (!amountAbs) return;

        const cashType = meta.tipo === 'receita' || tx.amount > 0 ? 'receita' : 'despesa';
        addTypeTotal(cashType, amountAbs);

        // Áreas e origens: apenas despesas
        if (cashType === 'despesa') {
            addExpenseAreas(tx.area, meta.origem ?? getOrigemLabel(meta), status, amountAbs);
        }
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
        'Fixo': '#4dabf7',
        'Variável': '#20c997',
        'Despesa': '#ffd43b',
        'Receita': '#51cf66'
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
                legend: { position: 'bottom', labels: { color: '#0f172a' } },
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
        const barCategories = ['Fixo', 'Variável', 'Despesa', 'Receita'];
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
                        ticks: { color: '#0f172a' },
                        grid: { color: 'rgba(15,23,42,0.08)' }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#0f172a' },
                        grid: { color: 'rgba(15,23,42,0.08)' }
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

// (Cartões removidos) Sem inicialização extra no final do arquivo
