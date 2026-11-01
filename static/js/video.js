/**
 * video.js — WebRTC peer-mesh video manager.
 * Handles local media, peer connections, and video grid rendering.
 */

const VideoManager = (() => {
  let localStream = null;
  let screenStream = null;
  let sessionId = null;
  let micEnabled = true;
  let camEnabled = true;
  const peers = {};     // { uid: RTCPeerConnection }
  const streams = {};   // { uid: MediaStream }

  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  // ── Initialize ───────────────────────────────────────────────
  async function init(sid) {
    sessionId = sid;
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 360, facingMode: 'user' },
        audio: true,
      });
      const localVideo = document.getElementById('local-video');
      if (localVideo) {
        localVideo.srcObject = localStream;
      }
    } catch (err) {
      console.warn('[Video] Could not get user media:', err.message);
      showToast('Camera/microphone access denied. You can still participate via chat.', 'warning', 5000);
    }
  }

  // ── Create Peer Connection ───────────────────────────────────
  function createPeer(remoteUid, initiator = false) {
    if (peers[remoteUid]) return peers[remoteUid];

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peers[remoteUid] = pc;

    // Add local tracks
    if (localStream) {
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    // ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        SocketClient.sendIceCandidate(remoteUid, event.candidate);
      }
    };

    // Remote stream
    pc.ontrack = (event) => {
      streams[remoteUid] = event.streams[0];
      renderRemoteVideo(remoteUid, event.streams[0]);
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        removeRemoteVideo(remoteUid);
        pc.close();
        delete peers[remoteUid];
        delete streams[remoteUid];
      }
    };

    // If initiator, create offer
    if (initiator) {
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => SocketClient.sendOffer(remoteUid, pc.localDescription));
    }

    return pc;
  }

  // ── Handle Signalling ────────────────────────────────────────
  async function handleOffer(data) {
    const pc = createPeer(data.from, false);
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    SocketClient.sendAnswer(data.from, pc.localDescription);
  }

  async function handleAnswer(data) {
    const pc = peers[data.from];
    if (pc) await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
  }

  async function handleIceCandidate(data) {
    const pc = peers[data.from];
    if (pc && data.candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (e) {
        console.warn('[Video] ICE candidate error:', e);
      }
    }
  }

  // ── Render Remote Video ──────────────────────────────────────
  function renderRemoteVideo(uid, stream) {
    const grid = document.getElementById('video-grid');
    if (!grid) return;

    let tile = document.getElementById(`video-tile-${uid}`);
    if (!tile) {
      tile = document.createElement('div');
      tile.id = `video-tile-${uid}`;
      tile.className = 'video-tile';
      tile.innerHTML = `
        <video autoplay playsinline></video>
        <div class="video-tile__label"><i class="fas fa-user"></i> Peer</div>
        <div class="video-tile__indicators"></div>`;
      grid.appendChild(tile);
    }

    const video = tile.querySelector('video');
    if (video) video.srcObject = stream;
  }

  function removeRemoteVideo(uid) {
    const tile = document.getElementById(`video-tile-${uid}`);
    if (tile) tile.remove();
  }

  function removePeer(uid) {
    if (peers[uid]) {
      try { peers[uid].close(); } catch {}
      delete peers[uid];
    }
    if (streams[uid]) {
      delete streams[uid];
    }
    removeRemoteVideo(uid);
  }

  // ── Media Controls ───────────────────────────────────────────
  function toggleMic() {
    if (!localStream) return;
    micEnabled = !micEnabled;
    localStream.getAudioTracks().forEach(t => { t.enabled = micEnabled; });
    const btn = document.getElementById('btn-mic');
    if (btn) {
      btn.classList.toggle('active', micEnabled);
      btn.innerHTML = `<i class="fas fa-microphone${micEnabled ? '' : '-slash'}"></i>`;
    }
  }

  function toggleCam() {
    if (!localStream) return;
    camEnabled = !camEnabled;
    localStream.getVideoTracks().forEach(t => { t.enabled = camEnabled; });
    const btn = document.getElementById('btn-cam');
    if (btn) {
      btn.classList.toggle('active', camEnabled);
      btn.innerHTML = `<i class="fas fa-video${camEnabled ? '' : '-slash'}"></i>`;
    }
  }

  async function shareScreen() {
    try {
      if (screenStream) {
        // Stop screen sharing
        screenStream.getTracks().forEach(t => t.stop());
        screenStream = null;
        // Replace tracks back to camera
        if (localStream) {
          const videoTrack = localStream.getVideoTracks()[0];
          Object.values(peers).forEach(pc => {
            const sender = pc.getSenders().find(s => s.track?.kind === 'video');
            if (sender && videoTrack) sender.replaceTrack(videoTrack);
          });
        }
        document.getElementById('btn-screen')?.classList.remove('active');
        const localVideo = document.getElementById('local-video');
        if (localVideo) localVideo.srcObject = localStream;
        return;
      }

      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];

      // Replace video track in all peer connections
      Object.values(peers).forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(screenTrack);
      });

      // Show screen in local preview
      const localVideo = document.getElementById('local-video');
      if (localVideo) localVideo.srcObject = screenStream;

      document.getElementById('btn-screen')?.classList.add('active');

      // When user stops sharing via browser UI
      screenTrack.onended = () => shareScreen();
    } catch (err) {
      console.warn('[Video] Screen share error:', err.message);
    }
  }

  // ── Cleanup ──────────────────────────────────────────────────
  function stop() {
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }
    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
      screenStream = null;
    }
    Object.values(peers).forEach(pc => pc.close());
    Object.keys(peers).forEach(k => delete peers[k]);
    Object.keys(streams).forEach(k => delete streams[k]);
  }

  return {
    init, stop,
    toggleMic, toggleCam, shareScreen,
    handleOffer, handleAnswer, handleIceCandidate,
    createPeer, removePeer,
  };
})();
