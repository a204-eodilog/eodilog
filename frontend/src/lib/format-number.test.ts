import { describe, expect, it } from '@jest/globals';

import {
  AMOUNT_MAX,
  AMOUNT_MAX_LENGTH,
  digitsOnly,
  exceedsAmountMax,
  formatThousands,
  formatTotalShort,
  formatWon,
  parseAmount,
} from './format-number';

describe('formatThousands', () => {
  it('천 단위마다 쉼표를 넣는다', () => {
    expect(formatThousands('21000')).toBe('21,000');
    expect(formatThousands(1234567)).toBe('1,234,567');
    expect(formatThousands('999')).toBe('999');
  });

  it('이미 쉼표나 글자가 섞여 있어도 숫자만 남겨 다시 만든다', () => {
    expect(formatThousands('21,00')).toBe('2,100');
    expect(formatThousands('1a2b3')).toBe('123');
  });

  it('앞의 0은 지우고, 비어 있으면 빈 문자열', () => {
    expect(formatThousands('0012')).toBe('12');
    expect(formatThousands('0')).toBe('0');
    expect(formatThousands('')).toBe('');
  });
});

describe('parseAmount', () => {
  it('쉼표가 있어도 정수로 읽는다', () => {
    expect(parseAmount('180,000')).toBe(180000);
    expect(parseAmount('')).toBeNull();
  });

  it('상한(MAX_SAFE_INTEGER)까지만 받고 넘으면 null', () => {
    const max = formatThousands(AMOUNT_MAX);
    expect(max).toHaveLength(AMOUNT_MAX_LENGTH);
    expect(parseAmount(max)).toBe(AMOUNT_MAX);
    expect(exceedsAmountMax(max)).toBe(false);
    expect(parseAmount('9,007,199,254,740,992')).toBeNull();
    expect(exceedsAmountMax('9,007,199,254,740,992')).toBe(true);
    expect(parseAmount('9,999,999,999,999,999')).toBeNull();
    expect(exceedsAmountMax('0000180000')).toBe(false);
    expect(exceedsAmountMax('')).toBe(false);
  });
});

it('digitsOnly·formatWon', () => {
  expect(digitsOnly('21,000원')).toBe('21000');
  expect(formatWon(33000)).toBe('33,000원');
});

describe('formatTotalShort', () => {
  it('만 원이 넘으면 만 원 단위로 줄인다', () => {
    expect(formatTotalShort(234_000)).toBe('23.4만 원');
    expect(formatTotalShort(180_000)).toBe('18만 원');
    expect(formatTotalShort(12_345_000)).toBe('1,234.5만 원');
  });

  it('만 원보다 작으면 원 단위 그대로', () => {
    expect(formatTotalShort(9_000)).toBe('9,000원');
    expect(formatTotalShort(0)).toBe('0원');
  });
});
