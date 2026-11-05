/**
 * socket-client.js — Socket.IO client wrapper for live sessions.
 * Handles chat, hand-raise, polls, quizzes, activity pings, and WebRTC signalling.
 */

const SocketClient = (() => {
  let socket = null;
  let currentSessionId = null;

  function connect(sessionId) {
    if (socket && socket.connected) disconnect();

    currentSessionId = sessionId;
    const socketUrl = (window.location.protocol === 'file:' || (window.location.port && window.location.port !== '5000'))
      ? 'http://127.0.0.1:5000'
      : undefined;
    socket = io(socketUrl, { transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket.id);
      socket.emit('join_session', {
        sessionId,
        uid:  App.user.uid,
        name: App.profile?.displayName || App.user.email,
        role: App.profile?.role || 'student',
      });
    });

    socket.on('disconnect', () => console.log('[Socket] Disconnected'));

    // ── Chat ───────────────────────────────────────────────────
    socket.on('new_chat_message', (msg) => {
      const container = document.getElementById('chat-messages');
      if (!container) return;
      const initials = (msg.name || '?')[0].toUpperCase();
      const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const isSelf = msg.uid === App.user?.uid;

      container.insertAdjacentHTML('beforeend', `
        <div class="chat-msg">
          <div class="chat-msg__avatar" style="${isSelf ? 'background:var(--gradient-primary)' : ''}">${initials}</div>
          <div class="chat-msg__body">
            <div class="chat-msg__name">${isSelf ? 'You' : msg.name}</div>
            <div class="chat-msg__text">${escapeHTML(msg.message)}</div>
            <div class="chat-msg__time">${time}</div>
          </div>
        </div>`);
      container.scrollTop = container.scrollHeight;
    });

    // ── Participants ───────────────────────────────────────────
    socket.on('participant_update', (data) => {
      window.lastParticipants = data.participants || [];
      updateParticipantsList(data.participants);
      if (data.joined && data.joined.uid !== App.user?.uid) {
        showToast(`${data.joined.name} joined`, 'info', 2000);
        // Connect WebRTC peer to newcomer
        if (typeof VideoManager !== 'undefined' && VideoManager.createPeer) {
          VideoManager.createPeer(data.joined.uid, true);
        }
      }
      if (data.left && data.left.uid !== App.user?.uid) {
        if (typeof VideoManager !== 'undefined' && VideoManager.removePeer) {
          VideoManager.removePeer(data.left.uid);
        }
      }
    });

    // ── Hand Raise ─────────────────────────────────────────────
    socket.on('hand_raised', (data) => {
      window.currentRaisedHands = new Set(data.allRaised || []);
      if (window.lastParticipants) {
        updateParticipantsList(window.lastParticipants, window.currentRaisedHands);
      }
      // Update video tile indicator
      const tile = document.getElementById(data.uid === App.user?.uid ? 'local-video-tile' : `video-tile-${data.uid}`);
      if (tile) {
        let handBadge = tile.querySelector('.hand-badge');
        if (data.raised) {
          if (!handBadge) {
            handBadge = document.createElement('div');
            handBadge.className = 'hand-badge';
            handBadge.style.cssText = 'position:absolute; top:8px; right:8px; background:var(--color-warning); color:#000; padding:2px 8px; border-radius:12px; font-weight:700; font-size:12px; z-index:10; box-shadow:0 2px 6px rgba(0,0,0,0.3);';
            handBadge.innerHTML = '✋ Hand Raised';
            tile.appendChild(handBadge);
          }
        } else if (handBadge) {
          handBadge.remove();
        }
      }

      if (data.uid !== App.user?.uid && data.raised) {
        showToast(`✋ ${data.name} raised hand`, 'warning', 3000);
      }
    });

    // ── Session Lifecycle ──────────────────────────────────────
    socket.on('session_started', (data) => {
      showToast('Live session broadcasting has started!', 'success');
      window.dispatchEvent(new CustomEvent('session-broadcast-started', { detail: data }));
      const standbyBanner = document.querySelector('.standby-banner');
      if (standbyBanner) standbyBanner.remove();
      const statusBadge = document.querySelector('.chat-panel__header .badge');
      if (statusBadge) {
        statusBadge.className = 'badge badge--live';
        statusBadge.innerHTML = '<span class="badge-dot badge-dot--live"></span> LIVE';
      }
    });

    socket.on('session_ended', (data) => {
      showToast('Session has concluded.', 'info');
    });

    // ── Polls ──────────────────────────────────────────────────
    socket.on('new_poll', (poll) => {
      renderPollForStudent(poll);
    });

    socket.on('poll_update', (poll) => {
      renderPollResults(poll);
    });

    socket.on('poll_ended', (poll) => {
      renderPollResults(poll, true);
    });

    // ── Quizzes ────────────────────────────────────────────────
    socket.on('new_quiz', (quiz) => {
      renderQuizForStudent(quiz);
    });

    // ── Activity Alerts (teacher only) ─────────────────────────
    socket.on('activity_alert', (data) => {
      renderActivityAlert(data);
    });

    // ── Live activity grid (teacher) ───────────────────────────
    socket.on('live_activity', (data) => {
      if (typeof updateMonitorGrid === 'function') updateMonitorGrid(data);
    });

    // ── WebRTC Signalling ──────────────────────────────────────
    socket.on('webrtc_offer', (data) => VideoManager.handleOffer(data));
    socket.on('webrtc_answer', (data) => VideoManager.handleAnswer(data));
    socket.on('webrtc_ice', (data) => VideoManager.handleIceCandidate(data));
  }

  function disconnect() {
    if (socket) {
      socket.emit('leave_session', { sessionId: currentSessionId, uid: App.user?.uid });
      socket.disconnect();
      socket = null;
    }
    currentSessionId = null;
  }

  function sendChat(message) {
    socket?.emit('chat_message', {
      sessionId: currentSessionId,
      uid:  App.user.uid,
      name: App.profile?.displayName || App.user.email,
      message,
    });
  }

  function sendHandRaise(raised) {
    socket?.emit('hand_raise', {
      sessionId: currentSessionId,
      uid:  App.user.uid,
      name: App.profile?.displayName || '',
      raised,
    });
  }

  function sendActivityPing(activityData) {
    socket?.emit('activity_ping', {
      sessionId: currentSessionId,
      uid: App.user.uid,
      ...activityData,
    });
  }

  function sendPollResponse(pollId, optionIndex) {
    socket?.emit('poll_response', {
      sessionId: currentSessionId,
      uid: App.user.uid,
      pollId,
      optionIndex,
    });
  }

  function sendQuizResponse(quizId, answers) {
    socket?.emit('quiz_response', {
      sessionId: currentSessionId,
      uid: App.user.uid,
      quizId,
      answers,
    });
  }

  function broadcastPoll(poll) {
    socket?.emit('broadcast_poll', { sessionId: currentSessionId, poll });
  }

  function broadcastQuiz(quiz) {
    socket?.emit('broadcast_quiz', { sessionId: currentSessionId, quiz });
  }

  function endPoll(pollId) {
    socket?.emit('end_poll', { sessionId: currentSessionId, pollId });
  }

  function leaveSession() {
    disconnect();
  }

  // WebRTC signalling helpers
  function sendOffer(toUid, offer) {
    socket?.emit('webrtc_offer', { sessionId: currentSessionId, from: App.user.uid, to: toUid, offer });
  }
  function sendAnswer(toUid, answer) {
    socket?.emit('webrtc_answer', { sessionId: currentSessionId, from: App.user.uid, to: toUid, answer });
  }
  function sendIceCandidate(toUid, candidate) {
    socket?.emit('webrtc_ice', { sessionId: currentSessionId, from: App.user.uid, to: toUid, candidate });
  }

  return {
    connect, disconnect, sendChat, sendHandRaise, sendActivityPing,
    sendPollResponse, sendQuizResponse, broadcastPoll, broadcastQuiz, endPoll,
    leaveSession, sendOffer, sendAnswer, sendIceCandidate,
  };
})();


/* ══════════════════════════════════════════════════════════════════
   UI HELPERS (used by socket callbacks)
   ══════════════════════════════════════════════════════════════════ */
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function updateParticipantsList(participants, raisedSet = null) {
  const container = document.getElementById('participants-list');
  if (!container) return;
  const raised = raisedSet || window.currentRaisedHands || new Set();
  container.innerHTML = participants.map(p => {
    const isHandRaised = raised.has(p.uid);
    return `
    <div class="d-flex align-center gap-sm" style="padding:var(--space-sm) 0" id="participant-row-${p.uid}">
      <div class="chat-msg__avatar" style="width:24px;height:24px;font-size:10px">${(p.name||'?')[0].toUpperCase()}</div>
      <span class="text-sm">${escapeHTML(p.name)}</span>
      ${isHandRaised ? '<span class="badge badge--warning text-xs" style="margin-left:auto"><i class="fas fa-hand-paper"></i> Raised</span>' : ''}
      <span class="badge badge--${p.role === 'teacher' ? 'primary' : 'info'} text-xs" style="${isHandRaised ? '' : 'margin-left:auto'}">${p.role}</span>
    </div>`;
  }).join('');
}

function renderPollForStudent(poll) {
  // Show poll as an overlay / inline in chat
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const pollHTML = `
    <div class="poll-container" id="poll-${poll.id}">
      <div class="poll-question"><i class="fas fa-poll"></i> ${escapeHTML(poll.question)}</div>
      ${poll.options.map((opt, i) => `
        <div class="poll-option" onclick="submitPollResponse('${poll.id}', ${i}, this)">
          <div class="poll-option__radio"></div>
          <div class="poll-option__text">${escapeHTML(opt)}</div>
        </div>`).join('')}
    </div>`;
  container.insertAdjacentHTML('beforeend', pollHTML);
  container.scrollTop = container.scrollHeight;
}

function submitPollResponse(pollId, optionIndex, el) {
  // Mark selection
  const parent = el.closest('.poll-container');
  parent.querySelectorAll('.poll-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');

  SocketClient.sendPollResponse(pollId, optionIndex);
  showToast('Response submitted!', 'success', 2000);
}

function renderPollResults(poll, ended = false) {
  const container = document.getElementById(`poll-${poll.id}`) ||
                    document.getElementById('polls-panel');
  if (!container) return;

  const responses = poll.responses || {};
  const total = Object.keys(responses).length || 1;
  const counts = {};
  Object.values(responses).forEach(idx => { counts[idx] = (counts[idx] || 0) + 1; });

  container.innerHTML = `
    <div class="poll-question"><i class="fas fa-poll"></i> ${escapeHTML(poll.question)} ${ended ? '<span class="badge badge--ended">Ended</span>' : ''}</div>
    ${poll.options.map((opt, i) => {
      const count = counts[i] || 0;
      const pct = Math.round((count / total) * 100);
      return `
        <div class="poll-option">
          <div class="poll-option__text">${escapeHTML(opt)}</div>
          <div class="poll-option__pct">${pct}%</div>
        </div>
        <div class="progress mb-sm"><div class="progress__bar" style="width:${pct}%"></div></div>`;
    }).join('')}
    <div class="text-xs text-muted mt-md">${Object.keys(responses).length} response(s)</div>
    ${!ended && App.profile?.role === 'teacher' ? `<button class="btn btn-ghost btn-sm mt-md" onclick="SocketClient.endPoll('${poll.id}')">End Poll</button>` : ''}
  `;
}

function renderQuizForStudent(quiz) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  let html = `<div class="poll-container" id="quiz-${quiz.id}">
    <div class="poll-question"><i class="fas fa-question-circle"></i> ${escapeHTML(quiz.title)}</div>`;

  quiz.questions.forEach((q, qi) => {
    html += `<div class="mb-md">
      <div class="text-sm fw-600 mb-sm">${qi + 1}. ${escapeHTML(q.question)}</div>
      ${q.options.map((opt, oi) => `
        <div class="poll-option" onclick="this.classList.toggle('selected')" data-qi="${qi}" data-oi="${oi}">
          <div class="poll-option__radio"></div>
          <div class="poll-option__text">${escapeHTML(opt)}</div>
        </div>`).join('')}
    </div>`;
  });

  html += `<button class="btn btn-primary btn-sm" onclick="submitQuiz('${quiz.id}')">Submit Quiz</button></div>`;
  container.insertAdjacentHTML('beforeend', html);
  container.scrollTop = container.scrollHeight;
}

function submitQuiz(quizId) {
  const container = document.getElementById(`quiz-${quizId}`);
  if (!container) return;

  const answers = {};
  container.querySelectorAll('.poll-option.selected').forEach(el => {
    answers[el.dataset.qi] = parseInt(el.dataset.oi);
  });

  SocketClient.sendQuizResponse(quizId, answers);
  showToast('Quiz submitted!', 'success');
  container.innerHTML = '<div class="text-center text-muted"><i class="fas fa-check-circle text-success"></i> Quiz submitted</div>';
}

function renderActivityAlert(data) {
  const container = document.getElementById('alert-container');
  if (!container) return;

  const alertHTML = `
    <div class="alert-banner">
      <div class="alert-banner__icon"><i class="fas fa-exclamation-triangle"></i></div>
      <div class="alert-banner__text">
        <strong>⚠️ ${data.message}</strong><br>
        <span class="text-xs text-muted">${data.students.map(s => s.name).join(', ')}</span>
      </div>
      <button class="alert-banner__close" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>
    </div>`;
  container.insertAdjacentHTML('beforeend', alertHTML);

  // Auto-dismiss after 15s
  setTimeout(() => {
    const alerts = container.querySelectorAll('.alert-banner');
    if (alerts.length > 3) alerts[0].remove();
  }, 15000);
}
