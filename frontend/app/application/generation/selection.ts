export function retainAvailableSelection<T>(
  current: T | null,
  available: readonly T[],
): T | null {
  return current !== null && available.includes(current) ? current : null;
}
