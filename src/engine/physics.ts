/**
 * Motor físico da EcoDomo. Sem dependência de interface.
 * Modelo concentrado (lumped) com integração de Euler explícita e passo fixo.
 * Todos os resultados são estimativas de modelo, não medições.
 */
import { K, Params, Geometry, geometry } from './params';

export interface State {
  t: number; // s desde a meia-noite do dia 0
  geo: Geometry;
  // temperaturas °C
  Tw: number; Ta: number; Td: number; Tc: number; Ts: number;
  // massas kg
  saltMass: number; saltKg: number; vapor: number; film: number; tank: number; soilWater: number;
  coolVol: number;
  // bateria, Wh
  battery: number;
  // cobertura
  coverAngle: number; coverRate: number; // graus, graus/min
  irrigating: boolean;
  vegHealth: number;
  // grandezas instantâneas
  G: number; sunElev: number; sunAz: number; Tamb: number; inside: number;
  RH: number; dew: number; condensing: boolean;
  evapRate: number; condRate: number; collectRate: number; irrigRate: number; etRate: number; // kg/s
  pPV: number; pMotor: number; pCool: number; pCollect: number; pIrrig: number; pSensors: number; pUsed: number; soilMoisture: number;
  salinity: number; qFilm: number; qCoolEnv: number; qDomeOut: number;
  // acumulados
  evapKg: number; condKg: number; collectKg: number; irrigKg: number; etKg: number; leakKg: number; fogKg: number;
  pvWh: number; usedWh: number; curtailedWh: number; batLossWh: number; unmetWh: number;
  motorWh: number; pumpWh: number; sensorWh: number;
  coolEvapKg: number;
  // livro contábil
  heatIn: number; heatOut: number; heatStored: number;
  water0: number; battery0: number;
  // estatísticas
  steps: number; vegOkSteps: number; tempOkSteps: number; rhOkSteps: number; maxTa: number; minBat: number;
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const pSat = (T: number) => 610.94 * Math.exp((17.625 * T) / (T + 243.04));
const dpSat = (T: number) => (pSat(T) * 17.625 * 243.04) / ((T + 243.04) * (T + 243.04));
const dewPoint = (p: number) => {
  const l = Math.log(Math.max(p, 1) / 610.94);
  return (243.04 * l) / (17.625 - l);
};
const T4 = (T: number) => { const k = T + 273.15; return k * k * k * k; };
const wrap180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Coeficiente convectivo de Dunkle para recintos de destilação solar. */
const dunkle = (T1: number, T2: number, p1: number, p2: number, floor: number) =>
  Math.max(floor, 0.884 * Math.cbrt(Math.max(0, T1 - T2 + ((p1 - p2) * (T1 + 273.15)) / (268900 - p1))));

const trapezoid = (x: number, a: number, b: number, c: number, d: number) =>
  x <= a || x >= d ? 0 : x < b ? (x - a) / (b - a) : x > c ? (d - x) / (d - c) : 1;

export function sunAt(t: number, p: Params) {
  const P = p.cycleHours * 3600;
  const ph = ((t % P) + P) % P;
  const dayLen = p.daylightFraction * P;
  const rise = (P - dayLen) / 2;
  const x = (ph - rise) / dayLen;
  const hour24 = (ph / P) * 24;
  const Tamb = p.ambientMean + p.ambientSwing * Math.sin((2 * Math.PI * (hour24 - 9)) / 24);
  if (x <= 0 || x >= 1) {
    // Sol abaixo do horizonte: ângulo negativo apenas para a visualização
    const nx = x <= 0 ? x : x - 1;
    return { x, G: 0, elev: -Math.min(0.5, Math.abs(Math.sin(Math.PI * nx)) * 0.5 + 0.02), az: x <= 0 ? 90 : 270, Tamb, hour24 };
  }
  const s = Math.sin(Math.PI * x) * Math.sin(K.PEAK_ELEV);
  const G = p.peakIrradiance * Math.pow(s / Math.sin(K.PEAK_ELEV), 1.15);
  return { x, G, elev: Math.asin(s), az: 90 + 180 * x, Tamb, hour24 };
}

export function createState(p: Params, startHour = 6): State {
  const geo = geometry(p);
  const pa = (p.initialRH / 100) * pSat(p.saltTemp0 - 1);
  const Ta = p.saltTemp0 - 1;
  const vapor = (pa * geo.airVolume) / (K.RV * (Ta + 273.15));
  const saltMass = p.saltVolume * K.RHO_SEA;
  const soilWater = p.soilMoisture0 * geo.islandArea * K.SOIL_DEPTH * 1000;
  const battery = p.batteryKWh * 500;
  const t = (startHour / 24) * p.cycleHours * 3600;
  const s: State = {
    t, geo, Tw: p.saltTemp0, Ta, Td: p.ambientMean, Tc: p.coolingTemp0, Ts: p.ambientMean,
    saltMass, saltKg: (saltMass * p.salinity0) / 1000, vapor, film: 0, tank: 2000, soilWater,
    coolVol: p.coolingVolume, battery,
    coverAngle: 90, coverRate: 0, irrigating: false, vegHealth: 0.8,
    G: 0, sunElev: 0, sunAz: 90, Tamb: p.ambientMean, inside: 0, RH: p.initialRH, dew: 0, condensing: false,
    evapRate: 0, condRate: 0, collectRate: 0, irrigRate: 0, etRate: 0,
    pPV: 0, pMotor: 0, pCool: 0, pCollect: 0, pIrrig: 0, pSensors: 0, pUsed: 0,
    soilMoisture: p.soilMoisture0, salinity: p.salinity0, qFilm: 0, qCoolEnv: 0, qDomeOut: 0,
    evapKg: 0, condKg: 0, collectKg: 0, irrigKg: 0, etKg: 0, leakKg: 0, fogKg: 0,
    pvWh: 0, usedWh: 0, curtailedWh: 0, batLossWh: 0, unmetWh: 0, motorWh: 0, pumpWh: 0, sensorWh: 0, coolEvapKg: 0,
    heatIn: 0, heatOut: 0, heatStored: 0, water0: 0, battery0: battery,
    steps: 0, vegOkSteps: 0, tempOkSteps: 0, rhOkSteps: 0, maxTa: Ta, minBat: battery,
  };
  s.water0 = saltMass + vapor + 2000 + soilWater;
  s.dew = dewPoint(pa);
  return s;
}

export const DT = 5;

export function step(s: State, p: Params, dt = DT): void {
  const g = s.geo;
  const A = p.domeArea;
  const sun = sunAt(s.t, p);
  const { G, Tamb } = sun;
  s.G = G; s.sunElev = sun.elev; s.sunAz = sun.az; s.Tamb = Tamb;
  const sec = dt / 3600;

  // ---- Cobertura: fator de passagem depende do alinhamento e da abertura
  const hw = p.coverAperture * 180;
  let fb = 1, fd = 1;
  if (p.coverEnabled) {
    const delta = Math.abs(wrap180(sun.az - s.coverAngle));
    fb = p.coverAperture >= 0.995 ? 1 : 1 - smooth(hw - 12, hw + 12, delta);
    fd = p.coverAperture + (1 - p.coverAperture) * 0.1;
  }
  const Gc = K.BEAM_FRAC * G * fb + (1 - K.BEAM_FRAC) * G * fd;

  // ---- Fotovoltaico: instalado fora da sombra da cobertura
  const Tcell = Tamb + 0.03 * G;
  const pv = Math.max(0, G * p.pvArea * p.pvEfficiency * (1 + K.PV_TEMP_COEF * (Tcell - 25)) * K.INVERTER);

  // ---- Demandas elétricas
  let target = s.coverAngle;
  if (p.coverEnabled) {
    if (!p.coverAuto) target = p.coverManualAngle;
    else if (G > 0) {
      // automático: mira o Sol; acima de 32 °C gira a janela para longe do Sol
      const over = clamp((s.Ta - 32) / 6, 0, 1);
      target = sun.az + over * (hw + 20);
    }
  }
  const err = wrap180(target - s.coverAngle);
  const wantMove = p.coverEnabled && Math.abs(err) > 2 && p.coverAperture < 0.995;
  const omega = (p.coverSpeed * Math.PI) / 180 / 60;
  const torque = K.COVER_MU * K.COVER_MASS_M2 * g.floor * 9.81 * g.R;
  const reqMotor = wantMove ? K.P_MOTOR_DRIVER + (torque * omega) / K.MOTOR_ETA : 0;

  const runoff = Math.max(0, s.film - K.FILM_RETAIN * A) / K.RUNOFF_TAU;
  const reqCollect = runoff > 0 ? 8 + (runoff * 9.81 * 3) / 0.4 : 0;

  const thetaNow = s.soilWater / (g.islandArea * K.SOIL_DEPTH * 1000);
  if (p.irrigationEnabled) {
    if (thetaNow < p.soilTarget - 0.008) s.irrigating = true;
    if (thetaNow >= p.soilTarget) s.irrigating = false;
  } else s.irrigating = false;
  const irrigOn = s.irrigating && s.tank > 1;
  const irrigCap = K.IRRIG_CAP * Math.max(0.2, g.islandArea / 90);
  const reqIrrig = irrigOn ? 6 + (irrigCap * 9.81 * 5) / 0.4 : 0;

  const coolWanted = p.coolingEnabled && p.coolingFlow > 0 && s.coolVol > 1 && s.Td > s.Tc + 0.3;
  const head = g.R + 2;
  const reqCool = coolWanted ? (1000 * 9.81 * head * p.coolingFlow * 0.001) / K.PUMP_ETA : 0;

  // ---- Despacho por prioridade; nada é fornecido além de PV + bateria
  let avail = pv + (s.battery / sec) * K.DIS;
  const grant = (req: number) => { const v = Math.min(req, Math.max(0, avail)); avail -= v; return v; };
  const pSensors = grant(K.P_SENSORS);
  // o motor precisa da potência completa para vencer o atrito; senão fica parado
  const pMotor = reqMotor > 0 && avail >= reqMotor ? grant(reqMotor) : 0;
  const pCollect = grant(reqCollect);
  const pIrrig = grant(reqIrrig);
  // bomba de resfriamento só usa bateria acima de 15 %
  const reserve = 0.15 * p.batteryKWh * 1000;
  const coolAvail = Math.max(0, pv - pSensors - pMotor - pCollect - pIrrig) + (Math.max(0, s.battery - reserve) / sec) * K.DIS;
  const pCool = Math.min(reqCool, Math.max(0, Math.min(coolAvail, avail)));
  const used = pSensors + pMotor + pCollect + pIrrig + pCool;
  const net = pv - used;
  if (net >= 0) {
    const chg = Math.min(net * K.CHG, (p.batteryKWh * 1000 - s.battery) / sec);
    s.battery += chg * sec;
    s.curtailedWh += (net - chg / K.CHG) * sec;
    s.batLossWh += (chg / K.CHG - chg) * sec;
  } else {
    const draw = -net / K.DIS;
    s.battery = Math.max(0, s.battery - draw * sec);
    s.batLossWh += (draw + net) * sec;
  }
  const req = K.P_SENSORS + reqMotor + reqCollect + reqIrrig + reqCool;
  s.unmetWh += Math.max(0, req - used) * sec;
  s.pvWh += pv * sec; s.usedWh += used * sec;
  s.motorWh += pMotor * sec; s.pumpWh += (pCool + pCollect + pIrrig) * sec; s.sensorWh += pSensors * sec;
  s.pPV = pv; s.pMotor = pMotor; s.pCool = pCool; s.pCollect = pCollect; s.pIrrig = pIrrig; s.pSensors = pSensors; s.pUsed = used;

  // o motor só gira se recebeu energia
  if (pMotor > 0) {
    const move = clamp(err, -p.coverSpeed * dt / 60, p.coverSpeed * dt / 60);
    s.coverAngle = (s.coverAngle + move + 360) % 360;
    s.coverRate = Math.abs(move) / (dt / 60);
  } else s.coverRate = 0;

  // ---- Psicrometria interna
  const Tak = s.Ta + 273.15;
  const pa = (s.vapor * K.RV * Tak) / g.airVolume;
  const psTa = pSat(s.Ta);
  const aw = clamp(1 - 5.37e-4 * s.salinity, 0.6, 1);
  const pw = aw * pSat(s.Tw);
  const pdS = pSat(s.Td);

  // ---- Radiação solar interna
  const dropletCover = clamp(s.film / (K.FILM_RETAIN * A), 0, 1);
  const flowFrac = reqCool > 0 ? pCool / reqCool : 0;
  const flow = (coolWanted ? p.coolingFlow * flowFrac : 0); // L/s
  const wet = flow > 0 ? 0.85 * Math.min(1, flow / (A * 0.002)) : 0;
  const tau = K.GLASS_TAU * (1 - 0.08 * dropletCover) * (1 - 0.03 * wet);
  const I = Gc * tau;
  s.inside = I;
  const qSolW = K.WATER_ABS * I * g.saltArea;
  const qSolS = K.SOIL_ABS * I * g.islandArea;
  const qSolG = K.GLASS_ABS * Gc * g.floor;
  const qSolFilm = 0.03 * wet * Gc * g.floor;

  // ---- Convecção, evaporação e condensação (relações de Dunkle)
  const hWA = dunkle(s.Tw, s.Ta, pw, pa, 2);
  const hSA = dunkle(s.Ts, s.Ta, pa, pa, 2);
  const hAD = dunkle(s.Ta, s.Td, pa, pdS, 1.5);
  const qWA = hWA * (s.Tw - s.Ta) * g.saltArea;
  const qSA = hSA * (s.Ts - s.Ta) * g.islandArea;
  const qAD = hAD * (s.Ta - s.Td) * A;
  const evap = (16.273e-3 * hWA * (pw - pa) * g.saltArea) / K.LATENT; // kg/s (<0: orvalho sobre a água)

  let cond = 0, filmEvap = 0;
  if (pa > pdS) cond = (16.273e-3 * hAD * (pa - pdS) * A) / K.LATENT;
  else if (s.film > 0) {
    const wetted = clamp(s.film / (K.FILM_RETAIN * A), 0, 1);
    filmEvap = Math.min((16.273e-3 * hAD * (pdS - pa) * A * wetted) / K.LATENT, s.film / dt);
  }
  s.condensing = cond > 0;

  // ---- Radiação de onda longa
  const qRadW = 0.85 * K.SIGMA * (T4(s.Tw) - T4(s.Td)) * g.saltArea;
  const qRadS = 0.85 * K.SIGMA * (T4(s.Ts) - T4(s.Td)) * g.islandArea;
  const Tsky = 0.0552 * Math.pow(Tamb + 273.15, 1.5) - 273.15;
  const qSky = 0.9 * K.SIGMA * (T4(s.Td) - T4(Tsky)) * A;

  // ---- Troca externa do vidro
  const hWind = 5.7 + 3.8 * p.wind;
  const qConv = hWind * (s.Td - Tamb) * A * (1 - wet);
  let qFilm = 0;
  if (flow > 0) {
    const C = flow * K.CP_WATER; // 1 L ≈ 1 kg
    const eff = 1 - Math.exp(-(K.FILM_U * wet * A) / C);
    qFilm = eff * C * (s.Td - s.Tc);
  }

  // ---- Reservatório externo: esquenta e esfria conforme o próprio balanço
  const cArea = s.coolVol / K.COOL_BASIN_DEPTH;
  const qCoolSol = p.coolingEnabled ? K.COOL_ABS * G * cArea : 0;
  const paAmb = (p.ambientRH / 100) * pSat(Tamb);
  const qCoolConv = hWind * (s.Tc - Tamb) * cArea;
  const qCoolEvap = Math.max(0, (hWind / 66) * (pSat(s.Tc) - paAmb) * cArea);
  const qCoolRad = 0.95 * K.SIGMA * (T4(s.Tc) - T4(Tsky)) * cArea;
  const qCoolGnd = 0.5 * (s.Tc - p.ambientMean) * cArea;
  const qCoolLoss = p.coolingEnabled ? qCoolConv + qCoolEvap + qCoolRad + qCoolGnd : 0;

  // ---- Solo e vegetação
  const theta = s.soilWater / (g.islandArea * K.SOIL_DEPTH * 1000);
  const stress = clamp((theta - K.THETA_WILT) / (K.THETA_FC - K.THETA_WILT), 0, 1);
  const vpd = Math.max(0, psTa - pa);
  const dl = dpSat(s.Ta);
  const et = Math.min(
    ((1.26 * (dl / (dl + 66)) * K.SOIL_ABS * I * stress * Math.min(1, vpd / 1000) * g.islandArea) / K.LATENT),
    Math.max(0, s.soilWater) / dt
  );
  const qRadSum = qRadW + qRadS;
  const qGW = 0.5 * (s.Tw - p.ambientMean) * g.saltArea;
  const qGS = 0.5 * (s.Ts - p.ambientMean) * g.islandArea;

  // ---- Vazamento de ar
  const leakFrac = (K.ACH / 3600) * dt;
  const leakVapor = clamp(s.vapor - (paAmb * g.airVolume) / (K.RV * (Tamb + 273.15)), -1e9, 1e9) * leakFrac;
  const Ca = K.RHO_AIR * g.airVolume * K.CP_AIR;
  const qLeak = (K.ACH / 3600) * Ca * (s.Ta - Tamb);

  // ---- Capacidades térmicas
  const Cw = s.saltMass * K.CP_SEA;
  const Cs = K.SOIL_C * K.SOIL_DEPTH * g.islandArea;
  const Cg = K.GLASS_AREAL_C * A;
  const Cc = Math.max(1, s.coolVol) * 1000 * K.CP_WATER;

  // ---- Coleta da água que escorre
  const collected = pCollect > 0 || reqCollect === 0 ? runoff : 0;
  const toTank = collected * K.COLLECT_EFF;
  const toSalt = collected - toTank;

  // ---- Irrigação depende de bomba energizada
  const irrig = irrigOn && reqIrrig > 0 ? Math.min(irrigCap * (pIrrig / reqIrrig), s.tank / dt) : 0;

  // ---- Integração
  const dTw = (qSolW - qWA - evap * K.LATENT - qRadW - qGW) * dt / Cw;
  const dTs = (qSolS - qSA - et * K.LATENT - qRadS - qGS) * dt / Cs;
  const dTa = (qWA + qSA - qAD - qLeak) * dt / Ca;
  const dTd = (qSolG + qAD + qRadSum + cond * K.LATENT - filmEvap * K.LATENT - qSky - qConv - qFilm) * dt / Cg;
  const dTc = p.coolingEnabled ? (qCoolSol + qFilm + qSolFilm - qCoolLoss) * dt / Cc : 0;

  const dVap = (evap + et + filmEvap - cond) * dt - leakVapor;

  // livro contábil de energia térmica
  const inHeat = (qSolW + qSolS + qSolG + qSolFilm + qCoolSol) * dt;
  const outHeat = (qGW + qGS + qSky + qConv + qLeak + (p.coolingEnabled ? qCoolLoss : 0)) * dt + leakVapor * K.LATENT;
  s.heatIn += inHeat; s.heatOut += outHeat;
  s.heatStored += Cw * dTw + Cs * dTs + Ca * dTa + Cg * dTd + (p.coolingEnabled ? Cc * dTc : 0) + dVap * K.LATENT;
  // o calor solar do filme vai para a água externa; se o resfriamento some, wet = 0 e o termo é nulo

  s.Tw += dTw; s.Ts += dTs; s.Ta += dTa; s.Td += dTd; if (p.coolingEnabled) s.Tc += dTc;
  s.vapor = Math.max(0, s.vapor + dVap);
  s.saltMass = Math.max(s.saltKg * 3, s.saltMass - evap * dt + toSalt * dt);
  s.film = Math.max(0, s.film + (cond - filmEvap - collected) * dt);
  s.tank += toTank * dt - irrig * dt;
  s.soilWater = Math.max(0, s.soilWater - et * dt + irrig * dt);
  if (p.coolingEnabled) s.coolVol = Math.max(0, s.coolVol - (qCoolEvap / K.LATENT) * dt / 1000);

  // transbordo do tanque volta ao reservatório salino
  if (s.tank > K.TANK_L) { s.saltMass += s.tank - K.TANK_L; s.tank = K.TANK_L; }

  // névoa: vapor acima da saturação condensa no ar e precipita
  const maxV = (pSat(s.Ta) * g.airVolume) / (K.RV * (s.Ta + 273.15));
  if (s.vapor > maxV) {
    const ex = s.vapor - maxV;
    s.vapor = maxV;
    const hRise = (ex * K.LATENT) / Ca;
    s.Ta += hRise;
    const toW = ex * (g.saltArea / g.floor);
    s.saltMass += toW; s.soilWater += ex - toW; s.fogKg += ex;
  }

  // indicadores e acumulados
  s.evapRate = Math.max(0, evap); s.condRate = cond; s.collectRate = toTank; s.irrigRate = irrig; s.etRate = et;
  s.evapKg += Math.max(0, evap) * dt; s.condKg += cond * dt; s.collectKg += toTank * dt; s.irrigKg += irrig * dt; s.etKg += et * dt;
  s.leakKg += leakVapor;
  s.qFilm = qFilm; s.qCoolEnv = qCoolLoss - qCoolSol; s.qDomeOut = qSky + qConv + qFilm;
  const pa2 = (s.vapor * K.RV * (s.Ta + 273.15)) / g.airVolume;
  s.RH = clamp((pa2 / pSat(s.Ta)) * 100, 0, 100);
  s.dew = dewPoint(pa2);
  s.soilMoisture = s.soilWater / (g.islandArea * K.SOIL_DEPTH * 1000);
  s.salinity = (s.saltKg / s.saltMass) * 1000;

  // adequação à vegetação
  const f = trapezoid(s.Ta, 8, 18, 32, 42) * trapezoid(s.RH, 15, 40, 90, 105) * clamp((s.soilMoisture - K.THETA_WILT) / 0.08, 0, 1);
  s.vegHealth += (f - s.vegHealth) * (dt / (12 * 3600));
  const tOk = s.Ta >= 15 && s.Ta <= 35, rOk = s.RH >= 40 && s.RH <= 90;
  if (tOk) s.tempOkSteps++;
  if (rOk) s.rhOkSteps++;
  if (tOk && rOk && s.soilMoisture >= 0.18) s.vegOkSteps++;
  s.steps++;
  s.maxTa = Math.max(s.maxTa, s.Ta);
  s.minBat = Math.min(s.minBat, s.battery);
  s.t += dt;
}

/** Água total dentro do sistema interno (kg). Usada no teste de fechamento. */
export const internalWater = (s: State) => s.saltMass + s.vapor + s.film + s.tank + s.soilWater;

export function closures(s: State) {
  const waterResidual = internalWater(s) + s.leakKg - s.water0;
  const elecResidual = s.battery0 + s.pvWh - s.usedWh - s.battery - s.curtailedWh - s.batLossWh;
  const heatResidual = s.heatIn - s.heatOut - s.heatStored;
  return {
    waterResidual,
    waterPct: (100 * Math.abs(waterResidual)) / s.water0,
    elecResidual,
    elecPct: (100 * Math.abs(elecResidual)) / Math.max(1, s.pvWh + s.battery0),
    heatResidual,
    heatPct: (100 * Math.abs(heatResidual)) / Math.max(1, s.heatIn),
  };
}
