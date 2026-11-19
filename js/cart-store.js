// =========================================
// CART + SAVED ITEMS (kept in this browser)
// Used by the marketplace, product page, cart page and header.
// The cart only becomes an order in the database when "Place order" is clicked.
// =========================================
const CartStore = (() => {
    const CART_KEY = 'agri-cart';
    const SAVED_KEY = 'agri-saved';

    // Browser storage can be blocked (private windows), so every read/write is protected
    function read(key) {
        try {
            const value = JSON.parse(localStorage.getItem(key));
            return Array.isArray(value) ? value : [];
        } catch (err) {
            return [];
        }
    }

    function write(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (err) {
            /* storage blocked: the cart just won't be remembered */
        }
        document.dispatchEvent(new CustomEvent('cart:change'));
    }

    return {
        // [{ productId, quantity }]
        items() {
            return read(CART_KEY).filter(item =>
                Number.isInteger(item.productId) && Number.isInteger(item.quantity) && item.quantity > 0);
        },

        add(productId, quantity) {
            const items = this.items();
            const existing = items.find(item => item.productId === productId);
            if (existing) existing.quantity += quantity;
            else items.push({ productId, quantity });
            write(CART_KEY, items);
        },

        setQuantity(productId, quantity) {
            const items = this.items().map(item =>
                item.productId === productId ? { ...item, quantity } : item);
            write(CART_KEY, items);
        },

        remove(productId) {
            write(CART_KEY, this.items().filter(item => item.productId !== productId));
        },

        clear() {
            write(CART_KEY, []);
        },

        // Number of different products in the cart (shown as "Cart (3)")
        count() {
            return this.items().length;
        },

        // ---- Saved / favourite products ----
        isSaved(productId) {
            return read(SAVED_KEY).includes(productId);
        },

        toggleSaved(productId) {
            const saved = read(SAVED_KEY);
            const next = saved.includes(productId)
                ? saved.filter(id => id !== productId)
                : [...saved, productId];
            write(SAVED_KEY, next);
            return next.includes(productId);
        }
    };
})();
