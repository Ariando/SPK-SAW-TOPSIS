import { saw } from './saw';
import { topsis } from './topsis';
import type { DssMethod } from './types';
import { wp } from './wp';

export const methods: DssMethod[] = [saw, wp, topsis];

export const methodMap: Record<string, DssMethod> = Object.fromEntries(
  methods.map((m) => [m.id, m])
);

export function getMethod(id: string): DssMethod | undefined {
  return methodMap[id.toLowerCase()];
}

export function methodIds(): string[] {
  return methods.map((m) => m.id);
}