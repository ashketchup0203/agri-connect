document.addEventListener("DOMContentLoaded", () => {
    const btnMinus = document.getElementById('btn-minus');
    const btnPlus = document.getElementById('btn-plus');
    const qtyInput = document.getElementById('qty-input');
    const itemTotalText = document.querySelector('.item-total');
    const addToCartBtn = document.querySelector('.add-to-cart-btn');
    
    // Get BOTH error messages based on the exact IDs in the HTML
    const errorMax = document.getElementById('qty-error-max'); 
    const errorMin = document.getElementById('qty-error-min'); 
    
    // --- SET YOUR PRICE AND LIMITS HERE ---
    const pricePerLb = 250;
    const minQty = 5;
    const maxQty = 120; 

    function updateTotal() {
        let qty = parseInt(qtyInput.value) || minQty;
        
        // Hide both errors first
        errorMax.style.display = 'none';
        errorMin.style.display = 'none';

        // 1. Check Minimum
        if (qty < minQty) {
            qty = minQty;
            qtyInput.value = minQty;
            errorMin.style.display = 'block'; // Show MIN error
        } 
        // 2. Check Maximum
        else if (qty > maxQty) {
            qty = maxQty; 
            qtyInput.value = maxQty;
            errorMax.style.display = 'block'; // Show MAX error
        } 

        // Calculate total
        let total = qty * pricePerLb;
        let formattedTotal = total.toLocaleString('en-JM');

        // Update text
        itemTotalText.textContent = `Item total: J$${formattedTotal}`;
        addToCartBtn.innerHTML = `🛒 Add to cart · J$${formattedTotal}`;
    }

    // Run on page load
    updateTotal();

    // Minus button
    btnMinus.addEventListener('click', () => {
        let currentValue = parseInt(qtyInput.value) || minQty;
        if (currentValue > minQty) {
            qtyInput.value = currentValue - 1;
            updateTotal(); // This will hide the errors since we are in a valid range
        } else {
            errorMin.style.display = 'block'; // Show MIN error if they click minus at 5
        }
    });

    // Plus button
    btnPlus.addEventListener('click', () => {
        let currentValue = parseInt(qtyInput.value) || minQty;
        if (currentValue < maxQty) { 
            qtyInput.value = currentValue + 1;
            updateTotal(); // This will hide the errors since we are in a valid range
        } else {
            errorMax.style.display = 'block'; // Show MAX error if they click plus at 120
        }
    });

    // If the user types manually
    qtyInput.addEventListener('change', () => {
        updateTotal();
    });
});