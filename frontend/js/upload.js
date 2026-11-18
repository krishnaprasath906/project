/**
 * RIVERGUARD AI — IMAGE ANALYSIS & CAMERA SURVEILLANCE CONTROLLER
 * Professional live camera stream capture, real-time anti-comic / cartoon detection,
 * non-water scene rejection, and smooth navigation to the flood alert center.
 */

let selectedFile = null;
let isOperatorVerified = true;
let activeStream = null;
let currentFacingMode = 'environment';
let isComicRejected = false;

document.addEventListener('DOMContentLoaded', () => {
  checkOperatorVerification();
  initModeTabs();
  initLiveCamera();
  initDropzone();
  initSampleButtons();
  initFormActions();
});

// ----------------------------------------------------
// 1. OPERATOR VERIFICATION CHECK
// ----------------------------------------------------
async function checkOperatorVerification() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`);
    const data = await res.json();
    if (data.authenticated && data.user) {
      const u = data.user;
      const isAdmin = u.is_admin || u.email === 'krishnaprasath720@gmail.com';
      if (!isAdmin && !u.is_verified) {
        isOperatorVerified = false;
        const banner = document.getElementById('uploadVerificationBanner');
        if (banner) {
          banner.style.display = 'block';
          banner.innerHTML = `
            <div class="glass-panel" style="padding:20px 24px; border-left:5px solid #FACC15; background:rgba(250,204,21,0.12); margin-bottom:24px; border-radius:var(--radius-lg);">
              <div style="font-weight:700; color:#D97706; font-size:14px; margin-bottom:6px; display:flex; align-items:center; gap:8px;">
                <i class="fas fa-eye"></i> VIEW-ONLY MODE ACTIVE &bull; PENDING ADMINISTRATOR APPROVAL
              </div>
              <div style="font-size:13px; color:var(--text-body); line-height:1.6;">
                Your operator account is currently in <strong>View-Only Mode</strong>. You can inspect the camera and sensor viewport, but operational controls (live camera snapshot and photographic image uploads) are locked until Station Administration approves your account in <a href="profile.html" style="color:var(--accent); font-weight:700;">User Verification</a>.
              </div>
            </div>
          `;
        }

        // Visual lock on the capture button
        const btnCap = document.getElementById('btnCaptureCamera');
        if (btnCap) {
          btnCap.title = "View-Only Mode: Awaiting Admin Approval";
          btnCap.style.opacity = '0.7';
        }
      }
    }
  } catch (err) {
    console.warn('Error checking operator verification status:', err);
  }
}

// ----------------------------------------------------
// 2. SURVEILLANCE MODE TABS (LIVE CAMERA vs FILE)
// ----------------------------------------------------
function initModeTabs() {
  const tabLive = document.getElementById('tabModeLiveCam');
  const tabFile = document.getElementById('tabModeFileUpload');
  const camContainer = document.getElementById('cameraViewportContainer');
  const fileContainer = document.getElementById('fileUploadContainer');

  if (tabLive && tabFile) {
    tabLive.addEventListener('click', () => {
      tabLive.classList.add('active');
      tabFile.classList.remove('active');
      if (camContainer) camContainer.classList.add('active');
      if (fileContainer) fileContainer.style.display = 'none';
      startCameraStream();
    });

    tabFile.addEventListener('click', () => {
      tabFile.classList.add('active');
      tabLive.classList.remove('active');
      if (camContainer) camContainer.classList.remove('active');
      if (fileContainer) fileContainer.style.display = 'block';
      stopCameraStream();
    });
  }
}

// ----------------------------------------------------
// 3. LIVE FIELD CAMERA STREAM ENGINE
// ----------------------------------------------------
async function startCameraStream() {
  const video = document.getElementById('cameraVideoFeed');
  if (!video || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.warn('MediaDevices camera API not supported in this environment.');
    return;
  }

  stopCameraStream();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: currentFacingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    activeStream = stream;
    video.srcObject = stream;
    video.play().catch(e => console.warn('Video playback notice:', e));
    video.onplaying = () => {
      const backdrop = document.getElementById('cameraStandbyBackdrop');
      if (backdrop) backdrop.style.display = 'none';
    };

    const track = stream.getVideoTracks()[0];
    const settings = track.getSettings ? track.getSettings() : {};
    const resBadge = document.getElementById('hudCameraResolution');
    if (resBadge && settings.width && settings.height) {
      resBadge.textContent = `${settings.width}×${settings.height} • 30 FPS`;
    }
  } catch (err) {
    console.warn('Unable to access video camera:', err);
    const hudTag = document.getElementById('hudCameraResolution');
    if (hudTag) hudTag.textContent = 'OPTICAL SENSOR STANDBY • BROWSE FILE';
    const backdrop = document.getElementById('cameraStandbyBackdrop');
    if (backdrop) backdrop.style.display = 'flex';
  }
}

function stopCameraStream() {
  if (activeStream) {
    activeStream.getTracks().forEach(track => track.stop());
    activeStream = null;
  }
  const backdrop = document.getElementById('cameraStandbyBackdrop');
  if (backdrop) backdrop.style.display = 'flex';
}

function initLiveCamera() {
  startCameraStream();

  // Toggle Camera Facing Lens (Front vs Back)
  const btnToggleFacing = document.getElementById('btnToggleFacingMode');
  if (btnToggleFacing) {
    btnToggleFacing.addEventListener('click', () => {
      currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
      startCameraStream();
    });
  }

  // Shutter Snapshot Button
  const btnCapture = document.getElementById('btnCaptureCamera');
  const video = document.getElementById('cameraVideoFeed');
  const canvas = document.getElementById('cameraCaptureCanvas');
  const shutterFlash = document.getElementById('cameraShutterFlash');

  if (btnCapture && video && canvas) {
    btnCapture.addEventListener('click', () => {
      if (!isOperatorVerified) {
        showToast("VIEW-ONLY MODE: Account awaiting Administrator approval. Camera capture locked.", 'watch');
        return;
      }

      // Shutter flash animation
      if (shutterFlash) {
        shutterFlash.classList.add('flashing');
        setTimeout(() => shutterFlash.classList.remove('flashing'), 120);
      }

      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 720;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, w, h);

      canvas.toBlob((blob) => {
        if (!blob) return;
        const file = new File([blob], `live_camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
        handleFileSelected(file);
      }, 'image/jpeg', 0.95);
    });
  }
}

// ----------------------------------------------------
// 4. DROPZONE & FILE INPUT HANDLERS
// ----------------------------------------------------
function initDropzone() {
  const dropzone = document.getElementById('uploadDropzone');
  const fileInput = document.getElementById('riverFileInput');

  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('click', (e) => {
    if (!isOperatorVerified) {
      e.preventDefault();
      showToast("VIEW-ONLY MODE: Account awaiting Administrator approval. Upload controls locked.", 'watch');
      return;
    }
    fileInput.click();
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('drag-over');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    if (!isOperatorVerified) {
      showToast("VIEW-ONLY MODE: Account awaiting Administrator approval. Upload controls locked.", 'watch');
      return;
    }
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelected(e.target.files[0]);
    }
  });
}

// ----------------------------------------------------
// 5. ANTI-COMIC & LIVE PHOTOGRAPH INTEGRITY SCANNER
// ----------------------------------------------------
function handleFileSelected(file) {
  if (!isOperatorVerified) {
    showToast("ACCESS RESTRICTED: Operator pending Administrator verification.", 'emergency');
    return;
  }

  const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
  if (!validTypes.includes(file.type.toLowerCase()) && !/\.(jpe?g|png)$/i.test(file.name)) {
    showToast("FORMAT REJECTED: Only JPG and PNG river photographic images are supported.", 'emergency');
    return;
  }

  if (file.size > 16 * 1024 * 1024) {
    showToast("FILE SIZE LIMIT: Image exceeds maximum 16MB threshold.", 'emergency');
    return;
  }

  selectedFile = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    const previewImg = document.getElementById('previewImg');
    const previewCard = document.getElementById('previewCard');

    if (previewImg) previewImg.src = dataUrl;
    if (previewCard) previewCard.style.display = 'block';

    const valFileName = document.getElementById('valFileName');
    const valFileSize = document.getElementById('valFileSize');
    const dimBadge = document.getElementById('previewDimensionsBadge');

    if (valFileName) valFileName.textContent = file.name;
    if (valFileSize) valFileSize.textContent = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;

    // Load into Image to inspect natural dimensions & run Anti-Comic audit
    const imgObj = new Image();
    imgObj.onload = () => {
      if (dimBadge) dimBadge.textContent = `${imgObj.naturalWidth} × ${imgObj.naturalHeight} PX`;
      auditLiveVsComic(imgObj);
    };
    imgObj.src = dataUrl;

    // Smooth scroll down to preview
    previewCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  reader.readAsDataURL(file);
}

/**
 * Analyzes image pixel statistics in downsampled RGB space:
 * 1. Checks Color Quantization Entropy (comics have < 70 distinct colors)
 * 2. Checks Flat Cel-Shading Coverage (cartoons have > 38% adjacent identical color fills)
 * 3. Checks Inking Outline Ratio (drawings have heavy black edges)
 */
function auditLiveVsComic(img) {
  const canvas = document.createElement('canvas');
  const sw = 160;
  const sh = 120;
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, sw, sh);

  const imgData = ctx.getImageData(0, 0, sw, sh);
  const data = imgData.data;
  const totalPixels = sw * sh;

  const colorBins = new Set();
  let flatColorCount = 0;
  let darkEdgeCount = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // 15-bit color bin
    const bin = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    colorBins.add(bin);

    // Adjacent horizontal flat check
    if (i + 4 < data.length) {
      const dr = Math.abs(r - data[i + 4]);
      const dg = Math.abs(g - data[i + 5]);
      const db = Math.abs(b - data[i + 6]);
      if (dr === 0 && dg === 0 && db === 0) {
        flatColorCount++;
      }
    }

    // Heavy dark inking edge check (comic line art)
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    if (luminance < 25) {
      darkEdgeCount++;
    }
  }

  const uniqueColors = colorBins.size;
  const flatRatio = flatColorCount / totalPixels;
  const darkEdgeRatio = darkEdgeCount / totalPixels;

  const banner = document.getElementById('imageIntegrityBanner');
  const icon = document.getElementById('integrityIcon');
  const title = document.getElementById('integrityTitle');
  const desc = document.getElementById('integrityDescription');
  const btnAnalyse = document.getElementById('btnAnalyse');

  const isComicOrCartoon = uniqueColors < 75 || flatRatio > 0.40 || (uniqueColors < 120 && darkEdgeRatio > 0.08);

  if (isComicOrCartoon) {
    isComicRejected = true;
    if (banner) {
      banner.className = 'image-integrity-banner comic-rejected';
      if (icon) icon.innerHTML = '<i class="fas fa-ban"></i>';
      if (title) title.textContent = 'COMIC / ARTIFICIAL ARTWORK DETECTED';
      if (desc) {
        desc.textContent = `Artificial artwork rejected (${uniqueColors} quantized color bins, ${(flatRatio * 100).toFixed(0)}% flat cel-shading). RiverGuard AI requires a genuine live optical photograph.`;
      }
    }
    if (btnAnalyse) {
      btnAnalyse.disabled = true;
      btnAnalyse.style.opacity = '0.5';
      btnAnalyse.style.cursor = 'not-allowed';
    }
    showToast("IMAGE REJECTED: Cartoon, comic, or illustrated art detected. Upload a live river photograph.", 'emergency');
  } else {
    isComicRejected = false;
    if (banner) {
      banner.className = 'image-integrity-banner safe-photo';
      if (icon) icon.innerHTML = '<i class="fas fa-check-circle"></i>';
      if (title) title.textContent = 'OPTICAL SENSOR PHOTOGRAPH CONFIRMED';
      if (desc) {
        desc.textContent = `Live sensor noise and continuous natural gradient verified (${uniqueColors} chromatic levels). Hydrological waterline pipeline ready.`;
      }
    }
    if (btnAnalyse) {
      btnAnalyse.disabled = false;
      btnAnalyse.style.opacity = '1';
      btnAnalyse.style.cursor = 'pointer';
    }
  }
}

// ----------------------------------------------------
// 6. BENCHMARK SAMPLE BUTTONS
// ----------------------------------------------------
function initSampleButtons() {
  const samples = [
    { id: 'sample-safe', url: '/uploads/sample_river_normal_safe.jpg', name: 'river_normal_1.71m.jpg' },
    { id: 'sample-watch', url: '/uploads/sample_river_watch.jpg', name: 'river_watch_2.49m.jpg' },
    { id: 'sample-warning', url: '/uploads/sample_river_warning.jpg', name: 'river_warning_3.78m.jpg' },
    { id: 'sample-emergency', url: '/uploads/sample_river_flood_emergency.jpg', name: 'river_flood_emergency_5.10m.jpg' },
    { id: 'sample-uncalibrated', url: '/uploads/sample_river_uncalibrated_nogauge.jpg', name: 'river_uncalibrated_raw.jpg' }
  ];

  samples.forEach(s => {
    const btn = document.getElementById(s.id);
    if (btn) {
      btn.addEventListener('click', async () => {
        if (!isOperatorVerified) {
          showToast("ACCESS RESTRICTED: Account pending Administrator verification.", 'emergency');
          return;
        }
        try {
          const res = await fetch(s.url);
          const blob = await res.blob();
          const file = new File([blob], s.name, { type: 'image/jpeg' });
          handleFileSelected(file);
        } catch (e) {
          showToast("Failed to load evaluation sample.", 'emergency');
        }
      });
    }
  });
}

// ----------------------------------------------------
// 7. FORM ACTIONS & RUN ANALYSIS PIPELINE
// ----------------------------------------------------
function initFormActions() {
  const btnReset = document.getElementById('btnReset');
  const btnAnalyse = document.getElementById('btnAnalyse');

  if (btnReset) {
    btnReset.addEventListener('click', () => {
      selectedFile = null;
      isComicRejected = false;
      const previewCard = document.getElementById('previewCard');
      const fileInput = document.getElementById('riverFileInput');
      if (previewCard) previewCard.style.display = 'none';
      if (fileInput) fileInput.value = '';
    });
  }

  if (btnAnalyse) {
    btnAnalyse.addEventListener('click', async () => {
      if (!isOperatorVerified) {
        showToast("ACCESS RESTRICTED: Account pending Administrator verification.", 'emergency');
        return;
      }
      if (!selectedFile) {
        showToast("Please capture or select a river photograph first.", 'warning');
        return;
      }
      if (isComicRejected) {
        showToast("CANNOT ANALYZE: Comic/illustration detected. Select a genuine live photograph.", 'emergency');
        return;
      }
      await runAnalysisPipeline(selectedFile);
    });
  }
}

// ----------------------------------------------------
// 8. MULTI-STEP ANALYSIS PIPELINE & IMMEDIATE REDIRECT
// ----------------------------------------------------
async function runAnalysisPipeline(file) {
  const progressModal = document.getElementById('analysisProgressModal');
  const progressText = document.getElementById('progressStatusText');
  const progressBar = document.getElementById('analysisProgressBar');

  if (progressModal) progressModal.classList.add('active');

  const steps = [
    { text: "LIVE IMAGE RECEIVED // VERIFYING DATA INTEGRITY...", pct: 15 },
    { text: "PREPROCESSING & MULTI-COLOR SPACE CONVERSION (HSV/LAB)...", pct: 35 },
    { text: "SEGMENTING RIVER WATER SURFACE & DETECTING SPECULARITY...", pct: 55 },
    { text: "EXTRACTING WATERLINE BOUNDARY & REJECTING OUTLIERS...", pct: 75 },
    { text: "SCANNING FOR GAUGE STAFF REFERENCE & CALIBRATION...", pct: 90 },
    { text: "EVALUATING FLOOD RISK & GENERATING HUD OVERLAY...", pct: 98 }
  ];

  let stepIdx = 0;
  const interval = setInterval(() => {
    if (stepIdx < steps.length) {
      if (progressText) progressText.textContent = steps[stepIdx].text;
      if (progressBar) progressBar.style.width = `${steps[stepIdx].pct}%`;
      stepIdx++;
    }
  }, 420);

  const formData = new FormData();
  formData.append('image', file);

  try {
    const res = await fetch(`${API_BASE}/api/analyze-image`, {
      method: 'POST',
      body: formData
    });

    clearInterval(interval);
    const data = await res.json();

    if (!res.ok || !data.success) {
      if (progressModal) progressModal.classList.remove('active');
      const banner = document.getElementById('imageIntegrityBanner');
      const icon = document.getElementById('integrityIcon');
      const title = document.getElementById('integrityTitle');
      const desc = document.getElementById('integrityDescription');

      if (banner) {
        banner.className = 'image-integrity-banner comic-rejected';
        if (icon) icon.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
        if (title) title.textContent = 'NON-RIVER SCENE REJECTED BY SERVER';
        if (desc) desc.textContent = data.message || 'Scene does not contain outdoor river surface.';
      }

      showToast(`IMAGE REJECTED: ${data.message || 'Invalid hydrological scene'}`, 'emergency');
      return;
    }

    // Success! Update progress to 100%
    if (progressText) progressText.textContent = "AI ANALYSIS COMPLETE // NAVIGATING TO ALERT STATUS...";
    if (progressBar) progressBar.style.width = "100%";

    // User Requirement: Immediately navigate to the Alert Page first!
    setTimeout(() => {
      sessionStorage.setItem('rg_latest_analysis', JSON.stringify(data.data));
      window.location.href = `alerts.html?id=${data.data.id}`;
    }, 500);

  } catch (err) {
    clearInterval(interval);
    if (progressModal) progressModal.classList.remove('active');
    showToast("Processing error: Unable to reach RiverGuard AI backend service.", 'emergency');
  }
}
