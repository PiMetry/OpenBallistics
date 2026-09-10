/**
 * The point-mass trajectory: Newton's second law, integrated.
 *
 * Uses fixed-step RK4 with a pluggable drag function and explicit input validation.
 *
 * **The frame is the line of sight, not the ground.** x runs along the sight line, y is
 * perpendicular to it and up, z is to the shooter's right. Gravity is therefore resolved into
 * both x and y by the look angle. That is deliberate: it makes inclined fire fall out of the
 * integration instead of being patched afterwards with a cosine, which is the "improved rule"
 * B.1b asks for, and it makes a range step a *slant* range - what a laser rangefinder gives.
 *
 * Spin drift and aerodynamic jump are not in the integration. They are empirical corrections to a
 * point-mass result (a point mass has no axis to precess about), and `stability.ts` supplies them
 * separately so that each stays labelled in the output rather than disappearing into the drop.
 *
 * **Coriolis is.** Unlike those two it is not a fit - it is a real acceleration, `-2 Ω x v`, and
 * with an integrator already in hand there is no reason to approximate it. It is off unless the
 * shooter's latitude is given, because B.1b forbids assuming one.
 */

import { density as airDensity, speedOfSound, type Atmosphere } from './atmosphere';
import { dragDeceleration, modelFor, type BallisticCoefficient, type DragModel } from './drag';

/** Standard gravity, m/s^2. */
export const G = 9.80665;

/** Below this the BC-scaled standard curve is least trustworthy. B.1b: flag the band, don't hide it. */
export const TRANSONIC_MACH = 1.2;

/** Earth's rotation rate, rad/s. One sidereal day, not one solar day. */
export const EARTH_RATE = 7.292115e-5;

export class SolverRefusal extends Error {}

export interface Bullet {
  readonly massKg: number;
  readonly diameterM: number;
  /** Needed for stability and therefore for spin drift; absent is allowed, silently guessed is not. */
  readonly lengthM?: number;
  readonly bc: BallisticCoefficient;
  /**
   * A measured Cd-vs-Mach curve for this bullet, if one exists, used instead of the standard
   * table the BC names. B.1a: the solver never knows the difference, which is the whole reason
   * drag is an interface. The BC still scales it, so a custom curve wants a form factor of 1.
   */
  readonly drag?: DragModel;
}

export interface Wind {
  readonly speedMps: number;
  /**
   * Degrees clockwise from downrange, giving the direction the wind blows *towards*: 90 degrees is
   * a left-to-right crosswind. Stated because half of all wind bugs are this convention.
   */
  readonly directionDeg: number;
}

export interface Shot {
  readonly bullet: Bullet;
  /** m/s at the muzzle. */
  readonly muzzleVelocity: number;
  /** Line of sight above the bore, metres. */
  readonly sightHeightM: number;
  /** Slant range the rifle is zeroed at, metres. */
  readonly zeroDistanceM: number;
  readonly air: Atmosphere;
  readonly wind?: Wind;
  /** Positive uphill. Zero for level fire. */
  readonly lookAngleDeg?: number;
  /**
   * The shooter's latitude, degrees, positive north.
   *
   * **Coriolis is computed only when this is given.** B.1b: never assume a latitude. Absent, the
   * term is left out entirely and the caller can say so.
   */
  readonly latitudeDeg?: number;
  /**
   * The direction of fire, degrees clockwise from true north.
   *
   * Optional even with a latitude. Without it, Earth's rotation is treated as purely vertical at
   * the shooter - which keeps the whole horizontal deflection, the part that depends on latitude
   * alone, and drops the vertical part, which does not exist without knowing which way the rifle
   * points. Shooting east lifts the strike and west lowers it; with no azimuth there is no way to
   * know which, and inventing one would put a real error in the answer rather than leaving a
   * known gap.
   */
  readonly azimuthDeg?: number;
}

export interface TrajectoryPoint {
  /** Slant range along the line of sight, metres. */
  readonly rangeM: number;
  readonly timeS: number;
  readonly velocityMps: number;
  readonly mach: number;
  readonly energyJ: number;
  /** Metres below the line of sight; negative above it. */
  readonly dropM: number;
  /** Metres right of the line of sight from wind alone; negative to the left. */
  readonly windageM: number;
  /** True while below `TRANSONIC_MACH`, where the standard curve is least trustworthy. */
  readonly transonic: boolean;
}

export interface Trajectory {
  readonly model: DragModel['name'];
  /** The angle the bore sits above the line of sight to make the zero, radians. */
  readonly launchAngleRad: number;
  readonly points: readonly TrajectoryPoint[];
  /** The air the whole solve used, echoed so no output can be shown without its conditions. */
  readonly air: Atmosphere;
  /**
   * What was left out of this solve and why, in the user's words.
   *
   * Empty when everything the solver knows how to do was done. A trajectory that quietly omitted a
   * term would be indistinguishable from one that included it.
   */
  readonly omitted: readonly string[];
}

interface State {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

/**
 * The time step, seconds.
 *
 * Chosen by the convergence test in the suite, not by feel: halving it must not move a 1000 m
 * answer by more than the precision anything is displayed to.
 */
export const DEFAULT_STEP_S = 0.0005;

function check(shot: Shot): void {
  // B.1b: no BC, no answer. Inferring one from calibre or shape is exactly the invented figure
  // this project exists not to publish.
  if (!(shot.bullet.bc.value > 0)) {
    throw new SolverRefusal('no ballistic coefficient: this bullet cannot be solved, only guessed');
  }
  if (!(shot.bullet.massKg > 0)) throw new SolverRefusal('bullet mass is required');
  if (!(shot.muzzleVelocity > 0)) throw new SolverRefusal('muzzle velocity is required');
  if (!(shot.zeroDistanceM > 0)) throw new SolverRefusal('a zero distance is required');
}

/**
 * Earth's rotation, in the shooter's frame: x downrange, y up, z to the right.
 *
 * In East-North-Up coordinates the rotation is `Ω (0, cos φ, sin φ)`. Turning that into a frame
 * pointing along an azimuth `A` clockwise from north gives the three components below; the signs
 * are worth checking rather than trusting, and the tests do: facing north, "right" is east.
 */
function rotationIn(latitudeDeg: number, azimuthDeg: number | undefined): {
  x: number;
  y: number;
  z: number;
} {
  const phi = (latitudeDeg * Math.PI) / 180;
  if (azimuthDeg === undefined) {
    // No azimuth: keep the vertical component of the rotation, which is what the latitude-only
    // horizontal deflection comes from, and drop the horizontal one, whose direction is unknown.
    return { x: 0, y: EARTH_RATE * Math.sin(phi), z: 0 };
  }
  const az = (azimuthDeg * Math.PI) / 180;
  return {
    x: EARTH_RATE * Math.cos(phi) * Math.cos(az),
    y: EARTH_RATE * Math.sin(phi),
    z: -EARTH_RATE * Math.cos(phi) * Math.sin(az)
  };
}

/** One RK4 step of the point-mass equations. */
function step(
  s: State,
  dt: number,
  model: DragModel,
  bc: number,
  rho: number,
  sound: number,
  gx: number,
  gy: number,
  wind: { x: number; z: number },
  rotation: { x: number; y: number; z: number } | null
): State {
  const accel = (st: State) => {
    // Drag acts along the air-relative velocity, which is what the wind changes.
    const ax = st.vx - wind.x;
    const ay = st.vy;
    const az = st.vz - wind.z;
    const speed = Math.hypot(ax, ay, az);
    let out: { x: number; y: number; z: number };
    if (speed === 0) {
      out = { x: gx, y: gy, z: 0 };
    } else {
      const dec = dragDeceleration(model, bc, speed, speed / sound, rho) / speed;
      out = { x: gx - dec * ax, y: gy - dec * ay, z: -dec * az };
    }
    if (rotation) {
      // -2 Ω x v, over the ground-relative velocity: Coriolis acts on motion over the Earth, not
      // on motion through the air, so the wind does not enter here.
      out = {
        x: out.x - 2 * (rotation.y * st.vz - rotation.z * st.vy),
        y: out.y - 2 * (rotation.z * st.vx - rotation.x * st.vz),
        z: out.z - 2 * (rotation.x * st.vy - rotation.y * st.vx)
      };
    }
    return out;
  };
  const add = (base: State, d: State, f: number): State => ({
    x: base.x + d.x * f,
    y: base.y + d.y * f,
    z: base.z + d.z * f,
    vx: base.vx + d.vx * f,
    vy: base.vy + d.vy * f,
    vz: base.vz + d.vz * f
  });
  const deriv = (st: State): State => {
    const a = accel(st);
    return { x: st.vx, y: st.vy, z: st.vz, vx: a.x, vy: a.y, vz: a.z };
  };
  const k1 = deriv(s);
  const k2 = deriv(add(s, k1, dt / 2));
  const k3 = deriv(add(s, k2, dt / 2));
  const k4 = deriv(add(s, k3, dt));
  const sum: State = {
    x: k1.x + 2 * k2.x + 2 * k3.x + k4.x,
    y: k1.y + 2 * k2.y + 2 * k3.y + k4.y,
    z: k1.z + 2 * k2.z + 2 * k3.z + k4.z,
    vx: k1.vx + 2 * k2.vx + 2 * k3.vx + k4.vx,
    vy: k1.vy + 2 * k2.vy + 2 * k3.vy + k4.vy,
    vz: k1.vz + 2 * k2.vz + 2 * k3.vz + k4.vz
  };
  return add(s, sum, dt / 6);
}

/**
 * Fly one shot at a given launch angle and report it at the ranges asked for.
 *
 * Range samples are taken by interpolating between the two steps that bracket each range, so the
 * step size sets the accuracy of the physics and not the placement of the samples.
 */
function fly(
  shot: Shot,
  launchAngleRad: number,
  ranges: readonly number[],
  dt: number
): TrajectoryPoint[] {
  const model = shot.bullet.drag ?? modelFor(shot.bullet.bc);
  const rho = airDensity(shot.air);
  const sound = speedOfSound(shot.air);
  const look = ((shot.lookAngleDeg ?? 0) * Math.PI) / 180;
  const gx = -G * Math.sin(look);
  const gy = -G * Math.cos(look);
  const windDir = ((shot.wind?.directionDeg ?? 0) * Math.PI) / 180;
  const windSpeed = shot.wind?.speedMps ?? 0;
  const wind = { x: windSpeed * Math.cos(windDir), z: windSpeed * Math.sin(windDir) };
  const rotation =
    shot.latitudeDeg === undefined ? null : rotationIn(shot.latitudeDeg, shot.azimuthDeg);

  let s: State = {
    x: 0,
    // The bullet starts at the muzzle, which is below the line of sight by the sight height.
    y: -shot.sightHeightM,
    z: 0,
    vx: shot.muzzleVelocity * Math.cos(launchAngleRad),
    vy: shot.muzzleVelocity * Math.sin(launchAngleRad),
    vz: 0
  };
  let t = 0;

  const wanted = [...ranges].sort((a, b) => a - b);
  const out: TrajectoryPoint[] = [];
  let next = 0;
  const sample = (a: State, ta: number, b: State, tb: number, range: number): TrajectoryPoint => {
    const f = b.x === a.x ? 0 : (range - a.x) / (b.x - a.x);
    const at = (p: number, q: number) => p + (q - p) * f;
    const vx = at(a.vx, b.vx);
    const vy = at(a.vy, b.vy);
    const vz = at(a.vz, b.vz);
    const speed = Math.hypot(vx, vy, vz);
    const mach = speed / sound;
    return {
      rangeM: range,
      timeS: at(ta, tb),
      velocityMps: speed,
      mach,
      energyJ: 0.5 * shot.bullet.massKg * speed * speed,
      dropM: -at(a.y, b.y),
      windageM: at(a.z, b.z),
      transonic: mach < TRANSONIC_MACH
    };
  };

  const furthest = wanted[wanted.length - 1] ?? 0;
  // A bullet that has stopped going forward will never reach the next range; bail rather than
  // integrate until the loop guard trips.
  while (next < wanted.length && s.x <= furthest && s.vx > 0 && t < 60) {
    const prev = s;
    const prevT = t;
    s = step(prev, dt, model, shot.bullet.bc.value, rho, sound, gx, gy, wind, rotation);
    t += dt;
    while (next < wanted.length && s.x >= wanted[next]!) {
      out.push(sample(prev, prevT, s, t, wanted[next]!));
      next += 1;
    }
  }
  if (next < wanted.length) {
    throw new SolverRefusal(
      `the bullet does not reach ${wanted[next]!} m: it is out of energy before then`
    );
  }
  return out;
}

/**
 * The launch angle that puts the bullet on the line of sight at the zero distance.
 *
 * Secant iteration on the drop at that range. It converges in a handful of steps because drop is
 * very nearly linear in launch angle over the range of angles a rifle uses.
 */
function zeroAngle(shot: Shot, dt: number): number {
  const dropAt = (angle: number) => fly(shot, angle, [shot.zeroDistanceM], dt)[0]!.dropM;
  let a0 = 0;
  let a1 = 0.001;
  let f0 = dropAt(a0);
  let f1 = dropAt(a1);
  for (let i = 0; i < 40; i += 1) {
    if (Math.abs(f1) < 1e-6) return a1;
    if (f1 === f0) break;
    const next = a1 - (f1 * (a1 - a0)) / (f1 - f0);
    a0 = a1;
    f0 = f1;
    a1 = next;
    f1 = dropAt(a1);
  }
  if (!Number.isFinite(a1)) throw new SolverRefusal('no launch angle produces that zero');
  return a1;
}

/** What this solve could not do, named by the input that was missing. */
function omissionsOf(shot: Shot): string[] {
  const omitted: string[] = [];
  if (shot.latitudeDeg === undefined) {
    omitted.push('Coriolis: no latitude given, and one is never assumed');
  } else if (shot.azimuthDeg === undefined) {
    omitted.push(
      'the vertical part of Coriolis: no direction of fire given, so whether the shot is lifted or dropped cannot be known. The horizontal deflection, which depends only on latitude, is included'
    );
  }
  return omitted;
}

/** Solve a shot, zeroed as the rifle is, and report it at the ranges asked for. */
export function solve(shot: Shot, ranges: readonly number[], dt = DEFAULT_STEP_S): Trajectory {
  check(shot);
  const launchAngleRad = zeroAngle(shot, dt);
  return {
    model: (shot.bullet.drag ?? modelFor(shot.bullet.bc)).name,
    launchAngleRad,
    points: fly(shot, launchAngleRad, ranges, dt),
    air: shot.air,
    omitted: omissionsOf(shot)
  };
}
