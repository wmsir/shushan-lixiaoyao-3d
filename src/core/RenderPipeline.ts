import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export interface SceneRenderStats {
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

export class RenderPipeline {
  readonly renderer: THREE.WebGLRenderer;
  readonly composer: EffectComposer;
  readonly bloomPass: UnrealBloomPass;
  private readonly renderPass: RenderPass;
  private readonly outputPass: OutputPass;
  private userMaxDpr: number | null = null;
  private adaptiveDprScale = 1.0;
  private emaDt = 1 / 60;
  private adaptCooldown = 0;
  private bloomEnabled = true;
  private lastAppliedDpr = 0;
  private lastClientWidth = 0;
  private lastClientHeight = 0;
  private disposed = false;
  private lastSceneCalls = 0;
  private lastSceneTriangles = 0;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const w = Math.max(1, canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, canvas.clientHeight || window.innerHeight);

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    // Tuned HDR bloom (threshold 1.18, strength 0.24, radius 0.32): crisp gold/jade/crimson VFX & Legend pillars without blowing out skin, stone, or UI
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.24, 0.32, 1.18);
    this.composer.addPass(this.bloomPass);
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    this.resize(true);
  }

  setBloomEnabled(enabled: boolean): void {
    this.bloomEnabled = enabled;
    this.bloomPass.enabled = enabled;
  }

  setExposure(exposure: number): void {
    this.renderer.toneMappingExposure = exposure;
  }

  setMaxDpr(dpr: number): void {
    this.userMaxDpr = Math.max(0.75, Math.min(2.0, dpr));
    this.resize(true);
  }

  private isMobileOrCoarseViewport(width: number, height: number): boolean {
    const coarsePointer =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;
    return coarsePointer || width < 768 || Math.min(width, height) < 540;
  }

  /** Dynamically scales render DPR based on smoothed frame time to sustain 60fps on mobile/APK. */
  tickAdaptiveDpr(rawDt: number, active: boolean): void {
    if (!active || this.disposed) return;
    const clampedDt = Math.min(0.08, Math.max(0.004, rawDt));
    this.emaDt = this.emaDt * 0.9 + clampedDt * 0.1;
    if (this.adaptCooldown > 0) {
      this.adaptCooldown -= clampedDt;
      return;
    }
    if (this.emaDt > 0.028 && this.adaptiveDprScale > 0.72) {
      this.adaptiveDprScale = Math.max(0.72, Number((this.adaptiveDprScale - 0.1).toFixed(2)));
      this.adaptCooldown = 6.0;
      this.resize(true);
    } else if (this.emaDt < 0.015 && this.adaptiveDprScale < 1.0) {
      this.adaptiveDprScale = Math.min(1.0, Number((this.adaptiveDprScale + 0.05).toFixed(2)));
      this.adaptCooldown = 6.0;
      this.resize(true);
    }
  }

  resize(force = false): boolean {
    if (this.disposed) return false;
    const canvas = this.renderer.domElement;
    const width = Math.max(1, Math.floor(canvas.clientWidth || window.innerWidth));
    const height = Math.max(1, Math.floor(canvas.clientHeight || window.innerHeight));

    const isMobile = this.isMobileOrCoarseViewport(width, height);
    const hardCap = isMobile ? 1.75 : 2.0;
    const effectiveMaxDpr =
      this.userMaxDpr !== null ? Math.min(this.userMaxDpr, hardCap) : hardCap;
    const pixelBudget = isMobile ? 1_150_000 : 2_600_000;
    const budgetDpr = Math.sqrt(pixelBudget / (width * height));
    const baseDpr = Math.min(window.devicePixelRatio || 1, effectiveMaxDpr, budgetDpr);
    const dpr = Math.max(0.75, Math.min(hardCap, baseDpr * this.adaptiveDprScale));

    const needsResize =
      force ||
      width !== this.lastClientWidth ||
      height !== this.lastClientHeight ||
      Math.abs(this.lastAppliedDpr - dpr) > 0.015;

    if (needsResize) {
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(width, height, false);
      this.composer.setSize(width, height);
      this.composer.setPixelRatio(dpr);
      this.lastAppliedDpr = dpr;
      this.lastClientWidth = width;
      this.lastClientHeight = height;
      this.camera.aspect = width / height;
      this.camera.fov = width / height < 0.85 ? 50 : 40;
      this.camera.updateProjectionMatrix();
    }
    return needsResize;
  }

  render(): void {
    if (this.disposed) return;
    if (this.bloomEnabled) {
      // Accumulate real scene + post draw calls across composer passes instead of letting OutputPass overwrite to 1
      this.renderer.info.autoReset = false;
      this.renderer.info.reset();
      this.composer.render();
      this.lastSceneCalls = this.renderer.info.render.calls;
      this.lastSceneTriangles = this.renderer.info.render.triangles;
      this.renderer.info.autoReset = true;
    } else {
      this.renderer.render(this.scene, this.camera);
      this.lastSceneCalls = this.renderer.info.render.calls;
      this.lastSceneTriangles = this.renderer.info.render.triangles;
    }
  }

  getStats(): SceneRenderStats {
    return {
      calls: this.lastSceneCalls,
      triangles: this.lastSceneTriangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.renderPass.dispose();
    this.bloomPass.dispose();
    this.outputPass.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
