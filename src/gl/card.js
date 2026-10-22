import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import QRCode from 'qrcode';
import { DISPLAY, SANS, clamp, damp, Spring } from './core.js';

/*
 * Contato: Davi's business card as a real object. Black metal, silver foil type,
 * an environment to reflect, a light that follows the pointer. Tilt it, drag it, flip it.
 */

const CW = 3.4;
const CH = 2.145;
const TEX_W = 2048;
const TEX_H = Math.round((TEX_W * CH) / CW);

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function remapUV(geo) {
  const p = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + CW / 2) / CW, (p.getY(i) + CH / 2) / CH);
  uv.needsUpdate = true;
}

// draws one side twice: colour, and roughness/metalness (G/B) so the foil glints and the card stays matte
function side(draw) {
  const make = (mode) => {
    const c = document.createElement('canvas');
    c.width = TEX_W;
    c.height = TEX_H;
    const ctx = c.getContext('2d');
    if (mode === 'color') {
      ctx.fillStyle = '#08090c';
      ctx.fillRect(0, 0, TEX_W, TEX_H);
    } else {
      // brushed body: horizontal streaks in the roughness
      ctx.fillStyle = 'rgb(0,125,70)';
      ctx.fillRect(0, 0, TEX_W, TEX_H);
      for (let y = 0; y < TEX_H; y += 2) {
        ctx.fillStyle = `rgba(0,${105 + Math.random() * 50},70,0.5)`;
        ctx.fillRect(0, y, TEX_W, 1 + Math.random() * 2);
      }
    }
    const ink = mode === 'color' ? '#e2dccf' : 'rgb(0,55,255)';
    const dim = mode === 'color' ? 'rgba(226,220,207,.6)' : 'rgb(0,80,220)';
    draw(ctx, ink, dim);
    return c;
  };
  const color = new THREE.CanvasTexture(make('color'));
  color.colorSpace = THREE.SRGBColorSpace;
  color.anisotropy = 8;
  const orm = new THREE.CanvasTexture(make('orm'));
  orm.colorSpace = THREE.NoColorSpace;
  orm.anisotropy = 8;
  return { color, orm };
}

function txt(ctx, s, x, y, font, spacing = 0, align = 'left') {
  ctx.font = font;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
  ctx.textAlign = align;
  ctx.fillText(s, x, y);
}

export class Card {
  constructor(S, el, { whatsapp, phone, email }) {
    this.S = S;
    this.el = el;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    this.camera.position.set(0, 0, 9);
    const pmrem = new THREE.PMREMGenerator(S.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.16;

    const P = 120;
    const front = side((ctx, ink, dim) => {
      ctx.fillStyle = dim;
      txt(ctx, 'NATTOS CAPITAL  |  BTG PACTUAL', P, P + 30, `500 34px ${SANS}`, 8);
      txt(ctx, 'PORTO ALEGRE · RS', TEX_W - P, P + 30, `500 34px ${SANS}`, 8, 'right');
      ctx.fillStyle = ink;
      txt(ctx, 'Davi Cogo', P - 8, TEX_H - P - 110, `300 230px ${DISPLAY}`, -6);
      ctx.fillStyle = dim;
      txt(ctx, 'ASSESSOR DE INVESTIMENTOS', P, TEX_H - P, `500 40px ${SANS}`, 10);
    });

    const qr = QRCode.create(whatsapp, { errorCorrectionLevel: 'M' });
    const back = side((ctx, ink, dim) => {
      ctx.fillStyle = dim;
      txt(ctx, 'WHATSAPP', P, P + 30, `500 32px ${SANS}`, 8);
      ctx.fillStyle = ink;
      txt(ctx, phone, P, P + 120, `300 84px ${DISPLAY}`, -1);
      ctx.fillStyle = dim;
      txt(ctx, 'E-MAIL', P, P + 260, `500 32px ${SANS}`, 8);
      ctx.fillStyle = ink;
      txt(ctx, email, P, P + 330, `400 46px ${SANS}`, 0);
      ctx.fillStyle = dim;
      txt(ctx, 'Assessor de investimentos vinculado à Nattos Capital,', P, TEX_H - P - 50, `400 30px ${SANS}`, 1);
      txt(ctx, 'escritório credenciado ao BTG Pactual.', P, TEX_H - P, `400 30px ${SANS}`, 1);
      // QR to WhatsApp, in foil
      const n = qr.modules.size;
      const box = 560;
      const cell = box / n;
      const ox = TEX_W - P - box;
      const oy = TEX_H - P - box;
      ctx.fillStyle = ink;
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) if (qr.modules.get(x, y)) ctx.fillRect(ox + x * cell, oy + y * cell, cell + 0.6, cell + 0.6);
    });

    const shape = roundedRect(CW, CH, 0.14);
    const depth = 0.03;
    const body = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 3, curveSegments: 16 }),
      new THREE.MeshPhysicalMaterial({ color: 0x101216, metalness: 0.5, roughness: 0.4 }),
    );
    body.geometry.translate(0, 0, -depth / 2);

    const faceGeo = new THREE.ShapeGeometry(shape, 16);
    remapUV(faceGeo);
    const mat = (t) =>
      new THREE.MeshPhysicalMaterial({
        map: t.color,
        roughnessMap: t.orm,
        metalnessMap: t.orm,
        roughness: 1,
        metalness: 1,
        clearcoat: 0.25,
        clearcoatRoughness: 0.55,
      });
    const f = new THREE.Mesh(faceGeo, mat(front));
    f.position.z = depth / 2 + 0.0075;
    const b = new THREE.Mesh(faceGeo, mat(back));
    b.rotation.y = Math.PI;
    b.position.z = -(depth / 2 + 0.0075);

    this.card = new THREE.Group();
    this.card.add(body, f, b);
    this.holder = new THREE.Group();
    this.holder.add(this.card);
    this.scene.add(this.holder);

    // soft shadow on an invisible floor beneath the card
    const sc = document.createElement('canvas');
    sc.width = sc.height = 256;
    const sx = sc.getContext('2d');
    const g = sx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(0,0,0,.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    sx.fillStyle = g;
    sx.fillRect(0, 0, 256, 256);
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(CW * 1.4, 0.9),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = -1.75;
    this.scene.add(this.shadow);

    this.key = new THREE.DirectionalLight(0xffffff, 2.2);
    this.key.position.set(2, 3, 5);
    this.scene.add(this.key);
    this.pointLight = new THREE.PointLight(0xfff0dd, 4, 12, 1.4);
    this.scene.add(this.pointLight);

    this.rotY = new Spring(-Math.PI * 1.5, 38, 7.5);
    this.rotX = new Spring(0, 60, 10);
    this.face = 0;
    this.seen = false;
    this.tx = 0;
    this.ty = 0;
    this.bind();
  }

  bind() {
    const el = this.el;
    let down = null;
    el.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, base: this.rotY.t, moved: false };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - down.x;
      if (Math.abs(dx) > 4) down.moved = true;
      this.rotY.t = down.base + dx * 0.012;
    });
    const up = () => {
      if (!down) return;
      if (!down.moved) this.rotY.t = down.base + Math.PI;
      // settle on the nearest side
      this.rotY.t = Math.round(this.rotY.t / Math.PI) * Math.PI;
      down = null;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  update(r, on) {
    if (!on) return;
    const { S } = this;
    this.camera.aspect = r.width / r.height;
    this.camera.updateProjectionMatrix();
    const fit = Math.min(1, (r.width / r.height) / 1.25);
    this.camera.position.z = 9 / Math.max(0.55, fit);

    if (!this.seen && r.top < S.h * 0.7) {
      this.seen = true;
      this.rotY.t = 0;
    }
    const near = S.mouse.seen && !S.touch;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const nx = near ? clamp((S.mouse.sx - cx) / (r.width * 0.6), -1, 1) : 0;
    const ny = near ? clamp((S.mouse.sy - cy) / (r.height * 0.6), -1, 1) : 0;
    this.tx = damp(this.tx, nx, 4, S.dt);
    this.ty = damp(this.ty, ny, 4, S.dt);
    this.rotX.t = this.ty * 0.32;

    const t = S.time;
    this.card.rotation.y = this.rotY.step(S.dt) + this.tx * 0.45;
    this.card.rotation.x = this.rotX.step(S.dt) + Math.sin(t * 0.7) * 0.03;
    this.card.rotation.z = Math.sin(t * 0.5) * 0.015 - this.tx * 0.03;
    this.card.position.y = Math.sin(t * 0.9) * 0.05 + 0.15;
    this.shadow.material.opacity = 0.75 - Math.sin(t * 0.9) * 0.1;
    this.shadow.scale.x = Math.abs(Math.cos(this.card.rotation.y)) * 0.7 + 0.3;
    this.pointLight.position.set(this.tx * 4, -this.ty * 3 + 0.5, 3);
  }

  render(renderer) {
    renderer.render(this.scene, this.camera);
  }
}
