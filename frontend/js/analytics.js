/**
 * RIVERGUARD AI — ENVIRONMENTAL ANALYTICS CONTROLLER
 * Integrates Chart.js with real stored telemetry data.
 * Adheres strictly to Rule 26: Never displays fake randomized data.
 */

let charts = {};

document.addEventListener('DOMContentLoaded', () => {
  loadAnalyticsData();
});

async function loadAnalyticsData() {
  const container = document.getElementById('analyticsChartsGrid');
  const emptyNotice = document.getElementById('analyticsEmptyNotice');

  try {
    const res = await fetch(`${API_BASE}/api/analytics`);
    const data = await res.json();

    if (!data.success || !data.sufficient_data) {
      if (container) container.style.display = 'none';
      if (emptyNotice) {
        emptyNotice.style.display = 'block';
        emptyNotice.innerHTML = `
          <div class="glass-panel" style="padding:48px 24px; text-align:center; max-width:600px; margin:40px auto;">
            <i class="fas fa-chart-line" style="font-size:42px; color:var(--cyan-primary); opacity:0.5; margin-bottom:16px;"></i>
            <h3 style="font-size:20px; font-weight:700; color:var(--text-main); margin-bottom:8px;">Not enough historical data available.</h3>
            <p style="color:var(--text-muted); font-size:14px; line-height:1.5;">
              At least 3 valid calibrated observations must be recorded in the system database before analytical trend curves can be drawn.
            </p>
            <p style="margin-top:20px;">
              <a href="upload.html" class="btn-command"><i class="fas fa-plus-circle"></i> Ingest River Observations</a>
            </p>
          </div>
        `;
      }
      return;
    }

    if (container) container.style.display = 'grid';
    if (emptyNotice) emptyNotice.style.display = 'none';

    renderCharts(data);

  } catch (err) {
    console.error('Error fetching analytics:', err);
  }
}

function renderCharts(data) {
  // Chart.js global dark theme defaults
  Chart.defaults.color = '#94A3B8';
  Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.08)';
  Chart.defaults.font.family = "'Inter', sans-serif";

  // 1. Water Level vs Time (Line Chart)
  const timeLabels = data.time_series.map(d => d.created_at.split(' ')[0] + ' ' + d.created_at.split(' ')[1].substring(0, 5));
  const waterLevels = data.time_series.map(d => d.water_level);

  const ctxTime = document.getElementById('chartWaterLevelTime')?.getContext('2d');
  if (ctxTime) {
    if (charts.time) charts.time.destroy();
    charts.time = new Chart(ctxTime, {
      type: 'line',
      data: {
        labels: timeLabels,
        datasets: [{
          label: 'Water Level (m)',
          data: waterLevels,
          borderColor: '#00B4D8',
          backgroundColor: 'rgba(0, 180, 216, 0.12)',
          fill: true,
          tension: 0.35,
          pointBackgroundColor: '#00B4D8',
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            title: { display: true, text: 'Meters (m)' },
            suggestedMin: 1.0,
            suggestedMax: 5.5
          },
          x: {
            ticks: { maxTicksLimit: 8 }
          }
        }
      }
    });
  }

  // 2. Risk Distribution (Doughnut Chart)
  const riskLabels = ['SAFE (NORMAL)', 'WATCH', 'WARNING', 'EMERGENCY'];
  const riskData = [
    data.risk_distribution.SAFE || 0,
    data.risk_distribution.WATCH || 0,
    data.risk_distribution.WARNING || 0,
    data.risk_distribution.EMERGENCY || 0
  ];

  const ctxRisk = document.getElementById('chartRiskDist')?.getContext('2d');
  if (ctxRisk) {
    if (charts.risk) charts.risk.destroy();
    charts.risk = new Chart(ctxRisk, {
      type: 'doughnut',
      data: {
        labels: riskLabels,
        datasets: [{
          data: riskData,
          backgroundColor: ['#16A34A', '#FACC15', '#F97316', '#DC2626'],
          borderColor: '#0B1726',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, padding: 14 } }
        },
        cutout: '68%'
      }
    });
  }

  // 3. Alert Frequency by Category (Bar Chart)
  const ctxAlert = document.getElementById('chartAlertFreq')?.getContext('2d');
  if (ctxAlert) {
    if (charts.alert) charts.alert.destroy();
    charts.alert = new Chart(ctxAlert, {
      type: 'bar',
      data: {
        labels: ['Normal Water', 'Watch', 'Warning', 'Emergency'],
        datasets: [{
          label: 'Alert Count',
          data: [
            data.alert_frequency.SAFE || 0,
            data.alert_frequency.WATCH || 0,
            data.alert_frequency.WARNING || 0,
            data.alert_frequency.EMERGENCY || 0
          ],
          backgroundColor: ['#16A34A', '#FACC15', '#F97316', '#DC2626'],
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 } }
        }
      }
    });
  }

  // 4. Daily Water Level Trends (Bar Chart with daily averages)
  const ctxDaily = document.getElementById('chartDailyTrends')?.getContext('2d');
  if (ctxDaily) {
    const dailyDays = data.daily_trends.map(d => d.day);
    const dailyAvg = data.daily_trends.map(d => d.avg_level);

    if (charts.daily) charts.daily.destroy();
    charts.daily = new Chart(ctxDaily, {
      type: 'bar',
      data: {
        labels: dailyDays,
        datasets: [{
          label: 'Daily Average Level (m)',
          data: dailyAvg,
          backgroundColor: 'rgba(0, 180, 216, 0.45)',
          borderColor: '#00B4D8',
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: 'Average (m)' } }
        }
      }
    });
  }
}
