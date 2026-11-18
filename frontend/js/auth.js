/**
 * RIVERGUARD AI — AUTHENTICATION & PROFILE CONTROLLER
 * Sign-in, direct operator registration, profile management,
 * and administrator operator access verification.
 */

document.addEventListener('DOMContentLoaded', () => {
  initLoginForm();
  initRegisterForm();
  initForgotPasswordForm();
  initProfileForm();
});

/* Inline form error helpers */
function showFormError(boxId, message) {
  const box = document.getElementById(boxId);
  if (!box) { showToast(message, 'emergency'); return; }
  const text = box.querySelector('span');
  if (text) text.textContent = message;
  box.classList.remove('hidden');
}

function clearFormError(boxId) {
  const box = document.getElementById(boxId);
  if (box) box.classList.add('hidden');
}

function setButtonLoading(btn, loading, idleLabel, busyLabel) {
  if (!btn) return;
  btn.disabled = loading;
  btn.innerHTML = loading ? `<span class="spinner"></span> ${busyLabel}` : idleLabel;
}

/* ------------------------------------------------------------------ LOGIN */
function initLoginForm() {
  const form = document.getElementById('loginForm');
  if (!form) return;
  const btn = document.getElementById('loginSubmitBtn') || form.querySelector('button[type="submit"]');

  // Check if redirected from registration or password reset page
  const urlParams = new URLSearchParams(window.location.search);
  const isRegistered = urlParams.get('registered') === 'true';
  const registeredEmail = urlParams.get('email');
  const isReset = urlParams.get('reset') === 'true';
  const resetEmail = urlParams.get('email');
  const successBanner = document.getElementById('registerSuccessBanner');

  if (isRegistered) {
    if (successBanner) successBanner.classList.remove('hidden');
    if (registeredEmail) {
      const emailInput = document.getElementById('loginEmail');
      if (emailInput) {
        emailInput.value = registeredEmail;
      }
    }
    const passInput = document.getElementById('loginPassword');
    if (passInput) passInput.focus();
  } else if (isReset) {
    if (successBanner) {
      const bannerText = document.getElementById('registerSuccessText');
      if (bannerText) bannerText.textContent = 'Password reset successfully! Enter your new password to sign in.';
      successBanner.classList.remove('hidden');
    }
    if (resetEmail) {
      const emailInput = document.getElementById('loginEmail');
      if (emailInput) emailInput.value = resetEmail;
    }
    const passInput = document.getElementById('loginPassword');
    if (passInput) passInput.focus();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormError('loginError');
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
      showFormError('loginError', 'Enter your email and password.');
      return;
    }

    setButtonLoading(btn, true, 'Sign in', 'Signing in…');
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        sessionStorage.setItem('rg_user', JSON.stringify(data.user));
        window.location.href = 'index.html';
        return;
      }
      showFormError('loginError', data.message || 'Incorrect email or password.');
    } catch (err) {
      showFormError('loginError', 'Cannot reach the server. Check that it is running and try again.');
    }
    setButtonLoading(btn, false, 'Sign in');
  });
}

/* --------------------------------------------------------------- REGISTER */
function initRegisterForm() {
  const form = document.getElementById('registerForm');
  if (!form) return;
  const btn = document.getElementById('btnSubmitRegister');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormError('registerError');
    const name = document.getElementById('regName').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;

    if (!name || !phone || !email || !password) {
      showFormError('registerError', 'Fill in your name, mobile number, email, and password.');
      return;
    }
    if (!/^\+?[\d\s\-()]{10,18}$/.test(phone)) {
      showFormError('registerError', 'Enter a valid mobile number with country code, e.g. +91 98765 43210.');
      return;
    }
    if (password.length < 6) {
      showFormError('registerError', 'Password must be at least 6 characters.');
      return;
    }

    setButtonLoading(btn, true, 'Create account', 'Creating account…');
    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, email, password })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        showToast('Account created successfully! Please sign in with your email and password.', 'safe');
        setTimeout(() => {
          window.location.href = `login.html?registered=true&email=${encodeURIComponent(email)}`;
        }, 800);
        return;
      }
      showFormError('registerError', data.message || 'Registration failed. Try again.');
    } catch (err) {
      showFormError('registerError', 'Cannot reach the server. Check that it is running and try again.');
    }
    setButtonLoading(btn, false, 'Create account');
  });
}

/* -------------------------------------------------------- FORGOT PASSWORD */
function initForgotPasswordForm() {
  const form = document.getElementById('forgotPasswordForm');
  if (!form) return;
  const btn = document.getElementById('btnSubmitReset');
  const banner = document.getElementById('resetSuccessBanner');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormError('resetError');
    const identifier = document.getElementById('resetIdentifier').value.trim();
    const newPassword = document.getElementById('resetNewPassword').value;
    const confirmPassword = document.getElementById('resetConfirmPassword').value;

    if (!identifier) {
      showFormError('resetError', 'Please enter your registered email or mobile number.');
      return;
    }

    if (!newPassword) {
      showFormError('resetError', 'Please enter a new password.');
      return;
    }

    if (newPassword.length < 6) {
      showFormError('resetError', 'Password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      showFormError('resetError', 'New passwords do not match. Please re-enter.');
      return;
    }

    setButtonLoading(btn, true, 'Reset Password', 'Resetting password…');
    try {
      const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: identifier, password: newPassword })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        if (banner) banner.classList.remove('hidden');
        showToast('Password reset successfully!', 'safe');
        setTimeout(() => {
          window.location.href = `login.html?reset=true&email=${encodeURIComponent(data.email || identifier)}`;
        }, 1200);
        return;
      }
      showFormError('resetError', data.message || 'Could not reset password. Please check your credentials.');
    } catch (err) {
      showFormError('resetError', 'Unable to reach the server. Please check your connection.');
    }
    setButtonLoading(btn, false, 'Reset Password');
  });
}

/* ------------------------------------------------------------------ PROFILE & ACCESS CONTROL */
let allOperatorsCache = [];
let currentFilter = 'all';
let currentSearchTerm = '';
let operatorPendingDeleteId = null;

async function initProfileForm() {
  const profileForm = document.getElementById('profileForm');
  const adminPanel = document.getElementById('adminUserManagementPanel');
  const statusBanner = document.getElementById('operatorVerificationStatusBanner');
  const settingsPanel = document.getElementById('personalProfileSettingsPanel');

  const tabPrimary = document.getElementById('tabPrimaryView');
  const tabSettings = document.getElementById('tabSettingsView');
  const tabPrimaryLabel = document.getElementById('tabPrimaryLabel');
  const tabPrimaryIcon = document.getElementById('tabPrimaryIcon');

  // Always load platform metrics across all accounts (so non-admins don't see '--')
  await loadPlatformStats();

  try {
    const res = await fetch(`${API_BASE}/api/auth/profile`);
    const data = await res.json();
    if (data.success) {
      const user = data.user || {};
      const isAdmin = Boolean(user.is_admin || user.email === 'krishnaprasath720@gmail.com' || user.role === 'administrator');

      // Populate personal profile inputs
      if (document.getElementById('profName')) document.getElementById('profName').value = user.name || '';
      if (document.getElementById('profEmail')) document.getElementById('profEmail').value = user.email || '';
      if (document.getElementById('profPhone')) document.getElementById('profPhone').value = user.phone || '';
      if (document.getElementById('profRole')) document.getElementById('profRole').value = (user.role || 'Analyst').toUpperCase();

      // Configure Tab Navigation labels based on rank
      if (isAdmin) {
        if (tabPrimaryLabel) tabPrimaryLabel.textContent = 'Station Personnel Authorization Roster';
        if (tabPrimaryIcon) tabPrimaryIcon.className = 'fas fa-users-gear';
        if (adminPanel) adminPanel.style.display = 'block';
        if (statusBanner) statusBanner.style.display = 'none';
        if (settingsPanel) settingsPanel.style.display = 'none';
        const metricsGrid = document.getElementById('profileMetricsGrid');
        if (metricsGrid) metricsGrid.style.display = 'grid';
        const refreshBtn = document.getElementById('btnRefreshData');
        if (refreshBtn) refreshBtn.style.display = 'inline-flex';
        const privBadge = document.getElementById('profilePrivilegedBadge');
        if (privBadge) privBadge.style.display = 'inline-block';

        initRosterFilters();
        loadUsersList();
      } else {
        const titleEl = document.getElementById('profilePageTitle');
        if (titleEl) titleEl.textContent = 'Operator Clearance & Profile';
        const privBadge = document.getElementById('profilePrivilegedBadge');
        if (privBadge) privBadge.style.display = 'none';
        const subTitleEl = document.getElementById('profilePageSubtitle');
        if (subTitleEl) subTitleEl.textContent = 'View your operational clearance status and manage your station credentials.';
        const refreshBtn = document.getElementById('btnRefreshData');
        if (refreshBtn) refreshBtn.style.display = 'none';
        const metricsGrid = document.getElementById('profileMetricsGrid');
        if (metricsGrid) metricsGrid.style.display = 'none';

        if (tabPrimaryLabel) tabPrimaryLabel.textContent = 'Operational Clearance Dossier';
        if (tabPrimaryIcon) tabPrimaryIcon.className = 'fas fa-shield-halved';
        if (adminPanel) adminPanel.style.display = 'none';
        if (statusBanner) {
          statusBanner.style.display = 'block';
          renderClearanceDossier(user);
        }
        if (settingsPanel) settingsPanel.style.display = 'none';
      }

      // Tab switching handlers
      if (tabPrimary && tabSettings) {
        tabPrimary.addEventListener('click', () => {
          tabPrimary.classList.add('active');
          tabPrimary.setAttribute('aria-selected', 'true');
          tabSettings.classList.remove('active');
          tabSettings.setAttribute('aria-selected', 'false');

          if (settingsPanel) settingsPanel.style.display = 'none';
          if (isAdmin) {
            if (adminPanel) adminPanel.style.display = 'block';
            if (statusBanner) statusBanner.style.display = 'none';
          } else {
            if (adminPanel) adminPanel.style.display = 'none';
            if (statusBanner) statusBanner.style.display = 'block';
          }
        });

        tabSettings.addEventListener('click', () => {
          tabSettings.classList.add('active');
          tabSettings.setAttribute('aria-selected', 'true');
          tabPrimary.classList.remove('active');
          tabPrimary.setAttribute('aria-selected', 'false');

          if (adminPanel) adminPanel.style.display = 'none';
          if (statusBanner) statusBanner.style.display = 'none';
          if (settingsPanel) settingsPanel.style.display = 'block';
        });
      }
    }
  } catch (e) {
    console.warn('Error loading profile data:', e);
  }

  // Password visibility toggles
  setupPasswordToggle('toggleProfPassBtn', 'profNewPass', 'toggleProfPassIcon');
  setupPasswordToggle('toggleProfConfirmPassBtn', 'profConfirmPass', 'toggleProfConfirmPassIcon');

  // Profile save form submit
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('profName').value.trim();
      const phone = document.getElementById('profPhone')?.value.trim();
      const new_password = document.getElementById('profNewPass')?.value;
      const confirm_password = document.getElementById('profConfirmPass')?.value;
      const btn = document.getElementById('btnSaveProfile');

      if (!name) {
        showToast('Full name is required.', 'warning');
        return;
      }

      if (new_password) {
        if (new_password.length < 6) {
          showToast('New password must be at least 6 characters.', 'warning');
          return;
        }
        if (new_password !== confirm_password) {
          showToast('Password confirmation does not match.', 'emergency');
          return;
        }
      }

      setButtonLoading(btn, true, '<i class="fas fa-save"></i> Save Profile Settings', 'Saving Settings…');

      try {
        const res = await fetch(`${API_BASE}/api/auth/profile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, phone, new_password: new_password || undefined })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Profile and security credentials updated successfully.', 'safe');
          // Clear password fields
          if (document.getElementById('profNewPass')) document.getElementById('profNewPass').value = '';
          if (document.getElementById('profConfirmPass')) document.getElementById('profConfirmPass').value = '';
          // Refresh session user cache
          if (data.user) {
            sessionStorage.setItem('rg_user', JSON.stringify(data.user));
          }
        } else {
          showToast(data.message || 'Failed to update profile.', 'emergency');
        }
      } catch (err) {
        showToast('Error saving profile.', 'emergency');
      }
      setButtonLoading(btn, false, '<i class="fas fa-save"></i> Save Profile Settings');
    });
  }

  // Setup Delete Modal buttons
  initDeleteModal();
}

function setupPasswordToggle(btnId, inputId, iconId) {
  const btn = document.getElementById(btnId);
  const input = document.getElementById(inputId);
  const icon = document.getElementById(iconId);
  if (btn && input && icon) {
    btn.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      icon.className = show ? 'fas fa-eye-slash' : 'fas fa-eye';
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  }
}

function escapeQuote(str) {
  return String(str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function formatRosterDate(rawDate) {
  if (!rawDate) return '18 Nov 2026';
  try {
    const str = String(rawDate).trim();
    const datePart = str.split(' ')[0];
    const parts = datePart.split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const monthIdx = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      if (!isNaN(day) && monthIdx >= 0 && monthIdx < 12) {
        return `${day} ${months[monthIdx]} ${year}`;
      }
    }
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    }
  } catch (e) {
    // fallback
  }
  return '18 Nov 2026';
}

/**
 * Loads platform counts for everyone (no more '--' for non-admins)
 */
async function loadPlatformStats() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/users`);
    const data = await res.json();
    if (data.success && data.users) {
      allOperatorsCache = data.users;

      let verifiedCount = 0;
      let pendingCount = 0;
      allOperatorsCache.forEach(u => {
        if (Boolean(u.is_verified)) verifiedCount++;
        else pendingCount++;
      });

      const setTxt = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };

      setTxt('statTotalUsers', allOperatorsCache.length);
      setTxt('statVerifiedUsers', verifiedCount);
      setTxt('statPendingUsers', pendingCount);
      setTxt('statActiveFarmersCount', verifiedCount);
    }
  } catch (err) {
    console.warn('Could not load platform stats:', err);
  }
}

/* ------------------------------------------------------------------ NON-ADMIN CLEARANCE DOSSIER */
function renderClearanceDossier(user) {
  const statusBanner = document.getElementById('operatorVerificationStatusBanner');
  if (!statusBanner) return;

  const isVerified = Boolean(user.is_verified);
  const initials = (user.name || 'Operator').split(' ').map(n => n.charAt(0)).join('').substring(0, 2).toUpperCase();

  statusBanner.innerHTML = `
    <div class="clearance-dossier-card">
      <div class="clearance-badge-row">
        <div class="clearance-user-profile">
          <div class="clearance-avatar-lg">
            ${initials}
          </div>
          <div>
            <div class="clearance-user-name">
              ${user.name || 'Station Operator'}
            </div>
            <div class="clearance-user-meta">
              <span><i class="fas fa-envelope"></i> ${user.email || ''}</span>
              ${user.phone ? `<span style="color:var(--accent);"><i class="fas fa-mobile-alt"></i> ${user.phone}</span>` : ''}
              <span>&bull; Operational Rank: <strong style="text-transform:capitalize; color:var(--accent);">${user.role || 'Analyst'}</strong></span>
            </div>
          </div>
        </div>

        <div>
          ${isVerified ? `
            <span class="clearance-status-pill approved">
              <i class="fas fa-shield-check"></i> CLEARANCE LEVEL 3 &bull; FULL OPERATIONAL
            </span>
          ` : `
            <span class="clearance-status-pill pending">
              <i class="fas fa-hourglass-half fa-spin"></i> CLEARANCE LEVEL 1 &bull; VIEW-ONLY (PENDING)
            </span>
          `}
        </div>
      </div>

      <!-- Permission Guidance Notice Box -->
      <div class="clearance-notice-box ${isVerified ? 'approved' : 'pending'}">
        <div class="clearance-notice-header">
          <i class="fas ${isVerified ? 'fa-check-circle' : 'fa-lock'}"></i>
          <span>${isVerified ? 'FULL OPERATIONAL ACCESS GRANTED' : 'VIEW-ONLY ACCESS &bull; AWAITING ADMINISTRATOR APPROVAL'}</span>
        </div>
        <div class="clearance-notice-body">
          ${isVerified 
            ? 'Your operator profile has been verified by Station Administration. You have unrestricted access to Live monitor, Analysis results, Active alerts, and Analytics.' 
            : 'Your account is currently in <strong>View-Only mode</strong> awaiting Administrator approval. The core operational modules — <strong>1. Live monitor, 2. Analysis results, 3. Active alerts, and 4. Analytics</strong> — are locked until Station Administration grants access.'}
        </div>
      </div>

      <!-- 3-Milestone Progression Stepper -->
      <div class="clearance-steps-container">
        
        <div class="clearance-step-item done">
          <div class="stepper-step-tag">
            <i class="fas fa-check-circle"></i> STEP 1: COMPLETED
          </div>
          <div class="clearance-step-title">Mobile Profile Registered</div>
          <div class="clearance-step-meta">Phone: ${user.phone || 'Recorded in Registry'}</div>
        </div>

        <div class="clearance-step-item ${isVerified ? 'done' : 'pending'}">
          <div class="stepper-step-tag">
            <i class="fas ${isVerified ? 'fa-check-circle' : 'fa-hourglass-half fa-spin'}"></i> 
            ${isVerified ? 'STEP 2: APPROVED' : 'STEP 2: IN REVIEW'}
          </div>
          <div class="clearance-step-title">${isVerified ? 'Identity Approved' : 'Station Review in Progress'}</div>
          <div class="clearance-step-meta">${isVerified ? 'Operational Clearance Granted' : 'Awaiting Administrator Access Grant'}</div>
        </div>

        <div class="clearance-step-item ${isVerified ? 'done' : 'locked'}">
          <div class="stepper-step-tag">
            <i class="fas ${isVerified ? 'fa-shield-check' : 'fa-lock'}"></i> 
            ${isVerified ? 'STEP 3: ACTIVE' : 'STEP 3: LOCKED'}
          </div>
          <div class="clearance-step-title">${isVerified ? '4 Modules Unlocked' : '4 Modules Locked'}</div>
          <div class="clearance-step-meta">${isVerified ? 'Live monitor, Analysis, Alerts, Analytics' : 'Requires Admin Approval'}</div>
        </div>

      </div>

      ${isVerified ? `
        <div style="margin-top:24px; display:flex; justify-content:flex-end;">
          <a href="upload.html" class="btn btn-primary btn-lg" style="display:inline-flex; align-items:center; gap:8px;">
            <i class="fas fa-camera"></i> Launch Live Analysis Pipeline <i class="fas fa-arrow-right"></i>
          </a>
        </div>
      ` : `
        <div style="margin-top:24px; display:flex; justify-content:flex-end;">
          <button type="button" onclick="showToast('Your clearance request has been forwarded to Station Administration.', 'info')" class="btn btn-secondary" style="display:inline-flex; align-items:center; gap:8px;">
            <i class="fas fa-paper-plane text-accent"></i> Request Priority Clearance
          </button>
        </div>
      `}
    </div>
  `;
}

/* ------------------------------------------------------------------ ROSTER SEARCH & FILTERS */
function initRosterFilters() {
  const searchInput = document.getElementById('rosterSearchInput');
  const clearBtn = document.getElementById('rosterSearchClearBtn');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearchTerm = e.target.value.trim().toLowerCase();
      if (clearBtn) clearBtn.style.display = currentSearchTerm ? 'flex' : 'none';
      renderFilteredRoster();
    });
  }

  if (clearBtn && searchInput) {
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      currentSearchTerm = '';
      clearBtn.style.display = 'none';
      searchInput.focus();
      renderFilteredRoster();
    });
  }
}

async function loadUsersList() {
  await loadPlatformStats();
  renderFilteredRoster();
}

function renderFilteredRoster() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  let filtered = allOperatorsCache.filter(u => {
    if (currentSearchTerm) {
      const q = currentSearchTerm;
      const matchName = (u.name || '').toLowerCase().includes(q);
      const matchEmail = (u.email || '').toLowerCase().includes(q);
      const matchPhone = (u.phone || '').toLowerCase().includes(q);
      const matchRole = (u.role || '').toLowerCase().includes(q);
      if (!matchName && !matchEmail && !matchPhone && !matchRole) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="ref-table-loading">
          <i class="fas fa-user-slash" style="font-size:24px; margin-bottom:10px; opacity:0.4; display:block;"></i>
          No operators found matching '${escapeHtml(currentSearchTerm)}'.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(u => {
    const isVerified = Boolean(u.is_verified);
    const isPrimaryAdmin = u.email === 'krishnaprasath720@gmail.com' || u.is_primary_admin;

    const statusPill = isVerified 
      ? `<span class="ref-status-pill active">Active</span>`
      : `<span class="ref-status-pill pending">Pending</span>`;

    let securityActionCell = '';
    if (isPrimaryAdmin) {
      securityActionCell = `<span class="ref-muted-text">Self Account</span>`;
    } else if (isVerified) {
      securityActionCell = `
        <button type="button" class="ref-btn-outline red" onclick="revokeUser(${u.id}, '${escapeQuote(u.name)}')" title="Deactivate operator privileges">
          <i class="far fa-user-circle"></i> Deactivate
        </button>
      `;
    } else {
      securityActionCell = `
        <button type="button" class="ref-btn-outline green" onclick="verifyUser(${u.id}, '${escapeQuote(u.name)}')" title="Authorize operator for operational privileges">
          <i class="fas fa-check"></i> Authorize
        </button>
      `;
    }

    let deleteCell = '';
    if (isPrimaryAdmin) {
      deleteCell = `<span class="ref-muted-text">Protected</span>`;
    } else {
      deleteCell = `
        <button type="button" class="ref-btn-outline red" onclick="promptDeleteUser(${u.id}, '${escapeQuote(u.name)}')" title="Permanently delete operator">
          <i class="far fa-trash-alt"></i> Delete
        </button>
      `;
    }

    const memberSince = formatRosterDate(u.created_at);

    return `
      <tr>
        <td>
          <span class="ref-col-name">${escapeHtml(u.name)}</span>
        </td>
        <td>
          <span class="ref-col-email">${escapeHtml(u.email)}</span>
        </td>
        <td>
          <span class="ref-col-role">${escapeHtml(u.role || 'Analyst')}</span>
        </td>
        <td>
          <span class="ref-col-phone">${escapeHtml(u.phone || '+91 90000 00000')}</span>
        </td>
        <td style="text-align:center;">
          ${statusPill}
        </td>
        <td>
          <span class="ref-col-since">${memberSince}</span>
        </td>
        <td style="text-align:center;">
          ${securityActionCell}
        </td>
        <td style="text-align:center;">
          ${deleteCell}
        </td>
      </tr>
    `;
  }).join('');
}

/* ------------------------------------------------------------------ ADMIN ACTIONS (VERIFY / REVOKE / DELETE) */
async function verifyUser(id, name) {
  try {
    const res = await fetch(`${API_BASE}/api/auth/users/${id}/verify`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(`Operator '${name}' verified! Operational privileges activated.`, 'safe');
      loadUsersList();
    } else {
      showToast(data.message || 'Error verifying operator.', 'emergency');
    }
  } catch (err) {
    showToast('Network error verifying operator.', 'emergency');
  }
}

async function revokeUser(id, name) {
  try {
    const res = await fetch(`${API_BASE}/api/auth/users/${id}/revoke`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(`Verification suspended for '${name}'. View-only mode active.`, 'watch');
      loadUsersList();
    } else {
      showToast(data.message || 'Error suspending operator.', 'emergency');
    }
  } catch (err) {
    showToast('Network error suspending operator.', 'emergency');
  }
}

function initDeleteModal() {
  const modal = document.getElementById('deleteConfirmModal');
  const btnCancel = document.getElementById('btnCancelDelete');
  const btnConfirm = document.getElementById('btnConfirmDelete');

  if (btnCancel && modal) {
    btnCancel.addEventListener('click', () => {
      modal.classList.remove('active');
      operatorPendingDeleteId = null;
    });
  }

  if (btnConfirm && modal) {
    btnConfirm.addEventListener('click', async () => {
      if (!operatorPendingDeleteId) return;
      const id = operatorPendingDeleteId;
      modal.classList.remove('active');
      operatorPendingDeleteId = null;

      try {
        const res = await fetch(`${API_BASE}/api/auth/users/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          showToast('Operator profile was permanently removed.', 'safe');
          loadUsersList();
        } else {
          showToast(data.message || 'Error removing operator.', 'emergency');
        }
      } catch (err) {
        showToast('Network error removing operator.', 'emergency');
      }
    });
  }
}

function promptDeleteUser(id, name) {
  const modal = document.getElementById('deleteConfirmModal');
  const msg = document.getElementById('deleteConfirmMessage');
  if (modal && msg) {
    operatorPendingDeleteId = id;
    msg.innerHTML = `Are you sure you want to permanently remove operator <strong>${name}</strong>? All sensor and surveillance access privileges will be revoked.`;
    modal.classList.add('active');
  } else {
    // Fallback confirm
    if (confirm(`Are you sure you want to permanently remove operator '${name}'?`)) {
      operatorPendingDeleteId = id;
      const btnConfirm = document.getElementById('btnConfirmDelete');
      if (btnConfirm) btnConfirm.click();
    }
  }
}

window.verifyUser = verifyUser;
window.revokeUser = revokeUser;
window.promptDeleteUser = promptDeleteUser;
