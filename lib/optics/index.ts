/**
 * `optics` - the arithmetic between a trajectory and a scope: angles, turret clicks, come-up
 * tables, reticle subtensions and reticle ranging.
 *
 * Depends on `lib/ballistics` for the trajectory it reads and for the two empirical corrections
 * it reports. Framework-free, no I/O.
 */

export * from './angles';
export * from './turret';
export * from './reticle';
export * from './reticleMarks';
export * from './reticleDrawing';
export * from './comeup';
