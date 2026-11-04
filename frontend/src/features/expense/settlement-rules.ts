import { formatWon } from '@/lib/format-number';

import { subjectParticle } from './expense-rules';
import type { Expense, Settlement } from './types';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n: number) => String(n).padStart(2, '0');

/** 계산 시각. 기기 시간대 기준 "11.16(월) 21:10 계산" */
export function formatCalculatedAt(iso: string): string {
  const d = new Date(iso);
  const date = `${pad(d.getMonth() + 1)}.${pad(d.getDate())}(${WEEKDAYS[d.getDay()]})`;
  return `${date} ${pad(d.getHours())}:${pad(d.getMinutes())} 계산`;
}

/**
 * 재계산 필요 안내 둘째 줄. 지난 계산과 지금 지출을 비교한다.
 * 한 건만 바뀌었으면 무엇이 어떻게 바뀌었는지("정산 뒤 택시 12,000원이 추가됐어요"), 여러 건이면 건수만.
 */
export function recalculationReason(settlement: Settlement, expenses: Expense[]): string {
  const before = new Map(settlement.includedExpenses.map((e) => [e.expenseId, e]));
  const now = new Map(expenses.map((e) => [e.id, e]));
  const added = expenses.filter((e) => !before.has(e.id));
  const removed = settlement.includedExpenses.filter((e) => !now.has(e.expenseId));
  const changed = expenses.filter((e) => {
    const old = before.get(e.id);
    return old !== undefined && old.expenseVersion !== e.version;
  });
  const count = added.length + removed.length + changed.length;

  if (count === 1 && added.length === 1) {
    const won = formatWon(added[0].amountMinor);
    return `정산 뒤 ${added[0].title} ${won}이 추가됐어요`;
  }
  if (count === 1 && removed.length === 1) {
    const { title } = removed[0];
    return `정산 뒤 ${title}${subjectParticle(title)} 지워졌어요`;
  }
  if (count === 1 && changed.length === 1) {
    const { title } = changed[0];
    return `정산 뒤 ${title}${subjectParticle(title)} 바뀌었어요`;
  }
  if (count > 1) return `정산 뒤 지출 ${count}건이 바뀌었어요`;
  return '정산 뒤 지출이 바뀌었어요';
}

/** 받을 돈(+)·보낼 돈(-). 0이면 주고받을 돈이 없다 */
export function balanceDirection(balance: number): 'receive' | 'send' | 'none' {
  if (balance > 0) return 'receive';
  if (balance < 0) return 'send';
  return 'none';
}
