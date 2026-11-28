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
  createCampWoodTexture,
  createCanyonCliffMaps,
  createCarvedStoneTexture,
  createCourtyardStoneMaps,
  createJadeBridgeDeckMaps,
  createLacquerWoodTexture,
  createLavaCrustMaps,
  createOpenWorldTerrainMaps,
  createShushanSkyDome,
  createSoftParticleTexture,
  createStreamStoneMaps,
} from './Materials';
import skyUrl from '../assets/shushan-sky.jpg';
import {
  WORLD_BOUND,
  WORLD_CHESTS,
  WORLD_HERB_NODES,
  WORLD_SPIRIT_ORBS,
  WORLD_WAYPOINTS,
} from '../game/OpenWorldData';

export type ArenaLayout = 'corridor' | 'arena' | 'pillars' | 'islands' | 'openworld';

export type WorldBiome =
  | 'bamboo_canyon'
  | 'peach_shrine'
  | 'sword_graveyard'
  | 'lava_abyss'
  | 'celestial_sanctum'
  | 'astral_void'
  | 'haven_camp';

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
  playableRadius = 17.4;

  private readonly skyDome: THREE.Mesh;
  private readonly baguaMat: THREE.ShaderMaterial;
  private readonly baguaPlane: THREE.Mesh;
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

  private readonly biomePropsGroup = new THREE.Group();
  private readonly bambooArenaGroup = new THREE.Group();
  private readonly peachShrineGroup = new THREE.Group();
  private readonly peachCorridorSubGroup = new THREE.Group();
  private readonly swordGraveyardGroup = new THREE.Group();
  private readonly swordCorridorSubGroup = new THREE.Group();
  private readonly lavaAbyssGroup = new THREE.Group();
  private readonly lavaCorridorSubGroup = new THREE.Group();
  private readonly celestialSanctumGroup = new THREE.Group();
  private readonly celestialCorridorSubGroup = new THREE.Group();
  private readonly astralVoidGroup = new THREE.Group();
  private readonly astralCorridorSubGroup = new THREE.Group();
  private readonly campPropsGroup = new THREE.Group();
  private readonly bambooGrovesGroup = new THREE.Group();
  private readonly campObstacles: CircleObstacle[] = [];

  private readonly shrineGroup = new THREE.Group();
  private readonly healingShrinePos = new THREE.Vector3(-4.6, 0, -30.5);
  private healingShrineUsed = false;
  private shrineOrb!: THREE.Mesh;
  private shrineRing!: THREE.Mesh;
  private shrineLight!: THREE.PointLight;
  private shrineOrbMat!: THREE.MeshStandardMaterial;

  // Pillars, Islands & Open-World Layouts
  private readonly pillarsLayoutGroup = new THREE.Group();
  private readonly pillarsObstacles: CircleObstacle[] = [];
  private readonly islandsLayoutGroup = new THREE.Group();
  private readonly islandCrystals: Array<{
    pos: THREE.Vector3;
    orb: THREE.Mesh;
    ring: THREE.Mesh;
    mat: THREE.MeshStandardMaterial;
    light: THREE.PointLight;
    used: boolean;
  }> = [];
  private readonly monolithGroup = new THREE.Group();
  private readonly monolithPos = new THREE.Vector3(0, 0, -1.5);
  private monolithCore!: THREE.Mesh;
  private monolithCoreMat!: THREE.MeshStandardMaterial;
  private monolithRing!: THREE.Mesh;
  private monolithDome!: THREE.Mesh;
  private monolithDomeMat!: THREE.MeshBasicMaterial;
  private monolithLight!: THREE.PointLight;
  private readonly leylineZoneGroup = new THREE.Group();
  private leylineRingMat!: THREE.MeshBasicMaterial;
  private leylineDiscMat!: THREE.MeshBasicMaterial;
  private leylineWisps: THREE.Mesh[] = [];
  private leylineHeroInside = false;
  private readonly openWorldGroup = new THREE.Group();
  private readonly openWorldObstacles: CircleObstacle[] = [];
  private readonly waypointVisuals = new Map<
    string,
    { orb: THREE.Mesh; beam: THREE.Mesh; mat: THREE.MeshBasicMaterial; lit: boolean }
  >();
  private readonly chestVisuals = new Map<
    string,
    { lid: THREE.Mesh; glow: THREE.Mesh; mat: THREE.MeshBasicMaterial; opened: boolean }
  >();
  private readonly spiritOrbVisuals = new Map<
    string,
    { group: THREE.Group; core: THREE.Mesh; ring: THREE.Mesh; baseY: number; collected: boolean }
  >();
  private readonly worldHerbMeshes = new Map<string, THREE.Group>();
  private readonly worldHerbVisuals = new Map<
    string,
    {
      group: THREE.Group;
      core: THREE.Object3D;
      ring: THREE.Mesh;
      beam: THREE.Mesh;
      baseY: number;
      phase: number;
      available: boolean;
    }
  >();
  private readonly owCelestialClouds: Array<{ mesh: THREE.Object3D; baseY: number; phase: number }> = [];
  private readonly owCelestialHalos: THREE.Mesh[] = [];
  private readonly owFortressFlames: Array<{ mesh: THREE.Mesh; baseY: number; phase: number }> = [];
  private readonly owFortressLights: Array<{ light: THREE.PointLight; baseIntensity: number; phase: number }> = [];
  private readonly owFortressBanners: Array<{ mesh: THREE.Mesh; baseRotY: number; phase: number }> = [];
  private readonly owValleyWaterMeshes: THREE.Mesh[] = [];
  private cryptRuneRing?: THREE.Mesh;
  private cryptInnerSigil?: THREE.Mesh;
  private readonly cryptFlames: THREE.Mesh[] = [];
  private terraceMesh!: THREE.Mesh;
  private cliffMesh!: THREE.Mesh;
  private backdropAnchorX = 0;

  private campFireLight?: THREE.PointLight;
  private readonly campFlames: THREE.Mesh[] = [];
  private campLanternLight?: THREE.PointLight;
  private readonly magmaVentPlumes: Array<{ mesh: THREE.Mesh; baseY: number; phase: number }> = [];
  private readonly cloudPillars: Array<{ group: THREE.Group; baseY: number; phase: number; halo: THREE.Mesh }> = [];
  private readonly astralObelisks: Array<{ group: THREE.Group; ring: THREE.Mesh; baseY: number; phase: number }> = [];
  private readonly graveyardCrystals: Array<{ mat: THREE.MeshStandardMaterial; phase: number }> = [];

  private layout: ArenaLayout = 'arena';
  private currentBiome: WorldBiome = 'bamboo_canyon';
  private lastStageNum = 1;
  private maxZone: 0 | 1 | 2 = 0;
  private unlockedZone: 0 | 1 | 2 = 0;
  private backdropAnchorZ = 0;

  private bossIntensity = 0;
  private floorMat!: THREE.MeshStandardMaterial;
  private cliffMat!: THREE.MeshStandardMaterial;
  private trimMat!: THREE.MeshStandardMaterial;
  private bridgeDeckMat?: THREE.MeshStandardMaterial;
  private streamBedMat?: THREE.MeshStandardMaterial;
  private slabMat?: THREE.MeshStandardMaterial;
  private bankMat?: THREE.MeshStandardMaterial;
  private lowCurbMat?: THREE.MeshStandardMaterial;
  private canyonCliffMat?: THREE.MeshStandardMaterial;
  private cliffCrestMat?: THREE.MeshStandardMaterial;
  private mistMat!: THREE.MeshBasicMaterial;
  private petalMat!: THREE.ShaderMaterial;
  private fireflyMat!: THREE.ShaderMaterial;
  private mountainMat!: THREE.ShaderMaterial;

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
    this.terraceMesh = terrace;
    this.group.add(terrace);

    this.cliffMat = new THREE.MeshStandardMaterial({ color: '#1b2430', roughness: 0.96, metalness: 0.02 });
    const cliff = new THREE.Mesh(
      new THREE.CylinderGeometry(20.6, 13.0, 22, 16),
      this.cliffMat,
    );
    cliff.position.y = -12.3;
    this.cliffMesh = cliff;
    this.group.add(cliff);

    const trimMat = new THREE.MeshStandardMaterial({
      map: carvedTex,
      color: '#8493a6',
      roughness: 0.82,
      metalness: 0.08,
    });
    this.trimMat = trimMat;
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
    this.baguaPlane = baguaPlane;
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

    // 13. Reusable 6-Biome Decoration Groups & Zone 1 Healing Spring Shrine
    this.group.add(this.biomePropsGroup);
    this.buildBiomeProps(carvedTex, lacquerTex);
    this.buildHealingShrine(carvedTex);

    // 14. Pillars, Islands & Seamless 156x156 Open World (九州仙域 · 含北溟幽冥古地窟)
    this.pillarsLayoutGroup.visible = false;
    this.islandsLayoutGroup.visible = false;
    this.openWorldGroup.visible = false;
    this.group.add(this.pillarsLayoutGroup, this.islandsLayoutGroup, this.openWorldGroup);
    this.buildSpecialStageLayouts(carvedTex);
    this.buildMonolithAndLeylineProps(carvedTex);
    this.buildOpenWorld(carvedTex, lacquerTex);

    this.applyBiomeVisuals();
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
    this.mountainMat = peakMat;

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
        uPetalTint: { value: new THREE.Color(1.0, 0.88, 0.92) },
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
        uniform vec3 uPetalTint;
        varying float vAlpha;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          if (t.a * vAlpha < 0.04) discard;
          gl_FragColor = vec4(t.rgb * uPetalTint, t.a * vAlpha);
        }
      `,
    });
    this.petalMat = petalMat;
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
        uOrbTint: { value: new THREE.Color(0.88, 1.15, 0.96) },
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
        uniform vec3 uOrbTint;
        varying float vAlpha;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          if (t.a * vAlpha < 0.04) discard;
          gl_FragColor = vec4(t.rgb * uOrbTint, t.a * vAlpha);
        }
      `,
    });
    this.fireflyMat = ffMat;
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
      color: new THREE.Color('#ffffff'),
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mistMat = mistMat;
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
    this.lastStageNum = stageNum;
    const ch = stageNum <= 5 ? 1 : stageNum <= 10 ? 2 : stageNum <= 15 ? 3 : stageNum <= 20 ? 4 : 5;
    const isBoss = stageNum % 5 === 0 || stageNum === 19 || stageNum === 24;
    const bagua = overrideChapter
      ? Math.min(1.0, overrideChapter.baguaBase + (isBoss ? 0.14 : 0))
      : ch === 5
        ? 1.0
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
      (ch === 5 ? '#5ee8ff' : ch === 4 ? '#ff424c' : ch === 3 ? '#ff6e3a' : ch === 2 ? '#b96cff' : '#ff9c42');
    const flameHex =
      overrideChapter?.lanternFlameHex ??
      (ch === 5 ? '#b8f8ff' : ch === 4 ? '#ff8278' : ch === 3 ? '#ffae70' : ch === 2 ? '#e1a8ff' : '#ffd28a');
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
    this.applyBiomeVisuals();
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
    this.bridgeDeckMat = bridgeDeckMat;
    const streamBedMat = new THREE.MeshStandardMaterial({
      map: streamMaps.map,
      bumpMap: streamMaps.bumpMap,
      bumpScale: 0.12,
      roughnessMap: streamMaps.roughnessMap,
      roughness: 0.48,
      metalness: 0.08,
      color: new THREE.Color('#5a868d'),
    });
    this.streamBedMat = streamBedMat;
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
    this.canyonCliffMat = canyonCliffMat;
    const cliffCrestMat = new THREE.MeshStandardMaterial({
      map: carvedTex,
      color: '#2c4a48',
      roughness: 0.9,
      metalness: 0.03,
      flatShading: true,
    });
    this.cliffCrestMat = cliffCrestMat;

    // 1. Continuous Animated Flowing Canyon River (supports 6 biome shader modes via uWaterMode)
    this.riverMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uWaterMode: { value: 0 },
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
        uniform float uWaterMode;
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
          float foam = smoothstep(0.66, 0.88, stream + pierWake * 0.35 + bankFoam * 0.22);
          float glint = pow(max(0.0, sin(vWorld.x * 0.9 + vWorld.z * 0.5 - uTime * 2.4)), 14.0);

          vec3 col;
          float alpha = 0.92;
          if (uWaterMode < 0.5) {
            // 0: bamboo_canyon emerald-turquoise
            vec3 deepRiver = vec3(0.045, 0.18, 0.23);
            vec3 jadeCurrent = vec3(0.11, 0.42, 0.46);
            vec3 moonSpec = vec3(0.46, 0.80, 0.84);
            col = mix(deepRiver, jadeCurrent, smoothstep(0.32, 0.76, stream));
            col = mix(col, moonSpec, foam * 0.65);
            col += vec3(0.28, 0.52, 0.56) * glint * 0.35;
          } else if (uWaterMode < 1.5) {
            // 1: peach_shrine warm rose-gold water
            vec3 deepRose = vec3(0.14, 0.08, 0.15);
            vec3 peachFlow = vec3(0.56, 0.27, 0.36);
            vec3 petalGold = vec3(0.98, 0.78, 0.74);
            col = mix(deepRose, peachFlow, smoothstep(0.30, 0.78, stream));
            col = mix(col, petalGold, foam * 0.68);
            col += vec3(0.86, 0.55, 0.46) * glint * 0.42;
          } else if (uWaterMode < 2.5) {
            // 2: sword_graveyard eerie violet spirit-water
            vec3 deepSpirit = vec3(0.05, 0.03, 0.14);
            vec3 violetFlow = vec3(0.24, 0.14, 0.46);
            vec3 wispSpec = vec3(0.66, 0.52, 0.96);
            col = mix(deepSpirit, violetFlow, smoothstep(0.30, 0.76, stream));
            col = mix(col, wispSpec, foam * 0.62);
            col += vec3(0.50, 0.35, 0.88) * glint * 0.38;
          } else if (uWaterMode < 3.5) {
            // 3: lava_abyss molten glowing crimson-gold magma
            float crust = smoothstep(0.36, 0.72, stream + pierWake * 0.25);
            vec3 cooledBasalt = vec3(0.09, 0.02, 0.015);
            vec3 moltenRed = vec3(0.92, 0.20, 0.03);
            vec3 moltenGold = vec3(1.0, 0.74, 0.18);
            col = mix(cooledBasalt, moltenRed, crust);
            col = mix(col, moltenGold, smoothstep(0.66, 0.90, stream + bankFoam * 0.28));
            col += vec3(1.0, 0.55, 0.12) * glint * 0.45;
            alpha = 0.98;
          } else if (uWaterMode < 4.5) {
            // 4: celestial_sanctum shimmering starry astral-cyan Celestial River
            vec3 cosmosDeep = vec3(0.02, 0.07, 0.20);
            vec3 astralCyan = vec3(0.16, 0.58, 0.86);
            vec3 starGold = vec3(0.96, 0.88, 0.56);
            col = mix(cosmosDeep, astralCyan, smoothstep(0.28, 0.78, stream));
            col = mix(col, vec3(0.70, 0.94, 1.0), foam * 0.62);
            vec2 starCell = floor(vec2(vWorld.x * 1.5, vWorld.z * 1.5 - uTime * 0.4));
            float starSeed = hash(starCell);
            float starTwinkle = step(0.93, starSeed) * (0.55 + 0.45 * sin(uTime * 4.2 + starSeed * 40.0));
            col += starGold * starTwinkle * 0.95;
            col += vec3(0.42, 0.84, 0.98) * glint * 0.40;
          } else {
            // 5: haven_camp warm jade-amber stream
            vec3 deepJade = vec3(0.06, 0.17, 0.19);
            vec3 warmStream = vec3(0.22, 0.48, 0.46);
            col = mix(deepJade, warmStream, smoothstep(0.32, 0.76, stream));
            col = mix(col, vec3(0.92, 0.82, 0.60), foam * 0.58);
          }

          gl_FragColor = vec4(col, alpha);
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
        uWaterMode: { value: 0 },
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
        uniform float uWaterMode;
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
          vec3 cLow = vec3(0.40, 0.84, 0.90);
          vec3 cHigh = vec3(0.88, 0.98, 1.0);
          if (uWaterMode > 0.5 && uWaterMode < 1.5) {
            cLow = vec3(0.88, 0.48, 0.58);
            cHigh = vec3(1.0, 0.86, 0.84);
          } else if (uWaterMode >= 1.5 && uWaterMode < 2.5) {
            cLow = vec3(0.44, 0.28, 0.78);
            cHigh = vec3(0.82, 0.72, 1.0);
          } else if (uWaterMode >= 2.5 && uWaterMode < 3.5) {
            cLow = vec3(0.95, 0.22, 0.04);
            cHigh = vec3(1.0, 0.78, 0.22);
          } else if (uWaterMode >= 3.5 && uWaterMode < 4.5) {
            cLow = vec3(0.26, 0.78, 1.0);
            cHigh = vec3(0.96, 0.94, 0.72);
          }
          vec3 col = mix(cLow, cHigh, smoothstep(0.55, 0.95, silk + splash));
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
        uWaterMode: { value: 0 },
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
        uniform float uWaterMode;
        varying vec2 vUv;
        void main() {
          float r = length(vUv);
          if (r > 1.0) discard;
          float ring1 = smoothstep(0.08, 0.0, abs(fract(r * 2.5 - uTime * 0.65) - 0.5));
          float core = smoothstep(0.65, 0.0, r) * 0.48;
          float fade = smoothstep(1.0, 0.35, r);
          float alpha = (core + ring1 * 0.45 * fade) * fade;
          if (alpha < 0.02) discard;
          vec3 foamCol = vec3(0.66, 0.94, 0.98);
          if (uWaterMode > 0.5 && uWaterMode < 1.5) foamCol = vec3(1.0, 0.78, 0.80);
          else if (uWaterMode >= 1.5 && uWaterMode < 2.5) foamCol = vec3(0.72, 0.58, 1.0);
          else if (uWaterMode >= 2.5 && uWaterMode < 3.5) foamCol = vec3(1.0, 0.52, 0.14);
          else if (uWaterMode >= 3.5 && uWaterMode < 4.5) foamCol = vec3(0.58, 0.92, 1.0);
          gl_FragColor = vec4(foamCol, alpha * 0.72);
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
    this.bambooGrovesGroup.add(culmInst, leafInst);
    this.corridorGroup.add(this.bambooGrovesGroup);
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
    this.slabMat = slabMat;
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

    // Shimmering ankle-deep flowing crystal water overlay (y = 0.035m, supports biome modes)
    this.shallowWaterMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uWaterMode: { value: 0 },
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
        uniform float uWaterMode;
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
          vec3 baseC = vec3(0.16, 0.58, 0.64);
          vec3 hiC = vec3(0.68, 0.96, 0.96);
          if (uWaterMode > 0.5 && uWaterMode < 1.5) {
            baseC = vec3(0.56, 0.28, 0.38);
            hiC = vec3(1.0, 0.82, 0.78);
          } else if (uWaterMode >= 1.5 && uWaterMode < 2.5) {
            baseC = vec3(0.24, 0.14, 0.48);
            hiC = vec3(0.74, 0.58, 1.0);
          } else if (uWaterMode >= 2.5 && uWaterMode < 3.5) {
            baseC = vec3(0.64, 0.14, 0.03);
            hiC = vec3(1.0, 0.68, 0.18);
          } else if (uWaterMode >= 3.5 && uWaterMode < 4.5) {
            baseC = vec3(0.14, 0.56, 0.84);
            hiC = vec3(0.92, 0.96, 0.82);
          }
          vec3 col = mix(baseC, hiC, caustic * 0.72);
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
    this.bankMat = bankMat;
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
    this.lowCurbMat = lowCurbMat;
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

  private buildBiomeProps(
    carvedTex: THREE.CanvasTexture,
    lacquerTex: THREE.CanvasTexture,
  ): void {
    const campWoodTex = createCampWoodTexture();

    this.biomePropsGroup.add(
      this.bambooArenaGroup,
      this.peachShrineGroup,
      this.swordGraveyardGroup,
      this.lavaAbyssGroup,
      this.celestialSanctumGroup,
      this.astralVoidGroup,
      this.campPropsGroup,
    );
    this.peachShrineGroup.add(this.peachCorridorSubGroup);
    this.swordGraveyardGroup.add(this.swordCorridorSubGroup);
    this.lavaAbyssGroup.add(this.lavaCorridorSubGroup);
    this.celestialSanctumGroup.add(this.celestialCorridorSubGroup);
    this.astralVoidGroup.add(this.astralCorridorSubGroup);

    // --- 1. Bamboo Canyon Arena Rim Clusters (8 outer clusters outside curb r >= 19.8m) ---
    const bStalkMat = new THREE.MeshStandardMaterial({ color: '#276846', roughness: 0.72 });
    const bLeafMat = new THREE.MeshStandardMaterial({ color: '#2d7a4f', roughness: 0.82 });
    const bRockMat = new THREE.MeshStandardMaterial({ map: carvedTex, color: '#3b4e52', roughness: 0.9, flatShading: true });
    const bStalkGeo = new THREE.CylinderGeometry(0.08, 0.12, 6.2, 6);
    const bLeafGeo = new THREE.ConeGeometry(0.95, 2.0, 5);
    const bMoundGeo = new THREE.DodecahedronGeometry(1.1, 1);

    const bambooRimSpots: Array<[number, number]> = [
      [-13.8, -14.8], [13.8, -14.8],
      [-19.8, -6.5], [19.8, -6.5],
      [-19.8, 5.2], [19.8, 5.2],
      [-14.2, 14.5], [14.2, 14.5],
    ];
    for (const [bx, bz] of bambooRimSpots) {
      const clump = new THREE.Group();
      clump.position.set(bx, -0.2, bz);
      const mound = new THREE.Mesh(bMoundGeo, bRockMat);
      mound.scale.set(1.25, 0.55, 1.15);
      clump.add(mound);
      for (let s = 0; s < 3; s++) {
        const ang = s * 2.1 + bx * 0.1;
        const ox = Math.cos(ang) * 0.38;
        const oz = Math.sin(ang) * 0.38;
        const stalk = new THREE.Mesh(bStalkGeo, bStalkMat);
        stalk.position.set(ox, 3.0, oz);
        stalk.rotation.z = (s - 1) * 0.08;
        clump.add(stalk);
        const leaf = new THREE.Mesh(bLeafGeo, bLeafMat);
        leaf.position.set(ox, 5.8, oz);
        clump.add(leaf);
      }
      this.bambooArenaGroup.add(clump);
    }

    // --- 2. Peach Shrine (10 Blooming 3D Pink Peach Blossom Trees, |x| >= 13.2m) ---
    const peachBarkMat = new THREE.MeshStandardMaterial({
      map: campWoodTex,
      color: '#4c322c',
      roughness: 0.9,
      transparent: true,
      opacity: 1,
    });
    const peachBlossomMat = new THREE.MeshStandardMaterial({
      color: '#ff96bc',
      emissive: new THREE.Color('#5a1d34'),
      emissiveIntensity: 0.38,
      roughness: 0.72,
      transparent: true,
      opacity: 1,
    });
    const peachBlossomLightMat = new THREE.MeshStandardMaterial({
      color: '#ffc6dc',
      emissive: new THREE.Color('#6a2740'),
      emissiveIntensity: 0.42,
      roughness: 0.68,
      transparent: true,
      opacity: 1,
    });
    const pTrunkGeo = new THREE.CylinderGeometry(0.24, 0.42, 3.2, 7);
    const pBranchGeo = new THREE.CylinderGeometry(0.12, 0.22, 2.2, 6);
    const pCanopyGeo = new THREE.DodecahedronGeometry(1.15, 1);
    const pBankGeo = new THREE.DodecahedronGeometry(1.6, 1);

    const buildPeachTree = (x: number, y: number, z: number, sc: number, withRiverRock: boolean, registerOccludable: boolean): THREE.Group => {
      const tree = new THREE.Group();
      tree.position.set(x, y, z);
      tree.scale.setScalar(sc);
      tree.rotation.y = (x * 0.7 + z * 0.3) % (Math.PI * 2);

      const tBarkMat = registerOccludable ? peachBarkMat.clone() : peachBarkMat;
      const tBlossomMat = registerOccludable ? peachBlossomMat.clone() : peachBlossomMat;
      const tBlossomLightMat = registerOccludable ? peachBlossomLightMat.clone() : peachBlossomLightMat;

      if (withRiverRock) {
        const rock = new THREE.Mesh(pBankGeo, bRockMat);
        rock.scale.set(1.5, 1.35, 1.4);
        rock.position.y = -0.85;
        rock.receiveShadow = true;
        tree.add(rock);
      }

      const trunk = new THREE.Mesh(pTrunkGeo, tBarkMat);
      trunk.position.y = 1.5;
      trunk.rotation.z = 0.14;
      trunk.castShadow = true;
      tree.add(trunk);

      const branch1 = new THREE.Mesh(pBranchGeo, tBarkMat);
      branch1.position.set(-0.55, 3.2, 0.2);
      branch1.rotation.z = 0.55;
      const branch2 = new THREE.Mesh(pBranchGeo, tBarkMat);
      branch2.position.set(0.55, 3.1, -0.2);
      branch2.rotation.z = -0.52;
      tree.add(branch1, branch2);

      const clusters: Array<[number, number, number, number, boolean]> = [
        [-1.05, 4.1, 0.3, 1.35, false],
        [0.95, 3.95, -0.25, 1.25, true],
        [0.0, 4.75, 0.1, 1.48, false],
        [-0.35, 3.55, -0.75, 1.05, true],
        [0.45, 4.35, 0.75, 1.12, true],
      ];
      for (const [cx, cy, cz, cs, isLight] of clusters) {
        const puff = new THREE.Mesh(pCanopyGeo, isLight ? tBlossomLightMat : tBlossomMat);
        puff.scale.set(cs * 1.15, cs * 0.72, cs * 1.05);
        puff.position.set(cx, cy, cz);
        puff.castShadow = true;
        tree.add(puff);
      }

      if (registerOccludable) {
        this.occludables.push({
          position: new THREE.Vector3(x, y + 3.2, z),
          radius: 2.4 * sc,
          materials: [tBarkMat, tBlossomMat, tBlossomLightMat],
          currentOpacity: 1,
        });
      }
      return tree;
    };

    const peachZone0Spots: Array<[number, number, number]> = [
      [-13.8, -13.2, 1.15],
      [13.8, -13.2, 1.18],
      [-18.2, -5.2, 1.08],
      [18.2, -5.2, 1.12],
      [-17.8, 5.2, 1.06],
      [17.8, 5.2, 1.1],
    ];
    for (const [px, pz, sc] of peachZone0Spots) {
      this.peachShrineGroup.add(buildPeachTree(px, -0.1, pz, sc, false, true));
    }
    const peachCorridorSpots: Array<[number, number, number, number, boolean]> = [
      [-13.4, -0.15, -21.5, 1.24, true],
      [13.4, -0.15, -23.5, 1.22, true],
      [-17.6, -0.1, -45.0, 1.18, false],
      [17.6, -0.1, -63.5, 1.26, true],
    ];
    for (const [px, py, pz, sc, hasRock] of peachCorridorSpots) {
      this.peachCorridorSubGroup.add(buildPeachTree(px, py, pz, sc, hasRock, false));
    }

    // --- 3. Sword Graveyard (12 Colossal Giant Greatswords & Mossy Demon Tombstones, |x| >= 12.4m) ---
    const rustedBladeMat = new THREE.MeshStandardMaterial({
      color: '#5a6070',
      roughness: 0.56,
      metalness: 0.72,
      flatShading: true,
    });
    const darkBronzeGuardMat = new THREE.MeshStandardMaterial({
      color: '#6b5335',
      roughness: 0.62,
      metalness: 0.68,
    });
    const tombstoneMat = new THREE.MeshStandardMaterial({
      map: carvedTex,
      color: '#4a4e5e',
      roughness: 0.92,
      metalness: 0.05,
    });
    const swordBladeGeo = new THREE.BoxGeometry(0.68, 5.8, 0.14);
    const swordTipGeo = new THREE.ConeGeometry(0.42, 1.1, 4);
    const swordGuardGeo = new THREE.BoxGeometry(1.85, 0.24, 0.34);
    const swordHiltGeo = new THREE.CylinderGeometry(0.12, 0.15, 1.35, 6);
    const tombGeo = new THREE.BoxGeometry(1.35, 2.35, 0.42);
    const tombCapGeo = new THREE.CylinderGeometry(0.68, 0.68, 0.42, 6);
    const crystalGeo = new THREE.OctahedronGeometry(0.22, 0);

    const buildGraveyardMonument = (x: number, y: number, z: number, sc: number, tiltZ: number, withRock: boolean, phase: number): THREE.Group => {
      const mon = new THREE.Group();
      mon.position.set(x, y, z);
      mon.scale.setScalar(sc);

      if (withRock) {
        const rock = new THREE.Mesh(pBankGeo, tombstoneMat);
        rock.scale.set(1.5, 1.35, 1.45);
        rock.position.y = -0.85;
        mon.add(rock);
      }

      const sword = new THREE.Group();
      sword.rotation.set(0.12 * Math.sin(phase), phase * 0.7, tiltZ);
      const blade = new THREE.Mesh(swordBladeGeo, rustedBladeMat);
      blade.position.y = 2.2;
      blade.castShadow = true;
      const tip = new THREE.Mesh(swordTipGeo, rustedBladeMat);
      tip.rotation.set(Math.PI, Math.PI / 4, 0);
      tip.position.y = -0.5;
      const guard = new THREE.Mesh(swordGuardGeo, darkBronzeGuardMat);
      guard.position.y = 5.1;
      const hilt = new THREE.Mesh(swordHiltGeo, darkBronzeGuardMat);
      hilt.position.y = 5.85;
      const runeMat = new THREE.MeshStandardMaterial({
        color: '#9e68ff',
        emissive: new THREE.Color('#6a34d8'),
        emissiveIntensity: 0.95,
        roughness: 0.3,
      });
      this.graveyardCrystals.push({ mat: runeMat, phase });
      const gem = new THREE.Mesh(crystalGeo, runeMat);
      gem.position.set(0, 5.1, 0.18);
      sword.add(blade, tip, guard, hilt, gem);
      mon.add(sword);

      // Mossy Demon Tombstone flanking the colossal sword
      const tomb = new THREE.Group();
      tomb.position.set(Math.sign(x) * 1.15, 0, 0.85);
      tomb.rotation.set(-0.08, -Math.sign(x) * 0.35, Math.sign(x) * 0.06);
      const slab = new THREE.Mesh(tombGeo, tombstoneMat);
      slab.position.y = 1.05;
      slab.castShadow = true;
      const cap = new THREE.Mesh(tombCapGeo, tombstoneMat);
      cap.rotation.x = Math.PI / 2;
      cap.position.y = 2.2;
      tomb.add(slab, cap);
      mon.add(tomb);

      return mon;
    };

    const swordZone0Spots: Array<[number, number, number, number]> = [
      [-13.8, -13.0, 1.05, 0.22],
      [13.8, -13.0, 1.08, -0.24],
      [-18.0, -4.5, 0.98, 0.18],
      [18.0, -4.5, 1.02, -0.20],
      [-17.4, 5.8, 0.95, 0.26],
      [17.4, 5.8, 0.96, -0.25],
    ];
    swordZone0Spots.forEach(([sx, sz, sc, tilt], idx) => {
      this.swordGraveyardGroup.add(buildGraveyardMonument(sx, -0.1, sz, sc, tilt, false, idx * 1.1));
    });
    const swordCorridorSpots: Array<[number, number, number, number, number, boolean]> = [
      [-13.0, -0.2, -20.5, 1.16, 0.28, true],
      [13.0, -0.2, -24.0, 1.14, -0.26, true],
      [-17.6, -0.1, -43.5, 1.12, 0.21, false],
      [17.6, -0.1, -46.5, 1.15, -0.22, false],
      [-13.6, -0.2, -62.5, 1.2, 0.25, true],
      [13.6, -0.2, -65.5, 1.18, -0.27, true],
    ];
    swordCorridorSpots.forEach(([sx, sy, sz, sc, tilt, hasRock], idx) => {
      this.swordCorridorSubGroup.add(buildGraveyardMonument(sx, sy, sz, sc, tilt, hasRock, (idx + 6) * 1.1));
    });

    // --- 4. Lava Abyss (12 Glowing Volcanic Magma Vents along Canyon Rims) ---
    const basaltVentMat = new THREE.MeshStandardMaterial({
      map: carvedTex,
      color: '#22181a',
      roughness: 0.94,
      flatShading: true,
    });
    const magmaCoreMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.95, 0.65, 0.14),
    });
    const magmaPlumeMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.65, 0.42, 0.08),
      transparent: true,
      opacity: 0.56,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ventConeGeo = new THREE.ConeGeometry(1.45, 2.2, 7, 1, true);
    const ventCoreGeo = new THREE.SphereGeometry(0.65, 8, 6);
    const plumeGeo = new THREE.ConeGeometry(0.55, 2.8, 6);

    const buildMagmaVent = (x: number, y: number, z: number, sc: number, phase: number): THREE.Group => {
      const vent = new THREE.Group();
      vent.position.set(x, y, z);
      vent.scale.setScalar(sc);
      const cone = new THREE.Mesh(ventConeGeo, basaltVentMat);
      cone.position.y = 0.85;
      cone.castShadow = true;
      const core = new THREE.Mesh(ventCoreGeo, magmaCoreMat);
      core.scale.set(1.1, 0.5, 1.1);
      core.position.y = 1.35;
      const plume = new THREE.Mesh(plumeGeo, magmaPlumeMat);
      plume.position.y = 2.4;
      vent.add(cone, core, plume);
      this.magmaVentPlumes.push({ mesh: plume, baseY: 2.4, phase });
      return vent;
    };

    const lavaZone0Spots: Array<[number, number, number]> = [
      [-14.2, -13.2, 1.05],
      [14.2, -13.2, 1.05],
      [-18.2, -4.8, 0.95],
      [18.2, -4.8, 0.98],
      [-17.4, 6.2, 0.95],
      [17.4, 6.2, 0.96],
    ];
    lavaZone0Spots.forEach(([lx, lz, sc], idx) => {
      this.lavaAbyssGroup.add(buildMagmaVent(lx, -0.1, lz, sc, idx * 0.9));
    });
    const lavaCorridorSpots: Array<[number, number, number, number]> = [
      [-14.2, -1.2, -21.0, 1.25],
      [14.2, -1.2, -23.5, 1.22],
      [-17.8, -0.1, -44.0, 1.12],
      [17.8, -0.1, -46.0, 1.14],
      [-14.6, -1.2, -62.5, 1.28],
      [14.6, -1.2, -65.0, 1.26],
    ];
    lavaCorridorSpots.forEach(([lx, ly, lz, sc], idx) => {
      this.lavaCorridorSubGroup.add(buildMagmaVent(lx, ly, lz, sc, (idx + 6) * 0.9));
    });

    // --- 5. Celestial Sanctum (12 Golden-Jade Floating Immortal Cloud Pillars) ---
    const whiteJadeMat = new THREE.MeshStandardMaterial({
      map: carvedTex,
      color: '#dceef6',
      emissive: new THREE.Color('#18364a'),
      emissiveIntensity: 0.25,
      roughness: 0.42,
      metalness: 0.14,
    });
    const sanctumGoldMat = new THREE.MeshStandardMaterial({
      color: '#ebc76e',
      emissive: new THREE.Color('#5a3c0c'),
      emissiveIntensity: 0.42,
      roughness: 0.3,
      metalness: 0.78,
    });
    const astralCrystalMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.55, 1.65, 1.95),
    });
    const cloudMat = new THREE.MeshStandardMaterial({
      color: '#e6f6ff',
      emissive: new THREE.Color('#285e78'),
      emissiveIntensity: 0.35,
      roughness: 0.65,
    });

    const cColGeo = new THREE.CylinderGeometry(0.45, 0.56, 5.2, 6);
    const cRingGeo = new THREE.TorusGeometry(0.78, 0.07, 8, 24);
    const cCloudGeo = new THREE.DodecahedronGeometry(0.95, 1);

    const buildCloudPillar = (x: number, y: number, z: number, sc: number, phase: number): THREE.Group => {
      const grp = new THREE.Group();
      grp.position.set(x, y, z);
      grp.scale.setScalar(sc);

      const col = new THREE.Mesh(cColGeo, whiteJadeMat);
      col.position.y = 2.6;
      col.castShadow = true;
      const collarLow = new THREE.Mesh(cRingGeo, sanctumGoldMat);
      collarLow.rotation.x = Math.PI / 2;
      collarLow.position.y = 0.8;
      const collarHigh = new THREE.Mesh(cRingGeo, sanctumGoldMat);
      collarHigh.rotation.x = Math.PI / 2;
      collarHigh.position.y = 4.6;
      const finial = new THREE.Mesh(crystalGeo, astralCrystalMat);
      finial.scale.set(1.4, 2.1, 1.4);
      finial.position.y = 5.85;
      const halo = new THREE.Mesh(cRingGeo, sanctumGoldMat);
      halo.position.y = 5.85;

      // Swirling golden-jade cloud collar pads around pillar base
      for (let c = 0; c < 3; c++) {
        const ca = c * 2.1 + phase;
        const puff = new THREE.Mesh(cCloudGeo, cloudMat);
        puff.scale.set(1.2, 0.42, 0.9);
        puff.position.set(Math.cos(ca) * 0.85, 0.35 + c * 0.14, Math.sin(ca) * 0.85);
        grp.add(puff);
      }

      grp.add(col, collarLow, collarHigh, finial, halo);
      this.cloudPillars.push({ group: grp, baseY: y, phase, halo });
      return grp;
    };

    const celZone0Spots: Array<[number, number, number]> = [
      [-13.8, -13.2, 1.0],
      [13.8, -13.2, 1.0],
      [-18.0, -4.6, 0.95],
      [18.0, -4.6, 0.95],
      [-17.4, 5.6, 0.92],
      [17.4, 5.6, 0.92],
    ];
    celZone0Spots.forEach(([cx, cz, sc], idx) => {
      this.celestialSanctumGroup.add(buildCloudPillar(cx, 0.45, cz, sc, idx * 1.05));
    });
    const celCorridorSpots: Array<[number, number, number, number]> = [
      [-14.2, 0.6, -21.5, 1.1],
      [14.2, 0.6, -23.5, 1.1],
      [-17.6, 0.5, -44.0, 1.08],
      [17.6, 0.5, -44.0, 1.08],
      [-14.6, 0.6, -63.0, 1.15],
      [14.6, 0.6, -63.0, 1.15],
    ];
    celCorridorSpots.forEach(([cx, cy, cz, sc], idx) => {
      this.celestialCorridorSubGroup.add(buildCloudPillar(cx, cy, cz, sc, (idx + 6) * 1.05));
    });

    // --- 5b. Astral Void (太虚星海: 12 Obsidian-Cyan Star-Obelisks) ---
    const astralStoneMat = new THREE.MeshStandardMaterial({
      map: carvedTex,
      color: '#253162',
      emissive: new THREE.Color('#13224e'),
      emissiveIntensity: 0.45,
      roughness: 0.36,
      metalness: 0.42,
    });
    const astralGoldRingMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.4, 1.85, 2.2),
    });
    const astralSpireGeo = new THREE.OctahedronGeometry(0.66, 0);
    const astralShardGeo = new THREE.OctahedronGeometry(0.18, 0);
    const astralHaloGeo = new THREE.TorusGeometry(0.95, 0.045, 8, 28);

    const buildAstralObelisk = (x: number, y: number, z: number, sc: number, phase: number): THREE.Group => {
      const grp = new THREE.Group();
      grp.position.set(x, y, z);
      grp.scale.setScalar(sc);

      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.92, 0.85, 6), astralStoneMat);
      pedestal.position.y = 0.42;
      pedestal.castShadow = true;

      const spire = new THREE.Mesh(astralSpireGeo, astralStoneMat);
      spire.scale.set(0.85, 3.6, 0.85);
      spire.position.y = 3.2;
      spire.castShadow = true;

      const core = new THREE.Mesh(astralShardGeo, astralCrystalMat);
      core.scale.set(1.6, 2.4, 1.6);
      core.position.y = 5.9;

      const ring = new THREE.Mesh(astralHaloGeo, astralGoldRingMat);
      ring.position.y = 3.65;
      ring.rotation.x = 0.65;

      for (let s = 0; s < 3; s++) {
        const a = (s / 3) * Math.PI * 2 + phase;
        const shard = new THREE.Mesh(astralShardGeo, sanctumGoldMat);
        shard.position.set(Math.cos(a) * 1.05, 1.8 + s * 0.95, Math.sin(a) * 1.05);
        grp.add(shard);
      }

      grp.add(pedestal, spire, core, ring);
      this.astralObelisks.push({ group: grp, ring, baseY: y, phase });
      return grp;
    };

    const astralZone0Spots: Array<[number, number, number]> = [
      [-14.2, -13.6, 1.05],
      [14.2, -13.6, 1.05],
      [-18.2, -4.4, 1.0],
      [18.2, -4.4, 1.0],
      [-17.2, 6.2, 0.96],
      [17.2, 6.2, 0.96],
    ];
    astralZone0Spots.forEach(([ax, az, sc], idx) => {
      this.astralVoidGroup.add(buildAstralObelisk(ax, 0.35, az, sc, idx * 1.1));
    });
    const astralCorridorSpots: Array<[number, number, number, number]> = [
      [-14.4, 0.5, -21.8, 1.12],
      [14.4, 0.5, -23.8, 1.12],
      [-17.8, 0.4, -44.0, 1.08],
      [17.8, 0.4, -44.0, 1.08],
      [-14.8, 0.5, -63.5, 1.18],
      [14.8, 0.5, -63.5, 1.18],
    ];
    astralCorridorSpots.forEach(([ax, ay, az, sc], idx) => {
      this.astralCorridorSubGroup.add(buildAstralObelisk(ax, ay, az, sc, (idx + 6) * 1.1));
    });

    // --- 6. Haven Camp (云来剑庐) Cozy Walkable Sanctuary in Zone 0 ---
    const woodMat = new THREE.MeshStandardMaterial({ map: campWoodTex, color: '#8f6246', roughness: 0.78 });
    const darkWoodMat = new THREE.MeshStandardMaterial({ map: lacquerTex, color: '#4c2620', roughness: 0.62 });
    const teaStoneMat = new THREE.MeshStandardMaterial({ map: carvedTex, color: '#9ab0bc', roughness: 0.72 });
    const jadeVesselMat = new THREE.MeshStandardMaterial({ color: '#62c4b4', roughness: 0.28, metalness: 0.12 });
    const jarClayMat = new THREE.MeshStandardMaterial({ color: '#7a452d', roughness: 0.64 });
    const redSealMat = new THREE.MeshStandardMaterial({ color: '#b83232', roughness: 0.7 });
    const cushionMat = new THREE.MeshStandardMaterial({ color: '#c48636', roughness: 0.85 });
    const cushionRimMat = new THREE.MeshStandardMaterial({ color: '#8d2a2a', roughness: 0.82 });

    // 6a. Campfire (篝火) at (4.2, 0, 1.8)
    const fireGroup = new THREE.Group();
    fireGroup.position.set(4.2, 0, 1.8);
    const stoneRingGeo = new THREE.DodecahedronGeometry(0.22, 1);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const st = new THREE.Mesh(stoneRingGeo, teaStoneMat);
      st.scale.set(1.1, 0.65, 0.9);
      st.position.set(Math.cos(a) * 0.68, 0.1, Math.sin(a) * 0.68);
      st.castShadow = true;
      fireGroup.add(st);
    }
    const emberBed = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.52, 0.08, 12),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 0.42, 0.08) }),
    );
    emberBed.position.y = 0.05;
    fireGroup.add(emberBed);
    const logGeo = new THREE.CylinderGeometry(0.08, 0.1, 1.05, 6);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      const log = new THREE.Mesh(logGeo, woodMat);
      log.position.set(Math.cos(a) * 0.22, 0.22, Math.sin(a) * 0.22);
      log.rotation.set(0.95, a, 0.15);
      log.castShadow = true;
      fireGroup.add(log);
    }
    const flameSpecs: Array<[number, number, number, string]> = [
      [0.24, 0.85, 0.45, '#ff5a14'],
      [0.17, 0.68, 0.38, '#ff9828'],
      [0.10, 0.48, 0.30, '#ffe478'],
    ];
    for (const [rad, h, fy, hex] of flameSpecs) {
      const fl = new THREE.Mesh(
        new THREE.ConeGeometry(rad, h, 7),
        new THREE.MeshBasicMaterial({
          color: hex,
          transparent: true,
          opacity: 0.86,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      fl.position.y = fy;
      fl.userData.baseY = fy;
      fireGroup.add(fl);
      this.campFlames.push(fl);
    }
    this.campFireLight = new THREE.PointLight('#ff9442', 14.0, 16.0, 1.8);
    this.campFireLight.position.set(0, 1.15, 0);
    fireGroup.add(this.campFireLight);
    this.campPropsGroup.add(fireGroup);
    this.campObstacles.push({ x: 4.2, z: 1.8, r: 0.85 });

    // 6b. Carved Stone Tea Table + Wine Jars (石桌茶具 · 酒坛) at (5.4, 0, -0.4)
    const teaGroup = new THREE.Group();
    teaGroup.position.set(5.4, 0, -0.4);
    const tblBase = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 0.66, 8), teaStoneMat);
    tblBase.position.y = 0.33;
    tblBase.castShadow = true;
    const tblTop = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.72, 0.12, 14), teaStoneMat);
    tblTop.position.y = 0.7;
    tblTop.castShadow = true;
    tblTop.receiveShadow = true;
    teaGroup.add(tblBase, tblTop);

    // Celadon teapot + 2 cups on table
    const teapot = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), jadeVesselMat);
    teapot.scale.set(1.1, 0.85, 1.1);
    teapot.position.set(-0.08, 0.86, 0.04);
    teaGroup.add(teapot);
    for (const [cx, cz] of [[0.22, 0.16], [0.18, -0.22]]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.042, 0.07, 8), jadeVesselMat);
      cup.position.set(cx, 0.8, cz);
      teaGroup.add(cup);
    }
    // Two glazed clay wine jars (酒坛) beside/on table
    for (const [jx, jy, jz, sc] of [[0.42, 0.18, 0.68, 1.0], [-0.34, 0.90, -0.26, 0.62]]) {
      const jar = new THREE.Mesh(new THREE.SphereGeometry(0.22 * sc, 10, 8), jarClayMat);
      jar.scale.set(0.95, 1.25, 0.95);
      jar.position.set(jx, jy, jz);
      jar.castShadow = true;
      const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.11 * sc, 0.12 * sc, 0.08 * sc, 8), redSealMat);
      seal.position.set(jx, jy + 0.25 * sc, jz);
      teaGroup.add(jar, seal);
    }
    // Two carved stone stools
    for (const [sx, sz] of [[-0.95, -0.55], [0.95, -0.35]]) {
      const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.44, 8), teaStoneMat);
      stool.position.set(sx, 0.22, sz);
      stool.castShadow = true;
      teaGroup.add(stool);
    }
    this.campPropsGroup.add(teaGroup);
    this.campObstacles.push({ x: 5.4, z: -0.4, r: 0.92 });

    // 6c. Meditation Lotus Cushion (打坐蒲团) + Sword Rack (玄木剑架) at (-4.8, 0, 1.5)
    const medGroup = new THREE.Group();
    medGroup.position.set(-4.8, 0, 1.5);
    const matBase = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.92, 0.05, 18), cushionRimMat);
    matBase.position.set(0.55, 0.025, 0.35);
    const cushion = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.64, 0.14, 16), cushionMat);
    cushion.position.set(0.55, 0.09, 0.35);
    const auraRing = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 1.06, 28),
      new THREE.MeshBasicMaterial({
        color: '#52e8d4',
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    auraRing.rotation.x = -Math.PI / 2;
    auraRing.position.set(0.55, 0.03, 0.35);
    medGroup.add(matBase, cushion, auraRing);

    // Carved Wooden Sword Rack holding 3 spirit swords
    const rack = new THREE.Group();
    rack.position.set(-0.45, 0, -0.35);
    rack.rotation.y = 0.42;
    const legGeo = new THREE.BoxGeometry(0.12, 1.25, 0.14);
    for (const rx of [-0.62, 0.62]) {
      const leg = new THREE.Mesh(legGeo, darkWoodMat);
      leg.position.set(rx, 0.625, 0);
      leg.castShadow = true;
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.56), darkWoodMat);
      foot.position.set(rx, 0.06, 0);
      rack.add(leg, foot);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.12, 0.12), darkWoodMat);
    bar.position.y = 0.28;
    rack.add(bar);
    const bladeSilverMat = new THREE.MeshStandardMaterial({
      color: '#bfe8f4',
      emissive: new THREE.Color('#205a72'),
      emissiveIntensity: 0.4,
      roughness: 0.25,
      metalness: 0.85,
    });
    for (let s = 0; s < 3; s++) {
      const sy = 0.54 + s * 0.28;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.055, 0.025), bladeSilverMat);
      blade.position.set(0.08, sy, 0.06);
      const gd = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.08), sanctumGoldMat);
      gd.position.set(-0.56, sy, 0.06);
      rack.add(blade, gd);
    }
    medGroup.add(rack);
    this.campPropsGroup.add(medGroup);
    this.campObstacles.push({ x: -5.2, z: 1.2, r: 0.84 });

    // 6d. Warm Corner Peach Blossom Tree & Hanging Lantern at (-8.8, 0, -7.2)
    const campTree = buildPeachTree(-8.8, -0.05, -7.2, 1.15, false, true);
    const lanternHang = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 10, 8),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1.85, 1.05, 0.42) }),
    );
    lanternHang.scale.set(0.85, 1.25, 0.85);
    lanternHang.position.set(1.2, 2.7, 0.35);
    campTree.add(lanternHang);
    this.campLanternLight = new THREE.PointLight('#ffb066', 9.5, 14.0, 1.8);
    this.campLanternLight.position.set(1.2, 2.6, 0.35);
    campTree.add(this.campLanternLight);
    this.campPropsGroup.add(campTree);
    this.campObstacles.push({ x: -8.8, z: -7.2, r: 0.65 });

    // 6e. Cozy Herbal / Spirit Scroll Rack + Lantern Post at (8.4, 0, -6.8)
    const shelfGroup = new THREE.Group();
    shelfGroup.position.set(8.4, 0, -6.8);
    shelfGroup.rotation.y = -0.55;
    for (const sx of [-0.55, 0.55]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.9, 0.1), darkWoodMat);
      post.position.set(sx, 0.95, 0);
      post.castShadow = true;
      shelfGroup.add(post);
    }
    for (const sy of [0.55, 1.15, 1.75]) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 0.42), woodMat);
      plank.position.y = sy;
      plank.castShadow = true;
      shelfGroup.add(plank);
    }
    const gourdShelf = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), sanctumGoldMat);
    gourdShelf.position.set(-0.24, 1.32, 0);
    const scrollJar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.34, 8), jadeVesselMat);
    scrollJar.position.set(0.25, 0.76, 0);
    const shelfLantern = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.18, 1),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1.7, 1.0, 0.45) }),
    );
    shelfLantern.position.set(0, 2.02, 0);
    shelfGroup.add(gourdShelf, scrollJar, shelfLantern);
    this.campPropsGroup.add(shelfGroup);
    this.campObstacles.push({ x: 8.4, z: -6.8, r: 0.72 });

    // 6f. Warm Tea Brazier & Bamboo Screen at (-8.2, 0, 6.4)
    const screenGroup = new THREE.Group();
    screenGroup.position.set(-8.2, 0, 6.4);
    screenGroup.rotation.y = 0.62;
    const screenFrame = new THREE.Mesh(new THREE.BoxGeometry(1.75, 2.1, 0.1), darkWoodMat);
    screenFrame.position.y = 1.05;
    screenFrame.castShadow = true;
    const screenPanel = new THREE.Mesh(new THREE.BoxGeometry(1.52, 1.82, 0.12), teaStoneMat);
    screenPanel.position.y = 1.05;
    screenGroup.add(screenFrame, screenPanel);
    this.campPropsGroup.add(screenGroup);
    this.campObstacles.push({ x: -8.2, z: 6.4, r: 0.75 });
  }

  private buildHealingShrine(carvedTex: THREE.CanvasTexture): void {
    const shrine = this.shrineGroup;
    shrine.position.copy(this.healingShrinePos);

    const jadeStoneMat = new THREE.MeshStandardMaterial({
      map: carvedTex,
      color: '#a8d8d6',
      emissive: new THREE.Color('#13423d'),
      emissiveIntensity: 0.35,
      roughness: 0.42,
      metalness: 0.12,
    });
    const lotusMat = new THREE.MeshStandardMaterial({
      color: '#5ef2d8',
      emissive: new THREE.Color('#168a76'),
      emissiveIntensity: 0.65,
      roughness: 0.32,
      metalness: 0.18,
    });
    const springWaterMat = new THREE.MeshBasicMaterial({
      color: '#46ffd8',
      transparent: true,
      opacity: 0.78,
    });
    this.shrineOrbMat = new THREE.MeshStandardMaterial({
      color: '#88ffe6',
      emissive: new THREE.Color('#2effcb'),
      emissiveIntensity: 1.5,
      roughness: 0.18,
      metalness: 0.2,
      transparent: true,
      opacity: 0.95,
    });

    const basinBase = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 1.08, 0.34, 8), jadeStoneMat);
    basinBase.position.y = 0.17;
    basinBase.castShadow = true;
    basinBase.receiveShadow = true;
    const basinRim = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.1, 8, 16), jadeStoneMat);
    basinRim.rotation.x = Math.PI / 2;
    basinRim.position.y = 0.38;
    const springWater = new THREE.Mesh(new THREE.CircleGeometry(0.72, 16), springWaterMat);
    springWater.rotation.x = -Math.PI / 2;
    springWater.position.y = 0.36;
    shrine.add(basinBase, basinRim, springWater);

    // Sculpted 8-petal jade lotus cradle
    const petalGeo = new THREE.ConeGeometry(0.22, 0.56, 4);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const petal = new THREE.Mesh(petalGeo, lotusMat);
      petal.position.set(Math.cos(a) * 0.48, 0.52, Math.sin(a) * 0.48);
      petal.rotation.set(Math.sin(a) * 0.52, -a, -Math.cos(a) * 0.52);
      shrine.add(petal);
    }

    // Floating Jade Spirit Orb + Ring + PointLight
    this.shrineOrb = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 1), this.shrineOrbMat);
    this.shrineOrb.position.y = 1.48;
    this.shrineRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.48, 0.035, 8, 24),
      new THREE.MeshBasicMaterial({ color: '#78ffe8', transparent: true, opacity: 0.72 }),
    );
    this.shrineRing.position.y = 1.48;
    this.shrineLight = new THREE.PointLight('#3effd8', 8.5, 11.0, 1.8);
    this.shrineLight.position.set(0, 1.55, 0);

    shrine.add(this.shrineOrb, this.shrineRing, this.shrineLight);
    this.corridorGroup.add(shrine);
  }

  private buildSpecialStageLayouts(carvedTex: THREE.CanvasTexture): void {
    const stoneMat = new THREE.MeshStandardMaterial({
      map: carvedTex,
      color: '#6e8296',
      roughness: 0.72,
      metalness: 0.14,
      transparent: true,
      opacity: 1,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: '#d8b460',
      emissive: new THREE.Color('#4a320a'),
      emissiveIntensity: 0.36,
      roughness: 0.34,
      metalness: 0.78,
      transparent: true,
      opacity: 1,
    });

    // 1) Pillars layout: 4 carved dragon stone pillars that physically block enemy orbs/projectiles!
    const colGeo = new THREE.CylinderGeometry(0.95, 1.12, 6.2, 12);
    const plinthGeo = new THREE.CylinderGeometry(1.32, 1.44, 0.55, 8);
    const ringGeo = new THREE.TorusGeometry(1.12, 0.08, 8, 20);
    const pillarSpots: Array<[number, number]> = [
      [-7.4, -7.4],
      [7.4, -7.4],
      [-7.4, 7.4],
      [7.4, 7.4],
    ];
    for (const [px, pz] of pillarSpots) {
      const pGrp = new THREE.Group();
      pGrp.position.set(px, 0, pz);
      const plinth = new THREE.Mesh(plinthGeo, stoneMat);
      plinth.position.y = 0.275;
      plinth.castShadow = true;
      plinth.receiveShadow = true;
      const col = new THREE.Mesh(colGeo, stoneMat);
      col.position.y = 3.35;
      col.castShadow = true;
      const collar = new THREE.Mesh(ringGeo, goldMat);
      collar.rotation.x = Math.PI / 2;
      collar.position.y = 5.4;
      pGrp.add(plinth, col, collar);
      this.pillarsLayoutGroup.add(pGrp);
      this.pillarsObstacles.push({ x: px, z: pz, r: 1.25 });
      this.occludables.push({
        position: new THREE.Vector3(px, 2.4, pz),
        radius: 1.45,
        materials: [stoneMat, goldMat],
        currentOpacity: 1,
      });
    }

    // 2) Islands layout: twin resonant Spirit Crystals (剑意灵晶) that trigger sword-intent burst on contact
    const crystalSpots: Array<[number, number]> = [
      [-9.2, -2.4],
      [9.2, -2.4],
    ];
    const crystalGeo = new THREE.OctahedronGeometry(0.55, 0);
    const pedGeo = new THREE.CylinderGeometry(0.82, 1.02, 0.42, 8);
    for (const [cx, cz] of crystalSpots) {
      const cGrp = new THREE.Group();
      cGrp.position.set(cx, 0, cz);
      const ped = new THREE.Mesh(pedGeo, stoneMat);
      ped.position.y = 0.21;
      ped.castShadow = true;
      const mat = new THREE.MeshStandardMaterial({
        color: '#88f8f0',
        emissive: new THREE.Color('#28d8d0'),
        emissiveIntensity: 1.4,
        roughness: 0.16,
        metalness: 0.22,
        transparent: true,
        opacity: 0.94,
      });
      const orb = new THREE.Mesh(crystalGeo, mat);
      orb.position.y = 1.48;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.75, 0.04, 8, 22),
        new THREE.MeshBasicMaterial({ color: '#8cfcf2', transparent: true, opacity: 0.72 }),
      );
      ring.position.y = 1.48;
      const light = new THREE.PointLight('#48f2e4', 8.0, 12.0, 1.8);
      light.position.y = 1.6;
      cGrp.add(ped, orb, ring, light);
      this.islandsLayoutGroup.add(cGrp);
      this.islandCrystals.push({
        pos: new THREE.Vector3(cx, 0, cz),
        orb,
        ring,
        mat,
        light,
        used: false,
      });
    }
  }

  private buildMonolithAndLeylineProps(carvedTex: THREE.CanvasTexture): void {
    // 1) Spirit Monolith for Defend-the-Crystal stages (placed slightly north of spawn)
    this.monolithGroup.position.copy(this.monolithPos);
    this.monolithGroup.visible = false;

    const pedMat = new THREE.MeshStandardMaterial({
      map: carvedTex,
      color: '#5f7e8e',
      roughness: 0.65,
      metalness: 0.22,
    });
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.25, 0.48, 8), pedMat);
    ped.position.y = 0.24;
    ped.castShadow = true;
    ped.receiveShadow = true;

    this.monolithCoreMat = new THREE.MeshStandardMaterial({
      color: '#6fffe8',
      emissive: new THREE.Color('#1fd8b8'),
      emissiveIntensity: 1.35,
      roughness: 0.16,
      metalness: 0.28,
    });
    this.monolithCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.68, 0), this.monolithCoreMat);
    this.monolithCore.scale.set(0.9, 1.85, 0.9);
    this.monolithCore.position.y = 2.1;

    this.monolithRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.15, 0.045, 8, 28),
      new THREE.MeshBasicMaterial({ color: '#8efcf0', transparent: true, opacity: 0.8 }),
    );
    this.monolithRing.position.y = 2.1;

    this.monolithDomeMat = new THREE.MeshBasicMaterial({
      color: '#46f5d8',
      transparent: true,
      opacity: 0.22,
      wireframe: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.monolithDome = new THREE.Mesh(new THREE.SphereGeometry(1.75, 16, 10), this.monolithDomeMat);
    this.monolithDome.position.y = 1.65;

    const baseRingMat = new THREE.MeshBasicMaterial({
      color: '#46f5d8',
      transparent: true,
      opacity: 0.56,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const baseRing = new THREE.Mesh(new THREE.RingGeometry(1.42, 1.72, 28), baseRingMat);
    baseRing.rotation.x = -Math.PI / 2;
    baseRing.position.y = 0.085;

    this.monolithLight = new THREE.PointLight('#46f5d8', 11.0, 14.0, 1.7);
    this.monolithLight.position.y = 2.25;

    this.monolithGroup.add(ped, this.monolithCore, this.monolithRing, this.monolithDome, baseRing, this.monolithLight);
    this.group.add(this.monolithGroup);

    // 2) Tactical Leyline Buff Zone (3.2m golden-cyan rune circle)
    this.leylineZoneGroup.visible = false;
    this.leylineRingMat = new THREE.MeshBasicMaterial({
      color: '#63e8d8',
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.leylineDiscMat = new THREE.MeshBasicMaterial({
      color: '#ffd878',
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const outerRing = new THREE.Mesh(new THREE.RingGeometry(2.85, 3.25, 36), this.leylineRingMat);
    outerRing.rotation.x = -Math.PI / 2;
    outerRing.position.y = 0.095;
    const innerDisc = new THREE.Mesh(new THREE.CircleGeometry(2.85, 32), this.leylineDiscMat);
    innerDisc.rotation.x = -Math.PI / 2;
    innerDisc.position.y = 0.088;
    this.leylineZoneGroup.add(outerRing, innerDisc);

    const wispGeo = new THREE.OctahedronGeometry(0.16, 0);
    for (let i = 0; i < 3; i++) {
      const wisp = new THREE.Mesh(wispGeo, this.leylineRingMat);
      wisp.position.set(Math.cos((i / 3) * Math.PI * 2) * 2.95, 0.75, Math.sin((i / 3) * Math.PI * 2) * 2.95);
      this.leylineWisps.push(wisp);
      this.leylineZoneGroup.add(wisp);
    }
    this.group.add(this.leylineZoneGroup);
  }

  setMonolithVisible(visible: boolean): void {
    this.monolithGroup.visible = visible;
  }

  getMonolithPos(): THREE.Vector3 {
    return this.monolithPos;
  }

  setMonolithHealthRatio(ratio: number): void {
    const r = clamp(ratio, 0, 1);
    const colHex = r > 0.6 ? '#46f5d8' : r > 0.3 ? '#ffb84c' : '#ff4558';
    this.monolithCoreMat.color.set(colHex);
    this.monolithCoreMat.emissive.set(colHex);
    this.monolithLight.color.set(colHex);
    this.monolithDomeMat.color.set(colHex);
    this.monolithDome.visible = r >= 0.25;
  }

  setLeylineZone(active: boolean, x = 0, z = 0, heroInside = false): void {
    this.leylineZoneGroup.visible = active;
    this.leylineHeroInside = heroInside;
    if (active) {
      this.leylineZoneGroup.position.set(x, 0, z);
      this.leylineRingMat.opacity = heroInside ? 0.94 : 0.65;
      this.leylineRingMat.color.set(heroInside ? '#ffe384' : '#63e8d8');
      this.leylineDiscMat.opacity = heroInside ? 0.28 : 0.14;
    }
  }

  private buildOpenWorld(carvedTex: THREE.CanvasTexture, lacquerTex: THREE.CanvasTexture): void {
    const ow = this.openWorldGroup;

    // 1. Vast 236x236 Kyushu Earth Plane (extends 40m past WORLD_BOUND=78 so no void ever leaks)
    const owTerrain = createOpenWorldTerrainMaps();
    for (const tex of [owTerrain.map, owTerrain.bumpMap, owTerrain.roughnessMap]) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(16, 16);
      tex.needsUpdate = true;
    }
    const groundMat = new THREE.MeshStandardMaterial({
      map: owTerrain.map,
      bumpMap: owTerrain.bumpMap,
      bumpScale: 0.14,
      roughnessMap: owTerrain.roughnessMap,
      color: '#c8dcd0',
      roughness: 0.94,
      metalness: 0.02,
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(236, 236), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.26;
    ground.receiveShadow = true;
    ow.add(ground);

    // 1b. Outer Mountain Crag & Drifting Cloud Boundary Ring framing WORLD_BOUND = 78
    const rimPeakMat = new THREE.MeshStandardMaterial({
      map: carvedTex,
      color: '#253543',
      emissive: new THREE.Color('#091420'),
      emissiveIntensity: 0.35,
      roughness: 0.94,
      metalness: 0.03,
      flatShading: true,
    });
    const rimPeakGeo = new THREE.DodecahedronGeometry(1.0, 1);
    const rimCount = 36;
    const rimInst = new THREE.InstancedMesh(rimPeakGeo, rimPeakMat, rimCount);
    const rimDummy = new THREE.Object3D();
    for (let i = 0; i < rimCount; i++) {
      const ang = (i / rimCount) * Math.PI * 2;
      const cosA = Math.cos(ang);
      const sinA = Math.sin(ang);
      // Superellipse hugging just outside the +/-78 square border
      const maxAxis = Math.max(Math.abs(cosA), Math.abs(sinA));
      const baseDist = (WORLD_BOUND + 11.5) / Math.max(0.68, maxAxis);
      const dist = Math.min(104, baseDist + (i % 3) * 3.2);
      const px = cosA * dist;
      const pz = sinA * dist;
      const sx = 9.5 + (i % 4) * 3.4;
      const sy = 12.0 + ((i * 5) % 7) * 2.8;
      const sz = 8.5 + ((i * 3) % 4) * 2.6;
      rimDummy.position.set(px, sy * 0.36 - 1.4, pz);
      rimDummy.rotation.set(0.08 * ((i % 3) - 1), ang + 0.4, 0.06 * ((i % 2) - 0.5));
      rimDummy.scale.set(sx, sy, sz);
      rimDummy.updateMatrix();
      rimInst.setMatrixAt(i, rimDummy.matrix);
    }
    rimInst.instanceMatrix.needsUpdate = true;
    ow.add(rimInst);

    const rimCloudMat = new THREE.MeshBasicMaterial({
      color: '#7da8be',
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const rimCloudGeo = new THREE.CircleGeometry(18, 16);
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2 + 0.18;
      const maxAxis = Math.max(Math.abs(Math.cos(ang)), Math.abs(Math.sin(ang)));
      const r = Math.min(98, (WORLD_BOUND + 7.5) / Math.max(0.7, maxAxis));
      const cloud = new THREE.Mesh(rimCloudGeo, rimCloudMat);
      cloud.rotation.x = -Math.PI / 2;
      cloud.position.set(Math.cos(ang) * r, 0.25 + (i % 3) * 0.55, Math.sin(ang) * r);
      cloud.scale.set(1.25 + (i % 2) * 0.35, 0.9, 1);
      ow.add(cloud);
    }

    // 2. Four diagonal stone avenues + Northern Crypt Courier Road + flanking stone lanterns
    const roadMat = new THREE.MeshStandardMaterial({
      map: carvedTex,
      color: '#6b7e8c',
      roughness: 0.84,
      metalness: 0.06,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const lanternStoneMat = new THREE.MeshStandardMaterial({ map: carvedTex, color: '#8ea4b4', roughness: 0.72 });
    const lanternGlowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 1.35, 0.65) });
    const jadeLanternGlowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.45, 2.05, 1.85) });
    const postGeo = new THREE.CylinderGeometry(0.18, 0.24, 1.5, 6);
    const lanternBoxGeo = new THREE.BoxGeometry(0.46, 0.42, 0.46);
    const lanternCapGeo = new THREE.ConeGeometry(0.42, 0.34, 4);

    const addRoadLantern = (lx: number, lz: number, jadeGlow = false) => {
      const lp = new THREE.Group();
      lp.position.set(lx, -0.2, lz);
      const post = new THREE.Mesh(postGeo, lanternStoneMat);
      post.position.y = 0.75;
      post.castShadow = true;
      const box = new THREE.Mesh(lanternBoxGeo, jadeGlow ? jadeLanternGlowMat : lanternGlowMat);
      box.position.y = 1.68;
      const cap = new THREE.Mesh(lanternCapGeo, lanternStoneMat);
      cap.rotation.y = Math.PI / 4;
      cap.position.y = 2.02;
      lp.add(post, box, cap);
      ow.add(lp);
    };

    const roadGeo = new THREE.BoxGeometry(4.4, 0.1, 46);
    for (const ang of [Math.PI * 0.25, -Math.PI * 0.25, Math.PI * 0.75, -Math.PI * 0.75]) {
      const road = new THREE.Mesh(roadGeo, roadMat);
      road.rotation.y = ang;
      road.position.set(Math.sin(ang) * 42.0, -0.11, Math.cos(ang) * 42.0);
      road.receiveShadow = true;
      ow.add(road);

      const sideX = Math.cos(ang) * 3.2;
      const sideZ = -Math.sin(ang) * 3.2;
      for (const dist of [24.0, 44.0]) {
        for (const sgn of [-1, 1]) {
          addRoadLantern(Math.sin(ang) * dist + sideX * sgn, Math.cos(ang) * dist + sideZ * sgn);
        }
      }
    }

    // 5th Avenue: Northern Stone Courier Road leading straight to 北溟·幽冥古地窟
    const northRoad = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.1, 31), roadMat);
    northRoad.position.set(0, -0.11, -34.5);
    northRoad.receiveShadow = true;
    ow.add(northRoad);
    for (const lz of [-24.0, -37.0]) {
      for (const sgn of [-1, 1]) {
        addRoadLantern(3.4 * sgn, lz, lz < -30);
      }
    }

    // Helper: crisp carved Chinese calligraphy plaque texture for Open-World landmarks
    const makeLandmarkPlaque = (
      title: string,
      bgHex: string,
      borderHex: string,
      textHex: string,
    ): THREE.CanvasTexture => {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 192;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = bgHex;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.strokeStyle = borderHex;
      ctx.lineWidth = 12;
      ctx.strokeRect(10, 10, c.width - 20, c.height - 20);
      ctx.lineWidth = 4;
      ctx.strokeRect(24, 24, c.width - 48, c.height - 48);
      ctx.fillStyle = textHex;
      ctx.font = '900 84px "Noto Serif SC", "Songti SC", "KaiTi", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(title, c.width * 0.5, c.height * 0.54);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    };

    const campWoodTex = createCampWoodTexture();
    const streamMaps = createStreamStoneMaps();

    // 3. Handcrafted Regional Terrain Grounds (NO flat circular stickers or repetitive Bagua clutter!)
    // 3a. 东岳·翠竹山间桃谷 (Lush valley meadow patch + organic mossy ground)
    const valleyFloorMat = new THREE.MeshStandardMaterial({
      map: owTerrain.map,
      color: '#5a946e',
      roughness: 0.92,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const valleyFloor = new THREE.Mesh(new THREE.PlaneGeometry(46, 44), valleyFloorMat);
    valleyFloor.rotation.x = -Math.PI / 2;
    valleyFloor.position.set(47, -0.22, -45);
    valleyFloor.receiveShadow = true;
    ow.add(valleyFloor);

    // 3b. 西陲·黑风古山寨 (Compacted rugged mountain stronghold earth yard with warm firelight bounce)
    const fortressFloorMat = new THREE.MeshStandardMaterial({
      map: owTerrain.map,
      color: '#6e5742',
      emissive: new THREE.Color('#1c1108'),
      emissiveIntensity: 0.28,
      roughness: 0.92,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const fortressYard = new THREE.Mesh(new THREE.PlaneGeometry(36, 36), fortressFloorMat);
    fortressYard.rotation.x = -Math.PI / 2;
    fortressYard.position.set(-48, -0.21, -45);
    fortressYard.receiveShadow = true;
    ow.add(fortressYard);

    // 3c. 南冥·赤焰炼器熔谷 (Magma Pool + Boss Platform + 玄铁炼器栈桥 + 古铸剑鼎)
    const lavaMaps = createLavaCrustMaps();
    const lavaPoolMat = new THREE.MeshStandardMaterial({
      map: lavaMaps.map,
      emissiveMap: lavaMaps.emissiveMap,
      roughnessMap: lavaMaps.roughnessMap,
      emissive: new THREE.Color('#ff5414'),
      emissiveIntensity: 1.55,
      roughness: 0.7,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const lavaPatch = new THREE.Mesh(new THREE.CircleGeometry(16.5, 28), lavaPoolMat);
    lavaPatch.rotation.x = -Math.PI / 2;
    lavaPatch.position.set(-46, -0.15, 44);
    const lavaBossPlatform = new THREE.Mesh(
      new THREE.CylinderGeometry(6.8, 7.6, 0.36, 18),
      new THREE.MeshStandardMaterial({ map: carvedTex, color: '#3a2b2d', roughness: 0.85 }),
    );
    lavaBossPlatform.position.set(-50, -0.02, 48);
    lavaBossPlatform.receiveShadow = true;
    ow.add(lavaPatch, lavaBossPlatform);

    // 3d. 九霄·凌霄天庭 (Multi-stepped White-Jade Octagonal Celestial Terrace — NO flat blue circle!)
    const whiteJadeMat = new THREE.MeshStandardMaterial({
      map: carvedTex,
      color: '#eef4fa',
      emissive: new THREE.Color('#203448'),
      emissiveIntensity: 0.24,
      roughness: 0.42,
      metalness: 0.08,
    });
    const heavenlyGoldMat = new THREE.MeshStandardMaterial({
      color: '#e8bd5a',
      emissive: new THREE.Color('#5a3908'),
      emissiveIntensity: 0.42,
      roughness: 0.28,
      metalness: 0.78,
    });
    const imperialCrimsonMat = new THREE.MeshStandardMaterial({
      map: lacquerTex,
      color: '#9c221b',
      roughness: 0.48,
      metalness: 0.14,
    });
    const glazedRoofGoldMat = new THREE.MeshStandardMaterial({
      color: '#e6b244',
      emissive: new THREE.Color('#4a2d06'),
      emissiveIntensity: 0.36,
      roughness: 0.32,
      metalness: 0.62,
    });

    const celestialBase = new THREE.Mesh(new THREE.CylinderGeometry(18.6, 20.2, 0.14, 8), whiteJadeMat);
    celestialBase.rotation.y = Math.PI / 8;
    celestialBase.position.set(50, -0.17, 46);
    celestialBase.receiveShadow = true;
    const celestialRim = new THREE.Mesh(
      new THREE.RingGeometry(17.8, 18.5, 8),
      new THREE.MeshBasicMaterial({
        color: '#ffe082',
        transparent: true,
        opacity: 0.68,
        side: THREE.DoubleSide,
      }),
    );
    celestialRim.rotation.x = -Math.PI / 2;
    celestialRim.rotation.z = Math.PI / 8;
    celestialRim.position.set(50, -0.09, 46);
    const celestialBossDais = new THREE.Mesh(new THREE.CylinderGeometry(6.8, 7.6, 0.12, 8), whiteJadeMat);
    celestialBossDais.rotation.y = Math.PI / 8;
    celestialBossDais.position.set(54, -0.1, 48);
    celestialBossDais.receiveShadow = true;
    // Imperial crimson-gold carpet walkway leading from 南天门 to 凌霄玉台
    const imperialRunner = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 0.05, 19),
      new THREE.MeshStandardMaterial({ color: '#9e261e', roughness: 0.72, metalness: 0.08 }),
    );
    imperialRunner.rotation.y = -0.58;
    imperialRunner.position.set(42.5, -0.11, 34);
    imperialRunner.receiveShadow = true;
    ow.add(celestialBase, celestialRim, celestialBossDais, imperialRunner);

    // 3e. 北溟·幽冥古地窟 floor
    const cryptPatch = new THREE.Mesh(
      new THREE.CircleGeometry(21, 28),
      new THREE.MeshStandardMaterial({
        map: carvedTex,
        color: '#24303e',
        emissive: new THREE.Color('#09282c'),
        emissiveIntensity: 0.45,
        roughness: 0.82,
        metalness: 0.12,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );
    cryptPatch.rotation.x = -Math.PI / 2;
    cryptPatch.position.set(0, -0.16, -58);
    ow.add(cryptPatch);

    // =========================================================================
    // 4A. 东岳 · 翠竹山间桃谷 (Mountain Hills, Jade Stream, Wooden Arch Bridge, Pavilion, Bamboo & Peach)
    // =========================================================================
    const hillMatDark = new THREE.MeshStandardMaterial({
      map: owTerrain.map,
      color: '#2c5b46',
      roughness: 0.94,
      flatShading: true,
    });
    const hillMatMid = new THREE.MeshStandardMaterial({
      map: owTerrain.map,
      color: '#3c7758',
      roughness: 0.92,
      flatShading: true,
    });
    const hillMatTop = new THREE.MeshStandardMaterial({
      map: owTerrain.map,
      color: '#4f8e68',
      roughness: 0.9,
      flatShading: true,
    });
    // Multi-tiered green mountain hill terraces framing the scenic valley perimeter
    const valleyHills: Array<[number, number, number, number]> = [
      [64, -56, 8.2, 7.6],
      [55, -64, 7.8, 6.8],
      [39, -65, 7.4, 6.4],
      [27, -58, 6.6, 5.8],
      [67, -41, 7.0, 6.2],
    ];
    const terraceHillGeo = new THREE.CylinderGeometry(0.68, 1.0, 1.0, 9);
    for (const [hx, hz, hr, hh] of valleyHills) {
      const hg = new THREE.Group();
      hg.position.set(hx, -0.25, hz);
      const t0 = new THREE.Mesh(terraceHillGeo, hillMatDark);
      t0.scale.set(hr, hh * 0.42, hr * 0.88);
      t0.position.y = hh * 0.21;
      const t1 = new THREE.Mesh(terraceHillGeo, hillMatMid);
      t1.scale.set(hr * 0.72, hh * 0.36, hr * 0.66);
      t1.position.set(-hr * 0.08, hh * 0.56, -hr * 0.05);
      const t2 = new THREE.Mesh(terraceHillGeo, hillMatTop);
      t2.scale.set(hr * 0.44, hh * 0.3, hr * 0.42);
      t2.position.set(hr * 0.05, hh * 0.84, hr * 0.04);
      hg.add(t0, t1, t2);
      ow.add(hg);
      this.openWorldObstacles.push({ x: hx, z: hz, r: Math.min(4.6, hr * 0.56) });
    }

    // Shimmering Jade Mountain Stream winding through 翠竹山间桃谷
    const streamBedMat = new THREE.MeshStandardMaterial({
      map: streamMaps.map,
      roughnessMap: streamMaps.roughnessMap,
      color: '#467478',
      roughness: 0.86,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const valleyWaterMat = new THREE.MeshStandardMaterial({
      color: '#48c8bc',
      emissive: new THREE.Color('#186e68'),
      emissiveIntensity: 0.32,
      roughness: 0.18,
      metalness: 0.25,
      transparent: true,
      opacity: 0.78,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const streamPath: Array<[number, number]> = [
      [27, -51],
      [33, -44],
      [40, -39],
      [48, -35],
      [57, -31],
      [66, -28],
    ];
    for (let si = 0; si < streamPath.length - 1; si++) {
      const [x0, z0] = streamPath[si];
      const [x1, z1] = streamPath[si + 1];
      const mx = (x0 + x1) * 0.5;
      const mz = (z0 + z1) * 0.5;
      const segLen = Math.hypot(x1 - x0, z1 - z0) + 1.6;
      const segAng = Math.atan2(x1 - x0, z1 - z0);
      const bed = new THREE.Mesh(new THREE.PlaneGeometry(4.8, segLen), streamBedMat);
      bed.rotation.x = -Math.PI / 2;
      bed.rotation.z = -segAng;
      bed.position.set(mx, -0.2, mz);
      const water = new THREE.Mesh(new THREE.PlaneGeometry(3.9, segLen), valleyWaterMat.clone());
      water.rotation.x = -Math.PI / 2;
      water.rotation.z = -segAng;
      water.position.set(mx, -0.14, mz);
      ow.add(bed, water);
      this.owValleyWaterMeshes.push(water);
    }
    // Smooth riverside mossy pebbles along banks (decorative, non-blocking)
    const pebbleMat = new THREE.MeshStandardMaterial({ map: carvedTex, color: '#586c66', roughness: 0.88, flatShading: true });
    const pebbleGeo = new THREE.DodecahedronGeometry(0.55, 1);
    for (const [rx, rz, sc] of [
      [30, -49, 1.1], [36, -44, 0.9], [44, -34, 1.0], [52, -37, 1.1],
      [60, -28, 1.0], [49, -31, 0.85], [31, -41, 0.95], [56, -35, 0.9],
    ]) {
      const pb = new THREE.Mesh(pebbleGeo, pebbleMat);
      pb.scale.set(sc * 1.2, sc * 0.55, sc);
      pb.position.set(rx, -0.05, rz);
      ow.add(pb);
    }

    // Sculpted Curved Wooden Arch Bridge (山间木拱桥) spanning the stream at (40, -39)
    const bridgeTimberMat = new THREE.MeshStandardMaterial({
      map: campWoodTex,
      color: '#9c683d',
      roughness: 0.76,
      metalness: 0.06,
    });
    const bridgeRailMat = new THREE.MeshStandardMaterial({
      map: lacquerTex,
      color: '#9e3226',
      roughness: 0.56,
      metalness: 0.1,
    });
    const archBridge = new THREE.Group();
    archBridge.position.set(40, -0.14, -39);
    archBridge.rotation.y = 0.56; // perpendicular to stream segment
    const plankGeo = new THREE.BoxGeometry(3.4, 0.14, 0.82);
    const bridgeSpan = 7.4;
    const plankCount = 9;
    for (let pi = 0; pi < plankCount; pi++) {
      const t = pi / (plankCount - 1) - 0.5; // -0.5..0.5
      const lz = t * bridgeSpan;
      const archY = Math.cos(t * Math.PI) * 0.62;
      const tilt = Math.sin(t * Math.PI) * 0.24;
      const plank = new THREE.Mesh(plankGeo, bridgeTimberMat);
      plank.position.set(0, archY + 0.08, lz);
      plank.rotation.x = tilt;
      plank.receiveShadow = true;
      plank.castShadow = true;
      archBridge.add(plank);
      // Curved bridge side posts & top rails
      if (pi % 2 === 0) {
        for (const sgn of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 1.05, 6), bridgeRailMat);
          post.position.set(sgn * 1.62, archY + 0.58, lz);
          post.castShadow = true;
          archBridge.add(post);
          if (pi === 0 || pi === plankCount - 1) {
            const lanternTop = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), lanternGlowMat);
            lanternTop.position.set(sgn * 1.62, archY + 1.18, lz);
            archBridge.add(lanternTop);
          }
        }
      }
      if (pi < plankCount - 1) {
        const tNext = (pi + 1) / (plankCount - 1) - 0.5;
        const archNext = Math.cos(tNext * Math.PI) * 0.62;
        const midZ = (lz + tNext * bridgeSpan) * 0.5;
        const midY = (archY + archNext) * 0.5 + 0.92;
        const dz = bridgeSpan / (plankCount - 1);
        const dy = archNext - archY;
        const railLen = Math.hypot(dz, dy);
        const railTilt = -Math.atan2(dy, dz);
        for (const sgn of [-1, 1]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, railLen + 0.06), bridgeRailMat);
          rail.position.set(sgn * 1.62, midY, midZ);
          rail.rotation.x = railTilt;
          archBridge.add(rail);
        }
      }
    }
    // Stone bridge abutments at both ends
    for (const endSgn of [-1, 1]) {
      const abut = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.34, 1.2), lanternStoneMat);
      abut.position.set(0, 0.02, endSgn * (bridgeSpan * 0.5 + 0.35));
      archBridge.add(abut);
    }
    ow.add(archBridge);

    // Hexagonal Mountain-Side Pavilion (清风凉亭) at (33.5, -45.5) — directly North of wp_peach!
    const pavRoofMat = new THREE.MeshStandardMaterial({
      color: '#1e4a4c',
      emissive: new THREE.Color('#092022'),
      emissiveIntensity: 0.25,
      roughness: 0.5,
      metalness: 0.22,
    });
    const pavPlaqueMat = new THREE.MeshStandardMaterial({
      map: makeLandmarkPlaque('清风亭', '#1e3a38', '#d9b464', '#fff2cc'),
      roughness: 0.45,
    });
    const pavilion = new THREE.Group();
    pavilion.position.set(33.5, -0.18, -45.5);
    const pavBase = new THREE.Mesh(new THREE.CylinderGeometry(3.35, 3.65, 0.42, 6), lanternStoneMat);
    pavBase.position.y = 0.21;
    pavBase.receiveShadow = true;
    pavBase.castShadow = true;
    pavilion.add(pavBase);
    const pavColGeo = new THREE.CylinderGeometry(0.14, 0.16, 3.4, 8);
    const pavBenchGeo = new THREE.BoxGeometry(2.3, 0.14, 0.42);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const cx = Math.cos(a) * 2.75;
      const cz = Math.sin(a) * 2.75;
      const col = new THREE.Mesh(pavColGeo, imperialCrimsonMat);
      col.position.set(cx, 2.08, cz);
      col.castShadow = true;
      pavilion.add(col);
      // 美人靠 wooden benches on 4 sides (leaving front/back open)
      if (i !== 1 && i !== 4) {
        const aMid = a + Math.PI / 6;
        const bench = new THREE.Mesh(pavBenchGeo, bridgeTimberMat);
        bench.position.set(Math.cos(aMid) * 2.38, 0.78, Math.sin(aMid) * 2.38);
        bench.rotation.y = -aMid + Math.PI / 2;
        pavilion.add(bench);
      }
    }
    const pavLowerRoof = new THREE.Mesh(new THREE.ConeGeometry(4.55, 1.55, 6), pavRoofMat);
    pavLowerRoof.position.y = 4.48;
    pavLowerRoof.castShadow = true;
    const pavUpperRoof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.35, 6), pavRoofMat);
    pavUpperRoof.position.y = 5.65;
    const pavFinial = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), heavenlyGoldMat);
    pavFinial.scale.set(0.85, 1.6, 0.85);
    pavFinial.position.y = 6.6;
    const pavLantern = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), lanternGlowMat);
    pavLantern.scale.set(0.85, 1.25, 0.85);
    pavLantern.position.y = 3.25;
    const pavPlaque = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.68, 0.14), pavPlaqueMat);
    pavPlaque.position.set(0, 3.65, 2.75);
    pavilion.add(pavLowerRoof, pavUpperRoof, pavFinial, pavLantern, pavPlaque);
    // Upturned golden flying eave tips on the 6 corners
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.88, 4), heavenlyGoldMat);
      tip.position.set(Math.cos(a) * 4.35, 3.92, Math.sin(a) * 4.35);
      tip.rotation.z = -Math.cos(a) * 0.95;
      tip.rotation.x = Math.sin(a) * 0.95;
      pavilion.add(tip);
    }
    ow.add(pavilion);
    this.openWorldObstacles.push({ x: 33.5, z: -45.5, r: 2.65 });

    // Instanced Lush Bamboo Groves (翠竹林) clustering along the valley hills & stream banks
    const bambooStalkMat = new THREE.MeshStandardMaterial({
      color: '#3f8a58',
      roughness: 0.62,
      metalness: 0.05,
    });
    const bambooCanopyMat = new THREE.MeshStandardMaterial({
      color: '#52a666',
      emissive: new THREE.Color('#13301d'),
      emissiveIntensity: 0.24,
      roughness: 0.78,
    });
    const bambooClusters: Array<[number, number]> = [
      [28, -44], [30, -52], [38, -54], [48, -59], [58, -56],
      [62, -45], [60, -34], [47, -28], [26, -36], [56, -24],
    ];
    const stalksPerCluster = 9;
    const totalStalks = bambooClusters.length * stalksPerCluster;
    const stalkInst = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.08, 0.12, 6.2, 6),
      bambooStalkMat,
      totalStalks,
    );
    const leafInst = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(0.95, 0),
      bambooCanopyMat,
      totalStalks,
    );
    const bDummy = new THREE.Object3D();
    let bIdx = 0;
    for (let ci = 0; ci < bambooClusters.length; ci++) {
      const [bx, bz] = bambooClusters[ci];
      for (let k = 0; k < stalksPerCluster; k++) {
        const ang = (k / stalksPerCluster) * Math.PI * 2 + ci * 0.7;
        const rad = 0.55 + ((k * 7 + ci * 3) % 5) * 0.38;
        const sx = bx + Math.cos(ang) * rad;
        const sz = bz + Math.sin(ang) * rad;
        const hScale = 0.78 + ((k * 3 + ci) % 5) * 0.14;
        bDummy.position.set(sx, 3.0 * hScale - 0.2, sz);
        bDummy.rotation.set(Math.sin(ang) * 0.07, ang, Math.cos(ang) * 0.07);
        bDummy.scale.set(1, hScale, 1);
        bDummy.updateMatrix();
        stalkInst.setMatrixAt(bIdx, bDummy.matrix);

        bDummy.position.set(sx, 5.7 * hScale - 0.1, sz);
        bDummy.scale.set(1.25, 0.52, 1.15);
        bDummy.updateMatrix();
        leafInst.setMatrixAt(bIdx, bDummy.matrix);
        bIdx++;
      }
    }
    stalkInst.instanceMatrix.needsUpdate = true;
    leafInst.instanceMatrix.needsUpdate = true;
    ow.add(stalkInst, leafInst);

    // Sculpted Blossoming Peach Trees framing 东岳·翠竹山间桃谷 (clear of stream, bridge, herbs & boss)
    const trunkMat = new THREE.MeshStandardMaterial({ map: lacquerTex, color: '#4c2c24', roughness: 0.85 });
    const blossomMat = new THREE.MeshStandardMaterial({
      color: '#f7adc9',
      emissive: new THREE.Color('#5a1e38'),
      emissiveIntensity: 0.28,
      roughness: 0.74,
      transparent: true,
      opacity: 0.92,
    });
    for (const [px, pz] of [
      [42, -31], [57, -38], [59, -51], [47, -56], [36, -26], [62, -32],
    ]) {
      const tg = new THREE.Group();
      tg.position.set(px, -0.18, pz);
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.34, 2.8, 7), trunkMat);
      tr.position.y = 1.4;
      tr.castShadow = true;
      tg.add(tr);
      const boughSpecs: Array<[number, number, number, number]> = [
        [0.65, 2.55, 0.25, 0.42],
        [-0.72, 2.7, -0.35, -0.48],
        [0.12, 2.95, 0.65, 0.22],
      ];
      for (const [bx, by, bz, rz] of boughSpecs) {
        const bough = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 1.35, 6), trunkMat);
        bough.position.set(bx * 0.5, by - 0.35, bz * 0.5);
        bough.rotation.z = -rz;
        bough.rotation.x = bz * 0.35;
        const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(1.18, 1), blossomMat);
        puff.scale.set(1.25, 0.76, 1.15);
        puff.position.set(bx, by + 0.32, bz);
        tg.add(bough, puff);
      }
      const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(1.38, 1), blossomMat);
      crown.scale.set(1.25, 0.82, 1.25);
      crown.position.y = 3.55;
      tg.add(crown);
      ow.add(tg);
      this.openWorldObstacles.push({ x: px, z: pz, r: 0.55 });
    }

    // =========================================================================
    // 4B. 西陲 · 黑风古山寨 (Timber Palisade Stockade, Watchtowers, Fire-Braziers, Lodges, Banners!)
    // =========================================================================
    const logTimberMat = new THREE.MeshStandardMaterial({
      map: campWoodTex,
      color: '#b0784a',
      emissive: new THREE.Color('#3d200d'),
      emissiveIntensity: 0.44,
      roughness: 0.82,
      metalness: 0.05,
    });
    const darkLogMat = new THREE.MeshStandardMaterial({
      map: campWoodTex,
      color: '#7a5032',
      emissive: new THREE.Color('#2a1508'),
      emissiveIntensity: 0.36,
      roughness: 0.86,
      metalness: 0.06,
    });
    const fortRoofMat = new THREE.MeshStandardMaterial({
      color: '#4a3a32',
      emissive: new THREE.Color('#221610'),
      emissiveIntensity: 0.34,
      roughness: 0.84,
      metalness: 0.08,
    });
    const fortBannerMat = new THREE.MeshStandardMaterial({
      color: '#d42a24',
      emissive: new THREE.Color('#681410'),
      emissiveIntensity: 0.56,
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
    const fortIronMat = new THREE.MeshStandardMaterial({ color: '#4c5059', roughness: 0.46, metalness: 0.76 });
    const fortFlameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.25, 0.34) });
    const fortLanternMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.72, 0.24) });

    // 4B-1. Sharpened Wooden Palisade Stockade Walls (4 open wings -> 4 HUGE >=10m gateways, ZERO trapping!)
    const palisadeSegments: Array<[number, number, number, number]> = [
      [-65, -33, -65, -56], // West stronghold palisade
      [-63, -62, -49, -62], // North-West palisade (huge North gap -48..-34!)
      [-31, -56, -31, -44], // North-East palisade (huge East/SE gate!)
      [-60, -30, -49, -30], // South-West palisade (huge South gap -48..-38!)
    ];
    const logPositions: Array<[number, number, number]> = [];
    for (const [x0, z0, x1, z1] of palisadeSegments) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const count = Math.max(4, Math.floor(len / 0.56));
      for (let i = 0; i <= count; i++) {
        const t = i / count;
        const lx = x0 + (x1 - x0) * t;
        const lz = z0 + (z1 - z0) * t;
        const hVar = 2.85 + ((i * 5) % 4) * 0.24;
        logPositions.push([lx, lz, hVar]);
      }
      // Horizontal binding timber beams spanning each wall wing
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, len), darkLogMat);
      beam.position.set((x0 + x1) * 0.5, 1.9, (z0 + z1) * 0.5);
      beam.rotation.y = Math.atan2(x1 - x0, z1 - z0);
      ow.add(beam);
      // Conservative circular collision nodes strictly along the wall itself
      const obsSteps = Math.max(2, Math.floor(len / 3.4));
      for (let oi = 0; oi <= obsSteps; oi++) {
        const t = oi / obsSteps;
        this.openWorldObstacles.push({
          x: x0 + (x1 - x0) * t,
          z: z0 + (z1 - z0) * t,
          r: 0.95,
        });
      }
    }
    const palisadeTrunkInst = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.2, 0.24, 1.0, 6),
      logTimberMat,
      logPositions.length,
    );
    const palisadeTipInst = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.2, 0.62, 6),
      darkLogMat,
      logPositions.length,
    );
    const pDummy = new THREE.Object3D();
    logPositions.forEach(([lx, lz, h], idx) => {
      pDummy.position.set(lx, h * 0.5 - 0.2, lz);
      pDummy.rotation.set(0, idx * 0.7, 0);
      pDummy.scale.set(1, h, 1);
      pDummy.updateMatrix();
      palisadeTrunkInst.setMatrixAt(idx, pDummy.matrix);

      pDummy.position.set(lx, h + 0.1, lz);
      pDummy.scale.set(1, 1, 1);
      pDummy.updateMatrix();
      palisadeTipInst.setMatrixAt(idx, pDummy.matrix);
    });
    palisadeTrunkInst.instanceMatrix.needsUpdate = true;
    palisadeTipInst.instanceMatrix.needsUpdate = true;
    ow.add(palisadeTrunkInst, palisadeTipInst);

    // 4B-2. Grand Mountain Fortress Timber Gate (黑风山寨门楼) at (-37, -34) — HUGE 8.4m open gateway!
    const fortGatePlaqueMat = new THREE.MeshStandardMaterial({
      map: makeLandmarkPlaque('黑风山寨', '#301c12', '#c88c42', '#ffdf9e'),
      emissive: new THREE.Color('#5a300c'),
      emissiveIntensity: 0.65,
      roughness: 0.52,
    });
    const fortGate = new THREE.Group();
    fortGate.position.set(-37, -0.18, -34);
    fortGate.rotation.y = 0.42;
    for (const sgn of [-1, 1]) {
      const px = sgn * 4.2;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.46, 6.4, 8), darkLogMat);
      post.position.set(px, 3.2, 0);
      post.castShadow = true;
      const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 3.2, 6), logTimberMat);
      brace.position.set(px + sgn * 0.9, 1.5, 0);
      brace.rotation.z = sgn * 0.42;
      const brazierCup = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.22, 0.36, 8), fortIronMat);
      brazierCup.position.set(px, 4.4, 0.65);
      const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), fortFlameMat);
      flame.scale.set(0.9, 1.45, 0.9);
      flame.position.set(px, 4.82, 0.65);
      this.owFortressFlames.push({ mesh: flame, baseY: 4.82, phase: sgn * 1.4 });
      fortGate.add(post, brace, brazierCup, flame);
      // World-space obstacle for gatepost only (clear 8.4m center!)
      const cosG = Math.cos(0.42);
      const sinG = Math.sin(0.42);
      this.openWorldObstacles.push({
        x: -37 + px * cosG,
        z: -34 - px * sinG,
        r: 0.68,
      });
    }
    const gateBeam = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.72, 0.85), darkLogMat);
    gateBeam.position.set(0, 5.45, 0);
    gateBeam.castShadow = true;
    const gateRoof = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.36, 2.3), fortRoofMat);
    gateRoof.position.set(0, 6.18, 0);
    const gatePlaque = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.08, 0.2), fortGatePlaqueMat);
    gatePlaque.position.set(0, 5.45, 0.5);
    // Sharpened defensive spikes crowning the gate parapet
    for (let si = -4; si <= 4; si++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.78, 5), logTimberMat);
      sp.position.set(si * 1.1, 6.68, 0);
      fortGate.add(sp);
    }
    // Hanging warm crimson-gold fortress lanterns under the gate eaves
    for (const lx of [-2.45, 2.45]) {
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.85, 5), fortIronMat);
      cord.position.set(lx, 4.7, 0.45);
      const lan = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), fortLanternMat);
      lan.scale.set(0.88, 1.28, 0.88);
      lan.position.set(lx, 4.1, 0.45);
      fortGate.add(cord, lan);
    }
    fortGate.add(gateBeam, gateRoof, gatePlaque);
    ow.add(fortGate);

    // Warm firelight PointLights & flanking entrance fire-braziers so 黑风古山寨 glows dramatically at night!
    const fortGateLight = new THREE.PointLight('#ff923c', 26, 30, 1.35);
    fortGateLight.position.set(-35.5, 4.6, -33.2);
    ow.add(fortGateLight);
    this.owFortressLights.push({ light: fortGateLight, baseIntensity: 26, phase: 0.4 });

    const fortYardLight = new THREE.PointLight('#ff8a34', 24, 30, 1.35);
    fortYardLight.position.set(-47.5, 3.8, -42.5);
    ow.add(fortYardLight);
    this.owFortressLights.push({ light: fortYardLight, baseIntensity: 24, phase: 2.3 });

    for (const [fx, fz, ph] of [
      [-32.8, -31.8, 0.8],
      [-40.2, -35.8, 1.9],
      [-33.8, -39.2, 3.1],
      [-42.2, -31.5, 4.2],
    ]) {
      const stand = new THREE.Group();
      stand.position.set(fx, -0.18, fz);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 2.1, 6), fortIronMat);
      pole.position.y = 1.05;
      const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.24, 0.36, 8), fortIronMat);
      pan.position.y = 2.18;
      const fl = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), fortFlameMat);
      fl.scale.set(0.95, 1.55, 0.95);
      fl.position.y = 2.68;
      this.owFortressFlames.push({ mesh: fl, baseY: 2.68, phase: ph });
      stand.add(pole, pan, fl);
      ow.add(stand);
    }

    // 4B-3. Dual Timber Watchtowers (箭楼哨塔) with Blazing Fire-Braziers
    const buildWatchtower = (tx: number, tz: number, rotY: number, phaseOffset: number) => {
      const tw = new THREE.Group();
      tw.position.set(tx, -0.18, tz);
      tw.rotation.y = rotY;
      const stiltGeo = new THREE.CylinderGeometry(0.18, 0.24, 5.4, 7);
      for (const sx of [-1.25, 1.25]) {
        for (const sz of [-1.25, 1.25]) {
          const stilt = new THREE.Mesh(stiltGeo, darkLogMat);
          stilt.position.set(sx, 2.7, sz);
          stilt.castShadow = true;
          tw.add(stilt);
        }
      }
      // Elevated guard deck + notched log battlements
      const deck = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.28, 3.4), logTimberMat);
      deck.position.y = 4.4;
      deck.castShadow = true;
      tw.add(deck);
      for (let side = 0; side < 4; side++) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.92, 0.22), logTimberMat);
        const a = (side * Math.PI) / 2;
        wall.position.set(Math.sin(a) * 1.6, 4.95, Math.cos(a) * 1.6);
        wall.rotation.y = a;
        tw.add(wall);
      }
      // Corner upper roof posts + slanted rustic watch-roof
      for (const sx of [-1.3, 1.3]) {
        for (const sz of [-1.3, 1.3]) {
          const upPost = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.2, 6), darkLogMat);
          upPost.position.set(sx, 6.0, sz);
          tw.add(upPost);
        }
      }
      const roof = new THREE.Mesh(new THREE.ConeGeometry(3.1, 1.75, 4), fortRoofMat);
      roof.rotation.y = Math.PI / 4;
      roof.position.y = 7.75;
      roof.castShadow = true;
      tw.add(roof);
      // Blazing War Fire-Brazier perched on front-right parapet
      const brazier = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.28, 0.42, 8), fortIronMat);
      brazier.position.set(1.45, 5.45, 1.45);
      const tFlame = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), fortFlameMat);
      tFlame.scale.set(0.95, 1.55, 0.95);
      tFlame.position.set(1.45, 5.95, 1.45);
      this.owFortressFlames.push({ mesh: tFlame, baseY: 5.95, phase: phaseOffset });
      // Warm hanging lantern inside watchtower roof canopy
      const towerLan = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), fortLanternMat);
      towerLan.scale.set(0.88, 1.25, 0.88);
      towerLan.position.set(0, 6.25, 0);
      tw.add(brazier, tFlame, towerLan);
      // Wooden access ladder leaning against tower
      for (const lx of [-0.32, 0.32]) {
        const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.9, 5), logTimberMat);
        rail.position.set(lx, 2.2, 1.9);
        rail.rotation.x = -0.24;
        tw.add(rail);
      }
      ow.add(tw);
      this.openWorldObstacles.push({ x: tx, z: tz, r: 1.7 });
    };
    buildWatchtower(-31.5, -38.5, 0.32, 0.5);
    buildWatchtower(-44.5, -31.0, 0.22, 2.1);

    // 4B-4. Two Mountain Stronghold Wooden Lodges (聚义厅木屋 & 哨营木屋)
    const hallPlaqueMat = new THREE.MeshStandardMaterial({
      map: makeLandmarkPlaque('聚义厅', '#2d180e', '#d69844', '#ffe5a8'),
      emissive: new THREE.Color('#5a300c'),
      emissiveIntensity: 0.65,
      roughness: 0.52,
    });
    const buildMountainLodge = (
      lx: number,
      lz: number,
      rotY: number,
      width: number,
      depth: number,
      height: number,
      withPlaque: boolean,
      obsRadius: number,
    ) => {
      const lg = new THREE.Group();
      lg.position.set(lx, -0.18, lz);
      lg.rotation.y = rotY;
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(width + 1.0, 0.42, depth + 1.4), lanternStoneMat);
      plinth.position.y = 0.21;
      const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), logTimberMat);
      body.position.y = 0.42 + height * 0.5;
      body.castShadow = true;
      body.receiveShadow = true;
      // Glowing warm interior doorway
      const door = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 2.3, 0.14),
        new THREE.MeshStandardMaterial({
          color: '#ffae4c',
          emissive: new THREE.Color('#cc5c14'),
          emissiveIntensity: 0.85,
          roughness: 0.6,
        }),
      );
      door.position.set(0, 1.56, depth * 0.5 + 0.04);
      // Front veranda timber pillars + hanging red lanterns
      for (const sx of [-width * 0.44, -width * 0.16, width * 0.16, width * 0.44]) {
        const vp = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, height, 7), darkLogMat);
        vp.position.set(sx, 0.42 + height * 0.5, depth * 0.5 + 0.65);
        lg.add(vp);
      }
      for (const sgn of [-1, 1]) {
        const lan = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), fortFlameMat);
        lan.scale.set(0.85, 1.25, 0.85);
        lan.position.set(sgn * (width * 0.26), height - 0.1, depth * 0.5 + 0.65);
        lg.add(lan);
      }
      // Pitched mountain-stronghold gable roof with crossed roof-beam horns
      const roofGeo = new THREE.CylinderGeometry(0.12, Math.max(width, depth) * 0.78, 2.35, 4);
      const roof = new THREE.Mesh(roofGeo, fortRoofMat);
      roof.rotation.y = Math.PI / 4;
      roof.scale.set(width / Math.max(width, depth) * 1.18, 1, depth / Math.max(width, depth) * 1.28);
      roof.position.y = 0.42 + height + 1.05;
      roof.castShadow = true;
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(width + 1.4, 0.26, 0.32), darkLogMat);
      ridge.position.y = 0.42 + height + 2.12;
      lg.add(plinth, body, door, roof, ridge);
      if (withPlaque) {
        const plq = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.88, 0.16), hallPlaqueMat);
        plq.position.set(0, 0.42 + height - 0.18, depth * 0.5 + 0.72);
        lg.add(plq);
      }
      ow.add(lg);
      this.openWorldObstacles.push({ x: lx, z: lz, r: obsRadius });
    };
    buildMountainLodge(-55, -58, 0, 7.6, 4.6, 3.6, true, 3.1); // 聚义厅
    buildMountainLodge(-61, -39, Math.PI / 2, 5.4, 3.8, 3.1, false, 2.4); // 哨营木屋

    // 4B-5. Six Fluttering Crimson-Black Fortress Banners (黑风寨旗)
    const bannerPoleGeo = new THREE.CylinderGeometry(0.07, 0.1, 6.0, 6);
    const bannerClothGeo = new THREE.PlaneGeometry(1.15, 2.35);
    const bannerSpecs: Array<[number, number, number]> = [
      [-33.5, -32.2, 0.4],
      [-40.5, -36.0, -0.3],
      [-51.2, -55.2, 0.15],
      [-58.8, -55.2, -0.15],
      [-57.5, -34.5, 0.6],
      [-32.5, -45.5, -0.5],
    ];
    bannerSpecs.forEach(([bx, bz, baseRot], idx) => {
      const bg = new THREE.Group();
      bg.position.set(bx, -0.18, bz);
      const pole = new THREE.Mesh(bannerPoleGeo, darkLogMat);
      pole.position.y = 3.0;
      const cross = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.35, 5), darkLogMat);
      cross.rotation.z = Math.PI / 2;
      cross.position.set(0.55, 5.45, 0);
      const cloth = new THREE.Mesh(bannerClothGeo, fortBannerMat);
      cloth.position.set(0.58, 4.25, 0);
      cloth.rotation.y = baseRot;
      const trim = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.14, 0.04), heavenlyGoldMat);
      trim.position.set(0.58, 5.38, 0);
      bg.add(pole, cross, cloth, trim);
      ow.add(bg);
      this.owFortressBanners.push({ mesh: cloth, baseRotY: baseRot, phase: idx * 1.15 });
    });

    // 4B-6. Stronghold Bonfire (寨心篝火), Weapon Racks (兵器架) & Wine-Jar / Crate Clusters
    const bonfire = new THREE.Group();
    bonfire.position.set(-47, -0.18, -40);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), pebbleMat);
      st.position.set(Math.cos(a) * 0.95, 0.16, Math.sin(a) * 0.95);
      bonfire.add(st);
    }
    for (let i = 0; i < 3; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 1.5, 6), darkLogMat);
      log.position.y = 0.22;
      log.rotation.z = Math.PI / 2 - 0.18;
      log.rotation.y = (i / 3) * Math.PI;
      bonfire.add(log);
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.26 - i * 0.04, 1.05 + i * 0.18, 5), fortFlameMat);
      fl.position.set((i - 1) * 0.22, 0.72, (i % 2 === 0 ? 1 : -1) * 0.14);
      this.owFortressFlames.push({ mesh: fl, baseY: 0.72, phase: i * 1.9 + 3.0 });
      bonfire.add(fl);
    }
    ow.add(bonfire);
    this.openWorldObstacles.push({ x: -47, z: -40, r: 1.0 });

    const jarMat = new THREE.MeshStandardMaterial({ color: '#7d4c32', roughness: 0.72 });
    const buriedBladeMat = new THREE.MeshStandardMaterial({ color: '#94a2b8', roughness: 0.34, metalness: 0.82 });
    const buriedGuardMat = new THREE.MeshStandardMaterial({ color: '#d8b460', roughness: 0.32, metalness: 0.86 });
    // Weapon racks & wine-jar supply clusters tucked cleanly beside lodges & walls
    for (const [wx, wz, rY] of [[-50.5, -54.5, 0.1], [-58.5, -43.5, 1.4], [-34.5, -49.0, -1.2]]) {
      const rack = new THREE.Group();
      rack.position.set(wx, -0.18, wz);
      rack.rotation.y = rY;
      for (const sgn of [-1, 1]) {
        const up = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.75, 0.12), darkLogMat);
        up.position.set(sgn * 0.85, 0.88, 0);
        rack.add(up);
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 0.1), darkLogMat);
      bar.position.y = 1.35;
      rack.add(bar);
      for (let k = -1; k <= 1; k++) {
        const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 2.35, 5), logTimberMat);
        spear.position.set(k * 0.44, 1.15, 0.08);
        spear.rotation.x = 0.14;
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.42, 4), buriedBladeMat);
        tip.position.set(k * 0.44, 2.42, 0.24);
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.1, 6), buriedGuardMat);
        collar.position.set(k * 0.44, 2.18, 0.21);
        rack.add(spear, collar, tip);
      }
      ow.add(rack);
    }
    for (const [jx, jz] of [[-58.5, -53.2], [-57.5, -36.5], [-47.0, -32.8]]) {
      const jg = new THREE.Group();
      jg.position.set(jx, -0.18, jz);
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.82, 0.95), logTimberMat);
      crate.position.set(-0.45, 0.41, 0);
      const jar1 = new THREE.Mesh(new THREE.SphereGeometry(0.36, 8, 7), jarMat);
      jar1.scale.set(0.92, 1.18, 0.92);
      jar1.position.set(0.38, 0.42, 0.18);
      const jar2 = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 7), jarMat);
      jar2.scale.set(0.92, 1.15, 0.92);
      jar2.position.set(0.18, 0.38, -0.42);
      jg.add(crate, jar1, jar2);
      ow.add(jg);
    }

    // =========================================================================
    // 4C. 南冥 · 赤焰炼器熔谷 (Basalt Spires, Iron Forging Causeway & Ancient Forging Cauldron)
    // =========================================================================
    const basaltMat = new THREE.MeshStandardMaterial({
      map: carvedTex,
      color: '#2b1e20',
      emissive: new THREE.Color('#4a1206'),
      emissiveIntensity: 0.45,
      roughness: 0.9,
      flatShading: true,
    });
    for (const [vx, vz, vh] of [[-31, 34, 4.4], [-63, 36, 5.2], [-62, 55, 4.8], [-36, 63, 4.2]]) {
      const spire = new THREE.Mesh(new THREE.ConeGeometry(1.45, vh, 6), basaltMat);
      spire.position.set(vx, vh * 0.46 - 0.2, vz);
      spire.rotation.y = vx * 0.2;
      spire.castShadow = true;
      ow.add(spire);
      this.openWorldObstacles.push({ x: vx, z: vz, r: 1.15 });
    }

    // 玄铁炼器栈桥 (Forged Iron Bridge overlooking the Lava Pool from NE shore)
    const ironBridge = new THREE.Group();
    ironBridge.position.set(-36.5, -0.04, 35.5);
    ironBridge.rotation.y = Math.PI * 0.25;
    const ironDeck = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.22, 9.2), fortIronMat);
    ironDeck.receiveShadow = true;
    ironBridge.add(ironDeck);
    for (const sx of [-1.55, 1.55]) {
      for (const sz of [-3.6, 0, 3.6]) {
        const stanchion = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.25, 0.24), fortIronMat);
        stanchion.position.set(sx, 0.62, sz);
        ironBridge.add(stanchion);
      }
      const chainBar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 7.6), fortIronMat);
      chainBar.position.set(sx, 1.1, 0);
      ironBridge.add(chainBar);
    }
    ow.add(ironBridge);

    // 赤焰古铸剑鼎 (Monumental Bronze Forging Cauldron) at (-42, 61.5)
    const bronzeCauldronMat = new THREE.MeshStandardMaterial({
      color: '#6e5234',
      emissive: new THREE.Color('#421c08'),
      emissiveIntensity: 0.35,
      roughness: 0.42,
      metalness: 0.72,
    });
    const cauldron = new THREE.Group();
    cauldron.position.set(-42, -0.18, 61.5);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 1.65, 6), bronzeCauldronMat);
      leg.position.set(Math.cos(a) * 1.45, 0.82, Math.sin(a) * 1.45);
      cauldron.add(leg);
    }
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(2.35, 1.65, 2.0, 12), bronzeCauldronMat);
    bowl.position.y = 2.25;
    bowl.castShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.35, 0.18, 8, 24), heavenlyGoldMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 3.25;
    const magmaCore = new THREE.Mesh(new THREE.OctahedronGeometry(1.15, 1), fortFlameMat);
    magmaCore.scale.set(1.25, 0.9, 1.25);
    magmaCore.position.y = 3.55;
    this.owFortressFlames.push({ mesh: magmaCore, baseY: 3.55, phase: 4.2 });
    cauldron.add(bowl, rim, magmaCore);
    ow.add(cauldron);
    this.openWorldObstacles.push({ x: -42, z: 61.5, r: 2.35 });

    // Scattered alpine mossy boulders framing the expanded Kyushu perimeter
    const boulderMat = new THREE.MeshStandardMaterial({ map: carvedTex, color: '#42545a', roughness: 0.9, flatShading: true });
    for (const [rx, rz, sc] of [
      [-24, -68, 1.4], [24, -68, 1.5], [70, -18, 1.45], [71, 20, 1.55],
      [-70, -18, 1.45], [-70, 20, 1.35], [-20, 70, 1.5], [20, 69, 1.35],
    ]) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1, 1), boulderMat);
      rock.scale.set(sc * 1.25, sc * 0.78, sc);
      rock.position.set(rx, 0.24, rz);
      rock.castShadow = true;
      rock.receiveShadow = true;
      ow.add(rock);
    }

    // =========================================================================
    // 4D. 九霄 · 凌霄天庭 (White-Jade Nantianmen Gate, Golden Pavilion Hall, Dragon Pillars & Cloud Sea!)
    // =========================================================================
    const nantianPlaqueMat = new THREE.MeshStandardMaterial({
      map: makeLandmarkPlaque('南天门', '#18365c', '#f0ca68', '#fff4c8'),
      emissive: new THREE.Color('#302206'),
      emissiveIntensity: 0.42,
      roughness: 0.34,
    });
    const lingxiaoPlaqueMat = new THREE.MeshStandardMaterial({
      map: makeLandmarkPlaque('凌霄宝殿', '#7c1814', '#f4d072', '#fff6d0'),
      emissive: new THREE.Color('#3a2006'),
      emissiveIntensity: 0.45,
      roughness: 0.34,
    });

    // Helper: Imperial upturned curved glazed eaves (琉璃飞檐)
    const buildImperialEaves = (
      parent: THREE.Group,
      w: number,
      d: number,
      y: number,
      x: number,
      z: number,
      roofMat: THREE.MeshStandardMaterial,
    ) => {
      const rg = new THREE.Group();
      rg.position.set(x, y, z);
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, 0.38, d), roofMat);
      body.castShadow = true;
      const slope = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.66, 1.25, 4), roofMat);
      slope.rotation.y = Math.PI / 4;
      slope.scale.set(w / Math.max(w, d) * 1.05, 1, d / Math.max(w, d) * 1.05);
      slope.position.y = 0.72;
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(w + 0.65, 0.24, 0.34), heavenlyGoldMat);
      ridge.position.y = 1.32;
      rg.add(body, slope, ridge);
      // Four sweeping upturned winged eave tips
      const wingGeo = new THREE.ConeGeometry(0.38, 1.25, 4);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const wing = new THREE.Mesh(wingGeo, heavenlyGoldMat);
          wing.position.set(sx * (w * 0.5 + 0.24), 0.36, sz * (d * 0.5 + 0.12));
          wing.rotation.z = sx * -1.08;
          wing.rotation.x = sz * 0.42;
          rg.add(wing);
        }
      }
      parent.add(rg);
    };

    // 4D-1. Monumental 白玉南天门 (White-Jade Triple-Arch South Gate) at (35, 22.5) facing South (+Z)
    // Positioned right ahead-right of wp_star (31, 31.4) for an unforgettable Heavenly Court arrival!
    const nantianmen = new THREE.Group();
    nantianmen.position.set(35, -0.18, 22.5);
    // Ascending white-marble cloud stairs leading through 南天门
    for (let si = 0; si < 5; si++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(11.6 - si * 0.4, 0.08, 0.95), whiteJadeMat);
      step.position.set(0, 0.04 + si * 0.015, 3.6 - si * 0.9);
      step.receiveShadow = true;
      nantianmen.add(step);
    }
    const ntPillarXs = [-7.2, -3.5, 3.5, 7.2]; // Wide 7.0m center span + 3.7m side arches!
    const dragonCollarGeo = new THREE.TorusGeometry(0.5, 0.09, 8, 18);
    ntPillarXs.forEach((px, idx) => {
      const inner = idx === 1 || idx === 2;
      const h = inner ? 7.6 : 5.8;
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.94, 0.85, 8), whiteJadeMat);
      ped.position.set(px, 0.42, 0);
      ped.castShadow = true;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, h, 12), whiteJadeMat);
      shaft.position.set(px, 0.85 + h * 0.5, 0);
      shaft.castShadow = true;
      nantianmen.add(ped, shaft);
      // Coiled gilded dragon rings climbing each white-jade column
      for (let ri = 0; ri < (inner ? 5 : 3); ri++) {
        const ring = new THREE.Mesh(dragonCollarGeo, heavenlyGoldMat);
        ring.rotation.x = Math.PI / 2 + 0.16;
        ring.rotation.y = ri * 0.8;
        ring.position.set(px, 2.0 + ri * 1.15, 0);
        nantianmen.add(ring);
      }
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.45, 1.25), imperialCrimsonMat);
      cap.position.set(px, 0.85 + h + 0.2, 0);
      nantianmen.add(cap);
      this.openWorldObstacles.push({ x: 35 + px, z: 22.5, r: 0.72 });
    });
    const ntLowerBeam = new THREE.Mesh(new THREE.BoxGeometry(15.6, 0.68, 0.92), imperialCrimsonMat);
    ntLowerBeam.position.set(0, 6.25, 0);
    const ntUpperBeam = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.62, 0.96), imperialCrimsonMat);
    ntUpperBeam.position.set(0, 8.15, 0);
    const ntPlaque = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.22, 0.24), nantianPlaqueMat);
    ntPlaque.position.set(0, 7.22, 0.5);
    nantianmen.add(ntLowerBeam, ntUpperBeam, ntPlaque);
    buildImperialEaves(nantianmen, 9.4, 2.9, 8.85, 0, 0, glazedRoofGoldMat);
    buildImperialEaves(nantianmen, 4.4, 2.2, 6.85, -5.4, 0, glazedRoofGoldMat);
    buildImperialEaves(nantianmen, 4.4, 2.2, 6.85, 5.4, 0, glazedRoofGoldMat);
    ow.add(nantianmen);

    // 4D-2. Grand 凌霄宝殿 (Golden Celestial Pagoda Pavilion Hall) at (56, 35) facing South (+Z)
    const palace = new THREE.Group();
    palace.position.set(56, -0.18, 35);
    const pPlinth1 = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.36, 8.2), whiteJadeMat);
    pPlinth1.position.y = 0.18;
    const pPlinth2 = new THREE.Mesh(new THREE.BoxGeometry(10.8, 0.32, 6.8), whiteJadeMat);
    pPlinth2.position.y = 0.52;
    const pCore = new THREE.Mesh(new THREE.BoxGeometry(8.4, 4.6, 4.6), imperialCrimsonMat);
    pCore.position.y = 2.95;
    pCore.castShadow = true;
    // Glowing gilded heavenly temple doorway & lattice windows
    const pDoor = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 3.2, 0.18),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 1.55, 0.8) }),
    );
    pDoor.position.set(0, 2.25, 2.34);
    palace.add(pPlinth1, pPlinth2, pCore, pDoor);
    // 8 Vermilion & Gold Palace Columns around veranda
    for (const cx of [-4.6, -1.8, 1.8, 4.6]) {
      for (const cz of [-2.85, 2.85]) {
        const pCol = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 4.9, 10), imperialCrimsonMat);
        pCol.position.set(cx, 3.1, cz);
        pCol.castShadow = true;
        const pRing = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.05, 6, 14), heavenlyGoldMat);
        pRing.rotation.x = Math.PI / 2;
        pRing.position.set(cx, 5.1, cz);
        palace.add(pCol, pRing);
      }
    }
    const pPlaque = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.15, 0.22), lingxiaoPlaqueMat);
    pPlaque.position.set(0, 4.75, 2.95);
    palace.add(pPlaque);
    // Double-tiered imperial golden pagoda roof + lotus spire reaching y = 11.8m
    buildImperialEaves(palace, 12.0, 7.6, 5.75, 0, 0, glazedRoofGoldMat);
    const upperHall = new THREE.Mesh(new THREE.BoxGeometry(6.8, 2.2, 4.2), imperialCrimsonMat);
    upperHall.position.y = 7.55;
    palace.add(upperHall);
    buildImperialEaves(palace, 8.6, 5.4, 8.8, 0, 0, glazedRoofGoldMat);
    const spireBall = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), heavenlyGoldMat);
    spireBall.scale.set(0.85, 1.85, 0.85);
    spireBall.position.y = 11.15;
    palace.add(spireBall);
    ow.add(palace);
    this.openWorldObstacles.push({ x: 56, z: 35, r: 3.3 });

    // 4D-3. Four Gilded Heavenly Dragon Columns framing the Celestial Terrace
    const starCrystalMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.85, 2.2) });
    for (const [sx, sz] of [
      [39, 44], [63, 47], [60, 58], [42, 57],
    ]) {
      const cg = new THREE.Group();
      cg.position.set(sx, -0.18, sz);
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 1.12, 0.5, 8), whiteJadeMat);
      ped.position.y = 0.25;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.56, 5.8, 10), whiteJadeMat);
      col.position.y = 3.2;
      col.castShadow = true;
      const goldBand = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.08, 8, 18), heavenlyGoldMat);
      goldBand.rotation.x = Math.PI / 2;
      goldBand.position.y = 3.4;
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.055, 8, 24), heavenlyGoldMat);
      halo.position.y = 6.35;
      this.owCelestialHalos.push(halo);
      const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.38, 0), starCrystalMat);
      finial.scale.set(0.9, 1.5, 0.9);
      finial.position.y = 6.35;
      cg.add(ped, col, goldBand, halo, finial);
      ow.add(cg);
      this.openWorldObstacles.push({ x: sx, z: sz, r: 0.85 });
    }

    // 4D-4. Billowing White-Gold Celestial Cloud Sea Cushions (九霄祥云) floating around 南天门 & 凌霄天庭
    const cloudMat = new THREE.MeshStandardMaterial({
      color: '#fff9ed',
      emissive: new THREE.Color('#6b5e42'),
      emissiveIntensity: 0.34,
      roughness: 0.82,
      transparent: true,
      opacity: 0.88,
    });
    const cloudPuffGeo = new THREE.DodecahedronGeometry(1.0, 1);
    const cloudCoords: Array<[number, number, number, number]> = [
      [25.5, 0.45, 22.0, 2.5], [44.5, 0.55, 22.5, 2.7],
      [28.5, 0.25, 27.0, 1.9], [42.0, 0.35, 27.5, 2.1],
      [33.0, 0.4, 38.5, 2.6], [30.5, 0.65, 48.0, 3.0],
      [36.5, 0.55, 62.5, 3.1], [49.5, 0.65, 66.0, 3.3],
      [62.5, 0.7, 64.5, 3.2], [70.0, 0.65, 53.0, 3.4],
      [70.0, 0.55, 40.0, 3.2], [65.5, 0.6, 29.0, 2.9],
      [54.5, 0.45, 24.5, 2.8], [46.5, 0.35, 25.5, 2.3],
      [24.0, 0.55, 41.0, 2.4], [58.0, 0.65, 67.5, 2.9],
      [71.5, 0.5, 46.5, 2.8], [39.0, 0.4, 65.5, 2.6],
    ];
    cloudCoords.forEach(([cx, cy, cz, sc], idx) => {
      const clGroup = new THREE.Group();
      clGroup.position.set(cx, cy, cz);
      const p0 = new THREE.Mesh(cloudPuffGeo, cloudMat);
      p0.scale.set(sc * 1.35, sc * 0.46, sc * 1.05);
      const p1 = new THREE.Mesh(cloudPuffGeo, cloudMat);
      p1.scale.set(sc * 0.92, sc * 0.42, sc * 0.84);
      p1.position.set(sc * 0.82, 0.14, sc * 0.24);
      const p2 = new THREE.Mesh(cloudPuffGeo, cloudMat);
      p2.scale.set(sc * 0.85, sc * 0.38, sc * 0.78);
      p2.position.set(-sc * 0.76, 0.1, -sc * 0.22);
      clGroup.add(p0, p1, p2);
      ow.add(clGroup);
      this.owCelestialClouds.push({ mesh: clGroup, baseY: cy, phase: idx * 0.65 });
    });

    // 4b. Sculpted 6th Landmark: 北溟 · 幽冥古地窟入口 (Carved Stone Cavern Archway, Steps, Jade Lanterns & Rune Seal Altar)
    const cryptStoneMat = new THREE.MeshStandardMaterial({
      map: carvedTex,
      color: '#344150',
      emissive: new THREE.Color('#091820'),
      emissiveIntensity: 0.32,
      roughness: 0.84,
      metalness: 0.14,
    });
    const cryptRoofMat = new THREE.MeshStandardMaterial({
      color: '#182430',
      roughness: 0.62,
      metalness: 0.24,
    });
    const cryptRuneMat = new THREE.MeshStandardMaterial({
      color: '#48f0d8',
      emissive: new THREE.Color('#20d8c0'),
      emissiveIntensity: 1.4,
      roughness: 0.24,
      metalness: 0.4,
    });

    // Stepped ancient stone descent/approach leading into the cavern mouth
    for (let si = 0; si < 4; si++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(7.8 - si * 0.25, 0.09, 0.95), cryptStoneMat);
      step.position.set(0, -0.14 + si * 0.02, -49.6 - si * 1.05);
      step.receiveShadow = true;
      ow.add(step);
    }

    // Monumental Carved Cavern Archway at z = -54 (wide 9.6m pillar spacing so hero & bosses glide cleanly through)
    const cryptGate = new THREE.Group();
    cryptGate.position.set(0, 0, -54);
    for (const sgn of [-1, 1]) {
      const px = 4.8 * sgn;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 1.16, 1.1, 8), cryptStoneMat);
      base.position.set(px, 0.55, 0);
      base.castShadow = true;
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.42, 6.1, 1.48), cryptStoneMat);
      pillar.position.set(px, 3.6, 0);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      const runeStrip = new THREE.Mesh(new THREE.BoxGeometry(0.22, 4.4, 1.56), cryptRuneMat);
      runeStrip.position.set(px - sgn * 0.22, 3.55, 0);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.48, 1.92), cryptRoofMat);
      cap.position.set(px, 6.75, 0);
      cryptGate.add(base, pillar, runeStrip, cap);
      this.openWorldObstacles.push({ x: px, z: -54, r: 1.02 });
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(12.4, 1.05, 1.85), cryptStoneMat);
    lintel.position.set(0, 7.15, 0);
    lintel.castShadow = true;
    const eaves = new THREE.Mesh(new THREE.BoxGeometry(14.0, 0.42, 2.75), cryptRoofMat);
    eaves.position.set(0, 7.82, 0);
    const upperRidge = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.55, 1.4), cryptRoofMat);
    upperRidge.position.set(0, 8.26, 0);
    const sealKeystone = new THREE.Mesh(new THREE.OctahedronGeometry(0.68, 0), cryptRuneMat);
    sealKeystone.scale.set(1.0, 1.45, 0.45);
    sealKeystone.position.set(0, 6.25, 0.85);
    const sealHalo = new THREE.Mesh(
      new THREE.TorusGeometry(0.98, 0.06, 8, 24),
      new THREE.MeshBasicMaterial({ color: '#58ffe8', transparent: true, opacity: 0.82 }),
    );
    sealHalo.position.set(0, 6.25, 0.88);
    cryptGate.add(lintel, eaves, upperRidge, sealKeystone, sealHalo);
    ow.add(cryptGate);

    // Flanking chasm rock buttresses & rear sealed subterranean cavern portal wall
    for (const [cx, cz, sx, sy, sz] of [
      [-10.8, -54.5, 4.2, 7.6, 4.0], [10.8, -54.5, 4.2, 7.6, 4.0],
      [-14.5, -60.5, 4.8, 9.2, 5.2], [14.5, -60.5, 4.8, 9.2, 5.2],
      [-12.2, -68.0, 4.6, 8.4, 4.8], [12.2, -68.0, 4.6, 8.4, 4.8],
      [-6.8, -73.0, 5.2, 9.8, 4.4], [6.8, -73.0, 5.2, 9.8, 4.4],
      [0, -74.6, 7.6, 10.6, 3.6],
    ]) {
      const crag = new THREE.Mesh(rimPeakGeo, rimPeakMat);
      crag.position.set(cx, sy * 0.42 - 0.5, cz);
      crag.scale.set(sx, sy, sz);
      crag.rotation.y = cx * 0.14;
      crag.castShadow = true;
      ow.add(crag);
      if (Math.abs(cx) >= 9.5 && cz > -70) {
        this.openWorldObstacles.push({ x: cx, z: cz, r: Math.min(3.0, sx * 0.62) });
      }
    }

    // Glowing subterranean cavern portal fissure recessed into the north wall (z = -72.2)
    const fissureGlow = new THREE.Mesh(
      new THREE.CircleGeometry(2.7, 20),
      new THREE.MeshBasicMaterial({
        color: '#2af2dc',
        transparent: true,
        opacity: 0.36,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    fissureGlow.scale.set(0.85, 1.55, 1);
    fissureGlow.position.set(0, 3.4, -71.8);
    ow.add(fissureGlow);

    // Four Jade Crypt Lanterns flanking the steps & inner courtyard
    const cryptFlameGeo = new THREE.OctahedronGeometry(0.26, 0);
    for (const [lx, lz] of [[-3.9, -50.2], [3.9, -50.2], [-6.6, -58.5], [6.6, -58.5]]) {
      const lg = new THREE.Group();
      lg.position.set(lx, 0, lz);
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.46, 1.55, 6), cryptStoneMat);
      ped.position.y = 0.78;
      ped.castShadow = true;
      const flame = new THREE.Mesh(cryptFlameGeo, jadeLanternGlowMat);
      flame.position.y = 1.92;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.46, 6), cryptRoofMat);
      cap.position.y = 2.48;
      lg.add(ped, flame, cap);
      ow.add(lg);
      this.cryptFlames.push(flame);
      this.openWorldObstacles.push({ x: lx, z: lz, r: 0.52 });
    }

    // Glowing Rune Seal Boss Altar at (0, 0, -61) + 4 Corner Rune Obelisks
    const cryptAltarDais = new THREE.Mesh(
      new THREE.CylinderGeometry(5.6, 6.2, 0.14, 20),
      cryptStoneMat,
    );
    cryptAltarDais.position.set(0, -0.06, -61);
    cryptAltarDais.receiveShadow = true;
    ow.add(cryptAltarDais);

    const cryptRuneRingMat = new THREE.MeshBasicMaterial({
      color: '#46f8e2',
      transparent: true,
      opacity: 0.76,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const outerSeal = new THREE.Mesh(new THREE.RingGeometry(5.05, 5.5, 36), cryptRuneRingMat);
    outerSeal.rotation.x = -Math.PI / 2;
    outerSeal.position.set(0, 0.045, -61);
    const innerSeal = new THREE.Mesh(
      new THREE.RingGeometry(2.65, 3.05, 8),
      new THREE.MeshBasicMaterial({
        color: '#9c78ff',
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    innerSeal.rotation.x = -Math.PI / 2;
    innerSeal.position.set(0, 0.055, -61);
    this.cryptRuneRing = outerSeal;
    this.cryptInnerSigil = innerSeal;
    ow.add(outerSeal, innerSeal);

    for (const [ox, oz] of [[-8.2, -57.0], [8.2, -57.0], [-8.2, -65.0], [8.2, -65.0]]) {
      const ob = new THREE.Group();
      ob.position.set(ox, 0, oz);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.56, 3.6, 4), cryptStoneMat);
      shaft.position.y = 1.8;
      shaft.rotation.y = Math.PI / 4;
      shaft.castShadow = true;
      const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), cryptRuneMat);
      tip.scale.set(0.85, 1.4, 0.85);
      tip.position.y = 3.95;
      ob.add(shaft, tip);
      ow.add(ob);
      this.openWorldObstacles.push({ x: ox, z: oz, r: 0.68 });
    }

    // 5. Five Teleport Waypoint Beacons (传送锚点)
    const wpPedMat = new THREE.MeshStandardMaterial({ map: carvedTex, color: '#9ab4c4', roughness: 0.65 });
    for (const wp of WORLD_WAYPOINTS) {
      const g = new THREE.Group();
      g.position.set(wp.x, 0, wp.z);
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.25, 0.38, 8), wpPedMat);
      ped.position.y = 0.19;
      ped.castShadow = true;
      const mat = new THREE.MeshBasicMaterial({ color: '#ff5c6c', transparent: true, opacity: 0.85 });
      const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), mat);
      orb.position.y = 1.65;
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.38, 11.0, 10, 1, true),
        new THREE.MeshBasicMaterial({
          color: '#4cf8e8',
          transparent: true,
          opacity: 0.28,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      beam.position.y = 5.6;
      beam.visible = false;
      g.add(ped, orb, beam);
      ow.add(g);
      this.waypointVisuals.set(wp.id, { orb, beam, mat, lit: false });
      this.openWorldObstacles.push({ x: wp.x, z: wp.z, r: 0.95 });
    }

    // 6. Eight Wild Treasure Chests (野外宝箱)
    const boxWoodMat = new THREE.MeshStandardMaterial({ color: '#5c331e', roughness: 0.68, metalness: 0.18 });
    const boxGoldMat = new THREE.MeshStandardMaterial({ color: '#dfc075', roughness: 0.32, metalness: 0.85 });
    for (const ch of WORLD_CHESTS) {
      const cg = new THREE.Group();
      cg.position.set(ch.x, 0, ch.z);
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.56, 0.72), boxWoodMat);
      base.position.y = 0.28;
      base.castShadow = true;
      const band = new THREE.Mesh(new THREE.BoxGeometry(1.09, 0.1, 0.76), boxGoldMat);
      band.position.y = 0.54;
      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.22, 0.74), boxGoldMat);
      lid.position.y = 0.66;
      const glowCol =
        ch.rarity === 'legendary'
          ? '#ffbe48'
          : ch.rarity === 'epic'
            ? '#c86bff'
            : ch.rarity === 'rare'
              ? '#4ee8dc'
              : '#ffe384';
      const glowMat = new THREE.MeshBasicMaterial({
        color: glowCol,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.65, 2.2, 12, 1, true), glowMat);
      glow.position.y = 1.1;
      cg.add(base, band, lid, glow);
      ow.add(cg);
      this.chestVisuals.set(ch.id, { lid, glow, mat: glowMat, opened: false });
      this.openWorldObstacles.push({ x: ch.x, z: ch.z, r: 0.72 });
    }

    // 7. Eight Aerial Sky Spirit Orbs (九州灵瞳 · 需御剑采集)
    const orbCoreMat = new THREE.MeshStandardMaterial({
      color: '#5cf5e6',
      emissive: new THREE.Color('#2bd8d0'),
      emissiveIntensity: 1.55,
      roughness: 0.16,
      metalness: 0.65,
    });
    const orbRingMat = new THREE.MeshBasicMaterial({
      color: '#ffe384',
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const orbBeamMat = new THREE.MeshBasicMaterial({
      color: '#56ffea',
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    for (const orb of WORLD_SPIRIT_ORBS) {
      const og = new THREE.Group();
      og.position.set(orb.x, 0, orb.z);
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), orbCoreMat);
      core.position.y = orb.y;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.56, 0.72, 24), orbRingMat);
      ring.position.y = orb.y;
      ring.rotation.x = Math.PI / 2;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.24, orb.y + 1.2, 8, 1, true), orbBeamMat);
      beam.position.y = (orb.y + 1.2) * 0.5;
      og.add(core, ring, beam);
      ow.add(og);
      this.spiritOrbVisuals.set(orb.id, { group: og, core, ring, baseY: orb.y, collected: false });
    }

    // 8. Fourteen Glowing 3D Harvestable Herb & Ore Nodes (WORLD_HERB_NODES)
    const herbMoundMat = new THREE.MeshStandardMaterial({ color: '#394c38', roughness: 0.92 });
    const lingzhiStemMat = new THREE.MeshStandardMaterial({ color: '#8f5e36', roughness: 0.72 });
    const lingzhiCapMat = new THREE.MeshStandardMaterial({
      color: '#34d890',
      emissive: new THREE.Color('#18a868'),
      emissiveIntensity: 0.95,
      roughness: 0.32,
      metalness: 0.14,
    });
    const lingzhiRimMat = new THREE.MeshBasicMaterial({ color: '#a8ffd8' });

    const lotusBaseMat = new THREE.MeshStandardMaterial({ color: '#c4e4f4', roughness: 0.45 });
    const lotusPetalMat = new THREE.MeshStandardMaterial({
      color: '#9cf0ff',
      emissive: new THREE.Color('#38b8e8'),
      emissiveIntensity: 1.05,
      roughness: 0.22,
      metalness: 0.18,
    });
    const lotusCoreMat = new THREE.MeshBasicMaterial({ color: '#fff2a6' });

    const oreRockMat = new THREE.MeshStandardMaterial({ color: '#2c2224', roughness: 0.88, flatShading: true });
    const oreVeinMat = new THREE.MeshStandardMaterial({
      color: '#ff7a36',
      emissive: new THREE.Color('#e84a12'),
      emissiveIntensity: 1.35,
      roughness: 0.28,
      metalness: 0.72,
    });

    const crystalBaseMat = new THREE.MeshStandardMaterial({ color: '#24223a', roughness: 0.84, flatShading: true });
    const crystalShardMat = new THREE.MeshStandardMaterial({
      color: '#c292ff',
      emissive: new THREE.Color('#7842e8'),
      emissiveIntensity: 1.25,
      roughness: 0.18,
      metalness: 0.45,
    });

    const herbRingGeo = new THREE.RingGeometry(0.68, 0.88, 24);
    const herbBeamGeo = new THREE.CylinderGeometry(0.12, 0.34, 2.6, 10, 1, true);
    const herbOrbGeo = new THREE.OctahedronGeometry(0.2, 0);

    WORLD_HERB_NODES.forEach((herb, idx) => {
      const hg = new THREE.Group();
      hg.position.set(herb.x, -0.16, herb.z);
      const coreWrap = new THREE.Group();
      let baseY = 1.05;

      if (herb.materialId === 'mat_lingzhi') {
        // 九叶灵芝: mossy soil base + 3 tiered glowing emerald Lingzhi mushroom umbrellas
        const mound = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.86, 0.22, 8), herbMoundMat);
        mound.position.y = 0.11;
        hg.add(mound);
        const capSpecs: Array<[number, number, number, number]> = [
          [0, 0.62, 0, 0.56],
          [-0.4, 0.44, 0.24, 0.38],
          [0.38, 0.48, -0.2, 0.42],
        ];
        for (const [cx, cy, cz, cr] of capSpecs) {
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, cy, 6), lingzhiStemMat);
          stem.position.set(cx, cy * 0.5 + 0.1, cz);
          const cap = new THREE.Mesh(new THREE.CylinderGeometry(cr, cr * 0.72, 0.14, 12), lingzhiCapMat);
          cap.scale.set(1.15, 0.85, 0.92);
          cap.position.set(cx, cy + 0.12, cz);
          const rim = new THREE.Mesh(new THREE.TorusGeometry(cr * 0.92, 0.028, 6, 16), lingzhiRimMat);
          rim.rotation.x = Math.PI / 2;
          rim.position.set(cx, cy + 0.16, cz);
          hg.add(stem, cap, rim);
        }
        const mote = new THREE.Mesh(herbOrbGeo, lingzhiRimMat);
        coreWrap.add(mote);
        baseY = 1.25;
      } else if (herb.materialId === 'mat_xuelian') {
        // 天山雪莲: frosted jade pedestal + two concentric rings of crystalline ice-lotus petals
        const ped = new THREE.Mesh(new THREE.DodecahedronGeometry(0.56, 1), lotusBaseMat);
        ped.scale.set(1.25, 0.42, 1.25);
        ped.position.y = 0.18;
        hg.add(ped);
        const petalGeo = new THREE.ConeGeometry(0.18, 0.68, 4);
        for (let tier = 0; tier < 2; tier++) {
          const count = tier === 0 ? 7 : 5;
          const r = tier === 0 ? 0.38 : 0.22;
          const tilt = tier === 0 ? 0.78 : 0.42;
          for (let pi = 0; pi < count; pi++) {
            const a = (pi / count) * Math.PI * 2 + tier * 0.4;
            const petal = new THREE.Mesh(petalGeo, lotusPetalMat);
            petal.position.set(Math.cos(a) * r, 0.46 + tier * 0.14, Math.sin(a) * r);
            petal.rotation.y = -a + Math.PI / 2;
            petal.rotation.x = tilt;
            hg.add(petal);
          }
        }
        const stamen = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), lotusCoreMat);
        coreWrap.add(stamen);
        baseY = 0.96;
      } else if (herb.materialId === 'mat_xuantie') {
        // 赤炎玄铁: dark volcanic ore boulder + jagged molten red-gold iron crystal spikes
        const base = new THREE.Mesh(new THREE.DodecahedronGeometry(0.68, 1), oreRockMat);
        base.scale.set(1.2, 0.68, 1.12);
        base.position.y = 0.34;
        hg.add(base);
        const spikeSpecs: Array<[number, number, number, number, number]> = [
          [0, 0.72, 0, 0.14, 1.1],
          [-0.36, 0.56, 0.26, -0.42, 0.85],
          [0.34, 0.58, -0.22, 0.38, 0.9],
          [0.12, 0.48, 0.36, 0.26, 0.75],
        ];
        for (const [sx, sy, sz, rz, sh] of spikeSpecs) {
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.2, sh, 5), oreVeinMat);
          spike.position.set(sx, sy, sz);
          spike.rotation.z = rz;
          spike.rotation.x = sz * 0.6;
          hg.add(spike);
        }
        const spark = new THREE.Mesh(herbOrbGeo, new THREE.MeshBasicMaterial({ color: '#ffae5c' }));
        coreWrap.add(spark);
        baseY = 1.48;
      } else {
        // 幽冥玄晶: dark slate cluster + tilted amethyst-cyan faceted spirit crystals
        const base = new THREE.Mesh(new THREE.DodecahedronGeometry(0.62, 0), crystalBaseMat);
        base.scale.set(1.2, 0.5, 1.15);
        base.position.y = 0.24;
        hg.add(base);
        const shardGeo = new THREE.CylinderGeometry(0.04, 0.2, 1.15, 6);
        for (let ci = 0; ci < 4; ci++) {
          const a = (ci / 4) * Math.PI * 2 + 0.35;
          const sh = new THREE.Mesh(shardGeo, crystalShardMat);
          sh.position.set(Math.cos(a) * 0.34, 0.68, Math.sin(a) * 0.34);
          sh.rotation.z = -Math.cos(a) * 0.36;
          sh.rotation.x = Math.sin(a) * 0.36;
          hg.add(sh);
        }
        const floatCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), crystalShardMat);
        floatCrystal.scale.set(0.85, 1.55, 0.85);
        coreWrap.add(floatCrystal);
        baseY = 1.42;
      }

      coreWrap.position.y = baseY;
      const ringMat = new THREE.MeshBasicMaterial({
        color: herb.accentHex,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(herbRingGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.18;

      const beamMat = new THREE.MeshBasicMaterial({
        color: herb.accentHex,
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const beam = new THREE.Mesh(herbBeamGeo, beamMat);
      beam.position.y = 1.38;

      hg.add(coreWrap, ring, beam);
      ow.add(hg);
      this.worldHerbMeshes.set(herb.id, hg);
      this.worldHerbVisuals.set(herb.id, {
        group: hg,
        core: coreWrap,
        ring,
        beam,
        baseY,
        phase: idx * 0.85,
        available: true,
      });
    });
  }

  getBiome(): WorldBiome {
    return this.currentBiome;
  }

  getLayout(): ArenaLayout {
    return this.layout;
  }

  getIslandCrystalCount(): number {
    return this.islandCrystals.length;
  }

  getCrystalPos(idx: number): THREE.Vector3 {
    const c = this.islandCrystals[idx];
    return c ? c.pos.clone() : new THREE.Vector3();
  }

  isCrystalUsed(idx: number): boolean {
    return this.islandCrystals[idx]?.used ?? true;
  }

  setCrystalUsed(idx: number, used: boolean): void {
    const c = this.islandCrystals[idx];
    if (!c) return;
    c.used = used;
    c.mat.emissiveIntensity = used ? 0.14 : 1.4;
    c.mat.opacity = used ? 0.3 : 0.94;
    c.ring.visible = !used;
    c.light.intensity = used ? 0.6 : 8.0;
  }

  setWaypointLit(id: string, lit: boolean): void {
    const wp = this.waypointVisuals.get(id);
    if (!wp) return;
    wp.lit = lit;
    wp.mat.color.set(lit ? '#56ffea' : '#ff5c6c');
    wp.beam.visible = lit;
  }

  setChestOpened(id: string, opened: boolean): void {
    const ch = this.chestVisuals.get(id);
    if (!ch) return;
    ch.opened = opened;
    ch.lid.rotation.x = opened ? -0.95 : 0;
    ch.lid.position.y = opened ? 0.8 : 0.66;
    ch.lid.position.z = opened ? -0.28 : 0;
    ch.glow.visible = !opened;
  }

  setSpiritOrbCollected(id: string, collected: boolean): void {
    const orb = this.spiritOrbVisuals.get(id);
    if (!orb) return;
    orb.collected = collected;
    orb.group.visible = !collected;
  }

  setHerbNodeAvailable(id: string, available: boolean): void {
    const herb = this.worldHerbVisuals.get(id);
    if (!herb) return;
    herb.available = available;
    herb.group.visible = available;
  }

  isInWorldLava(pos: THREE.Vector3): boolean {
    if (this.layout !== 'openworld') return false;
    const dPool = Math.hypot(pos.x + 46, pos.z - 44);
    const dAltar = Math.hypot(pos.x + 50, pos.z - 48);
    return dPool <= 15.8 && dAltar > 6.8;
  }

  setBiome(biome: WorldBiome): void {
    this.currentBiome = biome;
    this.applyBiomeVisuals();
    this.syncLayoutObstacles();
  }

  getHealingShrinePos(): THREE.Vector3 {
    return this.healingShrinePos.clone();
  }

  setHealingShrineUsed(used: boolean): void {
    this.healingShrineUsed = used;
    if (!this.shrineOrbMat || !this.shrineOrb || !this.shrineLight) return;
    if (used) {
      this.shrineOrbMat.emissiveIntensity = 0.14;
      this.shrineOrbMat.opacity = 0.34;
      this.shrineOrb.scale.setScalar(0.55);
      this.shrineRing.visible = false;
      this.shrineLight.intensity = 0.8;
    } else {
      this.shrineOrbMat.emissiveIntensity = 1.5;
      this.shrineOrbMat.opacity = 0.95;
      this.shrineOrb.scale.setScalar(1.0);
      this.shrineRing.visible = true;
      this.shrineLight.intensity = 8.5;
    }
  }

  private applyBiomeVisuals(): void {
    const b = this.currentBiome;

    // 1. Toggle biome decoration groups via .visible (ZERO runtime disposal churn!)
    const isCorridor = this.layout === 'corridor';
    const isOpen = this.layout === 'openworld';
    this.bambooArenaGroup.visible = !isOpen && b === 'bamboo_canyon';
    this.bambooGrovesGroup.visible = !isOpen && b === 'bamboo_canyon';
    this.peachShrineGroup.visible = !isOpen && b === 'peach_shrine';
    this.peachCorridorSubGroup.visible = isCorridor;
    this.swordGraveyardGroup.visible = !isOpen && b === 'sword_graveyard';
    this.swordCorridorSubGroup.visible = isCorridor;
    this.lavaAbyssGroup.visible = !isOpen && b === 'lava_abyss';
    this.lavaCorridorSubGroup.visible = isCorridor;
    this.celestialSanctumGroup.visible = !isOpen && b === 'celestial_sanctum';
    this.celestialCorridorSubGroup.visible = isCorridor;
    this.astralVoidGroup.visible = !isOpen && b === 'astral_void';
    this.astralCorridorSubGroup.visible = isCorridor;
    this.campPropsGroup.visible = !isOpen && b === 'haven_camp';

    // Zone 1 Healing Spring Shrine visible only in corridor mode (maxZone >= 1) and NOT haven_camp
    this.shrineGroup.visible = isCorridor && this.maxZone >= 1 && b !== 'haven_camp';

    // 2. Water / Magma / Astral River shader mode uniform
    const waterMode =
      b === 'peach_shrine'
        ? 1.0
        : b === 'sword_graveyard'
          ? 2.0
          : b === 'lava_abyss'
            ? 3.0
            : b === 'celestial_sanctum' || b === 'astral_void'
              ? 4.0
              : b === 'haven_camp'
                ? 5.0
                : 0.0;
    if (this.riverMat) this.riverMat.uniforms.uWaterMode.value = waterMode;
    if (this.shallowWaterMat) this.shallowWaterMat.uniforms.uWaterMode.value = waterMode;
    if (this.waterfallMat) this.waterfallMat.uniforms.uWaterMode.value = waterMode;
    if (this.plungeFoamMat) this.plungeFoamMat.uniforms.uWaterMode.value = waterMode;

    // 3. Biome-specific stone, cliff, sky, mist, and particle palettes
    const ch =
      this.lastStageNum <= 5 ? 1 : this.lastStageNum <= 10 ? 2 : this.lastStageNum <= 15 ? 3 : this.lastStageNum <= 20 ? 4 : 5;
    const stageSkyTint = ch === 5 ? '#9ac6ff' : ch === 4 ? '#c46c86' : ch === 3 ? '#d88b68' : ch === 2 ? '#a88ce0' : '#ffffff';
    const stageFloorHex = ch === 5 ? '#6c7ba8' : ch === 4 ? '#927488' : ch === 3 ? '#ab8879' : ch === 2 ? '#8e86b2' : '#9fb2c7';

    const palette: Record<WorldBiome, {
      floor: string;
      cliff: string;
      trim: string;
      canyonCliff: string;
      cliffCrest: string;
      streamBed: string;
      slab: string;
      bridgeDeck: string;
      skyTint: string;
      skyAdd: string;
      mist: string;
      fogMountain: string;
      petal: string;
      orb: string;
    }> = {
      bamboo_canyon: {
        floor: stageFloorHex,
        cliff: '#1b2430',
        trim: '#8493a6',
        canyonCliff: '#6b8896',
        cliffCrest: '#2c4a48',
        streamBed: '#5a868d',
        slab: '#4e6c73',
        bridgeDeck: '#7f9aa8',
        skyTint: stageSkyTint,
        skyAdd: '#000000',
        mist: '#ffffff',
        fogMountain: '#132334',
        petal: '#ffe0eb',
        orb: '#e0ffea',
      },
      peach_shrine: {
        floor: '#bca6b8',
        cliff: '#281d2c',
        trim: '#a48d9e',
        canyonCliff: '#827386',
        cliffCrest: '#4f3a4a',
        streamBed: '#6d5e6b',
        slab: '#70606f',
        bridgeDeck: '#9e889b',
        skyTint: '#f4bfd2',
        skyAdd: '#2c0e1c',
        mist: '#f8aec8',
        fogMountain: '#2d1828',
        petal: '#ffb4d0',
        orb: '#ffd8b0',
      },
      sword_graveyard: {
        floor: '#7f7d9c',
        cliff: '#151522',
        trim: '#6e6d88',
        canyonCliff: '#52566e',
        cliffCrest: '#2a2e3e',
        streamBed: '#3c3c54',
        slab: '#404258',
        bridgeDeck: '#686b86',
        skyTint: '#aa96d8',
        skyAdd: '#130b24',
        mist: '#9482c4',
        fogMountain: '#17132a',
        petal: '#b8a8dc',
        orb: '#b488ff',
      },
      lava_abyss: {
        floor: '#48383d',
        cliff: '#120b0d',
        trim: '#4a383c',
        canyonCliff: '#362629',
        cliffCrest: '#261414',
        streamBed: '#2d1e20',
        slab: '#221a1d',
        bridgeDeck: '#4a3639',
        skyTint: '#e27c5e',
        skyAdd: '#3c1004',
        mist: '#d8663c',
        fogMountain: '#2c100a',
        petal: '#ff7b2a',
        orb: '#ffc44d',
      },
      celestial_sanctum: {
        floor: '#dceef6',
        cliff: '#20384e',
        trim: '#c8e0ec',
        canyonCliff: '#84a6be',
        cliffCrest: '#628aa6',
        streamBed: '#82b6cc',
        slab: '#b6d8e6',
        bridgeDeck: '#cce4f0',
        skyTint: '#ccecff',
        skyAdd: '#0e283c',
        mist: '#9ee6ff',
        fogMountain: '#16324a',
        petal: '#dff6ff',
        orb: '#ffe88a',
      },
      astral_void: {
        floor: '#6c7ba8',
        cliff: '#141936',
        trim: '#7898c8',
        canyonCliff: '#4d6090',
        cliffCrest: '#2a3c68',
        streamBed: '#384c7c',
        slab: '#4a5f8e',
        bridgeDeck: '#6e86b8',
        skyTint: '#9ac6ff',
        skyAdd: '#101438',
        mist: '#7ad4ff',
        fogMountain: '#111632',
        petal: '#82f2ff',
        orb: '#ffdf88',
      },
      haven_camp: {
        floor: '#a8b0bc',
        cliff: '#1f2632',
        trim: '#8f94a0',
        canyonCliff: '#6b8896',
        cliffCrest: '#344c4a',
        streamBed: '#5a868d',
        slab: '#566d74',
        bridgeDeck: '#859aa6',
        skyTint: '#f2d4c2',
        skyAdd: '#1d110a',
        mist: '#f2cfa8',
        fogMountain: '#221c28',
        petal: '#ffc8da',
        orb: '#ffd47e',
      },
    };

    const p = palette[b];
    if (this.floorMat) this.floorMat.color.set(p.floor);
    if (this.cliffMat) this.cliffMat.color.set(p.cliff);
    if (this.trimMat) this.trimMat.color.set(p.trim);
    if (this.canyonCliffMat) this.canyonCliffMat.color.set(p.canyonCliff);
    if (this.cliffCrestMat) this.cliffCrestMat.color.set(p.cliffCrest);
    if (this.streamBedMat) this.streamBedMat.color.set(p.streamBed);
    if (this.slabMat) this.slabMat.color.set(p.slab);
    if (this.bankMat) this.bankMat.color.set(p.slab);
    if (this.lowCurbMat) this.lowCurbMat.color.set(p.trim);
    if (this.bridgeDeckMat) this.bridgeDeckMat.color.set(p.bridgeDeck);
    if (this.mistMat) this.mistMat.color.set(p.mist);
    if (this.petalMat?.uniforms.uPetalTint) {
      (this.petalMat.uniforms.uPetalTint.value as THREE.Color).set(p.petal);
    }
    if (this.fireflyMat?.uniforms.uOrbTint) {
      (this.fireflyMat.uniforms.uOrbTint.value as THREE.Color).set(p.orb);
    }
    if (this.mountainMat?.uniforms.uFogColor) {
      (this.mountainMat.uniforms.uFogColor.value as THREE.Color).set(p.fogMountain);
    }
    const skyUniforms = (this.skyDome.material as THREE.ShaderMaterial).uniforms;
    if (skyUniforms?.uSkyTint) (skyUniforms.uSkyTint.value as THREE.Color).set(p.skyTint);
    if (skyUniforms?.uSkyAdd) (skyUniforms.uSkyAdd.value as THREE.Color).set(p.skyAdd);
  }

  private syncLayoutObstacles(): void {
    this.circleObstacles.length = 0;
    this.capsuleObstacles.length = 0;

    if (this.layout === 'openworld') {
      for (const o of this.openWorldObstacles) this.circleObstacles.push(o);
      return;
    }

    for (const o of this.zone0Obstacles) this.circleObstacles.push(o);
    if (this.currentBiome === 'haven_camp') {
      for (const o of this.campObstacles) this.circleObstacles.push(o);
    }

    if (this.layout === 'pillars') {
      for (const o of this.pillarsObstacles) this.circleObstacles.push(o);
      for (const c of this.arenaArchwayCapsules) this.capsuleObstacles.push(c);
      return;
    }

    if (this.layout === 'islands') {
      for (const c of this.arenaArchwayCapsules) this.capsuleObstacles.push(c);
      return;
    }

    if (this.layout === 'arena') {
      for (const c of this.arenaArchwayCapsules) this.capsuleObstacles.push(c);
      return;
    }

    if (this.maxZone >= 1) {
      for (const o of this.zone1Obstacles) this.circleObstacles.push(o);
      if (this.currentBiome !== 'haven_camp') {
        this.circleObstacles.push({
          x: this.healingShrinePos.x,
          z: this.healingShrinePos.z,
          r: 0.65,
        });
      }
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
    this.maxZone = layout === 'corridor' ? maxZone : 0;
    this.unlockedZone = 0;
    this.playableRadius =
      layout === 'openworld'
        ? WORLD_BOUND
        : layout === 'pillars' || layout === 'islands'
          ? 21.0
          : 17.4;

    const expandScale = layout === 'pillars' || layout === 'islands' ? 1.18 : 1.0;
    this.terraceMesh.scale.set(expandScale, 1, expandScale);
    this.cliffMesh.scale.set(expandScale, 1, expandScale);
    this.cliffMesh.visible = layout !== 'openworld';

    this.pillarsLayoutGroup.visible = layout === 'pillars';
    this.islandsLayoutGroup.visible = layout === 'islands';
    this.openWorldGroup.visible = layout === 'openworld';
    if (layout === 'islands') {
      for (let i = 0; i < this.islandCrystals.length; i++) {
        this.setCrystalUsed(i, false);
      }
    }

    if (layout === 'openworld') {
      this.corridorGroup.visible = false;
      this.zone0FullCurb.visible = false;
      this.zone0OpenCurb.visible = false;
      this.archwayGroup.visible = false;
      this.baguaPlane.scale.setScalar(0.55);
      this.bossRingPlane.position.set(0, 0.036, 0);
      this.skySwordRing.position.set(0, 14.5, -26);
    } else if (layout === 'arena' || layout === 'pillars' || layout === 'islands') {
      this.baguaPlane.scale.setScalar(1.0);
      this.archwayGroup.visible = true;
      this.corridorGroup.visible = false;
      this.zone0FullCurb.visible = layout === 'arena';
      this.zone0OpenCurb.visible = false;
      const archZ = layout === 'arena' ? -16.6 : -19.8;
      this.archwayGroup.position.set(0, 0, archZ);
      this.archwayOccludable.position.set(0, 3.0, archZ);
      this.bossRingPlane.position.set(0, 0.036, 0);
      this.skySwordRing.position.set(0, 11.2, -23);
    } else {
      this.baguaPlane.scale.setScalar(1.0);
      this.archwayGroup.visible = true;
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

    this.applyBiomeVisuals();
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

  private getActiveBiomePropCount(): number {
    const isCorridor = this.layout === 'corridor';
    switch (this.currentBiome) {
      case 'bamboo_canyon':
        return this.bambooArenaGroup.children.length + (isCorridor ? 160 : 0);
      case 'peach_shrine':
        return (this.peachShrineGroup.children.length - 1) + (isCorridor ? this.peachCorridorSubGroup.children.length : 0);
      case 'sword_graveyard':
        return (this.swordGraveyardGroup.children.length - 1) + (isCorridor ? this.swordCorridorSubGroup.children.length : 0);
      case 'lava_abyss':
        return (this.lavaAbyssGroup.children.length - 1) + (isCorridor ? this.lavaCorridorSubGroup.children.length : 0);
      case 'celestial_sanctum':
        return (this.celestialSanctumGroup.children.length - 1) + (isCorridor ? this.celestialCorridorSubGroup.children.length : 0);
      case 'astral_void':
        return (this.astralVoidGroup.children.length - 1) + (isCorridor ? this.astralCorridorSubGroup.children.length : 0);
      case 'haven_camp':
        return this.campPropsGroup.children.length;
    }
  }

  getSightlineStats(): {
    centerBeamCount: number;
    occludableCount: number;
    waterMeshCount: number;
    canyonCliffCount: number;
    biome: WorldBiome;
    activeBiomeProps: number;
  } {
    return {
      centerBeamCount: this.moonbeams.filter((m) => Math.abs(m.position.x) < 18).length,
      occludableCount: this.occludables.length,
      waterMeshCount: this.waterMeshes.length,
      canyonCliffCount: this.canyonCliffs.length,
      biome: this.currentBiome,
      activeBiomeProps: this.getActiveBiomePropCount(),
    };
  }

  isOutOfBounds(pos: THREE.Vector3, margin = 0): boolean {
    if (this.layout === 'openworld') {
      const lim = WORLD_BOUND + margin;
      return Math.abs(pos.x) > lim || Math.abs(pos.z) > lim;
    }
    if (this.layout === 'arena' || this.layout === 'pillars' || this.layout === 'islands') {
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

      if (this.layout === 'openworld') {
        const lim = WORLD_BOUND - radius;
        pos.x = clamp(pos.x, -lim, lim);
        pos.z = clamp(pos.z, -lim, lim);
      } else if (this.layout === 'arena' || this.layout === 'pillars' || this.layout === 'islands') {
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
    const targetAnchorZ = this.layout === 'corridor' || this.layout === 'openworld' ? focusPos.z : 0;
    const targetAnchorX = this.layout === 'openworld' ? focusPos.x : 0;
    if (Math.abs(targetAnchorZ - this.backdropAnchorZ) > 24) {
      this.backdropAnchorZ = targetAnchorZ;
    } else {
      this.backdropAnchorZ += (targetAnchorZ - this.backdropAnchorZ) * Math.min(1, dt * 6);
    }
    if (Math.abs(targetAnchorX - this.backdropAnchorX) > 24) {
      this.backdropAnchorX = targetAnchorX;
    } else {
      this.backdropAnchorX += (targetAnchorX - this.backdropAnchorX) * Math.min(1, dt * 6);
    }
    this.skyDome.position.set(this.backdropAnchorX, 0, this.backdropAnchorZ);
    this.mountainGroup.position.set(this.backdropAnchorX, 0, this.backdropAnchorZ);

    if (this.layout === 'islands') {
      for (const c of this.islandCrystals) {
        c.orb.position.y = 1.48 + Math.sin(elapsed * 2.6 + c.pos.x) * (c.used ? 0.03 : 0.14);
        c.orb.rotation.y = elapsed * 1.3;
        if (c.ring.visible) {
          c.ring.rotation.x = Math.PI / 2 + Math.sin(elapsed * 1.9) * 0.25;
          c.ring.rotation.z = elapsed * 0.9;
        }
      }
    }

    if (this.monolithGroup.visible) {
      this.monolithCore.position.y = 2.1 + Math.sin(elapsed * 2.2) * 0.14;
      this.monolithCore.rotation.y = elapsed * 1.1;
      this.monolithRing.position.y = this.monolithCore.position.y;
      this.monolithRing.rotation.x = Math.PI / 2 + Math.sin(elapsed * 1.6) * 0.22;
      this.monolithRing.rotation.z = elapsed * 1.05;
      this.monolithDome.rotation.y = -elapsed * 0.35;
    }

    if (this.leylineZoneGroup.visible) {
      const spd = this.leylineHeroInside ? 2.4 : 1.15;
      for (let wi = 0; wi < this.leylineWisps.length; wi++) {
        const w = this.leylineWisps[wi];
        const a = (wi / this.leylineWisps.length) * Math.PI * 2 + elapsed * spd;
        w.position.set(Math.cos(a) * 2.95, 0.72 + Math.sin(elapsed * 3.1 + wi) * 0.2, Math.sin(a) * 2.95);
        w.rotation.y = elapsed * 2.5;
      }
    }

    if (this.layout === 'openworld') {
      for (const wp of this.waypointVisuals.values()) {
        wp.orb.position.y = 1.65 + Math.sin(elapsed * 2.4) * 0.14;
        wp.orb.rotation.y = elapsed * 1.4;
      }
      for (const ch of this.chestVisuals.values()) {
        if (!ch.opened) {
          ch.mat.opacity = 0.45 + Math.sin(elapsed * 3.2) * 0.14;
        }
      }
      for (const orb of this.spiritOrbVisuals.values()) {
        if (orb.collected) continue;
        orb.core.position.y = orb.baseY + Math.sin(elapsed * 2.8) * 0.22;
        orb.core.rotation.y = elapsed * 2.0;
        orb.ring.position.y = orb.core.position.y;
        orb.ring.rotation.z = elapsed * 1.4;
      }
      if (this.cryptRuneRing) {
        this.cryptRuneRing.rotation.z = elapsed * 0.35;
      }
      if (this.cryptInnerSigil) {
        this.cryptInnerSigil.rotation.z = -elapsed * 0.62;
      }
      for (let i = 0; i < this.cryptFlames.length; i++) {
        const fl = this.cryptFlames[i];
        fl.position.y = 1.92 + Math.sin(elapsed * 3.4 + i * 1.3) * 0.08;
        fl.rotation.y = elapsed * 1.8 + i;
      }
      for (const h of this.worldHerbVisuals.values()) {
        if (!h.available) continue;
        h.core.position.y = h.baseY + Math.sin(elapsed * 2.5 + h.phase) * 0.12;
        h.core.rotation.y = elapsed * 1.35 + h.phase;
        const pulse = 0.88 + 0.16 * Math.sin(elapsed * 3.1 + h.phase);
        h.ring.scale.setScalar(pulse);
        h.ring.rotation.z = elapsed * 0.55 + h.phase;
        const bm = h.beam.material as THREE.MeshBasicMaterial;
        bm.opacity = 0.16 + 0.09 * Math.sin(elapsed * 2.8 + h.phase);
      }
      for (const cl of this.owCelestialClouds) {
        cl.mesh.position.y = cl.baseY + Math.sin(elapsed * 0.8 + cl.phase) * 0.24;
      }
      for (let i = 0; i < this.owCelestialHalos.length; i++) {
        this.owCelestialHalos[i].rotation.z = elapsed * 0.65 * (i % 2 === 0 ? 1 : -1);
      }
      for (const fl of this.owFortressFlames) {
        const s = 0.86 + 0.22 * Math.sin(elapsed * 9.2 + fl.phase);
        fl.mesh.scale.set(0.92 + 0.1 * Math.cos(elapsed * 7.4 + fl.phase), s, 0.92);
        fl.mesh.position.y = fl.baseY + (s - 1.0) * 0.16;
      }
      for (const l of this.owFortressLights) {
        const flick = 1 + 0.14 * Math.sin(elapsed * 8.1 + l.phase) + 0.06 * Math.sin(elapsed * 14.3 + l.phase);
        l.light.intensity = l.baseIntensity * flick;
      }
      for (const bn of this.owFortressBanners) {
        bn.mesh.rotation.y = bn.baseRotY + Math.sin(elapsed * 2.4 + bn.phase) * 0.14;
        bn.mesh.rotation.z = Math.sin(elapsed * 3.2 + bn.phase) * 0.06;
      }
      for (let i = 0; i < this.owValleyWaterMeshes.length; i++) {
        const wm = this.owValleyWaterMeshes[i].material as THREE.MeshStandardMaterial;
        wm.emissiveIntensity = 0.28 + 0.1 * Math.sin(elapsed * 2.1 + i * 0.9);
      }
    }

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

    if (this.shrineGroup.visible && this.shrineOrb) {
      const bob = this.healingShrineUsed ? 0.04 : 0.12;
      this.shrineOrb.position.y = 1.48 + Math.sin(elapsed * 2.4) * bob;
      this.shrineOrb.rotation.y = elapsed * 1.2;
      if (this.shrineRing.visible) {
        this.shrineRing.position.y = this.shrineOrb.position.y;
        this.shrineRing.rotation.x = Math.PI / 2 + Math.sin(elapsed * 1.7) * 0.25;
        this.shrineRing.rotation.z = elapsed * 0.85;
      }
      if (!this.healingShrineUsed) {
        this.shrineLight.intensity = 8.0 + Math.sin(elapsed * 3.1) * 1.4;
      }
    }

    if (this.currentBiome === 'haven_camp') {
      if (this.campFireLight) {
        const flick = 1 + 0.16 * Math.sin(elapsed * 9.5) + 0.08 * Math.sin(elapsed * 17.3);
        this.campFireLight.intensity = 14.0 * flick;
      }
      for (let i = 0; i < this.campFlames.length; i++) {
        const fl = this.campFlames[i];
        const baseY = fl.userData.baseY as number;
        const s = 0.88 + 0.22 * Math.sin(elapsed * (10.5 + i * 2.4) + i);
        fl.scale.set(0.92 + 0.1 * Math.cos(elapsed * 8.0 + i), s, 0.92 + 0.1 * Math.sin(elapsed * 7.5 + i));
        fl.position.y = baseY + (s - 1.0) * 0.18;
        fl.rotation.z = Math.sin(elapsed * 6.5 + i * 1.4) * 0.12;
      }
      if (this.campLanternLight) {
        this.campLanternLight.intensity = 9.5 + Math.sin(elapsed * 4.2) * 0.8;
      }
    } else if (this.currentBiome === 'lava_abyss') {
      for (const vp of this.magmaVentPlumes) {
        const pulse = 0.86 + 0.24 * Math.sin(elapsed * 3.4 + vp.phase);
        vp.mesh.scale.set(0.92 + 0.12 * Math.cos(elapsed * 2.7 + vp.phase), pulse, 0.92);
        vp.mesh.position.y = vp.baseY + (pulse - 1.0) * 0.45;
      }
    } else if (this.currentBiome === 'celestial_sanctum') {
      for (const cp of this.cloudPillars) {
        cp.group.position.y = cp.baseY + Math.sin(elapsed * 0.95 + cp.phase) * 0.34;
        cp.halo.rotation.y = elapsed * 0.9 + cp.phase;
        cp.halo.rotation.x = Math.sin(elapsed * 0.7 + cp.phase) * 0.25;
      }
    } else if (this.currentBiome === 'astral_void') {
      for (const ao of this.astralObelisks) {
        ao.group.position.y = ao.baseY + Math.sin(elapsed * 1.15 + ao.phase) * 0.24;
        ao.ring.rotation.z = elapsed * 1.1 + ao.phase;
        ao.ring.rotation.y = Math.cos(elapsed * 0.65 + ao.phase) * 0.45;
      }
    } else if (this.currentBiome === 'sword_graveyard') {
      for (const gc of this.graveyardCrystals) {
        gc.mat.emissiveIntensity = 0.75 + 0.35 * Math.sin(elapsed * 2.2 + gc.phase);
      }
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
