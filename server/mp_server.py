#!/usr/bin/env python3
"""
《仙剑 · 锁妖剑台》双人实时联机房间服 (Co-op 组队闯关 + Solo 1v1 单挑)
- 纯 Python 3 asyncio RFC 6455 WebSocket + HTTP /health 探针，零第三方依赖
- 支持：4 位房间码建房/加入、快速匹配、20Hz 状态同步、招式/技能/弹反/受击/Boss 权威同步、断线清理
"""

import asyncio
import base64
import hashlib
import json
import os
import random
import struct
import time
from typing import Dict, Optional, Set

WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
HOST = os.environ.get("MP_HOST", "0.0.0.0")
PORT = int(os.environ.get("MP_PORT", "18099"))


class WSClosed(Exception):
    pass


class WSConn:
    def __init__(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter, peer_id: str):
        self.reader = reader
        self.writer = writer
        self.peer_id = peer_id
        self.closed = False
        self.room_code: Optional[str] = None
        self.role: str = "host"  # 'host' (P1) | 'guest' (P2)
        self.name: str = "剑客"
        self.last_seen: float = time.monotonic()

    async def send_frame(self, opcode: int, payload: bytes) -> None:
        if self.closed:
            return
        header = bytearray([0x80 | (opcode & 0x0F)])
        n = len(payload)
        if n < 126:
            header.append(n)
        elif n < 65536:
            header.append(126)
            header.extend(struct.pack("!H", n))
        else:
            header.append(127)
            header.extend(struct.pack("!Q", n))
        try:
            self.writer.write(bytes(header) + payload)
            await self.writer.drain()
        except Exception:
            self.closed = True

    async def send_json(self, obj: dict) -> None:
        raw = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        await self.send_frame(0x1, raw)

    async def recv_message(self) -> Optional[str]:
        while not self.closed:
            try:
                head = await self.reader.readexactly(2)
            except Exception as exc:
                raise WSClosed() from exc

            b1, b2 = head[0], head[1]
            opcode = b1 & 0x0F
            masked = bool(b2 & 0x80)
            length = b2 & 0x7F

            if length == 126:
                ext = await self.reader.readexactly(2)
                length = struct.unpack("!H", ext)[0]
            elif length == 127:
                ext = await self.reader.readexactly(8)
                length = struct.unpack("!Q", ext)[0]

            if length > 262144:  # 256 KB safety cap per frame
                raise WSClosed("Frame too large")

            mask_key = await self.reader.readexactly(4) if masked else b""
            data = await self.reader.readexactly(length) if length > 0 else b""
            if masked and length > 0:
                data = bytes(b ^ mask_key[i & 3] for i, b in enumerate(data))

            self.last_seen = time.monotonic()

            if opcode == 0x8:  # Close
                self.closed = True
                return None
            if opcode == 0x9:  # Ping -> Pong
                await self.send_frame(0xA, data)
                continue
            if opcode == 0xA:  # Pong
                continue
            if opcode in (0x1, 0x2):
                return data.decode("utf-8", errors="replace")
        return None

    async def close(self) -> None:
        if not self.closed:
            self.closed = True
            try:
                await self.send_frame(0x8, b"")
            except Exception:
                pass
        try:
            self.writer.close()
        except Exception:
            pass


class Room:
    def __init__(self, code: str, mode: str, stage: int, host: WSConn):
        self.code = code
        self.mode = mode  # 'coop' | 'solo'
        self.stage = stage  # 1 | 2 | 3
        self.host = host
        self.guest: Optional[WSConn] = None
        self.created_at: float = time.monotonic()
        self.started: bool = False

    def members(self):
        res = [self.host]
        if self.guest is not None:
            res.append(self.guest)
        return res

    def peer_of(self, conn: WSConn) -> Optional[WSConn]:
        if conn is self.host:
            return self.guest
        if conn is self.guest:
            return self.host
        return None


class RoomHub:
    def __init__(self):
        self.rooms: Dict[str, Room] = {}
        self.conns: Set[WSConn] = set()
        self.total_matches = 0
        self.started_at = time.time()

    def alloc_code(self) -> str:
        for _ in range(200):
            code = f"{random.randint(1000, 9999)}"
            if code not in self.rooms:
                return code
        return f"{random.randint(10000, 99999)}"

    async def leave_room(self, conn: WSConn) -> None:
        code = conn.room_code
        if not code:
            return
        conn.room_code = None
        room = self.rooms.get(code)
        if not room:
            return

        peer = room.peer_of(conn)
        if conn is room.host:
            if room.guest is not None:
                # Promote guest or close room cleanly
                await room.guest.send_json({"t": "peer_left", "reason": "房主已离开房间"})
                room.guest.room_code = None
            self.rooms.pop(code, None)
        elif conn is room.guest:
            room.guest = None
            room.started = False
            if peer is not None:
                await peer.send_json({"t": "peer_left", "reason": "同伴已断开连接，等待新侠客加入"})

    async def handle_message(self, conn: WSConn, msg: dict) -> None:
        t = msg.get("t")
        if t == "ping":
            await conn.send_json({"t": "pong", "ts": msg.get("ts", 0)})
            return

        if t == "create_room":
            await self.leave_room(conn)
            mode = "solo" if msg.get("mode") == "solo" else "coop"
            stage = max(1, min(3, int(msg.get("stage", 1))))
            conn.name = str(msg.get("name") or "李逍遥")[:16]
            code = self.alloc_code()
            room = Room(code=code, mode=mode, stage=stage, host=conn)
            self.rooms[code] = room
            conn.room_code = code
            conn.role = "host"
            await conn.send_json({
                "t": "room_created",
                "code": code,
                "mode": mode,
                "stage": stage,
                "role": "host",
            })
            return

        if t == "join_room":
            await self.leave_room(conn)
            code = str(msg.get("code", "")).strip()
            room = self.rooms.get(code)
            if not room:
                await conn.send_json({"t": "error", "msg": f"房间 {code} 不存在或已解散"})
                return
            if room.guest is not None:
                await conn.send_json({"t": "error", "msg": f"房间 {code} 已满（2/2）"})
                return
            conn.name = str(msg.get("name") or "蜀山同门")[:16]
            await self._pair_into_room(room, conn)
            return

        if t == "quick_match":
            await self.leave_room(conn)
            mode = "solo" if msg.get("mode") == "solo" else "coop"
            stage = max(1, min(3, int(msg.get("stage", 1))))
            conn.name = str(msg.get("name") or "蜀山侠客")[:16]
            # Find open room matching mode
            for r in list(self.rooms.values()):
                if r.mode == mode and r.guest is None and not r.host.closed:
                    await self._pair_into_room(r, conn)
                    return
            # Otherwise open a waiting room automatically
            code = self.alloc_code()
            room = Room(code=code, mode=mode, stage=stage, host=conn)
            self.rooms[code] = room
            conn.room_code = code
            conn.role = "host"
            await conn.send_json({
                "t": "room_created",
                "code": code,
                "mode": mode,
                "stage": stage,
                "role": "host",
                "quickMatch": True,
            })
            return

        if t == "leave_room":
            await self.leave_room(conn)
            await conn.send_json({"t": "left_room"})
            return

        # Relay real-time gameplay packets cleanly to room peer
        code = conn.room_code
        if not code:
            return
        room = self.rooms.get(code)
        if not room:
            return
        peer = room.peer_of(conn)
        if peer is None or peer.closed:
            return

        if t in ("state", "action", "enemy_sync", "enemy_hit", "pvp_hit", "stage_sync", "rematch", "revive", "chat"):
            msg["from"] = conn.role
            await peer.send_json(msg)

    async def _pair_into_room(self, room: Room, guest: WSConn) -> None:
        room.guest = guest
        room.started = True
        guest.room_code = room.code
        guest.role = "guest"
        self.total_matches += 1
        payload_common = {
            "t": "room_ready",
            "code": room.code,
            "mode": room.mode,
            "stage": room.stage,
            "hostName": room.host.name,
            "guestName": guest.name,
        }
        await room.host.send_json({**payload_common, "role": "host"})
        await guest.send_json({**payload_common, "role": "guest"})

    def stats(self) -> dict:
        return {
            "status": "ok",
            "service": "lixiaoyao-mp-ws",
            "uptimeSec": round(time.time() - self.started_at, 1),
            "connections": len(self.conns),
            "activeRooms": len(self.rooms),
            "totalMatches": self.total_matches,
        }


hub = RoomHub()
_seq = 0


async def handle_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    global _seq
    _seq += 1
    peer_id = f"p{_seq}"
    conn: Optional[WSConn] = None

    try:
        raw_req = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), timeout=10.0)
    except Exception:
        writer.close()
        return

    lines = raw_req.decode("latin-1", errors="replace").split("\r\n")
    if not lines:
        writer.close()
        return
    req_parts = lines[0].split(" ")
    path = req_parts[1] if len(req_parts) >= 2 else "/"

    headers: Dict[str, str] = {}
    for line in lines[1:]:
        if ":" in line:
            k, v = line.split(":", 1)
            headers[k.strip().lower()] = v.strip()

    # Plain HTTP health check endpoint
    if headers.get("upgrade", "").lower() != "websocket":
        body = json.dumps(hub.stats(), ensure_ascii=False).encode("utf-8")
        resp = (
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json; charset=utf-8\r\n"
            "Access-Control-Allow-Origin: *\r\n"
            f"Content-Length: {len(body)}\r\n"
            "Connection: close\r\n\r\n"
        ).encode("utf-8") + body
        writer.write(resp)
        await writer.drain()
        writer.close()
        return

    ws_key = headers.get("sec-websocket-key", "")
    if not ws_key:
        writer.write(b"HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n")
        await writer.drain()
        writer.close()
        return

    accept = base64.b64encode(hashlib.sha1((ws_key + WS_GUID).encode("ascii")).digest()).decode("ascii")
    handshake = (
        "HTTP/1.1 101 Switching Protocols\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Accept: {accept}\r\n\r\n"
    )
    writer.write(handshake.encode("ascii"))
    await writer.drain()

    conn = WSConn(reader, writer, peer_id)
    hub.conns.add(conn)
    await conn.send_json({"t": "welcome", "id": peer_id, "rooms": len(hub.rooms)})

    try:
        while not conn.closed:
            raw = await conn.recv_message()
            if raw is None:
                break
            try:
                msg = json.loads(raw)
                if isinstance(msg, dict):
                    await hub.handle_message(conn, msg)
            except json.JSONDecodeError:
                continue
    except WSClosed:
        pass
    except Exception:
        pass
    finally:
        await hub.leave_room(conn)
        hub.conns.discard(conn)
        await conn.close()


async def reaper_loop() -> None:
    while True:
        await asyncio.sleep(20)
        now = time.monotonic()
        for code, room in list(hub.rooms.items()):
            if room.host.closed or (now - room.host.last_seen > 180 and room.guest is None):
                await hub.leave_room(room.host)


def run_server() -> None:
    loop = asyncio.get_event_loop()
    server = loop.run_until_complete(asyncio.start_server(handle_client, HOST, PORT))
    loop.create_task(reaper_loop())
    print(f"[lixiaoyao-mp-ws] listening on {HOST}:{PORT}", flush=True)
    try:
        loop.run_forever()
    finally:
        server.close()
        loop.run_until_complete(server.wait_closed())
        loop.close()


if __name__ == "__main__":
    run_server()
