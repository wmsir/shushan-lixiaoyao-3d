import * as THREE from 'three';
import { clamp, easeOutQuart, lerp } from '../utils/math';
import type { EquipRarity, RolledGearItem } from '../game/EquipmentData';

export interface LootDrop {
  kind: 'heal' | 'spirit' | 'gourd' | 'gear';
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  bounced: boolean;
  collected: boolean;
  mesh: THREE.Group;
  pillar: THREE.Group;
  pillarCyls?: Array<{ mat: THREE.MeshBasicMaterial; baseOpacity: number }>;
  pillarFade?: number;
  gearItem?: RolledGearItem;
  rarity?: EquipRarity;
}

interface SlashVfx {
  mesh: THREE.Mesh;
  inkMesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  inkMat: THREE.ShaderMaterial;
  age: number;
  duration: number;
}

interface ArrayVfx {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  age: number;
  duration: number;
}

interface SkySwordGateVfx {
  group: THREE.Group;
  center: THREE.Vector3;
  radius: number;
  color: THREE.Color;
  cloudMat: THREE.ShaderMaterial;
  runeMat: THREE.ShaderMaterial;
  innerMat: THREE.ShaderMaterial;
  ownedGeos: THREE.BufferGeometry[];
  ownedMats: THREE.Material[];
  age: number;
  duration: number;
  sparkTimer: number;
}

interface FallingSwordVfx {
  group: THREE.Group;
  reticle: THREE.Mesh;
  reticleMat: THREE.ShaderMaterial;
  wakeGroup: THREE.Group;
  tassels: THREE.Mesh[];
  fadeMats: Array<{ mat: THREE.Material & { opacity: number }; baseOpacity: number }>;
  ownedMats: THREE.Material[];
  startPos: THREE.Vector3;
  impalePos: THREE.Vector3;
  targetPos: THREE.Vector3;
  baseQuat: THREE.Quaternion;
  tremorAxis: THREE.Vector3;
  baseScale: number;
  color: THREE.Color;
  age: number;
  hoverDuration: number;
  fallDuration: number;
  lingerDuration: number;
  impacted: boolean;
  giant: boolean;
  sparkTimer: number;
  onImpact?: (pos: THREE.Vector3) => void;
}

interface ShockRingVfx {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  age: number;
  duration: number;
  startScale: number;
  endScale: number;
}

interface SparkItem {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  vel: THREE.Vector3;
  age: number;
  duration: number;
}

interface GhostVfx {
  group: THREE.Group;
  mat: THREE.ShaderMaterial;
  ownedGeos: THREE.BufferGeometry[];
  drift: THREE.Vector3;
  age: number;
  duration: number;
}

interface CraterVfx {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  age: number;
  duration: number;
}

interface HealVortexVfx {
  group: THREE.Group;
  rings: THREE.Mesh[];
  age: number;
  duration: number;
}

export interface TelegraphHandle {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  updateProgress: (p: number) => void;
  dispose: () => void;
}

/**
 * Builds a curved sector mesh (annular ribbon) for authentic Mesh+Shader sword-qi arcs
 * (never flat billboard quads, per guizang-game-skill/references/vfx-ui-audio.md).
 */
function createArcSectorGeometry(innerR: number, outerR: number, arcAngle: number, segs = 28): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const half = arcAngle * 0.5;
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const a = -half + u * arcAngle;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    // Inner edge (v = 0), Outer razor edge (v = 1)
    positions.push(sa * innerR, 0, ca * innerR);
    uvs.push(u, 0);
    positions.push(sa * outerR, 0, ca * outerR);
    uvs.push(u, 1);
    if (i < segs) {
      const b = i * 2;
      indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

function distPointToSegmentXZ(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax;
  const vz = bz - az;
  const lenSq = vx * vx + vz * vz;
  if (lenSq < 1e-6) return Math.hypot(px - ax, pz - az);
  const t = clamp(((px - ax) * vx + (pz - az) * vz) / lenSq, 0, 1);
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

export class VfxSystem {
  readonly group = new THREE.Group();
  readonly drops: LootDrop[] = [];

  private readonly slashes: SlashVfx[] = [];
  private readonly arrays: ArrayVfx[] = [];
  private readonly skyGates: SkySwordGateVfx[] = [];
  private readonly swords: FallingSwordVfx[] = [];
  private readonly rings: ShockRingVfx[] = [];
  private readonly sparks: SparkItem[] = [];
  private readonly ghosts: GhostVfx[] = [];
  private readonly craters: CraterVfx[] = [];
  private readonly healVortices: HealVortexVfx[] = [];

  private readonly arcGeo = createArcSectorGeometry(0.95, 2.55, Math.PI * 0.92, 28);
  private readonly wideArcGeo = createArcSectorGeometry(1.15, 3.25, Math.PI * 1.15, 32);
  private readonly sparkGeo = new THREE.BoxGeometry(0.055, 0.055, 0.34);
  private readonly planeGeo = new THREE.PlaneGeometry(1, 1);

  private readonly jianGeos = (() => {
    const tassel = new THREE.CylinderGeometry(0.007, 0.024, 0.46, 5);
    tassel.translate(0, 0.23, 0);
    const wakeRibbon = new THREE.PlaneGeometry(0.11, 2.2);
    wakeRibbon.translate(0, 1.1, 0);
    return {
      blade: new THREE.CylinderGeometry(0.088, 0.064, 1.38, 4),
      tip: new THREE.ConeGeometry(0.064, 0.34, 4),
      fuller: new THREE.CylinderGeometry(0.017, 0.008, 1.24, 4),
      guardWing: new THREE.ConeGeometry(0.042, 0.3, 5),
      guardJewel: new THREE.OctahedronGeometry(0.068, 1),
      grip: new THREE.CylinderGeometry(0.028, 0.033, 0.36, 8),
      pommelRing: new THREE.TorusGeometry(0.056, 0.016, 8, 18),
      tassel,
      wakeRibbon,
      haloRing: new THREE.TorusGeometry(0.32, 0.014, 6, 20),
    };
  })();

  /**
   * Spawns a Mesh+Shader Sword-Qi Arc with scrolling streaks, razor core, noise erosion,
   * and an underlying darker ink-wash trail. HDR peak capped at ~2.3 to avoid bloom washout.
   */
  spawnSwordArc(opts: {
    pos: THREE.Vector3;
    yaw: number;
    tiltX?: number;
    tiltZ?: number;
    reverse?: boolean;
    wide?: boolean;
    scale?: number;
    colorCore: THREE.Color;
    colorEdge: THREE.Color;
    duration?: number;
  }): void {
    const duration = opts.duration ?? 0.34;
    const geo = opts.wide ? this.wideArcGeo : this.arcGeo;

    const makeMat = (isInk: boolean) =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: isInk ? THREE.NormalBlending : THREE.AdditiveBlending,
        uniforms: {
          uProg: { value: 0 },
          uReverse: { value: opts.reverse ? 1 : 0 },
          uCore: { value: isInk ? new THREE.Color('#08131d') : opts.colorCore.clone() },
          uEdge: { value: isInk ? new THREE.Color('#132c3d') : opts.colorEdge.clone() },
          uIsInk: { value: isInk ? 1 : 0 },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uProg;
          uniform float uReverse;
          uniform vec3 uCore;
          uniform vec3 uEdge;
          uniform float uIsInk;
          varying vec2 vUv;

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
            float u = uReverse > 0.5 ? (1.0 - vUv.x) : vUv.x;
            float v = vUv.y;

            // Sweeping head along arc + soft trailing tail
            float head = clamp(uProg * 1.85, 0.0, 1.15);
            float behindHead = smoothstep(head + 0.04, head - 0.12, u);
            float tail = smoothstep(max(0.0, head - 0.78), head - 0.12, u);
            float sweep = behindHead * tail;

            // Tapered ends & razor blade cross-section (bright near outer edge v ~ 0.86)
            float endTaper = sin(clamp(u, 0.0, 1.0) * 3.14159265);
            float bladeEdge = smoothstep(0.18, 0.85, v) * smoothstep(1.0, 0.88, v);
            float razorCore = pow(smoothstep(0.55, 0.9, v) * smoothstep(1.0, 0.89, v), 1.6);

            // Scrolling noise streaks & time-based erosion dissolve
            float n = noise(vec2(u * 11.0 - uProg * 7.5, v * 5.0));
            float erodeThresh = smoothstep(0.35, 1.0, uProg) * 0.92;
            float erode = smoothstep(erodeThresh, erodeThresh + 0.22, n * 0.72 + v * 0.42);

            float alpha = sweep * endTaper * bladeEdge * erode;
            if (alpha < 0.02) discard;

            if (uIsInk > 0.5) {
              gl_FragColor = vec4(mix(uCore, uEdge, v), alpha * 0.62 * (1.0 - uProg * 0.65));
            } else {
              // Crisp cyan/gold blade core without bleaching into solid white
              vec3 col = mix(uEdge, uCore, clamp(razorCore * 1.15 + n * 0.25, 0.0, 1.0));
              col *= (1.05 + razorCore * 0.55);
              gl_FragColor = vec4(col, alpha * (1.0 - smoothstep(0.65, 1.0, uProg)));
            }
          }
        `,
      });

    const mat = makeMat(false);
    const inkMat = makeMat(true);
    const mesh = new THREE.Mesh(geo, mat);
    const inkMesh = new THREE.Mesh(geo, inkMat);

    const sc = opts.scale ?? 1.0;
    mesh.position.copy(opts.pos);
    mesh.rotation.order = 'YXZ';
    mesh.rotation.set(opts.tiltX ?? 0, opts.yaw, opts.tiltZ ?? 0);
    mesh.scale.setScalar(sc);

    inkMesh.position.copy(opts.pos).add(new THREE.Vector3(0, -0.04, 0));
    inkMesh.rotation.copy(mesh.rotation);
    inkMesh.scale.setScalar(sc * 1.06);

    this.group.add(inkMesh, mesh);
    this.slashes.push({ mesh, inkMesh, mat, inkMat, age: 0, duration });
  }

  /** Spawns a polar-shader Taoist Bagua formation on ground or in the sky (万剑诀 / 天剑 / Boss). */
  spawnBaguaArray(opts: {
    pos: THREE.Vector3;
    radius: number;
    color: THREE.Color;
    duration: number;
  }): void {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uProg: { value: 0 },
        uColor: { value: opts.color.clone() },
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
        uniform float uProg;
        uniform vec3 uColor;
        varying vec2 vUv;

        void main() {
          float r = length(vUv);
          float reveal = smoothstep(0.0, 0.22, uProg);
          if (r > reveal || r > 1.0) discard;
          float a = atan(vUv.y, vUv.x);

          float ring1 = smoothstep(0.032, 0.008, abs(r - 0.94));
          float ring2 = smoothstep(0.025, 0.006, abs(r - 0.68));
          float ring3 = smoothstep(0.022, 0.006, abs(r - 0.36));

          float octA = mod(a + uTime * 1.1 + 0.3927, 0.7854) - 0.3927;
          float oct = smoothstep(0.024, 0.006, abs(r - 0.80 / cos(octA)));

          float hexA = mod(a - uTime * 1.5 + 0.5236, 1.0472) - 0.5236;
          float hex = smoothstep(0.024, 0.006, abs(r - 0.50 / cos(hexA)));

          // Hash rune ticks along outer band
          float tick = step(0.42, sin((a + uTime * 0.9) * 16.0)) * smoothstep(0.07, 0.02, abs(r - 0.81));

          float mask = clamp(ring1 + ring2 + ring3 + oct * 0.85 + hex * 0.8 + tick * 0.6, 0.0, 1.05);
          float fade = smoothstep(0.0, 0.14, uProg) * (1.0 - smoothstep(0.72, 1.0, uProg));
          if (mask * fade < 0.02) discard;

          gl_FragColor = vec4(uColor * 1.08, mask * fade * 0.64);
        }
      `,
    });

    const mesh = new THREE.Mesh(this.planeGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(opts.pos);
    mesh.scale.setScalar(opts.radius * 2);
    this.group.add(mesh);
    this.arrays.push({ mesh, mat, age: 0, duration: opts.duration });
  }

  /**
   * Spawns a shimmering overhead Cloud-Rift / Taoist Sky Sword Gate floating high above combat
   * (y >= 11m) with rotating golden/azure Bagua-rune rings and vortex sparks.
   */
  spawnSkySwordGate(pos: THREE.Vector3, radius: number, color: THREE.Color, duration = 1.6): void {
    const gateY = pos.y >= 11.0 && pos.y <= 14.5 ? pos.y : clamp(11.6 + Math.min(2.6, radius * 0.25), 11.0, 14.5);
    const gateGroup = new THREE.Group();
    gateGroup.position.set(pos.x, gateY, pos.z);
    gateGroup.rotation.order = 'YXZ';
    gateGroup.rotation.x = -Math.PI / 2 + 0.16;

    const cloudMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uProg: { value: 0 },
        uColor: { value: color.clone() },
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
        uniform float uProg;
        uniform vec3 uColor;
        varying vec2 vUv;

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
          float r = length(vUv);
          float open = smoothstep(0.0, 0.16, uProg) * (1.0 - smoothstep(0.82, 1.0, uProg));
          if (r > 1.0 || open < 0.01) discard;
          float a = atan(vUv.y, vUv.x + 1e-5);
          float swirl = noise(vec2(a * 2.5 + uTime * 0.9 - r * 3.2, r * 4.5 - uTime * 0.6));
          float cloudMask = smoothstep(1.0, 0.26, r) * (0.58 + 0.42 * swirl);
          float rimGlow = smoothstep(0.18, 0.0, abs(r - 0.54 - swirl * 0.14));
          vec3 voidCol = vec3(0.03, 0.05, 0.11);
          vec3 rimCol = mix(uColor * 0.72, vec3(1.15, 0.95, 0.48), 0.28);
          vec3 col = mix(voidCol, rimCol, clamp(rimGlow * 0.85 + swirl * 0.25, 0.0, 1.0));
          float alpha = cloudMask * open * 0.82;
          if (alpha < 0.02) discard;
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });

    const runeMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uProg: { value: 0 },
        uColor: { value: color.clone() },
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
        uniform float uProg;
        uniform vec3 uColor;
        varying vec2 vUv;

        void main() {
          float r = length(vUv);
          float reveal = smoothstep(0.0, 0.18, uProg);
          if (r > reveal || r > 1.0) discard;
          float a = atan(vUv.y, vUv.x + 1e-5);

          float ring1 = smoothstep(0.034, 0.008, abs(r - 0.92));
          float ring2 = smoothstep(0.026, 0.006, abs(r - 0.72));
          float ring3 = smoothstep(0.024, 0.006, abs(r - 0.42));

          float octA = mod(a + uTime * 1.2 + 0.3927, 0.7854) - 0.3927;
          float oct = smoothstep(0.025, 0.006, abs(r - 0.82 / max(0.35, cos(octA))));

          float hexA = mod(a - uTime * 1.65 + 0.5236, 1.0472) - 0.5236;
          float hex = smoothstep(0.022, 0.006, abs(r - 0.56 / max(0.35, cos(hexA))));

          float trigrams = step(0.38, sin((a + uTime * 0.85) * 24.0)) * smoothstep(0.085, 0.02, abs(r - 0.82));
          float spokes = step(0.88, cos((a - uTime * 0.6) * 8.0)) * smoothstep(0.38, 0.92, r) * (1.0 - smoothstep(0.92, 0.98, r));
          float core = smoothstep(0.45, 0.0, r) * 0.55;

          float mask = clamp(ring1 + ring2 + ring3 + oct * 0.9 + hex * 0.85 + trigrams * 0.65 + spokes * 0.5 + core, 0.0, 1.25);
          float fade = smoothstep(0.0, 0.14, uProg) * (1.0 - smoothstep(0.76, 1.0, uProg));
          if (mask * fade < 0.02) discard;

          vec3 goldTint = vec3(1.55, 1.22, 0.48);
          vec3 col = mix(uColor * 1.15, goldTint, clamp(ring2 + trigrams * 0.5, 0.0, 0.65));
          gl_FragColor = vec4(col, mask * fade * 0.78);
        }
      `,
    });

    const innerMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uProg: { value: 0 },
        uColor: { value: color.clone() },
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
        uniform float uProg;
        uniform vec3 uColor;
        varying vec2 vUv;

        void main() {
          float r = length(vUv);
          if (r > 1.0) discard;
          float a = atan(vUv.y, vUv.x + 1e-5);
          float rays = 0.5 + 0.5 * sin(a * 12.0 - uTime * 3.8 + r * 6.0);
          float ring = smoothstep(0.045, 0.01, abs(r - 0.78));
          float eye = smoothstep(0.75, 0.0, r) * (0.45 + 0.55 * rays);
          float fade = smoothstep(0.0, 0.14, uProg) * (1.0 - smoothstep(0.74, 1.0, uProg));
          float alpha = (ring + eye * 0.72) * fade * 0.7;
          if (alpha < 0.02) discard;
          gl_FragColor = vec4(uColor * 1.35, alpha);
        }
      `,
    });

    const cloudMesh = new THREE.Mesh(this.planeGeo, cloudMat);
    cloudMesh.scale.setScalar(radius * 2.5);
    const runeMesh = new THREE.Mesh(this.planeGeo, runeMat);
    runeMesh.position.z = -0.04;
    runeMesh.scale.setScalar(radius * 2.15);
    const innerMesh = new THREE.Mesh(this.planeGeo, innerMat);
    innerMesh.position.z = -0.12;
    innerMesh.scale.setScalar(radius * 1.35);

    gateGroup.add(cloudMesh, runeMesh, innerMesh);
    this.group.add(gateGroup);

    this.skyGates.push({
      group: gateGroup,
      center: new THREE.Vector3(pos.x, gateY, pos.z),
      radius,
      color: color.clone(),
      cloudMat,
      runeMat,
      innerMat,
      ownedGeos: [],
      ownedMats: [cloudMat, runeMat, innerMat],
      age: 0,
      duration,
      sparkTimer: 0,
    });
  }

  /**
   * Spawns a cinema-grade multi-part forged 3D Chinese Jian plunging from a high sky rift
   * with 3-phase choreography (Sky Manifest -> Supersonic Plunge -> Stone Impale & Damped Tremor).
   */
  spawnFallingSword(opts: {
    targetPos: THREE.Vector3;
    giant?: boolean;
    comboUlt?: boolean;
    delay?: number;
    color?: THREE.Color;
    tiltRad?: number;
    onImpact?: (pos: THREE.Vector3) => void;
  }): void {
    const giant = !!opts.giant;
    const comboUlt = !!opts.comboUlt;
    const sc = giant ? 3.15 : comboUlt ? 1.25 : 1.08;
    const col =
      opts.color?.clone() ??
      (giant
        ? new THREE.Color(2.2, 1.7, 0.55)
        : comboUlt
          ? new THREE.Color(0.95, 2.1, 1.95)
          : new THREE.Color(0.55, 2.05, 2.2));

    // Ensure an overhead Sky Sword Gate exists above this strike zone
    const hasNearbyGate = this.skyGates.some(
      (gate) =>
        gate.age < gate.duration * 0.72 &&
        Math.hypot(gate.center.x - opts.targetPos.x, gate.center.z - opts.targetPos.z) <= gate.radius + 2.4,
    );
    if (!hasNearbyGate) {
      this.spawnSkySwordGate(
        new THREE.Vector3(opts.targetPos.x, giant ? 13.6 : 11.8, opts.targetPos.z),
        giant ? 5.6 : 4.4,
        col,
        giant ? 1.9 : 1.6,
      );
    }

    const g = new THREE.Group();
    const steelMat = new THREE.MeshStandardMaterial({
      color: giant ? '#f3e5c4' : '#deebf5',
      emissive: col.clone().multiplyScalar(0.18),
      emissiveIntensity: 0.42,
      roughness: 0.16,
      metalness: 0.94,
      transparent: true,
      opacity: 1,
    });
    const fullerMat = new THREE.MeshStandardMaterial({
      color: col,
      emissive: col,
      emissiveIntensity: 1.45,
      roughness: 0.2,
      metalness: 0.35,
      transparent: true,
      opacity: 0.98,
    });
    const guardMat = new THREE.MeshStandardMaterial({
      color: giant ? '#e5b856' : '#cfa24e',
      emissive: new THREE.Color('#664310'),
      emissiveIntensity: 0.42,
      roughness: 0.26,
      metalness: 0.9,
      transparent: true,
      opacity: 1,
    });
    const gripMat = new THREE.MeshStandardMaterial({
      color: '#2c2220',
      emissive: new THREE.Color('#181110'),
      emissiveIntensity: 0.2,
      roughness: 0.48,
      metalness: 0.4,
      transparent: true,
      opacity: 1,
    });
    const tasselMat = new THREE.MeshStandardMaterial({
      color: giant ? '#f0a830' : '#d62b2b',
      emissive: new THREE.Color(giant ? '#995810' : '#7a1212'),
      emissiveIntensity: 0.52,
      roughness: 0.42,
      metalness: 0.18,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.96,
    });
    const wakeMat = new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: giant ? 0.42 : 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // 1-2. Double-edged Damascus beveled blade + sharpened tip (tip anchor at y = 0)
    const blade = new THREE.Mesh(this.jianGeos.blade, steelMat);
    blade.scale.set(1.0, 1.0, 0.28);
    blade.rotation.y = Math.PI / 4;
    blade.position.y = 0.91;

    const tip = new THREE.Mesh(this.jianGeos.tip, steelMat);
    tip.scale.set(1.0, 1.0, 0.28);
    tip.rotation.set(Math.PI, Math.PI / 4, 0);
    tip.position.y = 0.05;

    // 3. Luminous recessed spine rune fuller (emissiveIntensity >= 1.1)
    const fuller = new THREE.Mesh(this.jianGeos.fuller, fullerMat);
    fuller.scale.set(0.85, 1.0, 0.48);
    fuller.rotation.y = Math.PI / 4;
    fuller.position.y = 0.92;

    // 4-6. Wide sculpted dragon-wing curved crossguard + central guard jewel
    const guardLeft = new THREE.Mesh(this.jianGeos.guardWing, guardMat);
    guardLeft.scale.set(1.0, 1.0, 0.55);
    guardLeft.rotation.z = 1.24;
    guardLeft.position.set(-0.14, 1.63, 0);

    const guardRight = new THREE.Mesh(this.jianGeos.guardWing, guardMat);
    guardRight.scale.set(1.0, 1.0, 0.55);
    guardRight.rotation.z = -1.24;
    guardRight.position.set(0.14, 1.63, 0);

    const guardJewel = new THREE.Mesh(this.jianGeos.guardJewel, fullerMat);
    guardJewel.scale.set(1.25, 0.92, 0.68);
    guardJewel.position.y = 1.59;

    // 7-10. Ridged grip + heavy bronze/gold ring pommel + twin trailing silk sword tassels
    const grip = new THREE.Mesh(this.jianGeos.grip, gripMat);
    grip.position.y = 1.79;

    const pommelRing = new THREE.Mesh(this.jianGeos.pommelRing, guardMat);
    pommelRing.position.y = 2.02;

    const tasselA = new THREE.Mesh(this.jianGeos.tassel, tasselMat);
    tasselA.position.set(-0.036, 2.03, 0.012);
    tasselA.rotation.set(0.08, 0, 0.12);

    const tasselB = new THREE.Mesh(this.jianGeos.tassel, tasselMat);
    tasselB.position.set(0.036, 2.03, -0.012);
    tasselB.rotation.set(-0.08, 0, -0.12);

    // 11-12. Subtle thin air-wake ribbons ONLY behind the hilt (never obscuring blade/guard)
    const wakeGroup = new THREE.Group();
    wakeGroup.position.y = 2.08;
    const wakeRibbonA = new THREE.Mesh(this.jianGeos.wakeRibbon, wakeMat);
    const wakeRibbonB = new THREE.Mesh(this.jianGeos.wakeRibbon, wakeMat);
    wakeRibbonB.rotation.y = Math.PI / 2;
    wakeGroup.add(wakeRibbonA, wakeRibbonB);

    g.add(
      blade,
      tip,
      fuller,
      guardLeft,
      guardRight,
      guardJewel,
      grip,
      pommelRing,
      tasselA,
      tasselB,
      wakeGroup,
    );

    const ownedMats: THREE.Material[] = [steelMat, fullerMat, guardMat, gripMat, tasselMat, wakeMat];
    const fadeMats: Array<{ mat: THREE.Material & { opacity: number }; baseOpacity: number }> = [
      { mat: steelMat, baseOpacity: 1 },
      { mat: fullerMat, baseOpacity: 0.98 },
      { mat: guardMat, baseOpacity: 1 },
      { mat: gripMat, baseOpacity: 1 },
      { mat: tasselMat, baseOpacity: 0.96 },
      { mat: wakeMat, baseOpacity: giant ? 0.42 : 0.3 },
    ];

    if (giant || comboUlt) {
      const haloMat = new THREE.MeshBasicMaterial({
        color: giant ? new THREE.Color(2.1, 1.85, 0.85) : col,
        transparent: true,
        opacity: 0.54,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      ownedMats.push(haloMat);
      fadeMats.push({ mat: haloMat, baseOpacity: 0.54 });
      const ringCount = giant ? 3 : 2;
      for (let r = 0; r < ringCount; r++) {
        const ring = new THREE.Mesh(this.jianGeos.haloRing, haloMat);
        ring.scale.setScalar(0.75 + r * 0.28);
        ring.position.y = 1.95 + r * 0.26;
        ring.rotation.set(Math.PI / 2 + (r - 1) * 0.24, r * 0.6, 0);
        g.add(ring);
      }
    }

    g.scale.setScalar(sc);

    // Dramatic 8°-18° tilt angle along azimuth biased so crossguard & Damascus edge catch camera light
    const tiltRad = opts.tiltRad ?? ((giant ? 10 + Math.random() * 5 : 8 + Math.random() * 10) * Math.PI) / 180;
    const azimuth = Math.random() * Math.PI * 2;
    const sinT = Math.sin(tiltRad);
    const cosT = Math.cos(tiltRad);
    const upAxis = new THREE.Vector3(Math.cos(azimuth) * sinT, cosT, Math.sin(azimuth) * sinT).normalize();
    const tremorAxis = new THREE.Vector3(-upAxis.z, 0, upAxis.x);
    if (tremorAxis.lengthSq() < 1e-4) tremorAxis.set(1, 0, 0);
    tremorAxis.normalize();

    const impalePos = new THREE.Vector3(opts.targetPos.x, 0.05, opts.targetPos.z);
    const skyHeight = giant ? 14.2 + Math.random() * 1.1 : 11.5 + Math.random() * 3.0;
    const startPos = impalePos.clone().addScaledVector(upAxis, skyHeight / Math.max(0.5, cosT));
    g.position.copy(startPos);

    const baseQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), upAxis);
    g.quaternion.copy(baseQuat);

    // Crisp ground lock-on reticle during Phase 1 & Phase 2
    const reticleMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uProg: { value: 0 },
        uColor: { value: col.clone() },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv * 2.0 - 1.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uProg;
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          float r = length(vUv);
          if (r > 1.0) discard;
          float a = atan(vUv.y, vUv.x + 1e-5);
          float outerRing = smoothstep(0.045, 0.012, abs(r - 0.92));
          float lockRadius = mix(0.88, 0.24, uProg);
          float lockRing = smoothstep(0.05, 0.012, abs(r - lockRadius));
          float crossHair = (smoothstep(0.05, 0.01, abs(vUv.x)) + smoothstep(0.05, 0.01, abs(vUv.y)))
            * smoothstep(0.18, 0.35, r) * (1.0 - smoothstep(0.75, 0.95, r));
          float tick = step(0.72, cos(a * 4.0)) * smoothstep(0.09, 0.02, abs(r - 0.65));
          float mask = clamp(outerRing + lockRing * 1.2 + crossHair * 0.7 + tick * 0.5, 0.0, 1.3);
          float alpha = mask * (0.45 + 0.55 * uProg);
          if (alpha < 0.02) discard;
          gl_FragColor = vec4(uColor * 1.2, alpha);
        }
      `,
    });
    ownedMats.push(reticleMat);

    const reticle = new THREE.Mesh(this.planeGeo, reticleMat);
    reticle.rotation.x = -Math.PI / 2;
    reticle.position.set(opts.targetPos.x, 0.055, opts.targetPos.z);
    reticle.scale.setScalar(giant ? 5.6 : 1.9);

    g.visible = false;
    reticle.visible = false;
    this.group.add(g, reticle);

    this.swords.push({
      group: g,
      reticle,
      reticleMat,
      wakeGroup,
      tassels: [tasselA, tasselB],
      fadeMats,
      ownedMats,
      startPos,
      impalePos,
      targetPos: opts.targetPos.clone(),
      baseQuat,
      tremorAxis,
      baseScale: sc,
      color: col,
      age: -(opts.delay ?? 0),
      hoverDuration: giant ? 0.24 : 0.16,
      fallDuration: giant ? 0.34 : 0.24,
      lingerDuration: giant ? 1.45 : 0.95,
      impacted: false,
      giant,
      sparkTimer: 0,
      onImpact: opts.onImpact,
    });
  }

  /** High-simulation cracked-stone & glowing molten-ember ground scorch decal on heavy impacts/skills. */
  spawnGroundCrater(pos: THREE.Vector3, radius: number, color: THREE.Color, duration = 3.4): void {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uProg: { value: 0 },
        uColor: { value: color.clone() },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv * 2.0 - 1.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uProg;
        uniform vec3 uColor;
        varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(41.2, 289.1))) * 43758.5453); }
        void main() {
          float r = length(vUv);
          if (r > 1.0) discard;
          float a = atan(vUv.y, vUv.x);
          // 9 jagged radial fracture fissures
          float spoke = abs(sin(a * 4.5 + sin(r * 9.0) * 0.42 + hash(floor(vec2(a * 4.0, r * 3.0))) * 0.12));
          float crack = smoothstep(0.11, 0.015, spoke) * smoothstep(1.0, 0.14, r) * smoothstep(0.04, 0.16, r);
          float coreChar = smoothstep(0.88, 0.08, r);
          float emberGlow = pow(1.0 - clamp(uProg * 1.45, 0.0, 1.0), 1.6);
          float fadeOut = 1.0 - smoothstep(0.62, 1.0, uProg);
          vec3 scorchCol = vec3(0.05, 0.055, 0.07);
          vec3 col = mix(scorchCol, uColor * 1.35, clamp(crack * (0.45 + emberGlow * 1.2), 0.0, 1.0));
          float alpha = clamp(coreChar * 0.56 + crack * 0.85, 0.0, 0.92) * fadeOut;
          if (alpha < 0.02) discard;
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
    const mesh = new THREE.Mesh(this.planeGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.random() * Math.PI * 2;
    mesh.position.set(pos.x, 0.048, pos.z);
    mesh.scale.setScalar(radius * 2);
    this.group.add(mesh);
    this.craters.push({ mesh, mat, age: 0, duration });
  }

  /** Swirling jade-emerald spirit mist vortex for 灵葫回春 heal. */
  spawnHealVortex(pos: THREE.Vector3): void {
    const group = new THREE.Group();
    group.position.set(pos.x, 0.08, pos.z);
    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i === 0 ? new THREE.Color('#66f2b2') : new THREE.Color('#34c99b'),
        transparent: true,
        opacity: 0.52 - i * 0.1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.62 + i * 0.22, 0.88 + i * 0.16, 0.42 + i * 0.12, 20, 1, true), mat);
      cyl.position.y = 0.35 + i * 0.55;
      group.add(cyl);
      rings.push(cyl);
    }
    this.group.add(group);
    this.healVortices.push({ group, rings, age: 0, duration: 1.05 });
    this.spawnHitSparks(pos.clone().add(new THREE.Vector3(0, 0.9, 0)), new THREE.Vector3(0, 1, 0), new THREE.Color('#6effc4'), 16);
  }

  /** Tactile forged-steel clash sparks & crisp refraction shockwaves for Perfect Parry. */
  spawnParryBurst(pos: THREE.Vector3): void {
    this.spawnHitSparks(pos, new THREE.Vector3(0, 1, 0), new THREE.Color(2.4, 1.95, 0.72), 24);
    this.spawnShockRing(pos, new THREE.Color(2.3, 1.85, 0.65), 0.35, 3.8, 0.32);
    this.spawnShockRing(pos, new THREE.Color(0.85, 2.05, 2.25), 0.2, 2.4, 0.26);
  }

  /** League-of-Legends style emerald-jade right-click move ripple marker on the stone courtyard! */
  spawnMoveMarker(pos: THREE.Vector3): void {
    this.spawnShockRing(
      new THREE.Vector3(pos.x, 0.06, pos.z),
      new THREE.Color(0.35, 2.15, 1.35),
      0.85,
      0.14,
      0.34,
    );
    this.spawnShockRing(
      new THREE.Vector3(pos.x, 0.065, pos.z),
      new THREE.Color(0.75, 2.3, 1.65),
      0.16,
      0.72,
      0.28,
    );
  }

  /** Spawns an alpha-feathered glowing shockwave ripple (never an opaque hard-edged donut). */
  spawnShockRing(pos: THREE.Vector3, color: THREE.Color, startScale: number, endScale: number, duration = 0.38): void {
    this.pushRing(pos, Math.max(0.06, pos.y), color, startScale, endScale, duration);
  }

  /**
   * Spawns expanding dual concentric crystal-jade water splash rings on y = 0.05
   * plus tiny droplet sparks when moving or dodging through canyon shallow water.
   */
  spawnWaterRipple(pos: THREE.Vector3, scale = 1.0): void {
    const s = Math.max(0.4, scale);
    const outerCol = new THREE.Color(0.55, 1.55, 1.45);
    const innerCol = new THREE.Color(0.85, 1.85, 1.72);
    this.pushRing(pos, 0.05, outerCol, 0.24 * s, 1.28 * s, 0.52);
    this.pushRing(pos, 0.05, innerCol, 0.12 * s, 0.78 * s, 0.40);
    this.spawnHitSparks(
      new THREE.Vector3(pos.x, 0.08, pos.z),
      new THREE.Vector3(0, 1.0, 0),
      innerCol,
      Math.max(3, Math.round(4 * s)),
    );
  }

  private pushRing(
    pos: THREE.Vector3,
    yPos: number,
    color: THREE.Color,
    startScale: number,
    endScale: number,
    duration: number,
  ): void {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: color.clone() },
        uOpacity: { value: 0.62 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv * 2.0 - 1.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          float r = length(vUv);
          if (r > 1.0 || r < 0.45) discard;
          float a = atan(vUv.y, vUv.x);
          // Razor glowing leading crest + soft inner feather tail + subtle energy wisps
          float crest = smoothstep(0.99, 0.90, r) * smoothstep(0.78, 0.91, r);
          float tail = smoothstep(0.55, 0.90, r) * smoothstep(1.0, 0.88, r) * 0.42;
          float wisp = 0.78 + 0.22 * sin(a * 14.0 + r * 18.0);
          float alpha = (crest + tail) * wisp * uOpacity;
          if (alpha < 0.015) discard;
          gl_FragColor = vec4(uColor * 0.82, alpha);
        }
      `,
    });
    const mesh = new THREE.Mesh(this.planeGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, yPos, pos.z);
    mesh.scale.setScalar(startScale * 2);
    this.group.add(mesh);
    this.rings.push({ mesh, mat, age: 0, duration, startScale, endScale });
  }

  /**
   * Directional contact sparks flying along the slash tangent (per combat-feel.md).
   */
  spawnHitSparks(
    pos: THREE.Vector3,
    tangentDir: THREE.Vector3,
    color: THREE.Color,
    count = 12,
    rng: () => number = Math.random,
  ): void {
    const dir = tangentDir.lengthSq() > 1e-4 ? tangentDir.clone().normalize() : new THREE.Vector3(1, 0.2, 0);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.sparkGeo, mat);
      mesh.position.copy(pos);

      const speed = 5.5 + rng() * 8.5;
      const spread = 0.62;
      const vel = new THREE.Vector3(
        dir.x + (rng() - 0.5) * spread * 2,
        Math.abs(dir.y) + 0.25 + rng() * 0.85,
        dir.z + (rng() - 0.5) * spread * 2,
      )
        .normalize()
        .multiplyScalar(speed);
      mesh.lookAt(pos.x + vel.x, pos.y + vel.y, pos.z + vel.z);

      this.group.add(mesh);
      this.sparks.push({ mesh, mat, vel, age: 0, duration: 0.18 + rng() * 0.16 });
    }
  }

  /**
   * Spawns a true 3D human swordsman silhouette afterimage (Fresnel spirit-aura contour shader)
   * baked from the live posed character hierarchy (never a capsule/box placeholder).
   */
  spawnAfterimage(
    pos: THREE.Vector3,
    yaw: number,
    color = new THREE.Color(0.35, 1.55, 1.85),
    sourceRoot?: THREE.Object3D,
  ): void {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
      uniforms: {
        uColor: { value: color.clone() },
        uOpacity: { value: 0.68 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vNormalV;
        varying vec3 vViewPos;
        void main() {
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vNormalV = normalize(normalMatrix * normal);
          vViewPos = -mvPos.xyz;
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec3 vNormalV;
        varying vec3 vViewPos;
        void main() {
          vec3 N = normalize(vNormalV);
          vec3 V = normalize(vViewPos);
          float rim = 1.0 - abs(dot(N, V));
          float fresnel = pow(clamp(rim, 0.0, 1.0), 1.9);
          float alpha = (0.14 + 0.86 * fresnel) * uOpacity;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(uColor * (0.45 + 0.85 * fresnel), alpha);
        }
      `,
    });

    const ghostGroup = new THREE.Group();
    const ownedGeos: THREE.BufferGeometry[] = [];

    if (sourceRoot) {
      sourceRoot.updateMatrixWorld(true);
      const tmpV = new THREE.Vector3();
      sourceRoot.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh) || !obj.visible) return;
        const srcGeo = obj.geometry;
        if (!srcGeo || srcGeo.type === 'CircleGeometry') return;

        let snapMesh: THREE.Mesh;
        if (obj instanceof THREE.SkinnedMesh && obj.skeleton) {
          const srcPos = srcGeo.getAttribute('position');
          if (!srcPos) return;
          const baked = new Float32Array(srcPos.count * 3);
          for (let i = 0; i < srcPos.count; i++) {
            tmpV.fromBufferAttribute(srcPos, i);
            obj.applyBoneTransform(i, tmpV);
            baked[i * 3] = tmpV.x;
            baked[i * 3 + 1] = tmpV.y;
            baked[i * 3 + 2] = tmpV.z;
          }
          const bakedGeo = new THREE.BufferGeometry();
          bakedGeo.setAttribute('position', new THREE.BufferAttribute(baked, 3));
          const idx = srcGeo.getIndex();
          if (idx) bakedGeo.setIndex(idx.clone());
          bakedGeo.computeVertexNormals();
          ownedGeos.push(bakedGeo);
          snapMesh = new THREE.Mesh(bakedGeo, mat);
        } else {
          snapMesh = new THREE.Mesh(srcGeo, mat);
        }

        snapMesh.matrixAutoUpdate = false;
        snapMesh.matrix.copy(obj.matrixWorld);
        ghostGroup.add(snapMesh);
      });
    }

    // Fallback multi-part sculpted swordsman figure (only used if no sourceRoot passed)
    if (ghostGroup.children.length === 0) {
      const figure = new THREE.Group();
      figure.position.copy(pos);
      figure.rotation.y = yaw;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 8), mat);
      head.position.set(0, 1.56, 0.04);
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.5, 10), mat);
      torso.position.set(0, 1.18, 0.02);
      torso.rotation.x = 0.22;
      const hem = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.28, 0.42, 10), mat);
      hem.position.set(0, 0.82, -0.02);
      const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.05, 0.56, 8), mat);
      legL.position.set(0.12, 0.34, 0.16);
      legL.rotation.x = -0.35;
      const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.05, 0.56, 8), mat);
      legR.position.set(-0.12, 0.32, -0.18);
      legR.rotation.x = 0.42;
      const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.48, 8), mat);
      armL.position.set(0.24, 1.24, 0.06);
      armL.rotation.set(0.2, 0, -0.35);
      const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.48, 8), mat);
      armR.position.set(-0.24, 1.2, -0.08);
      armR.rotation.set(0.5, 0, 0.3);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.02, 0.015), mat);
      blade.position.set(-0.32, 1.1, -0.45);
      blade.rotation.set(-0.85, 0, 0.25);
      for (const m of [head, torso, hem, legL, legR, armL, armR, blade]) {
        ownedGeos.push(m.geometry);
        figure.add(m);
      }
      ghostGroup.add(figure);
    }

    const drift = new THREE.Vector3(-Math.sin(yaw) * 0.42, 0.08, -Math.cos(yaw) * 0.42);
    this.group.add(ghostGroup);
    this.ghosts.push({ group: ghostGroup, mat, ownedGeos, drift, age: 0, duration: 0.34 });
  }

  /**
   * Shader-driven enemy attack telegraph (flowing stripes / progress sweep, NEVER flat plain circles).
   */
  createTelegraph(
    kind: 'circle' | 'fan' | 'line',
    pos: THREE.Vector3,
    yaw: number,
    sizeX: number,
    sizeZ: number,
    color = new THREE.Color(1.9, 0.28, 0.34),
  ): TelegraphHandle {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uProg: { value: 0 },
        uKind: { value: kind === 'circle' ? 0 : kind === 'fan' ? 1 : 2 },
        uColor: { value: color.clone() },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uProg;
        uniform float uKind;
        uniform vec3 uColor;
        varying vec2 vUv;

        void main() {
          float mask = 0.0;
          float fill = 0.0;
          float border = 0.0;

          if (uKind < 0.5) {
            // Circle ground AOE with expanding charge ring + flowing radial streaks
            vec2 p = vUv * 2.0 - 1.0;
            float r = length(p);
            if (r > 1.0) discard;
            float a = atan(p.y, p.x);
            border = smoothstep(0.055, 0.015, abs(r - 0.96));
            float chargeLine = smoothstep(0.045, 0.01, abs(r - uProg));
            float stripes = 0.5 + 0.5 * sin(r * 22.0 - uProg * 14.0 + sin(a * 6.0));
            fill = step(r, uProg) * (0.18 + 0.16 * stripes) + 0.10;
            mask = clamp(border * 1.1 + chargeLine * 1.35 + fill, 0.0, 1.4);
          } else if (uKind < 1.5) {
            // Fan cleave sector oriented toward +Z (vUv.y = 1)
            vec2 p = vec2(vUv.x * 2.0 - 1.0, vUv.y);
            float r = length(p);
            float ang = abs(atan(p.x, max(p.y, 0.0001)));
            if (r > 1.0 || ang > 0.78) discard;
            border = smoothstep(0.05, 0.015, abs(r - 0.96)) + smoothstep(0.06, 0.01, abs(ang - 0.75));
            float charge = smoothstep(0.05, 0.01, abs(r - uProg));
            float flow = 0.5 + 0.5 * sin(r * 18.0 - uProg * 12.0);
            fill = step(r, uProg) * (0.22 + 0.15 * flow) + 0.11;
            mask = clamp(border * 0.95 + charge * 1.3 + fill, 0.0, 1.4);
          } else {
            // Tapered blade lunge warning line
            float x = abs(vUv.x * 2.0 - 1.0);
            float taper = mix(0.85, 0.18, smoothstep(0.65, 1.0, vUv.y));
            if (x > taper) discard;
            border = smoothstep(0.12, 0.02, abs(x - taper));
            float front = smoothstep(0.05, 0.01, abs(vUv.y - uProg));
            fill = step(vUv.y, uProg) * 0.34 + 0.12;
            mask = clamp(border + front * 1.4 + fill, 0.0, 1.4);
          }

          vec3 col = mix(uColor, vec3(2.4, 1.85, 1.1), smoothstep(0.75, 1.0, uProg));
          gl_FragColor = vec4(col, mask * 0.68);
        }
      `,
    });

    const mesh = new THREE.Mesh(this.planeGeo, mat);
    mesh.rotation.order = 'YXZ';
    mesh.rotation.set(-Math.PI / 2, yaw, 0);
    if (kind === 'circle') {
      mesh.position.set(pos.x, 0.055, pos.z);
      mesh.scale.set(sizeX * 2, sizeZ * 2, 1);
    } else {
      // Shift forward half length along yaw so origin is at attacker feet
      mesh.position.set(
        pos.x + Math.sin(yaw) * (sizeZ * 0.5),
        0.055,
        pos.z + Math.cos(yaw) * (sizeZ * 0.5),
      );
      mesh.scale.set(sizeX, sizeZ, 1);
    }
    this.group.add(mesh);

    return {
      mesh,
      mat,
      updateProgress: (p: number) => {
        mat.uniforms.uProg.value = clamp(p, 0, 1);
      },
      dispose: () => {
        this.group.remove(mesh);
        mat.dispose();
      },
    };
  }

  /**
   * Spawns a modeled 3D loot drop with parabolic bounce + 3-layer rarity light pillar
   * (bright core + mid beam + wide soft glow, per guizang vfx-ui-audio.md).
   */
  spawnLootDrop(
    pos: THREE.Vector3,
    kind: 'heal' | 'spirit' | 'gourd',
    rng: () => number,
  ): void {
    const colHex = kind === 'gourd' ? '#ffbe42' : kind === 'heal' ? '#3be898' : '#40d8ff';
    const colHdr =
      kind === 'gourd'
        ? new THREE.Color(2.3, 1.55, 0.35)
        : kind === 'heal'
          ? new THREE.Color(0.45, 2.0, 1.15)
          : new THREE.Color(0.42, 1.75, 2.25);

    const mesh = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: colHex,
      emissive: new THREE.Color(colHex),
      emissiveIntensity: 0.9,
      roughness: 0.25,
      metalness: 0.55,
    });
    if (kind === 'gourd') {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), bodyMat);
      const t = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), bodyMat);
      t.position.y = 0.18;
      mesh.add(b, t);
    } else {
      const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 1), bodyMat);
      mesh.add(orb);
    }
    mesh.position.set(pos.x, pos.y + 0.5, pos.z);

    // Subtle short translucent light pillar for minor drops (keeps combat sightlines clear)
    const pillar = new THREE.Group();
    const pillarH = kind === 'gourd' ? 1.45 : 1.05;
    const layers: Array<[number, number]> =
      kind === 'gourd'
        ? [
            [0.05, 0.56],
            [0.14, 0.22],
          ]
        : [
            [0.04, 0.42],
            [0.12, 0.16],
          ];
    for (const [rad, op] of layers) {
      const pMat = new THREE.MeshBasicMaterial({
        color: colHdr,
        transparent: true,
        opacity: op,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.45, rad, pillarH, 10, 1, true), pMat);
      cyl.position.y = pillarH * 0.5;
      pillar.add(cyl);
    }
    const baseRing = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.48, 20),
      new THREE.MeshBasicMaterial({
        color: colHdr,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    baseRing.rotation.x = -Math.PI / 2;
    baseRing.position.y = 0.04;
    pillar.add(baseRing);
    pillar.visible = false;

    const a = rng() * Math.PI * 2;
    const spd = 2.0 + rng() * 1.8;
    const drop: LootDrop = {
      kind,
      pos: mesh.position.clone(),
      vel: new THREE.Vector3(Math.cos(a) * spd, 4.4 + rng() * 1.4, Math.sin(a) * spd),
      age: 0,
      bounced: false,
      collected: false,
      mesh,
      pillar,
    };

    this.group.add(mesh, pillar);
    this.drops.push(drop);
  }

  /**
   * Legend-style ("传奇光柱") 3D gear loot drop with towering rarity light beam + rotating floor rune ring.
   */
  spawnGearDrop(pos: THREE.Vector3, item: RolledGearItem, rng: () => number): void {
    const r = item.rarity;
    const colHex =
      r === 'legendary' ? '#ffaa1d' : r === 'epic' ? '#c56bff' : r === 'rare' ? '#38b6ff' : '#5de8b5';
    const colHdr =
      r === 'legendary'
        ? new THREE.Color(2.5, 1.45, 0.28)
        : r === 'epic'
          ? new THREE.Color(1.65, 0.62, 2.45)
          : r === 'rare'
            ? new THREE.Color(0.38, 1.55, 2.45)
            : new THREE.Color(0.45, 1.95, 1.35);

    const mesh = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: colHex,
      emissive: new THREE.Color(colHex),
      emissiveIntensity: r === 'legendary' ? 1.45 : r === 'epic' ? 1.15 : 0.9,
      roughness: 0.18,
      metalness: 0.72,
    });
    const coreCrystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(r === 'legendary' ? 0.28 : r === 'epic' ? 0.24 : 0.2, 0),
      bodyMat,
    );
    coreCrystal.scale.set(0.75, 1.55, 0.75);
    mesh.add(coreCrystal);
    if (r === 'legendary' || r === 'epic') {
      const haloRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.34, 0.032, 8, 24),
        new THREE.MeshBasicMaterial({
          color: colHdr,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      haloRing.rotation.x = Math.PI * 0.35;
      mesh.add(haloRing);
    }
    mesh.position.set(pos.x, pos.y + 0.6, pos.z);

    const pillar = new THREE.Group();
    const pillarCyls: Array<{ mat: THREE.MeshBasicMaterial; baseOpacity: number }> = [];
    const pillarH = r === 'legendary' ? 9.4 : r === 'epic' ? 7.2 : r === 'rare' ? 5.5 : 3.2;
    const layers: Array<[number, number]> =
      r === 'legendary'
        ? [
            [0.09, 0.98],
            [0.24, 0.56],
            [0.48, 0.24],
          ]
        : r === 'epic'
          ? [
              [0.08, 0.94],
              [0.2, 0.48],
              [0.4, 0.2],
            ]
          : [
              [0.06, 0.9],
              [0.16, 0.42],
              [0.34, 0.16],
            ];
    for (const [rad, op] of layers) {
      const pMat = new THREE.MeshBasicMaterial({
        color: colHdr,
        transparent: true,
        opacity: op,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.42, rad, pillarH, 12, 1, true), pMat);
      cyl.position.y = pillarH * 0.5;
      pillar.add(cyl);
      pillarCyls.push({ mat: pMat, baseOpacity: op });
    }

    if (r === 'legendary') {
      const crimsonHdr = new THREE.Color(2.4, 0.35, 0.25);
      const spiralMat = new THREE.MeshBasicMaterial({
        color: crimsonHdr,
        transparent: true,
        opacity: 0.36,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        wireframe: true,
      });
      const outerSpiral = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.36, pillarH * 0.85, 6, 1, true),
        spiralMat,
      );
      outerSpiral.position.y = pillarH * 0.425;
      outerSpiral.name = 'counterSpin';
      pillar.add(outerSpiral);
      pillarCyls.push({ mat: spiralMat, baseOpacity: 0.36 });
    }

    const baseRing = new THREE.Mesh(
      new THREE.RingGeometry(r === 'legendary' ? 0.52 : 0.36, r === 'legendary' ? 0.78 : 0.58, 24),
      new THREE.MeshBasicMaterial({
        color: colHdr,
        transparent: true,
        opacity: r === 'epic' || r === 'legendary' ? 0.88 : 0.72,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    baseRing.rotation.x = -Math.PI / 2;
    baseRing.position.y = 0.05;
    pillar.add(baseRing);

    if (r === 'epic' || r === 'legendary') {
      const runeRing = new THREE.Mesh(
        new THREE.RingGeometry(0.9, 1.04, 8),
        new THREE.MeshBasicMaterial({
          color: colHdr,
          transparent: true,
          opacity: 0.7,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      runeRing.rotation.x = -Math.PI / 2;
      runeRing.position.y = 0.055;
      runeRing.name = 'runeRing';
      pillar.add(runeRing);
    }

    pillar.visible = false;
    const a = rng() * Math.PI * 2;
    const spd = 2.2 + rng() * 1.8;
    const drop: LootDrop = {
      kind: 'gear',
      pos: mesh.position.clone(),
      vel: new THREE.Vector3(Math.cos(a) * spd, 5.2 + rng() * 1.4, Math.sin(a) * spd),
      age: 0,
      bounced: false,
      collected: false,
      mesh,
      pillar,
      pillarCyls,
      pillarFade: 0,
      gearItem: item,
      rarity: r,
    };

    this.group.add(mesh, pillar);
    this.drops.push(drop);
  }

  getPendingGearDropCount(): number {
    return this.drops.filter((d) => d.kind === 'gear' && !d.collected).length;
  }

  collectAllGearDrops(): RolledGearItem[] {
    const collected: RolledGearItem[] = [];
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      if (d.kind === 'gear' && d.gearItem) {
        collected.push(d.gearItem);
        this.group.remove(d.mesh, d.pillar);
        this.drops.splice(i, 1);
      }
    }
    return collected;
  }

  update(
    dt: number,
    elapsed: number,
    heroPos: THREE.Vector3,
    onCollectDrop?: (kind: LootDrop['kind'], gearItem?: RolledGearItem) => void,
    onDropBounce?: (kind: LootDrop['kind']) => void,
    cameraPos?: THREE.Vector3,
  ): void {
    // 1. Slash arcs
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i];
      s.age += dt;
      const p = s.age / s.duration;
      if (p >= 1) {
        this.group.remove(s.mesh, s.inkMesh);
        s.mat.dispose();
        s.inkMat.dispose();
        this.slashes.splice(i, 1);
      } else {
        s.mat.uniforms.uProg.value = p;
        s.inkMat.uniforms.uProg.value = p;
      }
    }

    // 2. Bagua rune arrays
    for (let i = this.arrays.length - 1; i >= 0; i--) {
      const a = this.arrays[i];
      a.age += dt;
      const p = a.age / a.duration;
      if (p >= 1) {
        this.group.remove(a.mesh);
        a.mat.dispose();
        this.arrays.splice(i, 1);
      } else {
        a.mat.uniforms.uTime.value = elapsed;
        a.mat.uniforms.uProg.value = p;
      }
    }

    // 2b. Sky Sword Gates (Cloud-Rift + Bagua-Rune Portal)
    for (let i = this.skyGates.length - 1; i >= 0; i--) {
      const gate = this.skyGates[i];
      gate.age += dt;
      const p = gate.age / gate.duration;
      if (p >= 1) {
        this.group.remove(gate.group);
        for (const m of gate.ownedMats) m.dispose();
        for (const geo of gate.ownedGeos) geo.dispose();
        this.skyGates.splice(i, 1);
      } else {
        gate.cloudMat.uniforms.uTime.value = elapsed;
        gate.cloudMat.uniforms.uProg.value = p;
        gate.runeMat.uniforms.uTime.value = elapsed;
        gate.runeMat.uniforms.uProg.value = p;
        gate.innerMat.uniforms.uTime.value = elapsed;
        gate.innerMat.uniforms.uProg.value = p;
        // Emit swirling vortex sparks inside the rift aperture while active
        gate.sparkTimer += dt;
        if (p < 0.85 && gate.sparkTimer >= 0.055) {
          gate.sparkTimer = 0;
          const ang = Math.random() * Math.PI * 2;
          const rad = (0.35 + Math.random() * 0.6) * gate.radius;
          const spPos = new THREE.Vector3(
            gate.center.x + Math.cos(ang) * rad,
            gate.center.y - 0.25,
            gate.center.z + Math.sin(ang) * rad,
          );
          const spDir = new THREE.Vector3(-Math.sin(ang) * 0.65, -0.85, Math.cos(ang) * 0.65);
          this.spawnHitSparks(spPos, spDir, gate.color, 2);
        }
      }
    }

    // 3. Falling 3D forged Chinese Jians (Manifest -> Supersonic Plunge -> Stone Impale & Damped Tremor)
    const tremorQ = new THREE.Quaternion();
    for (let i = this.swords.length - 1; i >= 0; i--) {
      const sw = this.swords[i];
      sw.age += dt;
      if (sw.age < 0) {
        sw.group.visible = false;
        sw.reticle.visible = false;
        continue;
      }
      sw.group.visible = true;

      // Animate silk tassels behind the hilt
      sw.tassels.forEach((ts, idx) => {
        const sign = idx === 0 ? 1 : -1;
        ts.rotation.x = Math.sin(elapsed * 12 + idx * 1.7 + i) * 0.16;
        ts.rotation.z = sign * (0.12 + Math.cos(elapsed * 10 + idx * 1.3) * 0.11);
      });

      if (sw.age < sw.hoverDuration) {
        // Phase 1: Sky Manifest inside high rift + ground lock-on reticle
        const m = clamp(sw.age / sw.hoverDuration, 0, 1);
        const appear = clamp(m / 0.45, 0, 1);
        sw.group.position.copy(sw.startPos);
        sw.group.position.y += Math.sin(m * Math.PI) * (sw.giant ? 0.45 : 0.25);
        sw.group.scale.setScalar(lerp(0.35, 1.0, easeOutQuart(m)) * sw.baseScale);
        sw.group.quaternion.copy(sw.baseQuat);
        sw.wakeGroup.visible = false;
        sw.reticle.visible = true;
        sw.reticleMat.uniforms.uProg.value = m * 0.65;
        for (const fm of sw.fadeMats) fm.mat.opacity = fm.baseOpacity * appear;
      } else if (sw.age <= sw.hoverDuration + sw.fallDuration) {
        // Phase 2: Supersonic Accelerated Plunge straight along shaft vector
        const u = clamp((sw.age - sw.hoverDuration) / sw.fallDuration, 0, 1);
        const plungeT = Math.pow(u, 2.3);
        sw.group.position.lerpVectors(sw.startPos, sw.impalePos, plungeT);
        sw.group.scale.setScalar(sw.baseScale);
        sw.group.quaternion.copy(sw.baseQuat);
        sw.wakeGroup.visible = true;
        sw.wakeGroup.scale.set(1, 0.45 + Math.pow(u, 1.3) * 1.15, 1);
        sw.reticle.visible = true;
        sw.reticleMat.uniforms.uProg.value = 0.65 + u * 0.35;
        for (const fm of sw.fadeMats) fm.mat.opacity = fm.baseOpacity;
      } else {
        // Phase 3: Physical Stone Impale & Damped Spring Vibration
        sw.group.position.copy(sw.impalePos);
        sw.group.scale.setScalar(sw.baseScale);
        if (!sw.impacted) {
          sw.impacted = true;
          sw.wakeGroup.visible = false;
          sw.reticle.visible = false;
          this.spawnShockRing(
            sw.impalePos,
            sw.color,
            sw.giant ? 0.8 : 0.3,
            sw.giant ? 6.8 : 2.1,
            sw.giant ? 0.55 : 0.34,
          );
          this.spawnGroundCrater(
            sw.impalePos,
            sw.giant ? 4.4 : 1.15,
            sw.color,
            sw.giant ? 4.2 : 2.2,
          );
          this.spawnHitSparks(
            sw.impalePos.clone().add(new THREE.Vector3(0, 0.25, 0)),
            new THREE.Vector3(0, 1, 0),
            sw.color,
            sw.giant ? 26 : 10,
          );
          sw.onImpact?.(sw.targetPos);
        }

        const impaleT = sw.age - (sw.hoverDuration + sw.fallDuration);
        const lingerP = impaleT / sw.lingerDuration;
        if (lingerP >= 1) {
          this.group.remove(sw.group, sw.reticle);
          for (const m of sw.ownedMats) m.dispose();
          this.swords.splice(i, 1);
        } else {
          // Damped spring blade-tremor for ~0.25s after striking stone
          if (impaleT < 0.35) {
            const tremor = Math.sin(impaleT * 42) * Math.exp(-impaleT * 6) * (sw.giant ? 0.065 : 0.095);
            tremorQ.setFromAxisAngle(sw.tremorAxis, tremor);
            sw.group.quaternion.copy(sw.baseQuat).multiply(tremorQ);
          } else {
            sw.group.quaternion.copy(sw.baseQuat);
          }

          // Dissolve cleanly into rising spirit sparks after holding crisp steel silhouette
          const fade = 1 - clamp((lingerP - 0.56) / 0.44, 0, 1);
          for (const fm of sw.fadeMats) fm.mat.opacity = fm.baseOpacity * fade;
          if (lingerP > 0.54) {
            sw.sparkTimer += dt;
            if (sw.sparkTimer >= 0.085) {
              sw.sparkTimer = 0;
              const sparkOrigin = sw.impalePos.clone().add(new THREE.Vector3(0, 0.4 + Math.random() * 1.1, 0));
              this.spawnHitSparks(sparkOrigin, new THREE.Vector3(0, 1.2, 0), sw.color, sw.giant ? 3 : 1);
            }
          }
        }
      }
    }

    // 4. Shock rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.age += dt;
      const p = r.age / r.duration;
      if (p >= 1) {
        this.group.remove(r.mesh);
        r.mat.dispose();
        this.rings.splice(i, 1);
      } else {
        const sc = lerp(r.startScale, r.endScale, easeOutQuart(p));
        r.mesh.scale.setScalar(sc * 2);
        r.mat.uniforms.uOpacity.value = (1 - p) * 0.62;
      }
    }

    // 5. Contact sparks
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const sp = this.sparks[i];
      sp.age += dt;
      const p = sp.age / sp.duration;
      if (p >= 1) {
        this.group.remove(sp.mesh);
        sp.mat.dispose();
        this.sparks.splice(i, 1);
      } else {
        sp.vel.y -= 16 * dt;
        sp.mesh.position.addScaledVector(sp.vel, dt);
        sp.mat.opacity = 1 - p;
        sp.mesh.scale.set(1, 1, 1 - p * 0.65);
      }
    }

    // 6. 3D Human Silhouette Afterimages
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const gh = this.ghosts[i];
      gh.age += dt;
      const p = gh.age / gh.duration;
      if (p >= 1) {
        this.group.remove(gh.group);
        gh.mat.dispose();
        for (const geo of gh.ownedGeos) geo.dispose();
        this.ghosts.splice(i, 1);
      } else {
        gh.group.position.addScaledVector(gh.drift, dt);
        const fade = 1 - p;
        gh.mat.uniforms.uOpacity.value = fade * fade * 0.68;
      }
    }

    // 6b. Ground scorch / cracked-stone decals
    for (let i = this.craters.length - 1; i >= 0; i--) {
      const c = this.craters[i];
      c.age += dt;
      const p = c.age / c.duration;
      if (p >= 1) {
        this.group.remove(c.mesh);
        c.mat.dispose();
        this.craters.splice(i, 1);
      } else {
        c.mat.uniforms.uProg.value = p;
      }
    }

    // 6c. Emerald heal vortices
    for (let i = this.healVortices.length - 1; i >= 0; i--) {
      const hv = this.healVortices[i];
      hv.age += dt;
      const p = hv.age / hv.duration;
      if (p >= 1) {
        this.group.remove(hv.group);
        for (const r of hv.rings) (r.material as THREE.Material).dispose();
        this.healVortices.splice(i, 1);
      } else {
        hv.group.rotation.y += dt * 4.5;
        hv.rings.forEach((r, idx) => {
          r.position.y = 0.25 + idx * 0.45 + p * 0.95;
          r.scale.setScalar(1 + p * 0.35);
          (r.material as THREE.MeshBasicMaterial).opacity = (1 - p) * (0.48 - idx * 0.08);
        });
      }
    }

    // 7. Loot drops physics, pillar pulse & magnetic collection
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      if (!d.bounced) {
        d.vel.y -= 14.5 * dt;
        d.pos.addScaledVector(d.vel, dt);
        if (d.pos.y <= 0.34) {
          d.pos.y = 0.34;
          d.vel.set(0, 0, 0);
          d.bounced = true;
          d.pillar.visible = true;
          d.pillar.position.set(d.pos.x, 0, d.pos.z);
          this.spawnShockRing(d.pos, new THREE.Color(2.0, 1.75, 0.85), 0.2, 1.35, 0.32);
          onDropBounce?.(d.kind);
        }
      } else {
        d.mesh.rotation.y += dt * 2.6;
        const dx = heroPos.x - d.pos.x;
        const dz = heroPos.z - d.pos.z;
        const dist = Math.hypot(dx, dz);
        // Magnetic pickup arc into Li Xiaoyao
        if (dist < 5.5 && d.age > 0.35) {
          const pull = Math.min(1, dt * (8 + (5.5 - dist) * 3.0));
          d.pos.x += dx * pull;
          d.pos.z += dz * pull;
          d.pos.y = lerp(d.pos.y, 1.05, pull);
          d.pillar.visible = false;
        } else {
          d.pos.y = 0.38 + Math.sin(elapsed * 3.4 + i) * 0.1;
          let heightScale = 1;
          if (d.kind === 'gear') {
            let obstructs = false;
            if (cameraPos) {
              const distCamToHero = distPointToSegmentXZ(
                d.pos.x,
                d.pos.z,
                cameraPos.x,
                cameraPos.z,
                heroPos.x,
                heroPos.z,
              );
              const distForwardArrow = distPointToSegmentXZ(
                d.pos.x,
                d.pos.z,
                heroPos.x,
                heroPos.z,
                heroPos.x,
                heroPos.z - 8,
              );
              obstructs = Math.min(distCamToHero, distForwardArrow) < 2.8;
            }
            d.pillarFade = lerp(d.pillarFade ?? 0, obstructs ? 1 : 0, Math.min(1, dt * 10));
            heightScale = lerp(1, 0.38, d.pillarFade);
            const opacityScale = lerp(1, 0.22, d.pillarFade);
            if (d.pillarCyls) {
              for (const cyl of d.pillarCyls) {
                cyl.mat.opacity = cyl.baseOpacity * opacityScale;
              }
            }
            d.pillar.rotation.y += dt * 0.9;
            const cs = d.pillar.getObjectByName('counterSpin');
            if (cs) cs.rotation.y -= dt * 2.4;
          }
          const pulse = 1 + Math.sin(elapsed * 4.2) * 0.08;
          d.pillar.scale.set(pulse, heightScale, pulse);
        }
        if (dist < 0.85 && d.age > 0.35) {
          this.group.remove(d.mesh, d.pillar);
          this.drops.splice(i, 1);
          onCollectDrop?.(d.kind, d.gearItem);
          continue;
        }
      }
      d.mesh.position.copy(d.pos);
    }
  }

  clearAll(): void {
    for (const s of this.slashes) {
      this.group.remove(s.mesh, s.inkMesh);
      s.mat.dispose();
      s.inkMat.dispose();
    }
    this.slashes.length = 0;
    for (const a of this.arrays) {
      this.group.remove(a.mesh);
      a.mat.dispose();
    }
    this.arrays.length = 0;
    for (const gate of this.skyGates) {
      this.group.remove(gate.group);
      for (const m of gate.ownedMats) m.dispose();
      for (const geo of gate.ownedGeos) geo.dispose();
    }
    this.skyGates.length = 0;
    for (const sw of this.swords) {
      this.group.remove(sw.group, sw.reticle);
      for (const m of sw.ownedMats) m.dispose();
    }
    this.swords.length = 0;
    for (const r of this.rings) {
      this.group.remove(r.mesh);
      r.mat.dispose();
    }
    this.rings.length = 0;
    for (const sp of this.sparks) {
      this.group.remove(sp.mesh);
      sp.mat.dispose();
    }
    this.sparks.length = 0;
    for (const gh of this.ghosts) {
      this.group.remove(gh.group);
      gh.mat.dispose();
      for (const geo of gh.ownedGeos) geo.dispose();
    }
    this.ghosts.length = 0;
    for (const c of this.craters) {
      this.group.remove(c.mesh);
      c.mat.dispose();
    }
    this.craters.length = 0;
    for (const hv of this.healVortices) {
      this.group.remove(hv.group);
      for (const r of hv.rings) (r.material as THREE.Material).dispose();
    }
    this.healVortices.length = 0;
    for (const d of this.drops) this.group.remove(d.mesh, d.pillar);
    this.drops.length = 0;
  }

  getGhostStats(): { ghostGroups: number; maxChildMeshes: number; hasCapsule: boolean } {
    let maxChildMeshes = 0;
    let hasCapsule = false;
    for (const gh of this.ghosts) {
      let count = 0;
      gh.group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          count += 1;
          if (o.geometry.type === 'CapsuleGeometry') hasCapsule = true;
        }
      });
      if (count > maxChildMeshes) maxChildMeshes = count;
    }
    return { ghostGroups: this.ghosts.length, maxChildMeshes, hasCapsule };
  }

  getFallingSwordStats(): { activeSwords: number; maxChildMeshesPerSword: number; impaledCount: number } {
    let maxChildMeshesPerSword = 0;
    let impaledCount = 0;
    for (const sw of this.swords) {
      if (sw.impacted) impaledCount += 1;
      let count = 0;
      sw.group.traverse((o) => {
        if (o instanceof THREE.Mesh) count += 1;
      });
      if (count > maxChildMeshesPerSword) maxChildMeshesPerSword = count;
    }
    return {
      activeSwords: this.swords.length,
      maxChildMeshesPerSword,
      impaledCount,
    };
  }
}
