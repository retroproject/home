(() => {
    'use strict';
    const app = !!window.electronAPI;
    const iconBase = app ? 'resources/sharing-icons/' : 'sharing-icons/';
    const tr = (en, ar) => document.body.classList.contains('arabic-mode') ? ar : en;
    const node = (tag, text, className) => {
        const el = document.createElement(tag);
        if (text) el.textContent = text;
        if (className) el.className = className;
        return el;
    };
    const client = () => initializeSupabase();
    async function rpc(name, args) {
        const c = await client();
        if (!c) throw new Error('Sign in required');
        const { data, error } = await c.rpc(name, args);
        if (error) throw new Error(error.message);
        return data;
    }
    function icon(label, file, action) {
        const b = node('button', '', 'sharing-icon'); b.type = 'button'; b.title = label;
        b.setAttribute('aria-label', label);
        const img = node('img'); img.src = iconBase + file; img.alt = ''; b.append(img);
        b.addEventListener('click', action); return b;
    }
    function command(label, action) {
        const b = node('button', label, 'sharing-command'); b.type = 'button'; b.addEventListener('click', action); return b;
    }
    function field(type, placeholder) {
        const input = node('input'); input.type = type; input.placeholder = placeholder;
        input.setAttribute('aria-label', placeholder); input.maxLength = type === 'email' ? 254 : 256;
        input.autocomplete = type === 'email' ? 'email' : 'current-password'; return input;
    }
    function expansion() {
        const outer = node('div', '', 'sharing-expand'); const inner = node('div');
        const content = node('div', '', 'sharing-content'); inner.append(content); outer.append(inner);
        return { outer, content };
    }
    async function session() { return (await (await client()).auth.getSession()).data.session; }
    const checkout = { open: false, email: null };
    const bankEmail = document.getElementById('subBankEmail');
    if (bankEmail) {
        const host = node('section', '', 'subscription-sharing sharing-checkout');
        const exp = expansion();
        const email = field('email', tr('Share With', 'المشاركة مع'));
        email.className = 'sub-bank-input';
        email.autocomplete = 'off';
        exp.content.append(email);
        host.append(exp.outer);
        const bankField = bankEmail.closest('.sub-bank-field');
        const group = node('div', '', 'sharing-email-group');
        bankField.before(group);
        group.append(bankField, host);
        bankField.classList.add('has-sharing');
        const toggle = icon(tr('Share', 'مشاركة'), 'add-person.svg', () => {
            checkout.open = !checkout.open;
            exp.outer.classList.toggle('is-open', checkout.open);
            exp.outer.inert = !checkout.open;
            toggle.setAttribute('aria-expanded', String(checkout.open));
            if (checkout.open) email.focus(); else email.value = '';
        });
        toggle.classList.add('sharing-checkout-toggle');
        toggle.classList.remove('sharing-icon');
        toggle.removeAttribute('title');
        const tooltip = node('span', tr('Share', 'مشاركة'), 'sub-bank-help-tip');
        tooltip.id = 'sharing-checkout-tooltip';
        tooltip.setAttribute('role', 'tooltip');
        toggle.setAttribute('aria-describedby', tooltip.id);
        toggle.append(tooltip);
        toggle.setAttribute('aria-expanded', 'false');
        const help = bankField.querySelector('.sub-bank-help');
        if (help) help.before(toggle); else bankField.append(toggle);
        const translate = () => {
            email.placeholder = tr('Share With', 'المشاركة مع');
            email.setAttribute('aria-label', email.placeholder);
            tooltip.textContent = tr('Share', 'مشاركة');
            toggle.setAttribute('aria-label', tooltip.textContent);
        };
        new MutationObserver(translate).observe(document.body, { attributes: true, attributeFilter: ['class'] });
        exp.outer.inert = true;
        Object.assign(checkout, { email });
    }
    async function validateCheckout() {
        if (!checkout.open) return null;
        const email = checkout.email.value.trim().toLowerCase();
        const ownerEmail = bankEmail.value.trim().toLowerCase();
        if (!email || !checkout.email.checkValidity() || email === ownerEmail) {
            throw new Error(tr('Enter a different valid email.', 'أدخل بريداً آخر صالحاً.'));
        }
        return Object.freeze({ email });
    }
    window.RetroSharing = { validateCheckout };

    const manager = node('section', '', 'subscription-sharing sharing-manager');
    const summary = node('span', tr('Sharing', 'المشاركة'), 'sharing-summary');
    const exp = expansion(); const message = node('div', '', 'sharing-message'); message.setAttribute('role', 'status');
    const content = node('div'); const header = node('div', '', 'sharing-row');
    let open = false, generation = 0, busy = false;
    const refresh = async () => {
        const token = ++generation; message.textContent = ''; content.replaceChildren();
        try {
            const s = await session(); if (token !== generation) return;
            if (!s) return;
            const data = await rpc('get_subscription_sharing'); if (token !== generation) return;
            const active = data.requests.find(r => r.status === 'active');
            summary.textContent = active ? `${active.owner_id === s.user.id ? tr('Sharing', 'المشاركة') : tr('Shared By', 'المشاركة من')}: ${active.owner_id === s.user.id ? active.recipient_email : active.owner_email}` : tr('Sharing', 'المشاركة');
            for (const r of data.requests.filter(r => ['invited', 'pending', 'active'].includes(r.status))) {
                const item = node('div', '', 'sharing-item'); const mine = r.owner_id === s.user.id;
                item.append(node('div', `${mine ? r.recipient_email : r.owner_email}`), node('small', r.status === 'active' ? tr('Active', 'نشط') : r.status === 'pending' ? tr('Pending Approval', 'بانتظار الموافقة') : tr('Awaiting Acceptance', 'بانتظار القبول')));
                const actions = node('div', '', 'sharing-row');
                const respond = async action => mutate(() => rpc('respond_subscription_share', { p_id: r.id, p_revision: r.revision, p_action: action }));
                if (!mine && r.status === 'invited') actions.append(command(tr('Accept', 'قبول'), () => respond('accept')));
                if (['invited', 'pending'].includes(r.status)) actions.append(command(mine ? tr('Cancel Request', 'إلغاء الطلب') : tr('Reject', 'رفض'), () => respond(mine ? 'cancel' : 'reject')));
                item.append(actions); content.append(item);
            }
            // A recipient must not edit their owner's partner; they may still purchase personally.
            if (!active || active.owner_id === s.user.id || data.can_share) {
                const email = field('email', tr('Share With', 'المشاركة مع')); if (active) email.value = active.recipient_email;
                const row = node('div', '', 'sharing-row'); row.append(email, command(tr('Send', 'إرسال'), () => {
                    if (!email.value.trim() || !email.checkValidity()) { email.reportValidity(); return; }
                    mutate(() => rpc('request_subscription_share', { p_email: email.value.trim() }));
                }));
                content.append(row, node('small', tr('1 device each · Requires approval', 'جهاز لكل حساب · يتطلب الموافقة'), 'sharing-note'));
            }
        } catch (e) { if (token === generation) message.textContent = e.message; }
    };
    async function mutate(action) {
        if (busy) return; busy = true; content.querySelectorAll('button,input').forEach(e => e.disabled = true);
        try { await action(); await refresh(); }
        catch (e) { await refresh(); message.textContent = e.message; }
        finally { busy = false; content.querySelectorAll('button,input').forEach(e => e.disabled = false); }
    }
    const toggle = icon(tr('Share', 'مشاركة'), 'add-person.svg', () => {
        open = !open; exp.outer.classList.toggle('is-open', open); exp.outer.inert = !open;
        toggle.setAttribute('aria-expanded', String(open)); if (open) refresh(); else ++generation;
    });
    header.append(summary, toggle); exp.content.append(content, message); exp.outer.inert = true;
    manager.append(header, exp.outer);
    const anchor = document.getElementById('subscriptionQuickStat');
    if (app && anchor) anchor.parentElement.after(manager);

    if (app) {
        let checking = false, resetNotified = false, preparedFor = '';
        const checkSession = async () => {
            if (checking || document.hidden) return; checking = true;
            try {
                const s = await session(); if (!s || !window.getCurrentUser?.()?.id) return;
                const access = await rpc('get_my_subscription_access');
                if (!access.device_valid && !resetNotified) {
                    resetNotified = true;
                    await logoutUser();
                    showToast('Sharing changed. Sign in again to register your device.', 'error');
                    return;
                }
                if (access.device_valid) resetNotified = false;
                if (access.cinema && preparedFor !== s.access_token) {
                    await rpc('prepare_my_shared_services'); preparedFor = s.access_token;
                }
            } catch (_) { /* Temporary network errors do not log out a valid user. */ }
            finally { checking = false; }
        };
        window.addEventListener('focus', checkSession);
        setInterval(checkSession, 30000);
    }
})();
