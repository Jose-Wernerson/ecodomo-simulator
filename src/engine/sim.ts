/** Controlador de tempo real: liga o motor físico à interface sem que um conheça o outro. */
import { DEFAULT_PARAMS, Params } from './params';
import { createState, DT, State, step } from './physics';

export interface Sample {
  t: number; Tw: number; Ta: number; Td: number; Tc: number; Tamb: number; dew: number;
  pv: number; used: number; motor: number; pumps: number; sensors: number;
  evap: number; cond: number; fresh: number; RH: number; G: number; battery: number;
}

export const RESTART_KEYS: (keyof Params)[] = [
  'saltVolume', 'saltDepth', 'saltTemp0', 'salinity0', 'initialRH', 'domeArea',
  'coolingVolume', 'coolingTemp0', 'soilMoisture0', 'batteryKWh',
];
export const SPEEDS = [1, 4, 16, 60];
const MAX_POINTS = 4000;

export class Sim {
  draft: Params = { ...DEFAULT_PARAMS };
  applied: Params = { ...DEFAULT_PARAMS };
  state: State = createState(this.applied);
  history: Sample[] = [];
  running = true;
  speed = 1;
  pending = false;
  private acc = 0;
  private nextSample = 0;
  private sampleEvery = 600;
  private listeners = new Set<() => void>();

  constructor() { this.reset(); this.fastForward(0, 29); }

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  emit() { this.listeners.forEach((f) => f()); }

  reset() {
    this.applied = { ...this.draft };
    this.state = createState(this.applied);
    this.history = [];
    this.pending = false;
    this.acc = 0;
    this.sampleEvery = (this.applied.cycleHours * 3600) / 144;
    this.nextSample = this.state.t;
    this.sample();
    this.emit();
  }

  /** Avança sem desenhar; usado para abrir a página com dados na tela. */
  fastForward(_from: number, hours: number) {
    const n = Math.round((hours * 3600) / DT);
    for (let i = 0; i < n; i++) this.oneStep();
  }

  private oneStep() {
    step(this.state, this.applied, DT);
    if (this.state.t >= this.nextSample) this.sample();
  }

  private sample() {
    const s = this.state;
    this.history.push({
      t: s.t, Tw: s.Tw, Ta: s.Ta, Td: s.Td, Tc: s.Tc, Tamb: s.Tamb, dew: s.dew,
      pv: s.pPV, used: s.pUsed, motor: s.pMotor, pumps: s.pCool + s.pCollect + s.pIrrig, sensors: s.pSensors,
      evap: s.evapRate * 3600, cond: s.condRate * 3600, fresh: s.collectKg, RH: s.RH, G: s.G, battery: s.battery,
    });
    if (this.history.length > MAX_POINTS) this.history = this.history.filter((_, i) => i % 2 === 0);
    this.nextSample = s.t + this.sampleEvery;
  }

  /** @param realMs tempo real decorrido. 1× = um dia de 24 h em 144 s. */
  advance(realMs: number) {
    if (!this.running) return;
    this.acc += (Math.min(realMs, 100) / 1000) * 600 * this.speed;
    const n = Math.min(2000, Math.floor(this.acc / DT));
    this.acc -= n * DT;
    for (let i = 0; i < n; i++) this.oneStep();
    if (n === 2000) this.acc = 0;
  }

  setParam<K extends keyof Params>(key: K, value: Params[K]) {
    this.draft = { ...this.draft, [key]: value };
    if (RESTART_KEYS.includes(key)) {
      this.pending = RESTART_KEYS.some((k) => this.draft[k] !== this.applied[k]);
    } else {
      this.applied = { ...this.applied, [key]: value };
    }
    this.emit();
  }
  setMany(p: Partial<Params>) { (Object.keys(p) as (keyof Params)[]).forEach((k) => this.setParam(k, p[k] as never)); }
  toggle() { this.running = !this.running; this.emit(); }
  setSpeed(v: number) { this.speed = v; this.running = true; this.emit(); }
}
