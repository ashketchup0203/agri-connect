// =========================================
// PRODUCT PAGE (product.html?id=...)
// Loads one product from the database (/api/products/:id),
// then handles the quantity buttons, Add to cart and Save.
// =========================================
document.addEventListener("DOMContentLoaded", () => {
    const productId = Number(new URLSearchParams(window.location.search).get('id'));
    const main = document.querySelector('main.product-page');
    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    function showNotFound() {
        document.title = 'Product not found | Agri Connect';
        setText('product-breadcrumb', 'Not found');
        if (main) {
            main.innerHTML = `
                <div class="product-not-found">
                    <h1>We couldn't find that product</h1>
                    <p>It may have sold out or been removed by the farmer.</p>
                    <a href="index.html" class="add-to-cart-btn">Back to marketplace</a>
                </div>`;
        }
        const tabs = document.querySelector('.product-tabs');
        if (tabs) tabs.style.display = 'none';
    }

    if (!Number.isInteger(productId) || productId <= 0) {
        showNotFound();
        return;
    }

    fetch(`/api/products/${productId}`)
        .then(res => {
            if (res.status === 404) return null;
            if (!res.ok) throw new Error('Server error');
            return res.json();
        })
        .then(product => {
            if (!product) return showNotFound();
            showProduct(product);
            setUpQuantity(product);
        })
        .catch(() => {
            showNotFound();
            const message = document.querySelector('.product-not-found p');
            if (message) message.textContent = 'Could not reach the server. Make sure it is running, then refresh the page.';
        });


    // ==========================================
    // 1. FILL IN THE PAGE
    // ==========================================
    function showProduct(product) {
        document.title = `${product.title} | Agri Connect`;
        setText('product-breadcrumb', product.title);
        setText('product-title', product.title);
        setText('product-parish', product.parish);
        setText('product-price', product.price.toLocaleString('en-JM'));
        setText('product-unit', product.unit);
        setText('product-desc', product.description);
        setText('product-stock', product.stock);
        setText('stock-unit', product.unit);
        setText('stock-unit-2', product.unit);
        setText('min-order', product.minOrder);
        setText('qty-unit', product.unit);
        setText('product-category', product.category);
        setText('harvest-date-text', product.harvestDate);
        setText('harvest-location-text', product.harvestLoc);
        setText('farmer-farm-name', product.farmerFarm);
        setText('farmer-name', product.farmerName);
        setText('farmer-initials', product.farmerInitials);
        setText('from-the-farm-desc', product.farmDesc);

        // Photos: main image plus up to two thumbnails
        const images = product.images && product.images.length ? product.images : [product.image];
        const mainImg = document.getElementById('main-product-img');
        mainImg.src = images[0];
        mainImg.alt = product.title;
        ['thumb-1', 'thumb-2'].forEach((id, i) => {
            const thumb = document.getElementById(id);
            if (!thumb) return;
            const src = images[i] || images[0];
            if (i > 0 && !images[i]) {
                thumb.style.display = 'none';   // only one photo
                return;
            }
            thumb.src = src;
            thumb.alt = `${product.title} photo ${i + 1}`;
            thumb.addEventListener('click', () => { mainImg.src = src; });
        });

        // Details table (headings change for crops, animal products and live animals)
        product.detailLabels.forEach((label, i) => setText(`th-detail-${i + 1}`, label));
        product.details.forEach((value, i) => setText(`td-detail-${i + 1}`, value));

        // Delivery line
        const deliveryInfo = document.querySelector('.delivery-info');
        if (deliveryInfo) {
            const options = [];
            if (product.delivery) options.push('Delivery from J$800');
            if (product.farmPickup) options.push('Farm pickup is free');
            deliveryInfo.textContent = options.join(' · ') || 'Arrange delivery with the farmer';
        }

        showDeliveryOptions(product);
        loadReviews(product.id);

        // Save button
        const saveBtn = document.getElementById('save-product');
        if (saveBtn) {
            const label = saveBtn.lastChild;
            const showSaved = saved => {
                saveBtn.classList.toggle('is-saved', saved);
                label.textContent = saved ? ' Saved' : ' Save';
            };
            showSaved(CartStore.isSaved(product.id));
            saveBtn.addEventListener('click', () => showSaved(CartStore.toggleSaved(product.id)));
        }
    }


    // ==========================================
    // TABS: Product information / Delivery & pickup / Reviews
    // ==========================================
    const tabLinks = Array.from(document.querySelectorAll('.tab-headers [data-tab]'));
    function openTab(panelId) {
        tabLinks.forEach(link => {
            const on = link.dataset.tab === panelId;
            link.classList.toggle('active', on);
            link.setAttribute('aria-selected', on ? 'true' : 'false');
            const panel = document.getElementById(link.dataset.tab);
            if (panel) panel.hidden = !on;
        });
    }
    tabLinks.forEach(link => link.addEventListener('click', event => {
        event.preventDefault();
        openTab(link.dataset.tab);
    }));
    if (window.location.hash === '#reviews') openTab('panel-reviews');
    const ratingLine = document.getElementById('rating-line');
    if (ratingLine) {
        ratingLine.addEventListener('click', event => {
            event.preventDefault();
            openTab('panel-reviews');
            document.querySelector('.product-tabs').scrollIntoView({ behavior: 'smooth' });
        });
    }


    // ==========================================
    // DELIVERY & PICKUP TAB
    // ==========================================
    function showDeliveryOptions(product) {
        const deliveryRow = document.getElementById('delivery-option');
        const pickupRow = document.getElementById('pickup-option');
        if (!deliveryRow || !pickupRow) return;

        deliveryRow.classList.toggle('unavailable', !product.delivery);
        setText('delivery-option-text', product.delivery
            ? 'Delivered to your door anywhere in Jamaica for a flat J$800 per order. Arrives within 2 days, 9:00 AM–1:00 PM.'
            : 'This farmer does not deliver this product. Choose farm pickup at checkout.');

        pickupRow.classList.toggle('unavailable', !product.farmPickup);
        const where = product.pickupLocation || `${product.farmerFarm}, ${product.parish || 'Jamaica'}`;
        setText('pickup-option-text', product.farmPickup
            ? `Free. Collect from ${where}. Your farmer will confirm a pickup time after you order.`
            : 'Farm pickup is not available for this product.');
    }


    // ==========================================
    // REVIEWS TAB
    // ==========================================
    const escapeHtml = text => String(text == null ? '' : text).replace(/[&<>"']/g, ch => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const starsHtml = rating => {
        const full = Math.round(rating);
        return '★'.repeat(full) + `<span class="off">${'★'.repeat(5 - full)}</span>`;
    };
    let chosenRating = 0;

    function loadReviews(id) {
        return fetch(`/api/products/${id}/reviews`)
            .then(res => (res.ok ? res.json() : Promise.reject(new Error('Server error'))))
            .then(data => showReviews(id, data))
            .catch(() => {
                const list = document.getElementById('reviews-list');
                if (list) list.innerHTML = '<p>Could not load reviews right now.</p>';
            });
    }

    function showReviews(id, data) {
        setText('reviews-tab', `Reviews (${data.count})`);
        setText('rating-line', data.count
            ? `★ ${data.average.toFixed(1)} (${data.count} review${data.count === 1 ? '' : 's'})`
            : '★ No reviews yet');
        setText('rating-average', data.count ? data.average.toFixed(1) : '–');
        document.getElementById('rating-stars').innerHTML = starsHtml(data.average);
        setText('rating-count', data.count
            ? `Based on ${data.count} review${data.count === 1 ? '' : 's'}`
            : 'No reviews yet');

        const list = document.getElementById('reviews-list');
        list.innerHTML = data.reviews.length
            ? data.reviews.map(r => `
                <div class="review">
                    <div class="review-head">
                        <span>${escapeHtml(r.name)} <span class="stars">${starsHtml(r.rating)}</span></span>
                        <span class="review-date">${escapeHtml(r.date)}</span>
                    </div>
                    ${r.comment ? `<p>${escapeHtml(r.comment)}</p>` : ''}
                </div>`).join('')
            : '<p>No one has reviewed this product yet. Buyers can leave a review after ordering it.</p>';

        const form = document.getElementById('review-form');
        const note = document.getElementById('review-note');
        form.hidden = !data.canReview;
        note.innerHTML = {
            'signed-out': `<a href="Agri Connect - Sign In.html?next=${encodeURIComponent(`product.html?id=${id}`)}">Sign in</a> with a buyer account to leave a review after you order.`,
            'not-buyer': 'Only buyer accounts can leave reviews.',
            'not-ordered': 'You can leave a review once you have ordered this product.'
        }[data.reason] || '';

        if (data.canReview) {
            setText('review-form-title', data.myReview ? 'Update your review' : 'Leave a review');
            setText('review-submit', data.myReview ? 'Update review' : 'Post review');
            chosenRating = data.myReview ? data.myReview.rating : 0;
            document.getElementById('review-comment').value = data.myReview ? data.myReview.comment : '';
            paintStars();
        }
    }

    function paintStars() {
        document.querySelectorAll('#star-picker [data-star]').forEach(btn => {
            btn.classList.toggle('on', Number(btn.dataset.star) <= chosenRating);
            btn.setAttribute('aria-checked', Number(btn.dataset.star) === chosenRating ? 'true' : 'false');
        });
    }

    const starPicker = document.getElementById('star-picker');
    if (starPicker) {
        starPicker.addEventListener('click', event => {
            const btn = event.target.closest('[data-star]');
            if (!btn) return;
            chosenRating = Number(btn.dataset.star);
            document.getElementById('review-error').hidden = true;
            paintStars();
        });
    }

    const reviewForm = document.getElementById('review-form');
    if (reviewForm) {
        reviewForm.addEventListener('submit', event => {
            event.preventDefault();
            const error = document.getElementById('review-error');
            const submit = document.getElementById('review-submit');
            if (!chosenRating) {
                error.textContent = 'Please choose a star rating.';
                error.hidden = false;
                return;
            }
            submit.disabled = true;
            fetch(`/api/products/${productId}/reviews`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rating: chosenRating, comment: document.getElementById('review-comment').value })
            })
                .then(res => res.json().catch(() => ({})).then(body => {
                    if (!res.ok) throw new Error(body.error || 'Could not save your review. Please try again.');
                }))
                .then(() => loadReviews(productId))
                .catch(err => {
                    error.textContent = err instanceof TypeError ? 'Could not reach the server. Please try again.' : err.message;
                    error.hidden = false;
                })
                .finally(() => { submit.disabled = false; });
        });
    }


    // ==========================================
    // 2. QUANTITY & ADD TO CART
    // ==========================================
    function setUpQuantity(product) {
        const btnMinus = document.getElementById('btn-minus');
        const btnPlus = document.getElementById('btn-plus');
        const qtyInput = document.getElementById('qty-input');
        const itemTotalText = document.querySelector('.item-total');
        const cartBtn = document.getElementById('add-to-cart');
        const cartBtnText = document.getElementById('cart-btn-text');
        const errorMax = document.getElementById('qty-error-max');
        const errorMin = document.getElementById('qty-error-min');

        const pricePerItem = product.price;
        const minQty = Math.max(1, product.minOrder);

        // How much is already in the cart, so the total can't go over the stock
        const inCart = () => {
            const item = CartStore.items().find(i => i.productId === product.id);
            return item ? item.quantity : 0;
        };
        const maxQty = () => product.stock - inCart();

        errorMax.textContent = `⚠️ Maximum available quantity is ${product.stock} ${product.unit}.`;
        errorMin.textContent = `⚠️ Minimum order quantity is ${minQty} ${product.unit}.`;

        // Sold out (or everything already in the cart)
        function checkAvailability() {
            if (maxQty() < minQty) {
                cartBtn.disabled = true;
                btnMinus.disabled = true;
                btnPlus.disabled = true;
                qtyInput.disabled = true;
                cartBtnText.textContent = product.stock < minQty ? 'Sold out' : 'All available stock is in your cart';
                itemTotalText.textContent = '';
                return false;
            }
            return true;
        }

        qtyInput.value = minQty;
        qtyInput.min = minQty;
        qtyInput.max = Math.max(minQty, maxQty());

        function updateTotal() {
            let qty = parseInt(qtyInput.value) || minQty;
            errorMax.style.display = 'none';
            errorMin.style.display = 'none';

            if (qty < minQty) {
                qty = minQty;
                qtyInput.value = minQty;
                errorMin.style.display = 'block';
            } else if (qty > maxQty()) {
                qty = maxQty();
                qtyInput.value = qty;
                errorMax.textContent = inCart() > 0
                    ? `⚠️ You can add ${maxQty()} more ${product.unit} (${inCart()} already in your cart).`
                    : `⚠️ Maximum available quantity is ${product.stock} ${product.unit}.`;
                errorMax.style.display = 'block';
            }

            const formattedTotal = (qty * pricePerItem).toLocaleString('en-JM');
            itemTotalText.textContent = `Item total: J$${formattedTotal}`;
            cartBtnText.textContent = `Add to cart · J$${formattedTotal}`;
        }

        if (!checkAvailability()) return;
        updateTotal();

        btnMinus.addEventListener('click', () => {
            const current = parseInt(qtyInput.value) || minQty;
            if (current > minQty) {
                qtyInput.value = current - 1;
                updateTotal();
            } else {
                errorMin.style.display = 'block';
            }
        });

        btnPlus.addEventListener('click', () => {
            const current = parseInt(qtyInput.value) || minQty;
            if (current < maxQty()) {
                qtyInput.value = current + 1;
                updateTotal();
            } else {
                errorMax.style.display = 'block';
            }
        });

        qtyInput.addEventListener('change', updateTotal);

        cartBtn.addEventListener('click', () => {
            updateTotal();
            const qty = parseInt(qtyInput.value) || minQty;
            CartStore.add(product.id, qty);

            cartBtnText.textContent = 'Added to cart ✓';
            cartBtn.disabled = true;
            setTimeout(() => {
                cartBtn.disabled = false;
                if (!checkAvailability()) return;
                qtyInput.max = Math.max(minQty, maxQty());
                qtyInput.value = Math.min(minQty, maxQty());
                updateTotal();
            }, 1500);
        });
    }
});
