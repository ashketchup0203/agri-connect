// =========================================
// MARKETPLACE (index.html)
// Products come from the database (/api/products).
// Search, filters and page buttons all work on those products.
// =========================================
document.addEventListener("DOMContentLoaded", () => {
    const grid = document.getElementById('product-grid');
    if (!grid) return;

    const itemsPerPage = 6;
    let currentPage = 1;
    let allProducts = [];

    // ---- Page elements ----
    const searchInput = document.querySelector('.search-container input');
    const searchButton = document.querySelector('.search-container button');
    const categoryRadios = Array.from(document.querySelectorAll('.filters input[name="category"]'));
    const parishSelect = document.querySelector('.filters select');
    const priceRange = document.querySelector('.filters input[type="range"]');
    const priceText = priceRange ? priceRange.parentElement.querySelector('p') : null;
    const statusBoxes = Array.from(document.querySelectorAll('.filters .filter-group input[type="checkbox"]'));
    const verifiedOnlyBox = statusBoxes[0];
    const allFarmersBox = statusBoxes[1];
    const resetLink = document.getElementById('filter-reset');
    const paginationText = document.getElementById('pagination-text');
    const pageControls = document.querySelector('.page-controls');

    // The three category buttons, in order: All, Crops, Livestock
    const categoryValues = ['All', 'Crops', 'Livestock'];
    const categoryNames = ['All produce', 'Crops', 'Livestock'];
    categoryRadios.forEach((radio, i) => { radio.value = categoryValues[i]; });

    const formatPrice = value => `J$${Number(value).toLocaleString('en-JM')}`;

    // Stops product names etc. from being read as HTML
    const escapeHtml = text => String(text).replace(/[&<>"']/g, ch =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));


    // ==========================================
    // 1. FILTERING
    // ==========================================
    function filteredProducts() {
        const search = searchInput ? searchInput.value.trim().toLowerCase() : '';
        const checked = categoryRadios.find(radio => radio.checked);
        const category = checked ? checked.value : 'All';
        const parish = parishSelect && parishSelect.selectedIndex > 0 ? parishSelect.value : '';
        const maxPrice = priceRange ? Number(priceRange.value) : Infinity;
        const verifiedOnly = verifiedOnlyBox ? verifiedOnlyBox.checked : false;

        return allProducts.filter(p => {
            if (category !== 'All' && p.categoryGroup !== category) return false;
            if (parish && p.parish !== parish) return false;
            if (p.price > maxPrice) return false;
            if (verifiedOnly && !p.verified) return false;
            if (search) {
                const text = `${p.title} ${p.farmerFarm} ${p.category} ${p.parish} ${p.tag}`.toLowerCase();
                if (!text.includes(search)) return false;
            }
            return true;
        });
    }

    // Shows the real number of products next to each category
    function updateCategoryCounts() {
        categoryRadios.forEach((radio, i) => {
            const count = categoryValues[i] === 'All'
                ? allProducts.length
                : allProducts.filter(p => p.categoryGroup === categoryValues[i]).length;
            const label = radio.parentElement;
            label.lastChild.textContent = ` ${categoryNames[i]} (${count})`;
        });
    }

    function updatePriceText() {
        if (priceText && priceRange) {
            priceText.textContent = `J$${Number(priceRange.min).toLocaleString('en-JM')} — ${formatPrice(priceRange.value)}`;
        }
    }


    // ==========================================
    // 2. PRODUCT CARDS
    // ==========================================
    function renderCards() {
        const products = filteredProducts();
        const totalPages = Math.max(1, Math.ceil(products.length / itemsPerPage));
        if (currentPage > totalPages) currentPage = totalPages;

        const startIndex = (currentPage - 1) * itemsPerPage;
        const productsToShow = products.slice(startIndex, startIndex + itemsPerPage);

        if (products.length === 0) {
            grid.innerHTML = '<p class="grid-message">No products match your search. Try changing the filters.</p>';
        } else {
            grid.innerHTML = productsToShow.map(product => `
                <a href="product.html?id=${product.id}" class="card-link">
                    <article class="product-card">
                        <button class="favorite-btn${CartStore.isSaved(product.id) ? ' is-saved' : ''}" data-id="${product.id}" aria-label="Save ${escapeHtml(product.title)}">♥</button>
                        <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.title)}">
                        <p class="tag">${escapeHtml(product.tag)}</p>
                        <h3>${escapeHtml(product.title)}</h3>
                        <p class="farmer">${escapeHtml(product.farmerFarm)}</p>
                        <p class="price">${formatPrice(product.price)}/${escapeHtml(product.unit)}</p>
                        <p class="parish">${escapeHtml(product.parish)}</p>
                    </article>
                </a>
            `).join('');
        }

        // "Showing 1–6 of 19 listings"
        if (paginationText) {
            paginationText.textContent = products.length === 0
                ? 'Showing 0 listings'
                : `Showing ${startIndex + 1}–${startIndex + productsToShow.length} of ${products.length} listings`;
        }
        renderPageButtons(totalPages);
    }


    // ==========================================
    // 3. PAGE BUTTONS (1, 2, 3 ... Next)
    // ==========================================
    function renderPageButtons(totalPages) {
        if (!pageControls) return;
        pageControls.innerHTML = '';

        for (let page = 1; page <= totalPages; page++) {
            const btn = document.createElement('button');
            btn.className = `page-btn${page === currentPage ? ' active' : ''}`;
            btn.textContent = page;
            btn.addEventListener('click', () => goToPage(page));
            pageControls.appendChild(btn);
        }

        const next = document.createElement('button');
        next.className = 'page-btn next-btn';
        next.innerHTML = 'Next &rarr;';
        next.disabled = totalPages <= 1;
        // After the last page, Next goes back to page 1
        next.addEventListener('click', () => goToPage(currentPage < totalPages ? currentPage + 1 : 1));
        pageControls.appendChild(next);
    }

    function goToPage(page) {
        currentPage = page;
        renderCards();
        grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function applyFilters() {
        currentPage = 1;
        renderCards();
    }


    // ==========================================
    // 4. FILTER + SEARCH EVENTS
    // ==========================================
    if (searchButton) searchButton.addEventListener('click', applyFilters);
    if (searchInput) {
        searchInput.addEventListener('keydown', event => { if (event.key === 'Enter') applyFilters(); });
        searchInput.addEventListener('input', () => { if (searchInput.value === '') applyFilters(); });
    }
    categoryRadios.forEach(radio => radio.addEventListener('change', applyFilters));
    if (parishSelect) parishSelect.addEventListener('change', applyFilters);
    if (priceRange) {
        priceRange.addEventListener('input', () => { updatePriceText(); applyFilters(); });
    }

    // "Verified farmers only" and "All farmers" work like a switch
    if (verifiedOnlyBox && allFarmersBox) {
        verifiedOnlyBox.addEventListener('change', () => {
            allFarmersBox.checked = !verifiedOnlyBox.checked;
            applyFilters();
        });
        allFarmersBox.addEventListener('change', () => {
            verifiedOnlyBox.checked = !allFarmersBox.checked;
            applyFilters();
        });
    }

    if (resetLink) {
        resetLink.addEventListener('click', event => {
            event.preventDefault();
            if (searchInput) searchInput.value = '';
            if (categoryRadios[0]) categoryRadios[0].checked = true;
            if (parishSelect) parishSelect.selectedIndex = 0;
            if (priceRange) priceRange.value = priceRange.max;
            if (verifiedOnlyBox) verifiedOnlyBox.checked = true;
            if (allFarmersBox) allFarmersBox.checked = false;
            updatePriceText();
            applyFilters();
        });
    }

    // Heart button: save the product without opening it
    grid.addEventListener('click', event => {
        const heart = event.target.closest('.favorite-btn');
        if (!heart) return;
        event.preventDefault();
        event.stopPropagation();
        const saved = CartStore.toggleSaved(Number(heart.dataset.id));
        heart.classList.toggle('is-saved', saved);
    });


    // ==========================================
    // 5. LOAD PRODUCTS FROM THE DATABASE
    // ==========================================
    grid.innerHTML = '<p class="grid-message">Loading products…</p>';

    fetch('/api/products')
        .then(res => {
            if (!res.ok) throw new Error('Server error');
            return res.json();
        })
        .then(products => {
            allProducts = products;

            // Price slider goes up to the most expensive product
            if (priceRange && products.length) {
                const highest = Math.max(...products.map(p => p.price));
                priceRange.max = Math.ceil(highest / 1000) * 1000;
                priceRange.value = priceRange.max;
            }
            if (verifiedOnlyBox && allFarmersBox) allFarmersBox.checked = !verifiedOnlyBox.checked;

            updateCategoryCounts();
            updatePriceText();
            renderCards();
        })
        .catch(() => {
            grid.innerHTML = '<p class="grid-message">Could not load products. Make sure the server is running, then refresh the page.</p>';
            if (paginationText) paginationText.textContent = 'Showing 0 listings';
            if (pageControls) pageControls.innerHTML = '';
        });
});
