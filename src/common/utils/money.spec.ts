import { isDuplicateKeyError, round2 } from './money.js';

describe('round2', () => {
  it('removes float drift', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });

  it('rounds to two decimals', () => {
    expect(round2(19.999)).toBe(20);
    expect(round2(10.555)).toBe(10.56);
  });
});

describe('isDuplicateKeyError', () => {
  it('detects Mongo duplicate key errors', () => {
    expect(isDuplicateKeyError({ code: 11000 })).toBe(true);
    expect(isDuplicateKeyError(new Error('x'))).toBe(false);
    expect(isDuplicateKeyError(null)).toBe(false);
  });
});
