// =========================================
// CREATE LISTING PAGE
// =========================================

let currentUser = null;   // filled in from the server (section 6)
const SIGN_IN_PAGE = 'Agri Connect - Sign In.html?next=create-listing.html';

const form = document.getElementById('listing-form');
const formStatus = document.getElementById('form-status');


// -----------------------------------------
// 1. CROPS / LIVESTOCK SETTINGS
// -----------------------------------------
// Everything that changes when the farmer switches category.
const categorySettings = {
    Crops: {
        titleExample: 'e.g. Yellow yam',
        descriptionExample: 'e.g. Freshly dug yellow yam from our Manchester farm. Firm, golden flesh and hand-sorted for quality. Sold by the pound, with delivery or farm pickup available.',
        priceExample: '250',
        quantityExample: '120',
        pickupExample: 'e.g. Green Valley Farm, New Forest',
        units: [
            { value: 'lb', text: 'Pound (lb)' },
            { value: 'kg', text: 'Kilogram (kg)' },
            { value: 'dozen', text: 'Dozen' },
            { value: 'bunch', text: 'Bunch' },
            { value: 'bundle', text: 'Bundle' },
            { value: 'head', text: 'Head (e.g. lettuce)' },
            { value: 'crate', text: 'Crate' }
        ],
        preview: {
            img: 'img/yam-crate.jpg',
            tag: 'Crops · Freshly harvested',
            title: 'Yellow yam',
            price: 'J$250 / lb'
        }
    },
    Livestock: {
        titleExample: 'e.g. Boer goat · young buck',
        descriptionExample: 'e.g. Healthy 8-month-old Boer buck with a white body and red head. Pasture-raised, dewormed and vaccinated. Good breeding stock, calm and easy to handle.',
        priceExample: '90000',
        quantityExample: '1',
        pickupExample: 'e.g. Cedar Hill Livestock, May Pen',
        units: [
            { value: 'head', text: 'Per head' },
            { value: 'pair', text: 'Per pair' },
            { value: 'lot', text: 'Per lot / group' },
            { value: 'bird', text: 'Per bird' },
            { value: 'lb', text: 'Pound (lb) · meat, cheese' },
            { value: 'dozen', text: 'Dozen · eggs' }
        ],
        preview: {
            img: 'img/boer-goat.jpg',
            tag: 'Livestock · Health checked',
            title: 'Boer goat · young buck',
            price: 'J$90,000 / head'
        }
    }
};

const titleInput = document.getElementById('title');
const descriptionInput = document.getElementById('description');
const priceInput = document.getElementById('price');
const unitSelect = document.getElementById('unit');
const quantityInput = document.getElementById('quantity');
const parishSelect = document.getElementById('parish');
const pickupInput = document.getElementById('pickup');

let currentCategory = 'Crops';

function switchCategory(category) {
    currentCategory = category;
    const settings = categorySettings[category];

    // Show this category's sections and hide the other's.
    // Hidden sections are also disabled, so they don't block publishing.
    document.querySelectorAll('[data-category]').forEach(section => {
        const isActive = section.dataset.category === category;
        section.hidden = !isActive;
        section.disabled = !isActive;
    });

    // Example text inside the boxes
    titleInput.placeholder = settings.titleExample;
    descriptionInput.placeholder = settings.descriptionExample;
    priceInput.placeholder = settings.priceExample;
    quantityInput.placeholder = settings.quantityExample;
    pickupInput.placeholder = settings.pickupExample;

    // Selling unit choices
    unitSelect.innerHTML = '<option value="" disabled selected>Choose a unit</option>';
    settings.units.forEach(unit => {
        unitSelect.add(new Option(unit.text, unit.value));
    });

    // Clear any red highlights from the other category
    form.querySelectorAll('.fw-invalid').forEach(field => field.classList.remove('fw-invalid'));
    formStatus.textContent = 'Fill in every field marked * to publish.';
    formStatus.classList.remove('fw-status-error');

    updatePreview();
}

document.querySelectorAll('input[name="Category"]').forEach(radio => {
    radio.addEventListener('change', () => switchCategory(radio.value));
});


// -----------------------------------------
// 2. LIVE LISTING PREVIEW
// -----------------------------------------
// Shows what the farmer types. Until they type, it shows the example.
const previewImg = document.getElementById('preview-img');
const previewTag = document.getElementById('preview-tag');
const previewTitle = document.getElementById('preview-title');
const previewFarm = document.getElementById('preview-farm');
const previewPrice = document.getElementById('preview-price');

let farmName = 'Your farm';
let firstPhotoUrl = null;

function updatePreview() {
    const example = categorySettings[currentCategory].preview;

    previewImg.src = firstPhotoUrl || example.img;
    previewTag.textContent = example.tag;
    previewTitle.textContent = titleInput.value.trim() || example.title;

    const parish = parishSelect.value || 'Parish';
    previewFarm.textContent = `${farmName} ✓ · ${parish}`;

    if (priceInput.value) {
        const price = Number(priceInput.value).toLocaleString('en-JM');
        const unit = unitSelect.value || '…';
        previewPrice.textContent = `J$${price} / ${unit}`;
    } else {
        previewPrice.textContent = example.price;
    }
}

[titleInput, priceInput, unitSelect, parishSelect].forEach(field => {
    field.addEventListener('input', updatePreview);
    field.addEventListener('change', updatePreview);
});


// -----------------------------------------
// 3. PHOTOS
// -----------------------------------------
const photoInput = document.getElementById('photo-upload');
const photoThumbs = document.getElementById('photo-thumbs');
const photoError = document.getElementById('photo-error');
const MAX_PHOTOS = 5;
const MAX_PHOTO_SIZE = 10 * 1024 * 1024;   // 10 MB

photoInput.addEventListener('change', () => {
    const files = Array.from(photoInput.files);
    photoThumbs.innerHTML = '';
    photoError.hidden = true;
    firstPhotoUrl = null;

    let problem = '';
    if (files.length > MAX_PHOTOS) {
        problem = `Please choose up to ${MAX_PHOTOS} photos.`;
    } else if (files.some(file => file.size > MAX_PHOTO_SIZE)) {
        problem = 'Each photo must be 10 MB or smaller.';
    }

    if (problem) {
        photoError.textContent = problem;
        photoError.hidden = false;
        photoInput.value = '';
        updatePreview();
        return;
    }

    files.forEach((file, index) => {
        const url = URL.createObjectURL(file);
        if (index === 0) firstPhotoUrl = url;

        const img = document.createElement('img');
        img.src = url;
        img.alt = file.name;
        img.className = 'fw-thumb';
        photoThumbs.appendChild(img);
    });

    updatePreview();
});

// Show the chosen file's name on the certificate / vet record boxes
document.querySelectorAll('#crop-doc, #vet-doc').forEach(input => {
    input.addEventListener('change', () => {
        const label = document.querySelector(`label[for="${input.id}"] .fw-file-name`);
        if (input.files.length) {
            label.textContent = `${input.files[0].name} ✓`;
        }
    });
});


// -----------------------------------------
// 4. SAVE DRAFT (kept in this browser, per user)
// -----------------------------------------
const draftButton = document.querySelector('.fw-btn-draft');
const publishButton = document.querySelector('.fw-btn-publish');

function draftKey() {
    return currentUser ? `agri-listing-draft-${currentUser.id}` : 'agri-listing-draft';
}

function setStatus(message, type) {
    formStatus.textContent = message;
    formStatus.classList.toggle('fw-status-error', type === 'error');
    formStatus.classList.toggle('fw-status-ok', type === 'ok');
}

draftButton.addEventListener('click', () => {
    const values = {};
    Array.from(form.elements).forEach(field => {
        if (!field.name || field.type === 'file') return;
        if (field.type === 'radio') {
            // Category is saved separately; other choices (like Delivery) are saved by value
            if (field.checked && field.name !== 'Category') values[field.name] = field.value;
            return;
        }
        values[field.name] = field.type === 'checkbox' ? field.checked : field.value;
    });
    const draft = { category: currentCategory, values, savedAt: new Date().toISOString() };

    try {
        localStorage.setItem(draftKey(), JSON.stringify(draft));
        const time = new Date().toLocaleTimeString('en-JM', { hour: 'numeric', minute: '2-digit' });
        setStatus(`Draft saved at ${time}. Photos aren't saved in drafts.`, 'ok');
    } catch (err) {
        setStatus('Could not save a draft in this browser.', 'error');
    }
});

function restoreDraft() {
    let draft = null;
    try {
        draft = JSON.parse(localStorage.getItem(draftKey()));
    } catch (err) {
        return;
    }
    if (!draft || !draft.values) return;

    // Pick the category first, because it changes which units are available
    const radio = document.querySelector(`input[name="Category"][value="${draft.category}"]`);
    if (radio) {
        radio.checked = true;
        switchCategory(draft.category);
    }

    Object.entries(draft.values).forEach(([name, value]) => {
        const field = form.elements.namedItem(name);
        if (!field) return;
        if (field instanceof RadioNodeList) {
            if (name !== 'Category') field.value = value;   // e.g. Delivery: Yes / No
            return;
        }
        if (field.type === 'checkbox') field.checked = value;
        else field.value = value;
    });

    updatePreview();
    setStatus('Your saved draft was loaded. Add photos again before publishing.', 'ok');
}

function clearDraft() {
    try { localStorage.removeItem(draftKey()); } catch (err) { /* ignore */ }
}


// -----------------------------------------
// 5. PUBLISH LISTING (saves to the database)
// -----------------------------------------
const submitModal = document.getElementById('submit-modal');

// Remove the red highlight as soon as a field is filled in
form.addEventListener('input', event => {
    if (event.target.checkValidity && event.target.checkValidity()) event.target.classList.remove('fw-invalid');
});
form.addEventListener('change', event => {
    if (event.target.checkValidity && event.target.checkValidity()) event.target.classList.remove('fw-invalid');
    if (event.target.name === 'Delivery') {
        form.querySelectorAll('input[name="Delivery"]').forEach(radio => radio.classList.remove('fw-invalid'));
        document.getElementById('delivery-choice').classList.remove('fw-invalid');
    }
});

function showMissing(fields) {
    fields.forEach(field => {
        field.classList.add('fw-invalid');
        const group = field.closest('fieldset.fw-delivery-choice');
        if (group) group.classList.add('fw-invalid');
    });
    setStatus(fields.length === 1
        ? '1 required field still needs to be completed.'
        : `${fields.length} required fields still need to be completed.`, 'error');
    fields[0].focus();
    fields[0].reportValidity();   // shows the browser's tip on the first one
}

form.addEventListener('submit', async event => {
    event.preventDefault();   // stop the page from reloading

    // Find every required field that's empty or wrong (hidden sections are skipped)
    const missing = Array.from(form.elements).filter(field =>
        field.willValidate && !field.checkValidity()
    );
    if (missing.length > 0) {
        showMissing(missing);
        return;
    }

    publishButton.disabled = true;
    draftButton.disabled = true;
    setStatus('Publishing your listing…');

    try {
        const res = await fetch('/api/products', {
            method: 'POST',
            body: new FormData(form)   // includes the photos; hidden category sections are left out
        });
        const data = await res.json().catch(() => ({}));

        if (res.status === 401) {
            window.location.href = SIGN_IN_PAGE;
            return;
        }

        if (!res.ok) {
            // The server lists any fields it rejected; highlight them
            const badFields = (data.fields || [])
                .map(name => form.elements.namedItem(name))
                .map(field => (field instanceof RadioNodeList ? field[0] : field))   // a radio group: use its first option
                .filter(Boolean);
            if (badFields.length > 0) {
                showMissing(badFields);
            } else {
                setStatus(data.error || 'Could not publish your listing. Please try again.', 'error');
            }
            publishButton.disabled = false;
            draftButton.disabled = false;
            return;
        }

        clearDraft();
        submitModal.hidden = false;
        setTimeout(() => {
            window.location.href = 'overview.html';
        }, 3000);   // 3 seconds
    } catch (err) {
        setStatus('Could not reach the server. Check that it is running, then try again.', 'error');
        publishButton.disabled = false;
        draftButton.disabled = false;
    }
});


// -----------------------------------------
// 6. SIGNED-IN FARMER (from the database)
// -----------------------------------------
function initials(firstName, lastName) {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function showFarmer(user) {
    const farmer = user.farmer;
    const fullName = `${user.firstName} ${user.lastName}`;
    const parish = farmer.farmParish || user.parish || '';

    // Sidebar box
    document.getElementById('farmer-status').textContent = farmer.verified ? 'Verified farmer' : 'Verification pending';
    document.getElementById('farmer-name').textContent = farmer.farmName || fullName;
    document.getElementById('farmer-location').textContent = parish ? `${fullName} · ${parish}` : fullName;
    document.getElementById('farmer-box').classList.toggle('fw-pending', !farmer.verified);

    // Profile button (top right)
    document.getElementById('profile-initials').textContent = initials(user.firstName, user.lastName);
    document.getElementById('profile-name').textContent = `${user.firstName} ${user.lastName.charAt(0)}.`;

    // Unverified farmers can draft but not publish
    if (!farmer.verified) {
        document.getElementById('verify-banner').hidden = false;
        publishButton.disabled = true;
        publishButton.title = 'Available once your farm is RADA verified';
    }

    // Preview card + default parish
    farmName = farmer.farmName || fullName;
    if (parish && !parishSelect.value) parishSelect.value = parish;
    updatePreview();
}

document.getElementById('sign-out').addEventListener('click', event => {
    event.preventDefault();
    fetch('/api/auth/logout', { method: 'POST' })
        .finally(() => { window.location.href = 'index.html'; });
});

async function loadSignedInFarmer() {
    try {
        const res = await fetch('/api/me');
        if (!res.ok) throw new Error('Server error');
        const data = await res.json();
        if (!data.user) {
            window.location.href = SIGN_IN_PAGE;   // not signed in
            return;
        }

        // Only farmers belong here
        if (data.user.role !== 'Farmer' || !data.user.farmer) {
            window.location.href = 'index.html';
            return;
        }

        currentUser = data.user;
        showFarmer(currentUser);
        restoreDraft();
    } catch (err) {
        document.getElementById('farmer-status').textContent = 'Farmer details unavailable';
        document.getElementById('farmer-name').textContent = 'Start the server to load';
        document.getElementById('farmer-location').textContent = 'your details.';
        setStatus('Could not reach the server. Check that it is running, then reload the page.', 'error');
    }
    document.body.classList.remove('fw-checking');
}


// Set up the page for Crops, then load the signed-in farmer
switchCategory('Crops');
loadSignedInFarmer();
