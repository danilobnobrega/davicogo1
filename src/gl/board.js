import * as THREE from 'three';
import { PAPER, INK, DISPLAY, SANS, clamp, damp, wrap, canvasTex, raw, Spring } from './core.js';

/*
 * Como posso te ajudar: a rotating billboard. The board is a row of square slats;
 * each of the four faces of every slat carries one strip of one service panel.
 * Scrolling turns the slats one after another, left to right, with a mechanical overshoot.
 */

const FACE_VERT = /* glsl */ `
uniform float uU0, uU1;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vP;
varying float vX;
void main() {
  vX = uv.x;
  vUv = vec2(mix(uU0, uU1, uv.x), uv.y);
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.);
  vP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FACE_FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform vec3 uCam, uLight;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vP;
varying float vX;
void main() {
  vec3 c = texture2D(uTex, vUv).rgb;
  // the joint between two slats: a fine line of shade on each edge
  float fw = fwidth(vX);
  float edge = min(vX, 1. - vX) / fw;
  c *= mix(.72, 1., smoothstep(.3, 1.6, edge));
  vec3 v = normalize(uCam - vP);
  vec3 l = normalize(uLight - vP);
  float facing = clamp(dot(vN, v), 0., 1.);
  float diff = clamp(dot(vN, l), 0., 1.);
  vec3 h = normalize(l + v);
  float spec = pow(clamp(dot(vN, h), 0., 1.), 90.) * .07;
  // faces turning away fall into shadow
  float shade = mix(.22, 1., pow(facing, .8)) * (.9 + .1 * diff);
  c = c * shade + spec;
  gl_FragColor = vec4(c, 1.);
}
`;

function panel(i, svc, W, H, mobile) {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const dark = i % 2 === 1;
  const bg = dark ? '#151a22' : PAPER;
  const fg = dark ? '#ece7de' : INK;
  const fg2 = dark ? 'rgba(236,231,222,.66)' : 'rgba(18,22,29,.66)';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const pad = Math.round(Math.min(W, H) * 0.07);
  const u = H / 100;

  ctx.fillStyle = fg2;
  ctx.font = `500 ${Math.round(u * (mobile ? 2.4 : 3))}px ${SANS}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(u * 0.5)}px`;
  ctx.textBaseline = 'top';
  ctx.fillText(`0${i + 1}`, pad, pad);

  ctx.fillStyle = fg;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${-Math.round(u * 0.9)}px`;
  let size = Math.round(u * (mobile ? 16 : 30));
  ctx.font = `300 ${size}px ${DISPLAY}`;
  while (ctx.measureText(svc.title).width > W - pad * 2 && size > 20) {
    size -= 4;
    ctx.font = `300 ${size}px ${DISPLAY}`;
  }
  ctx.textBaseline = 'alphabetic';
  const titleY = mobile ? H * 0.42 : H - pad - u * 2;
  ctx.fillText(svc.title, pad - size * 0.04, titleY);

  ctx.fillStyle = fg2;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  const bs = Math.round(u * (mobile ? 3.4 : 3.3));
  ctx.font = `400 ${bs}px ${SANS}`;
  const colW = mobile ? W - pad * 2 : W * 0.34;
  const lines = wrap(ctx, svc.text, colW);
  const x = mobile ? pad : W - pad - colW;
  const y0 = mobile ? H * 0.5 : pad + u * 18;
  lines.forEach((l, k) => ctx.fillText(l, x, y0 + k * bs * 1.45));

  // a thin rule under the header, like a printed poster
  ctx.fillStyle = dark ? 'rgba(236,231,222,.16)' : 'rgba(18,22,29,.16)';
  ctx.fillRect(pad, pad + u * 7, W - pad * 2, Math.max(1, Math.round(u * 0.15)));
  return canvasTex(c, { srgb: false });
}

export class Board {
  constructor(S, el, services) {
    this.S = S;
    this.el = el;
    this.services = services;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(22, 1, 0.1, 100);
    this.camera.position.set(0, 0, 12);
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.k = 0;
    this.tx = 0;
    this.ty = 0;
    this.light = new THREE.Vector3(0, 3, 8);
    this.uCam = new THREE.Vector3();
  }

  build(r) {
    const { S } = this;
    this.group.clear();
    this.textures?.forEach((t) => t.dispose());
    const aspect = r.width / r.height;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    const visH = 2 * 12 * Math.tan(THREE.MathUtils.degToRad(11));
    const visW = visH * aspect;
    const W = visW * 0.9;
    const H = visH * 0.86;
    const N = S.mobile ? 9 : 22;
    const w = W / N;

    const px = Math.min(2600, Math.round(r.width * Math.min(S.dpr, 1.6)));
    const py = Math.round(px * (H / W));
    this.textures = this.services.map((s, i) => panel(i, s, px, py, S.mobile));

    const geo = new THREE.PlaneGeometry(w, H);
    this.slats = [];
    for (let i = 0; i < N; i++) {
      const slat = new THREE.Group();
      slat.position.x = -W / 2 + w * (i + 0.5);
      for (let f = 0; f < 4; f++) {
        const mat = new THREE.ShaderMaterial({
          vertexShader: FACE_VERT,
          fragmentShader: FACE_FRAG,
          uniforms: {
            uTex: { value: this.textures[f] },
            uU0: { value: i / N },
            uU1: { value: (i + 1) / N },
            uCam: { value: this.uCam },
            uLight: { value: this.light },
          },
        });
        const m = new THREE.Mesh(geo, mat);
        const a = (f * Math.PI) / 2;
        m.rotation.y = a;
        m.position.set(Math.sin(a) * (w / 2), 0, Math.cos(a) * (w / 2));
        slat.add(m);
      }
      const spring = new Spring(-this.k * (Math.PI / 2), 90, 11);
      this.slats.push({ g: slat, spring, due: 0, goal: spring.v });
      slat.rotation.y = spring.v;
      this.group.add(slat);
    }
  }

  set(k) {
    if (k === this.k) return;
    this.k = k;
    const now = this.S.time;
    this.slats?.forEach((s, i) => {
      s.due = now + i * (this.S.mobile ? 0.05 : 0.028);
      s.goal = -k * (Math.PI / 2);
    });
  }

  update(r, on) {
    if (!on) return;
    const { S } = this;
    const key = `${Math.round(r.width)}x${Math.round(r.height)}`;
    if (key !== this.key) {
      this.key = key;
      this.build(r);
    }
    for (const s of this.slats) {
      if (S.time >= s.due) s.spring.t = s.goal;
      s.g.rotation.y = s.spring.step(S.dt);
    }
    this.tx = damp(this.tx, S.mouse.seen ? (S.mouse.sx / S.w) * 2 - 1 : 0, 2.5, S.dt);
    this.ty = damp(this.ty, S.mouse.seen ? (S.mouse.sy / S.h) * 2 - 1 : 0, 2.5, S.dt);
    this.group.rotation.y = this.tx * 0.07;
    this.group.rotation.x = this.ty * 0.05;
    this.light.set(this.tx * 9, 3 - this.ty * 4, 8);
    this.uCam.copy(this.camera.position);
  }

  render(renderer) {
    renderer.render(this.scene, this.camera);
  }
}
