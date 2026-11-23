// Совместная игра «Пульт-40» (Общий пульт вдвоём + Чат бункера) на базе Supabase Realtime

window.CoopService = (function () {
  let channel = null;
  let lobbyChannel = null;
  let lobbyCallback = null;
  let roomCode = null;
  let role = null; // 'host' | 'guest' | null
  let myPeerId = 'p_' + Math.random().toString(36).slice(2, 10);
  let myCallsign = 'Дежурный';
  let peers = []; // [{ id, callsign, role }]
  let handlers = {};

  function isConnected() {
    return Boolean(channel && roomCode);
  }

  function isHost() {
    return isConnected() && role === 'host';
  }

  function isGuest() {
    return isConnected() && role === 'guest';
  }

  function getRoomCode() {
    return roomCode;
  }

  function getPeers() {
    return peers;
  }

  function getMyCallsign() {
    return myCallsign;
  }

  function setHandlers(h) {
    handlers = h || {};
  }

  function generateRoomCode() {
    return String(1000 + Math.floor(Math.random() * 9000));
  }

  function updatePresenceList() {
    if (!channel) {
      peers = [];
      return;
    }
    const raw = channel.presenceState();
    const list = [];
    Object.keys(raw).forEach((key) => {
      const entries = raw[key];
      if (entries && entries.length > 0) {
        const p = entries[0];
        list.push({
          id: p.id || key,
          callsign: p.callsign || 'Дежурный',
          role: p.role || 'guest'
        });
      }
    });
    // Сортируем: хост первый
    list.sort((a, b) => (a.role === 'host' ? -1 : b.role === 'host' ? 1 : 0));
    peers = list;
    if (role === 'host' && roomCode) {
      announceRoomInLobby(roomCode, myCallsign, peers.length);
    }
    if (handlers.onPeersChange) handlers.onPeersChange(peers);
  }

  // --- СПИСОК ОТКРЫТЫХ КОМНАТ (БЕЗ ВВОДА КОДА) ---
  function emitLobbyRooms() {
    if (!lobbyChannel || !lobbyCallback) return;
    const raw = lobbyChannel.presenceState();
    const rooms = [];
    Object.keys(raw).forEach((key) => {
      const entries = raw[key];
      if (!entries) return;
      entries.forEach((entry) => {
        if (entry && entry.type === 'room' && entry.code) {
          rooms.push({
            code: entry.code,
            hostName: entry.hostName || 'Хост',
            playersCount: entry.playersCount || 1
          });
        }
      });
    });
    lobbyCallback(rooms);
  }

  function ensureLobbyChannel() {
    const client = window.CloudService && window.CloudService.getClient();
    if (!client) return null;
    if (lobbyChannel) return lobbyChannel;

    const ch = client.channel('pult40-open-rooms', {
      config: { presence: { key: myPeerId } }
    });
    ch.on('presence', { event: 'sync' }, emitLobbyRooms);
    ch.on('presence', { event: 'join' }, emitLobbyRooms);
    ch.on('presence', { event: 'leave' }, emitLobbyRooms);
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        emitLobbyRooms();
        if (role === 'host' && roomCode) {
          ch.track({
            type: 'room',
            code: roomCode,
            hostName: myCallsign,
            playersCount: Math.max(1, peers.length)
          });
        }
      }
    });
    lobbyChannel = ch;
    return ch;
  }

  function watchOpenRooms(cb) {
    lobbyCallback = cb;
    const ch = ensureLobbyChannel();
    if (!ch) {
      if (cb) cb([]);
      return;
    }
    emitLobbyRooms();
  }

  function announceRoomInLobby(code, hostName, count) {
    const ch = ensureLobbyChannel();
    if (!ch) return;
    try {
      ch.track({
        type: 'room',
        code,
        hostName,
        playersCount: Math.max(1, count || 1)
      });
    } catch (_) {}
  }

  async function unannounceRoomInLobby() {
    if (!lobbyChannel) return;
    try {
      await lobbyChannel.untrack();
    } catch (_) {}
  }

  async function connectToRoom(code, chosenRole, callsign) {
    const client = window.CloudService && window.CloudService.getClient();
    if (!client) {
      return { error: 'Нет подключения к облаку Supabase (проверьте интернет).' };
    }

    await leaveRoom(true);

    const cleanCode = String(code || '').replace(/\D/g, '').slice(0, 4);
    if (cleanCode.length !== 4) {
      return { error: 'Код комнаты должен состоять из 4 цифр (например, 4821).' };
    }

    roomCode = cleanCode;
    role = chosenRole;
    myCallsign = String(callsign || 'Дежурный').trim().slice(0, 22) || 'Дежурный';

    return new Promise((resolve) => {
      let settled = false;
      const ch = client.channel(`pult40-coop-${roomCode}`, {
        config: {
          broadcast: { self: false },
          presence: { key: myPeerId }
        }
      });

      ch.on('presence', { event: 'sync' }, () => {
        updatePresenceList();
      });

      ch.on('presence', { event: 'join' }, ({ newPresences }) => {
        updatePresenceList();
        if (role === 'host' && handlers.onGuestJoined) {
          handlers.onGuestJoined(newPresences);
        }
      });

      ch.on('presence', { event: 'leave' }, () => {
        updatePresenceList();
      });

      ch.on('broadcast', { event: 'coop_msg' }, ({ payload }) => {
        if (!payload) return;
        if (payload.kind === 'chat' && handlers.onChat) {
          handlers.onChat(payload);
        } else if (payload.kind === 'action' && handlers.onRemoteAction) {
          handlers.onRemoteAction(payload);
        } else if (payload.kind === 'state' && handlers.onStateSync) {
          handlers.onStateSync(payload);
        } else if (payload.kind === 'fx' && handlers.onRemoteFx) {
          handlers.onRemoteFx(payload);
        }
      });

      ch.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          channel = ch;
          await ch.track({
            id: myPeerId,
            callsign: myCallsign,
            role
          });
          updatePresenceList();
          if (!settled) {
            settled = true;
            if (handlers.onConnectionChange) handlers.onConnectionChange(true);
            resolve({ ok: true, code: roomCode, role });
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (!settled) {
            settled = true;
            await leaveRoom(true);
            resolve({ error: 'Не удалось подключиться к комнате Realtime.' });
          }
        }
      });
    });
  }

  async function createRoom(callsign) {
    const code = generateRoomCode();
    const res = await connectToRoom(code, 'host', callsign);
    if (res && res.ok) {
      announceRoomInLobby(code, myCallsign, 1);
    }
    return res;
  }

  async function joinRoom(code, callsign) {
    return connectToRoom(code, 'guest', callsign);
  }

  async function leaveRoom(silent = false) {
    const client = window.CloudService && window.CloudService.getClient();
    await unannounceRoomInLobby();
    if (channel && client) {
      try {
        await channel.untrack();
        await client.removeChannel(channel);
      } catch (_) {}
    }
    channel = null;
    roomCode = null;
    role = null;
    peers = [];
    if (!silent) {
      if (handlers.onPeersChange) handlers.onPeersChange([]);
      if (handlers.onConnectionChange) handlers.onConnectionChange(false);
    }
  }

  function sendPayload(payload) {
    if (!channel) return;
    channel.send({
      type: 'broadcast',
      event: 'coop_msg',
      payload: {
        ...payload,
        senderId: myPeerId,
        sender: myCallsign
      }
    });
  }

  function sendChat(text) {
    const clean = String(text || '').trim().slice(0, 180);
    if (!clean || !channel) return null;
    const msg = {
      kind: 'chat',
      text: clean,
      sender: myCallsign,
      senderId: myPeerId,
      ts: new Date().toTimeString().slice(0, 5)
    };
    sendPayload(msg);
    return msg;
  }

  function sendAction(action, data = {}) {
    if (!channel) return;
    sendPayload({ kind: 'action', action, data });
  }

  function sendStateSync(snapshot) {
    if (!channel || role !== 'host') return;
    sendPayload({ kind: 'state', snapshot });
  }

  function sendFx(fxType, data = {}) {
    if (!channel) return;
    sendPayload({ kind: 'fx', fxType, data });
  }

  return {
    isConnected,
    isHost,
    isGuest,
    getRoomCode,
    getPeers,
    getMyCallsign,
    setHandlers,
    createRoom,
    joinRoom,
    leaveRoom,
    watchOpenRooms,
    sendChat,
    sendAction,
    sendStateSync,
    sendFx
  };
})();
