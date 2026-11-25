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
  createCarvedStoneTexture,
  createCourtyardStoneMaps,
  createLacquerWoodTexture,
  createShushanSkyDome,
  createSoftParticleTexture,
} from './Materials';
import skyUrl from '../assets/shushan-sky.jpg';

interface OccludableProp {
  position: THREE.Vector3;
  radius: number;
  materials: THREE.MeshStandardMaterial[];
  currentOpacity: number;
}

interface LanternRef {
  light: THREE.PointLight;
  flame: THREE.Mesh;
  baseIntensity: number;
  phase: number;
}

export class ShushanArena {
  readonly group = new THREE.Group();
  readonly circleObstacles: CircleObstacle[] = [];
  readonly capsuleObstacles: CapsuleObstacle[] = [];
  readonly playableRadius = 17.4;

  private readonly skyDome: THREE.Mesh;
  private readonly baguaMat: THREE.ShaderMaterial;
  private readonly bossSealMat: THREE.ShaderMaterial;
  private readonly grassMat: THREE.ShaderMaterial;
  private readonly petalPoints: THREE.Points;
  private readonly petalData: Float32Array;
  private readonly fireflyPoints: THREE.Points;
  private readonly fireflyData: Float32Array;
  private readonly mistPlanes: THREE.Mesh[] = [];
  private readonly lanterns: LanternRef[] = [];
  private readonly occludables: OccludableProp[] = [];
  private readonly rng: () => number;

  private bossIntensity = 0;

  constructor(rng: () => number) {
    this.rng = rng;

    // 1. Moonlit Shushan Sky Dome
    this.skyDome = createShushanSkyDome(skyUrl);
    this.group.add(this.skyDome);

    // 2. Courtyard Stone Flagstone Platform & Stepped Cliff Base
    const stoneMaps = createCourtyardStoneMaps();
    const carvedTex = createCarvedStoneTexture();
    const lacquerTex = createLacquerWoodTexture();

    const floorMat = new THREE.MeshStandardMaterial({
      map: stoneMaps.map,
      bumpMap: stoneMaps.bumpMap,
      bumpScale: 0.08,
      roughnessMap: stoneMaps.roughnessMap,
      roughness: 0.92,
      metalness: 0.03,
      color: new THREE.Color('#aab9ca'),
    });

    const terrace = new THREE.Mesh(new THREE.CylinderGeometry(19.6, 20.8, 1.4, 32), floorMat);
    terrace.position.y = -0.7;
    terrace.receiveShadow = true;
    this.group.add(terrace);

    const cliff = new THREE.Mesh(
      new THREE.CylinderGeometry(20.6, 13.0, 22, 16),
      new THREE.MeshStandardMaterial({ color: '#1b2430', roughness: 0.96, metalness: 0.02 }),
    );
    cliff.position.y = -12.3;
    this.group.add(cliff);

    const trimMat = new THREE.MeshStandardMaterial({
      map: carvedTex,
      color: '#8493a6',
      roughness: 0.82,
      metalness: 0.08,
    });
    const curb = new THREE.Mesh(new THREE.TorusGeometry(19.1, 0.36, 10, 48), trimMat);
    curb.rotation.x = Math.PI / 2;
    curb.position.y = 0.08;
    curb.receiveShadow = true;
    curb.castShadow = true;
    this.group.add(curb);

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

          float outerRing = smoothstep(0.02, 0.005, abs(r - 0.94));
          float midRing = smoothstep(0.016, 0.004, abs(r - 0.72));
          float innerRing = smoothstep(0.015, 0.004, abs(r - 0.42));

          float octA = mod(a + 0.3927, 0.7854) - 0.3927;
          float octR = 0.82 / cos(octA);
          float octLine = smoothstep(0.015, 0.004, abs(r - octR));

          float rotA = a + uTime * 0.07;
          float sector = floor(mod((rotA + 3.14159265) / 0.7854, 8.0));
          float localA = fract((rotA + 3.14159265) / 0.7854);
          float inBand = step(0.16, localA) * step(localA, 0.84);
          float gap = step(0.44, localA) * step(localA, 0.56);
          float b0 = smoothstep(0.013, 0.004, abs(r - 0.52)) * (mod(sector, 2.0) > 0.5 ? (1.0 - gap) : 1.0);
          float b1 = smoothstep(0.013, 0.004, abs(r - 0.58)) * (mod(floor(sector * 0.5), 2.0) > 0.5 ? (1.0 - gap) : 1.0);
          float b2 = smoothstep(0.013, 0.004, abs(r - 0.64)) * (mod(floor(sector * 0.25), 2.0) > 0.5 ? (1.0 - gap) : 1.0);
          float trigrams = (b0 + b1 + b2) * inBand;

          float spoke = smoothstep(0.032, 0.008, abs(sin((a - uTime * 0.12) * 4.0))) * smoothstep(0.41, 0.10, r) * smoothstep(0.05, 0.12, r);
          float pattern = clamp(outerRing + midRing + innerRing + octLine * 0.8 + trigrams * 0.85 + spoke * 0.38, 0.0, 1.15);
          float pulse = 0.78 + 0.22 * sin(uTime * 1.8 - r * 4.5);

          vec3 jadeGold = mix(vec3(0.24, 0.72, 0.78), vec3(0.88, 0.72, 0.34), smoothstep(0.35, 0.92, r));
          vec3 bossCrimson = mix(vec3(0.86, 0.22, 0.32), vec3(0.78, 0.45, 0.25), smoothstep(0.25, 0.9, r));
          vec3 col = mix(jadeGold, bossCrimson, uBossIntensity);

          float alpha = pattern * pulse * (0.34 + uBossIntensity * 0.16);
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
    const bossRingPlane = new THREE.Mesh(new THREE.PlaneGeometry(36.4, 36.4), this.bossSealMat);
    bossRingPlane.rotation.x = -Math.PI / 2;
    bossRingPlane.position.y = 0.036;
    this.group.add(bossRingPlane);

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
  }

  private buildShushanArchway(
    carvedTex: THREE.CanvasTexture,
    lacquerTex: THREE.CanvasTexture,
  ): void {
    const arch = new THREE.Group();
    arch.position.set(0, 0, -16.6);

    const pillarMat = new THREE.MeshStandardMaterial({
      map: lacquerTex,
      roughness: 0.56,
      metalness: 0.12,
    });
    const stoneBaseMat = new THREE.MeshStandardMaterial({
      map: carvedTex,
      color: '#8897aa',
      roughness: 0.82,
      metalness: 0.06,
    });
    const roofMat = new THREE.MeshStandardMaterial({
      color: '#1b2b3b',
      roughness: 0.58,
      metalness: 0.2,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: '#d4af5e',
      roughness: 0.36,
      metalness: 0.72,
      emissive: new THREE.Color('#3b2a0b'),
      emissiveIntensity: 0.35,
    });
    const plaqueMat = new THREE.MeshStandardMaterial({
      map: createArchwayPlaqueTexture(),
      roughness: 0.42,
      metalness: 0.35,
      emissive: new THREE.Color('#402a0d'),
      emissiveIntensity: 0.32,
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
    const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.85, 0.9, 0.34) });
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

    this.capsuleObstacles.push(
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
        color: '#34d8d4',
        emissive: new THREE.Color('#22b4c2'),
        emissiveIntensity: 1.15,
        roughness: 0.35,
        metalness: 0.3,
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
      const cap = new THREE.Mesh(pCapGeo, matStone);
      cap.position.y = topY + 0.22;
      cap.castShadow = true;
      pGroup.add(cap);

      const finial = new THREE.Mesh(pFinialGeo, matStone);
      finial.position.y = topY + 0.84;
      pGroup.add(finial);

      this.group.add(pGroup);
      this.circleObstacles.push({ x: px, z: pz, r: 0.92 });
      this.occludables.push({
        position: new THREE.Vector3(px, 2.5, pz),
        radius: 2.2,
        materials: [matStone, matRune],
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

    // 6 Carved Stone Lanterns (shared geometries!)
    const lPedGeo = new THREE.CylinderGeometry(0.28, 0.42, 1.35, 6);
    const lFlameGeo = new THREE.OctahedronGeometry(0.22, 1);
    const lCapGeo = new THREE.ConeGeometry(0.66, 0.48, 6);
    const lanternStoneMat = new THREE.MeshStandardMaterial({
      map: carvedTex,
      color: '#7c8b9c',
      roughness: 0.84,
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

      const ped = new THREE.Mesh(lPedGeo, lanternStoneMat);
      ped.position.y = 0.68;
      ped.castShadow = true;
      lGroup.add(ped);

      const flame = new THREE.Mesh(lFlameGeo, flameMat);
      flame.position.y = 1.62;
      lGroup.add(flame);

      const cap = new THREE.Mesh(lCapGeo, roofCapMat);
      cap.position.y = 2.08;
      cap.castShadow = true;
      lGroup.add(cap);

      if (idx < 4) {
        const light = new THREE.PointLight('#ffaa4c', 11, 16, 1.8);
        light.position.set(0, 1.75, 0);
        lGroup.add(light);
        this.lanterns.push({ light, flame, baseIntensity: 11, phase: idx * 1.7 });
      }

      this.group.add(lGroup);
      this.circleObstacles.push({ x: lx, z: lz, r: 0.48 });
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

      const seg1 = new THREE.Mesh(trunk1Geo, barkMat);
      seg1.position.set(0, 1.0, 0);
      seg1.rotation.z = 0.16;
      seg1.castShadow = true;
      pine.add(seg1);

      const seg2 = new THREE.Mesh(trunk2Geo, barkMat);
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
        const pad = new THREE.Mesh(padGeo, needleMat);
        pad.scale.set(pr, ph, pr * 0.85);
        pad.position.set(px, py, pz);
        pad.castShadow = true;
        pad.receiveShadow = true;
        pine.add(pad);
      }
      this.group.add(pine);
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
      this.circleObstacles.push({ x: rx, z: rz, r: sc * 1.05 });
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
      const dist = 74 + (i % 2) * 18;
      const ridge = new THREE.Mesh(ridgeGeo, peakMat);
      ridge.position.set(Math.cos(ang) * dist, 1.5 + (i % 3) * 2.5, Math.sin(ang) * dist);
      ridge.lookAt(0, 1.5, 0);
      this.group.add(ridge);
    }
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
    for (let i = 0; i < count; i++) {
      const ang = this.rng() * Math.PI * 2;
      const r = 16.0 + this.rng() * 2.8;
      const gx = Math.cos(ang) * r + (this.rng() - 0.5) * 0.6;
      const gz = Math.sin(ang) * r + (this.rng() - 0.5) * 0.6;
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
      mesh.setMatrixAt(i, dummy.matrix);
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

    const petalCount = 130;
    const petalPos = new Float32Array(petalCount * 3);
    const petalData = new Float32Array(petalCount * 3);
    for (let i = 0; i < petalCount; i++) {
      petalPos[i * 3] = (this.rng() - 0.5) * 32;
      petalPos[i * 3 + 1] = this.rng() * 11;
      petalPos[i * 3 + 2] = (this.rng() - 0.5) * 32;
      petalData[i * 3] = 0.55 + this.rng() * 0.65;
      petalData[i * 3 + 1] = this.rng() * Math.PI * 2;
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
          vAlpha = smoothstep(2.8, 5.8, dist) * 0.72;
          gl_PointSize = clamp(240.0 / dist, 2.0, 14.0);
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

    const ffCount = 55;
    const ffPos = new Float32Array(ffCount * 3);
    const ffData = new Float32Array(ffCount * 3);
    for (let i = 0; i < ffCount; i++) {
      const a = this.rng() * Math.PI * 2;
      const r = 7 + this.rng() * 12;
      ffPos[i * 3] = Math.cos(a) * r;
      ffPos[i * 3 + 1] = 0.7 + this.rng() * 3.4;
      ffPos[i * 3 + 2] = Math.sin(a) * r;
      ffData[i * 3] = a;
      ffData[i * 3 + 1] = r;
      ffData[i * 3 + 2] = this.rng() * Math.PI * 2;
    }
    const ffGeo = new THREE.BufferGeometry();
    ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
    const ffMat = new THREE.PointsMaterial({
      map: orbTex,
      color: new THREE.Color(1.25, 1.45, 1.05),
      size: 0.36,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
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

  setBossMode(active: boolean): void {
    this.setStageTheme(active ? 3 : 1);
  }

  /** Shifts courtyard seal glow & stone-lantern atmosphere across the 3 campaign stages. */
  setStageTheme(stageNum: 1 | 2 | 3): void {
    this.bossIntensity = stageNum === 3 ? 1.0 : stageNum === 2 ? 0.52 : 0.0;
    const lightHex = stageNum === 3 ? '#ff5844' : stageNum === 2 ? '#c06cff' : '#ffb86b';
    const flameHex = stageNum === 3 ? '#ff825c' : stageNum === 2 ? '#d892ff' : '#ffd89a';
    for (const l of this.lanterns) {
      l.light.color.set(lightHex);
      const fm = l.flame.material as THREE.MeshBasicMaterial;
      if (fm && fm.color) fm.color.set(flameHex);
    }
  }

  constrainPosition(pos: THREE.Vector3, radius: number, prevPos?: THREE.Vector3): void {
    for (let iter = 0; iter < 2; iter++) {
      for (const obs of this.circleObstacles) {
        resolveCircleVsCircle(pos, radius, obs);
      }
      for (const cap of this.capsuleObstacles) {
        resolveCircleVsCapsule(pos, radius, cap);
      }
      const dist = Math.hypot(pos.x, pos.z);
      const maxR = this.playableRadius - radius;
      if (dist > maxR && dist > 1e-5) {
        pos.x = (pos.x / dist) * maxR;
        pos.z = (pos.z / dist) * maxR;
      }
    }
    if (prevPos && (!Number.isFinite(pos.x) || !Number.isFinite(pos.z))) {
      pos.copy(prevPos);
    }
  }

  updateOcclusion(cameraPos: THREE.Vector3, heroPos: THREE.Vector3, dt: number): void {
    const abx = heroPos.x - cameraPos.x;
    const abz = heroPos.z - cameraPos.z;
    const abLenSq = abx * abx + abz * abz;
    if (abLenSq < 1e-4) return;

    for (const prop of this.occludables) {
      const apx = prop.position.x - cameraPos.x;
      const apz = prop.position.z - cameraPos.z;
      const t = clamp((apx * abx + apz * abz) / abLenSq, 0, 1);
      let targetOpacity = 1;
      if (t > 0.08 && t < 0.94) {
        const cx = cameraPos.x + abx * t;
        const cz = cameraPos.z + abz * t;
        const perpDist = Math.hypot(prop.position.x - cx, prop.position.z - cz);
        if (perpDist < prop.radius) {
          targetOpacity = 0.24;
        }
      }
      prop.currentOpacity += (targetOpacity - prop.currentOpacity) * Math.min(1, dt * 10);
      for (const mat of prop.materials) {
        mat.opacity = prop.currentOpacity;
      }
    }
  }

  update(dt: number, elapsed: number, focusPos: THREE.Vector3): void {
    (this.skyDome.material as THREE.ShaderMaterial).uniforms.uTime.value = elapsed;
    this.baguaMat.uniforms.uTime.value = elapsed;
    const curBoss = this.baguaMat.uniforms.uBossIntensity.value as number;
    const nextBoss = curBoss + (this.bossIntensity - curBoss) * Math.min(1, dt * 2.5);
    this.baguaMat.uniforms.uBossIntensity.value = nextBoss;
    this.bossSealMat.uniforms.uTime.value = elapsed;
    this.bossSealMat.uniforms.uIntensity.value = nextBoss;
    this.grassMat.uniforms.uTime.value = elapsed;

    for (const l of this.lanterns) {
      const flick = 1 + 0.12 * Math.sin(elapsed * 7.3 + l.phase) + 0.06 * Math.sin(elapsed * 13.7 + l.phase);
      l.light.intensity = l.baseIntensity * flick;
      l.flame.scale.setScalar(0.92 + 0.12 * Math.sin(elapsed * 9 + l.phase));
    }

    for (const m of this.mistPlanes) {
      const ang = (m.userData.baseAngle as number) + elapsed * 0.025;
      const dist = m.userData.dist as number;
      m.position.x = Math.cos(ang) * dist;
      m.position.z = Math.sin(ang) * dist;
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
      if (pArr[i * 3 + 1] < 0.05) {
        pArr[i * 3] = focusPos.x + Math.sin(ph * 17.1 + elapsed) * 16;
        pArr[i * 3 + 1] = 10 + (ph % 3);
        pArr[i * 3 + 2] = focusPos.z + Math.cos(ph * 13.7 + elapsed) * 16;
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
      fArr[i * 3 + 1] = 1.2 + Math.sin(elapsed * 1.6 + ph) * 0.7 + (ph % 2.0);
      fArr[i * 3 + 2] = Math.sin(a) * r;
    }
    fAttr.needsUpdate = true;
  }
}
