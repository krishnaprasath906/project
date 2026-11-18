/**
 * RIVERGUARD AI — CURRENT ALERT & ANALYSIS CONTROLLER
 * Exclusively displays the CURRENT active river analysis and operational alert status.
 * Historical dispatch timeline is archived in alert-history.html.
 */

document.addEventListener('DOMContentLoaded', () => {
  loadAlertStats();
  initSmtpControls();
});

async function loadAlertStats() {
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

      // Update recipient and sender display
      const smtpInfo = data.smtp_status || {};
      const target = smtpInfo.recipient || 'krishnaprasath720@gmail.com';
      const sender = smtpInfo.sender || 'rivergaurd@gmail.com';

      const dispEl = document.getElementById('displayRecipientEmail');
      const senderEl = document.getElementById('displaySenderEmail');
      const bannerEl = document.getElementById('bannerTargetEmail');
      const bannerSender = document.getElementById('bannerSenderEmail');

      if (dispEl) dispEl.textContent = target;
      if (senderEl) senderEl.textContent = sender;
      if (bannerEl) bannerEl.textContent = target;
      if (bannerSender) bannerSender.textContent = sender;

      const toInput = document.getElementById('smtpToInput');
      if (toInput && !toInput.value) toInput.value = target;

      if (document.getElementById('smtpUserInput') && smtpInfo.username) {
        document.getElementById('smtpUserInput').value = smtpInfo.username;
      }

      // Check for target analysis ID in URL (e.g. redirected from upload.html)
      const urlParams = new URLSearchParams(window.location.search);
      const targetId = urlParams.get('id') || urlParams.get('analysis_id');

      let currentAnalysisObj = data.current_status;
      if (targetId) {
        try {
          const detailRes = await fetch(`${API_BASE}/api/analyses/${targetId}`);
          const detailData = await detailRes.json();
          if (detailData.success && detailData.analysis) {
            const an = detailData.analysis;
            const al = detailData.alert || {};
            currentAnalysisObj = {
              id: al.id || an.id,
              analysis_id: an.id,
              alert_level: an.risk_level || al.alert_level || 'SAFE',
              title: al.title || (an.risk_level === 'SAFE' ? 'NORMAL WATER' : `${an.risk_level} CONDITION`),
              description: al.description || an.message,
              water_level: an.water_level,
              calibration_required: an.water_level === null || an.water_level === undefined,
              threshold: al.threshold || (an.risk_level === 'EMERGENCY' ? 4.80 : (an.risk_level === 'WARNING' ? 3.50 : 2.00)),
              confidence: an.confidence || al.confidence,
              status: al.status || 'active',
              created_at: an.created_at || al.created_at,
              annotated_image_path: an.annotated_image_path,
              image_path: an.image_path,
              waterline_y: an.waterline_y,
              waterline_x: an.waterline_x,
              reference_detected: an.reference_detected,
              reference_type: an.reference_type,
              original_filename: an.original_filename
            };
          }
        } catch (err) {
          console.warn('Could not fetch specific analysis detail:', err);
        }
      }

      // Render Current Analysis
      renderCurrentAnalysis(currentAnalysisObj, smtpInfo, counts);
    }
  } catch (err) {
    console.warn('Error loading alert stats:', err);
    const container = document.getElementById('currentAnalysisContainer');
    if (container) {
      container.innerHTML = `
        <div class="glass-panel" style="padding:40px; text-align:center; color:#DC2626;">
          <i class="fas fa-exclamation-triangle" style="font-size:32px; margin-bottom:12px;"></i>
          <p>Unable to load current river analysis. Please ensure backend server is running.</p>
        </div>
      `;
    }
  }
}

function renderCurrentAnalysis(curr, smtpInfo, counts) {
  const container = document.getElementById('currentAnalysisContainer');
  if (!container) return;

  if (!curr) {
    container.innerHTML = `
      <div class="glass-panel" style="padding:40px; text-align:center; color:var(--text-muted);">
        <i class="fas fa-shield-alt" style="font-size:36px; color:#16A34A; margin-bottom:12px;"></i>
        <h3 style="color:var(--text-heading); font-size:18px;">No Elevated Flood Alarms Active</h3>
        <p>River water levels are currently within safe baseline limits.</p>
      </div>
    `;
    return;
  }

  const level = (curr.alert_level || 'SAFE').toUpperCase();
  const isSafe = level === 'SAFE';
  const isWatch = level === 'WATCH';
  const isWarning = level === 'WARNING';
  const isEmergency = level === 'EMERGENCY';

  const badgeColor = isSafe ? '#16A34A' : (isWatch ? '#FACC15' : isWarning ? '#F97316' : '#DC2626');
  const badgeGlow = isSafe ? 'rgba(22, 163, 74, 0.3)' : (isWatch ? 'rgba(250, 204, 21, 0.3)' : isWarning ? 'rgba(249, 115, 22, 0.35)' : 'rgba(220, 38, 38, 0.4)');

  const isCalibrated = curr.water_level !== null && curr.water_level !== undefined && !curr.calibration_required;
  const waterLevel = isCalibrated ? parseFloat(curr.water_level) : null;
  const threshold = curr.threshold !== null && curr.threshold !== undefined ? parseFloat(curr.threshold) : (isEmergency ? 4.80 : (isWarning ? 3.50 : 2.00));
  const confidence = curr.confidence || 95;
  const createdAt = curr.created_at || 'Just Now';
  const title = isSafe ? (isCalibrated ? 'NORMAL WATER NOMINAL' : 'NORMAL WATER (UNCALIBRATED)') : (curr.title || `${level} CONDITION DETECTED`);
  const description = curr.description || (isSafe ? 'River water level is currently within the configured safe operational range.' : 'Elevated river flood telemetry reported.');

  const sender = smtpInfo.sender || 'rivergaurd@gmail.com';
  const recipient = smtpInfo.recipient || 'krishnaprasath720@gmail.com';

  // Gauge pointer calculation (0m to 6.0m max)
  const maxGauge = 6.0;
  const gaugePct = isCalibrated ? Math.min(Math.max((waterLevel / maxGauge) * 100, 0), 100) : 33.3;

  // Margin calculation
  let marginText = 'Awaiting Physical Calibration';
  let marginColor = '#94A3B8';
  if (isCalibrated) {
    const marginDiff = waterLevel - threshold;
    marginText = marginDiff >= 0 
      ? `+${marginDiff.toFixed(2)}m (Danger Exceeded)` 
      : `${marginDiff.toFixed(2)}m (Safe Margin)`;
    marginColor = marginDiff >= 0 ? '#DC2626' : '#16A34A';
  }

  // Actionable protocol text
  let protocolTitle = '';
  let protocolMsg = '';
  if (isEmergency) {
    protocolTitle = 'CRITICAL EMERGENCY PROTOCOL ACTIVATED';
    protocolMsg = 'Automatic email notification was dispatched immediately to station administrator. River sector response teams and downstream drainage control have been alerted.';
  } else if (isWarning) {
    protocolTitle = 'WARNING SURGE ADVISORY';
    protocolMsg = 'Water level has crossed warning threshold 3.50m. Prepare mobile pumping units and initiate continuous visual surveillance.';
  } else if (isWatch) {
    protocolTitle = 'ELEVATED WATCH STATE';
    protocolMsg = 'Runoff inflow detected. Telemetry sensors armed for 15-minute polling interval.';
  } else {
    protocolTitle = 'ROUTINE MONITORING STATE';
    protocolMsg = 'River depth is well below advisory limits. Normal seasonal discharge nominal.';
  }

  const hasImage = Boolean(curr.annotated_image_path);
  const imgUrl = hasImage ? curr.annotated_image_path : (curr.image_path || '');

  let dispatchBannerHtml = '';
  if (isEmergency) {
    dispatchBannerHtml = `
      <div class="emergency-auto-dispatch-alert">
        <div style="display:flex; align-items:center; gap:14px;">
          <div class="emergency-hazard-icon-circle">
            <i class="fas fa-exclamation-triangle"></i>
          </div>
          <div>
            <div style="font-weight:800; font-size:15px; color:#DC2626; letter-spacing:0.5px;">
              CRITICAL FLOOD EMERGENCY &bull; AUTOMATIC EMAIL DISPATCHED
            </div>
            <div style="font-size:13px; color:#F8FAFC; margin-top:3px; line-height:1.4;">
              High water level (<strong style="color:#DC2626;">${isCalibrated ? `${waterLevel.toFixed(2)}m` : 'CRITICAL OVERFLOW'}</strong>) has crossed flood threshold ${threshold.toFixed(2)}m. Automated emergency notification was dispatched to <strong style="color:#38BDF8;">${recipient}</strong> from <strong style="color:#7DD3FC;">${sender}</strong>.
            </div>
          </div>
        </div>
        <button type="button" onclick="triggerTestEmail()" class="btn-command" style="background:#DC2626; color:#FFFFFF; font-size:12px; padding:9px 18px; border-radius:6px; box-shadow:0 0 14px rgba(220,38,38,0.5);">
          <i class="fas fa-paper-plane"></i> Re-transmit Alert Email
        </button>
      </div>
    `;
  } else if (isWarning) {
    dispatchBannerHtml = `
      <div class="warning-auto-dispatch-alert">
        <div style="display:flex; align-items:center; gap:14px;">
          <div class="warning-hazard-icon-circle">
            <i class="fas fa-exclamation-circle"></i>
          </div>
          <div>
            <div style="font-weight:800; font-size:15px; color:#F97316; letter-spacing:0.5px;">
              ELEVATED WATER LEVEL WARNING &bull; ACTIVE SURGE ADVISORY
            </div>
            <div style="font-size:13px; color:#F8FAFC; margin-top:3px; line-height:1.4;">
              River water level (<strong style="color:#F97316;">${isCalibrated ? `${waterLevel.toFixed(2)}m` : 'SURGE RISK'}</strong>) has reached warning threshold ${threshold.toFixed(2)}m. Advisory status dispatched to <strong style="color:#38BDF8;">${recipient}</strong>.
            </div>
          </div>
        </div>
        <button type="button" onclick="triggerTestEmail()" class="btn-command" style="background:#F97316; color:#FFFFFF; font-size:12px; padding:9px 18px; border-radius:6px;">
          <i class="fas fa-paper-plane"></i> Send Test Notice
        </button>
      </div>
    `;
  }

  container.innerHTML = `
    ${dispatchBannerHtml}
    <div class="current-alert-card glass-panel" style="border-left: 6px solid ${badgeColor}; background: linear-gradient(135deg, rgba(11,23,38,0.92) 0%, rgba(7,17,31,0.98) 100%);">
      
      <!-- Top Header Row -->
      <div class="alert-card-header">
        <div class="alert-header-info">
          <div class="alert-scan-eyebrow">
            <i class="fas fa-radar"></i> Live Flood Surveillance &bull; Scan #${curr.id || curr.analysis_id || 'Latest'}
          </div>
          <div class="alert-card-title-row">
            <h2 class="alert-card-title">${title}</h2>
            <span class="status-pill ${level.toLowerCase()}" style="font-size:12px; padding:4px 14px; background:${badgeColor}; color:#FFFFFF; border:none; box-shadow:0 0 14px ${badgeGlow};">
              ● ${level}
            </span>
          </div>
        </div>

        <div class="alert-card-meta">
          <div class="alert-meta-time"><i class="far fa-clock"></i> <span>Detection:</span> <strong>${createdAt}</strong></div>
          <div class="alert-meta-route">
            <span class="route-chip sender" title="Dispatch Sender"><i class="fas fa-paper-plane"></i> ${sender}</span>
            <span class="route-arrow">→</span>
            <span class="route-chip recipient" title="Admin Recipient"><i class="fas fa-user-shield"></i> ${recipient}</span>
          </div>
        </div>
      </div>

      <!-- Main Content Grid: Telemetry Readout & Optional HUD Image -->
      <div class="alert-showcase-grid">
        
        <!-- Left: Telemetry & Gauge -->
        <div style="min-width:0;">
          <!-- Large Metric Display -->
          <div style="display:flex; align-items:baseline; gap:14px; margin-bottom:12px; flex-wrap:wrap;">
            ${isCalibrated ? `
              <span style="font-size:42px; font-weight:800; color:#F8FAFC; line-height:1; font-family:'Plus Jakarta Sans', sans-serif;">
                ${waterLevel.toFixed(2)}
              </span>
              <span style="font-size:18px; font-weight:700; color:#38BDF8; letter-spacing:0.5px;">METRES</span>
              <span style="font-size:13px; color:#94A3B8; font-family:'Plus Jakarta Sans', sans-serif;">
                (Current River Surface Level)
              </span>
            ` : `
              <div>
                <span style="font-size:24px; font-weight:700; color:#FACC15; line-height:1.2; display:block; font-family:'Plus Jakarta Sans', sans-serif;">
                  Normal River Water Level
                </span>
                <span style="font-size:13px; color:#94A3B8; font-family:'Plus Jakarta Sans', sans-serif; margin-top:4px; display:block;">
                  Surface detected within safe river boundary (Y: ${curr.waterline_y || '384'}px)
                </span>
              </div>
            `}
          </div>

          <!-- Clean Level Gauge Progress Bar -->
          <div style="margin: 16px 0 18px 0;">
            <div style="display:flex; justify-content:space-between; font-size:12px; font-family:'Plus Jakarta Sans', sans-serif; color:#CBD5E1; margin-bottom:6px;">
              <span style="font-weight:600;">Hydrometric Gauge (0m – 6m)</span>
              <span style="color:${badgeColor}; font-weight:700;">
                ${isCalibrated ? `${waterLevel.toFixed(2)}m (${gaugePct.toFixed(0)}%)` : `Current: Safe`}
              </span>
            </div>
            
            <div class="gauge-track" style="height:10px; border-radius:9999px; overflow:hidden; background:rgba(255,255,255,0.08);">
              <!-- Safe segment: 0 to 2.0m (33.3%) -->
              <div class="gauge-segment" style="width:33.33%; background:#16A34A;" title="Safe Range (<2.0m)"></div>
              <!-- Watch segment: 2.0 to 3.5m (25%) -->
              <div class="gauge-segment" style="width:25%; background:#FACC15;" title="Watch Range (2.0-3.5m)"></div>
              <!-- Warning segment: 3.5 to 4.8m (21.67%) -->
              <div class="gauge-segment" style="width:21.67%; background:#F97316;" title="Warning Range (3.5-4.8m)"></div>
              <!-- Emergency segment: 4.8 to 6.0m (20%) -->
              <div class="gauge-segment" style="width:20%; background:#DC2626;" title="Emergency Range (>=4.8m)"></div>
              ${isCalibrated ? `
                <!-- Needle Pointer -->
                <div class="gauge-pointer" style="left: calc(${gaugePct}% - 2px);" title="Current Water Level: ${waterLevel.toFixed(2)}m"></div>
              ` : ''}
            </div>

            <!-- Mathematical 4-column aligned labels -->
            <div class="gauge-legend-labels">
              <span class="lbl-safe">Safe &lt;2m</span>
              <span class="lbl-watch">Watch 2-3.5m</span>
              <span class="lbl-warning">Warn 3.5-4.8m</span>
              <span class="lbl-flood">Flood &ge;4.8m</span>
            </div>
          </div>

          <!-- 3 Clean Metric Tiles -->
          <div class="alert-showcase-metrics">
            <div class="alert-metric-tile">
              <span class="alert-metric-tile-lbl">Water Level</span>
              <span class="alert-metric-tile-val">${isCalibrated ? `${waterLevel.toFixed(2)} m` : 'Normal Flow'}</span>
            </div>

            <div class="alert-metric-tile">
              <span class="alert-metric-tile-lbl">Risk Status</span>
              <span class="alert-metric-tile-val" style="color:${badgeColor};">${level}</span>
            </div>

            <div class="alert-metric-tile">
              <span class="alert-metric-tile-lbl">AI Confidence</span>
              <span class="alert-metric-tile-val" style="color:#38BDF8;">${confidence}%</span>
            </div>
          </div>

          <!-- Simple, Human Understandable Summary -->
          <div style="background:rgba(255,255,255,0.04); padding:14px 16px; border-radius:10px; border-left:4px solid ${badgeColor}; font-family:'Plus Jakarta Sans', sans-serif;">
            <div style="font-size:13px; font-weight:700; color:${badgeColor}; margin-bottom:4px;">
              <i class="fas fa-circle-check"></i> ${isSafe ? 'River Water Level Normal' : `${level} Flood Advisory`}
            </div>
            <p style="margin:0; color:#E2E8F0; font-size:13px; line-height:1.5;">
              ${isSafe 
                ? 'River water surface is within normal seasonal boundaries. Telemetry cameras report safe river discharge.' 
                : description}
            </p>
          </div>

        </div>

        <!-- Right: Computer Vision HUD Overlay (if image exists) -->
        ${hasImage ? `
          <div class="alert-hud-preview-box">
            <div>
              <div style="font-family:'Plus Jakarta Sans', sans-serif; font-size:12px; font-weight:600; color:#38BDF8; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                <span><i class="fas fa-camera"></i> Live Camera Scan</span>
                <span style="color:#10B981; font-weight:700;">● Active</span>
              </div>
              <div class="alert-hud-img-wrap">
                <img src="${imgUrl}" alt="River Analysis Scan">
                <div style="position:absolute; bottom:6px; left:8px; right:8px; background:rgba(7,17,31,0.88); padding:5px 10px; border-radius:6px; font-family:'Plus Jakarta Sans', sans-serif; font-size:11px; color:#F8FAFC; display:flex; justify-content:space-between; align-items:center;">
                  <span>Waterline: ${isCalibrated ? `${waterLevel.toFixed(2)}m` : 'Detected'}</span>
                  <span style="color:${badgeColor}; font-weight:700;">● ${level}</span>
                </div>
              </div>
            </div>

            <div>
              <a href="analysis.html?id=${curr.analysis_id || curr.id}" class="btn-command" style="width:100%; text-align:center; padding:9px 12px; font-size:12px; background:#0284C7; color:#FFFFFF; border-radius:8px; display:inline-flex; align-items:center; justify-content:center; gap:8px;">
                <i class="fas fa-search-plus"></i> View Advanced Analysis
              </a>
            </div>
          </div>
        ` : ''}

      </div>
    </div>

      </div>
    </div>
  `;
}

function initSmtpControls() {
  const btnToggle = document.getElementById('btnToggleSmtpConfig');
  const panel = document.getElementById('smtpConfigPanel');
  const form = document.getElementById('smtpConfigForm');
  const btnTest = document.getElementById('btnSendTestEmail');
  const feedback = document.getElementById('emailTestFeedback');

  if (btnToggle && panel) {
    btnToggle.addEventListener('click', () => {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
  }

  // Save SMTP Settings
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const host = document.getElementById('smtpHostInput').value.trim();
      const port = document.getElementById('smtpPortInput').value.trim();
      const username = document.getElementById('smtpUserInput').value.trim();
      const password = document.getElementById('smtpPassInput').value.trim();
      const alert_email_to = document.getElementById('smtpToInput').value.trim();

      try {
        const res = await fetch(`${API_BASE}/api/alerts/configure-smtp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            smtp_host: host,
            smtp_port: port,
            smtp_username: username,
            smtp_password: password,
            alert_email_from: username,
            alert_email_to: alert_email_to
          })
        });
        const data = await res.json();
        if (data.success) {
          showToast(`SMTP configured: ${username} → ${alert_email_to}!`, 'safe');
          panel.style.display = 'none';
          loadAlertStats();
        }
      } catch (err) {
        showToast('Error saving SMTP configuration.', 'emergency');
      }
    });
  }

  // Send Test Email from rivergaurd@gmail.com to krishnaprasath720@gmail.com
  if (btnTest) {
    btnTest.addEventListener('click', async () => {
      btnTest.disabled = true;
      btnTest.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Dispatching test alert...`;
      if (feedback) feedback.style.display = 'none';

      try {
        const res = await fetch(`${API_BASE}/api/alerts/send-test-email`, {
          method: 'POST'
        });
        const data = await res.json();

        btnTest.disabled = false;
        btnTest.innerHTML = `<i class="fas fa-paper-plane"></i> Send Test Emergency Alert Email`;

        if (!data.success && res.status === 403) {
          showToast(data.message || 'Action restricted: View-only mode active.', 'watch');
          return;
        }

        if (feedback) {
          feedback.style.display = 'block';
          if (data.success && data.status.includes('SENT')) {
            feedback.style.background = 'rgba(22, 163, 74, 0.12)';
            feedback.style.border = '1px solid #16A34A';
            feedback.style.color = '#16A34A';
            feedback.innerHTML = `<strong><i class="fas fa-check-circle"></i> SUCCESS:</strong> Emergency alert successfully transmitted from <strong>${data.sender || 'rivergaurd@gmail.com'}</strong> to <strong>${data.recipient}</strong>. Check your inbox!`;
          } else {
            feedback.style.background = 'rgba(220, 38, 38, 0.12)';
            feedback.style.border = '1px solid #DC2626';
            feedback.style.color = '#DC2626';
            feedback.innerHTML = `<strong><i class="fas fa-times-circle"></i> DELIVERY ATTEMPT:</strong> ${data.error || data.status || 'Check SMTP configuration'}. Target: <strong>${data.recipient}</strong>.`;
          }
        }
      } catch (err) {
        btnTest.disabled = false;
        btnTest.innerHTML = `<i class="fas fa-paper-plane"></i> Send Test Emergency Alert Email`;
        showToast('Network error triggering test email.', 'emergency');
      }
    });
  }
}

window.triggerTestEmail = function() {
  const btn = document.getElementById('btnSendTestEmail');
  if (btn) btn.click();
};

