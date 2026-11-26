#!/usr/bin/env node
/**
 * 《仙剑 · 锁妖剑台》轻量 Node.js 实时联机房间服 (Co-op 组队闯关 + Solo 1v1 单挑)
 * - 零第三方依赖：纯 Node.js 原生 http + crypto RFC 6455 WebSocket + HTTP /health JSON 探针
 * - 支持：4 位房间码建房/加入、快速匹配、20Hz 状态同步、招式/技能/弹反/受击/Boss 同步与断线清理
 */

import http from 'node:http';
import crypto from 'node:crypto';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const HOST = process.env.MP_HOST || '0.0.0.0';
const PORT = Number(process.env.MP_PORT || '18099');
const RELAY_TYPES = new Set([
  'state',
  'action',
  'enemy_sync',
  'enemy_hit',
  'pvp_hit',
  'stage_sync',
  'rematch',
  'revive',
  'chat',
]);

let seq = 0;
let totalMatches = 0;
const startedAt = Date.now();
const rooms = new Map();
const conns = new Set();

function sendWsFrame(conn, opcode, payloadBuf) {
  if (conn.closed || conn.socket.destroyed) return;
  const len = payloadBuf.length;
  let header;
  if (len < 126) {
    header = Buffer.allocUnsafe(2);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.allocUnsafe(4);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  try {
    conn.socket.write(Buffer.concat([header, payloadBuf]));
  } catch {
    closeConn(conn);
  }
}

function sendJson(conn, obj) {
  sendWsFrame(conn, 0x1, Buffer.from(JSON.stringify(obj), 'utf8'));
}

function closeConn(conn) {
  if (conn.closed) return;
  conn.closed = true;
  conns.delete(conn);
  leaveRoom(conn);
  try {
    sendWsFrame(conn, 0x8, Buffer.alloc(0));
  } catch {
    // ignore
  }
  try {
    conn.socket.end();
    conn.socket.destroy();
  } catch {
    // ignore
  }
}

function allocCode() {
  for (let i = 0; i < 200; i++) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    if (!rooms.has(code)) return code;
  }
  return String(Math.floor(10000 + Math.random() * 90000));
}

function peerOf(room, conn) {
  if (conn === room.host) return room.guest;
  if (conn === room.guest) return room.host;
  return null;
}

function leaveRoom(conn) {
  const code = conn.roomCode;
  if (!code) return;
  conn.roomCode = null;
  const room = rooms.get(code);
  if (!room) return;

  const peer = peerOf(room, conn);
  if (conn === room.host) {
    if (room.guest && !room.guest.closed) {
      sendJson(room.guest, { t: 'peer_left', reason: '房主已离开房间' });
      room.guest.roomCode = null;
    }
    rooms.delete(code);
  } else if (conn === room.guest) {
    room.guest = null;
    room.started = false;
    if (peer && !peer.closed) {
      sendJson(peer, { t: 'peer_left', reason: '同伴已断开连接，等待新侠客加入' });
    }
  }
}

function pairIntoRoom(room, guest) {
  room.guest = guest;
  room.started = true;
  guest.roomCode = room.code;
  guest.role = 'guest';
  totalMatches += 1;

  const common = {
    t: 'room_ready',
    code: room.code,
    mode: room.mode,
    stage: room.stage,
    hostName: room.host.name,
    guestName: guest.name,
  };
  sendJson(room.host, { ...common, role: 'host' });
  sendJson(guest, { ...common, role: 'guest' });
}

function handleMessage(conn, msg) {
  const t = msg.t;
  if (t === 'ping') {
    sendJson(conn, { t: 'pong', ts: msg.ts || 0 });
    return;
  }

  if (t === 'create_room') {
    leaveRoom(conn);
    const mode = msg.mode === 'solo' ? 'solo' : 'coop';
    const stage = Math.max(1, Math.min(3, Number(msg.stage || 1) | 0));
    conn.name = String(msg.name || '李逍遥').slice(0, 16);
    const code = allocCode();
    const room = { code, mode, stage, host: conn, guest: null, started: false, createdAt: Date.now() };
    rooms.set(code, room);
    conn.roomCode = code;
    conn.role = 'host';
    sendJson(conn, { t: 'room_created', code, mode, stage, role: 'host' });
    return;
  }

  if (t === 'join_room') {
    leaveRoom(conn);
    const code = String(msg.code || '').trim();
    const room = rooms.get(code);
    if (!room) {
      sendJson(conn, { t: 'error', msg: `房间 ${code} 不存在或已解散` });
      return;
    }
    if (room.guest) {
      sendJson(conn, { t: 'error', msg: `房间 ${code} 已满（2/2）` });
      return;
    }
    conn.name = String(msg.name || '蜀山同门').slice(0, 16);
    pairIntoRoom(room, conn);
    return;
  }

  if (t === 'quick_match') {
    leaveRoom(conn);
    const mode = msg.mode === 'solo' ? 'solo' : 'coop';
    const stage = Math.max(1, Math.min(3, Number(msg.stage || 1) | 0));
    conn.name = String(msg.name || '蜀山侠客').slice(0, 16);
    for (const r of rooms.values()) {
      if (r.mode === mode && !r.guest && !r.host.closed) {
        pairIntoRoom(r, conn);
        return;
      }
    }
    const code = allocCode();
    const room = { code, mode, stage, host: conn, guest: null, started: false, createdAt: Date.now() };
    rooms.set(code, room);
    conn.roomCode = code;
    conn.role = 'host';
    sendJson(conn, { t: 'room_created', code, mode, stage, role: 'host', quickMatch: true });
    return;
  }

  if (t === 'leave_room') {
    leaveRoom(conn);
    sendJson(conn, { t: 'left_room' });
    return;
  }

  if (!conn.roomCode) return;
  const room = rooms.get(conn.roomCode);
  if (!room) return;
  const peer = peerOf(room, conn);
  if (!peer || peer.closed) return;

  if (RELAY_TYPES.has(t)) {
    msg.from = conn.role;
    sendJson(peer, msg);
  }
}

function drainFrames(conn) {
  while (conn.buffer.length >= 2 && !conn.closed) {
    const b1 = conn.buffer[0];
    const b2 = conn.buffer[1];
    const opcode = b1 & 0x0f;
    const masked = (b2 & 0x80) !== 0;
    let length = b2 & 0x7f;
    let offset = 2;

    if (length === 126) {
      if (conn.buffer.length < 4) return;
      length = conn.buffer.readUInt16BE(2);
      offset = 4;
    } else if (length === 127) {
      if (conn.buffer.length < 10) return;
      const bigLen = conn.buffer.readBigUInt64BE(2);
      if (bigLen > 262144n) {
        closeConn(conn);
        return;
      }
      length = Number(bigLen);
      offset = 10;
    }

    if (length > 262144) {
      closeConn(conn);
      return;
    }

    const maskOffset = offset;
    if (masked) offset += 4;
    if (conn.buffer.length < offset + length) return;

    let payload = conn.buffer.subarray(offset, offset + length);
    if (masked && length > 0) {
      const mask = conn.buffer.subarray(maskOffset, maskOffset + 4);
      const unmasked = Buffer.allocUnsafe(length);
      for (let i = 0; i < length; i++) {
        unmasked[i] = payload[i] ^ mask[i & 3];
      }
      payload = unmasked;
    }
    conn.buffer = conn.buffer.subarray(offset + length);
    conn.lastSeen = Date.now();

    if (opcode === 0x8) {
      closeConn(conn);
      return;
    }
    if (opcode === 0x9) {
      sendWsFrame(conn, 0x0a, payload);
      continue;
    }
    if (opcode === 0x0a) {
      continue;
    }
    if (opcode === 0x1 || opcode === 0x2) {
      try {
        const msg = JSON.parse(payload.toString('utf8'));
        if (msg && typeof msg === 'object') {
          handleMessage(conn, msg);
        }
      } catch {
        // ignore malformed json
      }
    }
  }
}

const server = http.createServer((req, res) => {
  const stats = {
    status: 'ok',
    service: 'lixiaoyao-mp-ws',
    runtime: 'nodejs',
    uptimeSec: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
    connections: conns.size,
    activeRooms: rooms.size,
    totalMatches,
  };
  const body = JSON.stringify(stats);
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(body);
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || String(req.headers.upgrade || '').toLowerCase() !== 'websocket') {
    socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  const accept = crypto.createHash('sha1').update(`${key}${WS_GUID}`).digest('base64');
  socket.write(
    [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '',
      '',
    ].join('\r\n'),
  );
  socket.setNoDelay(true);

  const conn = {
    id: `p${++seq}`,
    socket,
    buffer: Buffer.alloc(0),
    closed: false,
    roomCode: null,
    role: 'host',
    name: '剑客',
    lastSeen: Date.now(),
  };
  conns.add(conn);
  sendJson(conn, { t: 'welcome', id: conn.id, rooms: rooms.size });

  socket.on('data', (chunk) => {
    conn.buffer = Buffer.concat([conn.buffer, chunk]);
    drainFrames(conn);
  });
  socket.on('close', () => closeConn(conn));
  socket.on('error', () => closeConn(conn));
});

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.host.closed || (now - room.host.lastSeen > 180_000 && !room.guest)) {
      leaveRoom(room.host);
    }
  }
}, 20_000).unref();

server.listen(PORT, HOST, () => {
  console.log(`[lixiaoyao-mp-ws] Node.js WebSocket server listening on ${HOST}:${PORT}`);
});
