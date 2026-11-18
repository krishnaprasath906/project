# RiverGuard AI: Water Level Monitoring and Flood Detection System Using Image Processing

![RiverGuard AI Platform](https://img.shields.io/badge/System-RiverGuard_AI_v2.4-00B4D8?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Operational_Online-16A34A?style=for-the-badge)
![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=for-the-badge&logo=python&logoColor=white)
![OpenCV](https://img.shields.io/badge/OpenCV-5.0_Headless-5C3EE8?style=for-the-badge&logo=opencv&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-3.1-000000?style=for-the-badge&logo=flask&logoColor=white)

---

## 1. Project Overview & Problem Statement

Flooding is among the most catastrophic and economically devastating climate-induced hazards globally. Traditional river monitoring predominantly relies either on expensive acoustic Doppler velocity meters and pressure-transducer staff gauges (which are vulnerable to floating debris and high silt sedimentation during storm surges) or on manual field surveys.

**RiverGuard AI** is a state-of-the-art, non-intrusive water level monitoring and flood early-warning web application powered by **Computer Vision (OpenCV)** and **Empirical Hydrological Time-Series Telemetry**. Designed with a futuristic **River Command Center** interface, it provides automated waterline boundary extraction, graduated staff gauge calibration, multi-stage flood classification, automated SMTP notifications with cooldown protection, and empirical trend projection.

---

## 2. Key Features

- **Futuristic River Command Center Interface**: Dark futuristic UI (`#07111F`, `#0B1726`), glassmorphism, animated river wave canvas, AI scanning laser line, and telemetry HUD overlays.
- **Strict Water Status Color Hierarchy**:
  - 🟢 **NORMAL WATER / SAFE (`#16A34A`)**: Normal water **ALWAYS visually appears GREEN**. Never blue.
  - 🟡 **WATCH (`#FACC15`)**: Water level approaching advisory threshold ($h \ge 2.0\text{ m}$).
  - 🟠 **WARNING (`#F97316`)**: Dangerous surge threshold breached ($h \ge 3.5\text{ m}$).
  - 🔴 **EMERGENCY / FLOOD (`#DC2626`)**: Critical flood overflow condition ($h \ge 4.8\text{ m}$) triggering automated emergency modal and SMTP alerts.
- **Dynamic Vertical River Depth Gauge**: Vertical liquid tube with dynamic fluid rise and real-time metric readings or explicit **"CALIBRATION REQUIRED"** flags.
- **Anti-Hallucination Integrity (Rules 8, 17, 28, 42)**:
  - If no physical gauge staff or spatial calibration exists, the system **never invents a fake water level**. It displays `CALIBRATION REQUIRED: Y = XXX px. Reference marker not detected`.
  - Prediction engine strictly verifies data sufficiency ($\ge 5$ calibrated readings required); otherwise, cleanly reports `PREDICTION UNAVAILABLE`.
- **Automated SMTP Email Notifications**: Automated warning and emergency emails with HTML/Plaintext telemetry, cooldown deduplication protection, and real-time delivery audit logging.
- **Interactive Drag & Drop Analysis**: Ingestion zone with client/server validation (size, resolution, blur, exposure) and 5 pre-calibrated one-click evaluation samples.
- **Environmental Analytics & Projections**: Powered by Chart.js for chronological water depth curves, alert frequency histograms, and risk doughnuts.
- **Secure Authentication & SQLite Persistence**: PBKDF2-HMAC hashed credentials, session management, and extensible SQLite schema.
- **Twilio Verify V2 SMS OTP Authentication**: Dual authentication flow supporting Password sign in and live SMS OTP verification via Twilio Verify V2 API with automatic country-code formatting, countdown timers, and sandbox resilience.
- **Zero-Trust Operator Verification & Access Control**: View-Only clearance for unverified operators; image uploads and live camera analyses remain locked until verified by Primary Administrator (`krishnaprasath720@gmail.com`).


---

## 3. Technology Stack

- **Computer Vision & Image Processing**: Python 3.12, OpenCV 5.0 (Headless), NumPy, Pillow, SciPy.
- **Backend & REST APIs**: Flask 3.1, Flask-CORS, Werkzeug, Python `smtplib` & `email`.
- **Database**: SQLite3 (`backend/database/riverguard.db`).
- **Frontend Architecture**: HTML5 semantic markup, Vanilla CSS with custom glassmorphism design tokens, Modern JavaScript (ES6+), Chart.js, FontAwesome 6.5.
- **Typography**: Poppins, Inter, JetBrains Mono.

---

## 4. System Architecture

```
[ Field Camera / Image Upload ]
              │
              ▼
   [ 1. Image Pre-Validation ] ─────────── (Fails) ──► Return 422 Rejection
              │
              ▼ (Passes)
   [ 2. Preprocessing & Denoising ]
   (Gaussian Blur, RGB, HSV, LAB Color Spaces)
              │
              ▼
   [ 3. Multi-Color Space Segmentation ]
   (HSV Water Ranges + LAB Specularity + Texture Variance - Vegetation - Sky)
              │
              ▼
   [ 4. Waterline Geometry Extraction ]
   (Upper Contour Boundary, Outlier Rejection, Polynomial Trendline)
              │
              ▼
   [ 5. Staff Gauge Reference Detection ] ──► (Detected?)
              │                                      │
              ├─► (Yes) ──► Convert px to Meters     │
              └─► (No)  ──► Set "CALIBRATION REQ" ◄──┘
              │
              ▼
   [ 6. Evidence-Based Confidence Calculation ]
   (Boundary Gradient + Area Consistency + Exposure + Gauge Evidence)
              │
              ▼
   [ 7. Multi-Tier Risk Classification ]
   (SAFE: Green, WATCH: Yellow, WARNING: Orange, EMERGENCY: Red)
              │
              ▼
   [ 8. HUD Annotated Image Generation ]
   (Water Mask Tint, Colored Waterline, Gauge Crosshairs, Sci-Fi Overlay)
              │
              ▼
   [ 9. Database Persistence & Alert Dispatch ]
              │
              ▼
   [ 10. SMTP Email Alert with Cooldown Protection ]
              │
              ▼
   [ 11. Command Center Dashboard & Analytics Synchronization ]
```

---

## 5. Image Processing Methodology

### A. Water Region Segmentation
Natural river water surfaces exhibit non-uniform illumination, specular sun glare, surface ripples, and suspended sediment. RiverGuard AI combines:
1. **HSV Water Hue Masking**:
   - Clear/cyan water: $H \in [75, 135]$, $S \in [25, 255]$, $V \in [40, 245]$
   - Murky sediment river flow: $H \in [20, 75]$, $S \in [20, 220]$, $V \in [30, 220]$
2. **LAB Specularity Discrimination**: Water reflections are isolated using lightness $L > 70$ with constrained chromaticity ($b^* \ge 120$), excluding atmospheric skies.
3. **Vegetation and Foliage Rejection**: Natural foliage with green dominance ($G > B + 10 \land G > R + 8$) is explicitly subtracted.
4. **Edge Barrier Horizon Containment**: Prominent horizontal terrain edges (Canny $\sigma=0.33$) prevent flood masks from leaking across the skyline.

### B. Waterline Extraction
1. Vertical column scanning samples the uppermost continuous water mask pixels across the width of the river reach.
2. Median Absolute Deviation (MAD) eliminates outlier surface debris.
3. A polynomial fit models the shoreline boundary across the river channel.
4. Waterline clarity is evaluated via vertical Sobel edge gradients across the line.

### C. Reference Staff Gauge Detection & Calibration
1. Hough transform and Sobel operators extract parallel vertical line pairs matching standard gauge staff widths ($10\text{ px} \le w \le 90\text{ px}$).
2. Alternating metric graduation tick marks confirm staff presence.
3. Gauge height is mapped to metric span ($5.0\text{ m}$ standard river staff), yielding the scale factor $S = \text{pixels per meter}$.
4. If detected:
   $$\text{Water Level (m)} = \frac{Y_{\text{bed}} - Y_{\text{waterline}}}{S}$$
5. **Strict Anti-Hallucination Policy**: If no gauge is detected and manual calibration datum is absent, real water level is set to `None` and the system outputs `CALIBRATION REQUIRED`.

---

## 6. Project Directory Structure

```
riverguard-ai/
├── backend/
│   ├── app.py                     # Flask application entry point & static routes
│   ├── config.py                  # Thresholds, status colors, and environment paths
│   ├── database.py                # SQLite schema, PBKDF2 hashing, historical seeds
│   ├── requirements.txt           # Python dependencies
│   ├── seed_samples.py            # Sample image generator & CV verification suite
│   ├── routes/
│   │   ├── auth_routes.py         # Login, register, logout, profile
│   │   ├── analysis_routes.py     # Image analysis pipeline & dashboard telemetry
│   │   ├── alert_routes.py        # Alerts retrieval, counts, and filters
│   │   ├── analytics_routes.py    # Chart.js time-series & risk distributions
│   │   └── prediction_routes.py   # Regression forecasting endpoint
│   ├── services/
│   │   ├── image_processing.py    # OpenCV multi-space segmentation & HUD generation
│   │   ├── water_level.py         # Gauge staff detection & scale conversion
│   │   ├── flood_detection.py     # Risk classification & threshold logic
│   │   ├── alert_service.py       # Alert logging & duplicate cooldown protection
│   │   ├── email_service.py       # Python smtplib notification dispatcher
│   │   ├── twilio_service.py      # Twilio Verify V2 SMS OTP dispatch & check
│   │   └── prediction_service.py  # Statistical regression model & data checks
│   ├── uploads/                   # Uploaded source river images
│   ├── processed/                 # Generated HUD annotated result images
│   └── database/
│       └── riverguard.db          # SQLite persistent database
├── frontend/
│   ├── index.html                 # Cinematic landing page with flowing river canvas
│   ├── login.html                 # Operator authentication
│   ├── register.html              # Operator enrollment
│   ├── dashboard.html             # Operations / River Monitoring Command Center
│   ├── upload.html                # Image analysis interface with quick samples
│   ├── analysis.html              # AI analysis complete & technical inspector
│   ├── alerts.html                # Flood Alert Center & email notification timeline
│   ├── analytics.html             # Environmental Analytics (Chart.js)
│   ├── prediction.html            # Water-level trajectory forecasting
│   ├── history.html               # Historical analyses table & search
│   ├── profile.html               # Configurable thresholds & station parameters
│   ├── css/
│   │   ├── style.css              # River Command Center theme & vertical gauge
│   │   └── responsive.css         # Breakpoints for mobile, tablet, and desktop
│   └── js/
│       ├── app.js                 # Global theme, sidebar, modal, and auth state
│       ├── dashboard.js           # Live gauge renderer, wave canvas, and telemetry
│       ├── upload.js              # Drag-and-drop, sample tester, and animation
│       ├── analysis.js            # HUD overlay renderer and tech modal
│       ├── alerts.js              # Alert center status cards and email cards
│       ├── analytics.js           # Chart.js configuration and telemetry curves
│       ├── prediction.js          # Empirical regression and insufficient-data guard
│       ├── history.js             # Audit table search and risk filtering
│       └── auth.js                # Profile settings and auth dispatchers
├── .env.example                   # Environment configuration template
├── .env                           # Local environment configuration
└── README.md                      # Comprehensive documentation
```

---

## 7. Installation & Setup Guide

### Prerequisites
- Python 3.10+ (Tested on Python 3.12.5)
- Standard web browser (Chrome, Edge, Firefox, Safari)

### Step 1: Install Python Dependencies
In your terminal, navigate to the project directory:
```bash
pip install -r backend/requirements.txt
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
*(Optional)* Configure your SMTP server credentials in `.env` if you wish to dispatch real emails for WARNING and EMERGENCY alerts:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your_email@gmail.com
SMTP_PASSWORD=your_app_password
ALERT_EMAIL_FROM=alerts@riverguard.ai
ALERT_EMAIL_TO=operations@riverguard.ai
```

### Step 3: Run the Flask Application
Start the backend server:
```bash
python -m backend.app
```
Output:
```
============================================================
 RIVERGUARD AI // WATER LEVEL MONITORING & FLOOD DETECTION 
 River Command Center listening at: http://127.0.0.1:5000
============================================================
```

### Step 4: Open in Web Browser
Open your browser and navigate to:
```
http://127.0.0.1:5000/
```
You can immediately access all views:
- **Landing Page**: `http://127.0.0.1:5000/`
- **Command Center**: `http://127.0.0.1:5000/dashboard.html`
- **Image Analysis**: `http://127.0.0.1:5000/upload.html`
- **Flood Alert Center**: `http://127.0.0.1:5000/alerts.html`
- **Analytics**: `http://127.0.0.1:5000/analytics.html`
- **Prediction**: `http://127.0.0.1:5000/prediction.html`
- **History**: `http://127.0.0.1:5000/history.html`
- **Sign In**: `http://127.0.0.1:5000/login.html` *(Default: `analyst@riverguard.ai` / `RiverGuard2026!`)*

---

## 8. REST API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/analyze-image` | `POST` | Ingests multipart image, validates, executes CV pipeline, creates alert, stores telemetry. |
| `/api/dashboard` | `GET` | Fetches Command Center operational metrics, latest analysis, gauge status, and system health. |
| `/api/alerts` | `GET` | Retrieves paginated alerts with optional `?level=SAFE\|WATCH\|WARNING\|EMERGENCY`. |
| `/api/alerts/recent` | `GET` | Returns 10 most recent alerts for the live notification timeline. |
| `/api/alerts/stats` | `GET` | Returns breakdown counts for Safe (Normal Water), Watch, Warning, Emergency. |
| `/api/analytics` | `GET` | Returns structured time-series and distributions for Chart.js. |
| `/api/prediction` | `GET` | Returns empirical statistical regression or reports data insufficiency. |
| `/api/analyses` | `GET` | Returns history audit log records with pagination and filters. |
| `/api/analyses/<id>` | `GET` | Fetches single analysis record with associated alert and email attempt log. |
| `/api/auth/login` | `POST` | Authenticates operator using email and PBKDF2 password verification. |
| `/api/auth/register` | `POST` | Enrolls new operator profile. |
| `/api/auth/logout` | `POST` | Clears current operator session. |
| `/api/auth/profile` | `GET/POST` | Retrieves or updates operator details and configurable risk thresholds. |

---

## 9. Verification & Testing

RiverGuard AI includes an automated synthetic test suite that generates and evaluates all five operational scenarios:
```bash
python -m backend.seed_samples
```
**Results Verified**:
1. **Sample 1 (SAFE)**: Water Level $= 1.71\text{ m} < 2.0\text{ m} \implies$ **SAFE (Normal Water `#16A34A` Green)**. Confidence: 98%.
2. **Sample 2 (WATCH)**: Water Level $= 2.49\text{ m} \in [2.0, 3.5\text{ m}) \implies$ **WATCH (`#FACC15` Yellow)**. Confidence: 97%.
3. **Sample 3 (WARNING)**: Water Level $= 3.78\text{ m} \in [3.5, 4.8\text{ m}) \implies$ **WARNING (`#F97316` Orange)**. Confidence: 90%.
4. **Sample 4 (EMERGENCY)**: Water Level $= 5.10\text{ m} \ge 4.8\text{ m} \implies$ **EMERGENCY / FLOOD (`#DC2626` Red)**. Confidence: 71%.
5. **Sample 5 (UNCALIBRATED)**: No gauge staff detected $\implies$ **CALIBRATION REQUIRED**. Water level remains strictly `None` to prevent fabrication.

---

## 10. Limitations

- **Extreme Weather Visibility**: Severe torrential fog or total nighttime camera blackout degrades edge extraction unless infrared or thermal camera feeds are equipped.
- **Dynamic Camera Pose / Vibration**: Camera roll or sudden tilt shifts alter pixel-to-meter conversion unless an automated fiducial homography calibration is recalculated.
- **Sediment Occlusion**: Completely muddy staff gauges with mud caked over metric numbers require periodic station wiper maintenance.

---

## 11. Future Scope

1. **Edge AI Live CCTV Streams**: Direct RTSP stream ingestion via GStreamer/FFmpeg with hardware-accelerated NVIDIA TensorRT inference.
2. **Deep-Learning Semantic Segmentation**: Integration of lightweight SegNet / Mask2Former models trained specifically on alluvial river boundaries.
3. **IoT Sensor Fusion**: Dual-validation combining image processing with radar / ultrasonic distance sensors over LoRaWAN.
4. **Meteorological Radar Integration**: Live coupling with Doppler precipitation radar and catchment rainfall forecasts.
5. **Multi-Station Geospatial Map**: GIS map view tracking multiple monitoring stations across an entire river catchment basin.
6. **SMS & Siren Broadcast**: Twilio / GSM gateway integration for automated siren activation and cellular broadcast alerts.
