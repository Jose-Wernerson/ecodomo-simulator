import React from 'react';
import { Params, K } from '../engine/params';
import { State } from '../engine/physics';
import { num } from './format';

export function Readouts({ s, p }: { s: State; p: Params }) {
  const margin = s.dew - s.Td;
  const cond = s.condensing;
  const energyNet = s.pPV - s.pUsed;
  const soc = (100 * s.battery) / (p.batteryKWh * 1000);
  const energyState = soc < 5 ? ['crit', 'Sem reserva'] : soc < 20 ? ['warn', 'Reserva baixa'] : energyNet >= 0 ? ['good', 'Saldo positivo'] : ['info', 'Usando bateria'];
  const veg = s.vegHealth > 0.65 ? ['good', 'Adequada'] : s.vegHealth > 0.35 ? ['warn', 'Sob estresse'] : ['crit', 'Estresse severo'];
  const Row = ({ l, v, u }: { l: string; v: string; u: string }) => <div className="row"><dt>{l}</dt><dd>{v}<small>{u}</small></dd></div>;
  return (
    <div className="readouts">
      <div className="pills">
        <div className={`pill ${cond ? 'good' : 'idle'}`}><b>{cond ? 'Condensando' : 'Sem condensação'}</b><span>Vidro {num(Math.abs(margin))} °C {margin >= 0 ? 'abaixo' : 'acima'} do orvalho</span></div>
        <div className={`pill ${energyState[0]}`}><b>{energyState[1]}</b><span>{num(soc, 0)}% de carga</span></div>
        <div className={`pill ${veg[0]}`}><b>Vegetação: {veg[1].toLowerCase()}</b><span>Solo {num(s.soilMoisture, 2)} m³/m³</span></div>
      </div>
      <h3>Temperaturas</h3>
      <dl>
        <Row l="Água salgada" v={num(s.Tw)} u="°C" />
        <Row l="Água externa" v={num(s.Tc)} u="°C" />
        <Row l="Interna da cúpula (ar)" v={num(s.Ta)} u="°C" />
        <Row l="Superfície de condensação" v={num(s.Td)} u="°C" />
      </dl>
      <h3>Água</h3>
      <dl>
        <Row l="Umidade interna" v={num(s.RH, 0)} u="%" />
        <Row l="Água evaporada" v={num(s.evapKg, 0)} u="L" />
        <Row l="Água condensada" v={num(s.condKg, 0)} u="L" />
        <Row l="Água doce coletada" v={num(s.collectKg, 0)} u="L" />
        <Row l="Usada na irrigação" v={num(s.irrigKg, 0)} u="L" />
        <Row l="Tanque de água doce" v={num(s.tank, 0)} u="L" />
        <Row l="Salinidade" v={num(s.salinity, 1)} u="g/kg" />
      </dl>
      <h3>Energia</h3>
      <dl>
        <Row l="Energia solar produzida" v={num(s.pvWh / 1000, 2)} u="kWh" />
        <Row l="Energia consumida" v={num(s.usedWh / 1000, 2)} u="kWh" />
        <Row l="Energia armazenada" v={num(s.battery / 1000, 2)} u="kWh" />
        <Row l="Demanda não atendida" v={num(s.unmetWh / 1000, 2)} u="kWh" />
        <Row l="Velocidade do giro" v={num(s.coverRate, 2)} u="°/min" />
      </dl>
    </div>
  );
}

export function CycleStrip({ s, p }: { s: State; p: Params }) {
  const items: [string, boolean][] = [
    ['Sol', s.G > 0], ['Fotovoltaico', s.pPV > 1], ['Motor', s.pMotor > 0], ['Aquecimento', s.G > 0],
    ['Evaporação', s.evapRate > 1e-4], ['Condensação', s.condensing], ['Escoamento', s.collectRate > 1e-5],
    ['Irrigação', s.irrigRate > 0], ['Resfriamento', s.pCool > 0], ['Perda noturna', s.G === 0],
  ];
  return <div className="strip" aria-label="Processos ativos">{items.map(([n, a]) => <span key={n} className={a ? 'on' : ''}>{n}</span>)}</div>;
}
export const tankPct = (s: State) => (100 * s.tank) / K.TANK_L;
