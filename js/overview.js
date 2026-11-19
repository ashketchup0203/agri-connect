// =========================================
// FARMER HUB OVERVIEW (overview.html)
// Fills the page from the database (/api/farmer/overview):
// greeting, verified box, stats, recent orders, listings and the weekly sales chart.
// Farmers can confirm new orders from the Recent orders table.
// =========================================
const SIGN_IN_PAGE = 'Agri Connect - Sign In.html';

document.addEventListener('DOMContentLoaded', () => {
    const $ = id => document.getElementById(id);
    const money = amount => `J$${Math.round(amount).toLocaleString('en-JM')}`;
    const escapeHtml = text => String(text == null ? '' : text).replace(/[&<>"']/g, ch => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
    const percentChange = (now, before) => Math.round(((now - before) / before) * 1000) / 10;

    // ---- Header: cart count and sign out ----
    const cartLink = $('cart-link');
    const updateCart = () => { cartLink.textContent = `🧺 Cart (${CartStore.count()})`; };
    updateCart();
    document.addEventListener('cart:change', updateCart);
    window.addEventListener('storage', updateCart);

    $('sign-out').addEventListener('click', event => {
        event.preventDefault();
        fetch('/api/auth/logout', { method: 'POST' })
            .finally(() => { window.location.href = 'index.html'; });
    });

    function showError(message) {
        const box = $('page-error');
        box.textContent = message;
        box.hidden = false;
    }

    // ---- Load the page ----
    function load() {
        return fetch('/api/farmer/overview')
            .then(res => {
                if (res.status === 401) {
                    window.location.href = `${SIGN_IN_PAGE}?next=overview.html`;
                    return null;
                }
                if (res.status === 403) {
                    window.location.href = 'index.html';   // buyers and admins don't have a farmer hub
                    return null;
                }
                if (!res.ok) {
                    return res.json().catch(() => ({})).then(body => {
                        throw new Error(body.error || 'Something went wrong on our side. Please refresh the page.');
                    });
                }
                return res.json();
            })
            .then(data => { if (data) showOverview(data); })
            .catch(err => {
                showError(err instanceof TypeError
                    ? 'Could not reach the server. Make sure it is running, then refresh the page.'
                    : err.message);
            });
    }
    load();

    function showOverview(data) {
        $('page-error').hidden = true;
        showFarmer(data);
        showStats(data.stats);
        showOrders(data.recentOrders);
        showListings(data.listings, data.totalListings);
        showWeek(data.week);
    }

    // ---- Greeting and verified box ----
    function showFarmer({ farmer, today, hour }) {
        const farmName = farmer.farmName || `${farmer.lastName} Family Farm`;
        const partOfDay = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

        $('today').textContent = today;
        $('greeting').textContent = `${partOfDay}, ${farmer.firstName}.`;
        $('subtitle').textContent = `Here’s what’s growing at ${farmName} today.`;

        $('ver-farm').textContent = farmName;
        $('ver-parish').textContent = farmer.parish ? `${farmer.parish}, Jamaica` : 'Jamaica';
        $('ver-title').textContent = farmer.verified ? 'Verified farmer' : 'Verification pending';
        $('ver-icon').textContent = farmer.verified ? '✓' : '◯';
        $('ver-box').classList.toggle('pending', !farmer.verified);
        $('verify-notice').hidden = farmer.verified;
    }

    // ---- Stat cards and alert ----
    function showStats(stats) {
        $('stat-sales').textContent = money(stats.monthSales);
        if (stats.lastMonthSales > 0) {
            const change = percentChange(stats.monthSales, stats.lastMonthSales);
            $('stat-sales-sub').textContent = `${change >= 0 ? '+' : ''}${change}% from ${stats.lastMonthName}`;
        } else {
            $('stat-sales-sub').textContent = `No sales in ${stats.lastMonthName}`;
        }

        $('stat-listings').textContent = stats.activeListings;
        const listingNotes = [];
        if (stats.lowStock > 0) listingNotes.push(`${stats.lowStock} running low`);
        if (stats.pendingReview > 0) listingNotes.push(`${stats.pendingReview} waiting for review`);
        $('stat-listings-sub').textContent = listingNotes.join(' · ') || 'All well stocked';

        $('stat-orders').textContent = stats.ordersToFulfil;
        $('stat-orders-sub').textContent = stats.needConfirmation > 0
            ? `${stats.needConfirmation} awaiting your confirmation`
            : 'Nothing waiting on you';

        $('stat-rating').textContent = stats.rating ? `${stats.rating.toFixed(1)} / 5` : 'New';
        $('stat-rating-sub').textContent = stats.reviews > 0
            ? `From ${stats.reviews} review${stats.reviews === 1 ? '' : 's'} · ${plural(stats.buyers, 'buyer')} served`
            : stats.buyers > 0
                ? `No reviews yet · ${plural(stats.buyers, 'buyer')} served`
                : 'No reviews yet';

        const waiting = stats.needConfirmation;
        $('alert').hidden = waiting === 0;
        $('alert-text').textContent = `${plural(waiting, 'new order')} ${waiting === 1 ? 'needs' : 'need'} confirmation. ` +
            'Respond within 24 hours to keep buyers informed.';
    }

    // ---- Recent orders ----
    const STATUS_TEXT = {
        Pending: () => 'Needs confirmation',
        Confirmed: order => (order.pickup ? 'Ready for pickup' : 'Confirmed'),
        Shipped: () => 'Out for delivery',
        Delivered: () => 'Delivered',
        Cancelled: () => 'Cancelled'
    };

    function showOrders(orders) {
        const body = $('orders-body');
        if (orders.length === 0) {
            body.innerHTML = '<tr><td colspan="6" class="empty">No orders yet. When buyers order your products, they will show up here.</td></tr>';
            return;
        }
        body.innerHTML = orders.map(order => `
            <tr>
              <td><b>${escapeHtml(order.number)} · ${escapeHtml(order.buyer)}</b></td>
              <td>${order.items.map(escapeHtml).join('<br><div style="height:5px"></div>')}</td>
              <td>${money(order.total)}</td>
              <td>${escapeHtml(order.date)} · ${escapeHtml(order.place)}</td>
              <td class="status-${escapeHtml(order.status)}">${(STATUS_TEXT[order.status] || (() => order.status))(order)}</td>
              <td class="act">${order.status === 'Pending'
                ? `<button type="button" data-confirm="${order.id}">Confirm →</button>`
                : '<a href="orders.html">View order →</a>'}</td>
            </tr>`).join('');
    }

    // Confirm an order, then reload the numbers
    $('orders-body').addEventListener('click', event => {
        const button = event.target.closest('button[data-confirm]');
        if (!button) return;
        button.disabled = true;
        button.textContent = 'Confirming…';
        fetch(`/api/farmer/orders/${button.dataset.confirm}/confirm`, { method: 'POST' })
            .then(res => res.json().catch(() => ({})).then(body => {
                if (!res.ok) throw new Error(body.error || 'Could not confirm the order. Please try again.');
            }))
            .then(() => {
                document.dispatchEvent(new CustomEvent('notifications:refresh'));
                return load();
            })
            .catch(err => {
                showError(err instanceof TypeError ? 'Could not reach the server. Please try again.' : err.message);
                load();
            });
    });

    // ---- Listings ----
    function showListings(listings, total) {
        const box = $('listings');
        if (listings.length === 0) {
            box.innerHTML = '<div class="empty">You have no listings yet. Click “Create listing” to add your first one.</div>';
        } else {
            box.innerHTML = listings.map(item => `
                <div class="li">
                  <img class="th" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}">
                  <div>
                    <div class="n">${item.approved
                      ? `<a href="product.html?id=${item.id}">${escapeHtml(item.name)}</a>`
                      : escapeHtml(item.name)}</div>
                    <div class="d">${money(item.price)} / ${escapeHtml(item.unit)} · ${item.quantity} ${escapeHtml(item.unit)} available</div>
                  </div>
                  <span class="pill ${item.state.replace(/\s+/g, '-')}">${escapeHtml(item.state)}</span>
                  <a class="edit" href="my-listings.html">Edit</a>
                </div>`).join('');
        }
        $('manage-link').textContent = total > 0 ? `Manage all ${plural(total, 'listing')} →` : 'Manage your listings →';
    }

    // ---- Sales this week chart ----
    function showWeek(week) {
        const highest = Math.max(...week.days.map(d => d.total));
        $('bars').innerHTML = week.days.map((day, i) => {
            const height = highest > 0 ? Math.max(3, Math.round((day.total / highest) * 100)) : 3;
            return `<div class="${i === week.days.length - 1 ? 'today' : ''}" style="height:${height}%" title="${money(day.total)}"></div>`;
        }).join('');
        $('days').innerHTML = week.days.map(day => `<span>${escapeHtml(day.letter)}</span>`).join('');
        $('week-meta').textContent = `${money(week.total)} · ${week.from} – ${week.to}`;

        let compare;
        if (week.previousTotal > 0) {
            const change = percentChange(week.total, week.previousTotal);
            compare = `${change >= 0 ? '↑' : '↓'} ${Math.abs(change)}% compared with last week`;
        } else {
            compare = week.total > 0 ? 'Your first sales this fortnight' : 'No sales yet this week';
        }
        $('week-compare').textContent = compare;
    }
});
