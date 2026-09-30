(() => {
    'use strict';
    const app = !!window.electronAPI;
    const tr = (en, ar) => document.body.classList.contains('arabic-mode') ? ar : en;
    const make = (tag, text, className) => {
        const el = document.createElement(tag);
        if (text) el.textContent = text;
        if (className) el.className = className;
        return el;
    };
    const toast = (text, type = 'info') => window.showToast?.(text, type);
    const state = { mode: 'full', payment: null, busy: false, dirty: false, generation: 0, user: '', channel: null };
    const choice = make('fieldset', '', 'payment-choice');
    const full = make('input'); full.type = 'radio'; full.name = 'subscription-payment'; full.value = 'full'; full.checked = true;
    const two = make('input'); two.type = 'radio'; two.name = full.name; two.value = 'installments';
    const fullLabel = make('label'); const fullText = make('span'); fullLabel.append(full, fullText);
    const twoLabel = make('label'); const twoText = make('span'); twoLabel.append(two, twoText);
    const schedule = make('div', '', 'payment-schedule'); schedule.setAttribute('role', 'status');
    choice.append(fullLabel, twoLabel, schedule);
    document.querySelector('#subPayScreen .sub-pay-methods')?.after(choice);
    const badge = make('div', '', 'payment-tier-badge');
    document.querySelector('.tier-card.sparda .tier-details')?.append(badge);
    const yearlyBadge = make('div', '', 'payment-tier-badge');
    document.querySelector('.tier-card.premium.extended-plan .tier-details')?.append(yearlyBadge);

    const panels = [];
    function panelAt(anchor, position) {
        if (!anchor) return;
        const host = make('section', '', 'payment-account');
        const title = make('button', '', 'payment-account-toggle'); title.type = 'button';
        const content = make('div', '', 'payment-account-content');
        const inside = make('div'); content.append(inside); content.inert = true;
        title.addEventListener('click', () => {
            const open = !host.classList.contains('is-open');
            host.classList.toggle('is-open', open); content.inert = !open;
            title.setAttribute('aria-expanded', String(open));
            if (open) refresh();
        });
        title.setAttribute('aria-expanded', 'false'); host.append(title, content);
        anchor[position](host); panels.push({ host, title, inside });
    }
    if (app) panelAt(document.querySelector('#main-section .sub-addon-link-row'), 'after');
    if (app) panelAt(document.getElementById('subscriptionQuickStat')?.parentElement, 'after');

    async function session() {
        const c = await initializeSupabase();
        return c ? (await c.auth.getSession()).data.session : null;
    }
    async function request(query) {
        const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 20000);
        try {
            const { data, error } = await query.abortSignal(controller.signal);
            if (error) throw error;
            return data;
        } finally { clearTimeout(timer); }
    }
    function planInfo() {
        if (_subSelectedPlan === 'son_of_sparda') return { base:600, addon:200, oldAddon:400, years:2, key:'regular_24m_2026', addonKey:'cinema_cloud_24m_sparda' };
        if (_subSelectedPlan === 'dark_slayer') return { base:400, addon:100, oldAddon:200, years:1, key:'regular_12m_2026', addonKey:'cinema_cloud_12m_slayer' };
        return null;
    }
    function amount(total) {
        if (state.payment) return state.payment.payment_sar;
        const plan = planInfo();
        if (!plan) return total;
        const price = plan.base + (_subAddonMode === 'add' ? plan.addon : 0);
        return state.mode === 'installments' ? price / 2 : price;
    }
    function render() {
        if (!document?.body) return;
        const plan = planInfo();
        const selected = !!plan;
        fullText.textContent = tr('Pay In Full', 'دفعة واحدة'); twoText.textContent = tr('2 Payments', 'دفعتان');
        badge.textContent = tr('2 Payments · 300 + 300 SAR', 'دفعتان · 300 + 300 ريال');
        yearlyBadge.textContent = tr('2 Payments · 200 + 200 SAR', 'دفعتان · 200 + 200 ريال');
        for (const p of panels) p.title.textContent = tr('Payments', 'الدفعات');
        choice.hidden = !selected;
        choice.classList.toggle('is-fixed', !!state.payment);
        full.checked = state.mode === 'full'; two.checked = state.mode === 'installments';
        const locked = !!document.getElementById('subBankSubmit')?.disabled || !!state.payment;
        full.disabled = two.disabled = locked;
        const addon = document.getElementById('subAddonAdd');
        if (addon) {
            addon.disabled = locked;
            const price = addon.querySelector('.sub-addon-price');
            if (price) {
                price.replaceChildren();
                if (selected) {
                    const old = make('del', `${plan.oldAddon} SAR`);
                    price.append(old, make('strong', tr(`${plan.addon} SAR / ${plan.years === 1 ? '1 Year' : '2 Years'}`, `${plan.addon} ريال / ${plan.years === 1 ? 'سنة' : 'سنتين'}`)));
                } else price.textContent = tr('100 SAR / 6 Months', '100 ريال / ٦ أشهر');
                price.removeAttribute('data-en'); price.removeAttribute('data-ar');
            }
        }
        schedule.textContent = state.payment
            ? tr(`Second Payment · ${state.payment.payment_sar} SAR`, `الدفعة الثانية · ${state.payment.payment_sar} ريال`)
            : state.mode === 'installments'
                ? tr(`${amount(0)} SAR Now · ${amount(0)} SAR Next Month`, `${amount(0)} ريال الآن · ${amount(0)} ريال الشهر القادم`) : '';
        const label = document.getElementById('subPayPlanLabel');
        if (selected && label) {
            label.textContent = tr(`${plan.years === 1 ? '1 Year' : '2 Years'} · ${amount(0)} SAR${state.mode === 'installments' ? ' Now' : ''}`, `${plan.years === 1 ? 'سنة' : 'سنتان'} · ${amount(0)} ريال`);
            label.removeAttribute('data-en'); label.removeAttribute('data-ar');
        }
        const submit = document.getElementById('subBankSubmit');
        if (submit && !submit.disabled) submit.textContent = subSubmitLabel();
    }
    for (const input of [full, two]) input.addEventListener('change', () => {
        if (state.payment || document.getElementById('subBankSubmit')?.disabled) return;
        state.mode = input.value; _subSubmissionToken = null; subRenderSummary();
    });
    function begin() { state.payment = null; state.mode = 'full'; }
    async function prepare(form, token) {
        const plan = planInfo();
        if (!plan || form.get('plan') !== plan.key) return token;
        const payment = state.payment;
        const mode = state.mode;
        const addon = !!payment?.addon || form.has('addon');
        if (!payment && mode === 'full' && !addon) return token;
        form.set('payment_mode', mode);
        form.set('source', app ? 'app' : 'website');
        if (addon) form.set('addon', plan.addonKey); else form.delete('addon');
        if (payment) form.set('payment_id', payment.id);
        return token;
    }
    async function openPayment(payment) {
        if (state.busy || _subPayAnimating || _subBankRequest) return;
        await window.showSection?.('main');
        subShowPayScreen(payment.plan === 'regular_12m_2026' ? 'dark_slayer' : 'son_of_sparda', payment.addon ? 'add' : null);
        state.payment = payment; state.mode = payment.mode;
        subRenderSummary();
        const s = await session();
        if (state.payment?.id !== payment.id || !s) return;
        const bankEmail = document.getElementById('subBankEmail');
        if (bankEmail) bankEmail.value = s.user.email || '';
    }
    const formatDate = value => value ? new Date(value + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
    function showPayments(rows) {
        for (const { inside } of panels) {
            inside.replaceChildren();
            if (!state.user) {
                continue;
            }
            if (!rows.length) inside.append(make('div', tr('No Payments', 'لا توجد دفعات'), 'payment-empty'));
            for (const row of rows) {
                const item = make('article', '', `payment-item payment-${row.status}`);
                const labels = { pending: tr('Receipt Under Review', 'الإيصال قيد المراجعة'), awaiting: tr('Second Payment Due', 'الدفعة الثانية'), review: tr('Receipt Under Review', 'الإيصال قيد المراجعة'), paused: tr('Subscription Paused', 'الاشتراك متوقف'), complete: tr('Payment Complete', 'اكتمل الدفع'), rejected: tr('Receipt Rejected', 'تم رفض الإيصال') };
                item.append(make('strong', labels[row.status]), make('span', row.mode === 'installments' && row.status !== 'complete'
                    ? `${row.payment_sar} SAR${row.due_date ? ' · ' + formatDate(row.due_date) : ''}` : `${row.total_sar} SAR`));
                for (const receipt of row.receipts || []) item.append(make('small', `${receipt.number}/${row.mode === 'installments' ? 2 : 1} · ${receipt.claim_code} · ${receipt.status[0].toUpperCase()+receipt.status.slice(1)}`));
                const pendingSecond = row.receipts?.some(r => r.number === 2 && r.status !== 'rejected');
                if (row.mode === 'installments' && row.activated_at && !['complete','rejected'].includes(row.status) && !pendingSecond) {
                    const pay = make('button', tr('Upload Receipt', 'رفع الإيصال'), 'sub-bank-submit'); pay.type = 'button';
                    pay.onclick = () => openPayment(row); item.append(pay);
                }
                inside.append(item);
            }
        }
    }
    async function refresh() {
        if (state.busy) { state.dirty = true; return; }
        state.busy = true;
        const version = state.generation;
        try {
            const c = await initializeSupabase(); const s = await session();
            if (version !== state.generation) return;
            if (!s) { state.user = ''; showPayments([]); render(); return; }
            state.user = s.user.id;
            const rows = await request(c.rpc('get_my_subscription_payments'));
            if (version !== state.generation || (await session())?.user.id !== s.user.id) return;
            showPayments(rows || []); render();
            const notices = await request(c.from('user_notifications').select('id,title,data').eq('user_id',s.user.id)
                .eq('type','subscription_payment').eq('read',false).order('created_at',{ ascending:false }).limit(1));
            if (version !== state.generation) return;
            const notice = notices?.[0];
            if (notice) {
                const key = `payment-notice:${s.user.id}:${notice.id}`;
                if (!localStorage.getItem(key)) {
                    localStorage.setItem(key,'seen');
                    toast(notice.title, 'info');
                }
            }
        } catch (error) { console.error('[PAYMENT] Refresh:', error); }
        finally { state.busy = false; if (state.dirty) { state.dirty = false; queueMicrotask(refresh); } }
    }
    function openPanel() {
        const panel = panels.find(p => p.host.closest('#main-section'));
        if (panel && !panel.host.classList.contains('is-open')) panel.title.click();
    }
    window.RetroPayments = { amount, render, begin, prepare, refresh, openPayment, openPanel };
    new MutationObserver(render).observe(document.getElementById('subBankSubmit'), { attributes:true, attributeFilter:['disabled'] });
    new MutationObserver(render).observe(document.body, { attributes:true, attributeFilter:['class'] });
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    Promise.resolve(initializeSupabase()).then(c => {
        if (!c) return;
        const subscribe = s => {
            const user = s?.user.id || '';
            if (user === state.user && state.channel) return;
            ++state.generation; state.user = user; state.payment = null;
            showPayments([]); render();
            if (state.channel) c.removeChannel(state.channel);
            state.channel = user && c.channel ? c.channel(`subscription-payments:${user}`)
                .on('postgres_changes',{ event:'INSERT',schema:'public',table:'user_notifications',filter:`user_id=eq.${user}` }, payload => {
                    if (payload.new.type === 'subscription_payment') { refresh(); window.loadNotifications?.(); window.updateNotificationBadgeCount?.(); window.updateProfileSubscriptionStat?.(); }
                }).subscribe() : null;
            refresh();
        };
        c.auth.onAuthStateChange((_event,s) => queueMicrotask(() => subscribe(s)));
        session().then(subscribe).catch(() => {});
    }).catch(() => {});
    render();
})();
