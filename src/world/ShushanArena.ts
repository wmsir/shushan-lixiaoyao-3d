import * as THREE from 'three';
import {
  type CapsuleObstacle,
  type CircleObstacle,
  clamp,
  resolveCircleVsCapsule,
  resolveCircleVsCircle,
} from '../utils/math';
import {
  createArchwayPlaqueTexture,
  createCanyonCliffMaps,
  createCarvedStoneTexture,
  createCourtyardStoneMaps,
  createJadeBridgeDeckMaps,
  createLacquerWoodTexture,
  createShushanSkyDome,
  createSoftParticleTexture,
  createStreamStoneMaps,
} from './Materials';
import skyUrl from '../assets/shushan-sky.jpg';

export type ArenaLayout = 'corridor' | 'arena';

interface OccludableProp {
  position: THREE.Vector3;
  radius: number;
  materials: Array<THREE.MeshStandardMaterial | THREE.MeshBasicMaterial>;
  currentOpacity: number;
}

interface LanternRef {
  light: THREE.PointLight;
  flame: THREE.Mesh;
  baseIntensity: number;
  phase: number;
}

interface SpiritBarrierGate {
  group: THREE.Group;
  curtain: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  openProgress: number;
  zPos: number;
}

const ZONE_CENTERS = [0, -42, -84] as const;
const ZONE_NAMES = ['云溪山门', '翠竹剑涧', '锁妖绝壁'] as const;
const ZONE_RADII = [16.5, 16.5, 17.5] as const;
const BRIDGE_SPANS = [
  { zMax: -14.5, zMin: -27.5, barrierZ: -15.5, halfWidth: 5.4 },
  { zMax: -56.0, zMin: -70.0, barrierZ: -57.2, halfWidth: 4.8 },
] as const;

export class ShushanArena {
  readonly group = new THREE.Group();
  readonly circleObstacles: CircleObstacle[] = [];
  readonly capsuleObstacles: CapsuleObstacle[] = [];
  readonly playableRadius = 17.4;

  private readonly skyDome: THREE.Mesh;
  private readonly baguaMat: THREE.ShaderMaterial;
  private readonly bossSealMat: THREE.ShaderMaterial;
  private readonly bossRingPlane: THREE.Mesh;
  private readonly grassMat: THREE.ShaderMaterial;
  private readonly petalPoints: THREE.Points;
  private readonly petalData: Float32Array;
  private readonly fireflyPoints: THREE.Points;
  private readonly fireflyData: Float32Array;
  private readonly mistPlanes: THREE.Mesh[] = [];
  private readonly mountainGroup = new THREE.Group();
  private readonly floatingPeaks: THREE.Group[] = [];
  private readonly skySwordRing = new THREE.Group();
  private readonly moonbeams: THREE.Mesh[] = [];
  private readonly lanterns: LanternRef[] = [];
  private readonly occludables: OccludableProp[] = [];
  private readonly rng: () => number;

  private readonly archwayGroup = new THREE.Group();
  private archwayOccludable!: OccludableProp;
  private readonly arenaArchwayCapsules: CapsuleObstacle[] = [];
  private readonly zone0Obstacles: CircleObstacle[] = [];
  private readonly zone1Obstacles: CircleObstacle[] = [];
  private readonly zone2Obstacles: CircleObstacle[] = [];
  private readonly zone0FullCurb: THREE.Mesh;
  private readonly zone0OpenCurb: THREE.Mesh;

  private readonly corridorGroup = new THREE.Group();
  private readonly bridge0Group = new THREE.Group();
  private readonly zone1Group = new THREE.Group();
  private readonly bridge1Group = new THREE.Group();
  private readonly zone2Group = new THREE.Group();
  private readonly waterMeshes: THREE.Mesh[] = [];
  private readonly canyonCliffs: THREE.Object3D[] = [];
  private zone1DoubleOpenCurb!: THREE.Group;
  private zone1SouthOpenCurb!: THREE.Mesh;
  private chevronMat0!: THREE.ShaderMaterial;
  private chevronMat1!: THREE.ShaderMaterial;
  private riverMat?: THREE.ShaderMaterial;
  private shallowWaterMat?: THREE.ShaderMaterial;
  private waterfallMat?: THREE.ShaderMaterial;
  private plungeFoamMat?: THREE.ShaderMaterial;
  private bambooMat?: THREE.ShaderMaterial;
  private bambooLeafMat?: THREE.ShaderMaterial;
  private readonly barriers: SpiritBarrierGate[] = [];

  private layout: ArenaLayout = 'arena';
  private maxZone: 0 | 1 | 2 = 0;
  private unlockedZone: 0 | 1 | 2 = 0;
  private backdropAnchorZ = 0;

  private bossIntensity = 0;
  private floorMat!: THREE.MeshStandardMaterial;
  private cliffMat!: THREE.MeshStandardMaterial;

  constructor(rng: () => number) {
    this.rng = rng;

    // 1. Moonlit Shushan Sky Dome
    this.skyDome = createShushanSkyDome(skyUrl);
    this.group.add(this.skyDome);

    // 2. Courtyard Stone Flagstone Platform & Stepped Cliff Base
    const stoneMaps = createCourtyardStoneMaps();
    const carvedTex = createCarvedStoneTexture();
    const lacquerTex = createLacquerWoodTexture();

    this.floorMat = new THREE.MeshStandardMaterial({
      map: stoneMaps.map,
      bumpMap: stoneMaps.bumpMap,
      bumpScale: 0.11,
      roughnessMap: stoneMaps.roughnessMap,
      roughness: 0.9,
      metalness: 0.04,
      color: new THREE.Color('#9fb2c7'),
    });

    const terrace = new THREE.Mesh(new THREE.CylinderGeometry(19.6, 20.8, 1.4, 32), this.floorMat);
    terrace.position.y = -0.7;
    terrace.receiveShadow = true;
    this.group.add(terrace);

    this.cliffMat = new THREE.MeshStandardMaterial({ color: '#1b2430', roughness: 0.96, metalness: 0.02 });
    const cliff = new THREE.Mesh(
      new THREE.CylinderGeometry(20.6, 13.0, 22, 16),
      this.cliffMat,
    );
    cliff.position.y = -12.3;
    this.group.add(cliff);

    const trimMat = new THREE.MeshStandardMaterial({
      map: carvedTex,
      color: '#8493a6',
      roughness: 0.82,
      metalness: 0.08,
    });
    this.zone0FullCurb = new THREE.Mesh(new THREE.TorusGeometry(19.1, 0.36, 10, 48), trimMat);
    this.zone0FullCurb.rotation.x = Math.PI / 2;
    this.zone0FullCurb.position.y = 0.08;
    this.zone0FullCurb.receiveShadow = true;
    this.zone0FullCurb.castShadow = true;
    this.group.add(this.zone0FullCurb);

    // Open-north curb used in corridor mode so Crossing 0 shallow ford connects flush at Z = -14.5
    this.zone0OpenCurb = new THREE.Mesh(
      new THREE.TorusGeometry(19.1, 0.36, 10, 44, Math.PI * 2 - 0.62),
      trimMat,
    );
    this.zone0OpenCurb.rotation.set(Math.PI / 2, 0, -Math.PI / 2 + 0.31);
    this.zone0OpenCurb.position.y = 0.08;
    this.zone0OpenCurb.receiveShadow = true;
    this.zone0OpenCurb.castShadow = true;
    this.zone0OpenCurb.visible = false;
    this.group.add(this.zone0OpenCurb);

    // 3. Central Glowing Taoist Bagua Sword Seal (disciplined HDR so it never bleaches white)
    this.baguaMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uBossIntensity: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv * 2.0 - 1.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uBossIntensity;
        varying vec2 vUv;

        void main() {
          float r = length(vUv);
          if (r > 1.0) discard;
          float a = atan(vUv.y, vUv.x);

          float outerRing = smoothstep(0.018, 0.004, abs(r - 0.94));
          float outerRim = smoothstep(0.010, 0.002, abs(r - 0.985));
          float midRing = smoothstep(0.015, 0.004, abs(r - 0.72));
          float innerRing = smoothstep(0.014, 0.003, abs(r - 0.42));
          float coreRing = smoothstep(0.011, 0.003, abs(r - 0.16));

          float octA = mod(a + 0.3927, 0.7854) - 0.3927;
          float octR = 0.82 / cos(octA);
          float octLine = smoothstep(0.014, 0.003, abs(r - octR));
          float compassTicks = step(0.86, cos(a * 24.0)) * smoothstep(0.024, 0.006, abs(r - 0.962));

          float rotA = a + uTime * 0.07;
          float sector = floor(mod((rotA + 3.14159265) / 0.7854, 8.0));
          float localA = fract((rotA + 3.14159265) / 0.7854);
          float inBand = step(0.16, localA) * step(localA, 0.84);
          float gap = step(0.44, localA) * step(localA, 0.56);
          float b0 = smoothstep(0.013, 0.003, abs(r - 0.52)) * (mod(sector, 2.0) > 0.5 ? (1.0 - gap) : 1.0);
          float b1 = smoothstep(0.013, 0.003, abs(r - 0.58)) * (mod(floor(sector * 0.5), 2.0) > 0.5 ? (1.0 - gap) : 1.0);
          float b2 = smoothstep(0.013, 0.003, abs(r - 0.64)) * (mod(floor(sector * 0.25), 2.0) > 0.5 ? (1.0 - gap) : 1.0);
          float trigrams = (b0 + b1 + b2) * inBand;

          float spoke = smoothstep(0.028, 0.006, abs(sin((a - uTime * 0.12) * 4.0))) * smoothstep(0.41, 0.16, r) * smoothstep(0.12, 0.18, r);
          float pattern = clamp(
            outerRing + outerRim * 0.55 + midRing + innerRing + coreRing * 0.7 +
            octLine * 0.88 + compassTicks * 0.65 + trigrams * 0.95 + spoke * 0.42,
            0.0,
            1.15
          );
          float pulse = 0.82 + 0.18 * sin(uTime * 1.8 - r * 4.5);

          vec3 jadeGold = mix(vec3(0.22, 0.76, 0.80), vec3(0.92, 0.74, 0.34), smoothstep(0.38, 0.94, r));
          vec3 bossCrimson = mix(vec3(0.90, 0.24, 0.34), vec3(0.84, 0.52, 0.26), smoothstep(0.25, 0.9, r));
          vec3 col = mix(jadeGold, bossCrimson, uBossIntensity);

          float alpha = pattern * pulse * (0.42 + uBossIntensity * 0.16);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
    const baguaPlane = new THREE.Mesh(new THREE.PlaneGeometry(15.5, 15.5), this.baguaMat);
    baguaPlane.rotation.x = -Math.PI / 2;
    baguaPlane.position.y = 0.024;
    this.group.add(baguaPlane);

    // Alpha-feathered Crimson-Gold Boss Barrier Sigil Ring (replaces flat opaque pink donut!)
    this.bossSealMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv * 2.0 - 1.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uIntensity;
        varying vec2 vUv;
        void main() {
          if (uIntensity < 0.01) discard;
          float r = length(vUv);
          float a = atan(vUv.y, vUv.x);
          float outer = smoothstep(0.018, 0.003, abs(r - 0.96));
          float inner = smoothstep(0.014, 0.003, abs(r - 0.91));
          float runeTicks = step(0.45, sin(a * 36.0 + uTime * 1.4)) * smoothstep(0.025, 0.005, abs(r - 0.935));
          float softHalo = smoothstep(0.06, 0.0, abs(r - 0.94)) * 0.3;
          float m = clamp(outer + inner * 0.75 + runeTicks * 0.8 + softHalo, 0.0, 1.0);
          if (m < 0.02) discard;
          vec3 col = mix(vec3(0.95, 0.24, 0.30), vec3(0.98, 0.72, 0.34), runeTicks);
          gl_FragColor = vec4(col, m * uIntensity * 0.44);
        }
      `,
    });
    this.bossRingPlane = new THREE.Mesh(new THREE.PlaneGeometry(36.4, 36.4), this.bossSealMat);
    this.bossRingPlane.rotation.x = -Math.PI / 2;
    this.bossRingPlane.position.y = 0.036;
    this.group.add(this.bossRingPlane);

    // 4. Grand North Shushan Archway (锁妖剑台牌坊 with carved gilded plaque!)
    this.buildShushanArchway(carvedTex, lacquerTex);

    // 5. Four Carved Rune Pillars + Shared Balustrade Posts + 6 Stone Lanterns
    this.buildPillarsAndLanterns(carvedTex, lacquerTex);

    // 6. Ancient Cliffside Shushan Pine Trees & Textured Boulders (shared geometries!)
    this.buildPinesAndRocks(carvedTex);

    // 7. Distant Sculpted Misty Ink-Wash Shushan Mountain Ridges (NO raw black cones!)
    this.buildDistantMountains();

    // 8. Instanced Perimeter Sage-Moss Grass (strictly along cliff rim & pine bases, NEVER through stone tiles!)
    this.grassMat = this.buildInstancedGrass();

    // 9. Soft-Textured Falling Peach Petals & Glowing Fireflies (ZERO square quads!)
    const weather = this.buildWeatherParticles();
    this.petalPoints = weather.petals;
    this.petalData = weather.petalData;
    this.fireflyPoints = weather.fireflies;
    this.fireflyData = weather.fireflyData;

    // 10. Low Drifting Cliff Mist Planes
    this.buildDriftingMist();

    // 11. Chinese 3D Donghua Immortal Shushan Scenery: Floating Sword-Peaks, Orbiting Celestial Sword Array & Volumetric Moonbeams!
    this.buildFloatingImmortalPeaks(carvedTex, lacquerTex);
    this.buildSkySwordArray();
    this.buildMoonbeamShafts();

    // 12. 3-Zone Connected Expedition Corridor Map (hidden in 'arena' mode)
    this.corridorGroup.visible = false;
    this.group.add(this.corridorGroup);
    this.buildCorridorWorld(carvedTex, lacquerTex, trimMat);
    this.syncLayoutObstacles();
  }

  private buildShushanArchway(
    carvedTex: THREE.CanvasTexture,
    lacquerTex: THREE.CanvasTexture,
  ): void {
    const arch = this.archwayGroup;
    arch.position.set(0, 0, -16.6);

    const pillarMat = new THREE.MeshStandardMaterial({
      map: lacquerTex,
      roughness: 0.56,
      metalness: 0.12,
      transparent: true,
      opacity: 1,
    });
    const stoneBaseMat = new THREE.MeshStandardMaterial({
      map: carvedTex,
      color: '#8897aa',
      roughness: 0.82,
      metalness: 0.06,
      transparent: true,
      opacity: 1,
    });
    const roofMat = new THREE.MeshStandardMaterial({
      color: '#1b2b3b',
      roughness: 0.58,
      metalness: 0.2,
      transparent: true,
      opacity: 1,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: '#d4af5e',
      roughness: 0.36,
      metalness: 0.72,
      emissive: new THREE.Color('#3b2a0b'),
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 1,
    });
    const plaqueMat = new THREE.MeshStandardMaterial({
      map: createArchwayPlaqueTexture(),
      roughness: 0.42,
      metalness: 0.35,
      emissive: new THREE.Color('#402a0d'),
      emissiveIntensity: 0.32,
      transparent: true,
      opacity: 1,
    });

    // Shared geometries across all 4 archway columns
    const baseGeo = new THREE.CylinderGeometry(0.48, 0.62, 0.85, 8);
    const colTallGeo = new THREE.CylinderGeometry(0.31, 0.35, 6.2, 12);
    const colShortGeo = new THREE.CylinderGeometry(0.28, 0.32, 4.7, 12);
    const ringGeo = new THREE.TorusGeometry(0.35, 0.055, 8, 16);

    const pillarXs = [-5.4, -2.5, 2.5, 5.4];
    for (let i = 0; i < pillarXs.length; i++) {
      const x = pillarXs[i];
      const tall = i === 1 || i === 2;
      const h = tall ? 6.2 : 4.7;

      const base = new THREE.Mesh(baseGeo, stoneBaseMat);
      base.position.set(x, 0.425, 0);
      base.castShadow = true;
      base.receiveShadow = true;
      arch.add(base);

      const col = new THREE.Mesh(tall ? colTallGeo : colShortGeo, pillarMat);
      col.position.set(x, 0.85 + h * 0.5, 0);
      col.castShadow = true;
      col.receiveShadow = true;
      arch.add(col);

      const ring = new THREE.Mesh(ringGeo, goldMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, h + 0.15, 0);
      arch.add(ring);
    }

    const mainBeam = new THREE.Mesh(new THREE.BoxGeometry(11.8, 0.54, 0.6), pillarMat);
    mainBeam.position.set(0, 5.1, 0);
    mainBeam.castShadow = true;
    arch.add(mainBeam);

    const upperBeam = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.48, 0.64), pillarMat);
    upperBeam.position.set(0, 6.65, 0);
    upperBeam.castShadow = true;
    arch.add(upperBeam);

    // Carved gold calligraphy plaque 「锁妖剑台」
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(2.85, 1.02, 0.22), plaqueMat);
    plaque.position.set(0, 5.88, 0.24);
    arch.add(plaque);

    const tipGeo = new THREE.ConeGeometry(0.42, 1.05, 4);
    const buildEaves = (w: number, y: number, x: number) => {
      const roof = new THREE.Group();
      roof.position.set(x, y, 0);
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, 1.85), roofMat);
      body.castShadow = true;
      roof.add(body);
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(w + 0.45, 0.2, 0.3), goldMat);
      ridge.position.y = 0.22;
      roof.add(ridge);
      for (const s of [-1, 1]) {
        const tip = new THREE.Mesh(tipGeo, roofMat);
        tip.rotation.z = s * -1.05;
        tip.rotation.y = Math.PI / 4;
        tip.position.set(s * (w * 0.5 + 0.24), 0.26, 0);
        roof.add(tip);
      }
      arch.add(roof);
    };

    buildEaves(6.8, 7.2, 0);
    buildEaves(3.3, 5.56, -4.1);
    buildEaves(3.3, 5.56, 4.1);

    // Warm crimson-gold hanging lanterns
    const glowMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.85, 0.9, 0.34),
      transparent: true,
      opacity: 1,
    });
    const cordGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6);
    const globeGeo = new THREE.SphereGeometry(0.26, 10, 8);
    for (const lx of [-1.75, 1.75]) {
      const cord = new THREE.Mesh(cordGeo, goldMat);
      cord.position.set(lx, 4.5, 0.18);
      arch.add(cord);
      const globe = new THREE.Mesh(globeGeo, glowMat);
      globe.scale.set(0.85, 1.22, 0.85);
      globe.position.set(lx, 4.0, 0.18);
      arch.add(globe);
    }

    this.group.add(arch);

    this.archwayOccludable = {
      position: new THREE.Vector3(0, 3.0, -16.6),
      radius: 5.5,
      materials: [pillarMat, stoneBaseMat, roofMat, goldMat, plaqueMat, glowMat],
      currentOpacity: 1,
    };
    this.occludables.push(this.archwayOccludable);

    this.arenaArchwayCapsules.push(
      { ax: -5.6, az: -16.6, bx: -2.4, bz: -16.6, r: 0.75 },
      { ax: 2.4, az: -16.6, bx: 5.6, bz: -16.6, r: 0.75 },
    );
  }

  private buildPillarsAndLanterns(
    carvedTex: THREE.CanvasTexture,
    lacquerTex: THREE.CanvasTexture,
  ): void {
    // Shared pillar geometries (saves ~24 GPU geometry slots!)
    const pBaseGeo = new THREE.CylinderGeometry(0.76, 0.94, 0.65, 8);
    const pShaftGeo = new THREE.CylinderGeometry(0.5, 0.62, 4.9, 8);
    const pBandGeo = new THREE.TorusGeometry(0.56, 0.05, 8, 20);
    const pCapGeo = new THREE.CylinderGeometry(0.78, 0.52, 0.45, 8);
    const pFinialGeo = new THREE.ConeGeometry(0.18, 0.88, 6);

    const pillarPositions: Array<[number, number, number]> = [
      [-11.2, -9.2, 1.0],
      [11.2, -9.2, 1.06],
      [-11.8, 8.2, 0.94],
      [11.8, 8.2, 0.98],
    ];

    for (const [px, pz, sy] of pillarPositions) {
      const pGroup = new THREE.Group();
      pGroup.position.set(px, 0, pz);

      const matStone = new THREE.MeshStandardMaterial({
        map: carvedTex,
        color: '#8899ad',
        roughness: 0.8,
        metalness: 0.08,
        transparent: true,
        opacity: 1,
      });
      const matRune = new THREE.MeshStandardMaterial({
        color: '#2cd8d2',
        emissive: new THREE.Color('#1eaab8'),
        emissiveIntensity: 0.95,
        roughness: 0.35,
        metalness: 0.3,
        transparent: true,
        opacity: 1,
      });
      const matBronze = new THREE.MeshStandardMaterial({
        color: '#b88c4a',
        emissive: new THREE.Color('#3b2408'),
        emissiveIntensity: 0.28,
        roughness: 0.36,
        metalness: 0.68,
        transparent: true,
        opacity: 1,
      });

      const base = new THREE.Mesh(pBaseGeo, matStone);
      base.position.y = 0.325;
      base.castShadow = true;
      base.receiveShadow = true;
      pGroup.add(base);

      const shaft = new THREE.Mesh(pShaftGeo, matStone);
      shaft.scale.y = sy;
      shaft.position.y = 0.65 + 4.9 * sy * 0.5;
      shaft.castShadow = true;
      shaft.receiveShadow = true;
      pGroup.add(shaft);

      const band = new THREE.Mesh(pBandGeo, matRune);
      band.rotation.x = Math.PI / 2;
      band.position.y = 2.4;
      pGroup.add(band);

      const topY = 0.65 + 4.9 * sy;
      const collar = new THREE.Mesh(pBandGeo, matBronze);
      collar.rotation.x = Math.PI / 2;
      collar.scale.setScalar(1.06);
      collar.position.y = topY - 0.12;
      pGroup.add(collar);

      const cap = new THREE.Mesh(pCapGeo, matStone);
      cap.position.y = topY + 0.22;
      cap.castShadow = true;
      pGroup.add(cap);

      const finial = new THREE.Mesh(pFinialGeo, matBronze);
      finial.position.y = topY + 0.84;
      pGroup.add(finial);

      this.group.add(pGroup);
      this.zone0Obstacles.push({ x: px, z: pz, r: 0.92 });
      this.occludables.push({
        position: new THREE.Vector3(px, 2.5, pz),
        radius: 2.2,
        materials: [matStone, matRune, matBronze],
        currentOpacity: 1,
      });
    }

    // Perimeter balustrades using InstancedMesh (1 draw call, 2 geometries total!)
    const railStoneMat = new THREE.MeshStandardMaterial({
      map: carvedTex,
      color: '#6e7e92',
      roughness: 0.86,
      metalness: 0.06,
    });
    const postGeo = new THREE.BoxGeometry(0.42, 1.15, 0.42);
    const orbGeo = new THREE.SphereGeometry(0.24, 8, 8);
    const validAngles: number[] = [];
    for (let i = 0; i < 24; i++) {
      const ang = (i / 24) * Math.PI * 2;
      if (Math.sin(ang) < -0.82 && Math.abs(Math.cos(ang)) < 0.45) continue;
      validAngles.push(ang);
    }
    const postInst = new THREE.InstancedMesh(postGeo, railStoneMat, validAngles.length);
    const orbInst = new THREE.InstancedMesh(orbGeo, railStoneMat, validAngles.length);
    postInst.castShadow = true;
    postInst.receiveShadow = true;
    const dummy = new THREE.Object3D();
    validAngles.forEach((ang, idx) => {
      const rx = Math.cos(ang) * 18.7;
      const rz = Math.sin(ang) * 18.7;
      dummy.position.set(rx, 0.58, rz);
      dummy.rotation.set(0, -ang, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      postInst.setMatrixAt(idx, dummy.matrix);
      dummy.position.set(rx, 1.25, rz);
      dummy.updateMatrix();
      orbInst.setMatrixAt(idx, dummy.matrix);
    });
    this.group.add(postInst, orbInst);

    // 6 Carved Stone Lanterns with warm bronze rim trays (shared geometries!)
    const lPedGeo = new THREE.CylinderGeometry(0.28, 0.42, 1.35, 6);
    const lRimGeo = new THREE.CylinderGeometry(0.36, 0.32, 0.12, 6);
    const lFlameGeo = new THREE.OctahedronGeometry(0.22, 1);
    const lCapGeo = new THREE.ConeGeometry(0.66, 0.48, 6);
    const lanternStoneMat = new THREE.MeshStandardMaterial({
      map: carvedTex,
      color: '#7a8a9c',
      roughness: 0.84,
    });
    const lanternBronzeMat = new THREE.MeshStandardMaterial({
      color: '#b88444',
      emissive: new THREE.Color('#472909'),
      emissiveIntensity: 0.32,
      roughness: 0.38,
      metalness: 0.65,
    });
    const roofCapMat = new THREE.MeshStandardMaterial({
      map: lacquerTex,
      color: '#4f3834',
      roughness: 0.68,
    });
    const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 1.15, 0.42) });

    const lanternAngles = [0.42, 1.15, 2.0, 2.72, 3.85, 5.58];
    lanternAngles.forEach((ang, idx) => {
      const lx = Math.cos(ang) * 15.6;
      const lz = Math.sin(ang) * 15.6;
      const lGroup = new THREE.Group();
      lGroup.position.set(lx, 0, lz);

      const lStoneM = lanternStoneMat.clone();
      lStoneM.transparent = true;
      lStoneM.opacity = 1;
      const lBronzeM = lanternBronzeMat.clone();
      lBronzeM.transparent = true;
      lBronzeM.opacity = 1;
      const lRoofM = roofCapMat.clone();
      lRoofM.transparent = true;
      lRoofM.opacity = 1;
      const lFlameM = flameMat.clone();
      lFlameM.transparent = true;
      lFlameM.opacity = 1;

      const ped = new THREE.Mesh(lPedGeo, lStoneM);
      ped.position.y = 0.68;
      ped.castShadow = true;
      lGroup.add(ped);

      const rim = new THREE.Mesh(lRimGeo, lBronzeM);
      rim.position.y = 1.38;
      lGroup.add(rim);

      const flame = new THREE.Mesh(lFlameGeo, lFlameM);
      flame.position.y = 1.62;
      lGroup.add(flame);

      const cap = new THREE.Mesh(lCapGeo, lRoofM);
      cap.position.y = 2.08;
      cap.castShadow = true;
      lGroup.add(cap);

      if (idx < 4) {
        const light = new THREE.PointLight('#ff9c42', 12.5, 15.5, 1.85);
        light.position.set(0, 1.75, 0);
        lGroup.add(light);
        this.lanterns.push({ light, flame, baseIntensity: 12.5, phase: idx * 1.7 });
      }

      this.group.add(lGroup);
      this.zone0Obstacles.push({ x: lx, z: lz, r: 0.48 });
      this.occludables.push({
        position: new THREE.Vector3(lx, 1.35, lz),
        radius: 1.2,
        materials: [lStoneM, lBronzeM, lRoofM, lFlameM],
        currentOpacity: 1,
      });
    });
  }

  private buildPinesAndRocks(carvedTex: THREE.CanvasTexture): void {
    const barkMat = new THREE.MeshStandardMaterial({ color: '#3b2d26', roughness: 0.94 });
    const needleMat = new THREE.MeshStandardMaterial({
      color: '#1b473c',
      roughness: 0.88,
      metalness: 0.02,
    });
    const rockMat = new THREE.MeshStandardMaterial({
      map: carvedTex,
      color: '#445263',
      roughness: 0.92,
      metalness: 0.04,
      flatShading: true,
    });

    // Shared pine & rock geometries
    const trunk1Geo = new THREE.CylinderGeometry(0.26, 0.42, 2.2, 7);
    const trunk2Geo = new THREE.CylinderGeometry(0.18, 0.27, 2.1, 7);
    const padGeo = new THREE.DodecahedronGeometry(1.0, 1);
    const rockGeo = new THREE.DodecahedronGeometry(1.0, 1);

    const pineSpots: Array<[number, number, number, number]> = [
      [-15.4, -12.6, 1.25, 0.4],
      [15.6, -12.2, 1.18, -0.7],
      [-17.6, -1.5, 1.05, 1.2],
      [17.8, 1.8, 1.15, -1.5],
      [-14.8, 13.6, 1.1, 2.3],
      [14.4, 13.8, 1.2, -2.1],
    ];

    for (const [tx, tz, sc, rotY] of pineSpots) {
      const pine = new THREE.Group();
      pine.position.set(tx, -0.1, tz);
      pine.rotation.y = rotY;
      pine.scale.setScalar(sc);

      const pBark = barkMat.clone();
      pBark.transparent = true;
      pBark.opacity = 1;
      const pNeedle = needleMat.clone();
      pNeedle.transparent = true;
      pNeedle.opacity = 1;

      const seg1 = new THREE.Mesh(trunk1Geo, pBark);
      seg1.position.set(0, 1.0, 0);
      seg1.rotation.z = 0.16;
      seg1.castShadow = true;
      pine.add(seg1);

      const seg2 = new THREE.Mesh(trunk2Geo, pBark);
      seg2.position.set(-0.32, 2.8, 0.12);
      seg2.rotation.z = -0.22;
      seg2.castShadow = true;
      pine.add(seg2);

      const pads: Array<[number, number, number, number, number]> = [
        [-0.85, 3.85, 0.2, 2.1, 0.62],
        [0.65, 3.25, -0.35, 1.7, 0.55],
        [-0.1, 4.65, 0.1, 1.65, 0.55],
        [-1.35, 2.85, 0.5, 1.3, 0.45],
      ];
      for (const [px, py, pz, pr, ph] of pads) {
        const pad = new THREE.Mesh(padGeo, pNeedle);
        pad.scale.set(pr, ph, pr * 0.85);
        pad.position.set(px, py, pz);
        pad.castShadow = true;
        pad.receiveShadow = true;
        pine.add(pad);
      }
      this.group.add(pine);
      this.occludables.push({
        position: new THREE.Vector3(tx, 3.0, tz),
        radius: 2.3 * sc,
        materials: [pBark, pNeedle],
        currentOpacity: 1,
      });
    }

    const rockSpots: Array<[number, number, number]> = [
      [-15.2, -5.5, 1.15],
      [15.4, -4.8, 1.08],
      [-14.8, 5.2, 1.0],
      [14.9, 6.0, 1.2],
      [-7.8, -15.2, 1.1],
      [8.2, -15.0, 1.05],
    ];
    for (const [rx, rz, sc] of rockSpots) {
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.scale.set(sc * 1.28, sc * 0.68, sc * 1.02);
      rock.position.set(rx, sc * 0.3, rz);
      rock.rotation.set(this.rng() * 0.35, this.rng() * 6.28, this.rng() * 0.25);
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.group.add(rock);
      this.zone0Obstacles.push({ x: rx, z: rz, r: sc * 1.05 });
    }
  }

  /**
   * Sculpted multi-peak ink-wash Shushan mountain ridges (broad asymmetric silhouettes,
   * never smooth triangular cones; leaves north archway vista open to painted sky dome).
   */
  private buildDistantMountains(): void {
    const ridgeGeo = new THREE.PlaneGeometry(54, 34, 24, 6);
    const pos = ridgeGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const nx = x / 27; // -1..1
      const ny = (y + 17) / 34; // 0..1
      // Asymmetric multi-summit Chinese ink-painting ridge profile
      const env = Math.max(0, 1 - nx * nx);
      const ridge =
        0.55 * Math.sin(nx * 3.1 + 0.5) +
        0.35 * Math.cos(nx * 6.4 - 0.8) +
        0.2 * Math.sin(nx * 12.2 + 1.1);
      const profile = env * (0.65 + 0.35 * ridge);
      const shapedY = -17 + ny * 34 * Math.max(0.08, profile);
      const depthBend = (1 - env) * 4.5 + Math.sin(nx * 4.2) * 2.2;
      pos.setY(i, shapedY);
      pos.setZ(i, depthBend);
    }
    ridgeGeo.computeVertexNormals();

    const peakMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uFogColor: { value: new THREE.Color('#132334') },
      },
      vertexShader: /* glsl */ `
        varying float vH;
        varying float vWorldY;
        void main() {
          vH = clamp((position.y + 17.0) / 30.0, 0.0, 1.0);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldY = wp.y;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uFogColor;
        varying float vH;
        varying float vWorldY;
        void main() {
          vec3 valley = uFogColor * 1.1;
          vec3 crest = vec3(0.09, 0.16, 0.25);
          vec3 col = mix(valley, crest, smoothstep(0.1, 0.85, vH));
          // Silver moonlit mist edge along upper ridge
          col += vec3(0.14, 0.22, 0.30) * smoothstep(0.78, 1.0, vH);
          float alpha = smoothstep(-14.0, -3.0, vWorldY) * 0.78;
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });

    const count = 10;
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + 0.32;
      // Leave north-center corridor open so painted Shushan moonlit sky frames the archway cleanly
      if (Math.sin(ang) < -0.78 && Math.abs(Math.cos(ang)) < 0.5) continue;
      const dist = 84 + (i % 2) * 16;
      const ridge = new THREE.Mesh(ridgeGeo, peakMat);
      ridge.position.set(Math.cos(ang) * dist, 1.5 + (i % 3) * 2.5, Math.sin(ang) * dist);
      ridge.lookAt(0, 1.5, 0);
      this.mountainGroup.add(ridge);
    }
    this.group.add(this.mountainGroup);
  }

  /**
   * Natural dark sage-moss perimeter grass strictly restricted to the cliffside soil rim (r = 15.8..18.9m)
   * — NEVER sprouting glass-shard spikes through paved courtyard flagstones!
   */
  private buildInstancedGrass(): THREE.ShaderMaterial {
    const count = 900;
    const bladeGeo = new THREE.ConeGeometry(0.048, 0.44, 3, 2);
    bladeGeo.translate(0, 0.22, 0);

    const grassMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying float vH;
        varying float vTint;
        void main() {
          vH = clamp(position.y / 0.44, 0.0, 1.0);
          vec4 worldBase = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          vTint = fract(sin(dot(worldBase.xz, vec2(12.9898, 78.233))) * 43758.5453);

          float scaleX = length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2]));
          float sway = sin(uTime * 1.9 + worldBase.x * 0.36 + worldBase.z * 0.28) * 0.14 * vH * vH;
          vec3 p = position;
          p.x += sway / max(scaleX, 0.4);
          p.z += sway * 0.55 / max(scaleX, 0.4);

          vec4 wp = instanceMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vH;
        varying float vTint;
        void main() {
          vec3 rootCol = vec3(0.06, 0.13, 0.11);
          vec3 tipCol = mix(vec3(0.14, 0.27, 0.22), vec3(0.21, 0.33, 0.25), vTint);
          vec3 col = mix(rootCol, tipCol, smoothstep(0.0, 1.0, vH));
          col += vec3(0.05, 0.09, 0.11) * pow(vH, 2.5);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    const mesh = new THREE.InstancedMesh(bladeGeo, grassMat, count);
    const dummy = new THREE.Object3D();
    let placed = 0;
    while (placed < count) {
      const ang = this.rng() * Math.PI * 2;
      const r = 16.0 + this.rng() * 2.8;
      const gx = Math.cos(ang) * r + (this.rng() - 0.5) * 0.6;
      const gz = Math.sin(ang) * r + (this.rng() - 0.5) * 0.6;
      // Keep north shallow ford mouth clear so grass never pokes through Crossing 0 slabs
      if (gz < -13.5 && Math.abs(gx) < 5.9) continue;
      dummy.position.set(gx, 0.0, gz);
      dummy.rotation.set(
        (this.rng() - 0.5) * 0.32,
        this.rng() * Math.PI * 2,
        (this.rng() - 0.5) * 0.32,
      );
      const sx = 0.75 + this.rng() * 0.65;
      const sy = 0.65 + this.rng() * 0.95;
      dummy.scale.set(sx, sy, sx);
      dummy.updateMatrix();
      mesh.setMatrixAt(placed, dummy.matrix);
      placed++;
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    return grassMat;
  }

  private buildWeatherParticles(): {
    petals: THREE.Points;
    petalData: Float32Array;
    fireflies: THREE.Points;
    fireflyData: Float32Array;
  } {
    const petalTex = createSoftParticleTexture('petal');
    const orbTex = createSoftParticleTexture('orb');

    const petalCount = 110;
    const petalPos = new Float32Array(petalCount * 3);
    const petalData = new Float32Array(petalCount * 3);
    for (let i = 0; i < petalCount; i++) {
      // Perimeter-ring spawn (r >= 11.4m) so falling petals frame the courtyard without blocking center combat sightlines
      const a = this.rng() * Math.PI * 2;
      const r = 11.4 + this.rng() * 6.8;
      petalPos[i * 3] = Math.cos(a) * r;
      petalPos[i * 3 + 1] = this.rng() * 9.5;
      petalPos[i * 3 + 2] = Math.sin(a) * r;
      petalData[i * 3] = 0.55 + this.rng() * 0.65;
      petalData[i * 3 + 1] = a;
      petalData[i * 3 + 2] = 0.7 + this.rng() * 0.9;
    }
    const petalGeo = new THREE.BufferGeometry();
    petalGeo.setAttribute('position', new THREE.BufferAttribute(petalPos, 3));
    // Custom shader points clamp max projected pixel size & fade out near camera so zero blurry lens blobs ever appear!
    const petalMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uMap: { value: petalTex },
      },
      vertexShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float dist = max(0.5, -mv.z);
          vAlpha = smoothstep(3.4, 6.4, dist) * 0.68;
          gl_PointSize = clamp(220.0 / dist, 2.0, 13.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying float vAlpha;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          if (t.a * vAlpha < 0.04) discard;
          gl_FragColor = vec4(t.rgb * vec3(1.0, 0.88, 0.92), t.a * vAlpha);
        }
      `,
    });
    const petals = new THREE.Points(petalGeo, petalMat);
    this.group.add(petals);

    // Ambient spirit motes strictly along the outer arena perimeter (r >= 12.2m, low rim height)
    const ffCount = 52;
    const ffPos = new Float32Array(ffCount * 3);
    const ffData = new Float32Array(ffCount * 3);
    for (let i = 0; i < ffCount; i++) {
      const a = this.rng() * Math.PI * 2;
      const r = 12.2 + this.rng() * 6.4;
      ffPos[i * 3] = Math.cos(a) * r;
      ffPos[i * 3 + 1] = 0.65 + this.rng() * 1.95;
      ffPos[i * 3 + 2] = Math.sin(a) * r;
      ffData[i * 3] = a;
      ffData[i * 3 + 1] = r;
      ffData[i * 3 + 2] = this.rng() * Math.PI * 2;
    }
    const ffGeo = new THREE.BufferGeometry();
    ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
    const ffMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uMap: { value: orbTex },
      },
      vertexShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float dist = max(0.5, -mv.z);
          vAlpha = smoothstep(3.4, 6.8, dist) * 0.82;
          gl_PointSize = clamp(210.0 / dist, 2.0, 11.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying float vAlpha;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          if (t.a * vAlpha < 0.04) discard;
          gl_FragColor = vec4(t.rgb * vec3(0.88, 1.15, 0.96), t.a * vAlpha);
        }
      `,
    });
    const fireflies = new THREE.Points(ffGeo, ffMat);
    this.group.add(fireflies);

    return { petals, petalData, fireflies, fireflyData: ffData };
  }

  private buildDriftingMist(): void {
    const mistCanvas = document.createElement('canvas');
    mistCanvas.width = 128;
    mistCanvas.height = 128;
    const ctx = mistCanvas.getContext('2d')!;
    const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
    g.addColorStop(0, 'rgba(130, 178, 210, 0.3)');
    g.addColorStop(0.6, 'rgba(92, 136, 168, 0.12)');
    g.addColorStop(1, 'rgba(60, 90, 120, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const mistTex = new THREE.CanvasTexture(mistCanvas);

    const mistMat = new THREE.MeshBasicMaterial({
      map: mistTex,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mistGeo = new THREE.PlaneGeometry(24, 16);

    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const dist = 24 + (i % 3) * 6;
      const plane = new THREE.Mesh(mistGeo, mistMat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(Math.cos(ang) * dist, -2.5 - (i % 3) * 1.4, Math.sin(ang) * dist);
      plane.userData.baseAngle = ang;
      plane.userData.dist = dist;
      this.group.add(plane);
      this.mistPlanes.push(plane);
    }
  }

  private buildFloatingImmortalPeaks(carvedTex: THREE.CanvasTexture, lacquerTex: THREE.CanvasTexture): void {
    // Natural moonlit slate-granite floating mountain crags (clustered jagged spires, zero cartoon green pancake caps!)
    const rockMat = new THREE.MeshStandardMaterial({
      map: carvedTex,
      color: '#2d3f52',
      emissive: new THREE.Color('#0c1824'),
      emissiveIntensity: 0.26,
      roughness: 0.9,
      metalness: 0.05,
    });
    const capMat = new THREE.MeshStandardMaterial({
      map: carvedTex,
      color: '#25393d',
      emissive: new THREE.Color('#0a191c'),
      emissiveIntensity: 0.18,
      roughness: 0.92,
    });
    const roofMat = new THREE.MeshStandardMaterial({
      map: lacquerTex,
      color: '#2a4d5c',
      emissive: new THREE.Color('#102630'),
      emissiveIntensity: 0.32,
      roughness: 0.58,
      metalness: 0.28,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: '#c9a962',
      emissive: new THREE.Color('#5a3d12'),
      emissiveIntensity: 0.45,
      roughness: 0.34,
      metalness: 0.82,
    });
    // Soft alpha-feathered mountain mist waterfall shader
    const waterfallMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          float edge = sin(vUv.x * 3.14159265);
          float vert = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.08, vUv.y);
          float alpha = pow(edge, 2.0) * vert * 0.24;
          vec3 col = mix(vec3(0.42, 0.68, 0.82), vec3(0.76, 0.88, 0.96), vUv.y);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });

    const specs: Array<[number, number, number, number, boolean]> = [
      [-31, 5.2, -38, 1.12, true],
      [32, 6.2, -37, 1.22, true],
      [-42, 4.2, -18, 1.0, false],
      [43, 5.4, -16, 1.08, true],
      [-27, 9.0, -48, 1.32, true],
      [27, 9.4, -50, 1.26, false],
    ];

    const makeCragGeo = (rad: number, h: number, seed: number) => {
      const g = new THREE.ConeGeometry(rad, h, 18, 7);
      const p = g.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < p.count; k++) {
        const ix = p.getX(k);
        const iy = p.getY(k);
        const iz = p.getZ(k);
        const ang = Math.atan2(iz, ix);
        const crag =
          1.0 +
          0.22 * Math.sin(ang * 3.0 + iy * 0.35 + seed) +
          0.14 * Math.cos(ang * 5.0 - iy * 0.45 + seed * 1.7) +
          0.08 * Math.sin(ang * 7.0 + iy * 0.6);
        p.setX(k, ix * crag);
        p.setZ(k, iz * crag);
      }
      g.computeVertexNormals();
      return g;
    };

    const mainCragGeo = makeCragGeo(4.2, 15.5, 0.4);
    const subCragGeo = makeCragGeo(2.6, 11.2, 2.1);
    const crestGeo = makeCragGeo(4.1, 3.4, 1.2);

    for (let i = 0; i < specs.length; i++) {
      const [px, py, pz, sc, hasPavilion] = specs[i];
      const peak = new THREE.Group();
      peak.position.set(px, py, pz);
      peak.scale.setScalar(sc);
      peak.userData.baseY = py;
      peak.userData.phase = i * 1.15;

      // Main downward jagged limestone spire + 2 fused asymmetric side crags + sculpted rocky summit
      const body = new THREE.Mesh(mainCragGeo, rockMat);
      body.rotation.x = Math.PI;
      body.position.y = -7.2;
      peak.add(body);

      const sub1 = new THREE.Mesh(subCragGeo, rockMat);
      sub1.rotation.set(Math.PI, 1.1 + i, 0.08);
      sub1.position.set(-2.3, -4.6, 0.9);
      const sub2 = new THREE.Mesh(subCragGeo, rockMat);
      sub2.rotation.set(Math.PI, 2.6 + i, -0.07);
      sub2.position.set(2.1, -5.2, -0.7);
      peak.add(sub1, sub2);

      const summit = new THREE.Mesh(crestGeo, capMat);
      summit.position.y = 1.1;
      peak.add(summit);

      const wf = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 14), waterfallMat);
      wf.position.set(1.5, -7.2, 2.0);
      wf.lookAt(0, -7.2, 0);
      peak.add(wf);

      if (hasPavilion) {
        const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.8, 1.4, 6), goldMat);
        base.position.y = 1.7;
        const roof1 = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.35, 6), roofMat);
        roof1.position.y = 3.0;
        const roof2 = new THREE.Mesh(new THREE.ConeGeometry(1.85, 1.1, 6), roofMat);
        roof2.position.y = 4.1;
        const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.14, 1.2, 6), goldMat);
        spire.position.y = 5.0;
        const lamp = new THREE.Mesh(
          new THREE.SphereGeometry(0.32, 8, 8),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(1.45, 1.18, 0.55) }),
        );
        lamp.position.y = 2.1;
        peak.add(base, roof1, roof2, spire, lamp);
      }

      this.group.add(peak);
      this.floatingPeaks.push(peak);
    }
  }

  private buildSkySwordArray(): void {
    this.skySwordRing.position.set(0, 11.2, -23);
    this.skySwordRing.rotation.x = 0.18;
    const bladeMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.55, 1.65, 1.85),
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const guardMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.8, 1.45, 0.55),
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const ringHalo = new THREE.Mesh(
      new THREE.TorusGeometry(13.5, 0.08, 8, 64),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0.42, 1.35, 1.55),
        transparent: true,
        opacity: 0.34,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    ringHalo.rotation.x = Math.PI / 2;
    this.skySwordRing.add(ringHalo);

    const bladeGeo = new THREE.CylinderGeometry(0.06, 0.24, 5.2, 4);
    const guardGeo = new THREE.BoxGeometry(1.45, 0.22, 0.28);
    const count = 12;
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2;
      const sw = new THREE.Group();
      const b = new THREE.Mesh(bladeGeo, bladeMat);
      const gd = new THREE.Mesh(guardGeo, guardMat);
      gd.position.y = 2.65;
      sw.add(b, gd);
      sw.position.set(Math.cos(ang) * 13.5, Math.sin(ang * 2) * 0.65, Math.sin(ang) * 13.5);
      sw.rotation.set(0, -ang, 0.14);
      this.skySwordRing.add(sw);
    }
    this.group.add(this.skySwordRing);
  }

  private buildMoonbeamShafts(): void {
    const beamMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          float horiz = sin(vUv.x * 3.14159265);
          float vert = smoothstep(0.0, 0.28, vUv.y) * smoothstep(1.0, 0.18, vUv.y);
          float shimmer = 0.8 + 0.2 * sin(uTime * 1.1 + vUv.x * 6.0);
          float alpha = pow(horiz, 2.2) * vert * shimmer * 0.13;
          vec3 col = mix(vec3(0.45, 0.82, 1.0), vec3(0.95, 0.86, 0.62), vUv.y * 0.35);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
    const beamGeo = new THREE.PlaneGeometry(5.8, 28);
    // Keep all moonbeams strictly outside |x| >= 18m flanking cliff waterfalls (centerBeamCount === 0)
    const spots: Array<[number, number, number]> = [
      [-21.5, 12.2, -16.0],
      [21.5, 12.2, -16.0],
      [-22.0, 12.4, -63.0],
      [22.0, 12.4, -63.0],
    ];
    for (const [x, y, z] of spots) {
      const m = new THREE.Mesh(beamGeo, beamMat);
      m.position.set(x, y, z);
      m.rotation.set(0.18, 0.12, -0.26);
      this.group.add(m);
      this.moonbeams.push(m);
    }
  }

  setBossMode(active: boolean): void {
    this.setStageTheme(active ? 20 : 1);
  }

  /** Shifts courtyard seal glow, stone-lantern flame palette & sky sword array across all 4 chapters (20 stages). */
  setStageTheme(stageNum: number, overrideChapter?: {
    baguaBase: number;
    lanternLightHex: string;
    lanternFlameHex: string;
    skySwordRgb: [number, number, number];
  }): void {
    const ch = stageNum <= 5 ? 1 : stageNum <= 10 ? 2 : stageNum <= 15 ? 3 : 4;
    const isBoss = stageNum % 5 === 0 || stageNum === 19;
    const bagua = overrideChapter
      ? Math.min(1.0, overrideChapter.baguaBase + (isBoss ? 0.14 : 0))
      : ch === 4
        ? 1.0
        : ch === 3
          ? 0.8
          : ch === 2
            ? 0.52
            : isBoss
              ? 0.42
              : 0.08;
    const lightHex =
      overrideChapter?.lanternLightHex ??
      (ch === 4 ? '#ff424c' : ch === 3 ? '#ff6e3a' : ch === 2 ? '#b96cff' : '#ff9c42');
    const flameHex =
      overrideChapter?.lanternFlameHex ??
      (ch === 4 ? '#ff8278' : ch === 3 ? '#ffae70' : ch === 2 ? '#e1a8ff' : '#ffd28a');
    this.bossIntensity = bagua;
    for (const l of this.lanterns) {
      l.light.color.set(lightHex);
      const fm = l.flame.material as THREE.MeshBasicMaterial;
      if (fm && fm.color) fm.color.set(flameHex);
    }
    if (overrideChapter?.skySwordRgb) {
      const [r, g, b] = overrideChapter.skySwordRgb;
      this.skySwordRing.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh && mesh.material && (mesh.material as THREE.MeshBasicMaterial).color) {
          const mat = mesh.material as THREE.MeshBasicMaterial;
          if (mat.blending === THREE.AdditiveBlending) {
            mat.color.setRGB(r, g, b);
          }
        }
      });
    }
    // Distinct 4-chapter sky & courtyard stone atmosphere tinting (Ch1 Frost Moon -> Ch2 Violet Dusk -> Ch3 Crimson Magma -> Ch4 Abyssal Crimson-Indigo)
    const skyUniforms = (this.skyDome.material as THREE.ShaderMaterial).uniforms;
    if (skyUniforms?.uSkyTint) {
      const skyTintHex = ch === 4 ? '#c46c86' : ch === 3 ? '#d88b68' : ch === 2 ? '#a88ce0' : '#ffffff';
      (skyUniforms.uSkyTint.value as THREE.Color).set(skyTintHex);
    }
    if (this.floorMat) {
      const floorHex = ch === 4 ? '#927488' : ch === 3 ? '#ab8879' : ch === 2 ? '#8e86b2' : '#9fb2c7';
      this.floorMat.color.set(floorHex);
    }
  }

  private buildCorridorWorld(
    carvedTex: THREE.CanvasTexture,
    lacquerTex: THREE.CanvasTexture,
    trimMat: THREE.MeshStandardMaterial,
  ): void {
    const bridgeMaps = createJadeBridgeDeckMaps();
    const streamMaps = createStreamStoneMaps();
    const bridgeDeckMat = new THREE.MeshStandardMaterial({
      map: bridgeMaps.map,
      bumpMap: bridgeMaps.bumpMap,
      bumpScale: 0.09,
      roughnessMap: bridgeMaps.roughnessMap,
      roughness: 0.82,
      metalness: 0.08,
      color: new THREE.Color('#7f9aa8'),
    });
    const streamBedMat = new THREE.MeshStandardMaterial({
      map: streamMaps.map,
      bumpMap: streamMaps.bumpMap,
      bumpScale: 0.12,
      roughnessMap: streamMaps.roughnessMap,
      roughness: 0.48,
      metalness: 0.08,
      color: new THREE.Color('#5a868d'),
    });
    const bronzeChainMat = new THREE.MeshStandardMaterial({
      color: '#9c7840',
      emissive: new THREE.Color('#2c1a06'),
      emissiveIntensity: 0.25,
      roughness: 0.42,
      metalness: 0.78,
    });

    this.chevronMat0 = this.createGuideChevronMaterial();
    this.chevronMat1 = this.createGuideChevronMaterial();

    // Continuous Flanking Canyon Cliffs, Bamboo Groves, Flowing Canyon River & Cliff Waterfalls
    this.buildCanyonScenery(carvedTex);

    // Crossing 0: 碧水浅滩 (Z = -14.5 .. -27.5, halfWidth = 5.4m) + low river-stone barrier at Z = -15.5
    this.buildShallowFordCrossing({
      target: this.bridge0Group,
      centerZ: -21,
      barrierZ: BRIDGE_SPANS[0].barrierZ,
      bedMat: streamBedMat,
      trimMat,
      carvedTex,
      bronzeMat: bronzeChainMat,
      chevronMat: this.chevronMat0,
    });
    this.corridorGroup.add(this.bridge0Group);

    // Zone 1: 翠竹剑涧 (Z = -42)
    this.buildZonePlatform({
      target: this.zone1Group,
      centerZ: -42,
      radius: 19.2,
      cliffTop: 20.2,
      cliffBottom: 12.5,
      height: 1.4,
      baguaSize: 15.5,
      trimMat,
      carvedTex,
      lacquerTex,
      obstaclesOut: this.zone1Obstacles,
      isFinalBossZone: false,
    });
    this.corridorGroup.add(this.zone1Group);

    // Crossing 1: 飞瀑虹桥 (Z = -56 .. -70, halfWidth = 4.8m) + low river-stone barrier at Z = -57.2
    this.buildRainbowArchBridge({
      target: this.bridge1Group,
      centerZ: -63,
      barrierZ: BRIDGE_SPANS[1].barrierZ,
      deckMat: bridgeDeckMat,
      trimMat,
      carvedTex,
      bronzeMat: bronzeChainMat,
      chevronMat: this.chevronMat1,
    });
    this.corridorGroup.add(this.bridge1Group);

    // Zone 2: 锁妖绝壁 (Z = -84)
    this.buildZonePlatform({
      target: this.zone2Group,
      centerZ: -84,
      radius: 20.4,
      cliffTop: 21.4,
      cliffBottom: 13.6,
      height: 1.6,
      baguaSize: 17.5,
      trimMat,
      carvedTex,
      lacquerTex,
      obstaclesOut: this.zone2Obstacles,
      isFinalBossZone: true,
    });
    this.corridorGroup.add(this.zone2Group);
  }

  private buildCanyonScenery(carvedTex: THREE.CanvasTexture): void {
    const cliffMaps = createCanyonCliffMaps();
    const canyonCliffMat = new THREE.MeshStandardMaterial({
      map: cliffMaps.map,
      bumpMap: cliffMaps.bumpMap,
      bumpScale: 0.22,
      roughnessMap: cliffMaps.roughnessMap,
      roughness: 0.92,
      metalness: 0.04,
      color: new THREE.Color('#6b8896'),
    });
    const cliffCrestMat = new THREE.MeshStandardMaterial({
      map: carvedTex,
      color: '#2c4a48',
      roughness: 0.9,
      metalness: 0.03,
      flatShading: true,
    });

    // 1. Continuous Animated Flowing Emerald-Turquoise Canyon River (y = -1.65m)
    this.riverMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorld;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vWorld;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }

        void main() {
          // Scroll rapids toward +Z (downstream)
          vec2 flowUv = vec2(vWorld.x * 0.12, vWorld.z * 0.09 - uTime * 0.58);
          float n1 = noise(flowUv * 2.2);
          float n2 = noise(flowUv * 4.7 + vec2(uTime * 0.14, -uTime * 0.42));
          float stream = n1 * 0.6 + n2 * 0.4;

          // Swirling wakes near Crossing 1 piers (Z = -63) & waterfall plunge zones
          float pierWake = exp(-pow((vWorld.z + 63.0) * 0.16, 2.0)) *
                           (exp(-pow((abs(vWorld.x) - 3.2) * 0.7, 2.0)) * 0.7 + 0.25);
          float bankFoam = smoothstep(14.5, 22.0, abs(vWorld.x)) * 0.42;

          vec3 deepRiver = vec3(0.045, 0.18, 0.23);
          vec3 jadeCurrent = vec3(0.11, 0.42, 0.46);
          vec3 moonSpec = vec3(0.46, 0.80, 0.84);
          vec3 col = mix(deepRiver, jadeCurrent, smoothstep(0.32, 0.76, stream));
          float foam = smoothstep(0.66, 0.88, stream + pierWake * 0.35 + bankFoam * 0.22);
          col = mix(col, moonSpec, foam * 0.65);

          // Subtle moonlight glint
          float glint = pow(max(0.0, sin(vWorld.x * 0.9 + vWorld.z * 0.5 - uTime * 2.4)), 14.0);
          col += vec3(0.28, 0.52, 0.56) * glint * 0.35;

          gl_FragColor = vec4(col, 0.92);
        }
      `,
    });
    const riverMesh = new THREE.Mesh(new THREE.PlaneGeometry(64, 144, 24, 56), this.riverMat);
    riverMesh.rotation.x = -Math.PI / 2;
    riverMesh.position.set(0, -1.65, -44);
    this.corridorGroup.add(riverMesh);
    this.waterMeshes.push(riverMesh);

    // 2. Sculpted Stratified Canyon Cliff Walls (Z = +20 .. -108, |x| = 21..36, height 14..30m)
    const makeCliffGeo = (w: number, h: number, d: number, seed: number) => {
      const geo = new THREE.BoxGeometry(w, h, d, 5, 8, 8);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i);
        const vy = pos.getY(i);
        const vz = pos.getZ(i);
        const ny = (vy + h * 0.5) / h; // 0 bottom .. 1 top
        const strata = Math.sin(vy * 0.85 + seed) * 0.65;
        const jag = Math.sin(vz * 0.27 + seed * 1.3) * 1.4 + Math.cos(vz * 0.58 - seed) * 0.75;
        // Taper subtly near crest while keeping base grounded
        const taper = 1.0 - ny * 0.22;
        const xOff = vx * taper + Math.sign(vx) * (strata * 0.45 + jag * 0.55);
        const yOff = ny > 0.72 ? vy + Math.sin(vz * 0.22 + seed) * 2.2 * (ny - 0.72) * 3.0 : vy;
        pos.setXYZ(i, xOff, yOff, vz);
      }
      geo.computeVertexNormals();
      return geo;
    };

    const cliffSpecs: Array<{ x: number; z: number; h: number; d: number; seed: number }> = [
      { x: -29.5, z: 9, h: 24, d: 28, seed: 0.4 },
      { x: 29.5, z: 9, h: 25, d: 28, seed: 1.2 },
      { x: -27.8, z: -16, h: 26, d: 27, seed: 2.1 },
      { x: 27.8, z: -16, h: 27, d: 27, seed: 2.9 },
      { x: -29.2, z: -41, h: 28, d: 28, seed: 3.7 },
      { x: 29.2, z: -41, h: 26, d: 28, seed: 4.5 },
      { x: -27.5, z: -64, h: 29, d: 26, seed: 5.3 },
      { x: 27.5, z: -64, h: 30, d: 26, seed: 6.1 },
      { x: -29.6, z: -87, h: 31, d: 28, seed: 6.9 },
      { x: 29.6, z: -87, h: 32, d: 28, seed: 7.7 },
      { x: -28.4, z: -102, h: 28, d: 20, seed: 8.5 },
      { x: 28.4, z: -102, h: 29, d: 20, seed: 9.3 },
    ];

    const spireGeo = new THREE.DodecahedronGeometry(1.0, 1);
    const trunkGeo = new THREE.CylinderGeometry(0.24, 0.38, 2.4, 6);
    const padGeo = new THREE.DodecahedronGeometry(1.0, 1);
    const cliffBarkMat = new THREE.MeshStandardMaterial({ color: '#3b2d26', roughness: 0.94 });
    const cliffNeedleMat = new THREE.MeshStandardMaterial({ color: '#1b4a3e', roughness: 0.88 });

    for (const sp of cliffSpecs) {
      const cliffGroup = new THREE.Group();
      const bodyGeo = makeCliffGeo(14.5, sp.h, sp.d, sp.seed);
      const body = new THREE.Mesh(bodyGeo, canyonCliffMat);
      body.position.set(sp.x, sp.h * 0.5 - 6.5, sp.z);
      body.receiveShadow = true;
      cliffGroup.add(body);

      // Crown ridge rock spires
      const crestY = sp.h - 6.8;
      for (let k = -1; k <= 1; k += 2) {
        const crag = new THREE.Mesh(spireGeo, cliffCrestMat);
        crag.scale.set(3.2, 4.2 + (sp.seed % 2.4), 4.6);
        crag.position.set(sp.x - Math.sign(sp.x) * 2.2, crestY, sp.z + k * 6.0);
        crag.rotation.y = sp.seed + k;
        cliffGroup.add(crag);
      }

      // Cliffside pines perched on upper ledges (strictly |x| >= 22m)
      const pineX = sp.x - Math.sign(sp.x) * 4.6;
      const pineY = Math.min(14.5, sp.h * 0.42);
      const pine = new THREE.Group();
      pine.position.set(pineX, pineY, sp.z + (sp.seed % 4) - 2);
      pine.scale.setScalar(1.35);
      const trunk = new THREE.Mesh(trunkGeo, cliffBarkMat);
      trunk.position.y = 1.2;
      trunk.rotation.z = Math.sign(sp.x) * 0.28;
      pine.add(trunk);
      const canopy = new THREE.Mesh(padGeo, cliffNeedleMat);
      canopy.scale.set(2.2, 0.72, 1.9);
      canopy.position.set(-Math.sign(sp.x) * 0.5, 2.5, 0);
      pine.add(canopy);
      cliffGroup.add(pine);

      this.corridorGroup.add(cliffGroup);
      this.canyonCliffs.push(cliffGroup);
    }

    // 3. Swaying Instanced Emerald Bamboo Groves (翠竹) along cliff shelves (|x| >= 21m)
    this.buildCanyonBambooGroves();

    // 4. Animated Cascading Cliff Waterfalls (银练飞瀑) & Churning Plunge Pools
    this.waterfallMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }
        void main() {
          float edge = sin(vUv.x * 3.14159265);
          float streak1 = noise(vec2(vUv.x * 10.0, vUv.y * 6.0 + uTime * 2.2));
          float streak2 = noise(vec2(vUv.x * 18.0 + 3.1, vUv.y * 11.0 + uTime * 3.4));
          float silk = 0.45 + 0.55 * (streak1 * 0.6 + streak2 * 0.4);
          float splash = smoothstep(0.24, 0.0, vUv.y) * 0.75;
          float topFade = smoothstep(1.0, 0.86, vUv.y);
          float alpha = pow(edge, 1.45) * (silk * 0.46 + splash) * topFade;
          if (alpha < 0.02) discard;
          vec3 col = mix(vec3(0.40, 0.84, 0.90), vec3(0.88, 0.98, 1.0), smoothstep(0.55, 0.95, silk + splash));
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });

    this.plungeFoamMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv * 2.0 - 1.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          float r = length(vUv);
          if (r > 1.0) discard;
          float ring1 = smoothstep(0.08, 0.0, abs(fract(r * 2.5 - uTime * 0.65) - 0.5));
          float core = smoothstep(0.65, 0.0, r) * 0.48;
          float fade = smoothstep(1.0, 0.35, r);
          float alpha = (core + ring1 * 0.45 * fade) * fade;
          if (alpha < 0.02) discard;
          gl_FragColor = vec4(vec3(0.66, 0.94, 0.98), alpha * 0.72);
        }
      `,
    });

    const waterfallSpecs: Array<{ x: number; z: number; topY: number; width: number }> = [
      { x: -21.2, z: -16.0, topY: 17.5, width: 4.2 },
      { x: 21.2, z: -16.0, topY: 18.0, width: 4.2 },
      { x: -21.6, z: -44.0, topY: 19.5, width: 4.6 },
      { x: -20.8, z: -63.0, topY: 18.5, width: 4.4 },
      { x: 20.8, z: -63.0, topY: 19.0, width: 4.4 },
      { x: 21.6, z: -86.0, topY: 21.0, width: 4.8 },
    ];

    const poolGeo = new THREE.PlaneGeometry(7.6, 7.6);
    for (const wf of waterfallSpecs) {
      const h = wf.topY + 2.0;
      const wfMesh = new THREE.Mesh(new THREE.PlaneGeometry(wf.width, h, 4, 8), this.waterfallMat);
      wfMesh.position.set(wf.x, wf.topY * 0.5 - 0.9, wf.z);
      wfMesh.rotation.y = wf.x < 0 ? Math.PI / 2 : -Math.PI / 2;
      wfMesh.rotation.z = wf.x < 0 ? -0.1 : 0.1;
      this.corridorGroup.add(wfMesh);
      this.waterMeshes.push(wfMesh);

      const pool = new THREE.Mesh(poolGeo, this.plungeFoamMat);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(wf.x - Math.sign(wf.x) * 2.2, -1.56, wf.z);
      this.corridorGroup.add(pool);
      this.waterMeshes.push(pool);
    }
  }

  private buildCanyonBambooGroves(): void {
    const stalkCount = 160;
    const culmGeo = new THREE.CylinderGeometry(0.09, 0.13, 8.2, 6, 4);
    culmGeo.translate(0, 4.1, 0);

    this.bambooMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying float vH;
        void main() {
          vH = clamp(position.y / 8.2, 0.0, 1.0);
          vec4 wb = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float sway = sin(uTime * 1.45 + wb.x * 0.25 + wb.z * 0.19) * 0.34 * vH * vH;
          vec3 p = position;
          p.x += sway;
          p.z += sway * 0.45;
          gl_Position = projectionMatrix * viewMatrix * instanceMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vH;
        void main() {
          float node = smoothstep(0.08, 0.0, abs(fract(vH * 7.0) - 0.5));
          vec3 col = mix(vec3(0.08, 0.28, 0.20), vec3(0.20, 0.52, 0.34), vH);
          col = mix(col, vec3(0.45, 0.68, 0.42), node * 0.45);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    const leafCount = stalkCount * 2;
    const leafGeo = new THREE.ConeGeometry(0.95, 2.2, 5);
    this.bambooLeafMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying float vH;
        void main() {
          vH = clamp((position.y + 1.1) / 2.2, 0.0, 1.0);
          vec4 wb = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float sway = sin(uTime * 1.45 + wb.x * 0.25 + wb.z * 0.19) * 0.38;
          vec3 p = position;
          p.x += sway * (0.6 + 0.4 * vH);
          gl_Position = projectionMatrix * viewMatrix * instanceMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vH;
        void main() {
          vec3 col = mix(vec3(0.09, 0.32, 0.24), vec3(0.24, 0.58, 0.38), vH);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    const culmInst = new THREE.InstancedMesh(culmGeo, this.bambooMat, stalkCount);
    const leafInst = new THREE.InstancedMesh(leafGeo, this.bambooLeafMat, leafCount);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < stalkCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const bx = side * (21.6 + this.rng() * 7.2);
      const bz = 14 - (i / stalkCount) * 116 + (this.rng() - 0.5) * 4.5;
      const by = 4.5 + this.rng() * 6.5;
      const sc = 0.8 + this.rng() * 0.65;
      const tilt = (this.rng() - 0.5) * 0.16;

      dummy.position.set(bx, by, bz);
      dummy.rotation.set(tilt, this.rng() * Math.PI * 2, side * -0.08 + tilt);
      dummy.scale.set(sc, sc * (0.9 + this.rng() * 0.35), sc);
      dummy.updateMatrix();
      culmInst.setMatrixAt(i, dummy.matrix);

      for (let l = 0; l < 2; l++) {
        dummy.position.set(bx - side * 0.15, by + (5.8 + l * 1.6) * sc, bz);
        dummy.rotation.set(0.25 * (l === 0 ? 1 : -1), this.rng() * Math.PI * 2, 0.2 * side);
        dummy.scale.set(sc * (1.1 - l * 0.2), sc * 0.85, sc * (1.1 - l * 0.2));
        dummy.updateMatrix();
        leafInst.setMatrixAt(i * 2 + l, dummy.matrix);
      }
    }
    culmInst.instanceMatrix.needsUpdate = true;
    leafInst.instanceMatrix.needsUpdate = true;
    culmInst.frustumCulled = false;
    leafInst.frustumCulled = false;
    this.corridorGroup.add(culmInst, leafInst);
  }

  private createGuideChevronMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uUnlocked: { value: 0.18 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uUnlocked;
        varying vec2 vUv;
        void main() {
          float dx = abs(vUv.x - 0.5);
          if (dx > 0.45) discard;
          // Chevrons point toward +vUv.y (-Z forward along the crossing)
          float phase = fract(vUv.y * 4.5 + dx * 1.35 - uTime * (0.55 + uUnlocked * 1.15));
          float band = smoothstep(0.06, 0.18, phase) * smoothstep(0.46, 0.24, phase);
          float sideFade = smoothstep(0.45, 0.18, dx);
          float endFade = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.88, vUv.y);
          float railLine = smoothstep(0.025, 0.005, abs(dx - 0.40)) * 0.45;
          float m = clamp(band * sideFade + railLine, 0.0, 1.0) * endFade;
          if (m < 0.02) discard;
          vec3 unlockedCol = mix(vec3(0.24, 0.86, 0.90), vec3(0.98, 0.78, 0.34), smoothstep(0.15, 0.4, dx));
          vec3 lockedCol = vec3(0.92, 0.38, 0.26);
          vec3 col = mix(lockedCol, unlockedCol, smoothstep(0.2, 0.9, uUnlocked));
          gl_FragColor = vec4(col, m * (0.28 + uUnlocked * 0.56));
        }
      `,
    });
  }

  /**
   * Low river-stone rune markers (<= 0.95m, |x| = 4.9m) + low 1.65m parting water-rune mist ribbon
   * so forward sightlines and guide arrows remain 100% unobstructed.
   */
  private createSpiritBarrierGate(
    barrierZ: number,
    carvedTex: THREE.CanvasTexture,
    bronzeMat: THREE.MeshStandardMaterial,
  ): SpiritBarrierGate {
    const gateGroup = new THREE.Group();
    gateGroup.position.set(0, 0, barrierZ);

    const markerMat = new THREE.MeshStandardMaterial({
      map: carvedTex,
      color: '#637d8f',
      roughness: 0.78,
      metalness: 0.1,
    });
    const crystalMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.45, 1.65, 1.85),
    });

    const plinthGeo = new THREE.BoxGeometry(0.92, 0.34, 0.92);
    const stoneGeo = new THREE.CylinderGeometry(0.26, 0.36, 0.38, 6);
    const ringGeo = new THREE.TorusGeometry(0.30, 0.04, 6, 14);
    const capGeo = new THREE.OctahedronGeometry(0.15, 0);
    for (const sx of [-4.9, 4.9]) {
      const plinth = new THREE.Mesh(plinthGeo, markerMat);
      plinth.position.set(sx, 0.17, 0);
      plinth.castShadow = true;
      plinth.receiveShadow = true;
      const stone = new THREE.Mesh(stoneGeo, markerMat);
      stone.position.set(sx, 0.53, 0);
      stone.castShadow = true;
      const ring = new THREE.Mesh(ringGeo, bronzeMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(sx, 0.73, 0);
      const crystal = new THREE.Mesh(capGeo, crystalMat);
      crystal.position.set(sx, 0.80, 0);
      gateGroup.add(plinth, stone, ring, crystal);
    }

    const barrierMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uOpen: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uOpen;
        varying vec2 vUv;
        void main() {
          float dissolve = 1.0 - smoothstep(0.05, 0.98, uOpen);
          if (dissolve < 0.01) discard;
          vec2 c = vUv * 2.0 - 1.0;
          float partGap = uOpen * 1.15;
          float curtainMask = smoothstep(partGap - 0.14, partGap + 0.14, abs(c.x));
          float wave = sin(vUv.x * 16.0 - uTime * 2.8) * 0.12 + cos(vUv.x * 9.0 + uTime * 1.9) * 0.08;
          float ribbon = smoothstep(0.92, 0.18, abs(c.y + wave));
          float runeTicks = pow(abs(sin(vUv.x * 22.0 + uTime * 2.1)), 5.0) * 0.55;
          float edgeFade = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x)
                         * smoothstep(0.0, 0.14, vUv.y) * smoothstep(1.0, 0.78, vUv.y);
          float pulse = 0.78 + 0.22 * sin(uTime * 4.0 + vUv.x * 7.0);
          float alpha = (0.24 + ribbon * 0.52 + runeTicks * 0.35) * edgeFade * curtainMask * dissolve * pulse * 0.76;
          if (alpha < 0.015) discard;
          vec3 lockedCol = mix(vec3(0.96, 0.38, 0.34), vec3(0.32, 0.88, 0.92), runeTicks);
          vec3 openBurst = vec3(0.36, 0.95, 0.96);
          vec3 col = mix(lockedCol, openBurst, smoothstep(0.05, 0.55, uOpen));
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });

    const curtain = new THREE.Mesh(new THREE.PlaneGeometry(9.4, 1.65), barrierMat);
    curtain.position.set(0, 0.825, 0);
    gateGroup.add(curtain);

    return {
      group: gateGroup,
      curtain,
      mat: barrierMat,
      openProgress: 0,
      zPos: barrierZ,
    };
  }

  /**
   * Crossing 0 — 碧水浅滩: wadeable shallow stream ford (y = -0.04m bed, +0.01m wet stepping slabs,
   * +0.035m shimmering water overlay, smooth bank stones <= 0.42m, ZERO tall railings/posts).
   */
  private buildShallowFordCrossing(opts: {
    target: THREE.Group;
    centerZ: number;
    barrierZ: number;
    bedMat: THREE.MeshStandardMaterial;
    trimMat: THREE.MeshStandardMaterial;
    carvedTex: THREE.CanvasTexture;
    bronzeMat: THREE.MeshStandardMaterial;
    chevronMat: THREE.ShaderMaterial;
  }): void {
    const { target, centerZ, barrierZ, bedMat, trimMat, carvedTex, bronzeMat, chevronMat } = opts;

    // Shallow river-bed shelf (top at y = -0.04m, extending smoothly to Zone 0 lip & Zone 1 shoal)
    const bed = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.26, 16.0), bedMat);
    bed.position.set(0, -0.17, centerZ);
    bed.receiveShadow = true;
    target.add(bed);

    const underRock = new THREE.Mesh(new THREE.BoxGeometry(10.8, 1.7, 15.0), trimMat);
    underRock.position.set(0, -1.05, centerZ);
    target.add(underRock);

    // Wet mossy stepping-stone slabs (top at y = +0.01m)
    const slabMat = new THREE.MeshStandardMaterial({
      map: carvedTex,
      color: '#4e6c73',
      roughness: 0.34,
      metalness: 0.1,
    });
    const slabGeo = new THREE.CylinderGeometry(1.0, 1.12, 0.14, 7);
    const slabSpots: Array<[number, number, number, number, number]> = [
      [-1.7, centerZ + 5.6, 1.45, 0.95, 0.2],
      [1.8, centerZ + 5.2, 1.38, 0.92, -0.4],
      [-0.3, centerZ + 3.8, 1.65, 1.05, 0.1],
      [2.6, centerZ + 2.6, 1.28, 0.88, 0.7],
      [-2.5, centerZ + 2.0, 1.35, 0.95, -0.5],
      [0.4, centerZ + 0.5, 1.72, 1.1, 0.3],
      [-1.9, centerZ - 1.2, 1.48, 0.98, -0.2],
      [2.1, centerZ - 1.8, 1.42, 0.94, 0.5],
      [-0.2, centerZ - 3.3, 1.62, 1.05, -0.1],
      [2.3, centerZ - 4.7, 1.32, 0.9, 0.6],
      [-2.2, centerZ - 5.1, 1.38, 0.95, -0.3],
      [0.2, centerZ - 6.2, 1.55, 0.98, 0.2],
    ];
    for (const [sx, sz, rx, rz, rot] of slabSpots) {
      const slab = new THREE.Mesh(slabGeo, slabMat);
      slab.scale.set(rx, 1.0, rz);
      slab.rotation.y = rot;
      slab.position.set(sx, -0.06, sz);
      slab.receiveShadow = true;
      target.add(slab);
    }

    // Shimmering ankle-deep flowing crystal water overlay (y = 0.035m)
    this.shallowWaterMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorld;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vWorld;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }

        void main() {
          // Gentle mountain stream drifting diagonally across the ford
          vec2 flow = vec2(vWorld.x * 0.45 - uTime * 0.72, vWorld.z * 0.42 + uTime * 0.28);
          float r1 = noise(flow * 2.1);
          float r2 = noise(flow * 4.4 + vec2(uTime * 0.35, -uTime * 0.2));
          float caustic = smoothstep(0.56, 0.88, r1 * 0.55 + r2 * 0.45);
          float edgeX = smoothstep(0.0, 0.10, vUv.x) * smoothstep(1.0, 0.90, vUv.x);
          float edgeZ = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.88, vUv.y);
          vec3 col = mix(vec3(0.16, 0.58, 0.64), vec3(0.68, 0.96, 0.96), caustic * 0.72);
          float alpha = (0.30 + caustic * 0.28) * edgeX * edgeZ;
          if (alpha < 0.02) discard;
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
    const shallowWater = new THREE.Mesh(
      new THREE.PlaneGeometry(11.4, 16.4, 16, 24),
      this.shallowWaterMat,
    );
    shallowWater.rotation.x = -Math.PI / 2;
    shallowWater.position.set(0, 0.035, centerZ);
    target.add(shallowWater);
    this.waterMeshes.push(shallowWater);

    // Smoothed natural bank stones flanking |x| = 5.65..6.35m (<= 0.42m high, ZERO railings/posts)
    const bankGeo = new THREE.DodecahedronGeometry(0.65, 1);
    const bankMat = new THREE.MeshStandardMaterial({
      map: carvedTex,
      color: '#485d66',
      roughness: 0.78,
      flatShading: true,
    });
    for (const sx of [-5.85, 5.85]) {
      for (let k = 0; k < 8; k++) {
        const bz = centerZ + 6.2 - k * 1.75;
        const stone = new THREE.Mesh(bankGeo, bankMat);
        stone.scale.set(1.05 + (k % 3) * 0.14, 0.42, 1.35);
        stone.position.set(sx + (k % 2) * 0.18 * Math.sign(sx), 0.12, bz);
        stone.rotation.y = k * 0.8 + sx;
        stone.receiveShadow = true;
        stone.castShadow = true;
        target.add(stone);
      }
    }

    // Luminous jade guide chevrons pointing -Z across the shallow ford
    const chevronPlane = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 12.6), chevronMat);
    chevronPlane.rotation.x = -Math.PI / 2;
    chevronPlane.position.set(0, 0.048, centerZ);
    target.add(chevronPlane);

    const gate = this.createSpiritBarrierGate(barrierZ, carvedTex, bronzeMat);
    target.add(gate.group);
    this.barriers.push(gate);
  }

  /**
   * Crossing 1 — 飞瀑虹桥: graceful low-curb arched canyon stone bridge above rushing rapids
   * between twin cliff waterfalls (curbs <= 0.44m, ZERO tall blocking posts).
   */
  private buildRainbowArchBridge(opts: {
    target: THREE.Group;
    centerZ: number;
    barrierZ: number;
    deckMat: THREE.MeshStandardMaterial;
    trimMat: THREE.MeshStandardMaterial;
    carvedTex: THREE.CanvasTexture;
    bronzeMat: THREE.MeshStandardMaterial;
    chevronMat: THREE.ShaderMaterial;
  }): void {
    const { target, centerZ, barrierZ, deckMat, trimMat, carvedTex, bronzeMat, chevronMat } = opts;

    // Main bridge stone deck (width 9.8m for halfWidth = 4.8m, top flush at y = -0.01m)
    const deck = new THREE.Mesh(new THREE.BoxGeometry(9.8, 0.88, 14.4), deckMat);
    deck.position.set(0, -0.45, centerZ);
    deck.receiveShadow = true;
    deck.castShadow = true;
    target.add(deck);

    // Graceful arched stone vault ribs underneath over rushing river rapids
    const archCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -2.15, 6.8),
      new THREE.Vector3(0, -0.75, 0),
      new THREE.Vector3(0, -2.15, -6.8),
    ]);
    const archRibGeo = new THREE.TubeGeometry(archCurve, 18, 0.42, 8, false);
    for (const ax of [-4.1, 0, 4.1]) {
      const rib = new THREE.Mesh(archRibGeo, trimMat);
      rib.position.set(ax, 0, centerZ);
      target.add(rib);
    }

    // Sturdy river piers rooted below y = -1.65m
    const pierGeo = new THREE.BoxGeometry(1.5, 14.0, 1.8);
    for (const pz of [centerZ + 3.6, centerZ - 3.6]) {
      for (const px of [-3.2, 3.2]) {
        const pier = new THREE.Mesh(pierGeo, trimMat);
        pier.position.set(px, -8.4, pz);
        target.add(pier);
      }
    }

    // Low carved rainbow-arch side curbs (height <= 0.44m, ZERO tall blocking posts)
    const lowCurbMat = new THREE.MeshStandardMaterial({
      map: carvedTex,
      color: '#738e98',
      roughness: 0.68,
      metalness: 0.1,
    });
    const lowCurbGeo = new THREE.BoxGeometry(0.46, 0.34, 13.8);
    const archCrownGeo = new THREE.BoxGeometry(0.50, 0.42, 5.2);
    const endBollardGeo = new THREE.BoxGeometry(0.58, 0.44, 0.58);

    for (const sx of [-4.92, 4.92]) {
      const baseCurb = new THREE.Mesh(lowCurbGeo, lowCurbMat);
      baseCurb.position.set(sx, 0.17, centerZ);
      baseCurb.receiveShadow = true;
      baseCurb.castShadow = true;
      target.add(baseCurb);

      const archCrown = new THREE.Mesh(archCrownGeo, lowCurbMat);
      archCrown.position.set(sx, 0.21, centerZ);
      archCrown.receiveShadow = true;
      target.add(archCrown);

      for (const bz of [centerZ + 6.6, centerZ - 6.6]) {
        const bollard = new THREE.Mesh(endBollardGeo, bronzeMat);
        bollard.position.set(sx, 0.22, bz);
        target.add(bollard);
      }
    }

    // Glowing guide chevrons pointing -Z
    const chevronPlane = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 12.2), chevronMat);
    chevronPlane.rotation.x = -Math.PI / 2;
    chevronPlane.position.set(0, 0.022, centerZ);
    target.add(chevronPlane);

    const gate = this.createSpiritBarrierGate(barrierZ, carvedTex, bronzeMat);
    target.add(gate.group);
    this.barriers.push(gate);
  }

  private buildZonePlatform(opts: {
    target: THREE.Group;
    centerZ: number;
    radius: number;
    cliffTop: number;
    cliffBottom: number;
    height: number;
    baguaSize: number;
    trimMat: THREE.MeshStandardMaterial;
    carvedTex: THREE.CanvasTexture;
    lacquerTex: THREE.CanvasTexture;
    obstaclesOut: CircleObstacle[];
    isFinalBossZone: boolean;
  }): void {
    const {
      target,
      centerZ,
      radius,
      cliffTop,
      cliffBottom,
      height,
      baguaSize,
      trimMat,
      carvedTex,
      lacquerTex,
      obstaclesOut,
      isFinalBossZone,
    } = opts;

    const terrace = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius + 1.2, height, 32),
      this.floorMat,
    );
    terrace.position.set(0, -height * 0.5, centerZ);
    terrace.receiveShadow = true;
    target.add(terrace);

    const cliff = new THREE.Mesh(
      new THREE.CylinderGeometry(cliffTop, cliffBottom, 22, 16),
      this.cliffMat,
    );
    cliff.position.set(0, -12.3, centerZ);
    target.add(cliff);

    const curbR = radius - 0.45;
    if (isFinalBossZone) {
      // Open only on +Z (south entrance from Crossing 1)
      const southOpenCurb = new THREE.Mesh(
        new THREE.TorusGeometry(curbR, 0.38, 10, 44, Math.PI * 2 - 0.56),
        trimMat,
      );
      southOpenCurb.rotation.set(Math.PI / 2, 0, Math.PI / 2 + 0.28);
      southOpenCurb.position.set(0, 0.08, centerZ);
      southOpenCurb.castShadow = true;
      southOpenCurb.receiveShadow = true;
      target.add(southOpenCurb);
    } else {
      // Zone 1 can have either south+north openings (maxZone === 2) or south-only opening (maxZone === 1)
      this.zone1DoubleOpenCurb = new THREE.Group();
      const rightArc = new THREE.Mesh(
        new THREE.TorusGeometry(curbR, 0.36, 10, 22, Math.PI - 0.60),
        trimMat,
      );
      rightArc.rotation.set(Math.PI / 2, 0, -Math.PI / 2 + 0.30);
      rightArc.position.set(0, 0.08, centerZ);
      rightArc.castShadow = true;
      const leftArc = new THREE.Mesh(
        new THREE.TorusGeometry(curbR, 0.36, 10, 22, Math.PI - 0.60),
        trimMat,
      );
      leftArc.rotation.set(Math.PI / 2, 0, Math.PI / 2 + 0.30);
      leftArc.position.set(0, 0.08, centerZ);
      leftArc.castShadow = true;
      this.zone1DoubleOpenCurb.add(rightArc, leftArc);
      target.add(this.zone1DoubleOpenCurb);

      this.zone1SouthOpenCurb = new THREE.Mesh(
        new THREE.TorusGeometry(curbR, 0.36, 10, 44, Math.PI * 2 - 0.62),
        trimMat,
      );
      this.zone1SouthOpenCurb.rotation.set(Math.PI / 2, 0, Math.PI / 2 + 0.31);
      this.zone1SouthOpenCurb.position.set(0, 0.08, centerZ);
      this.zone1SouthOpenCurb.castShadow = true;
      this.zone1SouthOpenCurb.visible = false;
      target.add(this.zone1SouthOpenCurb);
    }

    // Illuminated Bagua Stone Seal
    const baguaPlane = new THREE.Mesh(new THREE.PlaneGeometry(baguaSize, baguaSize), this.baguaMat);
    baguaPlane.rotation.x = -Math.PI / 2;
    baguaPlane.position.set(0, 0.024, centerZ);
    target.add(baguaPlane);

    // 4 Corner Carved Rune Pillars (strictly outside |x| >= 11.4 so crossings stay wide open)
    const pBaseGeo = new THREE.CylinderGeometry(0.76, 0.94, 0.65, 8);
    const pShaftGeo = new THREE.CylinderGeometry(0.5, 0.62, 5.2, 8);
    const pBandGeo = new THREE.TorusGeometry(0.56, 0.05, 8, 20);
    const pCapGeo = new THREE.CylinderGeometry(0.78, 0.52, 0.45, 8);
    const pFinialGeo = new THREE.ConeGeometry(0.18, 0.88, 6);

    const pxOff = isFinalBossZone ? 12.2 : 11.4;
    const pzOff = isFinalBossZone ? 9.0 : 8.6;
    const pillarSpots: Array<[number, number, number]> = [
      [-pxOff, centerZ - pzOff, 1.06],
      [pxOff, centerZ - pzOff, 1.08],
      [-pxOff, centerZ + pzOff, 0.98],
      [pxOff, centerZ + pzOff, 1.0],
    ];
    for (const [px, pz, sy] of pillarSpots) {
      const pGroup = new THREE.Group();
      pGroup.position.set(px, 0, pz);
      const matStone = new THREE.MeshStandardMaterial({
        map: carvedTex,
        color: '#8899ad',
        roughness: 0.8,
        metalness: 0.08,
        transparent: true,
        opacity: 1,
      });
      const matRune = new THREE.MeshStandardMaterial({
        color: isFinalBossZone ? '#e84c5c' : '#2cd8d2',
        emissive: new THREE.Color(isFinalBossZone ? '#b02438' : '#1eaab8'),
        emissiveIntensity: 0.95,
        roughness: 0.35,
        metalness: 0.3,
        transparent: true,
        opacity: 1,
      });
      const matBronze = new THREE.MeshStandardMaterial({
        color: '#b88c4a',
        emissive: new THREE.Color('#3b2408'),
        emissiveIntensity: 0.28,
        roughness: 0.36,
        metalness: 0.68,
        transparent: true,
        opacity: 1,
      });

      const base = new THREE.Mesh(pBaseGeo, matStone);
      base.position.y = 0.325;
      base.castShadow = true;
      base.receiveShadow = true;
      const shaft = new THREE.Mesh(pShaftGeo, matStone);
      shaft.scale.y = sy;
      shaft.position.y = 0.65 + 5.2 * sy * 0.5;
      shaft.castShadow = true;
      shaft.receiveShadow = true;
      const band = new THREE.Mesh(pBandGeo, matRune);
      band.rotation.x = Math.PI / 2;
      band.position.y = 2.5;
      const topY = 0.65 + 5.2 * sy;
      const collar = new THREE.Mesh(pBandGeo, matBronze);
      collar.rotation.x = Math.PI / 2;
      collar.scale.setScalar(1.06);
      collar.position.y = topY - 0.12;
      const cap = new THREE.Mesh(pCapGeo, matStone);
      cap.position.y = topY + 0.22;
      const finial = new THREE.Mesh(pFinialGeo, matBronze);
      finial.position.y = topY + 0.84;

      pGroup.add(base, shaft, band, collar, cap, finial);
      target.add(pGroup);
      obstaclesOut.push({ x: px, z: pz, r: 0.92 });
      this.occludables.push({
        position: new THREE.Vector3(px, 2.5, pz),
        radius: 2.2,
        materials: [matStone, matRune, matBronze],
        currentOpacity: 1,
      });
    }

    // 4 Carved Stone Lanterns (registered in occludables with per-lantern materials)
    const lPedGeo = new THREE.CylinderGeometry(0.28, 0.42, 1.35, 6);
    const lRimGeo = new THREE.CylinderGeometry(0.36, 0.32, 0.12, 6);
    const lFlameGeo = new THREE.OctahedronGeometry(0.22, 1);
    const lCapGeo = new THREE.ConeGeometry(0.66, 0.48, 6);
    const lanternStoneMat = new THREE.MeshStandardMaterial({ map: carvedTex, color: '#7a8a9c', roughness: 0.84 });
    const lanternBronzeMat = new THREE.MeshStandardMaterial({
      color: '#b88444',
      emissive: new THREE.Color('#472909'),
      emissiveIntensity: 0.32,
      roughness: 0.38,
      metalness: 0.65,
    });
    const roofCapMat = new THREE.MeshStandardMaterial({ map: lacquerTex, color: '#4f3834', roughness: 0.68 });
    const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 1.15, 0.42) });

    const lxOff = isFinalBossZone ? 14.6 : 13.8;
    const lzOff = 5.2;
    const lanternSpots: Array<[number, number]> = [
      [-lxOff, centerZ - lzOff],
      [lxOff, centerZ - lzOff],
      [-lxOff, centerZ + lzOff],
      [lxOff, centerZ + lzOff],
    ];
    lanternSpots.forEach(([lx, lz], idx) => {
      const lGroup = new THREE.Group();
      lGroup.position.set(lx, 0, lz);
      const lStoneM = lanternStoneMat.clone();
      lStoneM.transparent = true;
      lStoneM.opacity = 1;
      const lBronzeM = lanternBronzeMat.clone();
      lBronzeM.transparent = true;
      lBronzeM.opacity = 1;
      const lRoofM = roofCapMat.clone();
      lRoofM.transparent = true;
      lRoofM.opacity = 1;
      const lFlameM = flameMat.clone();
      lFlameM.transparent = true;
      lFlameM.opacity = 1;

      const ped = new THREE.Mesh(lPedGeo, lStoneM);
      ped.position.y = 0.68;
      ped.castShadow = true;
      const rim = new THREE.Mesh(lRimGeo, lBronzeM);
      rim.position.y = 1.38;
      const flame = new THREE.Mesh(lFlameGeo, lFlameM);
      flame.position.y = 1.62;
      const cap = new THREE.Mesh(lCapGeo, lRoofM);
      cap.position.y = 2.08;
      cap.castShadow = true;
      lGroup.add(ped, rim, flame, cap);
      if (idx < 2) {
        const light = new THREE.PointLight('#ff9c42', 11.5, 16.0, 1.85);
        light.position.set(0, 1.75, 0);
        lGroup.add(light);
        this.lanterns.push({ light, flame, baseIntensity: 11.5, phase: centerZ * 0.1 + idx * 1.9 });
      }
      target.add(lGroup);
      obstaclesOut.push({ x: lx, z: lz, r: 0.48 });
      this.occludables.push({
        position: new THREE.Vector3(lx, 1.35, lz),
        radius: 1.2,
        materials: [lStoneM, lBronzeM, lRoofM, lFlameM],
        currentOpacity: 1,
      });
    });

    // Cliffside Pine Trees & Perimeter Boulders (strictly clear of bridge lanes & registered in occludables)
    const barkMat = new THREE.MeshStandardMaterial({ color: '#3b2d26', roughness: 0.94 });
    const needleMat = new THREE.MeshStandardMaterial({ color: '#1b473c', roughness: 0.88, metalness: 0.02 });
    const rockMat = new THREE.MeshStandardMaterial({
      map: carvedTex,
      color: '#445263',
      roughness: 0.92,
      metalness: 0.04,
      flatShading: true,
    });
    const trunk1Geo = new THREE.CylinderGeometry(0.26, 0.42, 2.2, 7);
    const trunk2Geo = new THREE.CylinderGeometry(0.18, 0.27, 2.1, 7);
    const padGeo = new THREE.DodecahedronGeometry(1.0, 1);
    const rockGeo = new THREE.DodecahedronGeometry(1.0, 1);

    const pxTree = isFinalBossZone ? 16.5 : 15.6;
    const pineSpots: Array<[number, number, number, number]> = [
      [-pxTree, centerZ - 11.5, 1.18, 0.5],
      [pxTree, centerZ - 11.5, 1.15, -0.8],
      [-pxTree, centerZ + 11.2, 1.08, 1.8],
      [pxTree, centerZ + 11.2, 1.12, -2.0],
    ];
    for (const [tx, tz, sc, rotY] of pineSpots) {
      const pine = new THREE.Group();
      pine.position.set(tx, -0.1, tz);
      pine.rotation.y = rotY;
      pine.scale.setScalar(sc);
      const pBark = barkMat.clone();
      pBark.transparent = true;
      pBark.opacity = 1;
      const pNeedle = needleMat.clone();
      pNeedle.transparent = true;
      pNeedle.opacity = 1;

      const seg1 = new THREE.Mesh(trunk1Geo, pBark);
      seg1.position.set(0, 1.0, 0);
      seg1.rotation.z = 0.16;
      seg1.castShadow = true;
      const seg2 = new THREE.Mesh(trunk2Geo, pBark);
      seg2.position.set(-0.32, 2.8, 0.12);
      seg2.rotation.z = -0.22;
      seg2.castShadow = true;
      pine.add(seg1, seg2);
      const pads: Array<[number, number, number, number, number]> = [
        [-0.85, 3.85, 0.2, 2.1, 0.62],
        [0.65, 3.25, -0.35, 1.7, 0.55],
        [-0.1, 4.65, 0.1, 1.65, 0.55],
      ];
      for (const [px, py, pz, pr, ph] of pads) {
        const pad = new THREE.Mesh(padGeo, pNeedle);
        pad.scale.set(pr, ph, pr * 0.85);
        pad.position.set(px, py, pz);
        pad.castShadow = true;
        pad.receiveShadow = true;
        pine.add(pad);
      }
      target.add(pine);
      this.occludables.push({
        position: new THREE.Vector3(tx, 3.0, tz),
        radius: 2.3 * sc,
        materials: [pBark, pNeedle],
        currentOpacity: 1,
      });
    }

    const rockSpots: Array<[number, number, number]> = [
      [-15.2, centerZ - 1.8, 1.1],
      [15.4, centerZ + 1.5, 1.08],
      [-9.2, centerZ - 13.8, 1.05],
      [9.4, centerZ + 13.6, 1.02],
    ];
    for (const [rx, rz, sc] of rockSpots) {
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.scale.set(sc * 1.25, sc * 0.68, sc * 1.02);
      rock.position.set(rx, sc * 0.3, rz);
      rock.rotation.set(this.rng() * 0.35, this.rng() * 6.28, this.rng() * 0.25);
      rock.castShadow = true;
      rock.receiveShadow = true;
      target.add(rock);
      obstaclesOut.push({ x: rx, z: rz, r: sc * 1.05 });
    }

    // Instanced perimeter sage-moss grass around this zone's rim
    const grassCount = 320;
    const bladeGeo = new THREE.ConeGeometry(0.048, 0.44, 3, 2);
    bladeGeo.translate(0, 0.22, 0);
    const grassMesh = new THREE.InstancedMesh(bladeGeo, this.grassMat, grassCount);
    const dummy = new THREE.Object3D();
    let placed = 0;
    while (placed < grassCount) {
      const ang = this.rng() * Math.PI * 2;
      const gr = radius - 3.2 + this.rng() * 2.5;
      const gx = Math.cos(ang) * gr + (this.rng() - 0.5) * 0.5;
      const gz = centerZ + Math.sin(ang) * gr + (this.rng() - 0.5) * 0.5;
      if (Math.abs(gx) < 6.0 && (gz > centerZ + radius - 5.2 || gz < centerZ - radius + 5.2)) {
        continue;
      }
      dummy.position.set(gx, 0, gz);
      dummy.rotation.set((this.rng() - 0.5) * 0.32, this.rng() * Math.PI * 2, (this.rng() - 0.5) * 0.32);
      const sx = 0.75 + this.rng() * 0.65;
      const sy = 0.65 + this.rng() * 0.95;
      dummy.scale.set(sx, sy, sx);
      dummy.updateMatrix();
      grassMesh.setMatrixAt(placed, dummy.matrix);
      placed++;
    }
    grassMesh.instanceMatrix.needsUpdate = true;
    grassMesh.frustumCulled = false;
    target.add(grassMesh);
  }

  private syncLayoutObstacles(): void {
    this.circleObstacles.length = 0;
    this.capsuleObstacles.length = 0;

    for (const o of this.zone0Obstacles) this.circleObstacles.push(o);

    if (this.layout === 'arena') {
      for (const c of this.arenaArchwayCapsules) this.capsuleObstacles.push(c);
      return;
    }

    if (this.maxZone >= 1) {
      for (const o of this.zone1Obstacles) this.circleObstacles.push(o);
    }
    if (this.maxZone >= 2) {
      for (const o of this.zone2Obstacles) this.circleObstacles.push(o);
    }

    const archZ = this.maxZone === 2 ? -101.0 : this.maxZone === 1 ? -58.0 : -16.6;
    this.capsuleObstacles.push(
      { ax: -5.6, az: archZ, bx: -2.4, bz: archZ, r: 0.75 },
      { ax: 2.4, az: archZ, bx: 5.6, bz: archZ, r: 0.75 },
    );
  }

  setArenaLayout(layout: ArenaLayout, maxZone: 0 | 1 | 2 = 2): void {
    this.layout = layout;
    this.maxZone = layout === 'arena' ? 0 : maxZone;
    this.unlockedZone = 0;

    if (layout === 'arena') {
      this.corridorGroup.visible = false;
      this.zone0FullCurb.visible = true;
      this.zone0OpenCurb.visible = false;
      this.archwayGroup.position.set(0, 0, -16.6);
      this.archwayOccludable.position.set(0, 3.0, -16.6);
      this.bossRingPlane.position.set(0, 0.036, 0);
      this.skySwordRing.position.set(0, 11.2, -23);
    } else {
      this.corridorGroup.visible = true;
      this.zone0FullCurb.visible = this.maxZone === 0;
      this.zone0OpenCurb.visible = this.maxZone >= 1;
      this.bridge0Group.visible = this.maxZone >= 1;
      this.zone1Group.visible = this.maxZone >= 1;
      this.bridge1Group.visible = this.maxZone >= 2;
      this.zone2Group.visible = this.maxZone >= 2;

      if (this.zone1DoubleOpenCurb && this.zone1SouthOpenCurb) {
        this.zone1DoubleOpenCurb.visible = this.maxZone >= 2;
        this.zone1SouthOpenCurb.visible = this.maxZone === 1;
      }

      const archZ = this.maxZone === 2 ? -101.0 : this.maxZone === 1 ? -58.0 : -16.6;
      this.archwayGroup.position.set(0, 0, archZ);
      this.archwayOccludable.position.set(0, 3.0, archZ);
      this.bossRingPlane.position.set(0, 0.036, this.getZoneCenterZ(this.maxZone));
      this.skySwordRing.position.set(0, 12.8, this.getZoneCenterZ(this.maxZone) - 18);
    }

    for (const b of this.barriers) {
      b.openProgress = 0;
      b.mat.uniforms.uOpen.value = 0;
      b.curtain.visible = true;
    }

    this.syncLayoutObstacles();
  }

  setUnlockedZone(zoneIdx: 0 | 1 | 2): void {
    const clamped = Math.min(zoneIdx, this.maxZone) as 0 | 1 | 2;
    this.unlockedZone = clamped;
  }

  getUnlockedZone(): 0 | 1 | 2 {
    return this.unlockedZone;
  }

  getMaxZone(): 0 | 1 | 2 {
    return this.maxZone;
  }

  getZoneCenterZ(zoneIdx: 0 | 1 | 2): number {
    return ZONE_CENTERS[zoneIdx];
  }

  getZoneIndexAtZ(z: number): 0 | 1 | 2 {
    if (this.layout === 'arena') return 0;
    let idx: 0 | 1 | 2 = z > -21 ? 0 : z > -63 ? 1 : 2;
    if (idx > this.maxZone) idx = this.maxZone;
    return idx;
  }

  getZoneName(zoneIdx: 0 | 1 | 2): string {
    return ZONE_NAMES[zoneIdx];
  }

  getProgressPct(z: number): number {
    const zMax = 14;
    const zMin =
      this.layout === 'arena' || this.maxZone === 0
        ? -14
        : this.maxZone === 1
          ? -56
          : -98;
    return clamp(((zMax - z) / (zMax - zMin)) * 100, 0, 100);
  }

  isInShallowWater(pos: THREE.Vector3): boolean {
    if (this.layout !== 'corridor' || this.maxZone < 1) return false;
    if (pos.z >= -27.5 && pos.z <= -14.5 && Math.abs(pos.x) <= 5.5) return true;
    if (pos.z >= -14.5 && pos.z <= -12.8 && Math.abs(pos.x) <= 5.2) return true;
    if (pos.z >= -29.2 && pos.z <= -27.5 && Math.abs(pos.x) <= 5.3) return true;
    return false;
  }

  getSightlineStats(): {
    centerBeamCount: number;
    occludableCount: number;
    waterMeshCount: number;
    canyonCliffCount: number;
  } {
    return {
      centerBeamCount: this.moonbeams.filter((m) => Math.abs(m.position.x) < 18).length,
      occludableCount: this.occludables.length,
      waterMeshCount: this.waterMeshes.length,
      canyonCliffCount: this.canyonCliffs.length,
    };
  }

  isOutOfBounds(pos: THREE.Vector3, margin = 0): boolean {
    if (this.layout === 'arena') {
      return Math.hypot(pos.x, pos.z) > this.playableRadius + margin;
    }

    for (let zi = 0; zi <= this.maxZone; zi++) {
      const cz = ZONE_CENTERS[zi];
      const r = Math.max(0.5, ZONE_RADII[zi] + margin);
      const dz = pos.z - cz;
      if (pos.x * pos.x + dz * dz <= r * r) return false;
    }

    for (let bi = 0; bi < this.maxZone; bi++) {
      const span = BRIDGE_SPANS[bi];
      const halfW = Math.max(0.4, span.halfWidth + margin);
      if (
        Math.abs(pos.x) <= halfW &&
        pos.z >= span.zMin - margin &&
        pos.z <= span.zMax + margin
      ) {
        return false;
      }
    }

    return true;
  }

  private clampToCorridorUnion(pos: THREE.Vector3, radius: number): void {
    // Fast check: if already inside any active disc or bridge rect, no clamping needed
    for (let zi = 0; zi <= this.maxZone; zi++) {
      const cz = ZONE_CENTERS[zi];
      const maxR = Math.max(0.5, ZONE_RADII[zi] - radius);
      const dz = pos.z - cz;
      if (pos.x * pos.x + dz * dz <= maxR * maxR) return;
    }
    for (let bi = 0; bi < this.maxZone; bi++) {
      const span = BRIDGE_SPANS[bi];
      const halfW = Math.max(0.4, span.halfWidth - radius);
      if (
        Math.abs(pos.x) <= halfW &&
        pos.z >= span.zMin - 0.5 &&
        pos.z <= span.zMax + 0.5
      ) {
        return;
      }
    }

    // Outside all active regions: project onto closest point across the union
    let bestX = pos.x;
    let bestZ = pos.z;
    let bestD2 = Infinity;

    for (let zi = 0; zi <= this.maxZone; zi++) {
      const cz = ZONE_CENTERS[zi];
      const maxR = Math.max(0.5, ZONE_RADII[zi] - radius);
      const dz = pos.z - cz;
      const dist = Math.hypot(pos.x, dz);
      const cx = dist > 1e-5 ? (pos.x / dist) * maxR : 0;
      const czClamped = dist > 1e-5 ? cz + (dz / dist) * maxR : cz;
      const dx = pos.x - cx;
      const ddz = pos.z - czClamped;
      const d2 = dx * dx + ddz * ddz;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestX = cx;
        bestZ = czClamped;
      }
    }

    for (let bi = 0; bi < this.maxZone; bi++) {
      const span = BRIDGE_SPANS[bi];
      const halfW = Math.max(0.4, span.halfWidth - radius);
      const rx = clamp(pos.x, -halfW, halfW);
      const rz = clamp(pos.z, span.zMin - 0.5, span.zMax + 0.5);
      const dx = pos.x - rx;
      const dz = pos.z - rz;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestX = rx;
        bestZ = rz;
      }
    }

    pos.x = bestX;
    pos.z = bestZ;
  }

  constrainPosition(pos: THREE.Vector3, radius: number, prevPos?: THREE.Vector3): void {
    for (let iter = 0; iter < 2; iter++) {
      for (const obs of this.circleObstacles) {
        resolveCircleVsCircle(pos, radius, obs);
      }
      for (const cap of this.capsuleObstacles) {
        resolveCircleVsCapsule(pos, radius, cap);
      }

      if (this.layout === 'arena') {
        const dist = Math.hypot(pos.x, pos.z);
        const maxR = this.playableRadius - radius;
        if (dist > maxR && dist > 1e-5) {
          pos.x = (pos.x / dist) * maxR;
          pos.z = (pos.z / dist) * maxR;
        }
      } else {
        // Block advancing past locked Spirit Barrier Gates
        if (this.maxZone >= 1 && this.unlockedZone < 1) {
          const b0 = BRIDGE_SPANS[0].barrierZ;
          const onSouthSide = prevPos ? prevPos.z >= b0 - 0.2 : pos.z > b0 - 3.0;
          if (onSouthSide && pos.z < b0 + radius) {
            pos.z = b0 + radius;
          }
        }
        if (this.maxZone >= 2 && this.unlockedZone < 2) {
          const b1 = BRIDGE_SPANS[1].barrierZ;
          const onSouthSide = prevPos ? prevPos.z >= b1 - 0.2 : pos.z > b1 - 3.0;
          if (onSouthSide && pos.z < b1 + radius) {
            pos.z = b1 + radius;
          }
        }
        this.clampToCorridorUnion(pos, radius);
      }
    }
    if (prevPos && (!Number.isFinite(pos.x) || !Number.isFinite(pos.z))) {
      pos.copy(prevPos);
    }
  }

  updateOcclusion(cameraPos: THREE.Vector3, heroPos: THREE.Vector3, dt: number): void {
    const abLenSqHero =
      (heroPos.x - cameraPos.x) * (heroPos.x - cameraPos.x) +
      (heroPos.z - cameraPos.z) * (heroPos.z - cameraPos.z);
    if (abLenSqHero < 1e-4) return;

    const fwdX = heroPos.x;
    const fwdZ = heroPos.z - 14;

    const hitsRay = (bx: number, bz: number, px: number, pz: number, threshold: number): boolean => {
      const abx = bx - cameraPos.x;
      const abz = bz - cameraPos.z;
      const abLenSq = abx * abx + abz * abz;
      if (abLenSq < 1e-4) return false;
      const apx = px - cameraPos.x;
      const apz = pz - cameraPos.z;
      const t = clamp((apx * abx + apz * abz) / abLenSq, 0, 1);
      if (t <= 0.04 || t >= 0.98) return false;
      const cx = cameraPos.x + abx * t;
      const cz = cameraPos.z + abz * t;
      return Math.hypot(px - cx, pz - cz) < threshold;
    };

    for (const prop of this.occludables) {
      const threshold = prop.radius + 1.4;
      const occluded =
        hitsRay(heroPos.x, heroPos.z, prop.position.x, prop.position.z, threshold) ||
        hitsRay(fwdX, fwdZ, prop.position.x, prop.position.z, threshold);
      const targetOpacity = occluded ? 0.16 : 1;
      prop.currentOpacity += (targetOpacity - prop.currentOpacity) * Math.min(1, dt * 10);
      const writeDepth = prop.currentOpacity > 0.92;
      for (const mat of prop.materials) {
        mat.opacity = prop.currentOpacity;
        if (mat instanceof THREE.MeshStandardMaterial) {
          mat.depthWrite = writeDepth;
        }
      }
    }
  }

  update(dt: number, elapsed: number, focusPos: THREE.Vector3): void {
    const targetAnchorZ = this.layout === 'corridor' ? focusPos.z : 0;
    if (Math.abs(targetAnchorZ - this.backdropAnchorZ) > 24) {
      this.backdropAnchorZ = targetAnchorZ;
    } else {
      this.backdropAnchorZ += (targetAnchorZ - this.backdropAnchorZ) * Math.min(1, dt * 6);
    }
    this.skyDome.position.z = this.backdropAnchorZ;
    this.mountainGroup.position.z = this.backdropAnchorZ;

    (this.skyDome.material as THREE.ShaderMaterial).uniforms.uTime.value = elapsed;
    this.baguaMat.uniforms.uTime.value = elapsed;
    const curBoss = this.baguaMat.uniforms.uBossIntensity.value as number;
    const nextBoss = curBoss + (this.bossIntensity - curBoss) * Math.min(1, dt * 2.5);
    this.baguaMat.uniforms.uBossIntensity.value = nextBoss;
    this.bossSealMat.uniforms.uTime.value = elapsed;
    this.bossSealMat.uniforms.uIntensity.value = nextBoss;
    this.grassMat.uniforms.uTime.value = elapsed;

    if (this.layout === 'corridor') {
      this.chevronMat0.uniforms.uTime.value = elapsed;
      this.chevronMat0.uniforms.uUnlocked.value = this.unlockedZone >= 1 ? 1.0 : 0.18;
      this.chevronMat1.uniforms.uTime.value = elapsed;
      this.chevronMat1.uniforms.uUnlocked.value = this.unlockedZone >= 2 ? 1.0 : 0.18;
      if (this.riverMat) this.riverMat.uniforms.uTime.value = elapsed;
      if (this.shallowWaterMat) this.shallowWaterMat.uniforms.uTime.value = elapsed;
      if (this.waterfallMat) this.waterfallMat.uniforms.uTime.value = elapsed;
      if (this.plungeFoamMat) this.plungeFoamMat.uniforms.uTime.value = elapsed;
      if (this.bambooMat) this.bambooMat.uniforms.uTime.value = elapsed;
      if (this.bambooLeafMat) this.bambooLeafMat.uniforms.uTime.value = elapsed;
      for (let bi = 0; bi < this.barriers.length; bi++) {
        const b = this.barriers[bi];
        const targetOpen = this.unlockedZone >= bi + 1 ? 1 : 0;
        b.openProgress += (targetOpen - b.openProgress) * Math.min(1, dt * 4.2);
        b.mat.uniforms.uTime.value = elapsed;
        b.mat.uniforms.uOpen.value = b.openProgress;
        b.curtain.visible = b.openProgress < 0.985;
      }
    }

    for (const l of this.lanterns) {
      const flick = 1 + 0.12 * Math.sin(elapsed * 7.3 + l.phase) + 0.06 * Math.sin(elapsed * 13.7 + l.phase);
      l.light.intensity = l.baseIntensity * flick;
      l.flame.scale.setScalar(0.92 + 0.12 * Math.sin(elapsed * 9 + l.phase));
    }

    for (const m of this.mistPlanes) {
      const ang = (m.userData.baseAngle as number) + elapsed * 0.025;
      const dist = m.userData.dist as number;
      m.position.x = Math.cos(ang) * dist;
      m.position.z = Math.sin(ang) * dist + this.backdropAnchorZ;
    }

    for (const pk of this.floatingPeaks) {
      const baseY = pk.userData.baseY as number;
      const ph = pk.userData.phase as number;
      pk.position.y = baseY + Math.sin(elapsed * 0.55 + ph) * 0.65;
    }
    this.skySwordRing.rotation.y = elapsed * 0.14;
    if (this.moonbeams.length > 0) {
      (this.moonbeams[0].material as THREE.ShaderMaterial).uniforms.uTime.value = elapsed;
    }

    const pAttr = this.petalPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
    const pArr = pAttr.array as Float32Array;
    for (let i = 0; i < pArr.length / 3; i++) {
      const sp = this.petalData[i * 3];
      const ph = this.petalData[i * 3 + 1];
      const dr = this.petalData[i * 3 + 2];
      pArr[i * 3] += (Math.sin(elapsed * 1.1 + ph) * 0.45 + 0.35 * dr) * dt;
      pArr[i * 3 + 1] -= sp * dt;
      pArr[i * 3 + 2] += Math.cos(elapsed * 0.9 + ph) * 0.35 * dt;
      if (pArr[i * 3 + 1] < 0.05 || Math.abs(pArr[i * 3 + 2] - this.backdropAnchorZ) > 24) {
        const ringA = ph + elapsed * 0.37;
        const ringR = 11.4 + ((ph * 3.17) % 6.6);
        pArr[i * 3] = Math.cos(ringA) * ringR + focusPos.x * 0.08;
        pArr[i * 3 + 1] = 8.5 + (ph % 2.8);
        pArr[i * 3 + 2] = Math.sin(ringA) * ringR + this.backdropAnchorZ;
      }
    }
    pAttr.needsUpdate = true;

    const fAttr = this.fireflyPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
    const fArr = fAttr.array as Float32Array;
    for (let i = 0; i < fArr.length / 3; i++) {
      const a = this.fireflyData[i * 3] + elapsed * 0.09;
      const r = this.fireflyData[i * 3 + 1];
      const ph = this.fireflyData[i * 3 + 2];
      fArr[i * 3] = Math.cos(a) * r;
      fArr[i * 3 + 1] = 0.85 + Math.sin(elapsed * 1.45 + ph) * 0.45 + (ph % 1.3);
      fArr[i * 3 + 2] = Math.sin(a) * r + this.backdropAnchorZ;
    }
    fAttr.needsUpdate = true;
  }
}
