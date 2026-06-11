import { describe, expect, it } from 'vitest';
import type { CashierShift, PaymentMethod, Transaction } from './db';
import {
  calculateShiftSummary,
  createShiftCode,
  findDuplicateActiveShifts,
  getCloseShiftTotals,
  selectLatestOpenShift,
  validateOpeningCash,
} from './shifts';

const baseTx = (overrides: Partial<Transaction>): Transaction => ({
  id: 1,
  subtotal: 0,
  discountType: null,
  discountValue: 0,
  discountAmount: 0,
  total: 0,
  paymentMethodId: 1,
  paymentAmount: 0,
  change: 0,
  profit: 0,
  date: new Date('2026-06-11T09:00:00'),
  receiptNumber: 'KG-001',
  status: 'completed',
  ...overrides,
});

const methods: PaymentMethod[] = [
  { id: 1, name: 'Tunai', category: 'tunai', isDefault: true, createdAt: new Date() },
  { id: 2, name: 'QRIS', category: 'qris', isDefault: false, createdAt: new Date() },
];

describe('shift helpers', () => {
  it('creates stable daily shift codes', () => {
    expect(createShiftCode(new Date('2026-06-11T07:30:00'), 3)).toBe('SHIFT-20260611-003');
  });

  it('validates opening cash as non-negative integer rupiah', () => {
    expect(validateOpeningCash(' 100000 ')).toEqual({ ok: true, value: 100000 });
    expect(validateOpeningCash('0')).toEqual({ ok: true, value: 0 });
    expect(validateOpeningCash('')).toEqual({ ok: false, error: 'Modal awal wajib diisi' });
    expect(validateOpeningCash('   ')).toEqual({ ok: false, error: 'Modal awal wajib diisi' });
    expect(validateOpeningCash('-1')).toEqual({ ok: false, error: 'Modal awal tidak boleh negatif' });
    expect(validateOpeningCash('1000.5')).toEqual({ ok: false, error: 'Modal awal harus berupa angka Rupiah utuh' });
  });

  it('summarizes completed shift transactions by payment category', () => {
    const summary = calculateShiftSummary(
      [
        baseTx({ id: 1, total: 50000, paymentMethodId: 1, status: 'completed' }),
        baseTx({ id: 2, total: 75000, paymentMethodId: 2, status: 'completed' }),
        baseTx({ id: 3, total: 999999, paymentMethodId: 1, status: 'open' }),
      ],
      methods,
    );

    expect(summary).toEqual({
      totalSales: 125000,
      totalTransactions: 2,
      cashSales: 50000,
      nonCashSales: 75000,
    });
  });

  it('treats unknown payment methods as non-cash for closing purposes', () => {
    const summary = calculateShiftSummary(
      [baseTx({ id: 4, total: 25000, paymentMethodId: 999, status: 'completed' })],
      methods,
    );

    expect(summary).toEqual({
      totalSales: 25000,
      totalTransactions: 1,
      cashSales: 0,
      nonCashSales: 25000,
    });
  });

  it('selects the latest open shift deterministically and surfaces duplicate active shifts', () => {
    const shifts: CashierShift[] = [
      {
        id: 1,
        code: 'SHIFT-20260611-001',
        status: 'open',
        openedAt: new Date('2026-06-11T08:00:00'),
        closedAt: null,
        openingCash: 100000,
        countedCash: null,
        expectedCash: null,
        cashDifference: null,
        totalSales: 0,
        totalTransactions: 0,
        cashSales: 0,
        nonCashSales: 0,
      },
      {
        id: 2,
        code: 'SHIFT-20260611-002',
        status: 'open',
        openedAt: new Date('2026-06-11T10:00:00'),
        closedAt: null,
        openingCash: 50000,
        countedCash: null,
        expectedCash: null,
        cashDifference: null,
        totalSales: 0,
        totalTransactions: 0,
        cashSales: 0,
        nonCashSales: 0,
      },
      {
        id: 3,
        code: 'SHIFT-20260610-001',
        status: 'closed',
        openedAt: new Date('2026-06-10T08:00:00'),
        closedAt: new Date('2026-06-10T17:00:00'),
        openingCash: 50000,
        countedCash: 50000,
        expectedCash: 50000,
        cashDifference: 0,
        totalSales: 0,
        totalTransactions: 0,
        cashSales: 0,
        nonCashSales: 0,
      },
    ];

    expect(selectLatestOpenShift(shifts)?.id).toBe(2);
    expect(findDuplicateActiveShifts(shifts).map((shift) => shift.id)).toEqual([1]);
  });

  it('calculates expected cash and cash difference on close', () => {
    const closeTotals = getCloseShiftTotals({
      openingCash: 100000,
      countedCash: 160000,
      cashSales: 50000,
    });

    expect(closeTotals).toEqual({
      expectedCash: 150000,
      cashDifference: 10000,
    });
  });
});
