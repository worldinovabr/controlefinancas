"use strict";
const KEY = 'simple_dashboard_tx';
function $(s) { return document.querySelector(s); }
const recentBox = $('#recent-box');
const saldoEl = $('#saldo');
const cardSaldo = $('#card-saldo');
const cardRenda = $('#card-renda');
const cardGastos = $('#card-gastos');
const cardTaxa = $('#card-taxa');
const monthGastos = $('#month-gastos');
const monthTx = $('#month-transacoes');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const txForm = document.getElementById('tx-form');
const txType = document.getElementById('tx-type');
const txDesc = document.getElementById('tx-desc');
const txValue = document.getElementById('tx-value');
const txInstallmentsTotal = document.getElementById('tx-installments-total');
const txInstallmentsPaid = document.getElementById('tx-installments-paid');
const txPerInstallment = document.getElementById('tx-per-installment');
const txDueDate = document.getElementById('tx-due-date');
const cancelBtn = document.getElementById('cancel');
let txs = [];
// PWA install prompt handling
let deferredPrompt = null;
const installBtn = document.getElementById('btn-install');
function showInstallButton() {
    if (!installBtn) return;
    installBtn.classList.remove('hidden');
    installBtn.setAttribute('aria-hidden', 'false');
}
function hideInstallButton() {
    if (!installBtn) return;
    installBtn.classList.add('hidden');
    installBtn.setAttribute('aria-hidden', 'true');
}
// Listener: when the browser fires beforeinstallprompt, capture it and show our button
window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    deferredPrompt = e;
    showInstallButton();
});
// If app is already installed, hide the button
window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hideInstallButton();
});

// Register service worker for offline support and to meet PWA requirements
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(reg => {
            console.log('Service worker registered:', reg.scope);
        }).catch(err => console.warn('Service worker registration failed:', err));
    });
}
// Click handler for our install button
if (installBtn) {
    installBtn.addEventListener('click', async () => {
        // If we have a deferred prompt (Chrome, Edge, Android), show it
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const choiceResult = await deferredPrompt.userChoice;
            if (choiceResult.outcome === 'accepted') {
                console.log('User accepted the A2HS prompt');
            }
            else {
                console.log('User dismissed the A2HS prompt');
            }
            deferredPrompt = null;
            hideInstallButton();
            return;
        }
    });

    // In-app one-time install banner shown on first open (session-based)
    function createInstallBanner(){
            if(sessionStorage.getItem('install_banner_shown')) return null;
            const b = document.createElement('div');
            b.className = 'install-banner';
            b.innerHTML = `
                <div class="install-banner-inner">
                    <div class="install-banner-text">Deseja instalar o app Controle Financeiro para acessar rapidamente?</div>
                    <div class="install-banner-actions">
                        <button class="btn small btn-install-now">Instalar</button>
                        <button class="btn small btn-install-dismiss">Fechar</button>
                    </div>
                </div>`;
            document.body.appendChild(b);
            // mark shown for this session
            sessionStorage.setItem('install_banner_shown', '1');
            // wiring
            b.querySelector('.btn-install-dismiss').addEventListener('click', ()=> b.remove());
            b.querySelector('.btn-install-now').addEventListener('click', async ()=>{
                    // prefer deferredPrompt if available
                    if(deferredPrompt){
                            deferredPrompt.prompt();
                            const choice = await deferredPrompt.userChoice;
                            deferredPrompt = null;
                            b.remove();
                            hideInstallButton();
                            return;
                    }
                    // iOS fallback
                    if(/iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase()) && !window.matchMedia('(display-mode: standalone)').matches){
                            const t = document.createElement('div');
                            t.className = 'install-tooltip';
                            t.innerHTML = 'Toque em <strong>Compartilhar</strong> e depois <strong>Adicionar à Tela de Início</strong>.';
                            document.body.appendChild(t);
                            setTimeout(()=>t.remove(),6000);
                            return;
                    }
                    // fallback: show the header install button as a hint
                    showInstallButton();
            });
            return b;
    }

    // show banner on load (if not installed and not already shown this session)
    window.addEventListener('load', ()=>{
            // do not show if already installed / display-mode is standalone
            if(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return;
            createInstallBanner();
    });
}
function load() {
    try {
        const raw = localStorage.getItem(KEY);
        txs = raw ? JSON.parse(raw) : [];
    }
    catch (e) {
        txs = [];
    }
    // reclassify all existing transactions using current rules (overwrite previous categories)
    txs = txs.map(orig => {
        // determine if stored object actually had a dueDate (user explicitly set it)
        const hadDue = Object.prototype.hasOwnProperty.call(orig, 'dueDate') && !!orig.dueDate;
        const t = { ...orig };
        t.category = categorize(t.desc || '', t.type);
    t.installmentsTotal = t.installmentsTotal || undefined;
    t.installmentsPaid = t.installmentsPaid || 0;
    // preserve null explicitly if present; otherwise keep value or undefined
    t.perInstallment = Object.prototype.hasOwnProperty.call(orig, 'perInstallment') ? orig.perInstallment : undefined;
        // only preserve dueDate when it was actually present in storage (explicit)
        t.dueDate = hadDue ? orig.dueDate : undefined;
        t._dueDateExplicit = orig._dueDateExplicit === true || hadDue;
        return t;
    });
    // One-time migration: if there are transactions with legacy `date` but not a stored dueDate,
    // convert them to ISO dueDate but do NOT mark them as 'explicit' — we only want items
    // to appear in Upcoming when the user actually provided a due date.
    let migrated = 0;
    txs = txs.map(t => {
        // Only migrate legacy `date` -> `dueDate` once. Use a marker `_migratedFromDate`
        // so that if the user later clears the due date we don't re-create it again.
        if (!t._dueDateExplicit && !t._migratedFromDate && t.date && !t.dueDate) {
            const parts = (t.date || '').split('/');
            if (parts.length === 3) {
                t.dueDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                // mark migrated so we don't reapply this conversion repeatedly
                t._migratedFromDate = true;
                // IMPORTANT: do not set t._dueDateExplicit here. Keep it false so Upcoming
                // only shows items where the user explicitly entered a due date.
                migrated++;
            }
        }
        return t;
    });
    // Sanitize legacy-converted dueDates: if a transaction has a dueDate but it's
    // identical to a straightforward conversion from its old `date` field and
    // was not explicitly set by the user, treat it as migrated and remove it so
    // it won't reappear in Upcoming unless the user re-adds and saves a due date.
    txs = txs.map(t => {
        try {
            if (t.dueDate && !t._dueDateExplicit && t.date) {
                const parts = (t.date || '').split('/');
                if (parts.length === 3) {
                    const conv = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                    if (conv === t.dueDate) {
                        // this was auto-created from the legacy `date` -> remove it
                        delete t.dueDate;
                        t._migratedFromDate = true;
                    }
                }
            }
        }
        catch (e) { }
        return t;
    });
    if (migrated > 0)
        console.info(`Migrated ${migrated} transactions: converted legacy date -> dueDate (kept non-explicit)`);
    try {
        save();
    }
    catch (e) { }
    render();
}
function categorize(desc, type) {
    const s = (desc || '').toLowerCase();
    if (type === 'income') {
        if (/sal[aá]r/i.test(s) || s.includes('salario') || s.includes('salário'))
            return 'Salário';
        if (s.includes('freel') || s.includes('freela') || s.includes('projeto'))
            return 'Freelance';
        return 'Outros';
    }
    // credit card bills and bank/card institutions (faturas, cartões, bancos)
    if (s.match(/cart(ã|a)o|cartao|fatura|faturas|nubank|itau|bradesco|santander|caixa|banco|visa|mastercard|elo|amex/))
        return 'Cartão';
    // expense categories by keywords
    if (s.match(/supermercad|mercad|mercearia|padaria/))
        return 'Alimentação';
    if (s.match(/restaurante|lanchonete|bar|delivery|pizza|burger/))
        return 'Alimentação';
    if (s.match(/uber|taxi|ônibus|onibus|metr[oó]|transporte|combust(í|i)vel|gasolina|carro|moto|motocicleta|bicicleta|financi/))
        return 'Transporte';
    if (s.match(/aluguel|condom[inio]/))
        return 'Moradia';
    // utilities and household expenses -> Casa
    if (s.match(/luz|energia|agua|água|internet|iptu/))
        return 'Casa';
    if (s.match(/farmacia|rem[eé]dio|doutor|hospital|cl[ií]nica/))
        return 'Saúde';
    if (s.match(/cinema|netflix|spotify|ingresso|teatro|jogo|bar/))
        return 'Lazer';
    if (s.match(/curso|escola|facul|faculdade|livro/))
        return 'Educação';
    if (s.match(/roupa|vestu[rú]ario|zapatos|sapato/))
        return 'Vestuário';
    if (s.match(/compra|loja|shopping|amazon|mercado livre|mercadolivre/))
        return 'Compras';
    return 'Outros';
}
function categoryIcon(category) {
    const c = (category || '').toLowerCase();
    // Use Icons8 3D colored icons (hotlink). These are lightweight PNG/PNG-like SVG hosted on icons8.
    // We choose representative 3D icons for the most common categories. Return an <img> tag string.
    // NOTE: If offline, these will fallback to broken image; user can locally download icons later.
    // Use icons8 3d-fluency endpoints without explicit color segment to avoid 404s
    // add onerror fallback to color icons if 3D assets are blocked / 404
    if (/sal[aá]rio|salario|salário/.test(c))
        return `<img class="cat-img" src="https://img.icons8.com/3d-fluency/48/money-bag.png" onerror="this.onerror=null;this.src='https://img.icons8.com/color/48/money-bag.png'" alt="Salário"/>`;
    if (/casa|moradia/.test(c))
        return `<img class="cat-img" src="https://img.icons8.com/3d-fluency/48/home.png" onerror="this.onerror=null;this.src='https://img.icons8.com/color/48/home.png'" alt="Casa"/>`;
    if (/cart(ã|a)o|cartao|fatura|faturas|nubank|itau|bradesco|santander|caixa|banco|visa|mastercard|elo|amex/.test(c))
        return `<img class="cat-img" src="https://img.icons8.com/?size=100&id=5s14FYPGstpM&format=png&color=000000" onerror="this.onerror=null;this.src='data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'%23111\'><rect x=\'1\' y=\'5\' width=\'22\' height=\'14\' rx=\'2\'/><rect x=\'3\' y=\'8\' width=\'6\' height=\'2\' fill=\'%23fff\'/><rect x=\'3\' y=\'12\' width=\'8\' height=\'2\' fill=\'%23fff\'/></svg>'" alt="Cartão"/>`;
    if (/transporte|carro|moto|bicicleta|gasolina|financi/.test(c))
        return `<img class="cat-img" src="https://img.icons8.com/3d-fluency/48/car.png" onerror="this.onerror=null;this.src='https://img.icons8.com/color/48/car.png'" alt="Transporte"/>`;
    if (/alimentação|mercad|restaurante|padaria|delivery|pizza|burger/.test(c))
        return `<img class="cat-img" src="https://img.icons8.com/3d-fluency/48/food.png" alt="Alimentação"/>`;
    if (/compras|compra|loja|shopping|amazon|mercado livre|mercadolivre/.test(c))
        return `<img class="cat-img" src="https://img.icons8.com/3d-fluency/48/shopping-bag.png" alt="Compras"/>`;
    if (/saúde|farmacia|rem[eé]dio|hospital|cl[ií]nica/.test(c))
        return `<img class="cat-img" src="https://img.icons8.com/3d-fluency/48/health-book.png" alt="Saúde"/>`;
    // fallback generic icon
    return `<img class="cat-img" src="https://img.icons8.com/3d-fluency/48/info.png" alt="Outros"/>`;
}
function save() {
    try {
        localStorage.setItem(KEY, JSON.stringify(txs));
    }
    catch (e) { }
}
function formatMoney(v) {
    return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function calc() {
    const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.value, 0);
    const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.value, 0);
    const saldo = income - expense;
    const taxa = income === 0 ? 0 : Math.round(((income - expense) / income) * 1000) / 10;
    return { income, expense, saldo, taxa };
}
function render() {
    const { income, expense, saldo, taxa } = calc();
    saldoEl.textContent = formatMoney(saldo);
    cardSaldo.textContent = `R$ ${formatMoney(saldo)}`;
    cardRenda.textContent = `R$ ${formatMoney(income)}`;
    cardGastos.textContent = `R$ ${formatMoney(expense)}`;
    cardTaxa.textContent = `${taxa.toFixed(1)}%`;
    // compute actual gastos for current month by summing installments due this month
    const now = new Date();
    const currentMonthExpense = txs.reduce((sum, t) => {
    if (!t._dueDateExplicit && !t.dueDate)
            return sum;
        const startDt = getStartDate(t);
        if (t.installmentsTotal && t.installmentsTotal > 1 && t.perInstallment) {
            // check if any installment for this tx falls in current month
            for (let k = 0; k < t.installmentsTotal; k++) {
                const instDt = new Date(startDt.getFullYear(), startDt.getMonth() + k, startDt.getDate());
                if (instDt.getFullYear() === now.getFullYear() && instDt.getMonth() === now.getMonth()) {
                    sum += (t.perInstallment || 0);
                }
            }
        }
        else {
            // single payment: include if date in current month
            if (startDt.getFullYear() === now.getFullYear() && startDt.getMonth() === now.getMonth())
                sum += t.value;
        }
        return sum;
    }, 0);
    monthGastos.textContent = `R$ ${formatMoney(currentMonthExpense)}`;
    monthTx.textContent = `${txs.length}`;
    recentBox.innerHTML = '';
    if (txs.length === 0) {
        recentBox.innerHTML = `<div class="empty">Nenhuma transação encontrada<br><small>Adicione sua primeira renda ou gasto para começar</small></div>`;
        return;
    }
    txs.slice().reverse().forEach(t => {
        const div = document.createElement('div');
        div.className = 'tx';
    let installmentInfo = '';
        let rightAmount = t.value;
    // Only build installment info for expenses; incomes should only show the date
    if (t.type === 'expense') {
            const hasInst = t.installmentsTotal !== undefined && t.installmentsTotal !== null && t.installmentsTotal !== '';
            if (!hasInst) {
                        // user didn't provide installments: show zeros
                        installmentInfo = `
                            <div class="meta">Parcelas: 0/0</div>
                            <div class="meta">Pagas: 0</div>
                            <div class="meta">Faltam: 0</div>
                            <div class="meta">Total a pagar: R$ ${formatMoney(t.value)}</div>
                        `;
                        rightAmount = t.value;
            }
            else {
                const totalInst = Number(t.installmentsTotal || 0);
                const paid = Number(t.installmentsPaid || 0);
                if (totalInst > 1) {
                    // per-installment: prefer explicit perInstallment, otherwise assume t.value is TOTAL and divide by installments
                    const per = Number((t.perInstallment !== undefined && t.perInstallment !== null && t.perInstallment !== '') ? t.perInstallment : (t.value / totalInst));
                    const left = Math.max(0, totalInst - paid);
                    const remaining = per * left;
                    // Build multi-line installment info using the requested labels
                    const parcelasLine = `${paid}/${totalInst}`;
                    installmentInfo = `
                        <div class="meta">Parcelas: ${parcelasLine}</div>
                        <div class="meta">Pagas: ${paid}</div>
                        <div class="meta">Faltam: ${left}</div>
                        <div class="meta">Total a pagar: R$ ${formatMoney(remaining)}</div>
                    `;
                    // show remaining total on the right column so it's clearly visible
                    rightAmount = left > 0 ? remaining : t.value;
                }
                else {
                    // single installment provided (or totalInst === 1)
                    const paidSingle = Number(t.installmentsPaid || 0);
                    installmentInfo = `
                        <div class="meta">Parcelas: 1/1</div>
                        <div class="meta">Pagas: ${paidSingle}</div>
                        <div class="meta">Faltam: ${Math.max(0, 1 - paidSingle)}</div>
                        <div class="meta">Total a pagar: R$ ${formatMoney(t.value)}</div>
                    `;
                    rightAmount = t.value;
                }
            }
    }
            const dueLabel = (t._dueDateExplicit && t.dueDate) ? (() => { const p = t.dueDate.split('-'); if (p.length === 3)
                return `${p[2]}/${p[1]}/${p[0]}`; return t.dueDate; })() : '';
        // Only show vencimento for expenses when the user explicitly set a dueDate
        const vencLine = (t.type === 'expense' && t._dueDateExplicit && dueLabel) ? `<div class="meta">Venc.: ${dueLabel}</div>` : '';
            // Only show Data if transaction has a stored date
            const dateLine = t.date ? `<div class="meta">Data: ${t.date}</div>` : '';
        // For single-payment transactions, only show total if it's an expense
            const singleMeta = (t.type === 'expense') ? `
                <div class="meta">Parcelas: 1/1</div>
                <div class="meta">Pagas: ${t.installmentsPaid || 0}</div>
                <div class="meta">Faltam: ${Math.max(0, 1 - (t.installmentsPaid || 0))}</div>
                <div class="meta">Total a pagar: R$ ${formatMoney(t.value)}</div>
            ` : '';
        div.innerHTML = `
            <div>
                <div class="cat-inline">${categoryIcon(t.category)} <strong class="cat-name">${t.category || '—'}</strong></div>
                <strong>${t.desc}</strong>
        ${dateLine}
        ${vencLine}
            ${installmentInfo || (t.type === 'expense' ? singleMeta : '')}
            </div>
            <div style="text-align:right">
        <div style="color:${t.type === 'expense' ? 'var(--danger)' : 'var(--accent)'}">R$ ${formatMoney(rightAmount)}</div>
                <div class="tx-actions">
                    <button class="btn" title="Editar" onclick="editTx('${t.id}')">✏️</button>
                    <button class="btn" title="Remover" onclick="removeTx('${t.id}')">🗑️</button>
                </div>
            </div>
        `;
        recentBox.appendChild(div);
    });
    renderUpcoming();
}
function getStartDate(t) {
    // prefer explicit dueDate (ISO yyyy-mm-dd from input[type=date]) otherwise parse displayed date (dd/mm/yyyy)
    if (t.dueDate) {
        const parts = (t.dueDate || '').split('-');
        if (parts.length === 3)
            return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }
    const parts = (t.date || '').split('/');
    if (parts.length === 3)
        return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    return new Date();
}
function renderUpcoming() {
    const el = document.getElementById('upcoming-notices');
    if (!el)
        return;
    // collect upcoming unpaid installments: {id, desc, dueDate, daysLeft, amount}
    const list = [];
    // prefer network time (more trustworthy than client clock) with local fallback
    // prefer network time (more trustworthy than client clock) with local fallback
    async function getNetworkNow() {
        try {
            const res = await fetch('https://worldtimeapi.org/api/ip');
            if (!res.ok)
                throw new Error('ntp fetch failed');
            const j = await res.json();
            if (j && j.datetime)
                return new Date(j.datetime);
        }
        catch (e) { /* ignore and fallback */ }
        return new Date();
    }
    // Helper: render using a provided 'today' so we can render immediately with local time
    function renderWithToday(today) {
        // compute unpaid installments for all expense transactions (no -30d cutoff)
        const totalTxs = txs.length;
        const expenseCount = txs.filter(x => x.type === 'expense').length;
        const explicitCount = txs.filter(x => x._dueDateExplicit).length;
        let upcomingFound = 0;
        const localList = [];
        txs.forEach(t => {
            // Only include expenses where the user explicitly set a due date.
            // We do not show incomes or other types even if they have a dueDate.
            if (t.type !== 'expense') return;
            if (!t._dueDateExplicit || !t.dueDate) return;
            const startDt = getStartDate(t);
            const totalInst = t.installmentsTotal && t.installmentsTotal > 1 ? t.installmentsTotal : 1;
            const per = t.perInstallment || (t.value / totalInst);
            const paid = t.installmentsPaid || 0;
                // compute remaining installments count and remaining total
                const remainingCount = Math.max(0, totalInst - paid);
                const remainingTotal = per * remainingCount;
                let addedAny = false;
                for (let k = paid; k < totalInst; k++) {
                    const instDt = new Date(startDt.getFullYear(), startDt.getMonth() + k, startDt.getDate());
                    const diff = Math.ceil((instDt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    // only include installments that are today..31 days ahead
                    if (diff >= 0 && diff <= 31) {
                        localList.push({ id: t.id, desc: t.desc, due: instDt, days: diff, amount: per, category: t.category, remainingCount, remainingTotal });
                        upcomingFound++;
                        addedAny = true;
                    }
                }
                // Fallback: if no installment fell into the 0..31 window but the next unpaid
                // installment (based on startDt + paid months) is within the window, include it.
                if (!addedAny && paid < totalInst) {
                    const nextIdx = paid;
                    const nextDt = new Date(startDt.getFullYear(), startDt.getMonth() + nextIdx, startDt.getDate());
                    const nextDiff = Math.ceil((nextDt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    if (nextDiff >= 0 && nextDiff <= 31) {
                        localList.push({ id: t.id, desc: t.desc, due: nextDt, days: nextDiff, amount: per, category: t.category, remainingCount, remainingTotal });
                        upcomingFound++;
                    }
                }
        });
        // sort by due date ascending
        localList.sort((a, b) => a.due.getTime() - b.due.getTime());
        // show list
        if (localList.length === 0) {
              el.innerHTML = `<div class="notice">Sem vencimentos próximos</div>`;
            return;
        }
                el.innerHTML = localList.map(it => {
                        const d = it.due;
                        const label = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
                        const daysText = it.days > 0 ? `${it.days} dias` : (it.days === 0 ? 'hoje' : `${Math.abs(it.days)} dias atras`);
                        const urgent = it.days <= 3 ? 'urgent' : '';
                        const icon = categoryIcon(it.category);
                        // show per-installment amount and remaining total to pay (if > 0)
                        const remainingHtml = it.remainingTotal && it.remainingTotal > 0 ? `<div class="meta">Falta pagar: <strong>R$ ${formatMoney(it.remainingTotal)}</strong></div>` : '';
                        // stacked layout: title, amount, due line
                        return `
                            <div class="notice ${urgent}">
                                ${icon}
                                <div class="notice-body">
                                    <div class="notice-title"><strong>${it.desc}</strong></div>
                                    <div class="meta">Valor: R$ ${formatMoney(it.amount)}</div>
                                    ${remainingHtml}
                                    <div class="meta">Vence: ${label} (${daysText})</div>
                                </div>
                            </div>
                        `;
                }).join('');
    }
    // First render immediately using client clock so UI is responsive
    renderWithToday(new Date());
    // Then try to fetch network time and re-render if it differs (to be more accurate)
    (async () => {
        try {
            const net = await getNetworkNow();
            // if date portion differs, re-render
            if (net.toDateString() !== (new Date()).toDateString()) {
                renderWithToday(net);
            }
        }
        catch (e) { /* ignore */ }
    })();
    // No fallback: we intentionally don't list distant/unbounded installments here.
}
function renderAllTransactions() {
    const box = document.getElementById('all-transactions-box');
    if (!box)
        return;
    box.innerHTML = '';
    if (txs.length === 0) {
        box.innerHTML = '<div class="empty">Nenhuma transação registrada</div>';
        return;
    }
        txs.slice().reverse().forEach(t => {
                const row = document.createElement('div');
                row.className = 'tx';
                // build installment block if needed
                let instBlock = '';
                if (t.installmentsTotal && Number(t.installmentsTotal) > 1) {
                        const paid = Number(t.installmentsPaid || 0);
                        const total = Number(t.installmentsTotal || 0);
                        const left = Math.max(0, total - paid);
                        const per = Number((t.perInstallment !== undefined && t.perInstallment !== null && t.perInstallment !== '') ? t.perInstallment : (t.value / total));
                        const remaining = per * left;
                        const current = left > 0 ? (paid + 1) : total;
                        instBlock = `
                                <div class="meta">Parcelas: ${current}/${total}</div>
                                <div class="meta">Pagas: ${paid}</div>
                                <div class="meta">Faltam: ${left}</div>
                                <div class="meta">Total a pagar: R$ ${formatMoney(remaining)}</div>
                        `;
                }
                const dueLabel = t.dueDate ? (() => { const p = (t.dueDate || '').split('-'); if (p.length === 3) return `${p[2]}/${p[1]}/${p[0]}`; return t.dueDate; })() : '';
                const vencLine = dueLabel ? `<div class="meta">Venc.: ${dueLabel}</div>` : `<div class="meta">Venc.: —</div>`;
                row.innerHTML = `
            <div>
                <div class="cat-inline">${categoryIcon(t.category)} <strong class="cat-name">${t.category || '—'}</strong></div>
                <strong>${t.desc}</strong>
                ${vencLine}
                ${instBlock || `<div class="meta">Total a pagar: R$ ${formatMoney(t.value)}</div>`}
            </div>
            <div style="text-align:right">
                <div style="color:${t.type === 'expense' ? 'var(--danger)' : 'var(--accent)'}">R$ ${formatMoney(t.value)}</div>
                <div class="tx-actions">
                    <button class="btn" title="Editar" onclick="editTx('${t.id}')">✏️</button>
                    <button class="btn" title="Remover" onclick="removeTx('${t.id}')">🗑️</button>
                </div>
            </div>
        `;
                box.appendChild(row);
        });
}
window.renderAllTransactions = renderAllTransactions;
window.render = render;
function renderReports() {
    const canvas = document.getElementById('chart-income-expense');
    if (!canvas)
        return;
    if (typeof window.Chart === 'undefined')
        return;
    const startEl = document.getElementById('report-start');
    const endEl = document.getElementById('report-end');
    const startDate = startEl && startEl.value ? new Date(startEl.value) : null;
    const endDate = endEl && endEl.value ? new Date(endEl.value) : null;
    let totalIncome = 0, totalExpense = 0;
    txs.forEach(t => {
        const parts = (t.date || '').split('/');
        let dt = new Date();
        if (parts.length === 3)
            dt = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
        if (startDate && dt < startDate)
            return;
        if (endDate && dt > endDate)
            return;
        if (t.type === 'income')
            totalIncome += t.value;
        else
            totalExpense += t.value;
    });
    if (!window._incomeExpenseChart) {
        const ctx = canvas.getContext('2d');
        window._incomeExpenseChart = new window.Chart(ctx, { type: 'doughnut', data: { labels: ['Renda', 'Gastos'], datasets: [{ data: [totalIncome, totalExpense], backgroundColor: ['rgba(16,185,129,0.8)', 'rgba(239,68,68,0.8)'] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } });
    }
    else {
        const ch = window._incomeExpenseChart;
        ch.data.datasets[0].data = [totalIncome, totalExpense];
        ch.update();
    }
    // category breakdown
    try {
        const catCanvas = document.getElementById('chart-by-category');
        if (catCanvas) {
            // aggregate by month and category
            const byMonthCat = {};
            const monthSet = new Set();
            txs.forEach(t => {
                const startDt = getStartDate(t);
                if (!t._dueDateExplicit && !t.dueDate)
                    return;
                const totalInst = t.installmentsTotal && t.installmentsTotal > 1 ? t.installmentsTotal : 1;
                const per = t.perInstallment || (t.value / totalInst);
                for (let k = 0; k < totalInst; k++) {
                    const instDt = new Date(startDt.getFullYear(), startDt.getMonth() + k, startDt.getDate());
                    if (startDate && instDt < startDate)
                        continue;
                    if (endDate && instDt > endDate)
                        continue;
                    const key = `${instDt.getFullYear()}-${String(instDt.getMonth() + 1).padStart(2, '0')}`;
                    monthSet.add(key);
                    const cat = t.category || 'Outros';
                    byMonthCat[key] = byMonthCat[key] || {};
                    byMonthCat[key][cat] = (byMonthCat[key][cat] || 0) + per;
                }
            });
            const months = Array.from(monthSet).sort();
            // readable labels like MM/YYYY
            const labels = months.map(m => { const [y, mo] = m.split('-'); return `${mo}/${y}`; });
            // determine categories and pick top 6 by total
            const totalsPerCat = {};
            months.forEach(m => {
                const cats = byMonthCat[m] || {};
                Object.keys(cats).forEach(c => totalsPerCat[c] = (totalsPerCat[c] || 0) + cats[c]);
            });
            const categories = Object.keys(totalsPerCat).sort((a, b) => totalsPerCat[b] - totalsPerCat[a]).slice(0, 6);
            const palette = ['#ef4444', '#f97316', '#16a34a', '#0ea5e9', '#7c3aed', '#eab308', '#06b6d4', '#f43f5e'];
            const datasets = categories.map((cat, i) => ({ label: cat, data: months.map(m => (byMonthCat[m] && byMonthCat[m][cat]) ? byMonthCat[m][cat] : 0), borderColor: palette[i % palette.length], backgroundColor: palette[i % palette.length], fill: false, tension: 0.25 }));
            if (!window._categoryChart) {
                const ctx2 = catCanvas.getContext('2d');
                window._categoryChart = new window.Chart(ctx2, {
                    type: 'line',
                    data: { labels, datasets },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { position: 'bottom', labels: { boxWidth: 14, padding: 12 } }, tooltip: { mode: 'nearest', intersect: false } },
                        elements: { point: { radius: 4, hoverRadius: 6 }, line: { borderWidth: 2 } },
                        scales: { y: { beginAtZero: true, grid: { color: 'rgba(15,23,42,0.06)' } }, x: { grid: { display: false }, ticks: { maxRotation: 0 } } }
                    }
                });
            }
            else {
                const ch2 = window._categoryChart;
                ch2.config.type = 'line';
                ch2.data.labels = labels;
                ch2.data.datasets = datasets;
                ch2.options.plugins = ch2.options.plugins || {};
                ch2.options.elements = ch2.options.elements || {};
                ch2.update();
            }
            // legend with totals
            const legendCats = document.getElementById('report-legend-cats');
            if (legendCats) {
                let html = '';
                categories.forEach((c, i) => {
                    html += `<div class="legend-item"><span class="legend-dot" style="background:${palette[i % palette.length]}"></span>${c}: R$ ${formatMoney(totalsPerCat[c] || 0)}</div>`;
                });
                legendCats.innerHTML = html;
            }
        }
    }
    catch (e) {
        console.error(e);
    }
}
window.renderReports = renderReports;
function openModal(type) {
    modal.classList.remove('hidden');
    modalTitle.textContent = type === 'income' ? 'Adicionar Renda' : 'Adicionar Gasto';
    txType.value = type;
    // if editing (tx-id present), don't clear fields so editTx can prefill them
    const existingId = document.getElementById('tx-id').value;
    if (!existingId) {
        txDesc.value = '';
        txValue.value = '';
        txInstallmentsTotal.value = '';
        txInstallmentsPaid.value = '';
        txPerInstallment.value = '';
        if (txDueDate)
            txDueDate.value = '';
    }
        // Atualiza o valor total ao inserir o valor da parcela corretamente
        if (txPerInstallment && txValue && txInstallmentsTotal && txInstallmentsPaid) {
            txPerInstallment.addEventListener('input', function () {
                if (txPerInstallment.value === '') {
                    // Se o campo estiver vazio, não altera o valor
                    return;
                }
                const perValue = parseFloat(txPerInstallment.value.replace(',', '.'));
                const total = parseInt(txInstallmentsTotal.value, 10);
                const paid = parseInt(txInstallmentsPaid.value, 10);
                if (!isNaN(perValue) && !isNaN(total) && !isNaN(paid)) {
                    const left = Math.max(0, total - paid);
                    txValue.value = String(perValue * left);
                }
            });
        }
}
function closeModal() {
    modal.classList.add('hidden');
}
// Functions intended to be called from inline HTML handlers
function addTx(e) {
    e.preventDefault();
    const t = txType.value;
    const desc = txDesc.value.trim();
    const value = Number(txValue.value);
    const instTotal = Number(txInstallmentsTotal.value) || undefined;
    const instPaid = Number(txInstallmentsPaid.value) || 0;
    const perInst = (txPerInstallment.value === '') ? null : Number(txPerInstallment.value);
    const due = txDueDate && txDueDate.value ? txDueDate.value : undefined;
    if (!desc || isNaN(value) || value <= 0)
        return alert('Preencha descrição e valor válido');
    const existingId = document.getElementById('tx-id').value;
    if (existingId) {
        // update
        const idx = txs.findIndex(x => x.id === existingId);
        if (idx !== -1) {
            txs[idx].desc = desc;
            txs[idx].value = value;
            txs[idx].type = t;
            txs[idx].category = categorize(desc, t);
            txs[idx].installmentsTotal = instTotal;
            txs[idx].installmentsPaid = instPaid;
            txs[idx].perInstallment = perInst;
            // If user cleared the due date (due is undefined/empty), remove the property
            // and mark as non-explicit. Only keep dueDate when provided.
            if (due) {
                txs[idx].dueDate = due;
                txs[idx]._dueDateExplicit = (txs[idx].type === 'expense') ? true : true;
            }
            else {
                delete txs[idx].dueDate;
                txs[idx]._dueDateExplicit = false;
            }
        }
    }
    else {
        const tx = { id: Math.random().toString(36).slice(2, 9), type: t, desc, value, date: new Date().toLocaleDateString(), category: categorize(desc, t), installmentsTotal: instTotal, installmentsPaid: instPaid, perInstallment: perInst };
        if (due) {
            tx.dueDate = due;
            tx._dueDateExplicit = (t === 'expense') ? true : true;
        }
        else {
            tx._dueDateExplicit = false;
        }
        txs.push(tx);
    }
    save();
    render();
    closeModal();
}
function editTx(id) {
    const tx = txs.find(t => t.id === id);
    if (!tx)
        return;
    document.getElementById('tx-id').value = tx.id;
    txType.value = tx.type;
    txDesc.value = tx.desc;
    txValue.value = String(tx.value);
    txInstallmentsTotal.value = tx.installmentsTotal ? String(tx.installmentsTotal) : '';
    txInstallmentsPaid.value = tx.installmentsPaid ? String(tx.installmentsPaid) : '';
    txPerInstallment.value = tx.perInstallment ? String(tx.perInstallment) : '';
    if (txDueDate)
        txDueDate.value = tx.dueDate ? tx.dueDate : '';
    openModal(tx.type);
    // Aplica a lógica ao editar também
    if (txPerInstallment && txValue && txInstallmentsTotal && txInstallmentsPaid) {
        txPerInstallment.addEventListener('input', function () {
            if (txPerInstallment.value === '') {
                return;
            }
            const perValue = parseFloat(txPerInstallment.value.replace(',', '.'));
            const total = parseInt(txInstallmentsTotal.value, 10);
            const paid = parseInt(txInstallmentsPaid.value, 10);
            if (!isNaN(perValue) && !isNaN(total) && !isNaN(paid)) {
                const left = Math.max(0, total - paid);
                txValue.value = String(perValue * left);
            }
        });
    }
}
function removeTx(id) {
    txs = txs.filter(t => t.id !== id);
    save();
    render();
}
// expose to global scope for inline handlers
window.openModal = openModal;
window.closeModal = closeModal;
window.addTx = addTx;
window.removeTx = removeTx;
window.editTx = editTx;

// Optional: demo seed for upcoming items. Activate by adding ?demo_upcoming=1 to the URL.
// This is non-destructive: it only seeds when localStorage is empty so it won't overwrite real data.
try{
    if(!localStorage.getItem(KEY) && location.search && location.search.indexOf('demo_upcoming=1')!==-1){
        const now = new Date();
        const due = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3);
        const demo = { id:'demo_'+String(Math.random()).slice(2,8), type:'expense', desc:'Conta de Água (demo)', value:120.00, date: now.toLocaleDateString(), category:'Casa', installmentsTotal:1, installmentsPaid:0, perInstallment:120.00, dueDate: due.toISOString().slice(0,10), _dueDateExplicit:true };
        localStorage.setItem(KEY, JSON.stringify([demo]));
        console.info('Demo upcoming seeded', demo);
    }
}catch(e){/* ignore */}

load();
