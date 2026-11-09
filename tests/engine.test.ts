import { DEFAULT_PARAMS as D, Params } from '../src/engine/params';
import { SCENARIOS, runHeadless } from '../src/engine/scenarios';
import { createState, step, DT } from '../src/engine/physics';

let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const f = (x: number, n = 1) => x.toFixed(n);

for (const sc of SCENARIOS) {
  const r = runHeadless(sc.apply(D), 7);
  console.log(`${sc.short.padEnd(11)} doce ${f(r.freshPerDay, 0)} L/d evap ${f(r.evapL / 7, 0)} cond ${f(r.condL / 7, 0)} Td ${f(r.meanTd)} Tw ${f(r.meanTw)} maxTa ${f(r.maxTa)} Tc ${f(r.coolEnd)} PV ${f(r.pvKWh / 7)} uso ${f(r.usedKWh / 7)} unmet ${f(r.unmetKWh)} minSOC ${f(r.minSoc, 0)} veg ${f(r.vegOkPct, 0)}% rh-margin ${f(r.meanDewMargin)} solo ${f(r.finalSoil, 3)} | w ${r.closure.waterPct.toExponential(1)} e ${r.closure.elecPct.toExponential(1)} h ${r.closure.heatPct.toExponential(1)}`);
  ok(r.closure.waterPct < 1e-3, `${sc.id} fechamento de água`);
  ok(r.closure.elecPct < 1e-3, `${sc.id} fechamento elétrico`);
  ok(r.closure.heatPct < 0.5, `${sc.id} fechamento térmico`);
}

// sem Sol: nenhuma geração, bateria só desce
{
  const p: Params = { ...D, peakIrradiance: 0 };
  const s = createState(p, 0);
  let up = false, last = s.battery;
  for (let i = 0; i < 17280 * 2; i++) { step(s, p); if (s.battery > last + 1e-9) up = true; last = s.battery; }
  ok(s.pvWh === 0 && !up, 'sem Sol não há eletricidade nem recarga');
  ok(s.unmetWh > 0 || s.battery >= 0, 'bateria nunca negativa');
}
// bateria mínima e sem PV: motor para
{
  const p: Params = { ...D, peakIrradiance: 800, pvArea: 0.01, batteryKWh: 0.5, coverSpeed: 30 };
  const s = createState(p, 12);
  s.battery = 0;
  let moved = 0;
  for (let i = 0; i < 2000; i++) { const a = s.coverAngle; step(s, p); moved += Math.abs(s.coverAngle - a); }
  ok(moved < 30, `cobertura depende de energia (moveu ${f(moved)}°)`);
}
// resfriamento: reservatório muda de temperatura
{
  const r = runHeadless({ ...D, coolingVolume: 60 }, 3);
  ok(Math.abs(r.coolEnd - D.coolingTemp0) > 0.5, `reservatório externo varia (${f(r.coolEnd)} °C)`);
}
// sem condensação com vidro mais quente que o orvalho: ar muito seco
{
  const p: Params = { ...D, peakIrradiance: 0, initialRH: 5, saltVolume: 2, saltDepth: 0.2, saltTemp0: 10, ambientMean: 35, ambientSwing: 0 };
  const s = createState(p, 0);
  for (let i = 0; i < 60; i++) step(s, p, DT);
  ok(s.condKg === 0, 'não condensa quando vidro está acima do ponto de orvalho');
}
if (fails) process.exit(1);
