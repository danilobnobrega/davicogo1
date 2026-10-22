import * as THREE from 'three';

export const BG = '#07090d';
export const FG = '#ece7de';
export const PAPER = '#ebe5da';
export const INK = '#12161d';

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 4);
export const easeInOut = (t) => {
  t = clamp(t);
  return t < 0.5 ? 8 * t ** 4 : 1 - Math.pow(-2 * t + 2, 4) / 2;
};

// a damped spring, used wherever something physical has to settle
export class Spring {
  constructor(v = 0, k = 120, c = 14) {
    this.v = v;
    this.t = v;
    this.vel = 0;
    this.k = k;
    this.c = c;
  }
  step(dt) {
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = (this.t - this.v) * this.k - this.vel * this.c;
      this.vel += a * h;
      this.v += this.vel * h;
    }
    return this.v;
  }
}

/*
 * One renderer, one fixed canvas. Every section owns a "view": its own scene and camera,
 * drawn only inside the screen rectangle of its DOM element (viewport + scissor).
 */
export function createGL(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(new THREE.Color(BG), 1);
  renderer.autoClear = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const S = {
    renderer,
    w: 1,
    h: 1,
    dpr: 1,
    time: 0,
    dt: 1 / 60,
    touch: matchMedia('(hover: none)').matches,
    mobile: false,
    mouse: { x: -1, y: -1, sx: -1, sy: -1, vx: 0, vy: 0, seen: false },
    views: [],
  };

  S.resize = () => {
    S.w = window.innerWidth;
    S.h = window.innerHeight;
    S.mobile = S.w <= 820;
    S.dpr = Math.min(window.devicePixelRatio || 1, S.mobile ? 2 : 1.75);
    renderer.setPixelRatio(S.dpr);
    renderer.setSize(S.w, S.h, false);
    S.views.forEach((v) => v.resize?.());
  };

  S.add = (v) => {
    S.views.push(v);
    return v;
  };

  S.render = () => {
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, S.w, S.h);
    renderer.clear();
    renderer.setScissorTest(true);
    for (const v of S.views) {
      const r = v.el.getBoundingClientRect();
      v.rect = r;
      const on = r.bottom > -2 && r.top < S.h + 2 && r.width > 0 && r.height > 0;
      v.update?.(r, on);
      if (!on || v.hidden) continue;
      const top = Math.max(0, r.top);
      const bottom = Math.min(S.h, r.bottom);
      renderer.setViewport(r.left, S.h - r.bottom, r.width, r.height);
      renderer.setScissor(r.left, S.h - bottom, r.width, bottom - top);
      v.render(renderer);
    }
  };

  S.resize();
  return S;
}

export function loadTexture(url, srgb = true) {
  return new Promise((res, rej) =>
    new THREE.TextureLoader().load(
      url,
      (t) => {
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.anisotropy = 8;
        res(t);
      },
      undefined,
      rej,
    ),
  );
}

export function canvasTex(canvas, { srgb = true, mips = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.generateMipmaps = mips;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.anisotropy = 8;
  return t;
}

// wraps text to a width on a 2d context; returns lines
export function wrap(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

export const DISPLAY = '"Fraunces Variable", serif';
export const SANS = '"Geist Variable", sans-serif';

// sRGB hex as a raw vec3, for custom shaders that write straight to the screen
export const raw = (hex) => {
  const c = parseInt(hex.slice(1), 16);
  return new THREE.Vector3(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255);
};
