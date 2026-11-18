/**
 * RIVERGUARD AI — HISTORY & AUDIT LOG CONTROLLER
 * Supports full historical table rendering, search, risk filtering, and modal inspection.
 */

let allAnalyses = [];

document.addEventListener('DOMContentLoaded', () => {
  loadHistoryTable();
  initTableControls();
});

async function loadHistoryTable() {
  const tbody = document.getElementById('historyTableBody');
  const riskFilter = document.getElementById('filterRiskSelect')?.value || 'ALL';

  try {
    const url = riskFilter === 'ALL' ? `${API_BASE}/api/analyses?limit=100` : `${API_BASE}/api/analyses?risk=${riskFilter}&limit=100`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.success) {
      allAnalyses = data.analyses;
      renderTableRows(data.analyses);
    }
  } catch (err) {
    console.error('Error loading history:', err);
  }
}

function initTableControls() {
  const searchInput = document.getElementById('searchHistoryInput');
  const riskSelect = document.getElementById('filterRiskSelect');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      const filtered = allAnalyses.filter(item => 
        (item.original_filename && item.original_filename.toLowerCase().includes(q)) ||
        (item.risk_level && item.risk_level.toLowerCase().includes(q)) ||
        (item.created_at && item.created_at.includes(q))
      );
      renderTableRows(filtered);
    });
  }

  if (riskSelect) {
    riskSelect.addEventListener('change', () => {
      loadHistoryTable();
    });
  }
}

function renderTableRows(items) {
  const tbody = document.getElementById('historyTableBody');
  if (!tbody) return;

  if (items.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center; padding:32px; color:var(--text-muted);">
          No analysis records found matching criteria.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = items.map(item => {
    const parts = (item.created_at || '').split(' ');
    const dateStr = parts[0] || 'Today';
    const timeStr = parts[1] || '';
    const isSafe = item.risk_level === 'SAFE';
    const lvlText = item.water_level !== null && item.water_level !== undefined ? `${parseFloat(item.water_level).toFixed(2)} m` : 'Calib Req.';
    const refText = item.reference_detected ? 'Detected' : 'None';

    return `
      <tr>
        <td style="font-family:var(--font-mono); font-size:12px;">${dateStr}</td>
        <td style="font-family:var(--font-mono); font-size:12px; color:var(--text-muted);">${timeStr}</td>
        <td style="font-weight:700; color:var(--text-main); font-family:var(--font-mono);">${lvlText}</td>
        <td>
          <span class="status-pill ${item.risk_level.toLowerCase()}" style="font-size:11px; padding:3px 10px;">
            ${isSafe ? 'NORMAL WATER' : item.risk_level}
          </span>
        </td>
        <td>
          <div style="display:flex; align-items:center; gap:6px;">
            <div style="flex:1; height:4px; width:45px; background:rgba(255,255,255,0.1); border-radius:2px; overflow:hidden;">
              <div style="height:100%; width:${item.confidence}%; background:#00B4D8;"></div>
            </div>
            <span style="font-family:var(--font-mono); font-size:11px;">${item.confidence}%</span>
          </div>
        </td>
        <td style="font-family:var(--font-mono); font-size:11.5px; color:${item.reference_detected ? '#00B4D8' : 'var(--text-dim)'};">
          ${refText}
        </td>
        <td>
          <a href="${item.annotated_image_path || item.image_path}" target="_blank" style="color:var(--cyan-primary); font-size:12px; display:inline-flex; align-items:center; gap:4px;">
            <i class="fas fa-image"></i> View HUD
          </a>
        </td>
        <td>
          <a href="analysis.html?id=${item.id}" class="btn-command-outline" style="padding:4px 10px; font-size:11.5px;">
            Inspect
          </a>
        </td>
      </tr>
    `;
  }).join('');
}
