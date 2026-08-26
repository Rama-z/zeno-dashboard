import type { AuthUser } from './api';

export type AuthView = 'login' | 'register' | 'verify';
export type AuthScreenState = {
  busy: boolean;
  message: string;
  error: string;
  verificationStatus: 'idle' | 'pending' | 'success' | 'error';
};

type AuthCallbacks = {
  onLogin: (email: string, password: string) => void;
  onRegister: (displayName: string, email: string, password: string) => void;
  onNavigate: (view: AuthView) => void;
};

type ProfileCallbacks = {
  onSave: (displayName: string) => void;
  onLogout: () => void;
};

export type FontProfileOption = {
  value: string;
  label: string;
  description: string;
  selected: boolean;
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]!));

export function authViewFromPath(pathname: string): AuthView {
  if (pathname === '/register') return 'register';
  if (pathname === '/verify-email') return 'verify';
  return 'login';
}

export function authPath(view: AuthView) {
  return view === 'register' ? '/register' : view === 'verify' ? '/verify-email' : '/login';
}

export function renderAuthScreen(view: AuthView, state: AuthScreenState) {
  const alert = state.error
    ? `<div class="auth-alert error" role="alert">${escapeHtml(state.error)}</div>`
    : state.message ? `<div class="auth-alert success" role="status">${escapeHtml(state.message)}</div>` : '';
  const login = `<form class="auth-card" id="login-form"><div class="auth-card-heading"><p class="eyebrow">WELCOME BACK</p><h1>Login ke Zeno</h1><p>Gunakan akun yang emailnya sudah terverifikasi.</p></div>${alert}<label><span>Email</span><input type="email" name="email" autocomplete="email" required /></label><label><span>Password</span><input type="password" name="password" autocomplete="current-password" required minlength="12" maxlength="72" /></label><button class="auth-submit" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Memproses…' : 'Login'}</button><p class="auth-switch">Belum punya akun? <button type="button" data-auth-view="register">Register</button></p></form>`;
  const register = `<form class="auth-card" id="register-form"><div class="auth-card-heading"><p class="eyebrow">CREATE ACCOUNT</p><h1>Register Zeno</h1><p>Link verifikasi akan dikirim ke email sebelum akun dapat digunakan.</p></div>${alert}<label><span>Nama</span><input name="displayName" autocomplete="name" required minlength="2" maxlength="80" /></label><label><span>Email</span><input type="email" name="email" autocomplete="email" required /></label><label><span>Password</span><input type="password" name="password" autocomplete="new-password" required minlength="12" maxlength="72" /></label><label><span>Konfirmasi password</span><input type="password" name="confirmPassword" autocomplete="new-password" required minlength="12" maxlength="72" /></label><small class="auth-hint">Minimal 12 karakter. Gunakan password unik yang tidak dipakai di tempat lain.</small><button class="auth-submit" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Mengirim verifikasi…' : 'Register & kirim verifikasi'}</button><p class="auth-switch">Sudah punya akun? <button type="button" data-auth-view="login">Login</button></p></form>`;
  const verify = `<div class="auth-card auth-verify-card"><div class="auth-card-heading"><p class="eyebrow">EMAIL VERIFICATION</p><h1>${state.verificationStatus === 'success' ? 'Email terverifikasi' : state.verificationStatus === 'error' ? 'Verifikasi gagal' : 'Memverifikasi email…'}</h1><p>${state.verificationStatus === 'success' ? 'Akun sudah aktif dan sekarang dapat digunakan untuk login.' : state.verificationStatus === 'error' ? escapeHtml(state.error || 'Token tidak valid atau kedaluwarsa.') : 'Mohon tunggu sementara Zeno memeriksa token verifikasi.'}</p></div>${state.verificationStatus === 'pending' ? '<div class="auth-spinner" aria-label="Loading"></div>' : ''}${state.verificationStatus === 'success' ? '<button class="auth-submit" type="button" data-auth-view="login">Lanjut ke Login</button>' : state.verificationStatus === 'error' ? '<button class="auth-submit secondary" type="button" data-auth-view="register">Register ulang</button>' : ''}</div>`;
  return `<main class="auth-shell"><section class="auth-brand-panel"><div class="auth-brand-lockup"><img src="/zeno-logo.png" alt="Zeno" /><div><strong>Zeno</strong><span>PERSONAL WORKSPACE</span></div></div><div class="auth-brand-copy"><p class="eyebrow">SECURE BY DEFAULT</p><h2>Aktivitas, data, dan progres tersimpan atas nama Anda.</h2><p>Setiap perubahan tercatat, setiap record memiliki owner, dan akses hanya tersedia setelah verifikasi email.</p><div class="auth-security-list"><span>✓ Password bcrypt</span><span>✓ Email verification</span><span>✓ HttpOnly session</span><span>✓ Role-based access</span></div></div></section><section class="auth-form-panel">${view === 'register' ? register : view === 'verify' ? verify : login}</section></main>`;
}

export function bindAuthEvents(callbacks: AuthCallbacks) {
  document.querySelectorAll<HTMLButtonElement>('[data-auth-view]').forEach((button) => button.addEventListener('click', () => callbacks.onNavigate(button.dataset.authView as AuthView)));
  document.querySelector<HTMLFormElement>('#login-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    callbacks.onLogin(String(data.get('email') ?? '').trim(), String(data.get('password') ?? ''));
  });
  document.querySelector<HTMLFormElement>('#register-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const password = String(data.get('password') ?? '');
    const confirm = String(data.get('confirmPassword') ?? '');
    if (password !== confirm) {
      const confirmInput = document.querySelector<HTMLInputElement>('[name="confirmPassword"]');
      confirmInput?.setCustomValidity('Konfirmasi password tidak sama.');
      confirmInput?.reportValidity();
      confirmInput?.addEventListener('input', () => confirmInput.setCustomValidity(''), { once: true });
      return;
    }
    callbacks.onRegister(String(data.get('displayName') ?? '').trim(), String(data.get('email') ?? '').trim(), password);
  });
}

export function renderProfilePage(user: AuthUser, busy: boolean, message: string, error: string, fontProfiles: FontProfileOption[] = []) {
  const appearance = fontProfiles.length ? `<section class="settings-card appearance-card"><div class="settings-card-heading"><span class="settings-icon" aria-hidden="true">Aa</span><div><h2>Appearance</h2><p>Preferensi pribadi untuk keterbacaan di semua halaman Zeno.</p></div></div><fieldset class="font-profile-options" role="radiogroup" aria-label="Font profile"><legend class="sr-only">Font profile</legend>${fontProfiles.map((profile) => `<label class="font-profile-option"><input type="radio" name="fontProfile" value="${escapeHtml(profile.value)}" data-font-profile aria-label="${escapeHtml(profile.label)}" ${profile.selected ? 'checked' : ''} /><span>${escapeHtml(profile.label)}</span><small>${escapeHtml(profile.description)}</small></label>`).join('')}</fieldset></section>` : '';
  return `<div class="page-heading"><div><p class="eyebrow">ACCOUNT</p><h1>Profile</h1><p class="subheading">Kelola identitas akun dan session Zeno.</p></div><div class="connection"><span class="pulse"></span><span>Email verified</span></div></div><div class="profile-grid"><form class="settings-card profile-card" id="profile-form"><div class="profile-identity"><div class="profile-avatar">${escapeHtml(user.displayName.slice(0, 1).toUpperCase())}</div><div><h2>${escapeHtml(user.displayName)}</h2><p>${escapeHtml(user.email)}</p><span>${escapeHtml(user.role)}</span></div></div>${error ? `<div class="auth-alert error">${escapeHtml(error)}</div>` : message ? `<div class="auth-alert success">${escapeHtml(message)}</div>` : ''}<label class="profile-field"><span>Display name</span><input name="displayName" value="${escapeHtml(user.displayName)}" minlength="2" maxlength="80" required /></label><label class="profile-field"><span>Email</span><input value="${escapeHtml(user.email)}" readonly /></label><div class="profile-meta"><span>Role <strong>${escapeHtml(user.role)}</strong></span><span>Verified <strong>${new Date(user.emailVerifiedAt).toLocaleDateString('id-ID')}</strong></span></div><button class="settings-save" type="submit" ${busy ? 'disabled' : ''}>${busy ? 'Menyimpan…' : 'Save profile'}</button></form><section class="settings-card session-card"><p class="eyebrow">SESSION</p><h2>Logout</h2><p>Keluar dari session aktif pada browser ini. Session token akan dihapus dari database.</p><button class="logout-button" id="logout-button" type="button" ${busy ? 'disabled' : ''}>Logout dari Zeno</button></section>${appearance}</div>`;
}

export function bindProfileEvents(callbacks: ProfileCallbacks) {
  document.querySelector<HTMLFormElement>('#profile-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    callbacks.onSave(String(data.get('displayName') ?? '').trim());
  });
  document.querySelector<HTMLButtonElement>('#logout-button')?.addEventListener('click', callbacks.onLogout);
}
