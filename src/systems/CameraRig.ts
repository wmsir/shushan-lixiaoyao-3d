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
  // Elevated oblique action camera angle (~30 deg pitch): crisp floor combat clarity over pillars/bridges + Shushan sky framing
  private readonly baseOffset = new THREE.Vector3(0, 9.4, 13.4);
  private readonly currentPos = new THREE.Vector3(0, 9.4, 13.4);
  private readonly currentLook = new THREE.Vector3(0, 1.65, 0);
  private readonly targetLook = new THREE.Vector3();
  private readonly targetPos = new THREE.Vector3();

  private shakeTrauma = 0;
  private zoomFactor = 1.0;
  private followRamp = 1.0;
  private prevHeroZ: number | null = null;
  private forwardZBias = -0.85;

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
    this.zoomFactor = clamp(factor, 0.92, 1.32);
  }

  snapTo(heroPos: THREE.Vector3): void {
    this.prevHeroZ = heroPos.z;
    this.forwardZBias = -0.85;
    this.currentLook.set(heroPos.x, 1.65, heroPos.z + this.forwardZBias);
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

  /**
   * Moonlit front-facing title lobby framing:
   * - Portrait: frames front-facing Li Xiaoyao in the unobstructed upper-center window above the bottom dock.
   * - Landscape / Desktop: frames Li Xiaoyao cleanly in the left 46% showcase pane beside the right lobby panel.
   */
  updateTitleOrbit(heroPos: THREE.Vector3, elapsed: number, isPortrait = false): void {
    const aspect = Math.max(0.35, this.camera.aspect || (isPortrait ? 390 / 844 : 16 / 9));
    const portraitView = isPortrait || aspect < 0.92;
    const sway = Math.sin(elapsed * 0.28) * 0.14;

    if (portraitView) {
      const dist = 4.35;
      const lookY = heroPos.y + 0.58;
      const camY = heroPos.y + 1.65 + Math.sin(elapsed * 0.48) * 0.05;
      this.currentLook.set(heroPos.x, lookY, heroPos.z);
      this.currentPos.set(
        heroPos.x + Math.sin(sway) * dist,
        camY,
        heroPos.z + Math.cos(sway) * dist,
      );
    } else {
      const dist = 4.85;
      const lookY = heroPos.y + 1.06;
      const camY = heroPos.y + 1.50 + Math.sin(elapsed * 0.45) * 0.05;
      const fovRad = THREE.MathUtils.degToRad(this.camera.fov || 40);
      const actualDist = Math.hypot(dist, camY - lookY);
      const halfH = actualDist * Math.tan(fovRad * 0.5);
      const halfW = halfH * aspect;
      const leftZoneRatio = aspect > 1.85 ? 0.46 : 0.50;
      const targetNdcX = clamp(leftZoneRatio - 1, -0.64, -0.42);
      const rightShift = Math.abs(targetNdcX) * halfW;

      const rightX = Math.cos(sway);
      const rightZ = -Math.sin(sway);
      const lookX = heroPos.x + rightX * rightShift;
      const lookZ = heroPos.z + rightZ * rightShift;
      const camX = lookX + Math.sin(sway) * dist;
      const camZ = lookZ + Math.cos(sway) * dist;

      this.currentLook.set(lookX, lookY, lookZ);
      this.currentPos.set(camX, camY, camZ);
    }

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

  /**
   * Honor-of-Kings 360° Turntable + Face Close-Up Zoom Dressing-Room Camera:
   * - At yawOffset = 0, camera sits directly in front of the Hero's face.
   * - zoomFactor (0..1) smoothly transitions between Full-Body Showcase and Head/Face Portrait Close-Up.
   * - pitchOffset (-0.28..0.34 rad) tilts camera elevation while keeping camY >= 0.45.
   * - Shifts lookAt + camPos along camera +right so Hero stays dead-center in the LEFT 44% pane at all zooms & 360° angles.
   */
  updateShopPreview(
    heroPos: THREE.Vector3,
    heroYaw: number,
    yawOffset: number,
    isPortrait: boolean,
    leftPanelRatio?: number,
    pitchOffset = 0,
    zoomFactor = 0,
  ): void {
    const aspect = Math.max(0.35, this.camera.aspect || (isPortrait ? 390 / 844 : 844 / 390));
    const portraitView = isPortrait || aspect < 1;
    const panelRatio = leftPanelRatio ?? (portraitView ? 0.44 : aspect > 1.9 ? 0.44 : 0.47);
    const zT = clamp(zoomFactor, 0, 1);

    const fullDist = portraitView
      ? clamp(1.83 / Math.max(0.43, aspect), 3.85, 4.15)
      : aspect > 1.9
        ? 3.62
        : 3.58;
    const closeDist = portraitView ? 1.50 : 1.38;
    const dist = fullDist + (closeDist - fullDist) * zT;

    const lookY = heroPos.y + 0.94 + (1.48 - 0.94) * zT;
    const clampedPitch = clamp(pitchOffset, -0.28, 0.34);
    const basePitch = 0.085 * (1 - zT) + 0.02 * zT;
    const pitch = clamp(basePitch + clampedPitch, -0.28, 0.44);

    const horizDist = dist * Math.cos(pitch);
    const camY = Math.max(0.45, heroPos.y + 0.45, lookY + dist * Math.sin(pitch));
    const actualDist = Math.hypot(horizDist, camY - lookY);

    const fovRad = THREE.MathUtils.degToRad(this.camera.fov || 40);
    const halfH = actualDist * Math.tan(fovRad * 0.5);
    const halfW = halfH * aspect;

    // Desired NDC X for the center of the left pane: 2 * (panelRatio / 2) - 1 = panelRatio - 1 (e.g. -0.56 for 44%)
    const targetNdcX = clamp(panelRatio - 1, -0.72, -0.35);
    const rightShift = Math.abs(targetNdcX) * halfW;

    const orbitYaw = heroYaw + yawOffset;
    const rightX = Math.cos(orbitYaw);
    const rightZ = -Math.sin(orbitYaw);

    // Shift both camera and lookAt along +right so the hero projects cleanly onto targetNdcX at full-body & close-up
    const lookX = heroPos.x + rightX * rightShift;
    const lookZ = heroPos.z + rightZ * rightShift;
    const camX = lookX + Math.sin(orbitYaw) * horizDist;
    const camZ = lookZ + Math.cos(orbitYaw) * horizDist;

    this.currentPos.set(camX, camY, camZ);
    this.currentLook.set(lookX, lookY, lookZ);
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
    // Track forward -Z canyon crossing movement to bias camera sightline ahead over pillars/bridges
    let desiredForwardBias = -0.75;
    if (this.prevHeroZ !== null && dt > 1e-4) {
      const vz = (heroPos.z - this.prevHeroZ) / dt;
      if (vz < -0.4) desiredForwardBias = -1.25;
      else if (vz > 0.4) desiredForwardBias = -0.5;
    }
    this.prevHeroZ = heroPos.z;
    this.forwardZBias = damp(this.forwardZBias, desiredForwardBias, 5.0, dt);

    // Compute exact desired gameplay look & position (elevated pitch + targetLook.y = 1.65 keeps bridges/crossings clear)
    this.targetLook.set(heroPos.x, 1.65, heroPos.z);
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
      this.targetLook.z += this.forwardZBias * 0.4;
    } else {
      // Slight forward -Z bias toward canyon crossings + gentle mouse lead
      this.targetLook.x += clamp(mouseNdc.x, -1, 1) * 0.75;
      this.targetLook.z += this.forwardZBias - clamp(mouseNdc.y, -1, 1) * 0.55;
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
