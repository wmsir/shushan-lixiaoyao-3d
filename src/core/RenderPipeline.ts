import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const FilmicGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uContrast: { value: 1.055 },
    uVignette: { value: 0.16 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uContrast;
    uniform float uVignette;
    varying vec2 vUv;

    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 col = tex.rgb;
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      // Subtle Xianxia split-toning: cool moonlight slate shadows, warm golden-jade highlights
      vec3 shadowTint = vec3(0.95, 1.01, 1.07);
      vec3 highTint = vec3(1.04, 1.01, 0.96);
      col *= mix(shadowTint, highTint, smoothstep(0.12, 0.72, lum));
      col = (col - 0.5) * uContrast + 0.5;
      col = max(col, vec3(0.0));
      float d = length(vUv - vec2(0.5));
      float vig = smoothstep(0.92, 0.32, d);
      col *= mix(1.0 - uVignette, 1.0, vig);
      gl_FragColor = vec4(col, tex.a);
    }
  `,
};

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
  private readonly gradePass: ShaderPass;
  private readonly outputPass: OutputPass;
  private envRenderTarget: THREE.WebGLRenderTarget | null = null;
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
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    const w = Math.max(1, canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, canvas.clientHeight || window.innerHeight);

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    // Tuned HDR bloom (threshold 1.18, strength 0.24, radius 0.32): crisp gold/jade/crimson VFX & Legend pillars without blowing out skin, stone, or UI
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.24, 0.32, 1.18);
    this.composer.addPass(this.bloomPass);
    this.gradePass = new ShaderPass(FilmicGradeShader);
    this.composer.addPass(this.gradePass);
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    this.resize(true);
  }

  /** Synthesizes a moonlit Xianxia studio + mountain IBL environment map for metallic/armor reflections. */
  buildMoonlitEnvironment(): THREE.Texture {
    if (this.envRenderTarget) return this.envRenderTarget.texture;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();

    const envScene = new THREE.Scene();
    const skyGeo = new THREE.SphereGeometry(24, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vPos;
        void main() {
          vec3 d = normalize(vPos);
          vec3 zenith = vec3(0.08, 0.16, 0.34);
          vec3 horizon = vec3(0.28, 0.46, 0.62);
          vec3 ground = vec3(0.11, 0.14, 0.18);
          vec3 col = d.y >= 0.0
            ? mix(horizon, zenith, smoothstep(0.0, 0.65, d.y))
            : mix(horizon, ground, smoothstep(0.0, -0.45, d.y));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const skyMesh = new THREE.Mesh(skyGeo, skyMat);
    envScene.add(skyMesh);

    const panelGeo = new THREE.PlaneGeometry(10, 6);
    const moonMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.8, 3.4), side: THREE.DoubleSide });
    const moonPanel = new THREE.Mesh(panelGeo, moonMat);
    moonPanel.position.set(-10, 12, -12);
    moonPanel.lookAt(0, 0, 0);

    const warmMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.55, 0.92), side: THREE.DoubleSide });
    const warmPanel = new THREE.Mesh(panelGeo, warmMat);
    warmPanel.position.set(11, 6, 10);
    warmPanel.lookAt(0, 0, 0);

    const jadeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 1.85, 1.75), side: THREE.DoubleSide });
    const jadePanel = new THREE.Mesh(panelGeo, jadeMat);
    jadePanel.position.set(0, -6, 12);
    jadePanel.lookAt(0, 0, 0);

    envScene.add(moonPanel, warmPanel, jadePanel);
    this.envRenderTarget = pmrem.fromScene(envScene, 0.04);

    skyGeo.dispose();
    skyMat.dispose();
    panelGeo.dispose();
    moonMat.dispose();
    warmMat.dispose();
    jadeMat.dispose();
    pmrem.dispose();

    return this.envRenderTarget.texture;
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
    this.gradePass.dispose();
    this.outputPass.dispose();
    this.envRenderTarget?.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
