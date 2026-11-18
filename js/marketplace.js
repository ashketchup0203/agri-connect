document.addEventListener("DOMContentLoaded", () => {
    const grid = document.getElementById('product-grid');
    
    // We will keep track of which page we are on (starts at 1)
    let currentPage = 1;
    const itemsPerPage = 6;

    function renderCards(page) {
        // 1. Clear whatever is currently in the grid
        grid.innerHTML = '';

        // 2. Convert our product object into an array so we can paginate it
        const allProducts = Object.keys(productData);
        
        // 3. Calculate where to start and end grabbing items
        const startIndex = (page - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const productsToShow = allProducts.slice(startIndex, endIndex);

        // 4. Build the HTML for each product
        productsToShow.forEach(id => {
            const product = productData[id];
            
            // Remove the little arrow from the farmer name if it exists in the data
            const cleanFarmerName = product.farmerFarm.replace(' ⌄', '');
            
            // Create the HTML string for the card exactly as you had it
            const cardHTML = `
                <a href="product.html?id=${id}" class="card-link">
                    <article class="product-card">
                        <button class="favorite-btn">♥</button>
                        <img src="${product.image}" alt="${product.title}">
                        <p class="tag">${product.tag}</p>
                        <h3>${product.title}</h3>
                        <p class="farmer">${cleanFarmerName}</p>
                        <p class="price">J$${product.price.toLocaleString('en-JM')}/${product.unit}</p>
                        <p class="parish">${product.parish}</p>
                    </article>
                </a>
            `;
            
            // Add it to the grid
            grid.innerHTML += cardHTML;
        });

        // 5. Update the pagination text at the bottom
        const totalItems = allProducts.length;
        const showingEnd = Math.min(endIndex, totalItems);
        document.querySelector('.pagination-bar p').textContent = `Showing ${startIndex + 1}–${showingEnd} of ${totalItems} listings`;
    }

     // Initial render on page load
    if (grid) {
        renderCards(currentPage);
    }

    // ==========================================
    // PAGINATION BUTTON LOGIC
    // ==========================================
    const btnNext = document.querySelector('.next-btn');
    const pageBtns = document.querySelectorAll('.page-btn');

    // Figure out how many pages we actually have (e.g., 6 items = 1 page)
    const totalItems = Object.keys(productData).length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    // Hide page buttons that don't have any data behind them
    pageBtns.forEach(btn => {
        if (btn.classList.contains('next-btn')) return; // Skip the Next button
        const btnNum = parseInt(btn.textContent);
        if (btnNum > totalPages) {
            btn.style.display = 'none'; // Hide the button if there's no data for it
        }
    });

    // Handle "Next" button click
    if (btnNext) {
        btnNext.addEventListener('click', () => {
            if (currentPage < totalPages) {
                currentPage++;
                renderCards(currentPage);
                updatePaginationUI();
            } else {
                // If they click next and there are no more pages, loop back to page 1
                currentPage = 1;
                renderCards(currentPage);
                updatePaginationUI();
            }
        });
    }

    // Handle clicking specific page numbers (1, 2, 3...)
    pageBtns.forEach(btn => {
        if (btn.classList.contains('next-btn')) return;
        
        btn.addEventListener('click', (e) => {
            currentPage = parseInt(e.target.textContent);
            renderCards(currentPage);
            updatePaginationUI();
        });
    });

    // This function highlights the active page number
    function updatePaginationUI() {
        pageBtns.forEach(btn => {
            if (btn.classList.contains('next-btn')) return;
            
            const btnNum = parseInt(btn.textContent);
            if (btnNum === currentPage) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
});