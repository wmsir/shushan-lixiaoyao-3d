import * as THREE from 'three';
import { clamp, damp } from '../utils/math';

export type MountMode = 'none' | 'horse' | 'sword';

interface HorseLegRig {
  hip: THREE.Group;
  knee: THREE.Group;
  phase: number;
  side: -1 | 1;
}

/**
 * Dual-mode mount rig for Li Xiaoyao:
 * 1) 'horse': 3D sculpted Xianxia warhorse 「踏雪赤兔驹」 with articulated 4-leg gallop cycle, saddle & flowing tail
 * 2) 'sword': 3.0m forged spirit-sword 「青霄御剑」 hovering at y ≈ 1.85m with banking roll & rotating taiji halo
 */
export class MountRig {
  readonly root = new THREE.Group();
  private readonly horseGroup = new THREE.Group();
  private readonly swordGroup = new THREE.Group();

  private readonly horseBody = new THREE.Group();
  private readonly horseNeck = new THREE.Group();
  private readonly horseTail = new THREE.Group();
  private readonly horseLegs: HorseLegRig[] = [];

  private readonly swordBladeGroup = new THREE.Group();
  private readonly swordHaloRing: THREE.Mesh;
  private readonly swordWindMats: THREE.MeshBasicMaterial[] = [];

  private mode: MountMode = 'none';
  private gallopCycle = 0;
  private bankRoll = 0;
  private bankPitch = 0;

  constructor() {
    this.root.visible = false;
    this.buildHorse();
    this.swordHaloRing = this.buildFlyingSword();
    this.horseGroup.visible = false;
    this.swordGroup.visible = false;
    this.root.add(this.horseGroup, this.swordGroup);
  }

  private buildHorse(): void {
    const coatMat = new THREE.MeshStandardMaterial({
      color: '#6d251b',
      roughness: 0.56,
      metalness: 0.08,
    });
    const whiteSockMat = new THREE.MeshStandardMaterial({
      color: '#e8e4dc',
      roughness: 0.64,
    });
    const maneMat = new THREE.MeshStandardMaterial({
      color: '#f0ece4',
      roughness: 0.72,
    });
    const saddleMat = new THREE.MeshStandardMaterial({
      color: '#251a18',
      roughness: 0.68,
      metalness: 0.14,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: '#dfc075',
      emissive: new THREE.Color('#5a3e10'),
      emissiveIntensity: 0.25,
      roughness: 0.28,
      metalness: 0.86,
    });
    const clothMat = new THREE.MeshStandardMaterial({
      color: '#8f2428',
      roughness: 0.78,
      side: THREE.DoubleSide,
    });
    const hoofMat = new THREE.MeshStandardMaterial({
      color: '#18181c',
      roughness: 0.45,
      metalness: 0.35,
    });

    // Ground contact shadow
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.12, 24),
      new THREE.MeshBasicMaterial({
        color: '#05080e',
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(0.75, 1.38, 1);
    shadow.position.y = 0.03;
    this.horseGroup.add(shadow);

    this.horseBody.position.set(0, 1.04, 0);
    this.horseGroup.add(this.horseBody);

    // Sculpted barrel torso + chest + hindquarters
    const barrel = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.92, 8, 16), coatMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.scale.set(0.92, 1.0, 1.06);
    barrel.castShadow = true;

    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), coatMat);
    chest.scale.set(0.9, 1.05, 1.08);
    chest.position.set(0, 0.04, 0.48);
    chest.castShadow = true;

    const croup = new THREE.Mesh(new THREE.SphereGeometry(0.33, 14, 12), coatMat);
    croup.scale.set(0.92, 1.02, 1.08);
    croup.position.set(0, 0.03, -0.48);
    croup.castShadow = true;

    // Armored barding breastplate + saddle + crimson saddlecloth
    const breastArmor = new THREE.Mesh(new THREE.SphereGeometry(0.355, 12, 10, 0, Math.PI * 2, 0.4, 1.45), goldMat);
    breastArmor.position.set(0, 0.04, 0.51);
    breastArmor.rotation.x = Math.PI * 0.36;

    const saddleCloth = new THREE.Mesh(new THREE.CylinderGeometry(0.355, 0.37, 0.58, 14, 1, true, -1.9, 3.8), clothMat);
    saddleCloth.rotation.z = Math.PI / 2;
    saddleCloth.rotation.y = Math.PI / 2;
    saddleCloth.position.set(0, 0.06, -0.02);

    const saddleSeat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.54), saddleMat);
    saddleSeat.position.set(0, 0.33, -0.02);
    const pommel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.16, 10), goldMat);
    pommel.position.set(0, 0.41, 0.2);
    const cantle = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.09), goldMat);
    cantle.position.set(0, 0.4, -0.27);
    this.horseBody.add(barrel, chest, croup, breastArmor, saddleCloth, saddleSeat, pommel, cantle);

    // Arched Neck + Head + Bridle + Flowing Mane
    this.horseNeck.position.set(0, 0.18, 0.54);
    this.horseBody.add(this.horseNeck);

    const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 0.72, 12), coatMat);
    neckMesh.position.set(0, 0.28, 0.14);
    neckMesh.rotation.x = 0.52;
    neckMesh.castShadow = true;
    this.horseNeck.add(neckMesh);

    for (let m = 0; m < 5; m++) {
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.24, 6), maneMat);
      tuft.position.set(0, 0.12 + m * 0.11, -0.02 + m * 0.065);
      tuft.rotation.x = -0.75;
      this.horseNeck.add(tuft);
    }

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.46), coatMat);
    head.position.set(0, 0.56, 0.42);
    head.rotation.x = 0.42;
    head.castShadow = true;
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.095, 0.24, 10), coatMat);
    muzzle.position.set(0, 0.44, 0.63);
    muzzle.rotation.x = Math.PI * 0.62;
    const bridle = new THREE.Mesh(new THREE.TorusGeometry(0.098, 0.015, 6, 14), goldMat);
    bridle.position.set(0, 0.49, 0.55);
    bridle.rotation.x = 0.42;
    for (const sx of [-0.065, 0.065]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.11, 6), coatMat);
      ear.position.set(sx, 0.72, 0.28);
      ear.rotation.x = 0.2;
      this.horseNeck.add(ear);
    }
    this.horseNeck.add(head, muzzle, bridle);

    // Flowing silver-white tail
    this.horseTail.position.set(0, 0.16, -0.74);
    this.horseBody.add(this.horseTail);
    const tailUpper = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.46, 8), maneMat);
    tailUpper.position.set(0, -0.18, -0.1);
    tailUpper.rotation.x = -0.45;
    const tailTip = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.42, 8), maneMat);
    tailTip.position.set(0, -0.46, -0.22);
    tailTip.rotation.x = -0.28;
    this.horseTail.add(tailUpper, tailTip);

    // 4 Articulated Legs (diagonal trot/gallop phase offsets)
    const legSpecs: Array<{ x: number; z: number; phase: number; side: -1 | 1 }> = [
      { x: -0.2, z: 0.48, phase: 0, side: -1 },
      { x: 0.2, z: 0.48, phase: Math.PI, side: 1 },
      { x: -0.2, z: -0.48, phase: Math.PI * 0.85, side: -1 },
      { x: 0.2, z: -0.48, phase: -0.15, side: 1 },
    ];
    for (const spec of legSpecs) {
      const hip = new THREE.Group();
      hip.position.set(spec.x, -0.12, spec.z);
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.066, 0.46, 8), coatMat);
      upper.position.y = -0.22;
      upper.castShadow = true;
      hip.add(upper);

      const knee = new THREE.Group();
      knee.position.set(0, -0.44, 0);
      const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.048, 0.42, 8), whiteSockMat);
      lower.position.y = -0.2;
      lower.castShadow = true;
      const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.064, 0.09, 8), hoofMat);
      hoof.position.y = -0.42;
      knee.add(lower, hoof);
      hip.add(knee);

      this.horseBody.add(hip);
      this.horseLegs.push({ hip, knee, phase: spec.phase, side: spec.side });
    }
  }

  private buildFlyingSword(): THREE.Mesh {
    const steelMat = new THREE.MeshPhysicalMaterial({
      color: '#dcebf4',
      emissive: new THREE.Color('#1d6e84'),
      emissiveIntensity: 0.32,
      roughness: 0.2,
      metalness: 0.9,
      clearcoat: 0.6,
    });
    const fullerMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.55, 2.25, 2.35),
    });
    const bronzeMat = new THREE.MeshStandardMaterial({
      color: '#e0bc66',
      emissive: new THREE.Color('#5a3e10'),
      emissiveIntensity: 0.35,
      roughness: 0.28,
      metalness: 0.88,
    });

    this.swordBladeGroup.position.set(0, 1.82, 0);
    this.swordGroup.add(this.swordBladeGroup);

    // Broad forged 3.0m Xianxia flying sword oriented along +Z
    const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.19, 2.35, 4), steelMat);
    blade.scale.set(1.25, 1.0, 0.22);
    blade.rotation.set(Math.PI / 2, Math.PI / 4, 0);
    blade.position.z = 0.55;
    blade.castShadow = true;

    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.65, 4), steelMat);
    tip.scale.set(1.25, 1.0, 0.22);
    tip.rotation.set(Math.PI / 2, Math.PI / 4, 0);
    tip.position.z = 1.98;

    const fuller = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.045, 2.1, 4), fullerMat);
    fuller.scale.set(1.0, 1.0, 0.4);
    fuller.rotation.set(Math.PI / 2, Math.PI / 4, 0);
    fuller.position.set(0, 0.02, 0.55);

    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.07, 0.16), bronzeMat);
    guard.position.z = -0.62;
    const guardCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), fullerMat);
    guardCore.position.z = -0.62;
    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.48, 8), bronzeMat);
    hilt.rotation.x = Math.PI / 2;
    hilt.position.z = -0.92;

    // Rotating tail taiji ring
    const haloRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.026, 8, 28),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0.45, 2.0, 2.15),
        transparent: true,
        opacity: 0.72,
      }),
    );
    haloRing.position.z = -1.1;
    this.swordBladeGroup.add(blade, tip, fuller, guard, guardCore, hilt, haloRing);

    // Twin cyan wind-stream wake cones along flanks
    for (const sx of [-0.32, 0.32]) {
      const windMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(0.42, 1.9, 2.2),
        transparent: true,
        opacity: 0.34,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const wake = new THREE.Mesh(new THREE.ConeGeometry(0.14, 2.4, 8, 1, true), windMat);
      wake.rotation.x = -Math.PI / 2;
      wake.position.set(sx, 0.02, -1.15);
      this.swordBladeGroup.add(wake);
      this.swordWindMats.push(windMat);
    }

    // Subtle ground shadow ring beneath flying sword
    const shadow = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.92, 24),
      new THREE.MeshBasicMaterial({
        color: '#4cd9d0',
        transparent: true,
        opacity: 0.24,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.05;
    this.swordGroup.add(shadow);

    return haloRing;
  }

  getMode(): MountMode {
    return this.mode;
  }

  setMode(mode: MountMode): void {
    this.mode = mode;
    this.root.visible = mode !== 'none';
    this.horseGroup.visible = mode === 'horse';
    this.swordGroup.visible = mode === 'sword';
    if (mode === 'none') {
      this.bankRoll = 0;
      this.bankPitch = 0;
    }
  }

  update(dt: number, elapsed: number, speed: number, turnRate: number): { heroY: number; heroPitch: number } {
    if (this.mode === 'none') {
      return { heroY: 0, heroPitch: 0 };
    }

    if (this.mode === 'horse') {
      const moving = speed > 0.35;
      const freq = moving ? 4.2 + clamp(speed * 0.62, 0, 8.5) : 1.8;
      this.gallopCycle += dt * freq;
      const stride = moving ? clamp(speed / 10.5, 0.25, 1.0) : 0.06;

      const bob = moving ? Math.abs(Math.sin(this.gallopCycle)) * 0.1 * stride : Math.sin(elapsed * 2.2) * 0.015;
      this.horseBody.position.y = 1.04 + bob;
      this.horseBody.rotation.x = moving ? Math.sin(this.gallopCycle * 2) * 0.06 * stride : 0;
      this.horseNeck.rotation.x = moving ? -0.06 + Math.sin(this.gallopCycle) * 0.1 * stride : Math.sin(elapsed * 1.8) * 0.04;
      this.horseTail.rotation.x = moving ? 0.32 + Math.sin(this.gallopCycle * 1.4) * 0.2 * stride : Math.sin(elapsed * 2.4) * 0.06;

      this.bankRoll = damp(this.bankRoll, clamp(-turnRate * 0.06, -0.22, 0.22), 8, dt);
      this.horseBody.rotation.z = this.bankRoll;

      for (const leg of this.horseLegs) {
        const swing = Math.sin(this.gallopCycle + leg.phase) * 0.68 * stride;
        const bend = Math.max(0, Math.cos(this.gallopCycle + leg.phase)) * 0.56 * stride;
        leg.hip.rotation.x = swing;
        leg.knee.rotation.x = -bend;
      }

      return { heroY: 1.08 + bob, heroPitch: moving ? 0.08 * stride : 0.02 };
    }

    // Sword flight mode
    const hover = Math.sin(elapsed * 3.1) * 0.12;
    const targetRoll = clamp(-turnRate * 0.09, -0.42, 0.42);
    const targetPitch = speed > 0.5 ? 0.11 : 0.02;
    this.bankRoll = damp(this.bankRoll, targetRoll, 9, dt);
    this.bankPitch = damp(this.bankPitch, targetPitch, 8, dt);

    this.swordBladeGroup.position.y = 1.84 + hover;
    this.swordBladeGroup.rotation.z = this.bankRoll;
    this.swordBladeGroup.rotation.x = this.bankPitch;
    this.swordHaloRing.rotation.z = elapsed * 2.4;

    const windOp = speed > 0.5 ? 0.46 : 0.18;
    for (const m of this.swordWindMats) {
      m.opacity = windOp + Math.sin(elapsed * 12) * 0.06;
    }

    return { heroY: 1.9 + hover, heroPitch: this.bankPitch };
  }
}
