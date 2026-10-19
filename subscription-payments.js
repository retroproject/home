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
    const state = { mode: 'full', payment: null, busy: false, dirty: false, opening: false, generation: 0, user: '', channel: null };
    const choice = make('fieldset', '', 'payment-choice');
    const choiceTitle = make('div', '', 'payment-choice-title'); choiceTitle.id = 'paymentChoiceTitle';
    choice.setAttribute('aria-labelledby', choiceTitle.id);
    const full = make('input'); full.type = 'radio'; full.name = 'subscription-payment'; full.value = 'full'; full.checked = true;
    const two = make('input'); two.type = 'radio'; two.name = full.name; two.value = 'installments';
    const fullLabel = make('label', '', 'payment-option'); const fullText = make('span', '', 'payment-option-label');
    const fullPrice = make('span', '', 'payment-option-price'); fullPrice.dir = 'auto';
    const fullCircle = make('span', '', 'payment-option-radio'); fullCircle.setAttribute('aria-hidden', 'true');
    fullLabel.append(full, fullCircle, fullText, fullPrice);
    const twoLabel = make('label', '', 'payment-option'); const twoText = make('span', '', 'payment-option-label');
    const twoPrice = make('span', '', 'payment-option-price'); twoPrice.dir = 'auto';
    const twoCircle = make('span', '', 'payment-option-radio'); twoCircle.setAttribute('aria-hidden', 'true');
    twoLabel.append(two, twoCircle, twoText, twoPrice);
    const options = make('div', '', 'payment-choice-options'); options.append(fullLabel, twoLabel);
    const schedule = make('div', '', 'payment-schedule'); schedule.setAttribute('role', 'status');
    choice.append(choiceTitle, options, schedule);
    document.getElementById('subAddonCard')?.after(choice);

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
        const plans = {
            dark_knight: { base:60, addon:20, months:1, key:'regular_1m_2026', addonKey:'cinema_cloud_1m', installments:false, labelEn:'1 Month', labelAr:'شهر واحد' },
            devil_hunter: { base:120, addon:50, months:3, key:'regular_3m_2026', addonKey:'cinema_cloud_3m', installments:false, labelEn:'3 Months', labelAr:'3 أشهر' },
            dark_slayer: { base:400, addon:150, months:12, years:1, key:'regular_12m_2026', addonKey:'cinema_cloud_12m_slayer_20261019', installments:true, labelEn:'1 Year', labelAr:'سنة' },
            son_of_sparda: { base:600, addon:200, months:24, years:2, key:'regular_24m_2026', addonKey:'cinema_cloud_24m_sparda', installments:true, labelEn:'2 Years', labelAr:'سنتان' }
        };
        return plans[_subSelectedPlan] || null;
    }
    function planTotal(plan) {
        const payment = state.payment;
        return payment ? payment.total_sar ?? payment.payment_sar * (payment.mode === 'installments' ? 2 : 1)
            : plan.base + (_subAddonMode === 'add' ? plan.addon : 0);
    }
    function addonInfo() {
        const plan = planInfo(), payment = state.payment;
        const sar = payment ? (payment.addon ? planTotal(plan) - plan.base : 0) : plan.addon;
        const key = typeof payment?.addon === 'string' ? payment.addon
            : payment?.addon && plan.months === 12 && sar === 100 ? 'cinema_cloud_12m_slayer' : plan.addonKey;
        return { key, sar };
    }
    // Enabled only after the canonical backend offers have been deployed and checked.
    const OFFERS_READY = true;
    const offersReady = () => OFFERS_READY;
    function assertOfferReady(form) {
        if (state.payment) return;
        const plan = form.get('plan'), addon = form.get('addon');
        const newOffer = /^(regular_codes_|bundle_codes_|cinema_codes_)/.test(plan || '')
            || /^cinema_cloud_(?:1|3|12|24)m(?:_20261019)?$/.test(plan || '')
            || ['cinema_cloud_1m', 'cinema_cloud_3m', 'cinema_cloud_12m_slayer_20261019'].includes(addon);
        if (newOffer && !offersReady()) throw Error(tr('Offer Unavailable', 'العرض غير متاح'));
    }
    function amount(total) {
        if (state.payment) return state.payment.payment_sar;
        const codes = window.RetroCodes?.offer();
        if (codes) return codes.sar;
        const plan = planInfo();
        if (!plan) return total;
        const price = plan.base + (_subAddonMode === 'add' ? plan.addon : 0);
        return state.mode === 'installments' && plan.installments ? price / 2 : price;
    }
    function render() {
        if (!document?.body) return;
        const plan = planInfo();
        const selected = !!plan;
        choiceTitle.textContent = tr('Payment & Installments', 'الدفع والتقسيط');
        fullText.textContent = tr('One Payment', 'دفعة واحدة'); twoText.textContent = tr('Two Monthly Payments', 'دفعتين على شهرين');
        const total = plan ? planTotal(plan) : 0;
        fullPrice.textContent = tr(`${total} SAR`, `${total} ريال`);
        twoPrice.textContent = tr(`${total / 2} + ${total / 2} SAR`, `${total / 2} + ${total / 2} ريال`);
        choice.hidden = !plan?.installments;
        choice.classList.toggle('is-fixed', !!state.payment);
        full.checked = state.mode === 'full'; two.checked = state.mode === 'installments';
        fullLabel.classList.toggle('active', full.checked); twoLabel.classList.toggle('active', two.checked);
        const checkoutLocked = !!document.getElementById('subBankSubmit')?.disabled || !!state.payment || !!window.RetroCodes?.busy();
        const locked = checkoutLocked || !!window.RetroCodes?.enabled();
        choice.inert = locked;
        full.disabled = two.disabled = locked;
        fullLabel.classList.toggle('is-disabled', locked); twoLabel.classList.toggle('is-disabled', locked);
        const addon = document.getElementById('subAddonAdd');
        if (addon) {
            addon.disabled = checkoutLocked;
            const price = addon.querySelector('.sub-addon-price');
            if (price) {
                const extra = selected ? addonInfo().sar : 0;
                price.textContent = selected ? tr(`${extra} SAR`, `${extra} ريال`) : '';
                price.removeAttribute('data-en'); price.removeAttribute('data-ar');
            }
        }
        schedule.textContent = state.payment
            ? tr(`Second Payment · ${state.payment.payment_sar} SAR`, `الدفعة الثانية · ${state.payment.payment_sar} ريال`)
            : '';
        schedule.hidden = !state.payment;
        const label = document.getElementById('subPayPlanLabel');
        if (selected && label) {
            label.textContent = tr(`${plan.labelEn} · ${amount(0)} SAR${state.mode === 'installments' && plan.installments ? ' Now' : ''}`, `${plan.labelAr} · ${amount(0)} ريال`);
            label.removeAttribute('data-en'); label.removeAttribute('data-ar');
        }
        const submit = document.getElementById('subBankSubmit');
        if (submit && !submit.disabled) submit.textContent = subSubmitLabel();
        if (typeof subRenderCinemaOffers === 'function') subRenderCinemaOffers();
        window.RetroCodes?.render();
    }
    for (const input of [full, two]) input.addEventListener('change', () => {
        if (state.payment || !planInfo()?.installments || window.RetroCodes?.enabled() || window.RetroCodes?.busy() || document.getElementById('subBankSubmit')?.disabled) { render(); return; }
        state.mode = input.value; _subSubmissionToken = null; subRenderSummary();
    });
    function begin() { state.payment = null; state.mode = 'full'; window.RetroCodes?.begin(); }
    async function prepare(form, token) {
        window.RetroCodes?.prepare(form);
        assertOfferReady(form);
        if (form.get('purchase_kind') === 'codes') return token;
        const plan = planInfo();
        if (!plan && _subAddonMode === 'only' && form.get('plan') === subCinemaOffer().key) {
            form.set('payment_mode', 'full'); form.set('source', app ? 'app' : 'website');
            return token;
        }
        if (!plan || form.get('plan') !== plan.key) return token;
        const payment = state.payment;
        const mode = plan.installments ? state.mode : 'full';
        const addon = !!payment?.addon || form.has('addon');
        if (!payment && mode === 'full' && !addon) return token;
        form.set('payment_mode', mode);
        form.set('source', app ? 'app' : 'website');
        if (addon) form.set('addon', addonInfo().key); else form.delete('addon');
        if (payment) form.set('payment_id', payment.id);
        assertOfferReady(form);
        return token;
    }
    async function openPayment(payment) {
        if (_subPayAnimating || _subBankRequest) return;
        if (!['regular_12m_2026', 'regular_24m_2026'].includes(payment.plan)) return;
        const version = state.generation;
        const s = await session();
        if (!s) return;
        await window.showSection?.('main');
        if (version !== state.generation || (await session())?.user.id !== s.user.id) return;
        subShowPayScreen(payment.plan === 'regular_12m_2026' ? 'dark_slayer' : 'son_of_sparda', payment.addon ? 'add' : null);
        state.payment = payment; state.mode = payment.mode;
        subRenderSummary();
        const bankEmail = document.getElementById('subBankEmail');
        if (bankEmail) bankEmail.value = s.user.email || '';
    }
    async function openNotice(paymentId) {
        if (!paymentId || state.opening || _subPayAnimating || _subBankRequest) return;
        state.opening = true;
        const version = state.generation;
        try {
            const c = await initializeSupabase(); const s = await session();
            if (!c || !s) return;
            const rows = await request(c.rpc('get_my_subscription_payments'));
            if (version !== state.generation || (await session())?.user.id !== s.user.id) return;
            const row = (rows || []).find(payment => payment.id === paymentId);
            if (!row) { toast(tr('Payment Unavailable', 'الدفعة غير متاحة')); return; }
            const pendingSecond = row.receipts?.some(receipt => receipt.number === 2 && receipt.status !== 'rejected');
            if (row.mode === 'installments' && row.activated_at && ['awaiting','review','paused'].includes(row.status) && !pendingSecond) {
                await openPayment(row);
            } else {
                toast(row.status === 'complete' ? tr('Payment Complete', 'اكتمل الدفع') : tr('Receipt Under Review', 'الإيصال قيد المراجعة'));
            }
        } catch (error) { console.error('[PAYMENT] Open:', error); toast(tr('Payment Unavailable', 'الدفعة غير متاحة'), 'error'); }
        finally { state.opening = false; }
    }
    async function refresh() {
        if (state.busy) { state.dirty = true; return; }
        state.busy = true;
        const version = state.generation;
        try {
            const c = await initializeSupabase(); const s = await session();
            if (version !== state.generation) return;
            if (!s) { state.user = ''; render(); return; }
            state.user = s.user.id;
            const rows = await request(c.rpc('get_my_subscription_payments'));
            if (version !== state.generation || (await session())?.user.id !== s.user.id) return;
            render();
            const notices = await request(c.from('user_notifications').select('id,title,data').eq('user_id',s.user.id)
                .eq('type','subscription_payment').eq('read',false).order('created_at',{ ascending:false }).limit(1));
            if (version !== state.generation) return;
            const notice = notices?.[0];
            if (notice && (rows || []).some(payment => payment.id === notice.data?.payment_id)) {
                const key = `payment-notice:${s.user.id}:${notice.id}`;
                if (!localStorage.getItem(key)) {
                    localStorage.setItem(key,'seen');
                    toast(notice.title, 'info');
                }
            }
        } catch (error) { console.error('[PAYMENT] Refresh:', error); }
        finally { state.busy = false; if (state.dirty) { state.dirty = false; queueMicrotask(refresh); } }
    }
    window.RetroPayments = { amount, planInfo, offersReady, assertOfferReady, render, begin, prepare, refresh, openPayment, openNotice,
        hasPayment: () => !!state.payment, setFullPayment() { state.mode = 'full'; state.payment = null; } };
    new MutationObserver(render).observe(document.getElementById('subBankSubmit'), { attributes:true, attributeFilter:['disabled'] });
    new MutationObserver(render).observe(document.getElementById('subPayScreen'), { attributes:true, attributeFilter:['style'] });
    new MutationObserver(render).observe(document.body, { attributes:true, attributeFilter:['class'] });
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    Promise.resolve(initializeSupabase()).then(c => {
        if (!c) return;
        const subscribe = s => {
            const user = s?.user.id || '';
            if (user === state.user && state.channel) return;
            ++state.generation; state.user = user; state.payment = null;
            render();
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
