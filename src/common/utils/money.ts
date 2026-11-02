/** Rounds to 2 decimal places (avoids 0.1 + 0.2 style float drift in totals). */
export const round2 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export function isDuplicateKeyError(err: unknown): boolean {
  return (err as { code?: number } | null)?.code === 11000;
}
