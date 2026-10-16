// Renderer for Five Nights at Bessario's.
// "Pre-render at runtime": when the view is still, each frame is rendered with sub-pixel
// camera jitter, jittered (soft) shadow lights and rotated SSAO samples, and accumulated
// into an HDR buffer. After a few dozen frames the image converges to a soft, anti-aliased,
// ambient-occluded still — the look of FNAF's pre-rendered CGI — and rendering stops until
// something changes. The office is a wide render shown through a cylindrical panorama warp.
import * as THREE from 'three';
import { clamp } from './util.js';

const FS_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// screen-space ambient occlusion from the depth buffer
const AO_FRAG = /* glsl */`
uniform sampler2D tDepth; uniform mat4 uProj; uniform mat4 uInvProj; uniform vec2 uRes;
uniform float uRadius; uniform float uSeed; uniform float uStrength;
varying vec2 vUv;
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
vec3 viewPos(vec2 uv){
  float d = texture2D(tDepth, uv).x;
  vec4 c = vec4(uv*2.0-1.0, d*2.0-1.0, 1.0);
  vec4 v = uInvProj * c; return v.xyz / v.w;
}
void main(){
  float d0 = texture2D(tDepth, vUv).x;
  if (d0 >= 0.99999) { gl_FragColor = vec4(1.0); return; }
  vec3 P = viewPos(vUv);
  vec3 N = normalize(cross(dFdx(P), dFdy(P)));
  float a0 = hash(vUv*uRes + uSeed*17.3) * 6.2831;
  float occ = 0.0; const int S = SAMPLES;
  for (int i = 0; i < S; i++){
    float fi = float(i) + hash(vec2(uSeed, float(i)));
    float r = uRadius * (0.15 + 0.85 * fract(fi * 0.618 + hash(vUv*uRes.yx + uSeed)));
    float th = a0 + fi * 2.39996;
    float z = fract(fi * 0.381966 + uSeed * 0.13);
    vec3 dir = vec3(cos(th)*sqrt(1.0-z*z), sin(th)*sqrt(1.0-z*z), z);
    // orient hemisphere around N
    vec3 up = abs(N.z) < 0.999 ? vec3(0.0,0.0,1.0) : vec3(1.0,0.0,0.0);
    vec3 T = normalize(cross(up, N)); vec3 B = cross(N, T);
    vec3 S3 = P + (T*dir.x + B*dir.y + N*dir.z) * r;
    vec4 o = uProj * vec4(S3, 1.0); o.xy /= o.w; vec2 suv = o.xy*0.5+0.5;
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;
    float sz = viewPos(suv).z;
    float range = smoothstep(0.0, 1.0, uRadius / abs(P.z - sz));
    occ += (sz >= S3.z + 0.02 ? 1.0 : 0.0) * range;
  }
  float ao = 1.0 - occ / float(S) * uStrength;
  gl_FragColor = vec4(vec3(clamp(ao, 0.0, 1.0)), 1.0);
}`;

// accumulate: acc = mix(prev, scene*ao, w)
const ACC_FRAG = /* glsl */`
uniform sampler2D tPrev; uniform sampler2D tCur; uniform sampler2D tAO; uniform float uW; uniform float uUseAO;
varying vec2 vUv;
void main(){
  vec3 c = texture2D(tCur, vUv).rgb;
  if (uUseAO > 0.5) { float ao = texture2D(tAO, vUv).r; c *= mix(1.0, ao, 0.9); }
  vec3 p = texture2D(tPrev, vUv).rgb;
  gl_FragColor = vec4(mix(p, c, uW), 1.0);
}`;

const BRIGHT_FRAG = /* glsl */`
uniform sampler2D tInput; uniform float uThreshold; uniform vec2 uTexel;
varying vec2 vUv;
void main(){
  vec3 c = texture2D(tInput, vUv + uTexel*vec2(-1.0,-1.0)).rgb + texture2D(tInput, vUv + uTexel*vec2(1.0,-1.0)).rgb
         + texture2D(tInput, vUv + uTexel*vec2(-1.0,1.0)).rgb + texture2D(tInput, vUv + uTexel*vec2(1.0,1.0)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  float k = clamp((l - uThreshold) / max(l, 1e-4), 0.0, 1.0);
  gl_FragColor = vec4(c * k, 1.0);
}`;
const BLUR_FRAG = /* glsl */`
uniform sampler2D tInput; uniform vec2 uDir;
varying vec2 vUv;
void main(){
  vec3 c = texture2D(tInput, vUv).rgb * 0.2270270270;
  c += texture2D(tInput, vUv + uDir*1.3846153846).rgb * 0.3162162162;
  c += texture2D(tInput, vUv - uDir*1.3846153846).rgb * 0.3162162162;
  c += texture2D(tInput, vUv + uDir*3.2307692308).rgb * 0.0702702703;
  c += texture2D(tInput, vUv - uDir*3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`;

const COMPOSITE_FRAG = /* glsl */`
uniform sampler2D tScene; uniform sampler2D tBloomA; uniform sampler2D tBloomB;
uniform float uTime; uniform vec2 uRes; uniform float uBloom; uniform float uUseBloom;
uniform float uVignette; uniform float uGrain; uniform float uCA; uniform float uExposure;
uniform float uSaturation; uniform float uContrast; uniform vec3 uTint; uniform vec3 uLift;
uniform float uFade; uniform vec3 uFlashColor; uniform float uFlash; uniform float uStatic;
uniform float uDistort; uniform float uScan; uniform float uGamma; uniform float uCCTV;
uniform vec4 uView;   // x: mode (0 crop, 1 panorama), y: center (crop offset or yaw), z: crop width or visible half-angle, w: image half-fov (tan)
uniform float uVScale;
varying vec2 vUv;
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
vec3 toSRGB(vec3 c){ vec3 lo = c*12.92; vec3 hi = 1.055*pow(max(c, vec3(0.0)), vec3(1.0/2.4)) - 0.055; return mix(lo, hi, step(vec3(0.0031308), c)); }
vec2 mapUV(vec2 uv){
  if (uView.x > 0.5) {               // cylindrical panorama
    float th = uView.y + (uv.x - 0.5) * 2.0 * uView.z;
    float x = tan(th) / uView.w * 0.5 + 0.5;
    float y = 0.5 + (uv.y - 0.5) * uVScale / pow(cos(th), 0.6);
    return vec2(x, y);
  }
  return vec2(uView.y + uv.x * uView.z, uv.y);
}
void main(){
  vec2 uv = vUv;
  if (uCCTV > 0.0) { // security camera: slight barrel + rolling wobble
    vec2 d = uv - 0.5; float r2 = dot(d, d);
    uv = 0.5 + d * (1.0 + r2 * 0.12 * uCCTV);
    uv.x += sin(uv.y * 180.0 + uTime * 9.0) * 0.0007 * uCCTV;
  }
  if (uDistort > 0.0) {
    float band = floor(uv.y * 24.0 + uTime * 30.0);
    float off = (hash(vec2(band, floor(uTime*20.0))) - 0.5) * 0.06 * uDistort;
    uv.x += off * step(0.6, hash(vec2(band*1.7, floor(uTime*13.0))));
    uv += (uv - 0.5) * sin(uTime*40.0) * 0.01 * uDistort;
  }
  vec2 d = uv - 0.5; float r2 = dot(d, d);
  vec2 caOff = d * (uCA * (0.4 + r2 * 2.5));
  vec3 col;
  col.r = texture2D(tScene, mapUV(uv - caOff)).r;
  col.g = texture2D(tScene, mapUV(uv)).g;
  col.b = texture2D(tScene, mapUV(uv + caOff)).b;
  if (uUseBloom > 0.5) { vec2 m = mapUV(uv); col += (texture2D(tBloomA, m).rgb * 0.75 + texture2D(tBloomB, m).rgb * 1.1) * uBloom; }
  col *= uExposure;
  col = aces(col);
  col = col * uTint + uLift * (1.0 - col);
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSaturation);
  col = clamp((col - 0.5) * uContrast + 0.5, 0.0, 1.0);
  col = pow(col, vec3(uGamma));
  float vig = smoothstep(0.85, 0.18, r2 * (1.0 + uVignette));
  col *= mix(1.0, vig, clamp(uVignette, 0.0, 1.0));
  col *= 1.0 - uScan * (0.5 + 0.5 * sin(vUv.y * uRes.y * 1.6 + uTime * 6.0));
  float n = hash(vUv * uRes + fract(uTime * 7.13) * 100.0);
  col = mix(col, vec3(n), uStatic);
  float g = (hash(vUv * uRes * 0.5 + fract(uTime) * 61.0) - 0.5) * uGrain;
  col += g * (1.0 - l * 0.5);
  if (uCCTV > 0.0) { // rolling bright band
    float band = smoothstep(0.0, 0.04, abs(fract(vUv.y * 0.5 - uTime * 0.07) - 0.5));
    col *= 0.94 + 0.06 * band;
  }
  col = toSRGB(col);
  col = mix(col, uFlashColor, clamp(uFlash, 0.0, 1.0));
  col *= 1.0 - uFade;
  col += (hash(vUv * uRes + 3.1) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

export const QUALITY = {
  low: { scale: 0.6, shadowSize: 1024, bloom: false, ao: 6, accum: 16, maxDpr: 1.5, budget: 1.1e6 },
  medium: { scale: 0.8, shadowSize: 1024, bloom: true, ao: 10, accum: 32, maxDpr: 2, budget: 1.6e6 },
  high: { scale: 1.0, shadowSize: 2048, bloom: true, ao: 14, accum: 64, maxDpr: 2, budget: 4.0e6 },
};

// Halton sequence for sub-pixel jitter
const halton = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false, depth: true });
    gl.setPixelRatio(1);
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.NoToneMapping;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.gl = gl;
    this.hdr = gl.capabilities.isWebGL2 && (gl.extensions.has('EXT_color_buffer_float') || gl.extensions.has('EXT_color_buffer_half_float'));
    this.qualityName = 'medium'; this.q = QUALITY.medium;

    this.fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.fsMesh = new THREE.Mesh(tri); this.fsMesh.frustumCulled = false;
    this.fsScene = new THREE.Scene(); this.fsScene.add(this.fsMesh);
    const mk = (frag, uniforms, defines = {}) => new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms, defines, depthTest: false, depthWrite: false });
    this.aoMat = mk(AO_FRAG, { tDepth: { value: null }, uProj: { value: new THREE.Matrix4() }, uInvProj: { value: new THREE.Matrix4() }, uRes: { value: new THREE.Vector2() }, uRadius: { value: 0.45 }, uSeed: { value: 0 }, uStrength: { value: 1.25 } }, { SAMPLES: 10 });
    this.accMat = mk(ACC_FRAG, { tPrev: { value: null }, tCur: { value: null }, tAO: { value: null }, uW: { value: 1 }, uUseAO: { value: 1 } });
    this.brightMat = mk(BRIGHT_FRAG, { tInput: { value: null }, uThreshold: { value: 0.9 }, uTexel: { value: new THREE.Vector2() } });
    this.blurMat = mk(BLUR_FRAG, { tInput: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.post = {
      bloom: 0.35, vignette: 0.9, grain: 0.05, ca: 0.0018, exposure: 1.25, saturation: 0.78, contrast: 1.12,
      tint: new THREE.Color(1.0, 0.97, 0.88), lift: new THREE.Color(0.006, 0.008, 0.006),
      fade: 0, flash: 0, flashColor: new THREE.Color(1, 1, 1), static: 0, distort: 0, scan: 0, gamma: 1.0, cctv: 0,
    };
    this.compMat = mk(COMPOSITE_FRAG, {
      tScene: { value: null }, tBloomA: { value: null }, tBloomB: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
      uBloom: { value: 0 }, uUseBloom: { value: 1 }, uVignette: { value: 0 }, uGrain: { value: 0 }, uCA: { value: 0 }, uExposure: { value: 1 },
      uSaturation: { value: 1 }, uContrast: { value: 1 }, uTint: { value: new THREE.Color() }, uLift: { value: new THREE.Color() },
      uFade: { value: 0 }, uFlashColor: { value: new THREE.Color() }, uFlash: { value: 0 }, uStatic: { value: 0 }, uDistort: { value: 0 },
      uScan: { value: 0 }, uGamma: { value: 1 }, uCCTV: { value: 0 }, uView: { value: new THREE.Vector4(0, 0, 1, 1) }, uVScale: { value: 1 },
    });
    this.time = 0; this.width = 1; this.height = 1;
    this.targets = null; this.fpsSamples = [];
    this.accN = 0; this.accKey = null; this.ping = 0;
    this.view = { mode: 0, center: 0, width: 1, tanHalf: 1, vscale: 1 };
    this.renderScale = 1;   // render target width multiplier (wide renders for pans/panorama)
    this.resize();
  }

  setQuality(name) {
    if (!QUALITY[name]) name = 'medium';
    this.qualityName = name; this.q = QUALITY[name];
    this.aoMat.defines.SAMPLES = this.q.ao; this.aoMat.needsUpdate = true;
    this.onQualityChange && this.onQualityChange(this.q);
    this.resize(true);
  }

  makeTarget(w, h, { depth = false, float = true } = {}) {
    const rt = new THREE.WebGLRenderTarget(w, h, {
      type: this.hdr && float ? THREE.HalfFloatType : THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: depth, stencilBuffer: false,
    });
    if (depth) { rt.depthTexture = new THREE.DepthTexture(w, h); rt.depthTexture.type = THREE.UnsignedIntType; }
    rt.texture.generateMipmaps = false;
    return rt;
  }

  // wide renders: scale > 1 renders a wider image than the screen (pans / panorama)
  setRenderScale(sx, sy = 1) {
    if (Math.abs(sx - this.renderScale) < 1e-3 && Math.abs(sy - (this.renderScaleY || 1)) < 1e-3) return;
    this.renderScale = sx; this.renderScaleY = sy; this.resize(true);
  }

  resize(force = false) {
    const vv = window.visualViewport;
    const cw = Math.max(1, Math.round(vv ? vv.width : window.innerWidth));
    const ch = Math.max(1, Math.round(vv ? vv.height : window.innerHeight));
    const dpr = Math.min(window.devicePixelRatio || 1, this.q.maxDpr);
    const scale = this.q.scale * dpr;
    let w = cw * scale * this.renderScale, h = ch * scale * (this.renderScaleY || 1);
    // keep the render inside a pixel budget (phones: memory + speed), and inside texture limits
    const k = Math.min(1, Math.sqrt(this.q.budget / (w * h)), 4096 / w, 2048 / h);
    w = Math.max(64, Math.round(w * k)); h = Math.max(64, Math.round(h * k));
    if (!force && w === this.width && h === this.height && this.cssW === cw && this.cssH === ch) return;
    this.cssW = cw; this.cssH = ch; this.width = w; this.height = h;
    this.gl.setSize(Math.round(cw * Math.min(dpr, 2)), Math.round(ch * Math.min(dpr, 2)), false);
    this.canvas.style.width = cw + 'px'; this.canvas.style.height = ch + 'px';
    // target sets are cached by size: switching office <-> cameras must not reallocate
    this.tcache = this.tcache || new Map();
    const tkey = w + 'x' + h + this.qualityName;
    if (this.tcache.has(tkey)) { this.targets = this.tcache.get(tkey); this.accN = 0; this.aspect = cw / ch; this.onResize && this.onResize(cw, ch); return; }
    if (this.tcache.size >= 3) { const [k0, t0] = this.tcache.entries().next().value; Object.values(t0).forEach((t) => t.dispose()); this.tcache.delete(k0); }
    const bw = Math.max(16, Math.round(w / 4)), bh = Math.max(16, Math.round(h / 4));
    const aoW = Math.max(32, Math.round(w / 2)), aoH = Math.max(32, Math.round(h / 2));
    this.targets = {
      scene: this.makeTarget(w, h, { depth: true }),
      ao: this.makeTarget(aoW, aoH, { float: false }),
      accA: this.makeTarget(w, h), accB: this.makeTarget(w, h),
      bA: this.makeTarget(bw, bh), bA2: this.makeTarget(bw, bh),
      bB: this.makeTarget(Math.max(8, bw >> 1), Math.max(8, bh >> 1)), bB2: this.makeTarget(Math.max(8, bw >> 1), Math.max(8, bh >> 1)),
    };
    this.tcache.set(tkey, this.targets);
    this.accN = 0;
    this.aspect = cw / ch;
    this.onResize && this.onResize(cw, ch);
  }

  pass(mat, target) { this.fsMesh.material = mat; this.gl.setRenderTarget(target); this.gl.render(this.fsScene, this.fsCam); }

  resetAccum() { this.accN = 0; }

  // collect shadow lights to jitter for soft penumbras
  softLights(scene) {
    if (scene.userData.softLights) return scene.userData.softLights;
    const list = [];
    scene.traverse((o) => { if (o.isLight && o.castShadow) list.push({ l: o, base: o.position.clone() }); });
    scene.userData.softLights = list;
    return list;
  }

  // still: accumulate when true; key: anything that changes the image must change the key
  render(scene, camera, dt, { still = false, key = '', motionBlur = 0 } = {}) {
    this.time += dt;
    const gl = this.gl, T = this.targets, p = this.post;
    const k2 = key + '|' + camera.uuid + '|' + scene.uuid;
    if (k2 !== this.accKey || (!still && !motionBlur)) { this.accN = 0; this.accKey = k2; }
    const maxN = still ? this.q.accum : 1e9;
    if (this.accN < maxN || !still) {
      const n = this.accN;
      // sub-pixel jitter + soft light jitter
      const jx = n === 0 ? 0 : halton(n + 1, 2) - 0.5, jy = n === 0 ? 0 : halton(n + 1, 3) - 0.5;
      if (still && n > 0) camera.setViewOffset(this.width, this.height, jx, jy, this.width, this.height);
      const soft = this.softLights(scene);
      for (const sl of soft) sl.l.shadow.autoUpdate = sl.l.intensity > 0.001;   // dark lights skip their shadow pass
      if (still && n > 0) for (const s of soft) { const r = s.l.userData.softRadius ?? 0.07; s.l.position.set(s.base.x + (Math.random() - 0.5) * r * 2, s.base.y + (Math.random() - 0.5) * r * 2, s.base.z + (Math.random() - 0.5) * r * 2); }
      else for (const s of soft) s.base.copy(s.l.position);
      gl.setRenderTarget(T.scene); gl.clear(); gl.render(scene, camera);
      if (still && n > 0) { camera.clearViewOffset(); for (const s of soft) s.l.position.copy(s.base); }
      // AO
      const useAO = this.q.ao > 0;
      if (useAO) {
        const u = this.aoMat.uniforms;
        u.tDepth.value = T.scene.depthTexture; u.uProj.value.copy(camera.projectionMatrix); u.uInvProj.value.copy(camera.projectionMatrixInverse);
        u.uRes.value.set(T.ao.width, T.ao.height); u.uSeed.value = (n * 7.31) % 97;
        this.pass(this.aoMat, T.ao);
      }
      // accumulate
      const src = this.ping ? T.accB : T.accA, dst = this.ping ? T.accA : T.accB;
      const a = this.accMat.uniforms;
      a.tPrev.value = src.texture; a.tCur.value = T.scene.texture; a.tAO.value = T.ao.texture; a.uUseAO.value = useAO ? 1 : 0;
      a.uW.value = !still && motionBlur && n > 0 ? 1 - motionBlur : 1 / (n + 1);
      this.pass(this.accMat, dst);
      this.ping ^= 1;
      this.accN = n + 1;
      this.stats = { calls: gl.info.render.calls, tris: gl.info.render.triangles };
      // bloom from the accumulated image
      this.bloomDirty = true;
    }
    const acc = this.ping ? T.accB : T.accA; // last written
    if (this.q.bloom && this.bloomDirty) {
      this.bloomDirty = false;
      this.brightMat.uniforms.tInput.value = acc.texture; this.brightMat.uniforms.uTexel.value.set(1 / this.width, 1 / this.height);
      this.pass(this.brightMat, T.bA);
      const bu = this.blurMat.uniforms;
      bu.tInput.value = T.bA.texture; bu.uDir.value.set(1 / T.bA.width, 0); this.pass(this.blurMat, T.bA2);
      bu.tInput.value = T.bA2.texture; bu.uDir.value.set(0, 1 / T.bA.height); this.pass(this.blurMat, T.bA);
      bu.tInput.value = T.bA.texture; bu.uDir.value.set(1 / T.bB.width, 0); this.pass(this.blurMat, T.bB2);
      bu.tInput.value = T.bB2.texture; bu.uDir.value.set(0, 1 / T.bB.height); this.pass(this.blurMat, T.bB);
    }
    const u = this.compMat.uniforms;
    u.tScene.value = acc.texture; u.tBloomA.value = T.bA.texture; u.tBloomB.value = T.bB.texture;
    u.uUseBloom.value = this.q.bloom ? 1 : 0; u.uTime.value = this.time; u.uRes.value.set(this.cssW, this.cssH);
    u.uBloom.value = p.bloom; u.uVignette.value = p.vignette; u.uGrain.value = p.grain; u.uCA.value = p.ca; u.uExposure.value = p.exposure;
    u.uSaturation.value = p.saturation; u.uContrast.value = p.contrast; u.uTint.value.copy(p.tint); u.uLift.value.copy(p.lift);
    u.uFade.value = clamp(p.fade, 0, 1); u.uFlash.value = p.flash; u.uFlashColor.value.copy(p.flashColor);
    u.uStatic.value = p.static; u.uDistort.value = p.distort; u.uScan.value = p.scan; u.uGamma.value = p.gamma; u.uCCTV.value = p.cctv;
    const v = this.view;
    u.uView.value.set(v.mode, v.center, v.width, v.tanHalf); u.uVScale.value = v.vscale;
    this.pass(this.compMat, null);
  }

  trackFps(dt) { this.fpsSamples.push(dt); if (this.fpsSamples.length > 120) this.fpsSamples.shift(); }
  get fps() { if (!this.fpsSamples.length) return 60; return this.fpsSamples.length / this.fpsSamples.reduce((a, b) => a + b, 0); }
}
