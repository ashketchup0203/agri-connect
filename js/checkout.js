// =========================================
// CART / CHECKOUT PAGE (cart.html)
// Shows what's in the cart, then saves the order to the database
// when "Place order" is clicked.
// Card details are never entered on this site: payment will happen on
// Stripe's secure page (not connected yet, so no payment is taken in this demo).
// =========================================
document.addEventListener('DOMContentLoaded', () => {
    const SIGN_IN_PAGE = 'Agri Connect - Sign In.html';
    const DELIVERY_FEE = 800;

    const basketCard = document.getElementById('basket-card');
    const placeOrderBtn = document.getElementById('place-order');
    const placeOrderText = document.getElementById('place-order-text');
    const checkoutError = document.getElementById('checkout-error');
    const deliveryRadios = Array.from(document.querySelectorAll('input[name="delivery"]'));
    const deliveryOnlyFields = Array.from(document.querySelectorAll('.delivery-only'));
    const field = id => document.getElementById(id);

    let products = new Map();   // productId -> product details from the database
    let currentUser = null;

    const formatPrice = value => `J$${Number(value).toLocaleString('en-JM')}`;
    const escapeHtml = text => String(text).replace(/[&<>"']/g, ch =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));


    // ==========================================
    // 1. BASKET
    // ==========================================
    // Cart items that still exist in the database (sold-out or removed ones are dropped)
    function basketItems() {
        return CartStore.items()
            .filter(item => products.has(item.productId))
            .map(item => ({ ...item, product: products.get(item.productId) }));
    }

    function renderBasket() {
        const items = basketItems();

        if (items.length === 0) {
            basketCard.innerHTML = `
                <h2>Your basket is empty</h2>
                <p class="basket-empty">Browse the marketplace and add some farm-fresh produce.</p>
                <a href="index.html" class="continue-shopping-btn add-to-cart-btn">Go to marketplace</a>`;
            checkDeliveryAvailable();
            updateDeliveryChoice();
            return;
        }

        // Group items by farm, like the original design
        const farms = new Map();
        items.forEach(item => {
            const key = item.product.farmerFarm;
            if (!farms.has(key)) farms.set(key, []);
            farms.get(key).push(item);
        });

        let html = `<h2>Your basket · ${items.length} item${items.length === 1 ? '' : 's'}</h2>`;
        farms.forEach((farmItems, farmName) => {
            const first = farmItems[0].product;
            html += `
                <div class="farmer-tag-row">
                    <p class="farmer-name">${escapeHtml(farmName)} · ${escapeHtml(first.parish)}</p>
                    ${first.verified ? '<span class="verified-badge">Verified farmer</span>' : ''}
                </div>`;
            farmItems.forEach(({ product, quantity }) => {
                html += `
                    <div class="basket-item">
                        <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.title)}">
                        <div class="item-details">
                            <h4><a href="product.html?id=${product.id}">${escapeHtml(product.title)}</a></h4>
                            <p>${formatPrice(product.price)} / ${escapeHtml(product.unit)} · <a href="#" data-remove="${product.id}">Remove</a></p>
                        </div>
                        <div class="item-qty">
                            <button type="button" class="qty-btn" data-change="-1" data-id="${product.id}" aria-label="Less">−</button>
                            <span>${quantity} ${escapeHtml(product.unit)}</span>
                            <button type="button" class="qty-btn" data-change="1" data-id="${product.id}" aria-label="More">+</button>
                        </div>
                        <div class="item-price">${formatPrice(product.price * quantity)}</div>
                    </div>`;
            });
        });
        basketCard.innerHTML = html;
        checkDeliveryAvailable();
        updateDeliveryChoice();
    }

    // Remove and +/- buttons
    basketCard.addEventListener('click', event => {
        const remove = event.target.closest('[data-remove]');
        if (remove) {
            event.preventDefault();
            CartStore.remove(Number(remove.dataset.remove));
            renderBasket();
            return;
        }

        const change = event.target.closest('[data-change]');
        if (change) {
            const id = Number(change.dataset.id);
            const product = products.get(id);
            const item = CartStore.items().find(i => i.productId === id);
            if (!product || !item) return;

            const next = item.quantity + Number(change.dataset.change);
            if (next < product.minOrder) {
                showError(`The minimum order for ${product.title} is ${product.minOrder} ${product.unit}.`);
                return;
            }
            if (next > product.stock) {
                showError(`Only ${product.stock} ${product.unit} of ${product.title} available.`);
                return;
            }
            hideError();
            CartStore.setQuantity(id, next);
            renderBasket();
        }
    });


    // ==========================================
    // 2. DELIVERY OR PICKUP
    // ==========================================
    function deliveryMethod() {
        const checked = deliveryRadios.find(radio => radio.checked);
        return checked ? checked.value : 'Delivery';
    }

    // Home delivery is only offered when every product in the basket can be delivered
    function checkDeliveryAvailable() {
        const deliveryRadio = deliveryRadios.find(radio => radio.value === 'Delivery');
        const pickupRadio = deliveryRadios.find(radio => radio.value === 'Pickup');
        const noDelivery = basketItems().filter(item => !item.product.delivery);
        const warning = field('delivery-warning');

        deliveryRadio.disabled = noDelivery.length > 0;
        field('delivery-label').classList.toggle('disabled', deliveryRadio.disabled);
        if (deliveryRadio.disabled && deliveryRadio.checked) pickupRadio.checked = true;

        warning.hidden = noDelivery.length === 0;
        warning.textContent = noDelivery.length
            ? `Home delivery isn't available for ${noDelivery.map(item => item.product.title).join(', ')}. ` +
              'Choose farm pickup, or remove ' + (noDelivery.length === 1 ? 'it' : 'them') + ' to get home delivery.'
            : '';
    }

    function updateDeliveryChoice() {
        const isDelivery = deliveryMethod() === 'Delivery';
        deliveryRadios.forEach(radio => radio.closest('.radio-label').classList.toggle('active', radio.checked));
        updatePaymentChoice();
        deliveryOnlyFields.forEach(group => {
            group.hidden = !isDelivery;
            group.querySelectorAll('input, select').forEach(input => { input.disabled = !isDelivery; });
        });

        const arrival = new Date();
        arrival.setDate(arrival.getDate() + 2);
        const day = arrival.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
        field('estimate-text').textContent = isDelivery
            ? `Estimated arrival: ${day} · 9:00 AM–1:00 PM`
            : `Ready for farm pickup from ${day}. Your farmer will confirm the time.`;
        updateSummary();
    }

    deliveryRadios.forEach(radio => radio.addEventListener('change', updateDeliveryChoice));


    // ==========================================
    // PAYMENT: debit or credit card for home delivery, cash for farm pickup
    // ==========================================
    const paymentRadios = Array.from(document.querySelectorAll('input[name="payment"]'));
    const CARD_METHODS = ['Debit card', 'Credit card'];

    function paymentMethod() {
        const checked = paymentRadios.find(radio => radio.checked && !radio.disabled);
        return checked ? checked.value : null;
    }

    function updatePaymentChoice() {
        const isDelivery = deliveryMethod() === 'Delivery';
        paymentRadios.forEach(radio => {
            const allowed = isDelivery ? CARD_METHODS.includes(radio.value) : radio.value === 'Cash';
            radio.disabled = !allowed;
            if (!allowed) radio.checked = false;
            radio.closest('.radio-label').classList.toggle('disabled', !allowed);
        });
        // Pickup only has one choice, so pick it for them
        if (!isDelivery) paymentRadios.find(radio => radio.value === 'Cash').checked = true;
        paymentRadios.forEach(radio => radio.closest('.radio-label').classList.toggle('active', radio.checked));

        field('payment-note').innerHTML = isDelivery
            ? 'Home delivery is paid by card. After you place your order, you\'ll pay on <strong>Stripe\'s secure payment page</strong>. Agri Connect never sees or stores your card details.'
            : 'Farm pickup is paid in <strong>cash</strong> when you collect your order from the farmer.';
        updateSteps();
    }

    paymentRadios.forEach(radio => radio.addEventListener('change', () => {
        hideError();
        updatePaymentChoice();
    }));
    field('delivery-parish').addEventListener('change', updateSummary);


    // ==========================================
    // 3. ORDER SUMMARY
    // ==========================================
    function totals() {
        const items = basketItems();
        const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
        const fee = items.length && deliveryMethod() === 'Delivery' ? DELIVERY_FEE : 0;
        return { count: items.length, subtotal, fee, total: subtotal + fee };
    }

    function updateSummary() {
        const { count, subtotal, fee, total } = totals();
        const parish = field('delivery-parish').value;

        field('summary-subtotal-label').textContent = `Subtotal (${count} item${count === 1 ? '' : 's'})`;
        field('summary-subtotal').textContent = formatPrice(subtotal);
        field('summary-delivery-label').textContent = deliveryMethod() === 'Delivery'
            ? (parish ? `Delivery to ${parish}` : 'Home delivery')
            : 'Farm pickup';
        field('summary-delivery').textContent = formatPrice(fee);
        field('summary-total').textContent = formatPrice(total);
        placeOrderText.textContent = count ? `Place order · ${formatPrice(total)}` : 'Your basket is empty';
        placeOrderBtn.disabled = count === 0;
        updateSteps();
    }


    // ==========================================
    // 4. CHECKING THE FORM
    // ==========================================
    function showError(message) {
        checkoutError.textContent = message;
        checkoutError.hidden = false;
    }
    function hideError() {
        checkoutError.hidden = true;
    }

    // mark = false checks quietly (used by the step indicator while typing)
    function markInvalid(input, bad, mark = true) {
        if (mark) input.classList.toggle('field-invalid', bad);
        return bad;
    }

    document.querySelector('.checkout-left').addEventListener('input', event => {
        event.target.classList.remove('field-invalid');
        updateSteps();
    });
    document.querySelector('.checkout-left').addEventListener('change', () => updateSteps());


    // ==========================================
    // STEP INDICATOR: Basket -> Delivery & payment -> Confirmation
    // A step gets a tick when it is really complete.
    // ==========================================
    let orderPlaced = false;

    function setStep(id, state, number) {
        const step = field(id);
        if (!step) return;
        step.classList.remove('done', 'current', 'active');
        if (state) step.classList.add(state);
        step.querySelector('span').textContent = state === 'done' ? '✔' : number;
    }

    function updateSteps() {
        const hasItems = basketItems().length > 0;
        const detailsDone = hasItems && deliveryProblems(false).length === 0 && !!paymentMethod();
        if (orderPlaced) {
            setStep('step-basket', 'done', 1);
            setStep('step-delivery', 'done', 2);
            setStep('step-confirm', 'done', 3);
            return;
        }
        setStep('step-basket', hasItems ? 'done' : 'current', 1);
        setStep('step-delivery', !hasItems ? '' : detailsDone ? 'done' : 'current', 2);
        setStep('step-confirm', detailsDone ? 'current' : '', 3);
    }

    function deliveryProblems(mark = true) {
        const bad = [];
        if (markInvalid(field('recipient-name'), !field('recipient-name').value.trim(), mark)) bad.push('recipient name');
        if (markInvalid(field('recipient-phone'), !/^[0-9+()\-\s]{7,20}$/.test(field('recipient-phone').value.trim()), mark)) bad.push('phone number');
        if (deliveryMethod() === 'Delivery') {
            if (markInvalid(field('delivery-address'), !field('delivery-address').value.trim(), mark)) bad.push('delivery address');
            if (markInvalid(field('delivery-parish'), !field('delivery-parish').value, mark)) bad.push('parish');
        }
        return bad;
    }


    // ==========================================
    // 5. PLACE ORDER
    // ==========================================
    placeOrderBtn.addEventListener('click', async () => {
        hideError();
        const items = basketItems();
        if (items.length === 0) return;

        if (!currentUser) {
            window.location.href = `${SIGN_IN_PAGE}?next=cart.html`;
            return;
        }
        if (!currentUser.customerId) {
            showError('Only buyer accounts can place orders. Sign out and sign in with a buyer account.');
            return;
        }

        const problems = deliveryProblems();
        if (!paymentMethod()) problems.push('payment method');
        if (problems.length > 0) {
            showError(`Please check: ${problems.join(', ')}.`);
            const firstBad = document.querySelector('.checkout-left .field-invalid');
            if (firstBad) firstBad.focus();
            return;
        }

        placeOrderBtn.disabled = true;
        placeOrderText.textContent = 'Placing order…';

        try {
            const res = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items: items.map(item => ({ productId: item.productId, quantity: item.quantity })),
                    deliveryMethod: deliveryMethod(),
                    paymentMethod: paymentMethod(),
                    recipientName: field('recipient-name').value.trim(),
                    phone: field('recipient-phone').value.trim(),
                    address: field('delivery-address').value.trim(),
                    parish: field('delivery-parish').value
                })
            });
            const data = await res.json().catch(() => ({}));

            if (res.status === 401) {
                window.location.href = `${SIGN_IN_PAGE}?next=cart.html`;
                return;
            }
            if (!res.ok) {
                showError(data.error || 'Could not place your order. Please try again.');
                (data.fields || []).forEach(id => { if (field(id)) field(id).classList.add('field-invalid'); });
                if (res.status === 409) await loadProducts();   // stock changed: refresh the basket
                updateSummary();
                return;
            }

            // Done: empty the cart and show the confirmation
            CartStore.clear();
            orderPlaced = true;
            field('order-title').textContent = `Order #${data.orderId} placed!`;
            field('order-message').textContent =
                `Total ${formatPrice(data.total)}. Your farmer will confirm within 24 hours.`;
            field('order-modal').hidden = false;
            renderBasket();
        } catch (err) {
            showError('Could not reach the server. Check that it is running, then try again.');
            updateSummary();
        }
    });


    // ==========================================
    // 6. LOAD EVERYTHING
    // ==========================================
    async function loadProducts() {
        const res = await fetch('/api/products');
        if (!res.ok) throw new Error('Server error');
        const list = await res.json();
        products = new Map(list.map(p => [p.id, p]));

        // Keep cart quantities within what's available now
        CartStore.items().forEach(item => {
            const product = products.get(item.productId);
            if (!product || product.stock < 1) CartStore.remove(item.productId);
            else if (item.quantity > product.stock) CartStore.setQuantity(item.productId, product.stock);
        });
        renderBasket();
    }

    async function loadUser() {
        try {
            const res = await fetch('/api/me');
            if (!res.ok) return;
            currentUser = (await res.json()).user;
            if (!currentUser) return;   // not signed in yet

            // Fill in the buyer's details (they can still change them)
            if (!field('recipient-name').value) field('recipient-name').value = `${currentUser.firstName} ${currentUser.lastName}`;
            if (!field('recipient-phone').value && currentUser.phone) field('recipient-phone').value = currentUser.phone;
            if (!field('delivery-parish').value && currentUser.parish) {
                field('delivery-parish').value = currentUser.parish;
                updateSummary();
            }
        } catch (err) {
            /* not signed in: they'll be asked to sign in when placing the order */
        }
    }

    updateDeliveryChoice();
    loadProducts().catch(() => {
        basketCard.innerHTML = '<h2>Your basket</h2><p class="basket-empty">Could not load your basket. Make sure the server is running, then refresh the page.</p>';
        placeOrderBtn.disabled = true;
    });
    loadUser();
});
