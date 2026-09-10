/**
 * `interior` - what happens between the primer and the muzzle.
 *
 * The published lumped-parameter model, with the form function as an interface. Framework-free
 * and no I/O. Equations and assumptions are documented in `lib/interior/solve.ts`.
 *
 * **Read `NOT_A_PRESSURE_TEST` before using any number this produces.**
 */

export * from './types';
export * from './formFunction';
export * from './solve';
