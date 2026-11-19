// =========================================
// SIGN IN PAGE (Agri Connect - Sign In.html)
// =========================================

const signinForm = document.getElementById('signin');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const passwordError = document.getElementById('password-error');
const loginError = document.getElementById('login-error');
const rememberBox = signinForm.querySelector('input[name="Remember"]');
const signInButton = signinForm.querySelector('.btn-primary');


// ---- 1. Show / hide password ----
const toggleButton = document.getElementById('toggle-password');

toggleButton.addEventListener('click', () => {
    const isHidden = passwordInput.type === 'password';
    passwordInput.type = isHidden ? 'text' : 'password';
    toggleButton.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
});


// ---- 2. Password rules: at least 1 number and 1 special character ----
function passwordIsValid(password) {
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9\s]/.test(password);   // anything that isn't a letter, number or space
    return hasNumber && hasSpecial;
}

function checkPassword() {
    const valid = passwordIsValid(passwordInput.value);
    passwordError.hidden = valid;
    passwordInput.classList.toggle('auth-invalid', !valid);
    return valid;
}

passwordInput.addEventListener('input', () => {
    if (!passwordError.hidden) checkPassword();
    loginError.hidden = true;
});
emailInput.addEventListener('input', () => {
    emailInput.classList.remove('auth-invalid');
    loginError.hidden = true;
});


// ---- 3. Sign in ----
// If the user was sent here from another page (e.g. ?next=cart.html), go back there after signing in
function pageToReturnTo() {
    const next = new URLSearchParams(window.location.search).get('next') || '';
    // only simple page names (optionally with a product id), never other websites
    return /^[a-z0-9-]+\.html(\?id=\d+)?$/i.test(next) ? next : null;
}

function showLoginError(message) {
    loginError.textContent = message;
    loginError.hidden = false;
}

signinForm.addEventListener('submit', async event => {
    event.preventDefault();   // stop the page from reloading
    loginError.hidden = true;

    if (!emailInput.value.trim() || !emailInput.checkValidity()) {
        emailInput.classList.add('auth-invalid');
        showLoginError('Enter a valid email address.');
        emailInput.focus();
        return;
    }

    if (!checkPassword()) {
        passwordInput.focus();
        return;
    }

    signInButton.disabled = true;
    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: emailInput.value.trim(),
                password: passwordInput.value,
                remember: rememberBox.checked
            })
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            showLoginError(data.error || 'Could not sign in. Please try again.');
            signInButton.disabled = false;
            return;
        }

        window.location.href = pageToReturnTo() || data.redirect || 'index.html';
    } catch (err) {
        showLoginError('Could not reach the server. Make sure it is running, then try again.');
        signInButton.disabled = false;
    }
});


// ---- 4. Continue with Google ----
// Paste your group's Client ID from Google Cloud Console here.
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';

const googleButton = document.getElementById('google-signin');
let googleReady = false;

// Google sends back a signed token for the chosen account.
// The server would check the token and log the user in (route not built yet).
function handleGoogleResponse(response) {
    fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential })
    })
        .then(res => {
            if (!res.ok) throw new Error('Server error');
            window.location.href = 'index.html';
        })
        .catch(err => console.error('Google sign-in: server could not log the user in.', err));
}

googleButton.addEventListener('click', () => {
    // Problems are only written to the browser console (F12), not shown on the page
    if (GOOGLE_CLIENT_ID.startsWith('YOUR_')) {
        console.warn('Google sign-in: add the Google Client ID in js/signin.js.');
        return;
    }
    if (!window.google || !google.accounts) {
        console.warn('Google sign-in: could not load Google. Check the internet connection.');
        return;
    }

    if (!googleReady) {
        google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleGoogleResponse,
            cancel_on_tap_outside: true,
            use_fedcm_for_prompt: true
        });
        googleReady = true;
    }

    // Opens Google's "Continue as ..." box for the account signed in on this browser
    google.accounts.id.prompt();
});
