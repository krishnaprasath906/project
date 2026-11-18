/**
 * RIVERGUARD AI — COMMAND CENTER DASHBOARD CONTROLLER
 * Controls live monitoring viewport, vertical gauge animations, and real-time status feeds.
 */

let dashboardData = null;
let canvasAnimId = null;

document.addEventListener('DOMContentLoaded', () => {
  loadDashboardData();
  initRiverCanvas();
  // Poll periodically every 25 seconds for environmental updates
  setInterval(loadDashboardData, 25000);
});

async function loadDashboardData() {
  try {
    const res = await fetch(`${API_BASE}/api/dashboard`);
    const data = await res.json();
    if (data.success) {
      dashboardData = data;
      renderDashboard(data);
    }
  } catch (err) {
    console.warn('Dashboard fetch offline or network error, rendering cached state:', err);
  }
}

function renderDashboard(data) {
  const latest = data.latest_analysis || {};
  const thresholds = data.thresholds || { safe: 2.0, watch: 2.0, warning: 3.5, danger: 4.8, max: 6.0 };
  
  // 1. System Indicators (Section 37)
  const lastTimeEl = document.getElementById('lastAnalysisTime');
  const engineEl = document.getElementById('engineStatus');
  const dbStatusEl = document.getElementById('dbStatus');
  const smtpStatusEl = document.getElementById('smtpStatus');

  if (lastTimeEl) lastTimeEl.textContent = latest.created_at ? latest.created_at.split(' ')[1] : '10:42:18';
  if (engineEl) engineEl.textContent = data.system_status.cv_engine;
  if (dbStatusEl) dbStatusEl.textContent = data.system_status.database;
  if (smtpStatusEl) {
    smtpStatusEl.textContent = data.system_status.smtp_status;
    smtpStatusEl.style.color = data.system_status.smtp_configured ? '#16A34A' : '#94A3B8';
  }

  // 2. Mini Statistics Cards (Section 7, 46)
  animateCounter('statWaterLevel', latest.water_level !== null && latest.water_level !== undefined ? latest.water_level : 1.82, 'm');
  
  const riskBadge = document.getElementById('statRiskStatus');
  if (riskBadge) {
    const risk = latest.risk_level || 'SAFE';
    riskBadge.textContent = risk === 'SAFE' ? 'NORMAL WATER' : risk;
    riskBadge.className = `status-pill ${risk.toLowerCase()}`;
    // Normal water must be green
    if (risk === 'SAFE') {
      riskBadge.style.color = '#16A34A';
      riskBadge.style.borderColor = '#16A34A';
    }
  }

  animateCounter('statConfidence', latest.confidence || 95, '%');
  animateCounter('statAlertsCount', data.critical_alerts_count || 0, '');

  // 3. Futuristic Vertical River Gauge (Section 9, 10)
  renderVerticalGauge(latest, thresholds);

  // 4. Viewport Camera Feed / Annotated Image Overlay (Section 8, 36)
  renderMonitoringViewport(latest);

  // 5. Recent Alerts Timeline (Section 22, 23)
  renderRecentAlerts(data.recent_alerts || []);

  // 6. High Water Automated Alert Banner
  const topAlert = document.getElementById('dashboardTopAlertBanner');
  if (topAlert) {
    const isEmerg = latest.risk_level === 'EMERGENCY';
    const isWarn = latest.risk_level === 'WARNING';
    if (isEmerg) {
      topAlert.style.display = 'block';
      topAlert.innerHTML = `
        <div class="emergency-auto-dispatch-alert">
          <div style="display:flex; align-items:center; gap:14px;">
            <div class="emergency-hazard-icon-circle">
              <i class="fas fa-exclamation-triangle"></i>
            </div>
            <div>
              <div style="font-weight:800; font-size:15px; color:#DC2626; letter-spacing:0.5px;">
                HIGH WATER LEVEL EMERGENCY &bull; AUTOMATIC EMAIL DISPATCHED
              </div>
              <div style="font-size:13px; color:#F8FAFC; margin-top:3px;">
                River surface reached <strong>${latest.water_level !== null ? `${latest.water_level}m` : 'EMERGENCY LEVEL'}</strong>. Emergency alert automatically dispatched to <strong>krishnaprasath720@gmail.com</strong>.
              </div>
            </div>
          </div>
          <a href="alerts.html" class="btn-command" style="background:#DC2626; color:#FFFFFF; font-size:12px; padding:8px 16px; border-radius:6px; box-shadow:0 0 12px rgba(220,38,38,0.5); text-decoration:none;">
            <i class="fas fa-bullhorn"></i> Inspect Flood Alert
          </a>
        </div>
      `;
    } else if (isWarn) {
      topAlert.style.display = 'block';
      topAlert.innerHTML = `
        <div class="warning-auto-dispatch-alert">
          <div style="display:flex; align-items:center; gap:14px;">
            <div class="warning-hazard-icon-circle">
              <i class="fas fa-exclamation-circle"></i>
            </div>
            <div>
              <div style="font-weight:800; font-size:15px; color:#F97316; letter-spacing:0.5px;">
                ELEVATED WATER LEVEL WARNING &bull; ACTIVE SURGE ADVISORY
              </div>
              <div style="font-size:13px; color:#F8FAFC; margin-top:3px;">
                River water level reached <strong>${latest.water_level !== null ? `${latest.water_level}m` : 'WARNING LEVEL'}</strong>. High water advisory dispatched to <strong>krishnaprasath720@gmail.com</strong>.
              </div>
            </div>
          </div>
          <a href="alerts.html" class="btn-command" style="background:#F97316; color:#FFFFFF; font-size:12px; padding:8px 16px; border-radius:6px; text-decoration:none;">
            <i class="fas fa-shield-alt"></i> View Active Advisory
          </a>
        </div>
      `;
    } else {
      topAlert.style.display = 'none';
    }
  }

  // 7. Check for EMERGENCY condition modal
  if (latest.risk_level === 'EMERGENCY') {
    showEmergencyModal(latest.risk_level, latest.water_level, latest.confidence);
  }
}

function renderVerticalGauge(latest, thresholds) {
  const liquidEl = document.getElementById('gaugeLiquid');
  const readoutEl = document.getElementById('gaugeReadoutNum');
  const statusBadge = document.getElementById('gaugeStatusBadge');
  const calibNote = document.getElementById('gaugeCalibNote');
  const maxH = thresholds.max || 6.0;

  if (latest.water_level !== null && latest.water_level !== undefined) {
    const level = parseFloat(latest.water_level);
    const fillPercent = Math.min(100, Math.max(12, (level / maxH) * 100));

    if (liquidEl) {
      liquidEl.style.height = `${fillPercent}%`;
      // Dynamic color matching exact risk status
      const color = latest.status_color || (level < thresholds.watch ? '#16A34A' :
                    level < thresholds.warning ? '#FACC15' :
                    level < thresholds.danger ? '#F97316' : '#DC2626');
      liquidEl.style.background = `linear-gradient(180deg, ${color} 0%, rgba(3, 4, 94, 0.7) 100%)`;
      liquidEl.style.boxShadow = `0 0 20px ${color}`;
    }

    if (readoutEl) readoutEl.innerHTML = `${level.toFixed(2)}<span class="readout-unit">m</span>`;
    
    if (statusBadge) {
      statusBadge.textContent = latest.risk_level === 'SAFE' ? '● NORMAL WATER' : `● ${latest.risk_level}`;
      statusBadge.className = `status-pill ${latest.risk_level.toLowerCase()}`;
    }
    
    if (calibNote) calibNote.style.display = 'none';
  } else {
    // CALIBRATION REQUIRED: Rule 9, 17, 42
    if (liquidEl) {
      liquidEl.style.height = '24%';
      liquidEl.style.background = `linear-gradient(180deg, #FACC15 0%, rgba(3, 4, 94, 0.7) 100%)`;
    }
    if (readoutEl) readoutEl.innerHTML = `<span style="font-size:18px; color:#FACC15;">CALIBRATION REQ.</span>`;
    if (statusBadge) {
      statusBadge.textContent = '● UNCALIBRATED';
      statusBadge.className = 'status-pill watch';
    }
    if (calibNote) {
      calibNote.style.display = 'block';
      calibNote.textContent = 'Reliable real-world water level cannot be calculated without reference marker.';
    }
  }
}

function renderMonitoringViewport(latest) {
  const feedImg = document.getElementById('cameraFeedImg');
  const waterlineMarker = document.getElementById('waterlineMarker');
  const waterlineBadge = document.getElementById('waterlineBadge');
  const canvas = document.getElementById('riverCanvas');

  if (latest && latest.annotated_image_path) {
    if (feedImg) {
      feedImg.src = latest.annotated_image_path;
      feedImg.style.display = 'block';
    }
    if (canvas) canvas.style.display = 'none';
    if (waterlineMarker) waterlineMarker.style.display = 'none'; // already drawn by CV engine HUD
  } else {
    // Show live canvas visualization
    if (feedImg) feedImg.style.display = 'none';
    if (canvas) canvas.style.display = 'block';
    if (waterlineMarker) waterlineMarker.style.display = 'block';
  }
}

function renderRecentAlerts(alerts) {
  const container = document.getElementById('dashboardAlertsList');
  if (!container) return;

  if (alerts.length === 0) {
    container.innerHTML = `<div style="color:var(--text-dim); font-size:12px; padding:10px;">No recent alerts recorded.</div>`;
    return;
  }

  container.innerHTML = alerts.map(a => {
    const levelClass = a.alert_level ? a.alert_level.toLowerCase() : 'safe';
    const isSafe = a.alert_level === 'SAFE';
    const title = isSafe ? 'NORMAL WATER' : a.title;
    const levelStr = a.water_level ? `${parseFloat(a.water_level).toFixed(2)}m` : 'Ref Req';

    return `
      <div class="alert-item-card ${levelClass}">
        <div class="alert-item-top">
          <span class="alert-title" style="color:${isSafe ? '#16A34A' : ''}">${title}</span>
          <span class="alert-time">${a.created_at ? a.created_at.split(' ')[1] : ''}</span>
        </div>
        <div class="alert-desc">${a.description || 'Water parameters nominal.'}</div>
        <div style="font-family:var(--font-mono); font-size:10.5px; color:var(--text-dim); margin-top:4px;">
          Level: <strong>${levelStr}</strong> &bull; Conf: <strong>${a.confidence}%</strong>
        </div>
      </div>
    `;
  }).join('');
}

// Numbers Counter Animation
function animateCounter(elementId, targetValue, suffix = '') {
  const el = document.getElementById(elementId);
  if (!el) return;

  const isFloat = typeof targetValue === 'number' && !Number.isInteger(targetValue);
  const duration = 1200;
  const start = 0;
  const startTime = performance.now();

  function updateNumber(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Smooth easeOutQuad
    const current = start + (targetValue - start) * (1 - (1 - progress) * (1 - progress));
    
    el.textContent = isFloat ? `${current.toFixed(2)}${suffix}` : `${Math.round(current)}${suffix}`;

    if (progress < 1) {
      requestAnimationFrame(updateNumber);
    } else {
      el.textContent = isFloat ? `${targetValue.toFixed(2)}${suffix}` : `${targetValue}${suffix}`;
    }
  }

  requestAnimationFrame(updateNumber);
}

// RIVER VISUALIZATION CANVAS (Section 7, 36)
function initRiverCanvas() {
  const canvas = document.getElementById('riverCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  let step = 0;

  function drawRiverScene() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const w = canvas.width;
    const h = canvas.height;

    // Atmospheric Sky Gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.45);
    skyGrad.addColorStop(0, '#040B17');
    skyGrad.addColorStop(1, '#08172E');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h * 0.45);

    // River Water Surface with flowing wave equations
    const waterLevelY = h * 0.52;
    const waveCount = 3;

    for (let i = 0; i < waveCount; i++) {
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, waterLevelY + i * 18);

      const freq = 0.008 + i * 0.003;
      const amp = 8 - i * 2;
      const speed = 0.04 + i * 0.015;

      for (let x = 0; x <= w; x += 10) {
        const y = waterLevelY + Math.sin(x * freq + step * speed) * amp + (i * 18);
        ctx.lineTo(x, y);
      }

      ctx.lineTo(w, h);
      ctx.closePath();

      const waterGrad = ctx.createLinearGradient(0, waterLevelY, 0, h);
      if (i === 0) {
        waterGrad.addColorStop(0, 'rgba(0, 180, 216, 0.45)');
        waterGrad.addColorStop(1, 'rgba(3, 4, 94, 0.95)');
      } else if (i === 1) {
        waterGrad.addColorStop(0, 'rgba(0, 119, 182, 0.35)');
        waterGrad.addColorStop(1, 'rgba(3, 4, 94, 0.9)');
      } else {
        waterGrad.addColorStop(0, 'rgba(144, 224, 239, 0.15)');
        waterGrad.addColorStop(1, 'rgba(3, 4, 94, 0.85)');
      }
      ctx.fillStyle = waterGrad;
      ctx.fill();
    }

    // Grid coordinates lines
    ctx.strokeStyle = 'rgba(0, 180, 216, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 60) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 60) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    step++;
    canvasAnimId = requestAnimationFrame(drawRiverScene);
  }

  drawRiverScene();
}
