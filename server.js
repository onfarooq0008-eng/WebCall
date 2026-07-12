/**
 * ChatCall - WhatsApp-style WebRTC room app
 * Features:
 * - Create/share room link
 * - 1-to-1 video/audio calling with WebRTC
 * - In-room messaging with Socket.IO
 * - Works on Koyeb with a simple Node server
 *
 * Run:
 *   npm install
 *   npm start
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const PORT = process.env.PORT || 3000;

app.get('/', (_req, res) => {
  res.type('html').send(getHtml());
});

const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { clients: new Set() });
  }
  return rooms.get(roomId);
}

function broadcastRoomState(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  io.to(roomId).emit('room-users', { count: room.clients.size });
}

io.on('connection', (socket) => {
  socket.on('join-room', ({ roomId, name }) => {
    if (!roomId) return;
    socket.data.roomId = roomId;
    socket.data.name = (name || 'Guest').toString().slice(0, 32);

    const room = getRoom(roomId);
    room.clients.add(socket.id);

    socket.join(roomId);
    socket.emit('joined-room', {
      roomId,
      name: socket.data.name,
      users: room.clients.size,
    });

    socket.to(roomId).emit('system-message', {
      text: `${socket.data.name} joined the room`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });

    broadcastRoomState(roomId);
  });

  socket.on('webrtc-offer', ({ roomId, offer }) => {
    socket.to(roomId).emit('webrtc-offer', { offer, from: socket.id });
  });

  socket.on('webrtc-answer', ({ roomId, answer }) => {
    socket.to(roomId).emit('webrtc-answer', { answer, from: socket.id });
  });

  socket.on('webrtc-ice-candidate', ({ roomId, candidate }) => {
    socket.to(roomId).emit('webrtc-ice-candidate', { candidate, from: socket.id });
  });

  socket.on('chat-message', ({ roomId, text }) => {
    if (!roomId || !text) return;
    const msg = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      from: socket.data.name || 'Guest',
      text: text.toString().slice(0, 1000),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      mine: false,
    };
    io.to(roomId).emit('chat-message', msg);
  });

  socket.on('typing', ({ roomId, isTyping }) => {
    if (!roomId) return;
    socket.to(roomId).emit('typing', {
      name: socket.data.name || 'Guest',
      isTyping: !!isTyping,
    });
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (room) {
      room.clients.delete(socket.id);
      if (room.clients.size === 0) {
        rooms.delete(roomId);
      } else {
        socket.to(roomId).emit('system-message', {
          text: `${socket.data.name || 'Guest'} left the room`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
        broadcastRoomState(roomId);
      }
    }
  });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

function getHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ChatCall</title>
  <script src="https://cdn.socket.io/4.8.1/socket.io.min.js"></script>
  <style>
    :root { --bg:#0b141a; --panel:#111b21; --panel-2:#1f2c34; --soft:#2a3942; --text:#e9edef; --muted:#8696a0; --accent:#25d366; --accent-2:#128c7e; --danger:#ff5c5c; --bubble-me:#005c4b; --bubble-them:#202c33; --border:rgba(255,255,255,0.08); --shadow:0 10px 30px rgba(0,0,0,0.35); font-synthesis:none; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif; background:radial-gradient(circle at top,#1f2c34 0%,#0b141a 55%); color:var(--text); min-height:100vh; }
    .app { width:100%; min-height:100vh; display:grid; grid-template-columns:340px 1fr; }
    .sidebar { background:rgba(17,27,33,0.95); border-right:1px solid var(--border); display:flex; flex-direction:column; padding:18px; gap:16px; backdrop-filter:blur(10px); }
    .brand { display:flex; align-items:center; justify-content:space-between; gap:12px; }
    .brand h1 { margin:0; font-size:1.25rem; }
    .pill { padding:8px 12px; border-radius:999px; background:rgba(37,211,102,0.14); color:#c9f7d8; font-size:.85rem; border:1px solid rgba(37,211,102,0.2); }
    .card { background:rgba(31,44,52,0.75); border:1px solid var(--border); border-radius:18px; padding:16px; box-shadow:var(--shadow); }
    .card h2,.card h3 { margin:0 0 12px; font-size:1rem; }
    .label { display:block; font-size:.85rem; color:var(--muted); margin-bottom:6px; }
    input,button,textarea { font:inherit; border-radius:14px; border:1px solid var(--border); outline:none; }
    input,textarea { width:100%; background:#111b21; color:var(--text); padding:12px 14px; }
    textarea { resize:none; min-height:46px; max-height:110px; }
    button { cursor:pointer; background:var(--soft); color:var(--text); padding:11px 14px; transition:transform .15s ease, opacity .15s ease, background .15s ease; }
    button:hover { transform:translateY(-1px); }
    .btn-primary { background:var(--accent); color:#06210f; font-weight:700; }
    .btn-secondary { background:var(--panel-2); }
    .btn-danger { background:var(--danger); color:#fff; }
    .row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .stack { display:flex; flex-direction:column; gap:10px; }
    .muted { color:var(--muted); font-size:.92rem; }
    .main { display:flex; flex-direction:column; min-width:0; }
    .topbar { height:76px; border-bottom:1px solid var(--border); background:rgba(17,27,33,0.85); backdrop-filter:blur(10px); display:flex; align-items:center; justify-content:space-between; padding:0 18px; gap:16px; }
    .room-meta { display:flex; align-items:center; gap:12px; min-width:0; }
    .avatar { width:44px; height:44px; border-radius:50%; background:linear-gradient(135deg,var(--accent),var(--accent-2)); display:grid; place-items:center; font-weight:800; color:#08120d; flex:0 0 auto; }
    .room-title { min-width:0; }
    .room-title h2,.room-title p { margin:0; }
    .room-title h2 { font-size:1rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .room-title p { font-size:.85rem; color:var(--muted); }
    .status-dots { display:flex; align-items:center; gap:10px; flex-wrap:wrap; justify-content:flex-end; }
    .dot { width:10px; height:10px; border-radius:50%; background:var(--muted); }
    .dot.live { background:var(--accent); box-shadow:0 0 0 0 rgba(37,211,102,0.4); animation:pulse 1.8s infinite; }
    @keyframes pulse { 0% { box-shadow:0 0 0 0 rgba(37,211,102,0.45); } 70% { box-shadow:0 0 0 12px rgba(37,211,102,0); } 100% { box-shadow:0 0 0 0 rgba(37,211,102,0); } }
    .workspace { display:grid; grid-template-columns:1.35fr 0.9fr; gap:14px; padding:14px; flex:1; min-height:0; }
    .video-panel,.chat-panel { background:rgba(17,27,33,0.68); border:1px solid var(--border); border-radius:22px; box-shadow:var(--shadow); overflow:hidden; min-width:0; display:flex; flex-direction:column; min-height:0; }
    .video-stage { position:relative; flex:1; min-height:0; background:radial-gradient(circle at top, rgba(37,211,102,0.08), transparent 35%), linear-gradient(180deg, rgba(31,44,52,0.35), rgba(11,20,26,0.8)); display:grid; place-items:center; padding:18px; }
    .video-grid { width:100%; height:100%; display:grid; grid-template-columns:1fr 280px; gap:14px; min-height:0; }
    .video-box { position:relative; border-radius:22px; overflow:hidden; background:#000; border:1px solid var(--border); min-height:0; }
    video { width:100%; height:100%; object-fit:cover; background:#000; }
    .video-box .tag { position:absolute; left:12px; top:12px; background:rgba(0,0,0,0.45); backdrop-filter:blur(8px); padding:6px 10px; border-radius:999px; font-size:.8rem; }
    .mini { position:absolute; right:14px; bottom:14px; width:180px; height:240px; border-radius:18px; overflow:hidden; border:2px solid rgba(255,255,255,0.12); box-shadow:var(--shadow); background:#000; }
    .controls { display:flex; flex-wrap:wrap; gap:10px; justify-content:center; padding:14px; border-top:1px solid var(--border); background:rgba(17,27,33,0.85); }
    .controls button { min-width:118px; display:inline-flex; align-items:center; justify-content:center; gap:8px; }
    .chat-header,.chat-footer { padding:14px; border-bottom:1px solid var(--border); background:rgba(31,44,52,0.5); }
    .chat-footer { border-bottom:0; border-top:1px solid var(--border); margin-top:auto; }
    .messages { padding:14px; overflow:auto; flex:1; min-height:0; display:flex; flex-direction:column; gap:10px; }
    .msg { max-width:82%; border-radius:18px; padding:11px 12px; box-shadow:0 6px 16px rgba(0,0,0,0.2); border:1px solid var(--border); word-wrap:break-word; white-space:pre-wrap; }
    .msg.me { align-self:flex-end; background:var(--bubble-me); }
    .msg.them { align-self:flex-start; background:var(--bubble-them); }
    .msg.system { align-self:center; background:rgba(255,255,255,0.06); color:var(--muted); font-size:.85rem; border-style:dashed; }
    .msg-meta { display:flex; justify-content:space-between; gap:10px; margin-top:6px; font-size:.76rem; color:rgba(233,237,239,0.7); }
    .composer { display:flex; gap:10px; align-items:flex-end; }
    .composer textarea { flex:1; }
    .typing { min-height:22px; color:var(--muted); font-size:.85rem; margin-top:8px; }
    .hidden { display:none !important; }
    .join-overlay { position:fixed; inset:0; background:rgba(8,18,13,0.88); display:grid; place-items:center; z-index:20; padding:20px; }
    .join-box { width:min(480px, 100%); background:rgba(17,27,33,0.95); border:1px solid var(--border); border-radius:24px; padding:22px; box-shadow:var(--shadow); }
    .join-box h2 { margin:0 0 8px; }
    .join-box p { margin:0 0 18px; color:var(--muted); }
    .small-note { margin-top:12px; font-size:.85rem; color:var(--muted); line-height:1.5; }
    .link-row { display:flex; gap:10px; }
    .link-row input { flex:1; }
    @media (max-width:980px) { .app { grid-template-columns:1fr; } .sidebar { border-right:0; border-bottom:1px solid var(--border); } .workspace { grid-template-columns:1fr; } .video-grid { grid-template-columns:1fr; } .mini { width:160px; height:210px; } }
    @media (max-width:640px) { .topbar { height:auto; padding:12px; flex-direction:column; align-items:flex-start; } .status-dots { justify-content:flex-start; } .controls button { min-width:0; flex:1 1 46%; } .composer { flex-direction:column; } .composer button { width:100%; } .link-row { flex-direction:column; } .row { grid-template-columns:1fr; } .mini { width:130px; height:170px; } }
  </style>
</head>
<body>
  <div class="join-overlay" id="joinOverlay">
    <div class="join-box">
      <h2>Start a room</h2>
      <p>Create a room link and send it to the other person.</p>
      <div class="stack">
        <div>
          <label class="label">Your name</label>
          <input id="nameInput" placeholder="Enter your name" maxlength="32" />
        </div>
        <div class="row">
          <button class="btn-primary" id="createRoomBtn">Create room</button>
          <button class="btn-secondary" id="joinWithLinkBtn">Join with link</button>
        </div>
        <div id="linkJoinBox" class="stack hidden">
          <div>
            <label class="label">Room link</label>
            <input id="roomLinkInput" placeholder="Paste room link here" />
          </div>
          <button class="btn-primary" id="joinRoomBtn">Join room</button>
        </div>
      </div>
      <div class="small-note">This is a 1-to-1 room app. For production, add TURN servers so calls work better on strict networks.</div>
    </div>
  </div>

  <div class="app hidden" id="app">
    <aside class="sidebar">
      <div class="brand">
        <h1>ChatCall</h1>
        <span class="pill" id="roomPill">Not connected</span>
      </div>
      <div class="card">
        <h2>Room</h2>
        <div class="stack">
          <div>
            <span class="label">Share link</span>
            <div class="link-row">
              <input id="shareLink" readonly />
              <button class="btn-secondary" id="copyLinkBtn">Copy</button>
            </div>
          </div>
          <div class="row">
            <button class="btn-secondary" id="muteBtn">Mute</button>
            <button class="btn-secondary" id="cameraBtn">Camera off</button>
          </div>
          <div class="row">
            <button class="btn-secondary" id="audioOnlyBtn">Audio only</button>
            <button class="btn-danger" id="leaveBtn">Leave</button>
          </div>
        </div>
      </div>
      <div class="card">
        <h3>Connection</h3>
        <div class="muted" id="connStatus">Waiting to join...</div>
        <div class="muted" id="userCount">Users: 0</div>
      </div>
      <div class="card">
        <h3>How it works</h3>
        <div class="muted">1. Create a room.<br/>2. Send the link.<br/>3. Open the link on the other phone.<br/>4. Video, audio, and chat start in the room.</div>
      </div>
    </aside>

    <main class="main">
      <div class="topbar">
        <div class="room-meta">
          <div class="avatar" id="roomAvatar">C</div>
          <div class="room-title">
            <h2 id="roomTitle">ChatCall Room</h2>
            <p id="roomSubtitle">Secure link-based calling</p>
          </div>
        </div>
        <div class="status-dots">
          <span class="dot" id="liveDot"></span>
          <span class="muted" id="liveText">Disconnected</span>
        </div>
      </div>

      <div class="workspace">
        <section class="video-panel">
          <div class="video-stage">
            <div class="video-grid">
              <div class="video-box">
                <div class="tag">Remote</div>
                <video id="remoteVideo" autoplay playsinline></video>
              </div>
              <div class="video-box mini">
                <div class="tag">You</div>
                <video id="localVideo" autoplay playsinline muted></video>
              </div>
            </div>
          </div>
          <div class="controls">
            <button class="btn-primary" id="startVideoBtn">Start video</button>
            <button class="btn-secondary" id="startAudioBtn">Start audio</button>
            <button class="btn-secondary" id="endCallBtn">End call</button>
          </div>
        </section>

        <section class="chat-panel">
          <div class="chat-header">
            <strong>Messages</strong>
            <div class="typing" id="typingText"></div>
          </div>
          <div class="messages" id="messages"></div>
          <div class="chat-footer">
            <div class="composer">
              <textarea id="messageInput" placeholder="Type a message"></textarea>
              <button class="btn-primary" id="sendBtn">Send</button>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>

  <script>
    const socket = io();
    const el = (id) => document.getElementById(id);
    const joinOverlay = el('joinOverlay');
    const app = el('app');
    const nameInput = el('nameInput');
    const roomLinkInput = el('roomLinkInput');
    const createRoomBtn = el('createRoomBtn');
    const joinWithLinkBtn = el('joinWithLinkBtn');
    const joinRoomBtn = el('joinRoomBtn');
    const linkJoinBox = el('linkJoinBox');
    const shareLink = el('shareLink');
    const copyLinkBtn = el('copyLinkBtn');
    const connStatus = el('connStatus');
    const roomPill = el('roomPill');
    const roomTitle = el('roomTitle');
    const roomSubtitle = el('roomSubtitle');
    const roomAvatar = el('roomAvatar');
    const userCount = el('userCount');
    const liveDot = el('liveDot');
    const liveText = el('liveText');
    const messages = el('messages');
    const messageInput = el('messageInput');
    const sendBtn = el('sendBtn');
    const typingText = el('typingText');
    const localVideo = el('localVideo');
    const remoteVideo = el('remoteVideo');
    const startVideoBtn = el('startVideoBtn');
    const startAudioBtn = el('startAudioBtn');
    const endCallBtn = el('endCallBtn');
    const muteBtn = el('muteBtn');
    const cameraBtn = el('cameraBtn');
    const audioOnlyBtn = el('audioOnlyBtn');
    const leaveBtn = el('leaveBtn');

    let roomId = null;
    let myName = 'Guest';
    let localStream = null;
    let peerConnection = null;
    let isMuted = false;
    let cameraOff = false;
    let typingTimer = null;
    let isJoining = false;
    const iceServers = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };

    function makeRoomId() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }
    function getRoomFromUrl() { return new URL(window.location.href).searchParams.get('room'); }
    function setStatus(text, live = false) { connStatus.textContent = text; liveText.textContent = text; liveDot.classList.toggle('live', live); }
    function escapeHtml(str) { return String(str).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#39;"); }

    function addMessage({ from, text, time, mine, system }) {
      const div = document.createElement('div');
      div.className = 'msg ' + (system ? 'system' : mine ? 'me' : 'them');
      if (system) div.textContent = text;
      else div.innerHTML = '<div><strong>' + escapeHtml(from) + '</strong><br/>' + escapeHtml(text) + '</div><div class="msg-meta"><span>' + escapeHtml(time || '') + '</span></div>';
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    }

    function setRoomVisuals() {
      roomPill.textContent = roomId ? 'Room ' + roomId : 'Not connected';
      roomTitle.textContent = roomId ? 'Room ' + roomId : 'ChatCall Room';
      roomSubtitle.textContent = roomId ? 'Send this link to join' : 'Secure link-based calling';
      roomAvatar.textContent = roomId ? roomId.slice(0, 1) : 'C';
      shareLink.value = roomId ? window.location.origin + window.location.pathname + '?room=' + roomId : '';
    }

    async function ensureMedia({ video = true, audio = true } = {}) {
      if (localStream) return localStream;
      localStream = await navigator.mediaDevices.getUserMedia({ video, audio });
      localVideo.srcObject = localStream;
      return localStream;
    }

    function createPeerConnection() {
      if (peerConnection) return peerConnection;
      peerConnection = new RTCPeerConnection(iceServers);
      peerConnection.onicecandidate = (event) => { if (event.candidate && roomId) socket.emit('webrtc-ice-candidate', { roomId, candidate: event.candidate }); };
      peerConnection.ontrack = (event) => { if (event.streams && event.streams[0]) remoteVideo.srcObject = event.streams[0]; };
      if (localStream) localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));
      return peerConnection;
    }

    async function startCall({ video = true, audio = true, initiate = false } = {}) {
      if (!roomId) return;
      try {
        setStatus('Getting media permission...', true);
        await ensureMedia({ video, audio });
        const pc = createPeerConnection();
        setStatus('Connecting...', true);
        if (initiate) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('webrtc-offer', { roomId, offer });
        }
      } catch (err) {
        console.error(err);
        addMessage({ system: true, text: 'Could not start media: ' + err.message });
        setStatus('Media blocked or unavailable', false);
      }
    }

    function resetCall() {
      if (peerConnection) { peerConnection.close(); peerConnection = null; }
      if (localStream) { localStream.getTracks().forEach((t) => t.stop()); localStream = null; }
      localVideo.srcObject = null;
      remoteVideo.srcObject = null;
      isMuted = false;
      cameraOff = false;
      muteBtn.textContent = 'Mute';
      cameraBtn.textContent = 'Camera off';
      setStatus(roomId ? 'Connected to room' : 'Disconnected', !!roomId);
    }

    async function joinRoom(finalRoomId) {
      if (isJoining) return;
      isJoining = true;
      try {
        roomId = finalRoomId;
        myName = (nameInput.value || 'Guest').trim().slice(0, 32) || 'Guest';
        socket.emit('join-room', { roomId, name: myName });
        history.replaceState({}, '', '?room=' + encodeURIComponent(roomId));
        app.classList.remove('hidden');
        joinOverlay.classList.add('hidden');
        setRoomVisuals();
        setStatus('Connecting to room...', true);
      } finally {
        isJoining = false;
      }
    }

    function handleOutgoingMessage() {
      const text = messageInput.value.trim();
      if (!text || !roomId) return;
      socket.emit('chat-message', { roomId, text });
      messageInput.value = '';
      socket.emit('typing', { roomId, isTyping: false });
    }

    createRoomBtn.addEventListener('click', async () => {
      const id = makeRoomId();
      await joinRoom(id);
      addMessage({ system: true, text: 'Room created. Share the link to let someone join.' });
    });

    joinWithLinkBtn.addEventListener('click', () => linkJoinBox.classList.toggle('hidden'));

    joinRoomBtn.addEventListener('click', async () => {
      const raw = roomLinkInput.value.trim();
      try {
        const url = new URL(raw);
        const id = url.searchParams.get('room');
        if (!id) throw new Error('No room in link');
        await joinRoom(id);
      } catch {
        alert('Paste a valid room link');
      }
    });

    copyLinkBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(shareLink.value);
        copyLinkBtn.textContent = 'Copied';
        setTimeout(() => copyLinkBtn.textContent = 'Copy', 1200);
      } catch {
        alert('Copy manually: ' + shareLink.value);
      }
    });

    sendBtn.addEventListener('click', handleOutgoingMessage);
    messageInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleOutgoingMessage(); } });
    messageInput.addEventListener('input', () => {
      if (!roomId) return;
      socket.emit('typing', { roomId, isTyping: true });
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => socket.emit('typing', { roomId, isTyping: false }), 900);
    });

    startVideoBtn.addEventListener('click', async () => { if (roomId) await startCall({ video: true, audio: true, initiate: true }); });
    startAudioBtn.addEventListener('click', async () => { if (roomId) await startCall({ video: false, audio: true, initiate: true }); });
    endCallBtn.addEventListener('click', () => { resetCall(); addMessage({ system: true, text: 'Call ended' }); });

    muteBtn.addEventListener('click', () => {
      if (!localStream) return;
      isMuted = !isMuted;
      localStream.getAudioTracks().forEach((t) => (t.enabled = !isMuted));
      muteBtn.textContent = isMuted ? 'Unmute' : 'Mute';
    });

    cameraBtn.addEventListener('click', () => {
      if (!localStream) return;
      cameraOff = !cameraOff;
      localStream.getVideoTracks().forEach((t) => (t.enabled = !cameraOff));
      cameraBtn.textContent = cameraOff ? 'Camera on' : 'Camera off';
    });

    audioOnlyBtn.addEventListener('click', async () => { if (roomId) { resetCall(); await startCall({ video: false, audio: true, initiate: true }); } });
    leaveBtn.addEventListener('click', () => {
      socket.disconnect();
      resetCall();
      roomId = null;
      messages.innerHTML = '';
      setRoomVisuals();
      joinOverlay.classList.remove('hidden');
      app.classList.add('hidden');
      history.replaceState({}, '', window.location.pathname);
    });

    socket.on('joined-room', ({ roomId: joinedId, users }) => {
      roomId = joinedId;
      setRoomVisuals();
      setStatus('Connected', true);
      userCount.textContent = 'Users: ' + users;
      if (users === 1) addMessage({ system: true, text: 'Waiting for the other person to join...' });
    });

    socket.on('room-users', ({ count }) => {
      userCount.textContent = 'Users: ' + count;
      if (count >= 2) setStatus('Ready for call', true);
    });

    socket.on('system-message', (msg) => addMessage({ ...msg, system: true }));
    socket.on('chat-message', (msg) => addMessage({ ...msg, mine: msg.from === myName }));
    socket.on('typing', ({ name, isTyping }) => { typingText.textContent = isTyping ? name + ' is typing...' : ''; });

    socket.on('webrtc-offer', async ({ offer }) => {
      try {
        await ensureMedia({ video: true, audio: true });
        const pc = createPeerConnection();
        await pc.setRemoteDescription(offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc-answer', { roomId, answer });
        setStatus('In call', true);
      } catch (err) {
        console.error(err);
        addMessage({ system: true, text: 'Failed to answer call: ' + err.message });
      }
    });

    socket.on('webrtc-answer', async ({ answer }) => {
      try {
        if (peerConnection && !peerConnection.currentRemoteDescription) {
          await peerConnection.setRemoteDescription(answer);
          setStatus('In call', true);
        }
      } catch (err) { console.error(err); }
    });

    socket.on('webrtc-ice-candidate', async ({ candidate }) => {
      try {
        if (peerConnection && candidate) await peerConnection.addIceCandidate(candidate);
      } catch (err) { console.error('ICE error', err); }
    });

    socket.on('disconnect', () => setStatus('Disconnected', false));

    (function init() {
      setRoomVisuals();
      const linkRoom = getRoomFromUrl();
      if (linkRoom) {
        roomLinkInput.value = window.location.href;
      }
    })();
  </script>
</body>
</html>`;
}
