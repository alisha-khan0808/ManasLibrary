import { describe, expect, it } from 'vitest';
import {
  addMoney,
  compareMoney,
  MoneyError,
  multiplyMoney,
  normalizeMoney,
  subtractMoney,
  sumMoney,
  toDecimalString,
  toMinor,
} from '../src/domain/money';

describe('money', () => {
  it('parses decimal strings into minor units', () => {
    expect(toMinor('0')).toBe(0);
    expect(toMinor('1')).toBe(100);
    expect(toMinor('1.5')).toBe(150);
    expect(toMinor('1234.56')).toBe(123_456);
    expect(toMinor('-10.25')).toBe(-1025);
  });

  it('formats minor units back to a canonical string', () => {
    expect(toDecimalString(0)).toBe('0.00');
    expect(toDecimalString(150)).toBe('1.50');
    expect(toDecimalString(-1025)).toBe('-10.25');
  });

  it('rejects values it cannot represent exactly', () => {
    expect(() => toMinor('12.345')).toThrow(MoneyError);
    expect(() => toMinor('abc')).toThrow(MoneyError);
    expect(() => toMinor('')).toThrow(MoneyError);
  });

  it('tolerates trailing zeros beyond two decimals', () => {
    expect(normalizeMoney('12.3400')).toBe('12.34');
  });

  it('adds without floating point drift', () => {
    // 0.1 + 0.2 !== 0.3 in IEEE 754; this is the reason money is integer-based.
    expect(addMoney('0.10', '0.20')).toBe('0.30');
    expect(sumMoney(['1500.00', '2500.50', '0.50'])).toBe('4001.00');
  });

  it('subtracts and multiplies', () => {
    expect(subtractMoney('1000.00', '250.75')).toBe('749.25');
    expect(multiplyMoney('1500.00', 3)).toBe('4500.00');
    expect(multiplyMoney('0.01', 100)).toBe('1.00');
  });

  it('compares amounts numerically, not lexically', () => {
    // A string comparison would call '9.00' greater than '10.00'.
    expect(compareMoney('9.00', '10.00')).toBe(-1);
    expect(compareMoney('10.00', '10.00')).toBe(0);
    expect(compareMoney('10.01', '10.00')).toBe(1);
  });

  it('sums an empty list to zero', () => {
    expect(sumMoney([])).toBe('0.00');
  });
});
