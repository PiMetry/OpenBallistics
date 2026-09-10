/**
 * The air the bullet flies through.
 *
 * Computes density from measured temperature, station pressure and humidity. Pressure must be
 * absolute at the measurement location, not corrected to sea level. Standard atmosphere is an
 * explicit function call rather than a silent default.
 *
 * Humidity is included because it is cheap, not because it is large: at 30 °C the difference
 * between bone dry and saturated is under 2 % of density, which moves a long-range drop by less
 * than the wind call does. It is here so that a user who measured it is not told it was ignored.
 */

/** What a kestrel reads, and nothing derived. */
export interface Atmosphere {
  /** °C. */
  readonly temperatureC: number;
  /** Pa, absolute - the pressure at the shooter, not corrected to sea level. */
  readonly pressurePa: number;
  /** Relative humidity, 0..1. */
  readonly humidity: number;
}

/** ICAO standard sea level: 15 °C, 1013.25 hPa, dry. */
export const STANDARD_SEA_LEVEL: Atmosphere = {
  temperatureC: 15,
  pressurePa: 101325,
  humidity: 0
};

/**
 * "Standard Metro": 59 °F, 29.53 inHg, 78 % relative humidity.
 *
 * Not an alternative to ICAO so much as an older one, and the reason it is here is practical:
 * **most American published ballistic tables were computed in this air, not ICAO's.** It is
 * thinner - 29.53 inHg against 29.92 - so a table computed in it shows slightly higher
 * velocities downrange, and comparing our output to a manufacturer's chart under the wrong
 * reference air produces a disagreement that looks like a solver error and is not.
 * `validation.test.ts` is the demonstration: the same load is out by 0.6 % under ICAO and by
 * 0.09 % under this.
 */
export const STANDARD_METRO: Atmosphere = {
  temperatureC: 15,
  pressurePa: 29.53 * 3386.389,
  humidity: 0.78
};

const KELVIN = 273.15;
/** Specific gas constant for dry air, J/(kg·K). */
const R_DRY = 287.0500676;
/** …and for water vapour. */
const R_VAPOUR = 461.5;

/**
 * Saturation vapour pressure in Pa, by the Buck (1996) equation over water.
 *
 * Valid from about -80 °C to +50 °C, which is every condition anyone shoots in.
 */
export function saturationVapourPressure(temperatureC: number): number {
  const t = temperatureC;
  return 611.21 * Math.exp((18.678 - t / 234.5) * (t / (257.14 + t)));
}

/** Air density in kg/m³, humid air treated as the mixture it is. */
export function density(air: Atmosphere): number {
  const t = air.temperatureC + KELVIN;
  if (t <= 0) throw new Error('temperature must be above absolute zero');
  const pv = clampHumidity(air.humidity) * saturationVapourPressure(air.temperatureC);
  const pd = air.pressurePa - pv;
  if (pd <= 0) throw new Error('pressure is below the vapour pressure at that temperature');
  return pd / (R_DRY * t) + pv / (R_VAPOUR * t);
}

/**
 * Speed of sound in m/s.
 *
 * `sqrt(γ·P/ρ)`, with γ shaded from 1.400 toward 1.33 by the mole fraction of water vapour. The
 * humid correction is a linear mixture rather than a measured value; it is worth under 1 m/s in
 * any realistic condition and is here so that Mach and density come from one consistent air
 * rather than from two different assumptions.
 */
export function speedOfSound(air: Atmosphere): number {
  const pv = clampHumidity(air.humidity) * saturationVapourPressure(air.temperatureC);
  const xv = pv / air.pressurePa;
  const gamma = 1.4 * (1 - xv) + 1.33 * xv;
  return Math.sqrt((gamma * air.pressurePa) / density(air));
}

/**
 * The ICAO standard atmosphere at a geopotential altitude, in metres.
 *
 * Only useful as a stand-in for a measurement, and the caller should say so wherever the result is
 * shown: real air at 1 500 m is rarely standard air at 1 500 m.
 */
export function standardAtmosphere(altitudeM: number): Atmosphere {
  return {
    temperatureC: 15 - 0.0065 * altitudeM,
    pressurePa: 101325 * Math.pow(1 - 2.25577e-5 * altitudeM, 5.25588),
    humidity: 0
  };
}

/**
 * Density altitude in metres: the standard-atmosphere altitude with this air's density.
 *
 * The single number that summarises "thin air" for a shooter, and the one most range cards are
 * indexed by. Inverts the standard density profile, so it is exactly consistent with
 * `standardAtmosphere` above.
 */
export function densityAltitude(air: Atmosphere): number {
  const ratio = density(air) / density(STANDARD_SEA_LEVEL);
  return (1 - Math.pow(ratio, 1 / 4.25588)) / 2.25577e-5;
}

function clampHumidity(humidity: number): number {
  if (!Number.isFinite(humidity)) throw new Error('humidity must be a number from 0 to 1');
  return Math.min(1, Math.max(0, humidity));
}
