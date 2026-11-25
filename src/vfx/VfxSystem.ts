import * as THREE from 'three';
import { clamp, easeOutQuart, lerp } from '../utils/math';

export interface LootDrop {
  kind: 'heal' | 'spirit' | 'gourd';
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  bounced: boolean;
  collected: boolean;
  mesh: THREE.Group;
  pillar: THREE.Group;
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

interface FallingSwordVfx {
  group: THREE.Group;
  trail: THREE.Mesh;
  startPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  age: number;
  fallDuration: number;
  lingerDuration: number;
  impacted: boolean;
  giant: boolean;
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
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
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

export class VfxSystem {
  readonly group = new THREE.Group();
  readonly drops: LootDrop[] = [];

  private readonly slashes: SlashVfx[] = [];
  private readonly arrays: ArrayVfx[] = [];
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
   * Spawns a true 3D sculpted Spirit Sword plunging from the sky with comet trail
   * and ground impact shockwave (used for 万剑诀 and 天剑大招).
   */
  spawnFallingSword(opts: {
    targetPos: THREE.Vector3;
    giant?: boolean;
    delay?: number;
    color?: THREE.Color;
    onImpact?: (pos: THREE.Vector3) => void;
  }): void {
    const giant = !!opts.giant;
    const sc = giant ? 3.2 : 1.05;
    const col = opts.color ?? (giant ? new THREE.Color(2.2, 1.7, 0.55) : new THREE.Color(0.55, 2.05, 2.2));

    const g = new THREE.Group();
    const steelBladeMat = new THREE.MeshStandardMaterial({
      color: giant ? '#e8dcc0' : '#d2e8f2',
      emissive: col.clone().multiplyScalar(0.32),
      emissiveIntensity: 0.72,
      roughness: 0.22,
      metalness: 0.92,
      transparent: true,
      opacity: 0.98,
    });
    const runeCoreMat = new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: 0.92,
    });
    const guardMat = new THREE.MeshStandardMaterial({
      color: '#c8a256',
      emissive: new THREE.Color('#6b4814'),
      emissiveIntensity: 0.45,
      roughness: 0.3,
      metalness: 0.88,
      transparent: true,
      opacity: 0.98,
    });

    // Sculpted Forged-Steel Beveled Diamond Spirit Sword pointing downward (-Y)
    const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.01, 1.52, 4), steelBladeMat);
    blade.scale.set(1.0, 1.0, 0.34);
    blade.rotation.y = Math.PI / 4;
    blade.position.y = 0.76;

    // Glowing recessed rune fuller along spine
    const fuller = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.005, 1.38, 4), runeCoreMat);
    fuller.scale.set(1.0, 1.0, 0.65);
    fuller.rotation.y = Math.PI / 4;
    fuller.position.y = 0.75;

    // Ornate carved wing crossguard & pommel
    const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.036, 0.48, 6), guardMat);
    guard.rotation.z = Math.PI / 2;
    guard.position.y = 1.52;
    const guardCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.062, 1), guardMat);
    guardCore.scale.set(1.15, 0.85, 0.55);
    guardCore.position.y = 1.52;
    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.032, 0.36, 6), guardMat);
    hilt.position.y = 1.72;
    const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.044, 0), guardMat);
    pommel.position.y = 1.92;

    // Translucent spirit-qi sheath halo around forged steel blade
    const sheathMat = new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: giant ? 0.34 : 0.24,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const sheath = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.02, 1.58, 6, 1, true), sheathMat);
    sheath.position.y = 0.76;

    // Volumetric comet tail behind hilt
    const trailMat = new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: giant ? 0.52 : 0.38,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const trail = new THREE.Mesh(new THREE.ConeGeometry(giant ? 0.26 : 0.16, giant ? 3.8 : 2.6, 10, 1, true), trailMat);
    trail.position.y = giant ? 3.8 : 3.05;
    trail.rotation.x = Math.PI;

    g.add(blade, fuller, guard, guardCore, hilt, pommel, sheath, trail);

    // Helical golden-cyan celestial lightning rings around giant Tianjian sword
    if (giant) {
      const arcMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(2.1, 1.85, 0.85),
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      for (let r = 0; r < 3; r++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32 + r * 0.14, 0.018, 6, 20), arcMat);
        ring.position.y = 0.55 + r * 0.42;
        ring.rotation.set(Math.PI / 2 + (r - 1) * 0.28, r * 0.7, 0);
        g.add(ring);
      }
    }
    g.scale.setScalar(sc);

    const startOffset = giant ? new THREE.Vector3(0.4, 15.5, -0.4) : new THREE.Vector3((Math.random() - 0.5) * 2.2, 10.5, (Math.random() - 0.5) * 2.2);
    const startPos = opts.targetPos.clone().add(startOffset);
    g.position.copy(startPos);

    // Tilt sword along exact descent trajectory
    const dir = new THREE.Vector3().subVectors(opts.targetPos, startPos).normalize();
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);

    this.group.add(g);
    this.swords.push({
      group: g,
      trail,
      startPos,
      targetPos: opts.targetPos.clone(),
      age: -(opts.delay ?? 0),
      fallDuration: giant ? 0.34 : 0.22,
      lingerDuration: giant ? 1.15 : 0.65,
      impacted: false,
      giant,
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

  /** Spawns an alpha-feathered glowing shockwave ripple (never an opaque hard-edged donut). */
  spawnShockRing(pos: THREE.Vector3, color: THREE.Color, startScale: number, endScale: number, duration = 0.38): void {
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
    mesh.position.copy(pos);
    mesh.position.y = Math.max(0.06, pos.y);
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

  /** Translucent jade-cyan ghost afterimage for dodge & execution flash-step. */
  spawnAfterimage(pos: THREE.Vector3, yaw: number, color = new THREE.Color(0.35, 1.45, 1.65)): void {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.05, 6, 10), mat);
    mesh.position.set(pos.x, pos.y + 0.92, pos.z);
    mesh.rotation.y = yaw;
    this.group.add(mesh);
    this.ghosts.push({ mesh, mat, age: 0, duration: 0.28 });
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

    // 3-Layer Rarity Light Pillar
    const pillar = new THREE.Group();
    const pillarH = kind === 'gourd' ? 5.2 : 3.2;
    const layers: Array<[number, number]> = [
      [0.06, 0.92], // bright core
      [0.16, 0.42], // mid beam
      [0.34, 0.16], // wide soft halo
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

  update(
    dt: number,
    elapsed: number,
    heroPos: THREE.Vector3,
    onCollectDrop?: (kind: LootDrop['kind']) => void,
    onDropBounce?: (kind: LootDrop['kind']) => void,
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

    // 3. Falling 3D spirit swords
    for (let i = this.swords.length - 1; i >= 0; i--) {
      const sw = this.swords[i];
      sw.age += dt;
      if (sw.age < 0) {
        sw.group.visible = false;
        continue;
      }
      sw.group.visible = true;
      if (sw.age <= sw.fallDuration) {
        const u = easeOutQuart(sw.age / sw.fallDuration);
        sw.group.position.lerpVectors(sw.startPos, sw.targetPos, u);
      } else {
        sw.group.position.copy(sw.targetPos);
        if (!sw.impacted) {
          sw.impacted = true;
          sw.trail.visible = false;
          this.spawnShockRing(
            sw.targetPos,
            sw.giant ? new THREE.Color(2.3, 1.75, 0.55) : new THREE.Color(0.55, 2.0, 2.2),
            sw.giant ? 0.8 : 0.3,
            sw.giant ? 6.8 : 2.1,
            sw.giant ? 0.55 : 0.34,
          );
          this.spawnGroundCrater(
            sw.targetPos,
            sw.giant ? 4.4 : 1.15,
            sw.giant ? new THREE.Color(1.9, 1.35, 0.35) : new THREE.Color(0.45, 1.45, 1.65),
            sw.giant ? 4.2 : 2.2,
          );
          this.spawnHitSparks(
            sw.targetPos.clone().add(new THREE.Vector3(0, 0.25, 0)),
            new THREE.Vector3(0, 1, 0),
            sw.giant ? new THREE.Color(2.3, 1.75, 0.55) : new THREE.Color(0.7, 2.0, 2.25),
            sw.giant ? 26 : 10,
          );
          sw.onImpact?.(sw.targetPos);
        }
        const lingerP = (sw.age - sw.fallDuration) / sw.lingerDuration;
        if (lingerP >= 1) {
          this.group.remove(sw.group);
          this.swords.splice(i, 1);
        } else {
          // Dissolve upward cleanly
          const fade = 1 - clamp((lingerP - 0.45) / 0.55, 0, 1);
          sw.group.traverse((obj) => {
            if (obj instanceof THREE.Mesh) {
              const m = obj.material as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial;
              if (m && 'opacity' in m) m.opacity = fade * (m.blending === THREE.AdditiveBlending ? 0.45 : 1);
            }
          });
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

    // 6. Afterimages
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const gh = this.ghosts[i];
      gh.age += dt;
      const p = gh.age / gh.duration;
      if (p >= 1) {
        this.group.remove(gh.mesh);
        gh.mat.dispose();
        this.ghosts.splice(i, 1);
      } else {
        gh.mat.opacity = (1 - p) * 0.42;
        gh.mesh.scale.setScalar(1 + p * 0.14);
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
        if (dist < 4.2 && d.age > 0.35) {
          const pull = Math.min(1, dt * (8 + (4.2 - dist) * 3.5));
          d.pos.x += dx * pull;
          d.pos.z += dz * pull;
          d.pos.y = lerp(d.pos.y, 1.05, pull);
          d.pillar.visible = false;
        } else {
          d.pos.y = 0.38 + Math.sin(elapsed * 3.4 + i) * 0.1;
          d.pillar.scale.set(1 + Math.sin(elapsed * 4.2) * 0.08, 1, 1 + Math.sin(elapsed * 4.2) * 0.08);
        }
        if (dist < 0.85 && d.age > 0.35) {
          this.group.remove(d.mesh, d.pillar);
          this.drops.splice(i, 1);
          onCollectDrop?.(d.kind);
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
    for (const sw of this.swords) this.group.remove(sw.group);
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
      this.group.remove(gh.mesh);
      gh.mat.dispose();
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
}
