/**
 * The form function: how much surface the grain is burning, as it burns away.
 *
 * In this formalism `φ(z)` **is the burning surface area** relative to its initial value -
 * `SA(z)/SA₀` - and "progressive" or "degressive" is literally whether that area grows as the
 * grain regresses (perforations opening out) or shrinks (a ball burning down). It is not an
 * abstract fitting curve: its shape controls how the burning surface changes during the shot.
 *
 * It is an **interface** for the same reason drag is one in `lib/ballistics`: the shapes below are
 * the textbook ones, real products depart from them, and a solver that hard-coded a curve would be
 * claiming to know something about a powder that it does not. Whoever has measured a real one
 * supplies it here and nothing else changes.
 */

export interface FormFunction {
  /** Named, because every result it produces has to say which assumption made it. */
  readonly name: string;
  /** Relative burning surface at burned fraction `z`, where `phi(0)` is 1 by construction. */
  phi(z: number): number;
}

/** A grain whose surface never changes: a slab burning on two faces. The simplest case. */
export const CONSTANT_SURFACE: FormFunction = {
  name: 'constant surface',
  phi: () => 1
};

/**
 * The classic degressive grain: a sphere or a cord, whose surface falls as it burns.
 *
 * `φ(z) = (1 - z)^(2/3)` is the sphere - surface goes as the two-thirds power of remaining
 * volume. The exponent is exposed because a cord is 1/2 and real shapes sit between.
 */
export function degressive(exponent = 2 / 3): FormFunction {
  return {
    name: `degressive (1-z)^${Number(exponent.toFixed(3))}`,
    phi: (z: number) => Math.pow(Math.max(0, 1 - z), exponent)
  };
}

/**
 * The standard single-perforated tubular grain, from the geometry rather than a fit.
 *
 * A tube burning inward and outward at once: the outer surface shrinks, the perforation grows,
 * and the two nearly cancel - which is why tubular powders are called neutral. `theta` is the
 * usual form parameter, zero for exactly neutral.
 */
export function tubular(theta = 0): FormFunction {
  return {
    name: `tubular (θ=${Number(theta.toFixed(3))})`,
    // Normalised at z = 0, like every other form function here: φ(0) = 1, and θ says how the
    // surface moves from there. Normalising at z = 1 instead would make θ change the *initial*
    // burn rate as well as its trend, which is not what the parameter means.
    phi: (z: number) => 1 + theta * Math.min(1, Math.max(0, z))
  };
}

/**
 * The parametric form function real propellant data is fitted to: `φ(z) = μ·(1 + λz)^n`.
 *
 * Kneubühl 3.3:23. **This is the one to reach for**: published propellant constants are fitted to
 * it, and it degrades exactly to the textbook shapes rather than approximating them -
 *
 * ```
 *   μ=1, λ=0            neutral, constant surface
 *   μ=1, λ=-1, n=2/3    a sphere or cube  (Kneubühl 3.3:21)
 *   μ=1, λ=-1, n=1/2    a cylinder with inhibited ends  (3.3:22)
 *   μ=1, n=1            a tube, λ being the progressivity
 * ```
 *
 * Carlucci writes the same idea as `φ = (1-f)(1+θf)` with `f` the *remaining* web, which runs the
 * other way from `z`; `θ = 0` is the neutral grain there.
 *
 * With `λ = 1` and `n = ½` the energy equation integrates in closed form, which is why that pair
 * was standard before computers.
 *
 * It cannot represent a multi-perforation grain after its webs meet: the grain breaks into slivers
 * and burns strongly degressively from then on, and that needs a piecewise function
 * (Kneubühl §3.3.2.2). Use `piecewiseLinear` or `tabulated` for those.
 */
export function parametric(mu = 1, lambda = 0, n = 1): FormFunction {
  const name = `parametric μ=${round3(mu)} λ=${round3(lambda)} n=${round3(n)}`;
  return {
    name,
    phi(z: number) {
      const base = 1 + lambda * Math.min(1, Math.max(0, z));
      // A negative base under a fractional power is not a surface; it is the parameters saying the
      // grain is gone. Zero, not NaN.
      if (base <= 0) return 0;
      return mu * Math.pow(base, n);
    }
  };
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/**
 * A piecewise-linear form function of any number of stages.
 *
 * Each stage is linear in burned fraction `z`. Stage boundaries may be discontinuous,
 * allowing the caller to describe a change in burning behaviour with supplied coefficients.
 *
 * `breaks` are the z values where a stage ends; `slopes` and `intercepts` describe each stage as
 * `φ = intercept + slope·z`. There is one more stage than there are breaks.
 */
export function piecewiseLinear(
  breaks: readonly number[],
  intercepts: readonly number[],
  slopes: readonly number[],
  name = 'piecewise linear'
): FormFunction {
  if (intercepts.length !== breaks.length + 1 || slopes.length !== breaks.length + 1) {
    throw new Error('a piecewise form function needs one more stage than it has breaks');
  }
  for (let i = 1; i < breaks.length; i += 1) {
    if (breaks[i]! <= breaks[i - 1]!) throw new Error('form-function breaks must ascend');
  }
  return {
    name,
    phi(z: number) {
      const at = Math.min(1, Math.max(0, z));
      let stage = breaks.length;
      for (let i = 0; i < breaks.length; i += 1) {
        if (at < breaks[i]!) {
          stage = i;
          break;
        }
      }
      return intercepts[stage]! + slopes[stage]! * at;
    }
  };
}

/**
 * A form function measured rather than assumed: a table of `[z, phi]`, interpolated.
 *
 * This is the one the interface exists for. A real propellant's burning surface is not a textbook
 * shape, and it can be *measured* - inverted out of a solved or a closed-vessel pressure trace,
 * since `dz/dt` over `p` is proportional to it. Handed such a table, the solver uses it and nothing
 * else changes.
 *
 * The table need not start at `z = 0` or reach `z = 1`, and usually will not: both ends of a
 * measured trace are noise, the ignition transient at one and `dz/dt` going to zero at the other.
 * Outside the table the nearest end value is held rather than extrapolated, because extrapolating
 * a burning surface off the end of the evidence is inventing one.
 */
export function tabulated(points: readonly (readonly [number, number])[], name = 'measured'): FormFunction {
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  if (sorted.length < 2) throw new Error('a measured form function needs at least two points');
  for (const [z, phi] of sorted) {
    if (!Number.isFinite(z) || !Number.isFinite(phi)) throw new Error('form-function points must be numbers');
    if (phi < 0) throw new Error('a burning surface cannot be negative');
  }
  return {
    name,
    phi(z: number) {
      const at = Math.min(1, Math.max(0, z));
      const first = sorted[0]!;
      const last = sorted[sorted.length - 1]!;
      if (at <= first[0]) return first[1];
      if (at >= last[0]) return last[1];
      let lo = 0;
      let hi = sorted.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (sorted[mid]![0] <= at) lo = mid;
        else hi = mid;
      }
      const [z0, p0] = sorted[lo]!;
      const [z1, p1] = sorted[hi]!;
      return p0 + ((p1 - p0) * (at - z0)) / (z1 - z0);
    }
  };
}

/**
 * Check a form function before trusting it with a solve.
 *
 * A negative surface is not a shape, and a burning area that has gone to zero before the powder
 * has stops the burn dead - both produce a plausible-looking curve from an impossible grain.
 */
export function checkFormFunction(form: FormFunction, steps = 200): string[] {
  const problems: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const z = i / steps;
    const value = form.phi(z);
    if (!Number.isFinite(value)) {
      problems.push(`${form.name}: φ(${z.toFixed(3)}) is not a number`);
      break;
    }
    if (value < 0) {
      problems.push(`${form.name}: φ(${z.toFixed(3)}) is negative, which is not a surface area`);
      break;
    }
    if (value === 0 && z < 0.999) {
      problems.push(
        `${form.name}: φ(${z.toFixed(3)}) is zero, so the burn stops with powder unburned`
      );
      break;
    }
  }
  return problems;
}
