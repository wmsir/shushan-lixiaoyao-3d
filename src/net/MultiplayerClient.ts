/**
 * Real-time WebSocket Multiplayer Client for 《仙剑 · 锁妖剑台》
 * Supports:
 * - Co-op (双人组队刷怪): Host runs authoritative enemies, Guest syncs attacks/skills/hits
 * - Solo (双人联网单挑 1v1): Real-time PvP sword duel on 锁妖剑台
 */

export type MpMode = 'offline' | 'coop' | 'solo';
export type MpRole = 'host' | 'guest';

export interface PeerTransformPacket {
  t: 'state';
  x: number;
  z: number;
  yaw: number;
  hp: number;
  maxHp: number;
  spirit: number;
  ult: number;
  state: string;
  pose: string;
  combo: number;
  blocking: boolean;
  dead: boolean;
}

export interface EnemyNetSnapshot {
  id: number;
  kind: string;
  x: number;
  z: number;
  yaw: number;
  hp: number;
  maxHp: number;
  poise: number;
  maxPoise: number;
  aiState: string;
  phase: 1 | 2;
  moveKind: string;
}

export interface MpCallbacks {
  onStatus: (text: string, connected: boolean) => void;
  onRoomCreated: (code: string, mode: 'coop' | 'solo', stage: number, quickMatch?: boolean) => void;
  onRoomReady: (info: {
    code: string;
    mode: 'coop' | 'solo';
    stage: number;
    role: MpRole;
    hostName: string;
    guestName: string;
  }) => void;
  onPeerState: (pkt: PeerTransformPacket) => void;
  onPeerAction: (pkt: Record<string, unknown>) => void;
  onEnemySync: (enemies: EnemyNetSnapshot[], stageNum: number) => void;
  onEnemyHitFromGuest: (pkt: { enemyId: number; damage: number; poise: number; heavy: boolean; skill?: string }) => void;
  onPvpHit: (pkt: { damage: number; poise: number; heavy: boolean; knockX: number; knockZ: number; skill?: string }) => void;
  onStageSync: (stageNum: number, bossIntro: boolean) => void;
  onPeerRevive: () => void;
  onRematch: () => void;
  onPeerLeft: (reason: string) => void;
  onError: (msg: string) => void;
}

export function resolveDefaultWsUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const override = params.get('ws');
  if (override) return override;

  const host = window.location.hostname;
  if (host === 'fwpt.cn' || host === 'www.fwpt.cn') {
    return 'wss://fwpt.cn/lixiaoyao/ws';
  }
  // Inside Capacitor Android WebView or file:// offline single HTML -> connect to live fwpt.cn server
  if (window.location.protocol === 'file:' || window.location.protocol === 'capacitor:' || host === 'localhost') {
    // Allow local dev override if localhost runs local mp_server, otherwise default to fwpt.cn production WS
    if (params.has('localws')) return 'ws://127.0.0.1:18099';
    return 'wss://fwpt.cn/lixiaoyao/ws';
  }
  return 'wss://fwpt.cn/lixiaoyao/ws';
}

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private pingTimer = 0;
  private rttMs = 0;
  private url: string;

  mode: MpMode = 'offline';
  role: MpRole = 'host';
  roomCode = '';
  peerConnected = false;

  constructor(private readonly cb: MpCallbacks) {
    this.url = resolveDefaultWsUrl();
  }

  getPingMs(): number {
    return this.rttMs;
  }

  isOnline(): boolean {
    return this.mode !== 'offline' && this.ws?.readyState === WebSocket.OPEN;
  }

  private ensureConnected(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    this.closeSocketOnly();

    return new Promise((resolve, reject) => {
      this.cb.onStatus('正在连接蜀山联机阁...', false);
      let settled = false;
      const ws = new WebSocket(this.url);
      this.ws = ws;

      const timer = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          try {
            ws.close();
          } catch {
            // ignore
          }
          const err = new Error('连接联机服务器超时');
          this.cb.onError(err.message);
          reject(err);
        }
      }, 8000);

      ws.onopen = () => {
        window.clearTimeout(timer);
        if (!settled) {
          settled = true;
          this.cb.onStatus('已连通联机阁', true);
          this.startHeartbeat();
          resolve();
        }
      };

      ws.onerror = () => {
        window.clearTimeout(timer);
        if (!settled) {
          settled = true;
          const err = new Error('无法连接联机服务器，请检查网络');
          this.cb.onError(err.message);
          reject(err);
        }
      };

      ws.onclose = () => {
        window.clearTimeout(timer);
        this.stopHeartbeat();
        if (this.mode !== 'offline') {
          this.peerConnected = false;
          this.cb.onStatus('联机连接已断开', false);
        }
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
          this.handleMessage(msg);
        } catch {
          // ignore malformed frame
        }
      };
    });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingTimer = window.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.sendRaw({ t: 'ping', ts: performance.now() });
      }
    }, 4000);
  }

  private stopHeartbeat(): void {
    if (this.pingTimer) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = 0;
    }
  }

  private handleMessage(msg: Record<string, unknown>): void {
    const t = String(msg.t || '');
    if (t === 'pong') {
      const ts = Number(msg.ts || 0);
      if (ts > 0) this.rttMs = Math.max(1, Math.round(performance.now() - ts));
      return;
    }
    if (t === 'room_created') {
      this.roomCode = String(msg.code || '');
      this.mode = msg.mode === 'solo' ? 'solo' : 'coop';
      this.role = 'host';
      this.peerConnected = false;
      this.cb.onRoomCreated(this.roomCode, this.mode, Number(msg.stage || 1), Boolean(msg.quickMatch));
      return;
    }
    if (t === 'room_ready') {
      this.roomCode = String(msg.code || '');
      this.mode = msg.mode === 'solo' ? 'solo' : 'coop';
      this.role = msg.role === 'guest' ? 'guest' : 'host';
      this.peerConnected = true;
      this.cb.onRoomReady({
        code: this.roomCode,
        mode: this.mode,
        stage: Number(msg.stage || 1),
        role: this.role,
        hostName: String(msg.hostName || '李逍遥'),
        guestName: String(msg.guestName || '玄影剑侠'),
      });
      return;
    }
    if (t === 'state') {
      this.cb.onPeerState(msg as unknown as PeerTransformPacket);
      return;
    }
    if (t === 'action') {
      this.cb.onPeerAction(msg);
      return;
    }
    if (t === 'enemy_sync') {
      this.cb.onEnemySync((msg.enemies as EnemyNetSnapshot[]) || [], Number(msg.stageNum || 1));
      return;
    }
    if (t === 'enemy_hit') {
      this.cb.onEnemyHitFromGuest({
        enemyId: Number(msg.enemyId || 0),
        damage: Number(msg.damage || 0),
        poise: Number(msg.poise || 0),
        heavy: Boolean(msg.heavy),
        skill: typeof msg.skill === 'string' ? msg.skill : undefined,
      });
      return;
    }
    if (t === 'pvp_hit') {
      this.cb.onPvpHit({
        damage: Number(msg.damage || 0),
        poise: Number(msg.poise || 0),
        heavy: Boolean(msg.heavy),
        knockX: Number(msg.knockX || 0),
        knockZ: Number(msg.knockZ || 0),
        skill: typeof msg.skill === 'string' ? msg.skill : undefined,
      });
      return;
    }
    if (t === 'stage_sync') {
      this.cb.onStageSync(Number(msg.stageNum || 1), Boolean(msg.bossIntro));
      return;
    }
    if (t === 'revive') {
      this.cb.onPeerRevive();
      return;
    }
    if (t === 'rematch') {
      this.cb.onRematch();
      return;
    }
    if (t === 'peer_left') {
      this.peerConnected = false;
      this.cb.onPeerLeft(String(msg.reason || '对方已离开'));
      return;
    }
    if (t === 'error') {
      this.cb.onError(String(msg.msg || '联机操作失败'));
    }
  }

  async createRoom(mode: 'coop' | 'solo', stage: number, name = '李逍遥'): Promise<void> {
    await this.ensureConnected();
    this.sendRaw({ t: 'create_room', mode, stage, name });
  }

  async joinRoom(code: string, name = '玄影剑侠'): Promise<void> {
    await this.ensureConnected();
    this.sendRaw({ t: 'join_room', code: code.trim(), name });
  }

  async quickMatch(mode: 'coop' | 'solo', stage: number, name = '蜀山侠客'): Promise<void> {
    await this.ensureConnected();
    this.sendRaw({ t: 'quick_match', mode, stage, name });
  }

  leave(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendRaw({ t: 'leave_room' });
    }
    this.mode = 'offline';
    this.roomCode = '';
    this.peerConnected = false;
  }

  sendRaw(payload: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  sendPlayerState(pkt: Omit<PeerTransformPacket, 't'>): void {
    if (!this.peerConnected) return;
    this.sendRaw({ t: 'state', ...pkt });
  }

  sendAction(kind: string, extra: Record<string, unknown> = {}): void {
    if (!this.peerConnected) return;
    this.sendRaw({ t: 'action', kind, ...extra });
  }

  sendEnemySync(enemies: EnemyNetSnapshot[], stageNum: number): void {
    if (!this.peerConnected || this.role !== 'host') return;
    this.sendRaw({ t: 'enemy_sync', enemies, stageNum });
  }

  sendEnemyHit(enemyId: number, damage: number, poise: number, heavy: boolean, skill?: string): void {
    if (!this.peerConnected) return;
    this.sendRaw({ t: 'enemy_hit', enemyId, damage, poise, heavy, skill });
  }

  sendPvpHit(damage: number, poise: number, heavy: boolean, knockX: number, knockZ: number, skill?: string): void {
    if (!this.peerConnected || this.mode !== 'solo') return;
    this.sendRaw({ t: 'pvp_hit', damage, poise, heavy, knockX, knockZ, skill });
  }

  sendStageSync(stageNum: number, bossIntro: boolean): void {
    if (!this.peerConnected || this.role !== 'host') return;
    this.sendRaw({ t: 'stage_sync', stageNum, bossIntro });
  }

  sendRevive(): void {
    if (!this.peerConnected) return;
    this.sendRaw({ t: 'revive' });
  }

  sendRematch(): void {
    if (!this.peerConnected) return;
    this.sendRaw({ t: 'rematch' });
  }

  private closeSocketOnly(): void {
    this.stopHeartbeat();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }

  dispose(): void {
    this.leave();
    this.closeSocketOnly();
  }
}
