import { db, type CashierShift, type PaymentMethod, type Transaction } from './db';

export interface ShiftSummary {
  totalSales: number;
  totalTransactions: number;
  cashSales: number;
  nonCashSales: number;
}

export interface ValidationResult {
  ok: boolean;
  value?: number;
  error?: string;
}

export function createShiftCode(date = new Date(), sequence = 1): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `SHIFT-${yyyy}${mm}${dd}-${String(sequence).padStart(3, '0')}`;
}

export function validateOpeningCash(raw: string): ValidationResult {
  const value = Number(raw);
  if (!Number.isFinite(value)) return { ok: false, error: 'Modal awal harus berupa angka' };
  if (!Number.isInteger(value)) return { ok: false, error: 'Modal awal harus berupa angka Rupiah utuh' };
  if (value < 0) return { ok: false, error: 'Modal awal tidak boleh negatif' };
  return { ok: true, value };
}

export function calculateShiftSummary(
  transactions: Transaction[],
  paymentMethods: PaymentMethod[],
): ShiftSummary {
  const completed = transactions.filter((t) => t.status === 'completed');
  return completed.reduce<ShiftSummary>(
    (summary, tx) => {
      const method = paymentMethods.find((pm) => pm.id === tx.paymentMethodId);
      const isCash = method?.category === 'tunai';
      return {
        totalSales: summary.totalSales + tx.total,
        totalTransactions: summary.totalTransactions + 1,
        cashSales: summary.cashSales + (isCash ? tx.total : 0),
        nonCashSales: summary.nonCashSales + (isCash ? 0 : tx.total),
      };
    },
    { totalSales: 0, totalTransactions: 0, cashSales: 0, nonCashSales: 0 },
  );
}

export function getCloseShiftTotals({
  openingCash,
  countedCash,
  cashSales,
}: {
  openingCash: number;
  countedCash: number;
  cashSales: number;
}): Pick<CashierShift, 'expectedCash' | 'cashDifference'> {
  const expectedCash = openingCash + cashSales;
  return {
    expectedCash,
    cashDifference: countedCash - expectedCash,
  };
}

export async function getActiveShift(): Promise<CashierShift | undefined> {
  return db.cashierShifts.where('status').equals('open').first();
}

export async function getNextShiftCode(date = new Date()): Promise<string> {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  const countToday = await db.cashierShifts
    .where('openedAt')
    .between(start, end, true, true)
    .count();
  return createShiftCode(date, countToday + 1);
}
