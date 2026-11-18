/**
 * RIVERGUARD AI — NOTIFICATION DISPATCH TIMELINE & ALERT HISTORY CONTROLLER
 * Visualizes full chronological history of flood alerts and dispatches.
 */

let allAlerts = [];
let currentFilter = 'ALL';
let searchQuery = '';

document.addEventListener('DOMContentLoaded', () => {
  loadHistoryStats();
  loadHistoryAlerts();
  initFilterButtons();
  initSearch();
});

async function loadHistoryStats() {
  try {
    const res = await fetch(`${API_BASE}/api/alerts/stats`);
    const data = await res.json();
    if (data.success) {
      const counts = data.counts || {};
      const setVal = (id, v) => {
        const el = document.getElementById(id);
        if (el) el.textContent = v || 0;
      };
      setVal('cntSafe', counts.safe);
      setVal('cntWatch', counts.watch);
      setVal('cntWarning', counts.warning);
      setVal('cntEmergency', counts.emergency);

      const smtpInfo = data.smtp_status || {};
      const target = smtpInfo.recipient || 'krishnaprasath720@gmail.com';
      const sender = smtpInfo.sender || 'rivergaurd@gmail.com';

      const bannerTarget = document.getElementById('bannerTargetEmail');
      const bannerSender = document.getElementById('bannerSenderEmail');
      if (bannerTarget) bannerTarget.textContent = target;
      if (bannerSender) bannerSender.textContent = sender;
    }
  } catch (err) {
    console.warn('Error loading history alert stats:', err);
  }
}

async function loadHistoryAlerts() {
  const container = document.getElementById('alertsHistoryContainer');
  if (!container) return;

  try {
    const url = currentFilter === 'ALL' 
      ? `${API_BASE}/api/alerts?limit=100` 
      : `${API_BASE}/api/alerts?level=${encodeURIComponent(currentFilter)}&limit=100`;
    
    const res = await fetch(url);
    const data = await res.json();
    if (data.success) {
      allAlerts = data.alerts || [];
      renderHistoryList();
    }
  } catch (err) {
    console.warn('Error loading alert history:', err);
    container.innerHTML = `
      <div class="glass-panel" style="padding:40px; text-align:center; color:#DC2626;">
        <i class="fas fa-exclamation-triangle" style="font-size:32px; margin-bottom:12px;"></i>
        <p>Failed to load alert history. Please verify backend connection.</p>
      </div>
    `;
  }
}

function initFilterButtons() {
  const btns = document.querySelectorAll('.filter-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.level;
      loadHistoryAlerts();
    });
  });
}

function filterByLevel(level) {
  const btns = document.querySelectorAll('.filter-btn');
  btns.forEach(b => {
    if (b.dataset.level === level) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });
  currentFilter = level;
  loadHistoryAlerts();
}

function initSearch() {
  const searchInput = document.getElementById('searchTimelineInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      renderHistoryList();
    });
  }
}

function renderHistoryList() {
  const container = document.getElementById('alertsHistoryContainer');
  const countEl = document.getElementById('timelineCountSummary');
  if (!container) return;

  let filtered = allAlerts;
  if (searchQuery) {
    filtered = filtered.filter(a => {
      const text = `${a.title || ''} ${a.description || ''} ${a.alert_level || ''} ${a.created_at || ''}`.toLowerCase();
      return text.includes(searchQuery);
    });
  }

  if (countEl) {
    countEl.textContent = `Showing ${filtered.length} of ${allAlerts.length} alerts`;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="glass-panel" style="padding:40px; text-align:center; color:var(--text-muted);">
        <i class="fas fa-bell-slash" style="font-size:32px; margin-bottom:12px; opacity:0.4;"></i>
        <p>No alert records found matching the current criteria (${currentFilter}${searchQuery ? ` / "${searchQuery}"` : ''}).</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(a => {
    const isSafe = a.alert_level === 'SAFE';
    const levelClass = a.alert_level.toLowerCase();
    const title = isSafe ? 'NORMAL WATER' : a.title;
    const badgeColor = isSafe ? '#16A34A' : (a.alert_level === 'WATCH' ? '#FACC15' : a.alert_level === 'WARNING' ? '#F97316' : '#DC2626');
    const levelStr = a.water_level !== null && a.water_level !== undefined ? `${parseFloat(a.water_level).toFixed(2)}m` : 'CALIBRATION REQ.';
    const threshStr = a.threshold ? `${parseFloat(a.threshold).toFixed(2)}m` : 'N/A';
    const sender = a.sender || 'rivergaurd@gmail.com';
    const recipient = a.recipient || 'krishnaprasath720@gmail.com';
    const hasImage = Boolean(a.annotated_image_path);

    return `
      <div class="timeline-card" style="border-left: 4.5px solid ${badgeColor};">
        <div class="timeline-card-header">
          <div>
            <div style="display:inline-block; font-family:'Plus Jakarta Sans', sans-serif; font-size:11px; font-weight:700; color:#0284C7; letter-spacing:0.5px; margin-bottom:4px; text-transform:uppercase;">
              RiverGuard AI &bull; Telemetry Dispatch Log
            </div>
            <h3 style="font-size:17px; font-weight:700; color:var(--text); margin:0; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
              ${title}
              <span class="status-pill ${levelClass}" style="font-size:11px; padding:3px 10px;">● ${a.alert_level}</span>
            </h3>
          </div>
          <div class="timeline-card-meta">
            <div><i class="far fa-clock"></i> <strong>${a.created_at}</strong></div>
            <div style="word-break:break-all;">
              <span style="color:#0284C7; font-weight:600;">From: ${sender}</span> &bull; 
              <span style="color:var(--text); font-weight:600;">To: ${recipient}</span>
            </div>
          </div>
        </div>

        <p style="color:var(--text-2); font-size:13.5px; line-height:1.5; margin-bottom:14px;">
          ${a.description || 'River parameter scan complete.'}
        </p>

        <!-- Email-style Key/Value Box -->
        <div class="timeline-kv-grid">
          <div><span style="color:var(--text-3);">WATER LEVEL:</span> <strong style="color:var(--text);">${levelStr}</strong></div>
          <div><span style="color:var(--text-3);">TRIGGER THRESHOLD:</span> <strong style="color:var(--text);">${threshStr}</strong></div>
          <div><span style="color:var(--text-3);">AI CONFIDENCE:</span> <strong style="color:#0284C7;">${a.confidence}%</strong></div>
          <div><span style="color:var(--text-3);">SYSTEM ACTION:</span> <strong style="color:${badgeColor};"><i class="fas ${isSafe ? 'fa-check' : 'fa-paper-plane'}"></i> ${isSafe ? 'MONITORING NOMINAL' : 'AUTOMATICALLY DISPATCHED'}</strong></div>
        </div>

        ${hasImage ? `
          <div style="margin-top:12px; display:flex; justify-content:flex-end;">
            <a href="analysis.html?id=${a.analysis_id}" class="btn btn-secondary" style="padding:6px 14px; font-size:12px; gap:6px;">
              <i class="fas fa-eye"></i> View Computer Vision Scan Overlay
            </a>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}
