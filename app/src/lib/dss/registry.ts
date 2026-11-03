import { aras } from './aras';
import { copras } from './copras';
import { edas } from './edas';
import { mabac } from './mabac';
import { moora } from './moora';
import { saw } from './saw';
import { smart } from './smart';
import { topsis } from './topsis';
import type { DssMethod } from './types';
import { vikor } from './vikor';
import { waspas } from './waspas';
import { wp } from './wp';

export const methods: DssMethod[] = [
  saw,
  wp,
  topsis,
  waspas,
  moora,
  copras,
  vikor,
  edas,
  aras,
  mabac,
  smart,
];

export const methodMap: Record<string, DssMethod> = Object.fromEntries(
  methods.map((m) => [m.id, m])
);

export function getMethod(id: string): DssMethod | undefined {
  return methodMap[id.toLowerCase()];
}

export function methodIds(): string[] {
  return methods.map((m) => m.id);
}

/** Metode yang menganggap nilai lebih besar lebih baik. */
export function higherIsBetterOf(methodId: string): boolean {
  return methodMap[methodId.toLowerCase()]?.higherIsBetter !== false;
}