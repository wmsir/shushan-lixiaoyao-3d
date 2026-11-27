import * as THREE from 'three';
import { clamp, damp } from '../utils/math';

export type MountMode = 'none' | 'horse' | 'sword';

interface HorseLegRig {
  hip: THREE.Group;
  knee: THREE.Group;
  fetlock: THREE.Group;
  phase: number;
  side: -1 | 1;
  isFront: boolean;
}

/**
 * Dual-mode sculpted Xianxia mount rig for Li Xiaoyao:
 * 1) 'horse': 「踏雪赤兔神驹」 — anatomical S-curved neck, sculpted head & chamfron, curved reins,
 *    muscular torso with gilded breastplate, embroidered saddlecloth, high-arch saddle, stirrups,
 *    8-plume flowing silver mane, 3-tier sweeping tail, and 3-joint articulated 4-leg gallop.
 * 2) 'sword': 「青霄七星仙剑」 — beveled extruded symmetrical Chinese Jian (~3.45m) with central
 *    ridge spine, glowing Big Dipper 7-star inlays, upturned lotus-wing crossguard, jade sword heart,
 *    ink-silk grip, animated trailing crimson-gold tassel, and horizontal flight Bagua aura.
 */
export class MountRig {
  readonly root = new THREE.Group();
  private readonly horseGroup = new THREE.Group();
  private readonly swordGroup = new THREE.Group();

  private readonly horseBody = new THREE.Group();
  private readonly horseNeck = new THREE.Group();
  private readonly horseTail = new THREE.Group();
  private readonly horseTailMid = new THREE.Group();
  private readonly horseManePlumes: THREE.Object3D[] = [];
  private readonly horseLegs: HorseLegRig[] = [];

  private readonly swordBladeGroup = new THREE.Group();
  private readonly swordHaloRing: THREE.Mesh;
  private readonly swordInnerHalo: THREE.Mesh;
  private readonly swordTasselGroup = new THREE.Group();
  private readonly swordTasselLower = new THREE.Group();
  private readonly swordWindMats: THREE.MeshBasicMaterial[] = [];

  private mode: MountMode = 'none';
  private gallopCycle = 0;
  private bankRoll = 0;
  private bankPitch = 0;

  constructor() {
    this.root.visible = false;
    this.buildHorse();
    const halos = this.buildFlyingSword();
    this.swordHaloRing = halos.outer;
    this.swordInnerHalo = halos.inner;
    this.horseGroup.visible = false;
    this.swordGroup.visible = false;
    this.root.add(this.horseGroup, this.swordGroup);
  }

  private buildHorse(): void {
    const coatMat = new THREE.MeshStandardMaterial({
      color: '#732419',
      roughness: 0.44,
      metalness: 0.08,
    });
    const coatDarkMat = new THREE.MeshStandardMaterial({
      color: '#4e1610',
      roughness: 0.5,
      metalness: 0.08,
    });
    const whiteSockMat = new THREE.MeshStandardMaterial({
      color: '#f2eee6',
      roughness: 0.58,
    });
    const maneMat = new THREE.MeshStandardMaterial({
      color: '#f6f2ea',
      emissive: new THREE.Color('#201c16'),
      emissiveIntensity: 0.14,
      roughness: 0.62,
    });
    const leatherMat = new THREE.MeshStandardMaterial({
      color: '#2b1b16',
      roughness: 0.62,
      metalness: 0.18,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: '#e6c46e',
      emissive: new THREE.Color('#5a3e10'),
      emissiveIntensity: 0.28,
      roughness: 0.24,
      metalness: 0.88,
    });
    const crimsonClothMat = new THREE.MeshStandardMaterial({
      color: '#9b1f28',
      roughness: 0.72,
      side: THREE.DoubleSide,
    });
    const hoofMat = new THREE.MeshStandardMaterial({
      color: '#16161b',
      roughness: 0.36,
      metalness: 0.38,
    });
    const eyeMat = new THREE.MeshStandardMaterial({
      color: '#0e0a09',
      emissive: new THREE.Color('#3b2208'),
      emissiveIntensity: 0.35,
      roughness: 0.12,
      metalness: 0.2,
    });

    // Ground contact shadow
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.18, 28),
      new THREE.MeshBasicMaterial({
        color: '#04070c',
        transparent: true,
        opacity: 0.52,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(0.76, 1.44, 1);
    shadow.position.y = 0.025;
    this.horseGroup.add(shadow);

    this.horseBody.position.set(0, 1.04, 0);
    this.horseGroup.add(this.horseBody);

    // Muscular barrel + ribs + prominent withers/chest + powerful hindquarters
    const barrel = new THREE.Mesh(new THREE.CapsuleGeometry(0.305, 0.94, 10, 18), coatMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.scale.set(0.86, 1.0, 1.05);
    barrel.castShadow = true;

    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.335, 16, 14), coatMat);
    chest.scale.set(0.86, 1.04, 1.12);
    chest.position.set(0, 0.05, 0.5);
    chest.castShadow = true;

    const pectoral = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), coatDarkMat);
    pectoral.scale.set(1.05, 0.92, 0.85);
    pectoral.position.set(0, -0.05, 0.72);

    const croup = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 14), coatMat);
    croup.scale.set(0.9, 1.03, 1.12);
    croup.position.set(0, 0.04, -0.5);
    croup.castShadow = true;

    // Gilded Chinese breastplate barding & crimson tassels + embroidered saddlecloth
    const breastArmor = new THREE.Mesh(new THREE.TorusGeometry(0.295, 0.036, 8, 22, Math.PI * 1.15), goldMat);
    breastArmor.position.set(0, 0.06, 0.61);
    breastArmor.rotation.set(Math.PI * 0.22, Math.PI * 0.5, -Math.PI * 0.08);
    breastArmor.rotation.y = 0;
    breastArmor.rotation.z = Math.PI * 0.92;
    breastArmor.rotation.x = 0.42;

    const chestMedallion = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 1), goldMat);
    chestMedallion.scale.set(1.0, 1.0, 0.45);
    chestMedallion.position.set(0, -0.01, 0.85);

    const saddleCloth = new THREE.Mesh(new THREE.CylinderGeometry(0.335, 0.365, 0.62, 18, 1, true, -1.95, 3.9), crimsonClothMat);
    saddleCloth.rotation.z = Math.PI / 2;
    saddleCloth.rotation.y = Math.PI / 2;
    saddleCloth.position.set(0, 0.05, -0.02);

    const clothTrim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.37, 0.64, 18, 1, true, -1.98, 3.96), goldMat);
    clothTrim.rotation.z = Math.PI / 2;
    clothTrim.rotation.y = Math.PI / 2;
    clothTrim.position.set(0, 0.038, -0.02);

    const saddleSeat = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.24, 6, 12), leatherMat);
    saddleSeat.rotation.x = Math.PI / 2;
    saddleSeat.scale.set(1.38, 1.0, 0.44);
    saddleSeat.position.set(0, 0.305, -0.01);

    const pommel = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.032, 8, 14, Math.PI), goldMat);
    pommel.position.set(0, 0.33, 0.22);
    const cantle = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.032, 8, 14, Math.PI), goldMat);
    cantle.position.set(0, 0.34, -0.24);
    cantle.rotation.x = -0.18;

    // Hanging leather straps & gilded stirrups aligned at x = +-0.36 for rider boots
    for (const sx of [-1, 1]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.44, 0.045), leatherMat);
      strap.position.set(sx * 0.335, 0.08, 0.08);
      strap.rotation.z = -sx * 0.14;
      const stirrup = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.015, 6, 12), goldMat);
      stirrup.position.set(sx * 0.365, -0.14, 0.1);
      stirrup.rotation.y = Math.PI / 2;
      this.horseBody.add(strap, stirrup);
    }

    this.horseBody.add(
      barrel,
      chest,
      pectoral,
      croup,
      breastArmor,
      chestMedallion,
      clothTrim,
      saddleCloth,
      saddleSeat,
      pommel,
      cantle,
    );

    // Anatomical S-curved Neck + Sculpted Equine Head + Chamfron Armor + Reins
    this.horseNeck.position.set(0, 0.18, 0.56);
    this.horseBody.add(this.horseNeck);

    const neckLower = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.245, 0.42, 14), coatMat);
    neckLower.scale.set(0.78, 1.0, 1.16);
    neckLower.position.set(0, 0.16, 0.11);
    neckLower.rotation.x = 0.58;
    neckLower.castShadow = true;

    const neckUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.165, 0.42, 14), coatMat);
    neckUpper.scale.set(0.8, 1.0, 1.12);
    neckUpper.position.set(0, 0.43, 0.28);
    neckUpper.rotation.x = 0.34;
    neckUpper.castShadow = true;

    this.horseNeck.add(neckLower, neckUpper);

    // 8 layered silver-white flowing mane plumes along neck crest
    for (let m = 0; m < 8; m++) {
      const t = m / 7;
      const plume = new THREE.Mesh(new THREE.ConeGeometry(0.055 + (1 - t) * 0.024, 0.24, 7), maneMat);
      plume.scale.set(0.55, 1.0, 1.35);
      plume.position.set(0, 0.1 + t * 0.48, -0.06 + t * 0.31);
      plume.rotation.x = -0.85;
      this.horseNeck.add(plume);
      this.horseManePlumes.push(plume);
    }

    // Sculpted Head Group
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.62, 0.38);
    headGroup.rotation.x = 0.48;
    this.horseNeck.add(headGroup);

    const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.125, 14, 12), coatMat);
    cranium.scale.set(0.84, 0.96, 1.15);
    cranium.castShadow = true;

    const jowl = new THREE.Mesh(new THREE.SphereGeometry(0.112, 12, 10), coatDarkMat);
    jowl.scale.set(0.86, 0.95, 0.95);
    jowl.position.set(0, -0.06, 0.03);

    const nasal = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.102, 0.34, 12), coatMat);
    nasal.scale.set(0.86, 1.0, 0.98);
    nasal.rotation.x = Math.PI / 2;
    nasal.position.set(0, -0.02, 0.22);
    nasal.castShadow = true;

    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.072, 12, 10), coatDarkMat);
    muzzle.scale.set(0.9, 0.88, 1.12);
    muzzle.position.set(0, -0.03, 0.4);

    // Gilded forehead chamfron + bridle rings + eyes + pointed ears
    const chamfron = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.24, 5), goldMat);
    chamfron.scale.set(0.95, 1.0, 0.32);
    chamfron.rotation.x = Math.PI / 2;
    chamfron.position.set(0, 0.062, 0.16);

    const noseband = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.013, 6, 14), goldMat);
    noseband.position.set(0, -0.025, 0.33);

    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), eyeMat);
      eye.position.set(sx * 0.088, 0.035, 0.09);

      const earOuter = new THREE.Mesh(new THREE.ConeGeometry(0.034, 0.125, 7), coatMat);
      earOuter.position.set(sx * 0.064, 0.135, -0.03);
      earOuter.rotation.set(-0.22, 0, -sx * 0.18);

      const bitRing = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.007, 6, 12), goldMat);
      bitRing.position.set(sx * 0.07, -0.045, 0.37);
      bitRing.rotation.y = Math.PI / 2;

      headGroup.add(eye, earOuter, bitRing);
    }

    // Curved leather reins sweeping back from bit toward rider hands
    for (const sx of [-1, 1]) {
      const reinCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(sx * 0.08, 0.38, 0.68),
        new THREE.Vector3(sx * 0.17, 0.3, 0.32),
        new THREE.Vector3(sx * 0.15, 0.44, -0.08),
      ]);
      const rein = new THREE.Mesh(new THREE.TubeGeometry(reinCurve, 12, 0.011, 6, false), leatherMat);
      this.horseNeck.add(rein);
    }

    headGroup.add(cranium, jowl, nasal, muzzle, chamfron, noseband);

    // 3-tier flowing silver-white tail
    this.horseTail.position.set(0, 0.18, -0.78);
    this.horseBody.add(this.horseTail);

    const tailRoot = new THREE.Mesh(new THREE.ConeGeometry(0.078, 0.38, 10), maneMat);
    tailRoot.position.set(0, -0.14, -0.08);
    tailRoot.rotation.x = -0.52;
    this.horseTail.add(tailRoot);

    this.horseTailMid.position.set(0, -0.28, -0.18);
    this.horseTail.add(this.horseTailMid);
    const tailFlow = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.5, 10), maneMat);
    tailFlow.scale.set(0.85, 1.0, 1.15);
    tailFlow.position.set(0, -0.2, -0.08);
    tailFlow.rotation.x = -0.3;
    this.horseTailMid.add(tailFlow);

    // 4 Anatomical 3-segment Legs (Muscular upper -> knee/hock -> cannon w/ gold greave + white fetlock + hoof)
    const legSpecs: Array<{ x: number; z: number; phase: number; side: -1 | 1; isFront: boolean }> = [
      { x: -0.2, z: 0.5, phase: 0, side: -1, isFront: true },
      { x: 0.2, z: 0.5, phase: Math.PI, side: 1, isFront: true },
      { x: -0.21, z: -0.5, phase: Math.PI * 0.86, side: -1, isFront: false },
      { x: 0.21, z: -0.5, phase: -0.14, side: 1, isFront: false },
    ];
    for (const spec of legSpecs) {
      const hip = new THREE.Group();
      hip.position.set(spec.x, -0.1, spec.z);

      const upperMusc = new THREE.Mesh(
        new THREE.CapsuleGeometry(spec.isFront ? 0.082 : 0.1, 0.32, 6, 10),
        coatMat,
      );
      upperMusc.scale.set(0.86, 1.0, 1.16);
      upperMusc.position.y = -0.2;
      upperMusc.castShadow = true;

      const kneeJoint = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), coatDarkMat);
      kneeJoint.position.y = -0.42;
      hip.add(upperMusc, kneeJoint);

      const knee = new THREE.Group();
      knee.position.set(0, -0.43, 0);

      const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.04, 0.34, 10), coatMat);
      cannon.position.y = -0.16;
      cannon.castShadow = true;

      const greave = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.045, 0.22, 10), goldMat);
      greave.position.y = -0.14;

      const fetlock = new THREE.Group();
      fetlock.position.set(0, -0.35, 0);
      const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.064, 0.12, 10), whiteSockMat);
      sock.position.y = -0.05;
      const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.068, 0.085, 10), hoofMat);
      hoof.position.set(0, -0.125, 0.012);
      fetlock.add(sock, hoof);

      knee.add(cannon, greave, fetlock);
      hip.add(knee);

      this.horseBody.add(hip);
      this.horseLegs.push({
        hip,
        knee,
        fetlock,
        phase: spec.phase,
        side: spec.side,
        isFront: spec.isFront,
      });
    }
  }

  private buildFlyingSword(): { outer: THREE.Mesh; inner: THREE.Mesh } {
    const steelMat = new THREE.MeshPhysicalMaterial({
      color: '#dcebf7',
      emissive: new THREE.Color('#134f68'),
      emissiveIntensity: 0.28,
      roughness: 0.16,
      metalness: 0.94,
      clearcoat: 0.85,
      clearcoatRoughness: 0.12,
    });
    const spineGoldMat = new THREE.MeshStandardMaterial({
      color: '#f2d382',
      emissive: new THREE.Color('#5a4212'),
      emissiveIntensity: 0.36,
      roughness: 0.22,
      metalness: 0.9,
    });
    const edgeGlowMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.35, 1.85, 2.2),
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const jadeMat = new THREE.MeshPhysicalMaterial({
      color: '#5cf5e6',
      emissive: new THREE.Color('#1ac4c2'),
      emissiveIntensity: 1.25,
      roughness: 0.14,
      metalness: 0.25,
      clearcoat: 0.9,
    });
    const gripMat = new THREE.MeshStandardMaterial({
      color: '#1b2638',
      roughness: 0.72,
      metalness: 0.15,
    });
    const tasselMat = new THREE.MeshStandardMaterial({
      color: '#b82534',
      emissive: new THREE.Color('#380a10'),
      emissiveIntensity: 0.22,
      roughness: 0.65,
      side: THREE.DoubleSide,
    });

    this.swordBladeGroup.position.set(0, 1.82, 0);
    this.swordGroup.add(this.swordBladeGroup);

    // True symmetrical Chinese Jian blade (Shape + Beveled ExtrudeGeometry laid flat along +Z)
    // Length ~ 2.45m blade from guard z=-0.65 to sharp point z=+1.92
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(0, 0.22);
    bladeShape.lineTo(1.98, 0.125);
    bladeShape.lineTo(2.54, 0);
    bladeShape.lineTo(1.98, -0.125);
    bladeShape.lineTo(0, -0.22);
    bladeShape.closePath();

    const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
      depth: 0.028,
      bevelEnabled: true,
      bevelThickness: 0.028,
      bevelSize: 0.044,
      bevelSegments: 2,
    });
    // Orient Shape X -> +Z (forward), Z-depth -> +Y (thickness), Shape Y -> -X (width)
    bladeGeo.rotateX(-Math.PI / 2);
    bladeGeo.rotateY(Math.PI / 2);

    const bladeMesh = new THREE.Mesh(bladeGeo, steelMat);
    bladeMesh.position.set(0, -0.014, -0.62);
    bladeMesh.castShadow = true;

    // Translucent cyan sword-qi aura tracing the blade silhouette
    const auraMesh = new THREE.Mesh(bladeGeo, edgeGlowMat);
    auraMesh.scale.set(1.16, 1.35, 1.03);
    auraMesh.position.set(0, -0.016, -0.63);

    // Raised gilded central ridge spine (剑脊) + 7-Star Big Dipper inlaid runes (北斗七星)
    const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.036, 2.24, 4), spineGoldMat);
    ridge.scale.set(0.95, 1.0, 0.45);
    ridge.rotation.set(Math.PI / 2, Math.PI / 4, 0);
    ridge.position.set(0, 0.034, 0.56);

    const starOffsets: Array<[number, number]> = [
      [-0.035, 0.0],
      [0.03, 0.24],
      [-0.03, 0.48],
      [0.0, 0.74],
      [0.03, 1.0],
      [-0.02, 1.24],
      [0.0, 1.48],
    ];
    for (const [sx, sz] of starOffsets) {
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.026, 0), jadeMat);
      star.scale.set(1.0, 0.5, 1.0);
      star.position.set(sx, 0.045, sz);
      this.swordBladeGroup.add(star);
    }

    // Upturned Lotus-Wing Dragon Crossguard (莲花吞口剑格) via ExtrudeGeometry
    const guardShape = new THREE.Shape();
    guardShape.moveTo(-0.46, 0.14);
    guardShape.quadraticCurveTo(-0.24, 0.02, -0.14, -0.06);
    guardShape.lineTo(0.14, -0.06);
    guardShape.quadraticCurveTo(0.24, 0.02, 0.46, 0.14);
    guardShape.lineTo(0.36, 0.2);
    guardShape.quadraticCurveTo(0.16, 0.08, 0, 0.11);
    guardShape.quadraticCurveTo(-0.16, 0.08, -0.36, 0.2);
    guardShape.closePath();

    const guardGeo = new THREE.ExtrudeGeometry(guardShape, {
      depth: 0.075,
      bevelEnabled: true,
      bevelThickness: 0.018,
      bevelSize: 0.018,
      bevelSegments: 2,
    });
    guardGeo.rotateX(Math.PI / 2);

    const guardMesh = new THREE.Mesh(guardGeo, spineGoldMat);
    guardMesh.position.set(0, 0.038, -0.66);
    guardMesh.castShadow = true;

    // Collar ferrule + Jade Sword Heart gem
    const ferrule = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.16), spineGoldMat);
    ferrule.position.set(0, 0.005, -0.58);
    const guardGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.082, 0), jadeMat);
    guardGem.scale.set(1.0, 0.55, 1.35);
    guardGem.position.set(0, 0.055, -0.65);

    // Ink-silk ribbed grip + Gilded Pommel + Trailing Crimson Tassel (剑穗)
    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.05, 0.44, 12), gripMat);
    hilt.scale.set(1.25, 1.0, 0.85);
    hilt.rotation.x = Math.PI / 2;
    hilt.position.set(0, 0.005, -0.92);

    for (let r = 0; r < 5; r++) {
      const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.008, 6, 14), spineGoldMat);
      wrap.scale.set(1.22, 0.86, 1.0);
      wrap.position.set(0, 0.005, -0.76 - r * 0.075);
      this.swordBladeGroup.add(wrap);
    }

    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.072, 12, 10), spineGoldMat);
    pommel.scale.set(1.15, 0.72, 1.25);
    pommel.position.set(0, 0.005, -1.16);

    const pommelGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), jadeMat);
    pommelGem.position.set(0, 0.005, -1.23);

    this.swordTasselGroup.position.set(0, 0.005, -1.24);
    const tasselUpper = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.34, 8), tasselMat);
    tasselUpper.rotation.x = -Math.PI / 2;
    tasselUpper.position.z = -0.17;
    this.swordTasselLower.position.z = -0.33;
    const tasselTip = new THREE.Mesh(new THREE.ConeGeometry(0.054, 0.38, 8), tasselMat);
    tasselTip.rotation.x = -Math.PI / 2;
    tasselTip.position.z = -0.18;
    const tasselBead = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), spineGoldMat);
    this.swordTasselLower.add(tasselTip, tasselBead);
    this.swordTasselGroup.add(tasselUpper, this.swordTasselLower);

    // Sleek horizontal Bagua flight halos beneath the sword (never a chunky tail tire!)
    const outerHalo = new THREE.Mesh(
      new THREE.RingGeometry(0.76, 0.84, 32),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0.45, 2.05, 2.2),
        transparent: true,
        opacity: 0.48,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    outerHalo.rotation.x = -Math.PI / 2;
    outerHalo.position.set(0, -0.09, 0.06);

    const innerHalo = new THREE.Mesh(
      new THREE.RingGeometry(0.48, 0.54, 6),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(2.2, 1.85, 0.72),
        transparent: true,
        opacity: 0.52,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    innerHalo.rotation.x = -Math.PI / 2;
    innerHalo.position.set(0, -0.09, 0.06);

    this.swordBladeGroup.add(
      bladeMesh,
      auraMesh,
      ridge,
      guardMesh,
      ferrule,
      guardGem,
      hilt,
      pommel,
      pommelGem,
      this.swordTasselGroup,
      outerHalo,
      innerHalo,
    );

    // Slim flanking wind-qi streaks
    for (const sx of [-0.28, 0.28]) {
      const windMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(0.45, 1.95, 2.25),
        transparent: true,
        opacity: 0.26,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const wake = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 1.9), windMat);
      wake.rotation.x = -Math.PI / 2;
      wake.position.set(sx, 0.0, -0.45);
      this.swordBladeGroup.add(wake);
      this.swordWindMats.push(windMat);
    }

    // Subtle ground projection ring below flying sword
    const shadow = new THREE.Mesh(
      new THREE.RingGeometry(0.24, 0.96, 28),
      new THREE.MeshBasicMaterial({
        color: '#4cd9d0',
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.04;
    this.swordGroup.add(shadow);

    return { outer: outerHalo, inner: innerHalo };
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
      const freq = moving ? 4.4 + clamp(speed * 0.62, 0, 8.8) : 1.7;
      this.gallopCycle += dt * freq;
      const stride = moving ? clamp(speed / 10.5, 0.25, 1.0) : 0.05;

      const bob = moving ? Math.abs(Math.sin(this.gallopCycle)) * 0.095 * stride : Math.sin(elapsed * 2.1) * 0.014;
      this.horseBody.position.y = 1.04 + bob;
      this.horseBody.rotation.x = moving ? Math.sin(this.gallopCycle * 2) * 0.065 * stride : 0;
      this.horseNeck.rotation.x = moving
        ? -0.05 + Math.sin(this.gallopCycle + 0.4) * 0.11 * stride
        : Math.sin(elapsed * 1.8) * 0.035;
      this.horseTail.rotation.x = moving
        ? 0.42 + Math.sin(this.gallopCycle * 1.5) * 0.22 * stride
        : 0.08 + Math.sin(elapsed * 2.4) * 0.05;
      this.horseTailMid.rotation.x = moving ? 0.26 + Math.cos(this.gallopCycle * 1.5) * 0.2 * stride : 0.06;

      for (let i = 0; i < this.horseManePlumes.length; i++) {
        const p = this.horseManePlumes[i];
        p.rotation.z = Math.sin(elapsed * (moving ? 11 : 2.8) + i * 0.6) * (moving ? 0.16 : 0.04);
      }

      this.bankRoll = damp(this.bankRoll, clamp(-turnRate * 0.06, -0.22, 0.22), 8, dt);
      this.horseBody.rotation.z = this.bankRoll;

      for (const leg of this.horseLegs) {
        const swing = Math.sin(this.gallopCycle + leg.phase) * 0.66 * stride;
        const bend = Math.max(0, Math.cos(this.gallopCycle + leg.phase)) * 0.54 * stride;
        const fetBend = Math.sin(this.gallopCycle + leg.phase - 0.6) * 0.34 * stride;
        leg.hip.rotation.x = swing;
        leg.knee.rotation.x = leg.isFront ? -bend : bend * 0.65;
        leg.fetlock.rotation.x = fetBend;
      }

      return { heroY: 0.92 + bob, heroPitch: moving ? 0.06 * stride : 0.01 };
    }

    // Sword flight mode
    const hover = Math.sin(elapsed * 3.0) * 0.11;
    const targetRoll = clamp(-turnRate * 0.095, -0.44, 0.44);
    const targetPitch = speed > 0.5 ? 0.09 : 0.015;
    this.bankRoll = damp(this.bankRoll, targetRoll, 9, dt);
    this.bankPitch = damp(this.bankPitch, targetPitch, 8, dt);

    this.swordBladeGroup.position.y = 1.82 + hover;
    this.swordBladeGroup.rotation.z = this.bankRoll;
    this.swordBladeGroup.rotation.x = this.bankPitch;
    this.swordHaloRing.rotation.z = elapsed * 1.4;
    this.swordInnerHalo.rotation.z = -elapsed * 2.1;

    // Stream crimson-gold sword tassel dynamically behind pommel
    const spdNorm = clamp(speed / 12, 0, 1);
    this.swordTasselGroup.rotation.x = -0.22 + spdNorm * 0.18 + Math.sin(elapsed * 7.5) * 0.08;
    this.swordTasselGroup.rotation.y = Math.sin(elapsed * 6.2) * (0.08 + spdNorm * 0.14);
    this.swordTasselLower.rotation.y = Math.cos(elapsed * 8.4) * (0.1 + spdNorm * 0.18);

    const windOp = speed > 0.5 ? 0.38 : 0.14;
    for (const m of this.swordWindMats) {
      m.opacity = windOp + Math.sin(elapsed * 12) * 0.05;
    }

    return { heroY: 1.86 + hover, heroPitch: this.bankPitch };
  }
}
