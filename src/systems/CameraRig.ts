import * as THREE from 'three';
import { clamp, damp, easeInOutCubic } from '../utils/math';

interface CutsceneState {
  active: boolean;
  elapsed: number;
  duration: number;
  startPos: THREE.Vector3;
  startLook: THREE.Vector3;
  focusPos: THREE.Vector3;
  focusLook: THREE.Vector3;
}

/**
 * Xianxia Isometric-Oblique Action Camera Rig:
 * - Tight zoom lock (0.95 - 1.25x) so spatial judgment stays reliable
 * - Focus leash: pulls subtly toward Boss (max ~3.2m) while keeping Li Xiaoyao centered
 * - Smooth cutscene blend landing right on the exact gameplay camera pose before handoff
 * - Clamps camera Y above terrain height
 */
export class CameraRig {
  // Cinematic 3D Donghua action camera angle (~22.6 deg pitch): crisp floor combat clarity + Shushan sky/peaks/sword-array framing!
  private readonly baseOffset = new THREE.Vector3(0, 7.6, 13.8);
  private readonly currentPos = new THREE.Vector3(0, 7.6, 13.8);
  private readonly currentLook = new THREE.Vector3(0, 1.85, 0);
  private readonly targetLook = new THREE.Vector3();
  private readonly targetPos = new THREE.Vector3();

  private shakeTrauma = 0;
  private zoomFactor = 1.0;
  private followRamp = 1.0;

  private readonly cutscene: CutsceneState = {
    active: false,
    elapsed: 0,
    duration: 2.8,
    startPos: new THREE.Vector3(),
    startLook: new THREE.Vector3(),
    focusPos: new THREE.Vector3(),
    focusLook: new THREE.Vector3(),
  };

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  addShake(amount: number): void {
    this.shakeTrauma = clamp(this.shakeTrauma + amount, 0, 1.0);
  }

  setZoom(factor: number): void {
    this.zoomFactor = clamp(factor, 0.92, 1.24);
  }

  snapTo(heroPos: THREE.Vector3): void {
    this.currentLook.set(heroPos.x, 1.85, heroPos.z);
    this.currentPos.copy(this.currentLook).addScaledVector(this.baseOffset, this.zoomFactor);
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLook);
  }

  /** Dramatic Boss entrance camera pan that returns smoothly right to gameplay camera! */
  startCutscene(bossPos: THREE.Vector3, duration = 2.6): void {
    this.cutscene.active = true;
    this.cutscene.elapsed = 0;
    this.cutscene.duration = duration;
    this.cutscene.startPos.copy(this.currentPos);
    this.cutscene.startLook.copy(this.currentLook);
    this.cutscene.focusLook.set(bossPos.x, 2.0, bossPos.z);
    this.cutscene.focusPos.set(bossPos.x + 2.4, 4.6, bossPos.z + 7.2);
  }

  isCutsceneActive(): boolean {
    return this.cutscene.active;
  }

  /** Moonlit framing for title screen: places Li Xiaoyao & full uncropped Shushan Archway cleanly on left half. */
  updateTitleOrbit(heroPos: THREE.Vector3, elapsed: number): void {
    const a = Math.sin(elapsed * 0.22) * 0.16;
    const dist = 10.8;
    // Offset camera look slightly right so hero & grand archway sit cleanly left of the right-aligned title card
    this.currentLook.set(heroPos.x + 2.3, 2.2, heroPos.z - 4.2);
    this.currentPos.set(
      heroPos.x + 1.8 + Math.sin(a) * dist,
      4.4 + Math.sin(elapsed * 0.45) * 0.22,
      heroPos.z + Math.cos(a) * dist,
    );
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLook);
  }

  /** Wide Donghua 3D full-cast showcase framing all 4 heroes/bosses + Li Xiaoyao's full sword & jade aura cleanly! */
  updateShowcase(heroPos: THREE.Vector3, elapsed: number): void {
    const a = Math.sin(elapsed * 0.3) * 0.08;
    this.currentLook.set(heroPos.x, 1.48, heroPos.z - 0.1);
    this.currentPos.set(heroPos.x + Math.sin(a) * 6.2, 1.82, heroPos.z + Math.cos(a) * 6.2);
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLook);
  }

  updateGameplay(
    dt: number,
    elapsed: number,
    heroPos: THREE.Vector3,
    bossPos: THREE.Vector3 | null,
    mouseNdc: { x: number; y: number },
  ): void {
    // Compute exact desired gameplay look & position (elevated lookY reveals Shushan archway, floating peaks & sky sword array!)
    this.targetLook.set(heroPos.x, 1.85, heroPos.z);
    if (bossPos) {
      // Leash focus at most 3.0m toward Boss so Li Xiaoyao always stays near center
      const dx = bossPos.x - heroPos.x;
      const dz = bossPos.z - heroPos.z;
      const d = Math.hypot(dx, dz);
      const bias = Math.min(3.0, d * 0.24);
      if (d > 0.01) {
        this.targetLook.x += (dx / d) * bias;
        this.targetLook.z += (dz / d) * bias;
      }
    } else {
      // Very slight mouse lead (max 0.8m)
      this.targetLook.x += clamp(mouseNdc.x, -1, 1) * 0.75;
      this.targetLook.z -= clamp(mouseNdc.y, -1, 1) * 0.55;
    }

    const desiredZoom = bossPos ? 1.12 : this.zoomFactor;
    this.targetPos.copy(this.targetLook).addScaledVector(this.baseOffset, desiredZoom);

    if (this.cutscene.active) {
      this.cutscene.elapsed += dt;
      const p = clamp(this.cutscene.elapsed / this.cutscene.duration, 0, 1);
      if (p < 0.34) {
        const u = easeInOutCubic(p / 0.34);
        this.currentPos.lerpVectors(this.cutscene.startPos, this.cutscene.focusPos, u);
        this.currentLook.lerpVectors(this.cutscene.startLook, this.cutscene.focusLook, u);
      } else if (p < 0.72) {
        // Hold dramatic view with subtle drift
        const drift = (p - 0.34) * 1.4;
        this.currentPos.set(
          this.cutscene.focusPos.x - drift * 1.6,
          this.cutscene.focusPos.y + drift * 0.35,
          this.cutscene.focusPos.z,
        );
        this.currentLook.copy(this.cutscene.focusLook);
      } else {
        // Return directly onto live gameplay camera target so zero jump-cut occurs on handoff
        const u = easeInOutCubic((p - 0.72) / 0.28);
        this.currentPos.lerpVectors(this.cutscene.focusPos, this.targetPos, u);
        this.currentLook.lerpVectors(this.cutscene.focusLook, this.targetLook, u);
      }
      if (p >= 1) {
        this.cutscene.active = false;
        this.followRamp = 0.25;
      }
    } else {
      this.followRamp = Math.min(1, this.followRamp + dt * 1.8);
      const lambda = 7.5 * this.followRamp;
      this.currentPos.x = damp(this.currentPos.x, this.targetPos.x, lambda, dt);
      this.currentPos.y = damp(this.currentPos.y, this.targetPos.y, lambda, dt);
      this.currentPos.z = damp(this.currentPos.z, this.targetPos.z, lambda, dt);
      this.currentLook.x = damp(this.currentLook.x, this.targetLook.x, lambda * 1.15, dt);
      this.currentLook.y = damp(this.currentLook.y, this.targetLook.y, lambda * 1.15, dt);
      this.currentLook.z = damp(this.currentLook.z, this.targetLook.z, lambda * 1.15, dt);
    }

    // Clamp camera well above ground level
    this.currentPos.y = Math.max(2.2, this.currentPos.y);

    // Trauma-squared screen shake
    let sx = 0;
    let sy = 0;
    if (this.shakeTrauma > 0.001) {
      const mag = this.shakeTrauma * this.shakeTrauma * 0.42;
      sx = Math.sin(elapsed * 67.3) * mag;
      sy = Math.cos(elapsed * 81.9) * mag * 0.75;
      this.shakeTrauma = Math.max(0, this.shakeTrauma - dt * 2.8);
    }

    this.camera.position.set(this.currentPos.x + sx, this.currentPos.y + sy, this.currentPos.z);
    this.camera.lookAt(this.currentLook);
  }
}
