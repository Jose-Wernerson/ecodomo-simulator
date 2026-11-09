/** Cena Three.js da EcoDomo. Desenhada em R = 10 unidades; proporções vêm do motor físico. */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { K, Params } from '../engine/params';
import { State } from '../engine/physics';

export type ViewMode = 'external' | 'cut' | 'inside';

export interface PartInfo { id: string; name: string; desc: string; }
export const PARTS: PartInfo[] = [
  { id: 'salt', name: 'Reservatório salino', desc: 'Anel de água salgada aquecido pelo Sol. A evaporação deixa o sal para trás e concentra a salmoura.' },
  { id: 'island', name: 'Ilha central', desc: 'Solo isolado da água salgada, com árvores, arbustos e gramíneas irrigados com água doce coletada.' },
  { id: 'dome', name: 'Cúpula de vidro', desc: 'Deixa a luz entrar. A face interna recebe a condensação quando está abaixo do ponto de orvalho do ar.' },
  { id: 'cool', name: 'Reservatório externo', desc: 'Água independente, bombeada em película sobre o vidro. Aquece ao retirar calor da cúpula e troca calor com o ambiente.' },
  { id: 'cover', name: 'Cobertura giratória', desc: 'Setor de sombreamento movido a motor elétrico. Sem energia suficiente, para onde está.' },
  { id: 'pv', name: 'Painéis fotovoltaicos', desc: 'Única fonte de eletricidade do sistema. A produção depende de irradiância, área, eficiência e temperatura.' },
  { id: 'motor', name: 'Motor e bateria', desc: 'Motor da cobertura e banco de baterias. Consumo e armazenamento entram no saldo energético.' },
  { id: 'gutter', name: 'Calha de coleta', desc: 'Recolhe a água que escorre pela face interna da cúpula.' },
  { id: 'tank', name: 'Tanque de água doce', desc: 'Guarda o condensado e abastece a irrigação da ilha.' },
  { id: 'sun', name: 'Sol', desc: 'Trajetória aparente causada pela rotação da Terra. A irradiância varia com a altura do Sol.' },
];

const C = (h: number) => new THREE.Color(h);
const R = 10;

export class DomeScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private structure = new THREE.Group();
  private dyn = new THREE.Group();
  private skyU = { top: { value: C(0x8fc4e4) }, bot: { value: C(0xdcecf2) } };
  private sunMesh: THREE.Mesh;
  private sunGlow: THREE.Sprite;
  private sunL: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private stars: THREE.Points;
  private saltMat = new THREE.MeshStandardMaterial({ color: 0x1f8fa0, roughness: 0.25, metalness: 0.1, side: THREE.DoubleSide });
  private coolMat = new THREE.MeshStandardMaterial({ color: 0x2b6cb0, roughness: 0.3, metalness: 0.1, side: THREE.DoubleSide });
  private cutSalt = new THREE.MeshBasicMaterial({ color: 0x1f8fa0, side: THREE.DoubleSide });
  private cutCool = new THREE.MeshBasicMaterial({ color: 0x2b6cb0, side: THREE.DoubleSide });
  private foliage!: THREE.MeshStandardMaterial;
  private grass!: THREE.MeshStandardMaterial;
  private dome!: THREE.Mesh;
  private coverPivot = new THREE.Group();
  private tankFill!: THREE.Mesh;
  private section = new THREE.Group();
  private ground!: THREE.Mesh;
  private droplets!: THREE.Points;
  private vapor!: THREE.Points;
  private vaporData: { a: number; r: number; y: number; v: number }[] = [];
  private runs!: THREE.Points;
  private runData: { th: number; ph: number; v: number }[] = [];
  private filmSheet!: THREE.Mesh;
  private key = '';
  private ri = 5.5; private ro = 16;
  private view: ViewMode = 'external';
  private cutPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  private camGoal: { p: THREE.Vector3; t: THREE.Vector3 } | null = null;
  private anchors: Record<string, THREE.Vector3> = {};
  private labelEls: Record<string, HTMLElement> = {};
  private showLabels = true;
  followSun = false;
  private ro2: ResizeObserver;
  private dot: THREE.CanvasTexture;
  private lastSunAz = 0;

  constructor(private host: HTMLElement, private labelHost: HTMLElement, onPick: (p: PartInfo) => void) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.localClippingEnabled = true;
    host.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
    this.camera.position.set(25, 15, 31);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 3.5, 0);
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 90;
    this.controls.addEventListener('start', () => { this.camGoal = null; });

    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.5, 'rgba(255,255,255,.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    this.dot = new THREE.CanvasTexture(c);

    // céu
    const sky = new THREE.Mesh(new THREE.SphereGeometry(240, 24, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.skyU,
      vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying float h; void main(){ gl_FragColor = vec4(mix(bot, top, pow(clamp(h,0.,1.),.55)),1.); }',
    }));
    this.scene.add(sky);
    this.scene.fog = new THREE.Fog(0xdcecf2, 90, 230);

    const pts = new Float32Array(1500);
    for (let i = 0; i < 500; i++) {
      const u = Math.random() * Math.PI * 2, v = Math.random() * 0.95 + 0.04;
      const r = 220, cv = Math.sqrt(1 - v * v);
      pts.set([r * cv * Math.cos(u), r * v, r * cv * Math.sin(u)], i * 3);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.4, color: 0xffffff, transparent: true, opacity: 0, fog: false, depthWrite: false, map: this.dot }));
    this.scene.add(this.stars);

    this.hemi = new THREE.HemisphereLight(0xcfe6f5, 0x8a7a5f, 1.2);
    this.sunL = new THREE.DirectionalLight(0xfff2dd, 3);
    this.scene.add(this.hemi, this.sunL, this.sunL.target);

    this.sunMesh = new THREE.Mesh(new THREE.SphereGeometry(2.2, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false }));
    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.dot, color: 0xffc766, transparent: true, opacity: 0.75, depthWrite: false, fog: false }));
    this.sunGlow.scale.setScalar(20);
    this.scene.add(this.sunMesh, this.sunGlow);

    const arc: THREE.Vector3[] = [];
    for (let i = 0; i <= 60; i++) arc.push(this.sunVec(Math.asin(Math.sin((Math.PI * i) / 60) * Math.sin(K.PEAK_ELEV)), 90 + 3 * i).multiplyScalar(70));
    this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(arc), new THREE.LineDashedMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.5, dashSize: 2, gapSize: 2, fog: false })));
    (this.scene.children[this.scene.children.length - 1] as THREE.Line).computeLineDistances();

    this.ground = new THREE.Mesh(new THREE.CircleGeometry(235, 48), new THREE.MeshStandardMaterial({ color: 0xbfae8a, roughness: 1, side: THREE.DoubleSide }));
    this.ground.rotation.x = -Math.PI / 2; this.ground.position.y = -0.02;
    this.scene.add(this.ground, this.structure, this.dyn, this.section);
    this.section.visible = false;

    this.buildParticles();
    PARTS.forEach((p) => {
      const b = document.createElement('button');
      b.className = 'lbl'; b.type = 'button'; b.textContent = p.name;
      b.onclick = () => onPick(p);
      labelHost.appendChild(b);
      this.labelEls[p.id] = b;
    });

    this.ro2 = new ResizeObserver(() => this.resize());
    this.ro2.observe(host);
    this.resize();
  }

  private sunVec(e: number, azDeg: number) {
    const a = (azDeg * Math.PI) / 180;
    return new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a));
  }

  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private buildParticles() {
    const mk = (n: number, size: number, color: number, op: number) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      return new THREE.Points(g, new THREE.PointsMaterial({ size, color, map: this.dot, transparent: true, opacity: op, depthWrite: false, sizeAttenuation: true }));
    };
    const nd = 2600;
    this.droplets = mk(nd, 0.13, 0xd8f2ff, 0.85);
    const dp = this.droplets.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < nd; i++) {
      const th = Math.acos(1 - Math.random() * 0.98), ph = Math.random() * Math.PI * 2, r = R - 0.06;
      dp.setXYZ(i, r * Math.sin(th) * Math.cos(ph), r * Math.cos(th) + 0.2, r * Math.sin(th) * Math.sin(ph));
    }
    this.vapor = mk(600, 0.7, 0xeaf6fb, 0.32);
    for (let i = 0; i < 600; i++) this.vaporData.push({ a: Math.random() * 6.28, r: 0, y: Math.random() * 7, v: 0.6 + Math.random() });
    this.runs = mk(360, 0.2, 0x9fdcff, 1);
    for (let i = 0; i < 360; i++) this.runData.push({ th: Math.random() * 1.5, ph: Math.random() * 6.28, v: 0.25 + Math.random() * 0.5 });
    this.scene.add(this.droplets, this.vapor, this.runs);
  }

  private rebuild(s: State, p: Params) {
    const dispose = (g: THREE.Group) => { g.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); }); g.clear(); };
    dispose(this.structure); dispose(this.section); this.coverPivot = new THREE.Group();
    const scale = R / s.geo.R;
    const ri = (this.ri = Math.min(8.6, Math.max(2.5, s.geo.islandR * scale)));
    const ro = (this.ro = Math.min(R * 2.8, Math.max(R * 1.25, s.geo.coolOuterR * scale)));
    const st = this.structure;
    const concrete = new THREE.MeshStandardMaterial({ color: 0x9aa39f, roughness: 0.85, side: THREE.DoubleSide });
    const add = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, rx = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.x = rx; st.add(o); return o; };

    // reservatório salino
    add(new THREE.RingGeometry(ri, R, 96, 1), this.saltMat, 0, 0.12, 0, -Math.PI / 2);
    add(new THREE.CylinderGeometry(ri, ri, 0.5, 64, 1, true), concrete, 0, 0.1, 0);
    // ilha
    const soil = new THREE.MeshStandardMaterial({ color: 0x7f6a48, roughness: 1, side: THREE.DoubleSide });
    const lat: THREE.Vector2[] = [];
    const h = (r: number) => 0.34 + 1.1 * Math.pow(Math.max(0, 1 - (r * r) / (ri * ri)), 0.8);
    for (let i = 0; i <= 28; i++) { const r = (ri * i) / 28; lat.push(new THREE.Vector2(r, h(r))); }
    add(new THREE.LatheGeometry(lat, 64), soil);
    // vegetação
    this.foliage = new THREE.MeshStandardMaterial({ color: 0x3f8f4c, roughness: 0.9 });
    this.grass = new THREE.MeshStandardMaterial({ color: 0x6fae55, roughness: 1, side: THREE.DoubleSide });
    const trunkM = new THREE.MeshStandardMaterial({ color: 0x5d452e, roughness: 1 });
    const rnd = mulberry(7);
    const nT = Math.round(6 + ri * 1.6);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.11, 1, 6), trunkM, nT);
    const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.62, 1), this.foliage, nT * 2);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = 0; i < nT; i++) {
      const a = rnd() * 6.28, r = Math.sqrt(rnd()) * ri * 0.82, x = r * Math.cos(a), z = r * Math.sin(a), y = h(r);
      const H = 1.1 + rnd() * 1.3;
      trunks.setMatrixAt(i, m.compose(new THREE.Vector3(x, y + H / 2, z), q, new THREE.Vector3(1, H, 1)));
      const sc = 0.9 + rnd() * 0.6;
      crowns.setMatrixAt(i * 2, m.compose(new THREE.Vector3(x, y + H + 0.25, z), q, new THREE.Vector3(sc, sc * 1.1, sc)));
      crowns.setMatrixAt(i * 2 + 1, m.compose(new THREE.Vector3(x + 0.22, y + H - 0.1, z - 0.18), q, new THREE.Vector3(sc * 0.7, sc * 0.7, sc * 0.7)));
    }
    st.add(trunks, crowns);
    const nG = Math.round(ri * ri * 16);
    const blades = new THREE.InstancedMesh(new THREE.ConeGeometry(0.06, 0.34, 4), this.grass, nG);
    for (let i = 0; i < nG; i++) {
      const a = rnd() * 6.28, r = Math.sqrt(rnd()) * ri * 0.97, s2 = 0.7 + rnd() * 0.9;
      blades.setMatrixAt(i, m.compose(new THREE.Vector3(r * Math.cos(a), h(r) + 0.14 * s2, r * Math.sin(a)), q, new THREE.Vector3(s2, s2, s2)));
    }
    st.add(blades);
    // cúpula
    this.dome = add(new THREE.SphereGeometry(R, 72, 36, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0xdff3f7, transparent: true, opacity: 0.17, roughness: 0.05, metalness: 0, side: THREE.DoubleSide, depthWrite: false }), 0, 0.2, 0) as THREE.Mesh;
    this.filmSheet = add(new THREE.SphereGeometry(R + 0.05, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x57a7d6, transparent: true, opacity: 0, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false }), 0, 0.2, 0) as THREE.Mesh;
    // calha, parede, tanque
    const steel = new THREE.MeshStandardMaterial({ color: 0xc4ccc9, roughness: 0.4, metalness: 0.7 });
    add(new THREE.TorusGeometry(R - 0.12, 0.13, 8, 96), steel, 0, 0.42, 0, Math.PI / 2);
    add(new THREE.CylinderGeometry(R + 0.22, R + 0.22, 0.75, 96, 1, true), concrete, 0, 0.1, 0);
    // reservatório externo
    add(new THREE.RingGeometry(R + 0.22, ro, 96, 1), this.coolMat, 0, 0.26, 0, -Math.PI / 2);
    add(new THREE.CylinderGeometry(ro + 0.05, ro + 0.05, 0.8, 96, 1, true), concrete, 0, 0.1, 0);
    add(new THREE.TorusGeometry(ro + 0.05, 0.12, 6, 96), concrete, 0, 0.5, 0, Math.PI / 2);
    // tanque de água doce
    const tankA = (140 * Math.PI) / 180, tx = (ri - 1) * Math.cos(tankA), tz = (ri - 1) * Math.sin(tankA);
    add(new THREE.CylinderGeometry(0.55, 0.55, 1.4, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0xe6f3f4, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false }), tx, h(ri - 1) + 0.7, tz);
    this.tankFill = add(new THREE.CylinderGeometry(0.5, 0.5, 1, 20), new THREE.MeshStandardMaterial({ color: 0x3f9bd8, roughness: 0.2 }), tx, h(ri - 1) + 0.7, tz) as THREE.Mesh;
    const pipeEnd = new THREE.Vector3(tx, h(ri - 1) + 0.9, tz), pipeStart = new THREE.Vector3((R - 0.2) * Math.cos(tankA), 0.45, (R - 0.2) * Math.sin(tankA));
    add(new THREE.TubeGeometry(new THREE.LineCurve3(pipeStart, pipeEnd), 1, 0.055, 6), steel);

    // painéis e motor
    const n = Math.min(70, Math.max(2, Math.round(p.pvArea / 1.6)));
    const panelM = new THREE.MeshStandardMaterial({ color: 0x18305a, roughness: 0.25, metalness: 0.6 });
    const panels = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.05, 0.95), panelM, n);
    const rp = ro + 1.9, q2 = new THREE.Quaternion();
    for (let i = 0; i < n; i++) {
      const row = i % 2, span = Math.min(Math.PI * 0.84, Math.ceil(n / 2) * (1.9 / rp)), a = Math.PI / 2 - span / 2 + ((Math.floor(i / 2) + 0.5) / Math.ceil(n / 2)) * span, r = rp + row * 1.4;
      const x = r * Math.cos(a), z = r * Math.sin(a);
      q2.setFromEuler(new THREE.Euler(0.22, -a + Math.PI / 2, 0, 'YXZ'));
      panels.setMatrixAt(i, m.compose(new THREE.Vector3(x, 0.72, z), q2, new THREE.Vector3(1, 1, 1)));
    }
    st.add(panels);
    const motorA = -0.6, mx = (R + 0.5) * Math.cos(motorA), mz = (R + 0.5) * Math.sin(motorA);
    add(new THREE.BoxGeometry(0.9, 0.8, 0.9), new THREE.MeshStandardMaterial({ color: 0x4a5560, roughness: 0.5, metalness: 0.5 }), mx, 0.85, mz);
    // cobertura
    if (p.coverEnabled) {
      add(new THREE.TorusGeometry(R + 0.38, 0.1, 8, 120), steel, 0, 0.5, 0, Math.PI / 2);
      if (p.coverAperture < 0.995) {
        const hw = p.coverAperture * Math.PI;
        const tex = stripes();
        tex.repeat.set(Math.max(2, Math.round((2 * (Math.PI - hw)) * 16)), 1);
        const shade = new THREE.Mesh(new THREE.SphereGeometry(R + 0.5, 72, 18, hw, 2 * (Math.PI - hw), 0.05, Math.PI / 2 - 0.09),
          new THREE.MeshStandardMaterial({ map: tex, color: 0xa56b2c, transparent: true, opacity: 0.6, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.25, depthWrite: false }));
        shade.position.y = 0.2;
        this.coverPivot.add(shade);
      }
    }
    st.add(this.coverPivot);
    // perfil do corte
    const prof = this.section;
    const shape = (pts: [number, number][], mat: THREE.Material) => {
      for (const sg of [1, -1]) {
        const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(sg * x, y)));
        const me = new THREE.Mesh(new THREE.ShapeGeometry(sh), mat); me.position.z = -0.01; prof.add(me);
      }
    };
    const cSoil = new THREE.MeshBasicMaterial({ color: 0x6b5638, side: THREE.DoubleSide });
    const cCon = new THREE.MeshBasicMaterial({ color: 0x7b8582, side: THREE.DoubleSide });
    const mound: [number, number][] = [[0, -1.5]];
    for (let i = 0; i <= 24; i++) { const r = (ri * i) / 24; mound.push([r, h(r)]); }
    mound.push([ri, -1.5]);
    shape(mound, cSoil);
    shape([[ri, -1.25], [R, -1.25], [R, 0.12], [ri, 0.12]], this.cutSalt);
    shape([[R + 0.22, -1.25], [ro, -1.25], [ro, 0.26], [R + 0.22, 0.26]], this.cutCool);
    shape([[0, -1.8], [ro + 0.3, -1.8], [ro + 0.3, -1.25], [0, -1.25]], cCon);
    shape([[ri - 0.05, -1.25], [ri + 0.1, -1.25], [ri + 0.1, 0.36], [ri - 0.05, 0.36]], cCon);
    shape([[R, -1.25], [R + 0.22, -1.25], [R + 0.22, 0.5], [R, 0.5]], cCon);
    shape([[ro, -1.25], [ro + 0.3, -1.25], [ro + 0.3, 0.5], [ro, 0.5]], cCon);

    const ma = (ri + R) / 2;
    this.anchors = {
      salt: new THREE.Vector3(ma * Math.cos(1.25), 0.3, ma * Math.sin(1.25)),
      island: new THREE.Vector3(0.5, 3.7, 0.5),
      dome: new THREE.Vector3(-4.5, 9.6, 2),
      cool: new THREE.Vector3(((R + ro) / 2) * Math.cos(1.95), 0.4, ((R + ro) / 2) * Math.sin(1.95)),
      cover: new THREE.Vector3(6.5, 8, -4),
      pv: new THREE.Vector3(rp * 0.05, 1.2, rp),
      motor: new THREE.Vector3(mx, 1.6, mz),
      gutter: new THREE.Vector3((R - 0.1) * Math.cos(2.55), 0.6, (R - 0.1) * Math.sin(2.55)),
      tank: new THREE.Vector3(tx, h(ri - 1) + 1.7, tz),
      sun: new THREE.Vector3(),
    };
    this.applyClip();
  }

  private applyClip() {
    const planes = this.view === 'cut' ? [this.cutPlane] : [];
    const list: THREE.Object3D[] = [this.structure, this.droplets, this.vapor, this.runs, this.ground];
    list.forEach((g) => g.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) { m.clippingPlanes = planes; m.needsUpdate = true; } }));
    this.section.visible = this.view === 'cut';
    this.coverPivot.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m) m.opacity = this.view === 'cut' ? 0.28 : 0.6; });
  }

  setView(v: ViewMode) {
    this.view = v; this.applyClip();
    if (v === 'external') this.camGoal = { p: new THREE.Vector3(25, 15, 31), t: new THREE.Vector3(0, 3.5, 0) };
    if (v === 'cut') this.camGoal = { p: new THREE.Vector3(0, 7, 39), t: new THREE.Vector3(0, 3.2, 0) };
    if (v === 'inside') this.camGoal = { p: new THREE.Vector3(-7.4, 1.5, 5.1), t: new THREE.Vector3(1.5, 3.4, -1.5) };
  }
  setLabels(on: boolean) { this.showLabels = on; this.labelHost.hidden = !on; }

  update(s: State, p: Params, dtReal: number, running: boolean) {
    const key = [s.geo.R, s.geo.islandR, s.geo.coolOuterR, p.coverEnabled, p.coverAperture, p.pvArea].join('|');
    if (key !== this.key) { this.key = key; this.rebuild(s, p); }
    const dv = running ? dtReal : 0;

    // Sol e céu
    const v = this.sunVec(s.sunElev, s.sunAz);
    const pos = v.clone().multiplyScalar(70);
    this.sunMesh.position.copy(pos); this.sunGlow.position.copy(pos);
    this.sunL.position.copy(v.clone().multiplyScalar(40));
    const e = s.sunElev, day = smooth(-0.1, 0.22, e), golden = Math.max(0, 1 - Math.abs(e - 0.05) / 0.3);
    this.sunL.intensity = 3.0 * Math.max(0, (p.peakIrradiance > 0 ? s.G / Math.max(p.peakIrradiance, 1) : 0)) + 0.1 * day;
    this.sunL.color.lerpColors(C(0xffb37a), C(0xfff4e6), day);
    this.hemi.intensity = 0.22 + 1.05 * day;
    this.sunMesh.visible = this.sunGlow.visible = e > -0.2;
    const top = C(0x0b1630).lerp(C(0x4f96cf), day);
    const bot = C(0x1a2a44).lerp(C(0xcfe6f0), day).lerp(C(0xf0a56f), golden * 0.75);
    this.skyU.top.value.copy(top); this.skyU.bot.value.copy(bot);
    (this.scene.fog as THREE.Fog).color.copy(bot);
    (this.stars.material as THREE.PointsMaterial).opacity = 1 - smooth(-0.2, 0.06, e);

    // cores físicas
    const tw = clamp01((s.Tw - 20) / 30);
    const sc = C(0x176f98).lerp(C(0x37c0a8), tw);
    this.saltMat.color.copy(sc); this.cutSalt.color.copy(sc);
    const tc = clamp01((s.Tc - 18) / 22);
    const cc = C(0x1f5fae).lerp(C(0x7cc2a8), tc);
    this.coolMat.color.copy(cc); this.cutCool.color.copy(cc);
    this.foliage.color.copy(C(0x8a7b38).lerp(C(0x37864a), s.vegHealth));
    this.grass.color.copy(C(0xa89a58).lerp(C(0x69ad52), s.vegHealth));
    this.coolMatVisible(p);
    (this.filmSheet.material as THREE.MeshStandardMaterial).opacity = s.pCool > 0 ? 0.13 : 0;

    // cobertura
    this.coverPivot.rotation.y = ((-s.coverAngle - 90) * Math.PI) / 180;

    // tanque
    const fill = Math.max(0.03, s.tank / K.TANK_L);
    this.tankFill.scale.y = fill * 1.3;

    // gotículas
    const A = p.domeArea;
    const dc = clamp01(s.film / (K.FILM_RETAIN * A));
    this.droplets.geometry.setDrawRange(0, Math.floor(2600 * dc));

    // vapor sobe do anel salino
    const vp = this.vapor.geometry.getAttribute('position') as THREE.BufferAttribute;
    const evapNorm = clamp01((s.evapRate * 3600) / 70);
    const vN = Math.floor(600 * evapNorm);
    for (let i = 0; i < vN; i++) {
      const d = this.vaporData[i];
      if (!d.r) { d.r = this.ri + Math.random() * (R - this.ri); }
      d.y += d.v * dv * 1.4;
      const maxH = Math.sqrt(Math.max(0.01, R * R - d.r * d.r)) * 0.98;
      if (d.y > maxH) { d.y = 0.12; d.a = Math.random() * 6.28; d.r = this.ri + Math.random() * (R - this.ri); }
      vp.setXYZ(i, d.r * Math.cos(d.a), d.y, d.r * Math.sin(d.a));
    }
    vp.needsUpdate = true; this.vapor.geometry.setDrawRange(0, vN);

    // água escorrendo
    const rp = this.runs.geometry.getAttribute('position') as THREE.BufferAttribute;
    const rn = Math.floor(360 * clamp01((s.collectRate * 3600) / 28));
    for (let i = 0; i < rn; i++) {
      const d = this.runData[i];
      d.th += d.v * dv * (0.35 + d.th * 0.5);
      if (d.th > 1.53) { d.th = 0.12 + Math.random() * 0.7; d.ph = Math.random() * 6.28; }
      const r = R - 0.09;
      rp.setXYZ(i, r * Math.sin(d.th) * Math.cos(d.ph), r * Math.cos(d.th) + 0.2, r * Math.sin(d.th) * Math.sin(d.ph));
    }
    rp.needsUpdate = true; this.runs.geometry.setDrawRange(0, rn);

    // câmera
    if (this.camGoal) {
      this.camera.position.lerp(this.camGoal.p, 0.09);
      this.controls.target.lerp(this.camGoal.t, 0.09);
      if (this.camera.position.distanceTo(this.camGoal.p) < 0.05) this.camGoal = null;
    }
    if (this.followSun && this.view === 'external' && !this.camGoal) {
      const delta = (((s.sunAz - this.lastSunAz) + 540) % 360 - 180) * Math.PI / 180;
      const o = this.camera.position.clone().sub(this.controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), -delta);
      this.camera.position.copy(this.controls.target).add(o);
    }
    this.lastSunAz = s.sunAz;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    if (this.showLabels) this.placeLabels(p, pos);
  }

  private coolMatVisible(_p: Params) { /* água externa fica visível; desligar só para a bomba e o acoplamento */ }

  private placeLabels(p: Params, sunPos: THREE.Vector3) {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    const compact = w < 560;
    for (const part of PARTS) {
      const el = this.labelEls[part.id];
      const a0 = part.id === 'sun' ? sunPos : this.anchors[part.id];
      if (!a0) continue;
      const cut = this.view === 'cut';
      const a = cut && part.id === 'salt' ? new THREE.Vector3((this.ri + R) / 2, 0.6, 0)
        : cut && part.id === 'cool' ? new THREE.Vector3(-(R + this.ro) / 2, 0.9, 0)
        : cut && part.id !== 'sun' && a0.z > 0 ? a0.clone().setZ(0) : a0;
      let hide = part.id === 'cover' && !p.coverEnabled;
      if (part.id === 'sun' && !this.sunMesh.visible) hide = true;
      if (cut && part.id === 'pv') hide = true;
      if (compact && !['salt', 'island', 'dome', 'cool', 'pv'].includes(part.id)) hide = true;
      const v = a.clone().project(this.camera);
      if (v.z > 1 || Math.abs(v.x) > 0.96 || Math.abs(v.y) > 0.94) hide = true;
      el.style.display = hide ? 'none' : '';
      if (!hide) el.style.transform = `translate(-50%,-50%) translate(${((v.x + 1) / 2) * w}px,${((1 - v.y) / 2) * h}px)`;
    }
  }

  dispose() { this.ro2.disconnect(); this.controls.dispose(); this.renderer.dispose(); this.host.removeChild(this.renderer.domElement); this.labelHost.innerHTML = ''; }
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function mulberry(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function stripes() {
  const c = document.createElement('canvas'); c.width = 32; c.height = 4;
  const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, 32, 4); g.fillStyle = '#6b6b6b'; g.fillRect(0, 0, 3, 4);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
