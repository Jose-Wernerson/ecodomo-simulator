/** Parâmetros configuráveis da EcoDomo. Unidades no nome do comentário. */
export interface Params {
  // Sol e clima
  peakIrradiance: number; // W/m² no meio-dia
  cycleHours: number; // h, duração de um ciclo dia+noite
  daylightFraction: number; // 0-1, fração do ciclo com Sol
  ambientMean: number; // °C, média diária externa
  ambientSwing: number; // °C, amplitude diária (±)
  ambientRH: number; // %, umidade relativa externa
  wind: number; // m/s
  // Reservatório salino
  saltVolume: number; // m³
  saltDepth: number; // m
  saltTemp0: number; // °C
  salinity0: number; // g/kg
  initialRH: number; // %, umidade interna inicial
  // Cúpula
  domeArea: number; // m² de vidro (hemisfério)
  // Resfriamento externo
  coolingEnabled: boolean;
  coolingVolume: number; // m³
  coolingTemp0: number; // °C
  coolingFlow: number; // L/s bombeados sobre o vidro
  // Energia
  pvEfficiency: number; // 0-1
  pvArea: number; // m²
  batteryKWh: number; // kWh
  // Cobertura giratória
  coverEnabled: boolean;
  coverAuto: boolean;
  coverSpeed: number; // graus/min
  coverAperture: number; // 0-1
  coverManualAngle: number; // graus
  // Ilha
  soilMoisture0: number; // m³/m³
  soilTarget: number; // m³/m³
  irrigationEnabled: boolean;
}

export const DEFAULT_PARAMS: Params = {
  peakIrradiance: 1000,
  cycleHours: 24,
  daylightFraction: 0.5,
  ambientMean: 27,
  ambientSwing: 5,
  ambientRH: 60,
  wind: 2.5,
  saltVolume: 110,
  saltDepth: 0.5,
  saltTemp0: 28,
  salinity0: 35,
  initialRH: 60,
  domeArea: 628,
  coolingEnabled: true,
  coolingVolume: 600,
  coolingTemp0: 25,
  coolingFlow: 2,
  pvEfficiency: 0.2,
  pvArea: 14,
  batteryKWh: 10,
  coverEnabled: true,
  coverAuto: true,
  coverSpeed: 1,
  coverAperture: 0.8,
  coverManualAngle: 180,
  soilMoisture0: 0.28,
  soilTarget: 0.25,
  irrigationEnabled: true,
};

/** Constantes físicas e de projeto, centralizadas para futuras calibrações. */
export const K = {
  SIGMA: 5.670374e-8,
  LATENT: 2.43e6, // J/kg, constante para fechar o balanço de energia
  RV: 461.5, // J/(kg K)
  CP_AIR: 1005,
  RHO_AIR: 1.15,
  CP_SEA: 3990,
  RHO_SEA: 1025,
  CP_WATER: 4186,
  GLASS_AREAL_C: 12600, // J/(m² K), vidro 6 mm
  SOIL_DEPTH: 0.4, // m
  SOIL_C: 2.2e6, // J/(m³ K)
  COOL_BASIN_DEPTH: 1.5, // m
  PEAK_ELEV: (75 * Math.PI) / 180,
  BEAM_FRAC: 0.85,
  GLASS_ABS: 0.06,
  GLASS_TAU: 0.86,
  WATER_ABS: 0.9,
  SOIL_ABS: 0.75,
  COOL_ABS: 0.85,
  COLLECT_EFF: 0.85,
  FILM_RETAIN: 0.04, // kg/m² retidos no vidro antes de escorrer
  RUNOFF_TAU: 180, // s
  TANK_L: 30000,
  ACH: 0.05, // trocas de ar por hora (vazamento)
  FILM_U: 250, // W/(m² K)
  INVERTER: 0.95,
  CHG: 0.95,
  DIS: 0.95,
  PV_TEMP_COEF: -0.004, // 1/K
  P_SENSORS: 15, // W
  P_MOTOR_DRIVER: 40, // W
  COVER_MASS_M2: 8, // kg/m² de piso
  COVER_MU: 0.02,
  MOTOR_ETA: 0.5,
  PUMP_ETA: 0.55,
  IRRIG_CAP: 0.3, // kg/s
  THETA_WILT: 0.12,
  THETA_FC: 0.3,
};

export interface Geometry {
  R: number; // raio da cúpula
  floor: number;
  saltArea: number;
  islandArea: number;
  islandR: number;
  depth: number; // profundidade efetiva
  airVolume: number;
  coolArea: number;
  coolOuterR: number;
  depthAdjusted: boolean;
}

export function geometry(p: Params): Geometry {
  const R = Math.sqrt(p.domeArea / (2 * Math.PI));
  const floor = Math.PI * R * R;
  let saltArea = p.saltVolume / p.saltDepth;
  let depth = p.saltDepth;
  let depthAdjusted = false;
  if (saltArea > 0.9 * floor) {
    saltArea = 0.9 * floor;
    depth = p.saltVolume / saltArea;
    depthAdjusted = true;
  }
  const islandArea = floor - saltArea;
  const coolArea = p.coolingVolume / K.COOL_BASIN_DEPTH;
  return {
    R,
    floor,
    saltArea,
    islandArea,
    islandR: Math.sqrt(islandArea / Math.PI),
    depth,
    airVolume: (2 / 3) * Math.PI * R * R * R,
    coolArea,
    coolOuterR: Math.sqrt(R * R + coolArea / Math.PI),
    depthAdjusted,
  };
}
