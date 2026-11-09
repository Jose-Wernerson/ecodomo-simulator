import { Params } from './params';
import { createState, step, State, DT, closures } from './physics';

export interface Scenario {
  id: string;
  name: string;
  short: string;
  apply: (p: Params) => Params;
}

export const SCENARIOS: Scenario[] = [
  { id: 's1', name: 'Sem resfriamento externo', short: 'Sem resfr.', apply: (p) => ({ ...p, coolingEnabled: false, coverEnabled: false }) },
  { id: 's2', name: 'Com resfriamento externo', short: 'Com resfr.', apply: (p) => ({ ...p, coolingEnabled: true, coverEnabled: false }) },
  { id: 's3', name: 'Com cobertura giratória', short: 'Cobertura', apply: (p) => ({ ...p, coolingEnabled: false, coverEnabled: true }) },
  { id: 's4', name: 'Sistema integrado', short: 'Integrado', apply: (p) => ({ ...p, coolingEnabled: true, coverEnabled: true }) },
];

export interface RunSummary {
  freshL: number; freshPerDay: number; evapL: number; condL: number; irrigL: number;
  pvKWh: number; usedKWh: number; unmetKWh: number; netKWh: number; minSoc: number;
  meanTd: number; meanTw: number; maxTa: number; meanDewMargin: number; vegOkPct: number; tempOkPct: number; rhOkPct: number;
  coolStart: number; coolEnd: number; finalSalinity: number; finalSoil: number;
  freshSeries: number[]; domeSeries: number[];
  closure: ReturnType<typeof closures>;
}

export function runHeadless(p: Params, days: number, dt = DT): RunSummary {
  const s: State = createState(p, 0);
  const total = Math.round((days * p.cycleHours * 3600) / dt);
  const every = Math.max(1, Math.floor(total / 240));
  let sumTd = 0, sumTw = 0, sumM = 0;
  const freshSeries: number[] = [], domeSeries: number[] = [];
  for (let i = 0; i < total; i++) {
    step(s, p, dt);
    sumTd += s.Td; sumTw += s.Tw; sumM += s.dew - s.Td;
    if (i % every === 0) { freshSeries.push(s.collectKg); domeSeries.push(s.Td); }
  }
  return {
    freshL: s.collectKg, freshPerDay: s.collectKg / days, evapL: s.evapKg, condL: s.condKg, irrigL: s.irrigKg,
    pvKWh: s.pvWh / 1000, usedKWh: s.usedWh / 1000, unmetKWh: s.unmetWh / 1000, netKWh: (s.pvWh - s.usedWh) / 1000,
    minSoc: (100 * s.minBat) / (p.batteryKWh * 1000),
    meanTd: sumTd / total, meanTw: sumTw / total, maxTa: s.maxTa, meanDewMargin: sumM / total,
    vegOkPct: (100 * s.vegOkSteps) / s.steps, tempOkPct: (100 * s.tempOkSteps) / s.steps, rhOkPct: (100 * s.rhOkSteps) / s.steps, coolStart: p.coolingTemp0, coolEnd: s.Tc,
    finalSalinity: s.salinity, finalSoil: s.soilMoisture, freshSeries, domeSeries, closure: closures(s),
  };
}
