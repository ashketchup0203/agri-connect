// =========================================
// CREATE ACCOUNT PAGE (Agri Connect - Create Account.html)
// =========================================

const signupForm = document.getElementById('SignUp');
const signupButton = document.getElementById('signup-button');
const signupError = document.getElementById('signup-error');
const farmerFields = document.getElementById('farmer-fields');
const passwordInput = document.getElementById('password');
const passwordHint = document.getElementById('password-hint');
const termsBox = document.getElementById('terms');


// ---- 1. Buyer or Farmer ----
// Farmers also give their farm name and RADA number; the button text matches the choice
function selectedRole() {
    const checked = signupForm.querySelector('input[name="role"]:checked');
    return checked ? checked.value : 'farmer';
}

function updateForRole() {
    const isFarmer = selectedRole() === 'farmer';
    farmerFields.hidden = !isFarmer;
    farmerFields.querySelectorAll('input').forEach(input => { input.disabled = !isFarmer; });
    signupButton.textContent = isFarmer ? ' → Create Farmer Account' : ' → Create Buyer Account';
}

signupForm.querySelectorAll('input[name="role"]').forEach(radio => {
    radio.addEventListener('change', updateForRole);
});
updateForRole();


// ---- 2. Password rules: 8+ characters, 1 number and 1 special character ----
function passwordIsValid(password) {
    return password.length >= 8 && /[0-9]/.test(password) && /[^A-Za-z0-9\s]/.test(password);
}

passwordInput.addEventListener('input', () => {
    if (passwordHint.classList.contains('auth-hint-error')) {
        const valid = passwordIsValid(passwordInput.value);
        passwordHint.classList.toggle('auth-hint-error', !valid);
        passwordInput.classList.toggle('auth-invalid', !valid);
    }
});


// ---- 3. Highlight boxes that need fixing ----
function markInvalid(fields) {
    fields.forEach(field => {
        if (field === termsBox) termsBox.closest('.terms').classList.add('auth-invalid');
        else field.classList.add('auth-invalid');
        if (field === passwordInput) passwordHint.classList.add('auth-hint-error');
    });
}

signupForm.addEventListener('input', event => {
    event.target.classList.remove('auth-invalid');
    signupError.hidden = true;
});
signupForm.addEventListener('change', event => {
    event.target.classList.remove('auth-invalid');
    if (event.target === termsBox) termsBox.closest('.terms').classList.remove('auth-invalid');
});

function showError(message) {
    signupError.textContent = message;
    signupError.hidden = false;
}


// ---- 4. Create the account ----
signupForm.addEventListener('submit', async event => {
    event.preventDefault();   // stop the page from reloading
    signupError.hidden = true;

    // Check every required box (farmer-only boxes are skipped for buyers)
    const missing = Array.from(signupForm.elements).filter(field =>
        field.willValidate && !field.checkValidity()
    );
    if (!passwordIsValid(passwordInput.value) && !missing.includes(passwordInput)) missing.push(passwordInput);

    if (missing.length > 0) {
        markInvalid(missing);
        showError(missing.length === 1
            ? 'Please fix the highlighted field.'
            : `Please fix the ${missing.length} highlighted fields.`);
        missing[0].focus();
        return;
    }

    const value = id => document.getElementById(id).value.trim();
    const payload = {
        role: selectedRole(),
        firstName: value('first-name'),
        lastName: value('last-name'),
        email: value('email'),
        phone: value('phone'),
        parish: document.getElementById('parish').value,
        password: passwordInput.value,
        farmName: selectedRole() === 'farmer' ? value('farm-name') : '',
        radaNumber: selectedRole() === 'farmer' ? value('rada-number') : '',
        agreed: termsBox.checked
    };

    signupButton.disabled = true;
    try {
        const res = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            // The server names the boxes it rejected; highlight them
            const fieldIds = { terms: 'terms', role: null };
            const bad = (data.fields || [])
                .map(name => document.getElementById(fieldIds[name] || name))
                .filter(Boolean);
            markInvalid(bad);
            showError(data.error || 'Could not create your account. Please try again.');
            signupButton.disabled = false;
            return;
        }

        // Signed in straight away: buyers go shopping, farmers go to their listing page
        window.location.href = data.redirect || 'index.html';
    } catch (err) {
        showError('Could not reach the server. Make sure it is running, then try again.');
        signupButton.disabled = false;
    }
});
