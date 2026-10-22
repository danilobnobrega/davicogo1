import * as THREE from 'three';
import { PAPER, INK, raw, damp, canvasTex } from './core.js';

/*
 * Nattos + BTG: a sheet of cotton paper with the two names letterpressed into it.
 * The impression is a height field; the pointer is a desk lamp moving over the sheet.
 */
const FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform vec2 uSize;
uniform vec3 uLamp;
uniform vec3 uPaper, uInk;
uniform float uTime;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= .5; } return s; }

// the sheet: deckled edges top and bottom
float sheet(vec2 p) {
  float top = 18. + fbm(vec2(p.x * .045, 3.)) * 22. + noise(vec2(p.x * .6, 9.)) * 2.;
  float bot = uSize.y - 18. - fbm(vec2(p.x * .045, 7.)) * 22. - noise(vec2(p.x * .6, 1.)) * 2.;
  return smoothstep(top - .8, top + .8, p.y) * (1. - smoothstep(bot - .8, bot + .8, p.y));
}

float height(vec2 uv, float lod) { return texture2D(uTex, uv, lod).a; }

void main() {
  vec2 p = vec2(vUv.x, 1. - vUv.y) * uSize;          // css px, y down
  float s = sheet(p);
  if (s < .002) discard;

  // paper: cotton fibres and a faint laid texture
  float fib = fbm(p * vec2(.09, .35)) * .6 + fbm(p * vec2(.35, .08)) * .4;
  float grain = noise(p * 1.7);
  vec3 paper = uPaper * (0.965 + fib * .05 + grain * .018);

  // impression: blurred letters as depth, two scales for a soft shoulder
  vec2 px = 1. / uSize;
  float e = 1.2;
  float hL = height(vUv - vec2(px.x * e, 0.), 1.1), hR = height(vUv + vec2(px.x * e, 0.), 1.1);
  float hD = height(vUv - vec2(0., px.y * e), 1.1), hU = height(vUv + vec2(0., px.y * e), 1.1);
  vec3 n = normalize(vec3((hL - hR) * -1.6, (hD - hU) * -1.6, 1.));   // pressed in, not raised

  vec3 pos = vec3(p.x, uSize.y - p.y, 0.);
  vec3 L = normalize(uLamp - pos);
  float flat_ = L.z;
  float lit = dot(n, L);
  float relief = (lit - flat_) * .8;
  float pool = exp(-length(uLamp.xy - pos.xy) / 1100.);  // the lamp's pool of light

  float ink = texture2D(uTex, vUv, 0.).a;
  float inkTex = .9 + noise(p * .9) * .1;
  vec3 col = paper * (.9 + .12 * pool) + relief * .32;
  col = mix(col, uInk * (1. + relief * .12), smoothstep(.4, .6, ink) * .94 * inkTex);
  gl_FragColor = vec4(col, s);
}
`;

export class Press {
  constructor(S, el, section) {
    this.S = S;
    this.el = el;
    this.section = section;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, -1, 1);
    this.u = {
      uTex: { value: null },
      uSize: { value: new THREE.Vector2(1, 1) },
      uLamp: { value: new THREE.Vector3(0, 0, 600) },
      uPaper: { value: raw(PAPER) },
      uInk: { value: raw(INK) },
      uTime: { value: 0 },
    };
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy * 2., 0., 1.); }',
        fragmentShader: FRAG,
        uniforms: this.u,
        transparent: true,
      }),
    );
    this.scene.add(this.mesh);
    this.lx = 0.3;
    this.ly = 0.3;
  }

  build(r) {
    const dpr = Math.min(this.S.dpr, 1.5);
    const c = document.createElement('canvas');
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'alphabetic';
    this.section.querySelectorAll('[data-press]').forEach((el) => {
      const cs = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      const fs = parseFloat(cs.fontSize);
      ctx.font = `${cs.fontWeight} ${fs}px ${cs.fontFamily}`;
      if ('fontVariationSettings' in ctx) ctx.fontVariationSettings = cs.fontVariationSettings;
      if ('letterSpacing' in ctx) ctx.letterSpacing = cs.letterSpacing;
      const lh = parseFloat(cs.lineHeight);
      const m = ctx.measureText('Hg');
      const asc = m.fontBoundingBoxAscent;
      const desc = m.fontBoundingBoxDescent;
      const lines = el.innerText.split('\n');
      lines.forEach((line, i) => {
        const y = b.top - r.top + i * lh + (lh - (asc + desc)) / 2 + asc;
        ctx.fillText(line, b.left - r.left, y);
      });
    });
    this.u.uTex.value?.dispose();
    this.u.uTex.value = canvasTex(c, { srgb: false });
  }

  update(r, on) {
    if (!on) return;
    const { S, u } = this;
    const key = `${Math.round(r.width)}x${Math.round(r.height)}`;
    if (key !== this.key) {
      this.key = key;
      this.build(r);
    }
    u.uSize.value.set(r.width, r.height);
    u.uTime.value = S.time;
    // the lamp: follows the pointer, drifts on its own when there is none
    const inside = S.mouse.seen && !S.touch && S.mouse.sy > r.top && S.mouse.sy < r.bottom;
    const ax = inside ? (S.mouse.sx - r.left) / r.width : 0.5 + Math.sin(S.time * 0.25) * 0.35;
    const ay = inside ? (S.mouse.sy - r.top) / r.height : clamp01((S.h * 0.35 - r.top) / r.height) + Math.cos(S.time * 0.21) * 0.05;
    this.lx = damp(this.lx, ax, 3, S.dt);
    this.ly = damp(this.ly, ay, 3, S.dt);
    u.uLamp.value.set(this.lx * r.width, (1 - this.ly) * r.height, 520);
  }

  render(renderer) {
    renderer.render(this.scene, this.camera);
  }
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
