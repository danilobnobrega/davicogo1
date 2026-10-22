import * as THREE from 'three';
import { BG, FG, DISPLAY, SANS, clamp, damp, easeOut, easeInOut, canvasTex, raw } from './core.js';

/*
 * Hero: Davi stands in the middle; two rings of type orbit him in 3D.
 * The far half of each ring passes behind him, the near half in front.
 */

const PHOTO_FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform float uIntro, uOut, uTime;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec4 t = texture2D(uTex, vUv);
  // soften the matte so the edge reads as focus fall-off, not scissors
  // pull the matte in a touch: the outermost pixels still carry the bright window behind him
  float a = mix(t.a, texture2D(uTex, vUv, 1.6).a, .5);
  a = smoothstep(.3, .97, a);

  // grade it into the scene: less saturation, deeper mids, the white shirt pulled down
  vec3 c = t.rgb;
  // edge pixels: replace the window spill with the colour from just inside the figure
  float inner = texture2D(uTex, vUv, 2.2).a;
  vec3 deep = texture2D(uTex, vUv, 2.2).rgb / max(inner, .001);
  c = mix(c, min(c, deep), smoothstep(.98, .55, t.a));
  float l = dot(c, vec3(.299, .587, .114));
  c = mix(vec3(l), c, .84) * vec3(.95, .97, 1.);
  c = pow(c, vec3(1.1));
  c *= mix(1., .8, smoothstep(.72, 1., l));

  // studio light: key from the left, falling off across the body
  c *= mix(.72, 1.05, smoothstep(.85, .22, vUv.x));
  // rim lights where the figure meets the dark: cool from the back-right, warm from the left
  float rimR = clamp(a - texture2D(uTex, vUv + vec2(.014, .006), 1.2).a, 0., 1.);
  float rimL = clamp(a - texture2D(uTex, vUv + vec2(-.012, .004), 1.2).a, 0., 1.);
  c += vec3(.5, .6, .78) * rimR * .22 + vec3(.95, .82, .68) * rimL * .08;

  // the body sinks into the dark towards the bottom of the frame
  c *= mix(.3, 1., smoothstep(.0, .5, vUv.y));
  a *= smoothstep(0., .2, vUv.y);

  c += (hash(floor(gl_FragCoord.xy) + floor(uTime * 12.)) - .5) * .03;

  float rise = smoothstep(0., 1., (uIntro * 1.35 - (1. - vUv.y) * .35));
  a *= rise * (1. - smoothstep(.55, 1., uOut));
  gl_FragColor = vec4(c, a);
}
`;

// a soft pool of light on the backdrop behind him, with the same grain as the photo
const BACK_FRAG = /* glsl */ `
uniform vec3 uBg;
uniform vec2 uCenter;
uniform float uRadius, uIntro, uTime;
varying vec3 vW;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 d = (vW.xy - uCenter) / vec2(uRadius * 1.15, uRadius);
  float glow = exp(-dot(d, d) * 1.6);
  vec3 c = uBg + vec3(.07, .085, .11) * glow * uIntro;
  c += (hash(floor(gl_FragCoord.xy) + floor(uTime * 12.)) - .5) * .02;
  gl_FragColor = vec4(c, 1.);
}
`;

const RING_VERT = /* glsl */ `
varying vec2 vUv;
varying float vFace;
void main() {
  vUv = uv;
  vec3 n = normalize(normalMatrix * normal);
  vFace = n.z;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
}
`;

const RING_FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform vec3 uColor;
uniform float uAlpha, uBack, uIntro;
varying vec2 vUv;
varying float vFace;
void main() {
  float a = texture2D(uTex, vUv).a;
  // the near half reads at full strength, the far half sits back in the dark
  float face = uBack > .5 ? -vFace : vFace;
  float k = uBack > .5 ? .26 * smoothstep(-.2, .7, face) : smoothstep(-.35, .45, face);
  a *= k * uAlpha * uIntro;
  if (a < .003) discard;
  gl_FragColor = vec4(uColor, a);
}
`;

function ringTexture(text, { font, size, copies, letter = 0, dpr = 1 }) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = `${font}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${letter}px`;
  const unit = ctx.measureText(text).width;
  c.width = Math.min(8192, Math.ceil(unit * copies));
  c.height = Math.ceil(size * 1.35);
  ctx.font = font;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${letter}px`;
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < copies; i++) ctx.fillText(text, i * unit, c.height * 0.53);
  const t = canvasTex(c, { srgb: false });
  t.wrapS = THREE.RepeatWrapping;
  return { tex: t, ratio: c.width / c.height };
}

function makeRing({ text, font, size, copies, letter, radius, alpha }) {
  const { tex, ratio } = ringTexture(text, { font, size, copies, letter });
  // height follows from the texture ratio so glyphs keep their proportions
  const height = (2 * Math.PI * radius) / ratio;
  const geo = new THREE.CylinderGeometry(radius, radius, height, 256, 1, true);
  tex.repeat.x = -1; // read left to right on the near side
  const mk = (back) =>
    new THREE.ShaderMaterial({
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
      uniforms: {
        uTex: { value: tex },
        uColor: { value: raw(FG) },
        uAlpha: { value: alpha },
        uBack: { value: back ? 1 : 0 },
        uIntro: { value: 0 },
      },
      side: back ? THREE.BackSide : THREE.FrontSide,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
  const back = new THREE.Mesh(geo, mk(true));
  const front = new THREE.Mesh(geo, mk(false));
  back.renderOrder = 0;
  front.renderOrder = 2;
  const spin = new THREE.Group();
  spin.add(back, front);
  const tilt = new THREE.Group();
  tilt.add(spin);
  return { tilt, spin, back, front, height };
}

export class Hero {
  constructor(S, el, cutTex) {
    this.S = S;
    this.el = el;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    this.camera.position.set(0, 0, 10);

    cutTex.colorSpace = THREE.NoColorSpace;
    this.photoU = { uTex: { value: cutTex }, uIntro: { value: 0 }, uOut: { value: 0 }, uTime: { value: 0 } };
    this.photo = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
        fragmentShader: PHOTO_FRAG,
        uniforms: this.photoU,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.photo.renderOrder = 1;
    this.scene.add(this.photo);

    this.backU = {
      uBg: { value: raw(BG) },
      uCenter: { value: new THREE.Vector2(0, 0) },
      uRadius: { value: 2 },
      uIntro: { value: 0 },
      uTime: { value: 0 },
    };
    this.back = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 30),
      new THREE.ShaderMaterial({
        vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: BACK_FRAG,
        uniforms: this.backU,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.back.position.z = -2;
    this.back.renderOrder = -1;
    this.scene.add(this.back);

    this.big = makeRing({
      text: 'Davi Cogo  ·  ',
      font: `300 220px ${DISPLAY}`,
      size: 220,
      copies: 3,
      letter: -6,
      radius: 3.05,
      alpha: 1,
    });
    this.small = makeRing({
      text: 'ASSESSOR DE INVESTIMENTOS  ·  NATTOS CAPITAL | BTG PACTUAL  ·  ',
      font: `500 44px ${SANS}`,
      size: 44,
      copies: 3,
      letter: 9,
      radius: 3.55,
      alpha: 0.85,
    });
    this.scene.add(this.big.tilt, this.small.tilt);

    this.tx = 0;
    this.ty = 0;
    this.spinBig = 0.6;
    this.spinSmall = -0.4;
    this.intro = 0;
    this.out = 0;
  }

  layout(r) {
    const aspect = r.width / r.height;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    const visH = 2 * 10 * Math.tan(THREE.MathUtils.degToRad(15));
    const visW = visH * aspect;
    this.visH = visH;
    // the portrait stands on the bottom edge; on narrow screens it fills the width
    const size = Math.min(visH * 0.9, visW * (this.S.mobile ? 1.55 : 1.18));
    this.photoSize = size;
    this.photo.scale.set(size, size, 1);
    this.photoY = -visH / 2 + size / 2;
    // rings scale with the portrait so the composition holds on every screen
    const k = size / (visH * 0.9);
    this.ringScale = Math.max(k, 0.6);
    this.ringY = this.photoY - size * 0.1;
  }

  update(r, on) {
    if (!on) return;
    const { S } = this;
    if (r.width !== this.lw || r.height !== this.lh) {
      this.lw = r.width;
      this.lh = r.height;
      this.layout(r);
    }
    const dt = S.dt;
    const nx = S.mouse.seen ? (S.mouse.sx / S.w) * 2 - 1 : 0;
    const ny = S.mouse.seen ? (S.mouse.sy / S.h) * 2 - 1 : 0;
    this.tx = damp(this.tx, nx, 2.2, dt);
    this.ty = damp(this.ty, ny, 2.2, dt);

    const intro = this.intro;
    const out = clamp(-r.top / (r.height * 0.9));
    this.out = out;
    const io = easeOut(intro);

    this.photoU.uIntro.value = clamp(intro * 1.4);
    this.photoU.uTime.value = S.time;
    this.backU.uTime.value = S.time;
    this.backU.uIntro.value = easeOut(clamp(intro * 1.2)) * (1 - out);
    this.backU.uCenter.value.set(this.photo.position.x * 0.5, this.photoY + this.photoSize * 0.18);
    this.backU.uRadius.value = this.photoSize * 0.55;
    this.photoU.uOut.value = out;
    this.photo.position.set(this.tx * 0.07, this.photoY - (1 - io) * 0.5 - out * 1.2, 0);

    // rings: arrive spinning fast, settle into a slow orbit; scroll and pointer tilt them
    const settle = 1 - easeOut(clamp(intro * 1.1 - 0.05));
    this.spinBig = 0.075 + settle * 2.8 + S.scrollV * 0.0009;
    this.spinSmall = -(0.05 + settle * 1.8 + S.scrollV * 0.0006);
    this.big.spin.rotation.y += this.spinBig * dt;
    this.small.spin.rotation.y += this.spinSmall * dt;

    const s = this.ringScale * (0.86 + 0.14 * io);
    const eo = easeInOut(out);
    this.big.tilt.scale.setScalar(s * (1 + eo * 0.25));
    this.big.tilt.position.set(0, this.ringY + this.photoSize * 0.0 + eo * 2.6, 0);
    this.big.tilt.rotation.set(0.2 + this.ty * 0.1 + eo * 0.9, 0, -0.06 - this.tx * 0.07);
    this.small.tilt.scale.setScalar(s * (1 + eo * 0.4));
    this.small.tilt.position.set(0, this.ringY - this.photoSize * 0.17 + eo * 1.4, 0);
    this.small.tilt.rotation.set(-0.12 + this.ty * 0.06 - eo * 0.5, 0, 0.1 - this.tx * 0.05);

    const ringIntro = clamp(intro * 1.6 - 0.25);
    const fade = 1 - smoothOut(out);
    for (const m of [this.big.back, this.big.front, this.small.back, this.small.front]) {
      m.material.uniforms.uIntro.value = ringIntro * fade;
    }
    this.camera.position.x = this.tx * 0.25;
    this.camera.position.y = -this.ty * 0.15;
    this.camera.lookAt(0, this.ringY * 0.4, 0);
  }

  render(renderer) {
    renderer.render(this.scene, this.camera);
  }
}

function smoothOut(x) {
  const t = clamp((x - 0.55) / 0.45);
  return t * t * (3 - 2 * t);
}
