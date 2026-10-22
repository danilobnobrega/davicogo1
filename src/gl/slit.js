import * as THREE from 'three';
import { clamp, damp, easeInOut } from './core.js';

/*
 * The photograph opens from a slit. Rows outside the aperture are the edge row
 * dragged out into long streaks of colour, which retract as the frame opens.
 */
const FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform float uP, uBox, uImg, uShift, uTime;
uniform vec2 uMouse;
uniform float uHover;
varying vec2 vUv;
vec2 cover(vec2 uv) {
  vec2 s = uBox > uImg ? vec2(1., uImg / uBox) : vec2(uBox / uImg, 1.);
  s /= 1.08;                                        // room for parallax
  return (uv - .5) * s + vec2(.5, .5 + uShift);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
void main() {
  float a = uP * .5;
  float dy = vUv.y - .5;
  float ey = .5 + clamp(dy, -a, a);
  // streaks: each column keeps the colour of the aperture edge, slightly sheared
  float beyond = max(abs(dy) - a, 0.);
  vec2 uv = cover(vec2(vUv.x + sign(dy) * beyond * .03, ey));
  vec3 col = texture2D(uTex, uv).rgb;
  float span = .5 - a + 1e-4;
  float fade = 1. - smoothstep(0., span, beyond * (1.25 + hash(vec2(floor(vUv.x * 420.), 1.)) * .6));
  col *= 1. + beyond * .9;
  // a pointer lens: the frame bulges slightly where the cursor rests
  vec2 d = vUv - uMouse;
  float m = exp(-dot(d * vec2(uBox, 1.), d * vec2(uBox, 1.)) / .02) * uHover * step(beyond, 0.);
  if (m > .001) col = texture2D(uTex, cover(vUv - d * m * .12)).rgb;
  float alpha = beyond > 0. ? fade : 1.;
  alpha *= smoothstep(0., .02, uP + .02);
  gl_FragColor = vec4(col, alpha);
}
`;

export class Slit {
  constructor(S, el, tex) {
    this.S = S;
    this.el = el;
    tex.colorSpace = THREE.NoColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, -1, 1);
    this.u = {
      uTex: { value: tex },
      uP: { value: 0 },
      uBox: { value: 0.8 },
      uImg: { value: tex.image.width / tex.image.height },
      uShift: { value: 0 },
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uHover: { value: 0 },
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
    this.p = 0;
    this.hover = 0;
  }
  update(r, on) {
    if (!on) return;
    const { S, u } = this;
    const target = easeInOut(clamp((S.h * 0.92 - r.top) / (S.h * 0.75)));
    this.p = damp(this.p, target, 6, S.dt);
    u.uP.value = this.p;
    u.uBox.value = r.width / r.height;
    u.uShift.value = clamp((r.top + r.height / 2 - S.h / 2) / S.h, -1, 1) * -0.035;
    const mx = (S.mouse.sx - r.left) / r.width;
    const my = 1 - (S.mouse.sy - r.top) / r.height;
    const inside = !S.touch && mx > 0 && mx < 1 && my > 0 && my < 1;
    this.hover = damp(this.hover, inside ? 1 : 0, 4, S.dt);
    u.uMouse.value.set(mx, my);
    u.uHover.value = this.hover;
  }
  render(renderer) {
    renderer.render(this.scene, this.camera);
  }
}
