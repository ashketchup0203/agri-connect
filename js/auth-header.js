// =========================================
// HEADER (marketplace, product and cart pages)
// - Links match who is signed in: buyers don't see "Farmer hub"
// - Profile button shows "Sign in", or the signed-in user with a menu
//   (Farmer hub / basket, and Sign out)
// - "Cart (n)" shows how many products are in the cart
// =========================================
const SIGN_IN_PAGE = 'Agri Connect - Sign In.html';

document.addEventListener('DOMContentLoaded', () => {
    const navLinks = Array.from(document.querySelectorAll('header nav a'));
    const farmerHubLink = navLinks.find(link => link.textContent.trim() === 'Farmer hub');
    const ordersLink = navLinks.find(link => link.textContent.trim() === 'My orders');
    if (farmerHubLink) farmerHubLink.href = 'overview.html';
    if (ordersLink) ordersLink.href = 'orders.html';

    const escapeHtml = text => String(text == null ? '' : text).replace(/[&<>"']/g, ch => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

    // ---- Cart count ----
    const cartLabel = Array.from(document.querySelectorAll('header a[href="cart.html"] span'))
        .find(span => span.textContent.trim().startsWith('Cart'));
    function updateCartCount() {
        if (cartLabel && typeof CartStore !== 'undefined') {
            cartLabel.textContent = `Cart (${CartStore.count()})`;
        }
    }
    updateCartCount();
    document.addEventListener('cart:change', updateCartCount);
    window.addEventListener('storage', updateCartCount);   // cart changed in another tab

    // ---- Profile button ----
    const profileBtn = document.querySelector('header .profile-btn');
    if (!profileBtn) return;

    const avatar = profileBtn.querySelector('.avatar-small');
    const label = profileBtn.querySelector('span');

    function showSignedOut() {
        profileBtn.href = SIGN_IN_PAGE;
        profileBtn.title = 'Sign in or create an account';
        if (avatar) avatar.style.display = 'none';
        if (label) label.textContent = 'Sign in';
        // Signed-out visitors still see "Farmer hub" so farmers can find their way in
        if (farmerHubLink) farmerHubLink.style.display = '';
    }

    function showSignedIn(user) {
        const isFarmer = user.role === 'Farmer';
        if (farmerHubLink) farmerHubLink.style.display = isFarmer ? '' : 'none';

        profileBtn.href = '#';
        profileBtn.title = 'Your account';
        profileBtn.setAttribute('aria-haspopup', 'true');
        profileBtn.setAttribute('aria-expanded', 'false');
        if (avatar) {
            avatar.style.display = '';
            avatar.textContent = `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
        }
        if (label) label.textContent = `${user.firstName} ${user.lastName.charAt(0)}. ⌄`;

        // ---- Menu under the profile button ----
        const accountType = isFarmer
            ? `Farmer · ${user.farmer && user.farmer.farmName ? user.farmer.farmName : 'Farm account'}`
            : user.role === 'Admin' ? 'Admin account' : 'Buyer account';
        const links = isFarmer
            ? '<a href="overview.html">Farmer hub</a><a href="create-listing.html">Create listing</a>'
            : user.role === 'Customer'
                ? '<a href="cart.html">My basket</a>'
                : '';

        const menu = document.createElement('div');
        menu.className = 'header-panel profile-menu';
        menu.hidden = true;
        menu.innerHTML = `
            <div class="header-panel-head">${escapeHtml(user.firstName)} ${escapeHtml(user.lastName)}
                <small>${escapeHtml(accountType)}</small></div>
            ${links}
            <button type="button" class="menu-signout">Sign out</button>`;
        document.body.appendChild(menu);

        function placeMenu() {
            const rect = profileBtn.getBoundingClientRect();
            const width = Math.min(250, window.innerWidth - 32);
            menu.style.top = `${rect.bottom + 10}px`;
            menu.style.left = `${Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16))}px`;
        }
        function closeMenu() {
            menu.hidden = true;
            profileBtn.setAttribute('aria-expanded', 'false');
        }

        profileBtn.addEventListener('click', event => {
            event.preventDefault();
            if (!menu.hidden) return closeMenu();
            document.dispatchEvent(new CustomEvent('header-panel:open', { detail: menu }));
            placeMenu();
            menu.hidden = false;
            profileBtn.setAttribute('aria-expanded', 'true');
        });
        document.addEventListener('click', event => {
            if (!menu.hidden && !menu.contains(event.target) && !profileBtn.contains(event.target)) closeMenu();
        });
        document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
        document.addEventListener('header-panel:open', event => { if (event.detail !== menu) closeMenu(); });
        window.addEventListener('resize', () => { if (!menu.hidden) placeMenu(); });
        window.addEventListener('scroll', () => { if (!menu.hidden) placeMenu(); }, { passive: true });

        menu.querySelector('.menu-signout').addEventListener('click', () => {
            fetch('/api/auth/logout', { method: 'POST' })
                .finally(() => { window.location.href = 'index.html'; });
        });
    }

    // Show "Sign in" straight away so the sample name in the HTML never flashes
    showSignedOut();

    fetch('/api/me')
        .then(res => (res.ok ? res.json() : null))
        .then(data => { if (data && data.user) showSignedIn(data.user); })
        .catch(() => { /* server not running: stay on "Sign in" */ });
});
