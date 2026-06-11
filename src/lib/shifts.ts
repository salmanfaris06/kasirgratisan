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
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: 'Modal awal wajib diisi' };
  const value = Number(trimmed);
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

export function selectLatestOpenShift(shifts: CashierShift[]): CashierShift | undefined {
  return [...shifts]
    .filter((shift) => shift.status === 'open')
    .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())[0];
}

export function findDuplicateActiveShifts(shifts: CashierShift[]): CashierShift[] {
  const openShifts = shifts.filter((shift) => shift.status === 'open');
  const latest = selectLatestOpenShift(openShifts);
  return openShifts.filter((shift) => shift.id !== latest?.id);
}

export async function getActiveShift(): Promise<CashierShift | undefined> {
  const openShifts = await db.cashierShifts.where('status').equals('open').toArray();
  return selectLatestOpenShift(openShifts);
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
