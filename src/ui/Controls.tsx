import React from 'react';
import { Params } from '../engine/params';
import { RESTART_KEYS } from '../engine/sim';
import { num } from './format';

type NumKey = { [K in keyof Params]: Params[K] extends number ? K : never }[keyof Params];
interface Def { k: NumKey; label: string; min: number; max: number; step: number; unit: string; scale?: number; d?: number; }

const S = (k: NumKey, label: string, min: number, max: number, step: number, unit: string, d = 0, scale = 1): Def => ({ k, label, min, max, step, unit, d, scale });

const GROUPS: { title: string; items: Def[] }[] = [
  { title: 'Sol e clima', items: [
    S('peakIrradiance', 'Intensidade da luz solar', 0, 1300, 10, 'W/m²'),
    S('cycleHours', 'Duração do ciclo diário', 12, 48, 1, 'h'),
    S('daylightFraction', 'Parte do ciclo com Sol', 0.3, 0.7, 0.01, '%', 0, 100),
    S('ambientMean', 'Temperatura ambiente', 5, 42, 0.5, '°C', 1),
    S('ambientSwing', 'Amplitude dia/noite', 0, 12, 0.5, '± °C', 1),
    S('wind', 'Vento', 0, 10, 0.5, 'm/s', 1),
  ]},
  { title: 'Reservatório salino', items: [
    S('saltVolume', 'Volume de água salgada', 10, 500, 5, 'm³'),
    S('saltDepth', 'Profundidade', 0.1, 3, 0.05, 'm', 2),
    S('saltTemp0', 'Temperatura inicial da água', 5, 45, 0.5, '°C', 1),
    S('salinity0', 'Salinidade inicial', 0, 120, 1, 'g/kg'),
  ]},
  { title: 'Cúpula e ar interno', items: [
    S('domeArea', 'Área da cúpula', 100, 2000, 10, 'm²'),
    S('initialRH', 'Umidade inicial', 10, 100, 1, '%'),
  ]},
  { title: 'Resfriamento externo', items: [
    S('coolingVolume', 'Volume do reservatório externo', 50, 5000, 50, 'm³'),
    S('coolingTemp0', 'Temperatura da água externa', 5, 40, 0.5, '°C', 1),
    S('coolingFlow', 'Circulação sobre o vidro', 0, 30, 0.5, 'L/s', 1),
  ]},
  { title: 'Energia', items: [
    S('pvEfficiency', 'Eficiência dos painéis', 0.05, 0.3, 0.01, '%', 0, 100),
    S('pvArea', 'Área de captação solar', 0, 200, 1, 'm²'),
    S('batteryKWh', 'Capacidade da bateria', 0.5, 100, 0.5, 'kWh', 1),
  ]},
  { title: 'Cobertura giratória', items: [
    S('coverSpeed', 'Velocidade de rotação', 0.1, 30, 0.1, '°/min', 1),
    S('coverAperture', 'Abertura da cobertura', 0.1, 1, 0.01, '%', 0, 100),
  ]},
  { title: 'Ilha central', items: [
    S('soilMoisture0', 'Umidade inicial do solo', 0.1, 0.4, 0.01, 'm³/m³', 2),
    S('soilTarget', 'Umidade-alvo do solo', 0.12, 0.38, 0.01, 'm³/m³', 2),
  ]},
];

function Toggle({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="toggle" htmlFor={id}><input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span className="sw" /><span>{label}</span></label>;
}

export function Controls({ p, set }: { p: Params; set: <K extends keyof Params>(k: K, v: Params[K]) => void }) {
  return (
    <div className="controls">
      {GROUPS.map((g, gi) => (
        <details key={g.title} open={gi < 2 || (typeof window !== 'undefined' && window.innerWidth > 1000 && gi < 4)}>
          <summary>{g.title}</summary>
          <div className="group">
            {g.title === 'Resfriamento externo' && <Toggle id="tg-cool" label="Reservatório externo ativo" checked={p.coolingEnabled} onChange={(v) => set('coolingEnabled', v)} />}
            {g.title === 'Cobertura giratória' && <>
              <Toggle id="tg-cover" label="Cobertura instalada" checked={p.coverEnabled} onChange={(v) => set('coverEnabled', v)} />
              <div className="seg" role="group" aria-label="Modo da cobertura">
                <button type="button" className={p.coverAuto ? 'on' : ''} onClick={() => set('coverAuto', true)}>Automático</button>
                <button type="button" className={!p.coverAuto ? 'on' : ''} onClick={() => set('coverAuto', false)}>Manual</button>
              </div>
              {!p.coverAuto && <Slider d={S('coverManualAngle', 'Ângulo manual', 0, 359, 1, '°')} p={p} set={set} />}
            </>}
            {g.title === 'Ilha central' && <Toggle id="tg-irr" label="Irrigação automática" checked={p.irrigationEnabled} onChange={(v) => set('irrigationEnabled', v)} />}
            {g.items.map((d) => <Slider key={d.k} d={d} p={p} set={set} />)}
          </div>
        </details>
      ))}
    </div>
  );
}

function Slider({ d, p, set }: { d: Def; p: Params; set: <K extends keyof Params>(k: K, v: Params[K]) => void }) {
  const v = p[d.k] as number;
  const restart = RESTART_KEYS.includes(d.k);
  return (
    <div className="slider">
      <label htmlFor={`sl-${d.k}`}>{d.label}{restart && <span className="rs" title="Aplica ao reiniciar">reinício</span>}</label>
      <output htmlFor={`sl-${d.k}`}>{num(v * (d.scale ?? 1), d.d ?? 0)} <small>{d.unit}</small></output>
      <input id={`sl-${d.k}`} type="range" min={d.min} max={d.max} step={d.step} value={v} onChange={(e) => set(d.k, +e.target.value as never)} />
    </div>
  );
}
