import * as THREE from 'three';
import opentype from 'opentype.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BG, clamp, damp, lerp, smooth } from './core.js';

/*
 * Trajetória: the years are real extruded type standing on a polished floor.
 * Scrolling dollies the camera from one year to the next; the pointer carries a spotlight.
 */

function textGeometry(font, text, size) {
  const path = font.getPath(text, 0, 0, size);
  const sp = new THREE.ShapePath();
  for (const c of path.commands) {
    if (c.type === 'M') sp.moveTo(c.x, -c.y);
    else if (c.type === 'L') sp.lineTo(c.x, -c.y);
    else if (c.type === 'Q') sp.quadraticCurveTo(c.x1, -c.y1, c.x, -c.y);
    else if (c.type === 'C') sp.bezierCurveTo(c.x1, -c.y1, c.x2, -c.y2, c.x, -c.y);
  }
  const shapes = sp.toShapes(false);
  const geo = new THREE.ExtrudeGeometry(shapes, {
    depth: size * 0.16,
    curveSegments: 10,
    bevelEnabled: true,
    bevelThickness: size * 0.012,
    bevelSize: size * 0.008,
    bevelSegments: 4,
  });
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  // stand on the floor, centred on x and z
  geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  geo.computeVertexNormals();
  return geo;
}

const YEARS = ['2021', '2022', '2026', 'Hoje'];
const GAP = 17.5;

export class Journey {
  constructor(S, el, labels, sectionEl, fontUrl) {
    this.S = S;
    this.el = el;
    this.labels = labels;
    this.section = sectionEl;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(BG);
    this.scene.fog = new THREE.Fog(BG, 9, 24);
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
    this.ready = this.build(fontUrl);
    this.p = 0;
    this.tx = 0;
    this.ty = 0;
    this.anchor = new THREE.Vector3();
  }

  async build(url) {
    const buf = await (await fetch(url)).arrayBuffer();
    const font = opentype.parse(buf);
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xf4efe6,
      roughness: 0.38,
      metalness: 0.0,
      clearcoat: 0.7,
      clearcoatRoughness: 0.18,
    });
    this.items = YEARS.map((y, i) => {
      const geo = textGeometry(font, y, 3.2);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(i * GAP, 0, 0);
      m.castShadow = true;
      this.scene.add(m);
      // the reflection: a mirrored copy under a translucent floor
      const r = new THREE.Mesh(geo, mat);
      r.scale.y = -1;
      r.position.copy(m.position);
      this.scene.add(r);
      const w = geo.boundingBox.max.x - geo.boundingBox.min.x;
      return { m, r, w };
    });

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 60),
      new THREE.MeshBasicMaterial({ color: BG, transparent: true, opacity: 0.86 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(GAP * 1.5, 0.001, 0);
    this.scene.add(floor);
    const shade = new THREE.Mesh(new THREE.PlaneGeometry(200, 60), new THREE.ShadowMaterial({ opacity: 0.55 }));
    shade.rotation.x = -Math.PI / 2;
    shade.position.set(GAP * 1.5, 0.002, 0);
    shade.receiveShadow = true;
    this.scene.add(shade);

    this.scene.add(new THREE.HemisphereLight(0xd9d3c8, 0x08090c, 0.22));
    const rim = new THREE.DirectionalLight(0xdfe6f5, 1.2);
    rim.position.set(-4, 6, -10);
    this.scene.add(rim);
    const key = new THREE.DirectionalLight(0xfff4e6, 1.05);
    key.position.set(3, 4, 12);
    this.scene.add(key);
    this.spot = new THREE.SpotLight(0xfff1dc, 420, 34, 0.62, 0.7, 1.5);
    this.spot.castShadow = true;
    this.spot.shadow.mapSize.set(1024, 1024);
    this.spot.shadow.bias = -0.0004;
    this.spot.shadow.radius = 6;
    this.scene.add(this.spot, this.spot.target);
    this.fill = new THREE.PointLight(0xbcc6d8, 6, 16, 1.5);
    this.scene.add(this.fill);
    const pmrem = new THREE.PMREMGenerator(this.S.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.32;
    this.built = true;
  }

  update(r, on) {
    const { S } = this;
    // section progress drives the camera between years, dwelling on each
    const sr = this.section.getBoundingClientRect();
    const target = clamp(-sr.top / (sr.height - S.h));
    this.p = damp(this.p, target, 5, S.dt);
    if (!on || !this.built) {
      this.labels.forEach((l) => (l.style.opacity = 0));
      return;
    }
    this.camera.aspect = r.width / r.height;
    this.camera.updateProjectionMatrix();

    const t = this.p * (YEARS.length - 1);
    const i = Math.min(YEARS.length - 2, Math.floor(t));
    const f = smooth(0, 1, t - i);
    const focus = (i + f) * GAP;
    const mobile = S.mobile;

    this.tx = damp(this.tx, S.mouse.seen ? (S.mouse.sx / S.w) * 2 - 1 : 0, 2, S.dt);
    this.ty = damp(this.ty, S.mouse.seen ? (S.mouse.sy / S.h) * 2 - 1 : 0, 2, S.dt);

    // a slow sideways glide as well as the dolly, so the type is seen turning in perspective
    const swing = Math.sin(f * Math.PI) * 0.8;
    const camX = focus + (mobile ? 0 : 0.6) + swing + this.tx * 0.6;
    // distance that fits the year (and its label, on desktop) for this aspect
    const need = mobile ? 8.6 : 17;
    const camZ = need / (2 * Math.tan(THREE.MathUtils.degToRad(17)) * this.camera.aspect);
    this.camera.position.set(camX, 2.4 - this.ty * 0.35 + camZ * 0.05, camZ);
    this.scene.fog.near = camZ * 1.05;
    this.scene.fog.far = camZ * 2.3;
    this.camera.lookAt(focus + (mobile ? 0 : 2.4), mobile ? 2.2 : 1.8, 0);

    // the spotlight follows the pointer across the type
    const lx = focus + this.tx * 4;
    this.spot.position.set(lx - 2, 7.5, 5.5);
    this.spot.target.position.set(lx, 1.7, 0);
    this.fill.position.set(focus + 5, 2.5, 3);

    // labels sit beside the year in focus, projected from 3D
    this.labels.forEach((el, k) => {
      const it = this.items[k];
      const d = Math.abs(t - k);
      const vis = 1 - smooth(0.25, 0.6, d);
      if (mobile) this.anchor.set(k * GAP - it.w * 0.5, -2.3, 0);
      else this.anchor.set(k * GAP + it.w * 0.5 + 0.9, 3.1, 0);
      this.anchor.project(this.camera);
      const x = (this.anchor.x * 0.5 + 0.5) * r.width;
      const y = (-this.anchor.y * 0.5 + 0.5) * r.height;
      el.style.opacity = vis.toFixed(3);
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translateY(${((1 - vis) * 24).toFixed(1)}px)`;
    });
  }

  render(renderer) {
    if (!this.built) return;
    renderer.render(this.scene, this.camera);
  }
}
