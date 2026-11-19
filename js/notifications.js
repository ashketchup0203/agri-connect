// =========================================
// NOTIFICATION BELL (marketplace, product, cart and farmer hub pages)
// Shows a red count of new updates on the bell, and a list when it is clicked:
// - Buyers: updates on their orders (placed, confirmed, on its way, delivered)
// - Farmers: new orders to confirm, listings waiting for review, low stock
// - Admins: listings and farmers waiting for review
// "Seen" updates are remembered in this browser, so the count only shows new ones.
// =========================================
document.addEventListener('DOMContentLoaded', () => {
    const bell = document.getElementById('bell');
    if (!bell) return;

    const SEEN_KEY = 'agri-seen-notifications';
    const SIGN_IN_PAGE = 'Agri Connect - Sign In.html';
    let items = [];
    let signedIn = false;

    const escapeHtml = text => String(text == null ? '' : text).replace(/[&<>"']/g, ch => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

    // Browser storage can be blocked (private windows), so reads/writes are protected
    function seenKeys() {
        try {
            const value = JSON.parse(localStorage.getItem(SEEN_KEY));
            return new Set(Array.isArray(value) ? value : []);
        } catch (err) {
            return new Set();
        }
    }
    function markAllSeen() {
        const seen = seenKeys();
        items.forEach(item => seen.add(item.key));
        try {
            localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-300)));
        } catch (err) { /* not remembered */ }
    }

    function timeAgo(seconds) {
        if (seconds == null) return '';
        if (seconds < 60) return 'Just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
        const days = Math.floor(seconds / 86400);
        return days === 1 ? 'Yesterday' : `${days} days ago`;
    }

    // ---- Badge on the bell ----
    bell.classList.add('notif-bell');
    bell.setAttribute('aria-label', 'Notifications');
    bell.setAttribute('role', 'button');
    const badge = document.createElement('span');
    badge.className = 'notif-badge';
    badge.hidden = true;
    bell.appendChild(badge);

    function updateBadge() {
        const seen = seenKeys();
        const unread = items.filter(item => !seen.has(item.key)).length;
        badge.hidden = unread === 0;
        badge.textContent = unread > 9 ? '9+' : unread;
    }

    // ---- Drop-down list ----
    const panel = document.createElement('div');
    panel.className = 'header-panel notif-panel';
    panel.hidden = true;
    document.body.appendChild(panel);

    function renderPanel() {
        const seen = seenKeys();
        let body;
        if (!signedIn) {
            body = `<p class="notif-empty"><a href="${SIGN_IN_PAGE}">Sign in</a> to see updates about your orders and listings.</p>`;
        } else if (items.length === 0) {
            body = '<p class="notif-empty">You’re all caught up. New updates will show here.</p>';
        } else {
            body = '<ul class="notif-list">' + items.map(item => {
                const inner = `${escapeHtml(item.text)}<span class="notif-time">${timeAgo(item.ageSeconds)}</span>`;
                const cls = seen.has(item.key) ? '' : ' notif-new';
                return item.link
                    ? `<li><a class="${cls.trim()}" href="${escapeHtml(item.link)}">${inner}</a></li>`
                    : `<li><div class="notif-item${cls}">${inner}</div></li>`;
            }).join('') + '</ul>';
        }
        panel.innerHTML = `<div class="header-panel-head">Notifications</div>${body}`;
    }

    function placePanel() {
        const rect = bell.getBoundingClientRect();
        const width = Math.min(330, window.innerWidth - 32);
        panel.style.top = `${rect.bottom + 10}px`;
        panel.style.left = `${Math.max(16, Math.min(rect.right - width + 20, window.innerWidth - width - 16))}px`;
    }

    function openPanel() {
        document.dispatchEvent(new CustomEvent('header-panel:open', { detail: panel }));
        renderPanel();          // shows which ones are new...
        placePanel();
        panel.hidden = false;
        markAllSeen();          // ...then counts them as seen
        updateBadge();
    }
    function closePanel() {
        panel.hidden = true;
    }

    bell.addEventListener('click', event => {
        event.preventDefault();
        if (panel.hidden) openPanel(); else closePanel();
    });
    document.addEventListener('click', event => {
        if (!panel.hidden && !panel.contains(event.target) && !bell.contains(event.target)) closePanel();
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closePanel(); });
    document.addEventListener('header-panel:open', event => { if (event.detail !== panel) closePanel(); });
    window.addEventListener('resize', () => { if (!panel.hidden) placePanel(); });
    window.addEventListener('scroll', () => { if (!panel.hidden) placePanel(); }, { passive: true });

    // ---- Load (and refresh every minute, and when the farmer confirms an order) ----
    function load() {
        fetch('/api/notifications')
            .then(res => (res.ok ? res.json() : null))
            .then(data => {
                if (!data) return;
                signedIn = data.signedIn;
                items = data.items || [];
                updateBadge();
                if (!panel.hidden) renderPanel();
            })
            .catch(() => { /* server not running: bell stays quiet */ });
    }
    load();
    setInterval(load, 60000);
    document.addEventListener('notifications:refresh', load);
});
