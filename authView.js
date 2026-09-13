// authView.js — email/password login and account creation.
// Renders into document.body, replaces itself with the app on success.

export function showAuth(supabase, onSuccess) {
  let mode = 'login'; // 'login' | 'signup'

  function render() {
    document.body.innerHTML = `
      <div class="auth-bg">
        <div class="auth-card">
          <div class="auth-logo">
            <div class="auth-mark">P</div>
            <span class="auth-wordmark">Planr</span>
          </div>
          <div class="auth-title">${mode === 'login' ? 'Sign in to your workspace' : 'Create your account'}</div>

          <div class="auth-form" id="authForm">
            <div class="auth-field">
              <label class="auth-label" for="authEmail">Work email</label>
              <input class="auth-input" type="email" id="authEmail" placeholder="you@solusign.com" autocomplete="email">
            </div>
            <div class="auth-field">
              <label class="auth-label" for="authPwd">Password</label>
              <div class="auth-pwd-wrap">
                <input class="auth-input" type="password" id="authPwd" placeholder="••••••••" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}">
                <button class="auth-eye" id="eyeBtn" type="button" aria-label="Show password"><i class="ti ti-eye"></i></button>
              </div>
            </div>
            ${mode === 'signup' ? `
            <div class="auth-field">
              <label class="auth-label" for="authPwd2">Confirm password</label>
              <div class="auth-pwd-wrap">
                <input class="auth-input" type="password" id="authPwd2" placeholder="••••••••" autocomplete="new-password">
              </div>
            </div>` : ''}
            <div class="auth-error" id="authErr"></div>
            <button class="auth-submit" id="authSubmit">
              ${mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </div>

          <div class="auth-switch">
            ${mode === 'login'
              ? `Don't have an account? <button class="auth-link" id="switchMode">Create one</button>`
              : `Already have an account? <button class="auth-link" id="switchMode">Sign in</button>`}
          </div>
        </div>
      </div>`;

    // toggle password visibility
    const eyeBtn = document.getElementById('eyeBtn');
    const pwdInput = document.getElementById('authPwd');
    eyeBtn?.addEventListener('click', () => {
      const show = pwdInput.type === 'password';
      pwdInput.type = show ? 'text' : 'password';
      eyeBtn.innerHTML = show ? '<i class="ti ti-eye-off"></i>' : '<i class="ti ti-eye"></i>';
    });

    // switch mode
    document.getElementById('switchMode')?.addEventListener('click', () => {
      mode = mode === 'login' ? 'signup' : 'login';
      render();
    });

    // submit
    document.getElementById('authSubmit')?.addEventListener('click', handleSubmit);
    document.getElementById('authPwd')?.addEventListener('keydown', e => { if (e.key === 'Enter') handleSubmit(); });
    document.getElementById('authEmail')?.focus();
  }

  async function handleSubmit() {
    const email = document.getElementById('authEmail')?.value?.trim();
    const pwd   = document.getElementById('authPwd')?.value;
    const pwd2  = document.getElementById('authPwd2')?.value;
    const errEl = document.getElementById('authErr');
    const btn   = document.getElementById('authSubmit');

    errEl.textContent = '';
    if (!email || !pwd) { errEl.textContent = 'Enter your email and password.'; return; }

    if (mode === 'signup') {
      if (pwd.length < 8) { errEl.textContent = 'Password must be at least 8 characters.'; return; }
      if (pwd !== pwd2)   { errEl.textContent = 'Passwords don\'t match.'; return; }
    }

    btn.textContent = mode === 'login' ? 'Signing in…' : 'Creating account…';
    btn.disabled = true;

    try {
      let result;
      if (mode === 'login') {
        result = await supabase.auth.signInWithPassword({ email, password: pwd });
      } else {
        result = await supabase.auth.signUp({ email, password: pwd });
      }

      if (result.error) {
        errEl.textContent = friendlyError(result.error.message);
        btn.textContent = mode === 'login' ? 'Sign in' : 'Create account';
        btn.disabled = false;
        return;
      }

      if (mode === 'signup' && result.data?.user && !result.data.session) {
        // email confirmation required — Supabase sent a confirmation email
        document.body.innerHTML = `
          <div class="auth-bg">
            <div class="auth-card" style="text-align:center">
              <div class="auth-logo" style="justify-content:center"><div class="auth-mark">P</div></div>
              <div class="auth-title">Check your email</div>
              <p style="font-size:14px;color:#6B7280;line-height:1.6;margin-top:8px">
                We sent a confirmation link to <strong>${email}</strong>.<br>
                Click it and then come back to sign in.
              </p>
              <button class="auth-submit" style="margin-top:24px" onclick="location.reload()">Back to sign in</button>
            </div>
          </div>`;
        return;
      }

      onSuccess(result.data.user);
    } catch (e) {
      errEl.textContent = 'Something went wrong. Try again.';
      btn.textContent = mode === 'login' ? 'Sign in' : 'Create account';
      btn.disabled = false;
    }
  }

  function friendlyError(msg) {
    if (msg.includes('Invalid login credentials'))  return 'Wrong email or password.';
    if (msg.includes('Email not confirmed'))         return 'Please confirm your email first.';
    if (msg.includes('User already registered'))    return 'An account with that email already exists. Sign in instead.';
    if (msg.includes('Password should be'))         return 'Password must be at least 8 characters.';
    return msg;
  }

  render();
}
