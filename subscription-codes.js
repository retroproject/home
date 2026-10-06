(() => {
    'use strict';
    const app = !!window.electronAPI;
    const tr = (en, ar) => document.body.classList.contains('arabic-mode') ? ar : en;
    const node = (tag, cls, text) => {
        const el = document.createElement(tag);
        if (cls) el.className = cls;
        if (text) el.textContent = text;
        return el;
    };
    const plans = { dark_knight: 1, dark_slayer: 10, son_of_sparda: 18 };
    let enabled = false, switching = false, cinemaCheckout = false, checkoutGeneration = 0, generation = 0, account = '', count = 0, busy = false, refreshing = false, dirty = false;
    let summaryAnimations = [];
    let switchTarget = null;
    let field, keyButton, channel, channelUser = '';
    const email = document.getElementById('subBankEmail');
    const bankField = email?.closest('.sub-bank-field');
    const toggle = node('button', 'codes-checkout-toggle');
    const glyph = node('span', 'codes-checkout-glyph', '\u{1F5DD}\uFE0F');
    glyph.setAttribute('aria-hidden', 'true'); toggle.append(glyph);
    toggle.type = 'button'; toggle.setAttribute('aria-pressed', 'false');
    const tip = node('span', 'sub-bank-help-tip'); tip.id = 'codes-checkout-tooltip'; tip.setAttribute('role', 'tooltip');
    toggle.append(tip); toggle.setAttribute('aria-describedby', tip.id);
    bankField?.classList.add('has-codes');
    const friend = bankField?.querySelector('.sharing-checkout-toggle');
    if (friend) friend.before(toggle); else bankField?.append(toggle);

    // Collapse both options as one region, retaining their original controls.
    const extras = node('div', 'codes-extras'); const extrasInner = node('div', 'codes-extras-inner');
    const addon = document.getElementById('subAddonCard');
    const paymentChoice = document.querySelector('.payment-choice');
    if (addon) {
        addon.before(extras); extras.append(extrasInner); extrasInner.append(addon);
        if (paymentChoice) extrasInner.append(paymentChoice);
    }
    const toast = (message, type = 'info') => window.showToast?.(message, type);
    async function session() {
        const c = await initializeSupabase();
        return c ? (await c.auth.getSession()).data.session : null;
    }
    async function rpc(name, args) {
        const c = await initializeSupabase();
        if (!c) throw Error('Sign In Required');
        const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 20000);
        try {
            const { data, error } = await c.rpc(name, args).abortSignal(controller.signal);
            if (error) throw error;
            return data;
        } finally { clearTimeout(timer); }
    }
    function render() {
        const quantity = cinemaCheckout ? 4 : plans[_subSelectedPlan];
        toggle.disabled = switching || !!document.getElementById('subBankSubmit')?.disabled || !quantity || !!window.RetroPayments?.hasPayment();
        toggle.hidden = !quantity;
        toggle.setAttribute('aria-pressed', String(enabled));
        toggle.setAttribute('aria-label', tr('Subscription Codes', 'أكواد الاشتراك'));
        tip.textContent = enabled ? tr('Subscription', 'اشتراك') : tr('Subscription Codes', 'أكواد الاشتراك');
        tip.setAttribute('data-en', enabled ? 'Subscription' : 'Subscription Codes');
        tip.setAttribute('data-ar', enabled ? 'اشتراك' : 'أكواد الاشتراك');
        extras.classList.toggle('is-collapsed', enabled && !cinemaCheckout); extras.inert = enabled;
        bankField?.classList.toggle('codes-mode', switching && switchTarget !== null ? switchTarget : enabled);
        if (enabled) {
            const label = document.getElementById('subPayPlanLabel');
            const total = typeof subTotalSar === 'function' ? subTotalSar() : 0;
            if (label) {
                label.textContent = cinemaCheckout ? tr('Cinema + Cloud Codes · 250 SAR', 'أكواد السينما والسحابة · 250 ريال') : tr(`${quantity} Subscription Codes · ${total} SAR`, `${quantity} كود اشتراك · ${total} ريال`);
                label.removeAttribute('data-en'); label.removeAttribute('data-ar');
            }
            addon?.querySelectorAll('button,input').forEach(control => { control.disabled = true; });
        }
        if (cinemaCheckout) {
            const row = document.getElementById('subAddonStandalone');
            const label = row?.querySelector('.sub-addon-label'), price = row?.querySelector('.sub-addon-price');
            if (label) { label.textContent = enabled ? tr('4 Codes · 6 Months Each', '4 أكواد · 6 أشهر لكل كود') : tr('Cinema + Unlimited Cloud', 'السينما + تخزين سحابي بلا حدود'); label.removeAttribute('data-en'); label.removeAttribute('data-ar'); }
            if (price) { price.textContent = enabled ? tr('250 SAR', '250 ريال') : tr('100 SAR / 6 Months', '100 ريال / ٦ أشهر'); price.removeAttribute('data-en'); price.removeAttribute('data-ar'); }
        }
        if (field) {
            field.placeholder = count ? tr(`${count} Unredeemed ${count === 1 ? 'Code' : 'Codes'}`, `${count} كود غير مستخدم`) : tr('Subscription Code', 'كود الاشتراك');
            field.disabled = !account || busy;
            keyButton.disabled = !account || busy;
            keyButton.dataset.state = busy ? 'working' : '';
            keyButton.setAttribute('aria-label', field.value.trim() ? tr('Redeem', 'تفعيل') : tr('Download Codes', 'تنزيل الأكواد'));
            keyButton.title = keyButton.getAttribute('aria-label');
        }
    }
    async function switchMode() {
        if (toggle.disabled || _subPayAnimating || _subBankRequest) return;
        const version = checkoutGeneration;
        switching = true;
        switchTarget = !enabled;
        window.RetroSharing?.setCheckoutDisabled(true);
        try {
            const summary = cinemaCheckout && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
                ? ['subPayPlanLabel', 'subAddonStandalone', 'subBankSubmit'].map(id => document.getElementById(id)).filter(el => el?.animate) : [];
            render();
            summaryAnimations = summary.map(el => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' }));
            await Promise.all(summaryAnimations.map(a => a.finished.catch(() => {})));
            if (version !== checkoutGeneration) return;
            enabled = !enabled;
            if (!cinemaCheckout) _subAddonMode = null;
            _subSubmissionToken = null;
            window.RetroSharing?.setCheckoutDisabled(true);
            window.RetroPayments?.setFullPayment();
            subRenderSummary(); render();
            summaryAnimations.forEach(a => a.cancel());
            summaryAnimations = summary.map(el => el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, fill: 'forwards' }));
            const animations = [...extras.getAnimations({ subtree: true }), ...(bankField?.querySelector('.sharing-checkout-toggle')?.getAnimations() || [])];
            await Promise.all([...animations, ...summaryAnimations].map(animation => animation.finished.catch(() => {})));
        } finally { if (version === checkoutGeneration) { summaryAnimations.forEach(a => a.cancel()); summaryAnimations = []; switching = false; switchTarget = null; window.RetroSharing?.setCheckoutDisabled(enabled); render(); } }
    }
    toggle.addEventListener('click', switchMode);
    function begin() {
        ++checkoutGeneration; summaryAnimations.forEach(a => a.cancel()); summaryAnimations = [];
        enabled = false; switching = false; switchTarget = null;
        cinemaCheckout = !plans[_subSelectedPlan] && _subAddonMode === 'only';
        window.RetroSharing?.setCheckoutDisabled(false);
        extras.getAnimations({ subtree: true }).forEach(animation => animation.cancel());
        render();
    }
    function prepare(form) {
        if (switching) throw Error('Please Wait');
        if (!enabled) return;
        if (cinemaCheckout) {
            if (form.get('plan') !== 'cinema_cloud_6m' || _subAddonMode !== 'only') throw Error('Codes Unavailable');
            form.set('plan', 'cinema_codes_4x6m');
        } else if (!plans[_subSelectedPlan] || !['regular_1m_2026', 'regular_12m_2026', 'regular_24m_2026'].includes(form.get('plan'))) throw Error('Codes Unavailable');
        form.set('purchase_kind', 'codes'); form.set('payment_mode', 'full'); form.set('source', app ? 'app' : 'website');
        form.delete('addon'); form.delete('sharing_email'); form.delete('payment_id');
    }
    async function refresh() {
        if (refreshing) { dirty = true; return; }
        refreshing = true;
        const version = generation;
        try {
            const s = await session();
            if (version !== generation) return;
            const user = s?.user.id || '';
            if (account !== user) { account = user; count = 0; if (field) field.value = ''; }
            if (!user) { render(); return; }
            const data = await rpc('get_my_subscription_codes');
            if (version !== generation || (await session())?.user.id !== user) return;
            count = Number(data?.unredeemed) || 0; render();
        } catch (error) { console.error('[CODES] Refresh:', error.message); }
        finally { refreshing = false; if (dirty) { dirty = false; queueMicrotask(refresh); } }
    }
    async function useKey() {
        if (busy || !account) return;
        const value = field.value.trim().toUpperCase(); const owner = account; const version = generation;
        if (value && !/^RP-[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}$/.test(value)) {
            toast(tr('Enter One Code', 'أدخل كوداً واحداً'), 'error'); return;
        }
        busy = true; render();
        try {
            const s = await session();
            if (s?.user.id !== owner || version !== generation) return;
            const data = await rpc(value ? 'redeem_subscription_code' : 'export_my_subscription_codes', value ? { p_code: value } : undefined);
            if (version !== generation || (await session())?.user.id !== owner) return;
            if (value) {
                if (!data?.success) {
                    const errors = { 'Code Unavailable': tr('Code Unavailable', 'الكود غير متاح'), 'Try Again Shortly': tr('Try Again Shortly', 'حاول بعد قليل'), 'Lifetime Already Active': tr('Lifetime Already Active', 'الاشتراك الدائم نشط'), 'Cinema Already Active': tr('Cinema Already Active', 'اشتراك السينما الدائم نشط') };
                    toast(errors[data?.error] || tr('Could Not Redeem', 'تعذر التفعيل'), 'error'); return;
                }
                field.value = '';
                await window.isUserPremium?.();
                if (version !== generation || (await session())?.user.id !== owner) return;
                await window.updateProfileSubscriptionStat?.();
                if (data.code_type === 'cinema' && data.state === 'active') await window.refreshAssignedServiceKeys?.(true);
                toast(data.state === 'awaiting_slots' ? tr('Awaiting Slots', 'بانتظار توفر الحسابات') : data.state === 'blocked' ? tr('Activation Pending', 'التفعيل قيد الانتظار') : tr('Code Redeemed', 'تم تفعيل الكود'), data.state === 'blocked' ? 'error' : data.state === 'awaiting_slots' ? 'info' : 'success');
            } else {
                if (!data?.codes?.length) { toast(tr('No Codes', 'لا توجد أكواد'), 'error'); return; }
                const text = data.groups?.length ? data.groups.map(group => `${group.code_type === 'cinema' ? 'Cinema + Cloud' : 'Retro Project'} · ${group.months} ${group.months === 1 ? 'Month' : 'Months'} Each\n\n${group.codes.join('\n')}`).join('\n\n\n') : data.codes.join('\n');
                const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
                const link = node('a'); link.href = url; link.download = 'Subscription Codes.txt'; document.body.append(link); link.click(); link.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            }
            await refresh();
        } catch (error) {
            console.error('[CODES] Action:', error.message);
            if (version === generation) toast(tr('Codes Unavailable', 'الأكواد غير متاحة'), 'error');
        } finally { busy = false; render(); }
    }
    if (app) {
        const anchor = document.getElementById('settings-subscription-sharing');
        const manager = node('div', 'setting-item profile-sharing'); manager.id = 'settings-subscription-codes';
        const label = node('label', 'setting-label', 'Subscription Codes'); label.htmlFor = 'settings-subscription-code';
        const row = node('div', 'profile-sharing-row'); field = node('input', 'setting-input');
        field.id = 'settings-subscription-code'; field.type = 'text'; field.maxLength = 120; field.autocomplete = 'off'; field.spellcheck = false;
        keyButton = node('button', 'profile-sharing-action'); keyButton.type = 'button';
        keyButton.id = 'settings-codes-key';
        const img = node('img'); img.src = 'C:/Retro Project/Playnite/icons/Key [001].png'; img.alt = ''; keyButton.append(img);
        keyButton.addEventListener('click', useKey); field.addEventListener('input', render);
        row.append(field, keyButton); manager.append(label, row); anchor?.after(manager);
        const translate = () => { label.textContent = tr('Subscription Codes', 'أكواد الاشتراك'); render(); };
        new MutationObserver(translate).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
    window.RetroCodes = { enabled: () => enabled, cinemaEnabled: () => enabled && cinemaCheckout, busy: () => switching, begin, render, prepare, refresh,
        async open() {
            await window.showSection?.('profile');
            const profile = document.getElementById('profile');
            if (profile && !profile.classList.contains('active')) await new Promise(resolve => {
                const observer = new MutationObserver(() => { if (profile.classList.contains('active')) finish(); });
                const timer = setTimeout(finish, 3000);
                function finish() { clearTimeout(timer); observer.disconnect(); resolve(); }
                observer.observe(profile, { attributes: true, attributeFilter: ['class'] });
            });
            await window.switchProfileTabWithLock?.('settings'); await refresh(); field?.focus();
        } };
    new MutationObserver(render).observe(document.getElementById('subBankSubmit'), { attributes: true, attributeFilter: ['disabled'] });
    window.addEventListener('focus', refresh);
    if (app) Promise.resolve(initializeSupabase()).then(c => {
        if (!c) return;
        c.auth.onAuthStateChange((_event, s) => queueMicrotask(async () => {
            const user = s?.user.id || '';
            if (user === account && user === channelUser) { await refresh(); return; }
            ++generation; account = user; channelUser = user; count = 0; if (field) field.value = ''; render();
            if (channel) c.removeChannel(channel);
            channel = account && c.channel ? c.channel(`subscription-codes:${account}`)
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_notifications', filter: `user_id=eq.${account}` }, payload => {
                    if (payload.new.type === 'subscription_codes') { refresh(); window.loadNotifications?.(); window.updateNotificationBadgeCount?.(); toast(tr('Subscription Codes Ready', 'أكواد الاشتراك جاهزة'), 'success'); }
                    if (payload.new.type === 'purchase_activated' && payload.new.data?.kind === 'cinema') { window.refreshAssignedServiceKeys?.(true); window.updateProfileSubscriptionStat?.(); }
                }).subscribe() : null;
            await refresh();
        }));
        refresh();
    }).catch(() => {});
    render();
})();
