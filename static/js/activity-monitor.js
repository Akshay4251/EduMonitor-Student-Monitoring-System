/**
 * activity-monitor.js — Client-side activity detection.
 * Tracks: tab visibility, mouse/keyboard idle, face presence (opt-in).
 * Sends pings to server every 10 seconds.
 */

const ActivityMonitor = (() => {
  let active = false;
  let pingInterval = null;
  let sessionId = null;

  // Tracking state
  let tabVisible = true;
  let lastMouseMove = Date.now();
  let lastKeyPress = Date.now();
  let isIdle = false;
  let facePresent = false;
  let faceDetectionActive = false;
  let faceDetectionInterval = null;

  const IDLE_THRESHOLD = 60000;   // 1 minute
  const PING_INTERVAL  = 10000;   // 10 seconds
  const FACE_INTERVAL  = 3000;    // check face every 3 seconds

  // ── Event Handlers ───────────────────────────────────────────
  function onVisibilityChange() {
    tabVisible = !document.hidden;
  }

  function onMouseMove() {
    lastMouseMove = Date.now();
    isIdle = false;
  }

  function onKeyPress() {
    lastKeyPress = Date.now();
    isIdle = false;
  }

  function checkIdle() {
    const now = Date.now();
    const timeSinceInput = Math.min(now - lastMouseMove, now - lastKeyPress);
    isIdle = timeSinceInput > IDLE_THRESHOLD;
  }

  // ── Face Detection (opt-in, uses face-api.js) ────────────────
  async function initFaceDetection() {
    try {
      if (!window.faceapi) {
        console.log('[ActivityMonitor] face-api.js not loaded, skipping face detection');
        return;
      }

      // Load the tiny face detector model from CDN
      const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);

      faceDetectionActive = true;
      console.log('[ActivityMonitor] Face detection initialized');

      faceDetectionInterval = setInterval(async () => {
        const video = document.getElementById('local-video');
        if (!video || video.paused || video.ended) {
          facePresent = false;
          return;
        }
        try {
          const detections = await faceapi.detectAllFaces(
            video, new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.4 })
          );
          facePresent = detections.length > 0;
        } catch {
          facePresent = false;
        }
      }, FACE_INTERVAL);
    } catch (err) {
      console.warn('[ActivityMonitor] Face detection init failed:', err.message);
    }
  }

  // ── Ping Server ──────────────────────────────────────────────
  function sendPing() {
    checkIdle();
    SocketClient.sendActivityPing({
      tabVisible,
      isIdle,
      facePresent,
      mouseActive: (Date.now() - lastMouseMove) < 5000,
      keyboardActive: (Date.now() - lastKeyPress) < 5000,
    });

    // Update local UI indicator
    updateLocalIndicator();
  }

  function updateLocalIndicator() {
    const tile = document.getElementById('local-video-tile');
    if (!tile) return;

    let indicators = tile.querySelector('.video-tile__indicators');
    if (!indicators) {
      indicators = document.createElement('div');
      indicators.className = 'video-tile__indicators';
      tile.appendChild(indicators);
    }

    indicators.innerHTML = `
      <div class="video-tile__indicator" title="Tab ${tabVisible ? 'visible' : 'hidden'}" 
           style="color:${tabVisible ? 'var(--color-success)' : 'var(--color-danger)'}">
        <i class="fas fa-eye${tabVisible ? '' : '-slash'}"></i>
      </div>
      ${isIdle ? '<div class="video-tile__indicator" title="Idle" style="color:var(--color-warning)"><i class="fas fa-moon"></i></div>' : ''}
      ${faceDetectionActive ? `
        <div class="video-tile__indicator" title="Face ${facePresent ? 'detected' : 'not detected'}"
             style="color:${facePresent ? 'var(--color-success)' : 'var(--color-danger)'}">
          <i class="fas fa-${facePresent ? 'smile' : 'meh'}"></i>
        </div>` : ''}
    `;
  }

  // ── Start / Stop ─────────────────────────────────────────────
  function start(sid) {
    if (active) stop();
    sessionId = sid;
    active = true;

    // Register event listeners
    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('keydown', onKeyPress);
    document.addEventListener('click', onMouseMove);
    document.addEventListener('scroll', onMouseMove);

    // Start ping interval
    pingInterval = setInterval(sendPing, PING_INTERVAL);

    // Init face detection (async, non-blocking)
    initFaceDetection();

    console.log('[ActivityMonitor] Started for session:', sid);
  }

  function stop() {
    active = false;
    sessionId = null;

    document.removeEventListener('visibilitychange', onVisibilityChange);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('keydown', onKeyPress);
    document.removeEventListener('click', onMouseMove);
    document.removeEventListener('scroll', onMouseMove);

    if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
    if (faceDetectionInterval) { clearInterval(faceDetectionInterval); faceDetectionInterval = null; }
    faceDetectionActive = false;

    console.log('[ActivityMonitor] Stopped');
  }

  return { start, stop };
})();
