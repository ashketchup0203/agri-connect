document.addEventListener("DOMContentLoaded", () => {
    
    // ==========================================
    // 1. LOAD DYNAMIC PRODUCT DATA
    // ==========================================
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id') || 'yam'; // Defaults to yam
    const product = productData[productId];

    // If we are on the product page and found the product data
    if (product) {
        document.getElementById('product-breadcrumb').textContent = product.title;
        document.getElementById('product-title').textContent = product.title;
        document.getElementById('product-parish').textContent = product.parish;
        document.getElementById('product-price').textContent = product.price.toLocaleString('en-JM');
        document.getElementById('product-unit').textContent = product.unit;
        document.getElementById('product-desc').textContent = product.description;
        document.getElementById('product-stock').textContent = product.stock;
        document.getElementById('stock-unit').textContent = product.unit;
        document.getElementById('stock-unit-2').textContent = product.unit;
        document.getElementById('qty-unit').textContent = product.unit;
        document.getElementById('main-product-img').src = product.image;
        document.title = `${product.title} | Agri Connect`;
        document.getElementById('product-category').textContent = product.category;
        document.getElementById('harvest-date-text').textContent = product.harvestDate;
        document.getElementById('harvest-location-text').textContent = product.harvestLoc;
        document.getElementById('farmer-farm-name').textContent = product.farmerFarm;
        document.getElementById('farmer-name').textContent = product.farmerName;
        document.getElementById('farmer-initials').textContent = product.farmerInitials;
        document.getElementById('from-the-farm-desc').textContent = product.farmDesc;
        
        // Update thumbnails
        document.getElementById('thumb-1').src = product.image;
        document.getElementById('thumb-2').src = product.image;

        // Update Table
        document.getElementById('td-detail-1').textContent = product.detail1;
        document.getElementById('td-detail-2').textContent = product.detail2;
        document.getElementById('td-detail-3').textContent = product.detail3;
        document.getElementById('td-detail-4').textContent = product.detail4;
        
        // Dynamic Table Headers (changes based on Crops vs Livestock)
        if (product.unit === 'head') {
            document.getElementById('th-detail-1').textContent = "BREED";
            document.getElementById('th-detail-2').textContent = "AGE";
            document.getElementById('th-detail-3').textContent = "WEIGHT";
            document.getElementById('th-detail-4').textContent = "HEALTH";
        }
        // ---------------------------
    }

    // ==========================================
    // 2. QUANTITY & CART LOGIC
    // ==========================================
    const btnMinus = document.getElementById('btn-minus');
    const btnPlus = document.getElementById('btn-plus');
    const qtyInput = document.getElementById('qty-input');
    const itemTotalText = document.querySelector('.item-total');
    const cartBtnText = document.getElementById('cart-btn-text');
    
    const errorMax = document.getElementById('qty-error-max'); 
    const errorMin = document.getElementById('qty-error-min'); 
    
    // Only run this logic if the elements exist on the page
    if (btnMinus && btnPlus && qtyInput) {
        
        // Pull values from the loaded product data, or default to yam
        const pricePerItem = product ? product.price : 250;
        const maxQty = product ? product.stock : 120;
        // If it's livestock (sold by "head"), min is 1. Otherwise, min is 5.
        const minQty = product && (product.unit === 'head' || product.unit === 'bird') ? 1 : 5;

        // Set the default value in the input box based on the min
        qtyInput.value = minQty;
        qtyInput.min = minQty;
        qtyInput.max = maxQty;

        function updateTotal() {
            let qty = parseInt(qtyInput.value) || minQty;
            
            errorMax.style.display = 'none';
            errorMin.style.display = 'none';

            if (qty < minQty) {
                qty = minQty;
                qtyInput.value = minQty;
                errorMin.style.display = 'block'; 
            } 
            else if (qty > maxQty) {
                qty = maxQty; 
                qtyInput.value = maxQty;
                errorMax.style.display = 'block'; 
            } 

            let total = qty * pricePerItem;
            let formattedTotal = total.toLocaleString('en-JM');

            itemTotalText.textContent = `Item total: J$${formattedTotal}`;
            cartBtnText.textContent = `Add to cart · J$${formattedTotal}`;
        }

        updateTotal();

        btnMinus.addEventListener('click', () => {
            let currentValue = parseInt(qtyInput.value) || minQty;
            if (currentValue > minQty) {
                qtyInput.value = currentValue - 1;
                updateTotal(); 
            } else {
                errorMin.style.display = 'block';
            }
        });

        btnPlus.addEventListener('click', () => {
            let currentValue = parseInt(qtyInput.value) || minQty;
            if (currentValue < maxQty) { 
                qtyInput.value = currentValue + 1;
                updateTotal(); 
            } else {
                errorMax.style.display = 'block';
            }
        });

        qtyInput.addEventListener('change', () => {
            updateTotal();
        });
    }
});