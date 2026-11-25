/// <reference types="vite/client" />

interface ThreeGameDiagnostics {
  frame: number;
  elapsed: number;
  score: number;
  targetScore: number;
  complete: boolean;
  player: {
    position: { x: number; y: number; z: number };
    speed: number;
  };
  renderer: {
    calls: number;
    triangles: number;
    geometries: number;
    textures: number;
  };
  canvas: {
    clientWidth: number;
    clientHeight: number;
    width: number;
    height: number;
    dpr: number;
  };
}

interface ThreeGameTestHooks {
  seed(value: number): void | Promise<void>;
  setState(name: string): { state: string } | Promise<{ state: string }>;
  setPausedForScreenshot(paused: boolean): void | Promise<void>;
  setReducedMotion(enabled: boolean): void | Promise<void>;
  hideDebugUi(hidden: boolean): void | Promise<void>;
}

interface GuizangDebugApi {
  step(n?: number, dt?: number): void;
  upd(n?: number, dt?: number): void;
  press(...codes: string[]): void;
  keys: Set<string>;
  pl(): Record<string, number | string>;
  enemies(): Array<Record<string, number | string>>;
  spawn(kind: 'bladesman' | 'caster' | 'elite' | 'boss', x?: number, z?: number): void;
  toBoss(): void;
  toStage(stage: number): void;
  stageNum(): number;
  wave(): number;
  totalStars(): number;
  openMap(chapterId?: 1 | 2 | 3 | 4): void;
  clearCurrentStage(): void;
  god(on?: boolean): void;
  mode(): string;
  stage(): string;
  peer(): Record<string, number | string | boolean> | null;
  mpCreate(mode: 'coop' | 'solo', stage?: number): Promise<void>;
  mpJoin(code: string): Promise<void>;
  mpRoom(): string;
}

interface Window {
  __THREE_GAME_DIAGNOSTICS__?: ThreeGameDiagnostics;
  __THREE_GAME_TEST_HOOKS__?: ThreeGameTestHooks;
  G?: GuizangDebugApi;
}
