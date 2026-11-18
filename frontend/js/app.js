/**
 * RIVERGUARD AI — CORE CLIENT
 * Shared app shell (header, navigation, user menu, view-only notice),
 * theme, auth state, toasts and the emergency modal. Loaded on every page.
 *
 * Every app page contains:   <div id="appHeader"></div>
 * Auth pages (login/register) don't, and get no header.
 */

const API_BASE = ''; // same origin

// Status colours — fixed. SAFE / normal water is always green.
const RISK_COLORS = {
  SAFE: '#16A34A',
  WATCH: '#FACC15',
  WARNING: '#F97316',
  EMERGENCY: '#DC2626'
};

const PRIMARY_ADMIN_EMAIL = 'krishnaprasath720@gmail.com';

const LOCKED_PAGES = [
  'dashboard.html',
  'upload.html',
  'analysis.html',
  'alerts.html',
  'alert-history.html',
  'history.html',
  'analytics.html'
];

const NAV_SECTIONS = [
  { label: 'Monitoring', items: [
    { href: 'index.html', label: 'Overview', icon: 'fa-gauge-high' },
    { href: 'dashboard.html', label: 'Live monitor', icon: 'fa-tower-broadcast' },
    { href: 'upload.html', label: 'Analyse image', icon: 'fa-camera' },
    { href: 'analysis.html', label: 'Analysis results', icon: 'fa-wave-square' }
  ]},
  { label: 'Alerts', items: [
    { href: 'alerts.html', label: 'Active alerts', icon: 'fa-bell', id: 'navAlertsLink' },
    { href: 'alert-history.html', label: 'Alert history', icon: 'fa-clock-rotate-left' }
  ]},
  { label: 'Records', items: [
    { href: 'history.html', label: 'Scan history', icon: 'fa-table-list' },
    { href: 'analytics.html', label: 'Analytics', icon: 'fa-chart-line' }
  ]},
  { label: 'Administration', items: [
    { href: 'profile.html', label: 'User verification', icon: 'fa-user-shield' }
  ]}
];

let currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
  const cached = getCachedUser();
  renderAppHeader(cached);
  initTheme();
  renderAccessNotice(cached);
  enforcePageLock(cached);
  lockOverviewCardsIfUnverified(cached);
  checkAuthStatus();
});

/* ---------------------------------------------------------------- helpers */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function currentPageFile() {
  const file = window.location.pathname.split('/').pop();
  return file || 'index.html';
}

function getCachedUser() {
  try {
    const s = sessionStorage.getItem('rg_user');
    return s ? JSON.parse(s) : null;
  } catch (e) {
    return null;
  }
}

function isAdminUser(u) {
  return !!u && (u.is_admin || u.email === PRIMARY_ADMIN_EMAIL || u.role === 'administrator');
}

function isVerifiedUser(u) {
  if (!u) return false;
  return Boolean(u.is_admin || u.email === PRIMARY_ADMIN_EMAIL || u.role === 'administrator' || u.is_verified);
}

function getFormattedHeaderDate() {
  const d = new Date();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}, ${d.getFullYear()}`;
}

/* --------------------------------------------------------------- app shell */
function renderAppHeader(u) {
  const user = u || currentUser || getCachedUser();
  const verified = isVerifiedUser(user);
  const isAdmin = isAdminUser(user);
  const page = currentPageFile();
  let pageLabel = 'Overview', sectionLabel = 'Monitoring';

  const sections = NAV_SECTIONS.map(section => {
    // If the new user has not been granted access by admin, hide locked operational items
    const validItems = section.items.filter(item => {
      if (user && !verified) {
        return item.href === 'index.html' || item.href === 'profile.html';
      }
      return true;
    });

    if (validItems.length === 0) return '';

    // If this is Administration section:
    if (section.label === 'Administration') {
      // NON-ADMIN / NEW USER: DO NOT DISPLAY ADMINISTRATION OR ADMIN CONSOLE!
      if (!isAdmin) {
        const active = page === 'profile.html';
        if (active) { pageLabel = 'Profile'; sectionLabel = 'Account'; }
        return `
          <div class="nav-section">
            <div class="nav-section-label">Account</div>
            <a href="profile.html" class="nav-link${active ? ' active' : ''}">
              <i class="far fa-user"></i><span>Profile</span>
            </a>
          </div>
        `;
      }

      // ONLY Primary Admin sees Administration & Admin Console card
      const active = page === 'profile.html';
      if (active) { pageLabel = 'User verification'; sectionLabel = 'Administration'; }
      return `
        <div class="nav-section">
          <div class="nav-section-label">Administration</div>
          <a href="profile.html" class="sidebar-admin-card${active ? ' active' : ''}" id="navAdminCard" title="Admin Console">
            <div class="admin-card-inner">
              <i class="fas fa-shield-halved"></i>
              <span>Admin Console</span>
            </div>
            <span class="admin-card-badge">ADMIN</span>
          </a>
        </div>
      `;
    }

    const links = validItems.map(item => {
      const active = item.href === page;
      if (active) { pageLabel = item.label; sectionLabel = section.label; }
      return `<a href="${item.href}" class="nav-link${active ? ' active' : ''}"${active ? ' aria-current="page"' : ''}${item.id ? ` id="${item.id}"` : ''}>
          <i class="fas ${item.icon}"></i><span>${item.label}</span></a>`;
    }).join('');

    return `<div class="nav-section"><div class="nav-section-label">${section.label}</div>${links}</div>`;
  }).filter(Boolean).join('');

  // 1 & 3: Do NOT display the "4 MODULES LOCKED" notice in the sidebar
  const lockedNoticeHtml = '';

  const userName = user ? escapeHtml(user.name || 'Operator') : 'Operator';
  const userInitial = user ? escapeHtml((user.name || 'O').trim().charAt(0).toUpperCase()) : 'O';

  const shellHtml = `
    <aside class="app-sidebar" id="appSidebar" aria-label="Primary">
      <div class="sidebar-brand">
        <a href="index.html" class="brand" aria-label="RiverGuard AI home">
          <span class="brand-mark"><img src="images/logo.png" alt="RiverGuard AI" class="brand-logo-img"></span>
          <div class="brand-title-wrap">
            <span class="brand-name">RiverGuard<span>AI</span></span>
            <span class="brand-sub">Smart River Suite</span>
          </div>
        </a>
      </div>
      <nav class="sidebar-nav">
        ${sections}
        ${lockedNoticeHtml}
      </nav>
      <div class="sidebar-footer">
        <div class="sidebar-user-block">
          <div class="sidebar-user-avatar">${userInitial}</div>
          <div class="sidebar-user-name" title="${userName}">${userName}</div>
        </div>
        ${user ? `
          <button type="button" class="btn-sidebar-logout" onclick="openLogoutModal()" aria-label="Log Out">
            <i class="fas fa-arrow-right-from-bracket"></i> Log Out
          </button>
        ` : `
          <a href="login.html" class="btn-sidebar-logout" style="text-decoration:none;">
            <i class="fas fa-arrow-right-to-bracket"></i> Sign in
          </a>
        `}
      </div>
    </aside>
    <div class="sidebar-backdrop" id="sidebarBackdrop"></div>
    <header class="app-topbar">
      <div class="topbar-left">
        <button class="btn-icon borderless nav-toggle" id="navToggleBtn" aria-label="Open navigation" aria-expanded="false">
          <i class="fas fa-bars"></i>
        </button>
        <div class="topbar-user-section">
          <span class="topbar-operator-name">${userName}</span>
          <span class="topbar-date"><i class="far fa-calendar-alt"></i> ${getFormattedHeaderDate()}</span>
        </div>
      </div>
      <div class="topbar-actions header-right-actions">
        <span class="system-chip" title="Monitoring network status"><span class="status-dot live"></span> All systems operational</span>
        <button class="btn-icon borderless" id="themeToggleBtn" title="Switch theme" aria-label="Switch theme">
          <i class="fas fa-moon" id="themeToggleIcon"></i>
        </button>
        ${user ? `
          <button type="button" class="btn-topbar-logout" onclick="openLogoutModal()">
            <i class="fas fa-arrow-right-from-bracket"></i> Log Out
          </button>
        ` : `
          <a href="login.html" class="btn btn-secondary btn-sm" id="headerSignInBtn">Sign in</a>
        `}
      </div>
    </header>
    <div id="accessNotice"></div>

    <!-- Confirm Logout Modal (Image 4) -->
    <div class="confirm-logout-modal-overlay" id="confirmLogoutModal" role="dialog" aria-modal="true" aria-labelledby="confirmLogoutTitle">
      <div class="confirm-logout-card">
        <div class="logout-icon-circle">
          <i class="fas fa-arrow-right-from-bracket"></i>
        </div>
        <h2 class="logout-card-title" id="confirmLogoutTitle">Confirm Logout</h2>
        <p class="logout-card-desc">Are you sure you want to log out of your RiverGuard account?</p>
        <div class="logout-card-actions">
          <button type="button" class="btn-logout-cancel" onclick="closeLogoutModal()">Cancel</button>
          <button type="button" class="btn-logout-confirm" onclick="executeLogout()">
            <i class="fas fa-arrow-right-from-bracket"></i> Yes, Log Out
          </button>
        </div>
      </div>
    </div>`;

  const mount = document.getElementById('appHeader');
  const existingSidebar = document.getElementById('appSidebar');

  if (mount) {
    mount.outerHTML = shellHtml;
  } else if (existingSidebar) {
    // If updating existing header
    const sidebarNav = existingSidebar.querySelector('.sidebar-nav');
    if (sidebarNav) sidebarNav.innerHTML = `${sections}${lockedNoticeHtml}`;
    const nameEl = document.querySelector('.topbar-operator-name');
    if (nameEl) nameEl.textContent = userName;
    const sideNameEl = document.querySelector('.sidebar-user-name');
    if (sideNameEl) sideNameEl.textContent = userName;
    return;
  }

  const toggle = document.getElementById('navToggleBtn');
  const sidebar = document.getElementById('appSidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (toggle && sidebar && backdrop) {
    const setOpen = (open) => {
      sidebar.classList.toggle('open', open);
      backdrop.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
      if (open) {
        document.body.style.overflow = window.innerWidth <= 1024 ? 'hidden' : '';
      } else {
        document.body.style.overflow = '';
      }
    };
    toggle.addEventListener('click', () => setOpen(!sidebar.classList.contains('open')));
    backdrop.addEventListener('click', () => setOpen(false));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });

    // Close drawer when an internal navigation item is selected on mobile/tablet
    sidebar.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 1024) {
          setOpen(false);
        }
      });
    });
  }

  // Backdrop listener for logout modal
  const logoutOverlay = document.getElementById('confirmLogoutModal');
  if (logoutOverlay) {
    logoutOverlay.addEventListener('click', (e) => {
      if (e.target === logoutOverlay) closeLogoutModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && logoutOverlay.classList.contains('active')) {
        closeLogoutModal();
      }
    });
  }

  loadNavAlertCount();
}

async function loadNavAlertCount() {
  try {
    const res = await fetch(`${API_BASE}/api/alerts/stats`);
    const data = await res.json();
    const c = (data && data.counts) || {};
    const critical = (c.warning || 0) + (c.emergency || 0);
    const link = document.getElementById('navAlertsLink');
    if (link && critical > 0) {
      link.insertAdjacentHTML('beforeend', `<span class="nav-count" title="Warning and emergency alerts">${critical > 99 ? '99+' : critical}</span>`);
    }
  } catch (e) { /* non-critical */ }
}

function renderUserMenu(u) {
  const menu = document.getElementById('userMenu');
  if (!menu) return;
  const name = escapeHtml(u.name || 'Operator');
  const initial = escapeHtml((u.name || 'O').trim().charAt(0).toUpperCase());
  const role = isAdminUser(u) ? 'Administrator' : (u.is_verified ? 'Verified operator' : 'View-only (pending approval)');

  menu.innerHTML = `
    <button class="user-menu-trigger" id="userMenuTrigger" aria-haspopup="menu" aria-expanded="false">
      <span class="avatar" id="sidebarUserAvatar">${initial}</span>
      <span class="user-menu-name" id="sidebarUserName">${name}</span>
      <i class="fas fa-chevron-down"></i>
    </button>
    <div class="user-menu-panel" role="menu">
      <div class="user-menu-head">
        <span class="avatar avatar-lg">${initial}</span>
        <div style="min-width:0">
          <strong>${name}</strong>
          <small>${escapeHtml(u.email || '')}</small>
          <small>${role}</small>
        </div>
      </div>
      <a class="menu-item" href="profile.html" role="menuitem"><i class="fas fa-user-shield"></i> Account &amp; verification</a>
      <button class="menu-item danger" type="button" role="menuitem" onclick="handleLogout()"><i class="fas fa-arrow-right-from-bracket"></i> Sign out</button>
    </div>`;

  const trigger = document.getElementById('userMenuTrigger');
  if (trigger) {
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = menu.classList.toggle('open');
      trigger.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target)) {
        menu.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') menu.classList.remove('open');
    });
  }
}

function renderAccessNotice(u) {
  const slot = document.getElementById('accessNotice');
  if (!slot) return;
  const user = u || currentUser || getCachedUser();
  if (!user || isVerifiedUser(user)) {
    slot.innerHTML = '';
    return;
  }
  slot.innerHTML = `
    <div class="access-notice-compact" role="status">
      <div class="access-notice-compact-inner">
        <div class="access-notice-compact-left">
          <span class="access-notice-icon"><i class="fas fa-lock"></i></span>
          <span class="access-notice-text">
            <strong>Account pending approval:</strong> Live monitor, Analysis results, Active alerts, and Analytics will unlock once approved by Admin.
          </span>
        </div>
        <a href="profile.html" class="access-notice-btn">Check Status <i class="fas fa-arrow-right"></i></a>
      </div>
    </div>`;
}

function enforcePageLock(u) {
  const user = u || currentUser || getCachedUser();
  if (!user || isVerifiedUser(user)) return;

  const page = currentPageFile();
  if (LOCKED_PAGES.includes(page)) {
    const main = document.querySelector('main.page') || document.querySelector('main') || document.querySelector('.page') || document.body;
    if (main) {
      let moduleName = 'Feature';
      if (page.includes('upload') || page.includes('dashboard')) moduleName = 'Live River Monitor & Sensor Ingestion';
      else if (page.includes('analysis')) moduleName = 'Analysis Results';
      else if (page.includes('alert')) moduleName = 'Active Alerts & Dispatches';
      else if (page.includes('analytic') || page.includes('history')) moduleName = 'Analytics & Scan History';

      main.innerHTML = `
        <div class="access-locked-shell">
          <div class="access-locked-card">
            <div class="locked-icon-hub">
              <i class="fas fa-lock"></i>
            </div>
            <span class="badge badge-watch mb-3"><i class="fas fa-hourglass-half"></i> CLEARANCE REQUIRED</span>
            <h1 class="locked-title">${moduleName} is Locked</h1>
            <p class="locked-desc">
              Your operator account is currently in <strong>View-Only mode</strong>. Access to <strong>${moduleName}</strong> is locked until an Administrator grants access in User Verification.
            </p>
            <div class="locked-steps-mini">
              <div class="step-chip done"><i class="fas fa-check"></i> Account Enrolled</div>
              <div class="step-chip pending"><i class="fas fa-hourglass-half fa-spin"></i> Admin Approval Required</div>
              <div class="step-chip locked"><i class="fas fa-lock"></i> ${moduleName} Locked</div>
            </div>
            <div class="locked-actions-row">
              <a href="profile.html" class="btn btn-primary"><i class="fas fa-user-shield"></i> View Clearance Dossier</a>
              <a href="index.html" class="btn btn-secondary"><i class="fas fa-home"></i> Back to Overview</a>
            </div>
          </div>
        </div>
      `;
    }
  }
}

function lockOverviewCardsIfUnverified(u) {
  const user = u || currentUser || getCachedUser();
  if (!user || isVerifiedUser(user)) return;
  const cards = document.querySelectorAll('.modules-grid .module-card');
  cards.forEach(card => {
    if (!card.classList.contains('module-card-locked')) {
      card.classList.add('module-card-locked');
      const badge = document.createElement('span');
      badge.className = 'badge badge-watch';
      badge.style.marginTop = '8px';
      badge.innerHTML = '<i class="fas fa-lock"></i> Locked (Admin Approval Required)';
      card.appendChild(badge);
      card.addEventListener('click', (e) => {
        e.preventDefault();
        showToast('ACCESS RESTRICTED: Locked until Administrator grants clearance.', 'watch');
        setTimeout(() => { window.location.href = 'profile.html'; }, 600);
      });
    }
  });
}

/* ------------------------------------------------------------------ theme */
function initTheme() {
  const saved = localStorage.getItem('riverguard_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);

  const btn = document.getElementById('themeToggleBtn');
  if (btn) {
    btn.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('riverguard_theme', next);
      updateThemeIcon(next);
      document.dispatchEvent(new CustomEvent('rg:themechange', { detail: { theme: next } }));
    });
  }
}

function updateThemeIcon(theme) {
  const icon = document.getElementById('themeToggleIcon');
  if (icon) icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

/* ------------------------------------------------------------------- auth */
async function checkAuthStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`);
    const data = await res.json();
    if (data.authenticated && data.user) {
      currentUser = data.user;
      sessionStorage.setItem('rg_user', JSON.stringify(currentUser));
      renderUserMenu(currentUser);
      renderAccessNotice(currentUser);
      renderAppHeader(currentUser);
      enforcePageLock(currentUser);
      lockOverviewCardsIfUnverified(currentUser);
      document.dispatchEvent(new CustomEvent('rg:user', { detail: currentUser }));
    } else {
      currentUser = null;
      sessionStorage.removeItem('rg_user');
      const page = currentPageFile();
      if (page !== 'login.html' && page !== 'register.html' && page !== 'forgot-password.html') {
        window.location.href = 'login.html';
      }
    }
  } catch (err) {
    console.warn('Auth check failed:', err);
  }
}

function openLogoutModal() {
  const modal = document.getElementById('confirmLogoutModal');
  if (modal) modal.classList.add('active');
}

function closeLogoutModal() {
  const modal = document.getElementById('confirmLogoutModal');
  if (modal) modal.classList.remove('active');
}

async function executeLogout() {
  try {
    await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST' });
  } catch (err) { /* sign out locally regardless */ }
  sessionStorage.removeItem('rg_user');
  window.location.href = 'login.html';
}

function handleLogout() {
  openLogoutModal();
}

window.openLogoutModal = openLogoutModal;
window.closeLogoutModal = closeLogoutModal;
window.executeLogout = executeLogout;
window.handleLogout = handleLogout;

/* ------------------------------------------------------- emergency modal */
function showEmergencyModal(level, waterLevel, confidence) {
  const modal = document.getElementById('emergencyModal');
  if (!modal) return;
  const lvlEl = document.getElementById('emergencyWaterLevel');
  const confEl = document.getElementById('emergencyConfidence');
  const timeEl = document.getElementById('emergencyTimestamp');
  if (lvlEl) lvlEl.textContent = (typeof waterLevel === 'number') ? `${waterLevel.toFixed(2)} m` : '—';
  if (confEl) confEl.textContent = confidence != null ? `${confidence}%` : '—';
  if (timeEl) timeEl.textContent = new Date().toLocaleTimeString();
  modal.classList.add('active');
}

function closeEmergencyModal() {
  const modal = document.getElementById('emergencyModal');
  if (!modal) return;
  modal.classList.remove('active');
}

/* ----------------------------------------------------------------- toasts */
function showToast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  let icon = 'fa-circle-info';
  if (type === 'safe') icon = 'fa-circle-check';
  if (type === 'watch') icon = 'fa-triangle-exclamation';
  if (type === 'warning') icon = 'fa-circle-exclamation';
  if (type === 'emergency') icon = 'fa-radiation';

  toast.innerHTML = `<i class="fas ${icon}"></i><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

window.showToast = showToast;
window.handleLogout = handleLogout;
