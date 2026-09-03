export function toMinorUnits(amount: number): number {
  if (!Number.isFinite(amount)) throw new Error("Money amount must be finite");
  return Math.round((amount + Number.EPSILON) * 100);
}

export function fromMinorUnits(amount: number): number {
  return amount / 100;
}

export function sumMoney(amounts: Iterable<number>): number {
  let minorUnits = 0;
  for (const amount of amounts) minorUnits += toMinorUnits(amount);
  return fromMinorUnits(minorUnits);
}

export function addMoney(left: number, right: number): number {
  return fromMinorUnits(toMinorUnits(left) + toMinorUnits(right));
}
