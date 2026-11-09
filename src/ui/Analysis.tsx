import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Params, K } from '../engine/params';
import { closures, State } from '../engine/physics';
import { RunSummary, runHeadless, SCENARIOS } from '../engine/scenarios';
import { Sample } from '../engine/sim';
import { Chart, Series } from './Chart';
import { hhmm, num } from './format';

const C = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)'];
const ser = (k: string, l: string, i: number): Series => ({ key: k, label: l, color: C[i] });

export function ChartsTab({ history, p }: { history: Sample[]; p: Params }) {
  const [win, setWin] = useState<'24' | '72' | 'all'>('72');
  const P = p.cycleHours * 3600;
  const data = useMemo(() => {
    if (win === 'all' || !history.length) return history;
    const lim = history[history.length - 1].t - (win === '24' ? P : 3 * P);
    return history.filter((d) => d.t >= lim);
  }, [history, win, P]);
  const lab = (t: number) => `D${Math.floor(t / P) + 1} ${hhmm((((t % P) / P) * 24))}`;
  const common = { data, x: (d: Sample) => d.t, xLabel: lab, night: (d: Sample) => d.G <= 0 };
  return (
    <>
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Janela dos gráficos">
          {([['24', '1 ciclo'], ['72', '3 ciclos'], ['all', 'Tudo']] as const).map(([k, l]) => <button key={k} type="button" className={win === k ? 'on' : ''} onClick={() => setWin(k)}>{l}</button>)}
        </div>
        <span className="muted">Faixas escuras marcam a noite. Valores são estimativas do modelo.</span>
      </div>
      <div className="charts">
        <Chart {...common} title="Temperatura ao longo do tempo" unit="°C" series={[ser('Tw', 'Água salgada', 0), ser('Ta', 'Ar interno', 1), ser('Td', 'Cúpula', 2), ser('Tamb', 'Ambiente', 3)]} />
        <Chart {...common} title="Produção de energia solar" unit="W" zero decimals={0} series={[ser('pv', 'Fotovoltaico', 0)]} />
        <Chart {...common} title="Consumo de energia" unit="W" zero decimals={0} series={[ser('pumps', 'Bombas', 0), ser('motor', 'Motor', 1), ser('sensors', 'Sensores', 2)]} />
        <Chart {...common} title="Evaporação e condensação" unit="L/h" zero series={[ser('evap', 'Evaporação', 0), ser('cond', 'Condensação', 1)]} />
        <Chart {...common} title="Produção acumulada de água doce" unit="L" zero decimals={0} series={[ser('fresh', 'Água doce', 0)]} />
        <Chart {...common} title="Variação da umidade" unit="%" decimals={0} cap={100} series={[ser('RH', 'Umidade relativa', 0)]} />
        <Chart {...common} title="Temperatura do reservatório externo" unit="°C" series={[ser('Tc', 'Água externa', 0)]} />
        <Chart {...common} title="Temperatura da cúpula e ponto de orvalho" unit="°C" series={[ser('Td', 'Cúpula', 0), ser('dew', 'Ponto de orvalho', 1)]} />
      </div>
    </>
  );
}

const METRICS: { l: string; f: (r: RunSummary, d: number) => number; d: number; best?: 'hi' | 'lo'; u: string }[] = [
  { l: 'Água doce por ciclo', f: (r) => r.freshPerDay, d: 0, u: 'L', best: 'hi' },
  { l: 'Evaporação por ciclo', f: (r, d) => r.evapL / d, d: 0, u: 'L' },
  { l: 'Condensação por ciclo', f: (r, d) => r.condL / d, d: 0, u: 'L' },
  { l: 'Irrigação total', f: (r) => r.irrigL, d: 0, u: 'L' },
  { l: 'Cúpula, média', f: (r) => r.meanTd, d: 1, u: '°C', best: 'lo' },
  { l: 'Água salgada, média', f: (r) => r.meanTw, d: 1, u: '°C' },
  { l: 'Ar interno, máxima', f: (r) => r.maxTa, d: 1, u: '°C', best: 'lo' },
  { l: 'Água externa, final', f: (r) => r.coolEnd, d: 1, u: '°C' },
  { l: 'Produção solar por ciclo', f: (r, d) => r.pvKWh / d, d: 1, u: 'kWh' },
  { l: 'Consumo por ciclo', f: (r, d) => r.usedKWh / d, d: 1, u: 'kWh', best: 'lo' },
  { l: 'Demanda não atendida', f: (r) => r.unmetKWh, d: 1, u: 'kWh', best: 'lo' },
  { l: 'Carga mínima da bateria', f: (r) => r.minSoc, d: 0, u: '%', best: 'hi' },
  { l: 'Tempo com temperatura boa', f: (r) => r.tempOkPct, d: 0, u: '%', best: 'hi' },
  { l: 'Tempo com umidade boa', f: (r) => r.rhOkPct, d: 0, u: '%', best: 'hi' },
];

export function CompareTab({ p }: { p: Params }) {
  const [days, setDays] = useState(7);
  const [res, setRes] = useState<RunSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useCallback(() => {
    setBusy(true);
    setTimeout(() => { setRes(SCENARIOS.map((s) => runHeadless(s.apply(p), days, 10))); setBusy(false); }, 20);
  }, [p, days]);
  useEffect(run, [days]); // eslint-disable-line
  const chartData = useMemo(() => {
    if (!res) return [];
    return res[0].freshSeries.map((_, i) => ({ i, a: res[0].freshSeries[i], b: res[1].freshSeries[i], c: res[2].freshSeries[i], d: res[3].freshSeries[i] }));
  }, [res]);
  const n = chartData.length;
  const maxW = res ? Math.max(...res.map((r) => r.freshPerDay), 1) : 1;
  const verdict = res && (() => {
    const pct = (a: number, b: number) => (100 * (a - b)) / Math.max(b, 1);
    const cool = pct(res[1].freshPerDay, res[0].freshPerDay), cov = pct(res[2].freshPerDay, res[0].freshPerDay);
    const dT = res[0].maxTa - res[1].maxTa;
    const w = (x: number) => `${x >= 0 ? 'aumentou' : 'reduziu'} a água doce em ${num(Math.abs(x), 1)}%`;
    const rh = res[3].rhOkPct;
    return `Com os parâmetros atuais, o resfriamento externo ${w(cool)} e baixou a máxima do ar em ${num(dT)} °C. A cobertura giratória ${w(cov)}. ${res[3].unmetKWh > 0.05 ? `O sistema integrado deixou ${num(res[3].unmetKWh)} kWh de demanda sem atender.` : 'O sistema integrado atendeu toda a demanda elétrica.'} A umidade ficou na faixa boa para plantas (40 a 90%) em ${num(rh, 0)}% do tempo.`;
  })();
  return (
    <>
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Duração da comparação">
          {[1, 3, 7, 15, 30].map((d) => <button key={d} type="button" className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{d} {d === 1 ? 'ciclo' : 'ciclos'}</button>)}
        </div>
        <button type="button" className="btn primary" onClick={run} disabled={busy}>{busy ? 'Calculando…' : 'Comparar com os parâmetros atuais'}</button>
      </div>
      {verdict && <p className="verdict">{verdict}</p>}
      {res && <div className="cmpgrid">
        <div className="bars">
          <h4>Água doce por ciclo <span className="muted">L</span></h4>
          {SCENARIOS.map((s, i) => <div className="bar" key={s.id} title={`${s.name}: ${num(res[i].freshPerDay, 0)} L por ciclo`}><span>{s.name}</span><div><i style={{ width: `${(res[i].freshPerDay / maxW) * 100}%`, background: C[i] }} /></div><b>{num(res[i].freshPerDay, 0)}</b></div>)}
        </div>
        <Chart title="Água doce acumulada" unit="L" zero decimals={0} data={chartData} x={(d) => d.i} xLabel={(v) => `${num((v / Math.max(1, n - 1)) * days, 1)} ciclos`}
          series={[ser('a', SCENARIOS[0].short, 0), ser('b', SCENARIOS[1].short, 1), ser('c', SCENARIOS[2].short, 2), ser('d', SCENARIOS[3].short, 3)]} />
      </div>}
      {res && <div className="tablewrap"><table>
        <thead><tr><th>Indicador</th>{SCENARIOS.map((s) => <th key={s.id}>{s.name}</th>)}</tr></thead>
        <tbody>{METRICS.map((m) => {
          const vals = res.map((r) => m.f(r, days));
          const b = m.best ? (m.best === 'hi' ? Math.max(...vals) : Math.min(...vals)) : NaN;
          const allEq = vals.every((v) => Math.abs(v - vals[0]) < 10 ** -m.d / 2);
          return <tr key={m.l}><th scope="row">{m.l}</th>{vals.map((v, i) => <td key={i} className={!allEq && v === b ? 'best' : ''}>{num(v, m.d)} <small>{m.u}</small></td>)}</tr>;
        })}</tbody>
      </table></div>}
    </>
  );
}

interface Axis { k: keyof Params; l: string; u: string; v: number[]; scale?: number; extra?: (p: Params, v: number) => Partial<Params>; }
const AXES: Axis[] = [
  { k: 'saltDepth', l: 'Profundidade', u: 'm', v: [0.15, 0.25, 0.5, 1, 1.5, 2.5], extra: (p, v) => ({ saltVolume: (p.saltVolume / p.saltDepth) * v }) },
  { k: 'coolingFlow', l: 'Circulação externa', u: 'L/s', v: [0, 1, 2, 4, 8, 16] },
  { k: 'coverAperture', l: 'Abertura da cobertura', u: '%', v: [0.3, 0.45, 0.6, 0.75, 0.9, 1], scale: 100 },
  { k: 'pvArea', l: 'Área de painéis', u: 'm²', v: [2, 6, 12, 24, 48, 96] },
  { k: 'peakIrradiance', l: 'Luz solar', u: 'W/m²', v: [400, 600, 800, 1000, 1150, 1300] },
  { k: 'ambientMean', l: 'Temperatura ambiente', u: '°C', v: [15, 20, 25, 30, 35, 40] },
  { k: 'coolingVolume', l: 'Volume externo', u: 'm³', v: [100, 300, 600, 1200, 2500, 5000] },
  { k: 'domeArea', l: 'Área da cúpula', u: 'm²', v: [200, 400, 628, 1000, 1500, 2000], extra: (p, v) => ({ saltVolume: p.saltVolume * (v / p.domeArea) }) },
];
const OUT: { id: string; l: string; f: (r: RunSummary, d: number) => number; d: number; u: string; hi: boolean }[] = [
  { id: 'w', l: 'Água doce por ciclo', f: (r) => r.freshPerDay, d: 0, u: 'L', hi: true },
  { id: 'e', l: 'Saldo elétrico por ciclo', f: (r, d) => r.netKWh / d, d: 1, u: 'kWh', hi: true },
  { id: 'tmax', l: 'Máxima do ar interno', f: (r) => r.maxTa, d: 1, u: '°C', hi: false },
  { id: 'rh', l: 'Tempo com umidade boa', f: (r) => r.rhOkPct, d: 0, u: '%', hi: true },
];

export function ExploreTab({ p, onApply }: { p: Params; onApply: (o: Partial<Params>) => void }) {
  const [ax, setAx] = useState(0), [ay, setAy] = useState(1), [out, setOut] = useState(0);
  const [cells, setCells] = useState<RunSummary[][] | null>(null);
  const [prog, setProg] = useState<number | null>(null);
  const days = 3;
  const X = AXES[ax], Y = AXES[ay], O = OUT[out];
  const run = useCallback(async () => {
    const grid: RunSummary[][] = [];
    for (let j = 0; j < Y.v.length; j++) {
      const row: RunSummary[] = [];
      for (let i = 0; i < X.v.length; i++) {
        let q: Params = { ...p, [X.k]: X.v[i], ...(X.extra ? X.extra(p, X.v[i]) : {}) };
        q = { ...q, [Y.k]: Y.v[j], ...(Y.extra ? Y.extra(q, Y.v[j]) : {}) };
        row.push(runHeadless(q, days, 10));
      }
      grid.push(row);
      setProg((j + 1) / Y.v.length);
      await new Promise((r) => setTimeout(r, 0));
    }
    setCells(grid); setProg(null);
  }, [p, ax, ay]); // eslint-disable-line
  useEffect(() => { run(); }, [ax, ay]); // eslint-disable-line

  const flat = cells ? cells.flat().filter((r) => r.unmetKWh < 0.5).map((r) => O.f(r, days)) : [];
  const lo = flat.length ? Math.min(...flat) : 0, hi = flat.length ? Math.max(...flat) : 1;
  const bestV = O.hi ? hi : lo;
  let bx = -1, by = -1;
  cells?.forEach((row, j) => row.forEach((r, i) => { if (r.unmetKWh < 0.5 && O.f(r, days) === bestV) { bx = i; by = j; } }));
  const fm = (a: Axis, v: number) => num(v * (a.scale ?? 1), v * (a.scale ?? 1) < 1 ? 2 : 0);
  const Sel = ({ id, label, val, set, opts }: { id: string; label: string; val: number; set: (n: number) => void; opts: string[] }) => <label className="sel" htmlFor={id}>{label}<select id={id} value={val} onChange={(e) => set(+e.target.value)}>{opts.map((o, i) => <option key={o} value={i}>{o}</option>)}</select></label>;
  return (
    <>
      <div className="toolbar">
        <Sel id="ax-x" label="Eixo horizontal" val={ax} set={(n) => n !== ay && setAx(n)} opts={AXES.map((a) => a.l)} />
        <Sel id="ax-y" label="Eixo vertical" val={ay} set={(n) => n !== ax && setAy(n)} opts={AXES.map((a) => a.l)} />
        <Sel id="ax-o" label="Resultado" val={out} set={setOut} opts={OUT.map((a) => a.l)} />
        <button type="button" className="btn" onClick={run} disabled={prog !== null}>{prog !== null ? `Calculando ${num(prog * 100, 0)}%` : 'Recalcular'}</button>
      </div>
      <p className="muted">Cada célula simula {days} ciclos completos com os parâmetros atuais. Células hachuradas não conseguiram atender a demanda elétrica e ficam fora do ranking.</p>
      {cells && <div className="tablewrap"><div className="heat" style={{ gridTemplateColumns: `minmax(70px,auto) repeat(${X.v.length}, minmax(58px,1fr))` }}>
        <div className="hc corner">{Y.l} ({Y.u}) ↓<br />{X.l} ({X.u}) →</div>
        {X.v.map((v) => <div className="hc hh" key={v}>{fm(X, v)}</div>)}
        {cells.map((row, j) => <React.Fragment key={j}>
          <div className="hc hh">{fm(Y, Y.v[j])}</div>
          {row.map((r, i) => {
            const v = O.f(r, days); const t = hi > lo ? (v - lo) / (hi - lo) : 0.5;
            const fail = r.unmetKWh >= 0.5;
            const a = O.hi ? t : 1 - t;
            return <div key={i} className={`hc val ${fail ? 'fail' : ''} ${i === bx && j === by ? 'bestcell' : ''}`} style={fail ? undefined : { background: `color-mix(in oklab, var(--s1) ${Math.round(8 + 77 * a)}%, var(--panel))`, color: a > 0.55 ? 'var(--on-s1)' : 'var(--fg)' }} title={`${X.l} ${fm(X, X.v[i])} ${X.u}, ${Y.l} ${fm(Y, Y.v[j])} ${Y.u}: ${num(v, O.d)} ${O.u}. Demanda não atendida ${num(r.unmetKWh)} kWh.`}>{num(v, O.d)}</div>;
          })}
        </React.Fragment>)}
      </div></div>}
      {bx >= 0 && <div className="toolbar"><span>Melhor combinação viável: <b>{X.l} {fm(X, X.v[bx])} {X.u}</b> e <b>{Y.l} {fm(Y, Y.v[by])} {Y.u}</b>, com {num(bestV, O.d)} {O.u}.</span>
        <button type="button" className="btn primary" onClick={() => { let q: Partial<Params> = { [X.k]: X.v[bx], ...(X.extra ? X.extra(p, X.v[bx]) : {}) }; q = { ...q, [Y.k]: Y.v[by], ...(Y.extra ? Y.extra({ ...p, ...q }, Y.v[by]) : {}) }; onApply(q); }}>Aplicar e reiniciar</button></div>}
    </>
  );
}

const EQ: [string, string, string][] = [
  ['Trajetória solar', 'sen α = sen(πx)·sen(75°); G = G₀·(sen(πx))^1,15', 'Céu limpo, sem nuvens, latitude e estação.'],
  ['Cobertura', 'G* = 0,85·G·f_janela(|az−φ|) + 0,15·G·(a+0,1(1−a))', 'Setor único; sombra da borda aproximada por rampa de ±12°.'],
  ['Fotovoltaico', 'P = G·A·η·[1−0,004(T_cel−25)]·0,95; T_cel = T_amb+0,03G', 'Painéis horizontais, sem sujeira nem degradação.'],
  ['Motor', 'P = 40 W + μ·m·g·R·ω/0,5, só com erro > 2°', 'Atrito fixo; sem energia, a cobertura para.'],
  ['Bomba externa', 'P = ρ·g·(R+2)·Q/0,55', 'Sem perdas detalhadas na tubulação.'],
  ['Bateria', 'η carga = η descarga = 0,95', 'Sem envelhecimento nem autodescarga. A bomba externa preserva 15% de reserva.'],
  ['Convecção interna', 'h = 0,884·[ΔT + Δp·T/(268900−p)]^(1/3) (Dunkle)', 'Correlação de destiladores solares, fora da faixa em cúpulas grandes.'],
  ['Evaporação', 'q_e = 16,273·10⁻³·h·(a_w·p_s(T_w) − p_a); a_w = 1 − 5,37·10⁻⁴·S', 'Água bem misturada, sem estratificação.'],
  ['Condensação', 'q_c = 16,273·10⁻³·h·(p_a − p_s(T_vidro)), apenas se p_a > p_s(T_vidro)', 'Vidro com temperatura única. Em campo há gradientes.'],
  ['Coleta', 'filme acima de 0,04 kg/m² escorre com τ = 180 s; 85% chega ao tanque', 'Retenção e eficiência são hipóteses de projeto.'],
  ['Película externa', 'Q = ε·ṁ·c_p·(T_v − T_ext); ε = 1 − exp(−UA/ṁc_p)', 'Molhamento uniforme até 85% do vidro.'],
  ['Reservatório externo', 'C·dT/dt = Q_película + α·G·A − h·A·ΔT − q_evap − ε·σ·A·(T⁴−T_céu⁴) − U·A·ΔT', 'Mistura total; a temperatura muda com o balanço.'],
  ['Céu', 'T_céu = 0,0552·T_amb^1,5 (Swinbank)', 'Céu claro; subestima a radiação com nuvens.'],
  ['Evapotranspiração', 'λE = 1,26·[Δ/(Δ+γ)]·R·estresse·mín(1, VPD/1 kPa)', 'Priestley-Taylor adaptado. Plantas sem crescimento nem fotossíntese explícita.'],
  ['Numérico', 'Euler explícito, Δt = 5 s (10 s em lotes)', 'Calor latente constante, 2,43 MJ/kg.'],
];

export function ModelTab({ s }: { s: State }) {
  const c = closures(s);
  return (
    <div className="model">
      <p className="verdict">Este é um modelo físico simplificado. Todos os números são estimativas sob hipóteses configuráveis e não representam medições de uma estrutura real.</p>
      <div className="mgrid">
        <section>
          <h4>Regras científicas aplicadas</h4>
          <ul>
            <li>A eletricidade vem somente dos painéis fotovoltaicos e da bateria. Água salgada ao Sol não gera energia.</li>
            <li>O reservatório externo tem volume finito e temperatura própria. Aquece, esfria e perde água por evaporação.</li>
            <li>A condensação só ocorre quando a pressão de vapor do ar supera a de saturação na temperatura do vidro.</li>
            <li>O giro da cobertura consome energia. Se faltar potência, a cobertura para.</li>
            <li>Quando a oferta é menor que a demanda, as cargas são cortadas pela ordem: resfriamento, irrigação, coleta, motor e sensores.</li>
          </ul>
        </section>
        <section>
          <h4>Conservação nesta rodada</h4>
          <dl className="closure">
            <div className="row"><dt>Água, resíduo</dt><dd>{c.waterPct.toExponential(1)}<small>%</small></dd></div>
            <div className="row"><dt>Eletricidade, resíduo</dt><dd>{c.elecPct.toExponential(1)}<small>%</small></dd></div>
            <div className="row"><dt>Calor, resíduo</dt><dd>{c.heatPct.toExponential(1)}<small>%</small></dd></div>
            <div className="row"><dt>Volume do tanque máximo</dt><dd>{num(K.TANK_L / 1000, 0)}<small>m³</small></dd></div>
          </dl>
          <p className="muted">Resíduo próximo de zero mostra que o sistema não cria água nem energia dentro do cálculo. Não prova que o modelo represente a realidade.</p>
        </section>
      </div>
      <div className="tablewrap"><table className="eq"><thead><tr><th>Processo</th><th>Equação</th><th>Limitação</th></tr></thead>
        <tbody>{EQ.map(([a, b, l]) => <tr key={a}><th scope="row">{a}</th><td><code>{b}</code></td><td>{l}</td></tr>)}</tbody></table></div>
    </div>
  );
}
