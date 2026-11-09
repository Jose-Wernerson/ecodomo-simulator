import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Params, geometry } from '../engine/params';
import { sunAt } from '../engine/physics';
import { SCENARIOS } from '../engine/scenarios';
import { Sim, SPEEDS } from '../engine/sim';
import { DomeScene, PartInfo, ViewMode } from '../scene/DomeScene';
import { ChartsTab, CompareTab, ExploreTab, ModelTab } from './Analysis';
import { Controls } from './Controls';
import { hhmm, num, phaseName } from './format';
import { CycleStrip, Readouts } from './Readouts';

const sim = new Sim();
if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) sim.running = false;

function useUiClock(ms: number) {
  const [, set] = useState(0);
  useEffect(() => { const id = setInterval(() => set((n) => n + 1), ms); return () => clearInterval(id); }, [ms]);
}

const TABS = [['charts', 'Gráficos'], ['compare', 'Cenários'], ['explore', 'Combinações'], ['model', 'Modelo']] as const;
type Tab = typeof TABS[number][0];

export function App() {
  useUiClock(250);
  useSyncExternalStore((f) => sim.subscribe(f), () => sim.draft);
  const hostRef = useRef<HTMLDivElement>(null), labelRef = useRef<HTMLDivElement>(null), sceneRef = useRef<DomeScene | null>(null);
  const [view, setView] = useState<ViewMode>('external');
  const [labels, setLabels] = useState(true), [follow, setFollow] = useState(false);
  const [part, setPart] = useState<PartInfo | null>(null);
  const [tab, setTab] = useState<Tab>('charts');
  const [glErr, setGlErr] = useState(false);

  useEffect(() => {
    let sc: DomeScene;
    try { sc = new DomeScene(hostRef.current!, labelRef.current!, setPart); }
    catch { setGlErr(true); let raf = 0, last = performance.now(); const l = (t: number) => { sim.advance(t - last); last = t; raf = requestAnimationFrame(l); }; raf = requestAnimationFrame(l); return () => cancelAnimationFrame(raf); }
    sceneRef.current = sc;
    let raf = 0, last = performance.now();
    const loop = (t: number) => { const d = t - last; last = t; sim.advance(d); sc.update(sim.state, sim.applied, Math.min(d, 100) / 1000 * Math.min(sim.speed, 4), sim.running); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); sc.dispose(); };
  }, []);
  useEffect(() => { sceneRef.current?.setView(view); }, [view]);
  useEffect(() => { sceneRef.current?.setLabels(labels); }, [labels]);
  useEffect(() => { if (sceneRef.current) sceneRef.current.followSun = follow; }, [follow]);

  const s = sim.state, p = sim.applied;
  const sun = sunAt(s.t, p);
  const day = Math.floor(s.t / (p.cycleHours * 3600)) + 1;
  const scen = SCENARIOS.findIndex((c) => { const a = c.apply(p); return a.coolingEnabled === p.coolingEnabled && a.coverEnabled === p.coverEnabled; });
  const draftGeo = useMemo(() => geometry(sim.draft), [sim.draft]);
  const set = <K extends keyof Params>(k: K, v: Params[K]) => sim.setParam(k, v);

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <h1>EcoDomo <em>Simulator 1.0</em></h1>
          <p>Uma biosfera experimental inspirada na organização dos elementos da criação.</p>
        </div>
        <div className="clock" aria-live="off">
          <span className="big">{hhmm(sun.hour24)}</span>
          <span>Ciclo {day} · {phaseName(sun.hour24, sun.G > 0, sun.x)}</span>
          <span>{num(s.G, 0)} W/m²</span>
        </div>
        <div className="transport">
          <button type="button" className="btn primary" onClick={() => sim.toggle()}>{sim.running ? 'Pausar' : 'Iniciar'}</button>
          <button type="button" className={`btn ${sim.pending ? 'attn' : ''}`} onClick={() => sim.reset()}>Reiniciar</button>
          <div className="seg" role="group" aria-label="Velocidade">{SPEEDS.map((v) => <button key={v} type="button" className={sim.speed === v ? 'on' : ''} onClick={() => sim.setSpeed(v)}>{v}×</button>)}</div>
        </div>
      </header>

      <nav className="scen" aria-label="Cenário experimental">
        <span className="muted">Cenário</span>
        {SCENARIOS.map((c, i) => <button type="button" key={c.id} className={scen === i ? 'on' : ''} onClick={() => sim.setMany({ coolingEnabled: c.apply(p).coolingEnabled, coverEnabled: c.apply(p).coverEnabled })}><small>{i + 1}</small>{c.name}</button>)}
      </nav>

      {sim.pending && <div className="banner"><span>Alterações estruturais aguardam o reinício da simulação.</span><button type="button" className="btn attn" onClick={() => sim.reset()}>Reiniciar agora</button></div>}
      {draftGeo.depthAdjusted && <div className="banner">O volume não cabe nessa profundidade. A profundidade efetiva sobe para {num(draftGeo.depth, 2)} m e a ilha fica com 10% do piso.</div>}

      <main className="lab">
        <aside className="panel left" aria-label="Painel de controle"><h2>Parâmetros</h2><Controls p={sim.draft} set={set} /></aside>
        <section className="stage">
          <div className="viewport">
            <div ref={hostRef} className="gl" />
            <div ref={labelRef} className="labels" />
            {glErr && <div className="glerr">Este navegador não conseguiu iniciar o WebGL. A simulação, os indicadores e os gráficos continuam funcionando.</div>}
            <div className="viewbar">
              <div className="seg" role="group" aria-label="Visualização">
                {([['external', 'Externa'], ['cut', 'Corte'], ['inside', 'Interior']] as const).map(([k, l]) => <button key={k} type="button" className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}
              </div>
              <button type="button" className={`chip ${labels ? 'on' : ''}`} aria-pressed={labels} onClick={() => setLabels(!labels)}>Identificar</button>
              <button type="button" className={`chip ${follow ? 'on' : ''}`} aria-pressed={follow} onClick={() => setFollow(!follow)}>Seguir o Sol</button>
            </div>
            {part && <div className="partcard"><button type="button" aria-label="Fechar" onClick={() => setPart(null)}>×</button><b>{part.name}</b><p>{part.desc}</p></div>}
          </div>
          <CycleStrip s={s} p={p} />
        </section>
        <aside className="panel right" aria-label="Indicadores em tempo real"><h2>Indicadores</h2><Readouts s={s} p={p} /></aside>
      </main>

      <section className="analysis">
        <div className="tabs" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" type="button" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
        <div className="tabbody">
          {tab === 'charts' && <ChartsTab history={sim.history.slice()} p={p} />}
          {tab === 'compare' && <CompareTab p={p} />}
          {tab === 'explore' && <ExploreTab p={sim.draft} onApply={(o) => { sim.setMany(o); sim.reset(); }} />}
          {tab === 'model' && <ModelTab s={s} />}
        </div>
      </section>
      <footer>Resultados estimados por modelo matemático simplificado. O movimento do Sol representa a trajetória aparente causada pela rotação da Terra.</footer>
    </div>
  );
}
