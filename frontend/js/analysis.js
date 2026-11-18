/**
 * RIVERGUARD AI — ANALYSIS RESULTS CONTROLLER
 * Visualizes annotated HUD output, evidence-based metrics, and technical drawer details.
 */

document.addEventListener('DOMContentLoaded', () => {
  loadAnalysisDetails();
});

async function loadAnalysisDetails() {
  const urlParams = new URLSearchParams(window.location.search);
  const analysisId = urlParams.get('id');

  let analysisData = null;

  // 1. Try fetching from URL ID
  if (analysisId) {
    try {
      const res = await fetch(`${API_BASE}/api/analyses/${analysisId}`);
      const data = await res.json();
      if (data.success) {
        analysisData = data.analysis;
      }
    } catch (err) {
      console.warn('Could not fetch analysis by ID, falling back to local session cache.');
    }
  }

  // 2. Fallback to session cache
  if (!analysisData) {
    const cached = sessionStorage.getItem('rg_latest_analysis');
    if (cached) {
      try {
        analysisData = JSON.parse(cached);
      } catch (e) {}
    }
  }

  // 3. Fallback to latest dashboard summary
  if (!analysisData) {
    try {
      const res = await fetch(`${API_BASE}/api/dashboard`);
      const dash = await res.json();
      analysisData = dash.latest_analysis;
    } catch (e) {}
  }

  if (analysisData) {
    renderAnalysisView(analysisData);
  } else {
    document.getElementById('analysisMainContainer').innerHTML = `
      <div style="text-align:center; padding:60px 20px;">
        <h3 style="color:var(--text-muted);">No analysis data found.</h3>
        <p style="margin-top:10px;"><a href="upload.html" class="btn-command">Analyse a River Image</a></p>
      </div>
    `;
  }
}

function renderAnalysisView(data) {
  // 1. Annotated Image Display
  const imgEl = document.getElementById('analysisAnnotatedImg');
  if (imgEl && data.annotated_image_path) {
    imgEl.src = data.annotated_image_path;
  }

  // 2. Metrics & Status Display
  const levelEl = document.getElementById('resWaterLevel');
  const statusBadge = document.getElementById('resStatusBadge');
  const confEl = document.getElementById('resConfidence');
  const waterlineEl = document.getElementById('resWaterline');
  const refEl = document.getElementById('resReference');
  const timeEl = document.getElementById('resTime');
  const msgEl = document.getElementById('resMessage');
  const recoEl = document.getElementById('resRecommendation');

  const isSafe = data.risk_level === 'SAFE';

  // Rule 9, 10, 17, 42:
  if (data.water_level !== null && data.water_level !== undefined) {
    const lvl = parseFloat(data.water_level);
    if (levelEl) levelEl.innerHTML = `${lvl.toFixed(2)} <span style="font-size:16px; color:var(--text-muted);">m</span>`;
  } else {
    if (levelEl) levelEl.innerHTML = `<span style="font-size:18px; font-weight:700; color:#FACC15; font-family:'Plus Jakarta Sans', sans-serif;">Normal Water Level</span>`;
  }

  if (statusBadge) {
    const label = isSafe ? '● NORMAL WATER' : `● ${data.risk_level}`;
    statusBadge.textContent = label;
    statusBadge.className = `status-pill ${data.risk_level.toLowerCase()}`;
    if (isSafe) {
      statusBadge.style.color = '#16A34A';
      statusBadge.style.borderColor = '#16A34A';
    }
  }

  if (confEl) confEl.textContent = `${data.confidence}%`;
  if (waterlineEl) waterlineEl.textContent = data.waterline_y ? `Y = ${data.waterline_y} px` : 'Detected';
  
  if (refEl) {
    if (data.reference_detected) {
      refEl.innerHTML = `<span style="color:#00B4D8;"><i class="fas fa-check-circle"></i> Detected (${data.reference_type || 'Staff Gauge'})</span>`;
    } else {
      refEl.innerHTML = `<span style="color:#FACC15;"><i class="fas fa-exclamation-triangle"></i> Not Detected (Calibration Req.)</span>`;
    }
  }

  if (timeEl) timeEl.textContent = data.created_at || 'Just Now';
  if (msgEl) msgEl.textContent = data.message || 'Water monitoring scan complete.';
  if (recoEl) recoEl.textContent = data.recommendation || 'Continue routine sensor surveillance.';

  // Check if EMERGENCY popup needed
  if (data.risk_level === 'EMERGENCY') {
    showEmergencyModal(data.risk_level, data.water_level, data.confidence);
  }

  // Populate Technical Details Modal
  const techBody = document.getElementById('techDetailsBody');
  if (techBody) {
    const meta = data.image_metadata || {};
    const qual = data.quality_metrics || {};

    techBody.innerHTML = `
      <table style="width:100%; border-collapse:collapse; font-family:var(--font-mono); font-size:12.5px;">
        <tr style="border-bottom:1px solid rgba(255,255,255,0.06);"><td style="padding:8px 0; color:var(--text-muted);">Source File:</td><td style="text-align:right;">${data.original_filename || 'station_feed.jpg'}</td></tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,0.06);"><td style="padding:8px 0; color:var(--text-muted);">Dimensions:</td><td style="text-align:right;">${meta.width || 960} x ${meta.height || 640} px</td></tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,0.06);"><td style="padding:8px 0; color:var(--text-muted);">Mean Brightness:</td><td style="text-align:right;">${meta.mean_brightness || 128}/255</td></tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,0.06);"><td style="padding:8px 0; color:var(--text-muted);">Sharpness Variance:</td><td style="text-align:right;">${qual.laplacian_var || meta.sharpness_variance || 140}</td></tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,0.06);"><td style="padding:8px 0; color:var(--text-muted);">Waterline Coordinate:</td><td style="text-align:right;">Y = ${data.waterline_y || 340} px</td></tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,0.06);"><td style="padding:8px 0; color:var(--text-muted);">Physical Reference:</td><td style="text-align:right;">${data.reference_type || 'Uncalibrated / None'}</td></tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,0.06);"><td style="padding:8px 0; color:var(--text-muted);">Evidence Confidence:</td><td style="text-align:right; color:#00B4D8; font-weight:bold;">${data.confidence}%</td></tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,0.06);"><td style="padding:8px 0; color:var(--text-muted);">Threshold Applied:</td><td style="text-align:right;">${data.threshold || 2.0} m</td></tr>
        <tr><td style="padding:8px 0; color:var(--text-muted);">Email Alert Status:</td><td style="text-align:right;">${data.email_status || 'NOT_REQUIRED'}</td></tr>
      </table>
    `;
  }
}

function openTechModal() {
  const modal = document.getElementById('techDetailsModal');
  if (modal) modal.classList.add('active');
}

function closeTechModal() {
  const modal = document.getElementById('techDetailsModal');
  if (modal) modal.classList.remove('active');
}
