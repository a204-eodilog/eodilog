import { describe, expect, it } from '@jest/globals';

import { digitsOnly, formatThousands, formatWon, parseAmount } from './format-number';

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
});

it('digitsOnly·formatWon', () => {
  expect(digitsOnly('21,000원')).toBe('21000');
  expect(formatWon(33000)).toBe('33,000원');
});
