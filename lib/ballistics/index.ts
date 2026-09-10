/**
 * `ballistics` - the exterior solver: drag, air, the trajectory, and the stability that spin
 * drift and aerodynamic jump follow from.
 *
 * Framework-free and no I/O: it takes numbers and gives numbers back. The scope arithmetic that
 * turns those numbers into clicks is `lib/optics`, and the rifle they describe is `lib/userdata`.
 */

export * from './dragTables';
export * from './drag';
export * from './atmosphere';
export * from './trajectory';
export * from './stability';
export * from './truing';
export * from './pointBlank';
