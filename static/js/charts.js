/**
 * charts.js — High-performance, luxury Chart.js visualizations.
 * Features safe instance tracking (zero-glitch re-renders),
 * radiant gradients, customized tooltip glass styling, and smooth animations.
 */

const Charts = (() => {
  function applyDefaults() {
    if (!window.Chart) return;
    const isDark = document.documentElement.classList.contains('dark');
    Chart.defaults.color = isDark ? '#94a3b8' : '#475569';
    Chart.defaults.borderColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)';
    Chart.defaults.font.family = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    Chart.defaults.font.size = 12;

    // Custom Glass Tooltip styling
    Chart.defaults.plugins.tooltip = {
      ...Chart.defaults.plugins.tooltip,
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      titleColor: '#ffffff',
      bodyColor: '#cbd5e1',
      borderColor: 'rgba(255, 255, 255, 0.15)',
      borderWidth: 1,
      padding: 12,
      cornerRadius: 8,
      boxPadding: 6,
      usePointStyle: true,
      titleFont: { weight: '600', size: 13 },
      bodyFont: { size: 12 },
      displayColors: true,
      backdropFilter: 'blur(12px)',
    };
  }

  function destroyChart(canvas) {
    if (!canvas || !window.Chart) return;
    const existing = Chart.getChart(canvas);
    if (existing) {
      try { existing.destroy(); } catch (e) { console.warn('Chart destroy error:', e); }
    }
  }

  function getThemeColors() {
    try {
      const style = getComputedStyle(document.documentElement);
      const primary = style.getPropertyValue('--color-primary').trim() || '#06858e';
      const primaryHi = style.getPropertyValue('--color-primary-hi').trim() || '#0891b2';
      const primaryRgb = style.getPropertyValue('--color-primary-rgb').trim() || '6, 133, 142';
      const secondary = style.getPropertyValue('--color-secondary').trim() || '#0284c7';
      const secondaryRgb = style.getPropertyValue('--color-secondary-rgb').trim() || '2, 132, 199';
      const success = style.getPropertyValue('--color-success').trim() || '#10b981';
      const warning = style.getPropertyValue('--color-warning').trim() || '#f59e0b';
      const danger = style.getPropertyValue('--color-danger').trim() || '#ef4444';
      const chart1 = style.getPropertyValue('--chart-1').trim() || '#06858e';
      const chart2 = style.getPropertyValue('--chart-2').trim() || '#0284c7';
      const chart3 = style.getPropertyValue('--chart-3').trim() || '#0d9488';
      const chart4 = style.getPropertyValue('--chart-4').trim() || '#6366f1';
      const chart5 = style.getPropertyValue('--chart-5').trim() || '#8ad8dd';
      return { primary, primaryHi, primaryRgb, secondary, secondaryRgb, success, warning, danger, chart1, chart2, chart3, chart4, chart5 };
    } catch {
      return {
        primary: '#06858e',
        primaryHi: '#0891b2',
        primaryRgb: '6, 133, 142',
        secondary: '#0284c7',
        secondaryRgb: '2, 132, 199',
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
        chart1: '#06858e',
        chart2: '#0284c7',
        chart3: '#0d9488',
        chart4: '#6366f1',
        chart5: '#8ad8dd',
      };
    }
  }

  const PALETTE = {
    get primary()   { return getThemeColors().primary; },
    get secondary() { return getThemeColors().secondary; },
    get chart1()    { return getThemeColors().chart1; },
    get chart2()    { return getThemeColors().chart2; },
    get chart3()    { return getThemeColors().chart3; },
    get chart4()    { return getThemeColors().chart4; },
    get chart5()    { return getThemeColors().chart5; },
    cyan:       '#4de8e8',
    emerald:    '#36a5a5',
    amber:      '#37b6be',
    rose:       '#e83c3c',
    slate:      '#164955',
  };

  /**
   * Helper to create vertical linear gradients
   */
  function makeGradient(ctx, topColor, bottomColor, height = 300) {
    try {
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, topColor);
      gradient.addColorStop(1, bottomColor);
      return gradient;
    } catch {
      return topColor;
    }
  }

  /**
   * Engagement history line chart (student profile).
   */
  function engagementHistory(canvasId, history) {
    applyDefaults();
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart) return;
    destroyChart(canvas);

    const colors = getThemeColors();
    const ctx = canvas.getContext('2d');
    const validHistory = (history || []).slice().reverse();

    const labels = validHistory.map(h => (h.date ? h.date.slice(0, 10) : 'Session'));
    const scores = validHistory.map(h => h.score || 0);
    const attendance = validHistory.map(h => h.attendance || 0);
    const focus = validHistory.map(h => h.focus || 0);

    const primaryGrad = makeGradient(ctx, `rgba(${colors.primaryRgb}, 0.45)`, `rgba(${colors.primaryRgb}, 0.01)`, 240);

    return new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels.length ? labels : ['No Data'],
        datasets: [
          {
            label: 'Overall Engagement',
            data: scores,
            borderColor: colors.primary,
            borderWidth: 3,
            backgroundColor: primaryGrad,
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointHoverRadius: 7,
            pointBackgroundColor: colors.primary,
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
          },
          {
            label: 'Attendance %',
            data: attendance,
            borderColor: '#10b981',
            borderWidth: 2,
            borderDash: [5, 4],
            fill: false,
            tension: 0.4,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointBackgroundColor: '#10b981',
          },
          {
            label: 'Focus %',
            data: focus,
            borderColor: '#f59e0b',
            borderWidth: 2,
            borderDash: [3, 3],
            fill: false,
            tension: 0.4,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointBackgroundColor: '#f59e0b',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
            labels: { usePointStyle: true, padding: 16, boxWidth: 8, font: { weight: '600' } }
          },
        },
        scales: {
          y: {
            min: 0,
            max: 100,
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: { callback: v => `${v}%` }
          },
          x: {
            grid: { display: false }
          },
        },
      },
    });
  }

  /**
   * Class report bar/combo chart (Sessions over time).
   */
  function classReport(canvasId, summary) {
    applyDefaults();
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart) return;
    destroyChart(canvas);

    const ctx = canvas.getContext('2d');
    const validSummary = (summary || []).slice().reverse();

    if (validSummary.length === 0) {
      validSummary.push({ title: 'Sample Session', avgScore: 0, studentCount: 0 });
    }

    const labels = validSummary.map(s => {
      const name = s.title || s.sessionId || 'Session';
      return name.length > 22 ? name.slice(0, 20) + '…' : name;
    });
    const avgScores = validSummary.map(s => s.avgScore || 0);
    const studentCounts = validSummary.map(s => s.studentCount || 0);

    const colors = getThemeColors();
    const barGrad = makeGradient(ctx, `rgba(${colors.primaryRgb}, 0.95)`, `rgba(${colors.secondaryRgb}, 0.75)`, 250);

    return new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            type: 'bar',
            label: 'Avg Engagement Score',
            data: avgScores,
            backgroundColor: barGrad,
            hoverBackgroundColor: colors.primaryHi,
            borderRadius: 8,
            borderSkipped: false,
            barPercentage: 0.5,
            maxBarThickness: 42,
            order: 2,
          },
          {
            type: 'line',
            label: 'Students Active',
            data: studentCounts,
            borderColor: '#06b6d4',
            borderWidth: 2.5,
            backgroundColor: 'rgba(6, 182, 212, 0.1)',
            pointBackgroundColor: '#06b6d4',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointRadius: 5,
            pointHoverRadius: 7,
            tension: 0.35,
            yAxisID: 'y1',
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
            labels: { usePointStyle: true, padding: 18, font: { weight: '600' } }
          },
        },
        scales: {
          y: {
            min: 0,
            max: 100,
            position: 'left',
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { callback: v => `${v}%` },
            title: { display: true, text: 'Engagement Score', color: '#64748b', font: { size: 11, weight: '500' } },
          },
          y1: {
            min: 0,
            position: 'right',
            grid: { display: false },
            ticks: { precision: 0 },
            title: { display: true, text: 'Students', color: '#06b6d4', font: { size: 11, weight: '500' } },
          },
          x: {
            grid: { display: false },
            ticks: { maxRotation: 25, font: { size: 11 } }
          },
        },
      },
    });
  }

  /**
   * Score distribution doughnut chart.
   */
  function scoreDistribution(canvasId, students) {
    applyDefaults();
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart) return;
    destroyChart(canvas);

    const ctx = canvas.getContext('2d');
    const studentList = students || [];

    let high = 0, mid = 0, low = 0;
    studentList.forEach(s => {
      const sc = Number(s.score) || 0;
      if (sc >= 70) high++;
      else if (sc >= 40) mid++;
      else low++;
    });

    if (high === 0 && mid === 0 && low === 0) {
      high = 1; // gentle default preview
    }

    return new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['High (≥70%)', 'Moderate (40–69%)', 'Needs Attention (<40%)'],
        datasets: [{
          data: [high, mid, low],
          backgroundColor: ['#10b981', '#f59e0b', '#f43f5e'],
          borderColor: '#0f172a',
          borderWidth: 3,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { usePointStyle: true, padding: 14, font: { size: 11 } }
          },
        },
      },
    });
  }

  /**
   * Multi-competency radar breakdown.
   */
  function breakdown(canvasId, students) {
    applyDefaults();
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart) return;
    destroyChart(canvas);

    const ctx = canvas.getContext('2d');
    const list = students || [];
    const n = list.length || 1;

    const avgAttendance    = Math.round(list.reduce((acc, s) => acc + (Number(s.attendance) || 0), 0) / n);
    const avgFocus         = Math.round(list.reduce((acc, s) => acc + (Number(s.focus) || 0), 0) / n);
    const avgParticipation = Math.round(list.reduce((acc, s) => acc + (Number(s.participation) || 0), 0) / n);
    const avgFace          = Math.round(list.reduce((acc, s) => acc + (Number(s.facePresence) || 0), 0) / n);

    const colors = getThemeColors();

    return new Chart(ctx, {
      type: 'radar',
      data: {
        labels: ['Attendance', 'Focus & Presence', 'Active Participation', 'Face Attention'],
        datasets: [{
          label: 'Class Average',
          data: [avgAttendance, avgFocus, avgParticipation, avgFace],
          borderColor: colors.primary,
          borderWidth: 2.5,
          backgroundColor: `rgba(${colors.primaryRgb}, 0.22)`,
          pointBackgroundColor: colors.primaryHi,
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            min: 0,
            max: 100,
            ticks: { display: false, stepSize: 25 },
            grid: { color: 'rgba(255, 255, 255, 0.08)' },
            angleLines: { color: 'rgba(255, 255, 255, 0.08)' },
            pointLabels: {
              color: '#cbd5e1',
              font: { size: 11, weight: '600' }
            },
          },
        },
        plugins: {
          legend: {
            position: 'top',
            labels: { usePointStyle: true, padding: 12, font: { weight: '600' } }
          },
        },
      },
    });
  }

  function updateTheme() {
    applyDefaults();
  }

  return { engagementHistory, classReport, scoreDistribution, breakdown, destroyChart, updateTheme, getThemeColors };
})();
