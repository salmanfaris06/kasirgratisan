# Shift / Tutup Kasir Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add offline-first cashier shift management so owners can open shifts, track sales per shift, count cash, record cash differences, and close shifts safely.

**Architecture:** Add a `cashierShifts` Dexie table and link completed transactions to the active shift via `shiftId`. Keep the feature local/offline and permission-gated: a new page handles opening/closing and shift history, while cashier checkout is blocked until a shift is open.

**Tech Stack:** React 18, TypeScript, Vite, Dexie IndexedDB, dexie-react-hooks, shadcn/ui, Tailwind CSS, Vitest.

---

## Existing System Context

The app currently has:

- Local IndexedDB in `src/lib/db.ts` with transaction, user, payment method, product, stock, expense, and settings tables.
- `Transaction.createdBy` for cashier attribution and `Transaction.status` for `open` vs `completed`.
- Multi-user permissions in `PermissionKey`, `ALL_PERMISSIONS`, and `src/lib/auth.ts` labels.
- POS checkout in `src/pages/Cashier.tsx`.
- Transaction history in `src/pages/TransactionHistory.tsx`.
- Reports in `src/pages/Reports.tsx` and Excel export in `src/lib/export-report.ts`.
- Bottom navigation in `src/components/layout/BottomNav.tsx`.

This plan keeps the first shift release focused: one active shift per device/store, no drawer cash in/out movements yet, no per-terminal sync, and no backend.

---

## File Structure

### Create

- `src/lib/shifts.ts`
  - Shift business logic: active shift lookup, open validation, summary calculation, close calculation, format helpers.
- `src/pages/Shifts.tsx`
  - UI for active shift, open shift form, close shift form, recent shift history, and print action for closed shift reports.
- `src/components/ShiftReportReceipt.tsx`
  - Printable/downloadable/shareable shift closing report using the existing receipt/export pattern, including thermal Bluetooth print support.
- `src/lib/printer.ts`
  - Add ESC/POS formatter and native Bluetooth printer helper for shift closing reports.
- `src/lib/shifts.test.ts`
  - Unit tests for calculation and validation helpers.

### Modify

- `src/lib/db.ts`
  - Add `manage_shifts` permission.
  - Add `CashierShift` interface.
  - Add `shiftId?: number` to `Transaction`.
  - Add `cashierShifts` table.
  - Add Dexie version 11 migration.
- `src/lib/auth.ts`
  - Add permission label for `manage_shifts`.
- `src/App.tsx`
  - Lazy-load and route `/shifts`.
- `src/pages/Cashier.tsx`
  - Require an active shift before checkout.
  - Assign completed transactions to the active shift.
  - Show a clear blocked-state CTA to open shift if there is no active shift.
- `src/pages/TransactionHistory.tsx`
  - Display shift code/label in transaction detail if available.
- `src/pages/Reports.tsx`
  - Optionally show compact active/last shift card only if permission allows; keep full reports unchanged.
- `src/pages/Settings.tsx`
  - Add shortcut card/link to shift management and include permission in user access UI automatically through `ALL_PERMISSIONS`.
- `src/components/BackupReminder.tsx`
  - Include `cashierShifts` in backup export.
- `src/pages/Settings.tsx`
  - Include `cashierShifts` in restore/import type and import flow.
- `src/components/Onboarding.tsx`
  - Include `cashierShifts` in onboarding restore flow.

---

## Data Model

Add this interface to `src/lib/db.ts`:

```ts
export interface CashierShift {
  id?: number;
  code: string; // e.g. SHIFT-20260611-001
  status: 'open' | 'closed';
  openedAt: Date;
  closedAt: Date | null;
  openedBy?: number;
  closedBy?: number;
  openingCash: number;
  countedCash: number | null;
  expectedCash: number | null;
  cashDifference: number | null;
  totalSales: number;
  totalTransactions: number;
  cashSales: number;
  nonCashSales: number;
  notes?: string;
  closingNotes?: string;
}
```

Add this to `Transaction`:

```ts
shiftId?: number;
```

Add this permission:

```ts
| 'manage_shifts'
```

Add it to `ALL_PERMISSIONS` after `create_transaction`:

```ts
'manage_shifts',
```

Dexie version 11 stores should add `shiftId` index on `transactions` and a new shift table:

```ts
transactions: '++id, date, &receiptNumber, paymentMethodId, status, orderNumber, createdBy, shiftId',
cashierShifts: '++id, code, status, openedAt, closedAt, openedBy, closedBy',
```

---

## Shift Rules

- Only users with `manage_shifts` can open/close shifts.
- In legacy single-user mode, `can('manage_shifts')` should return true because `useAuth().can()` already returns true in legacy mode.
- Only one shift can be open at a time.
- A completed transaction should be assigned to the current open shift at checkout.
- Open bills are not counted until they are completed.
- If no shift is open, checkout is blocked. The cashier page must show a clear message and CTA to open a shift first.
- Expected cash = `openingCash + cashSales`.
- Cash sales are transactions in the shift whose payment method category is `tunai`.
- Non-cash sales are all other completed transactions in the shift.
- Cash difference = `countedCash - expectedCash`.
- `shiftId` is required for every new completed transaction after this feature ships. Legacy transactions may still have `shiftId` undefined.

---

## Task 1: Add Shift Schema, Permission, and Tests

**Files:**
- Modify: `src/lib/db.ts`
- Modify: `src/lib/auth.ts`
- Create: `src/lib/shifts.ts`
- Create: `src/lib/shifts.test.ts`

- [ ] **Step 1: Write failing unit tests for shift calculations**

Create `src/lib/shifts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { PaymentMethod, Transaction } from './db';
import {
  calculateShiftSummary,
  createShiftCode,
  getCloseShiftTotals,
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
    expect(validateOpeningCash('100000')).toEqual({ ok: true, value: 100000 });
    expect(validateOpeningCash('0')).toEqual({ ok: true, value: 0 });
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test -- src/lib/shifts.test.ts
```

Expected: FAIL because `src/lib/shifts.ts` does not exist yet.

- [ ] **Step 3: Add schema and permission types**

Modify `src/lib/db.ts`:

1. Add permission key:

```ts
export type PermissionKey =
  | 'create_transaction'
  | 'manage_shifts'
  | 'delete_transaction'
```

2. Add to `ALL_PERMISSIONS`:

```ts
export const ALL_PERMISSIONS: PermissionKey[] = [
  'create_transaction',
  'manage_shifts',
  'delete_transaction',
```

3. Add `shiftId?: number;` to `Transaction` after `createdBy?: number;`:

```ts
createdBy?: number; // userId — kasir pembuat transaksi
shiftId?: number; // cashier shift id, undefined for legacy/no active shift
```

4. Add `CashierShift` interface after `TransactionItemRecord`:

```ts
export interface CashierShift {
  id?: number;
  code: string;
  status: 'open' | 'closed';
  openedAt: Date;
  closedAt: Date | null;
  openedBy?: number;
  closedBy?: number;
  openingCash: number;
  countedCash: number | null;
  expectedCash: number | null;
  cashDifference: number | null;
  totalSales: number;
  totalTransactions: number;
  cashSales: number;
  nonCashSales: number;
  notes?: string;
  closingNotes?: string;
}
```

5. Add table property in `PosDatabase`:

```ts
cashierShifts!: Table<CashierShift>;
```

6. Add version 11 after version 10:

```ts
    // Version 11 — Cashier shifts / tutup kasir harian
    // Notes:
    //   * New cashierShifts table stores open/closed shift snapshots.
    //   * transactions.shiftId links completed sales to the active shift.
    //   * Existing transactions keep shiftId undefined and remain visible in reports.
    this.version(11).stores({
      categories:        '++id, name, isDeleted',
      products:          '++id, name, &sku, categoryId, barcode, isDeleted, createdBy, updatedBy',
      suppliers:         '++id, name, isDeleted',
      customers:         '++id, name, isDeleted',
      stockIns:          '++id, productId, supplierId, date, createdBy',
      stockOuts:         '++id, productId, date, createdBy',
      hppHistory:        '++id, productId, date',
      paymentMethods:    '++id, name, category',
      transactions:      '++id, date, &receiptNumber, paymentMethodId, status, orderNumber, createdBy, shiftId',
      transactionItems:  '++id, transactionId, productId',
      storeSettings:     '++id',
      units:             '++id, &name, isDeleted',
      users:             '++id, &username, role, isActive',
      expenseCategories: '++id, name, isDeleted',
      expenses:          '++id, date, categoryId, paymentMethodId, createdBy, isDeleted',
      cashierShifts:     '++id, code, status, openedAt, closedAt, openedBy, closedBy',
    });
```

Modify `src/lib/auth.ts`, add permission label after `create_transaction`:

```ts
  manage_shifts: {
    title: 'Shift & Tutup Kasir',
    desc: 'Buka shift, tutup kasir, dan lihat ringkasan kas harian',
  },
```

- [ ] **Step 4: Implement shift helper module**

Create `src/lib/shifts.ts`:

```ts
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
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm run test -- src/lib/shifts.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db.ts src/lib/auth.ts src/lib/shifts.ts src/lib/shifts.test.ts
git commit -m "feat: add cashier shift data model"
```

---

## Task 2: Add Shift Management Page and Route

**Files:**
- Create: `src/pages/Shifts.tsx`
- Modify: `src/App.tsx`
- Modify: `src/pages/Settings.tsx`

- [ ] **Step 1: Create shift page**

Create `src/pages/Shifts.tsx`:

```tsx
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { ArrowLeft, Banknote, CalendarClock, CheckCircle2, Clock, Coins, MinusCircle, PlusCircle, ReceiptText, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { db, type CashierShift, type Transaction } from '@/lib/db';
import { calculateShiftSummary, getCloseShiftTotals, getNextShiftCode, validateOpeningCash } from '@/lib/shifts';
import { useAuth } from '@/hooks/use-auth';
import LockedPage from '@/components/LockedPage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';

const rp = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

export default function ShiftsPage() {
  const { currentUser, can } = useAuth();
  const [openingCash, setOpeningCash] = useState('0');
  const [openNotes, setOpenNotes] = useState('');
  const [countedCash, setCountedCash] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const allowed = can('manage_shifts');
  const shifts = useLiveQuery(() => db.cashierShifts.orderBy('openedAt').reverse().toArray());
  const activeShift = shifts?.find((s) => s.status === 'open');
  const paymentMethods = useLiveQuery(() => db.paymentMethods.toArray());
  const users = useLiveQuery(() => db.users.toArray());

  const activeTransactions = useLiveQuery(async () => {
    if (!activeShift?.id) return [] as Transaction[];
    return db.transactions.where('shiftId').equals(activeShift.id).toArray();
  }, [activeShift?.id]);

  const summary = useMemo(
    () => calculateShiftSummary(activeTransactions ?? [], paymentMethods ?? []),
    [activeTransactions, paymentMethods],
  );

  const countedValidation = countedCash.trim() ? validateOpeningCash(countedCash) : { ok: false };
  const countedValue = countedValidation.ok ? countedValidation.value ?? 0 : 0;
  const previewClose = activeShift
    ? getCloseShiftTotals({ openingCash: activeShift.openingCash, countedCash: countedValue, cashSales: summary.cashSales })
    : null;

  if (!allowed) {
    return <LockedPage title="Shift Kasir" permissionLabel="Shift & Tutup Kasir" />;
  }

  const userName = (id?: number) => users?.find((u) => u.id === id)?.name ?? '—';

  const openShift = async () => {
    const validation = validateOpeningCash(openingCash);
    if (!validation.ok) {
      toast.error(validation.error);
      return;
    }
    setSaving(true);
    try {
      const existing = await db.cashierShifts.where('status').equals('open').first();
      if (existing) {
        toast.error('Masih ada shift yang sedang berjalan');
        return;
      }
      const now = new Date();
      await db.cashierShifts.add({
        code: await getNextShiftCode(now),
        status: 'open',
        openedAt: now,
        closedAt: null,
        openedBy: currentUser?.id,
        closedBy: undefined,
        openingCash: validation.value ?? 0,
        countedCash: null,
        expectedCash: null,
        cashDifference: null,
        totalSales: 0,
        totalTransactions: 0,
        cashSales: 0,
        nonCashSales: 0,
        notes: openNotes.trim() || undefined,
        closingNotes: undefined,
      });
      setOpeningCash('0');
      setOpenNotes('');
      toast.success('Shift berhasil dibuka');
    } catch {
      toast.error('Gagal membuka shift');
    } finally {
      setSaving(false);
    }
  };

  const closeShift = async () => {
    if (!activeShift?.id) return;
    const validation = validateOpeningCash(countedCash);
    if (!validation.ok) {
      toast.error(validation.error?.replace('Modal awal', 'Uang aktual'));
      return;
    }
    setSaving(true);
    try {
      const totals = getCloseShiftTotals({
        openingCash: activeShift.openingCash,
        countedCash: validation.value ?? 0,
        cashSales: summary.cashSales,
      });
      await db.cashierShifts.update(activeShift.id, {
        status: 'closed',
        closedAt: new Date(),
        closedBy: currentUser?.id,
        countedCash: validation.value ?? 0,
        expectedCash: totals.expectedCash,
        cashDifference: totals.cashDifference,
        totalSales: summary.totalSales,
        totalTransactions: summary.totalTransactions,
        cashSales: summary.cashSales,
        nonCashSales: summary.nonCashSales,
        closingNotes: closingNotes.trim() || undefined,
      });
      setCountedCash('');
      setClosingNotes('');
      toast.success('Shift berhasil ditutup');
    } catch {
      toast.error('Gagal menutup shift');
    } finally {
      setSaving(false);
    }
  };

  const recentClosed = (shifts ?? []).filter((s) => s.status === 'closed').slice(0, 10);

  return (
    <div className="space-y-5 px-4 pb-24 pt-6">
      <div className="flex items-start gap-3">
        <Link to="/settings" className="mt-1 shrink-0">
          <Button variant="ghost" size="icon" aria-label="Kembali ke pengaturan" className="h-8 w-8 rounded-full">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
            <CalendarClock className="h-5 w-5 text-primary" />
            Shift Kasir
          </h1>
        </div>
      </div>

      {activeShift ? (
        <Card className="border-primary/30 bg-primary/5 shadow-soft">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2"><Clock className="h-4 w-4" /> Shift Berjalan</span>
              <Badge>{activeShift.code}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-card/80 p-3">
                <p className="text-xs text-muted-foreground">Dibuka</p>
                <p className="font-semibold">{format(new Date(activeShift.openedAt), 'dd MMM HH:mm', { locale: localeId })}</p>
              </div>
              <div className="rounded-xl bg-card/80 p-3">
                <p className="text-xs text-muted-foreground">Oleh</p>
                <p className="font-semibold">{userName(activeShift.openedBy)}</p>
              </div>
              <div className="rounded-xl bg-card/80 p-3">
                <p className="text-xs text-muted-foreground">Modal Awal</p>
                <p className="font-semibold">{rp(activeShift.openingCash)}</p>
              </div>
              <div className="rounded-xl bg-card/80 p-3">
                <p className="text-xs text-muted-foreground">Transaksi</p>
                <p className="font-semibold">{summary.totalTransactions}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 text-sm">
              <div className="flex items-center justify-between rounded-xl border border-border/70 bg-card/80 p-3">
                <span>Penjualan Tunai</span>
                <span className="font-bold">{rp(summary.cashSales)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/70 bg-card/80 p-3">
                <span>Non Tunai</span>
                <span className="font-bold">{rp(summary.nonCashSales)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/10 p-3">
                <span>Total Penjualan</span>
                <span className="font-extrabold">{rp(summary.totalSales)}</span>
              </div>
            </div>

            <div className="space-y-2 border-t border-border/70 pt-4">
              <Label htmlFor="counted-cash">Uang tunai aktual di laci</Label>
              <Input
                id="counted-cash"
                inputMode="numeric"
                value={countedCash}
                onChange={(e) => setCountedCash(e.target.value)}
                placeholder="Contoh: 250000"
                className="h-11"
              />
              {previewClose && countedCash.trim() && (
                <div className="rounded-xl bg-muted/60 p-3 text-sm">
                  <div className="flex justify-between"><span>Seharusnya</span><strong>{rp(previewClose.expectedCash ?? 0)}</strong></div>
                  <div className="flex justify-between"><span>Selisih</span><strong>{rp(previewClose.cashDifference ?? 0)}</strong></div>
                </div>
              )}
              <Textarea value={closingNotes} onChange={(e) => setClosingNotes(e.target.value)} placeholder="Catatan penutupan shift" rows={2} />
              <Button className="h-12 w-full font-semibold" onClick={closeShift} disabled={saving || !countedCash.trim()}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Tutup Shift
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/70 shadow-soft">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm"><PlusCircle className="h-4 w-4" /> Buka Shift Baru</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="opening-cash">Modal awal laci kas</Label>
              <Input id="opening-cash" inputMode="numeric" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} className="h-11" />
            </div>
            <Textarea value={openNotes} onChange={(e) => setOpenNotes(e.target.value)} placeholder="Catatan pembukaan shift" rows={2} />
            <Button className="h-12 w-full font-semibold" onClick={openShift} disabled={saving}>
              <Coins className="mr-2 h-4 w-4" /> Buka Shift
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-bold"><ReceiptText className="h-4 w-4 text-primary" /> Riwayat Shift Terakhir</h2>
        {recentClosed.length === 0 ? (
          <Card className="border-dashed"><CardContent className="p-6 text-center text-sm text-muted-foreground">Belum ada shift yang ditutup.</CardContent></Card>
        ) : recentClosed.map((shift: CashierShift) => (
          <Card key={shift.id} className="border-border/70 shadow-soft">
            <CardContent className="space-y-2 p-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-bold">{shift.code}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(shift.openedAt), 'dd MMM yyyy HH:mm', { locale: localeId })}</p>
                </div>
                <Badge variant="outline">Selesai</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-muted/50 p-2"><Banknote className="mb-1 h-3.5 w-3.5" /> Tunai<br /><strong>{rp(shift.cashSales)}</strong></div>
                <div className="rounded-lg bg-muted/50 p-2"><ReceiptText className="mb-1 h-3.5 w-3.5" /> Total<br /><strong>{rp(shift.totalSales)}</strong></div>
                <div className="rounded-lg bg-muted/50 p-2"><PlusCircle className="mb-1 h-3.5 w-3.5" /> Seharusnya<br /><strong>{rp(shift.expectedCash ?? 0)}</strong></div>
                <div className="rounded-lg bg-muted/50 p-2"><MinusCircle className="mb-1 h-3.5 w-3.5" /> Selisih<br /><strong>{rp(shift.cashDifference ?? 0)}</strong></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!activeShift && (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="flex gap-3 p-4 text-xs text-muted-foreground">
            <ShieldAlert className="h-4 w-4 shrink-0 text-warning" />
            <p>Transaksi tetap bisa dilakukan tanpa shift, tetapi tidak akan masuk laporan tutup kasir.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add route**

Modify `src/App.tsx`:

Add lazy import:

```ts
const ShiftsPage = lazy(() => import("./pages/Shifts"));
```

Add route inside `<Route element={<AppLayout />}>`:

```tsx
<Route path="/shifts" element={<LazyRoute><ShiftsPage /></LazyRoute>} />
```

- [ ] **Step 3: Add Settings shortcut**

In `src/pages/Settings.tsx`, add `CalendarClock` to lucide imports:

```ts
import { ..., CalendarClock } from 'lucide-react';
```

In the settings page card grid near stock/customer shortcuts, add this link guarded by `can('manage_shifts')`:

```tsx
{can('manage_shifts') && (
  <Link to="/shifts">
    <Card className="border-border/70 shadow-soft transition active:scale-[0.99]">
      <CardContent className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2 text-primary">
            <CalendarClock className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">Shift & Tutup Kasir</p>
            <p className="text-xs text-muted-foreground">Buka shift, hitung kas, dan tutup harian</p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </CardContent>
    </Card>
  </Link>
)}
```

If there is no clear shortcut grid, place it above the `Backup & Restore` card.

- [ ] **Step 4: Run verification**

```bash
npm run lint
npm run test -- src/lib/shifts.test.ts
npm run build
```

Expected: lint has no errors, shift test passes, build passes.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Shifts.tsx src/App.tsx src/pages/Settings.tsx version.json
git commit -m "feat: add shift management page"
```

---

## Task 3: Require Active Shift for Checkout and Link Transactions

**Files:**
- Modify: `src/pages/Cashier.tsx`

- [ ] **Step 1: Add active shift query and blocked-state UI**

In `src/pages/Cashier.tsx`, add import:

```ts
import { getActiveShift } from '@/lib/shifts';
```

Add live query near existing `openBills` query:

```ts
const activeShift = useLiveQuery(() => getActiveShift());
```

Render this blocked-state card near the top of the cashier page, after header/search area but before product list:

```tsx
{!activeShift && (
  <div className="rounded-2xl border border-warning/30 bg-warning/5 p-4 text-sm">
    <p className="font-semibold text-foreground">Shift belum dibuka</p>
    <p className="mt-1 text-xs text-muted-foreground">
      Buka shift terlebih dahulu sebelum melakukan transaksi. Ini memastikan uang tunai dan laporan tutup kasir tercatat rapi.
    </p>
    {can('manage_shifts') && (
      <Link to="/shifts" className="mt-3 inline-flex">
        <Button size="sm" className="h-9 rounded-full">Buka Shift</Button>
      </Link>
    )}
  </div>
)}
```

Add `Link` import if it is not already present:

```ts
import { Link } from 'react-router-dom';
```

- [ ] **Step 2: Block checkout when no active shift exists and assign `shiftId`**

At the start of `handleCheckout`, after existing cart/payment validation and before any database writes, add:

```ts
if (!activeShift?.id) {
  toast.error('Buka shift terlebih dahulu sebelum transaksi');
  setCheckoutOpen(false);
  return;
}
```

Find the object passed to `db.transactions.add` for completed transactions. Add required `shiftId`:

```ts
shiftId: activeShift.id,
```

The completed transaction data should include these relevant fields:

```ts
status: 'completed',
createdBy: currentUser?.id,
shiftId: activeShift.id,
closedAt: new Date(),
```

If checkout updates an existing open bill, add `shiftId: activeShift.id` to the `db.transactions.update` call when status becomes `completed`.

Disable the pay/checkout entry points when no shift is active. Use the existing `disabled` props and add `!activeShift`:

```tsx
disabled={cart.length === 0 || !activeShift}
```

For the final confirmation button in the payment dialog, add `!activeShift` too:

```tsx
disabled={!activeShift || !paymentMethodId || paidAmount < total}
```

- [ ] **Step 3: Run verification**

```bash
npm run lint
npm run test -- src/lib/shifts.test.ts
npm run build
```

Expected: lint has no errors, test passes, build passes.

- [ ] **Step 4: Manual smoke test**

Run:

```bash
npm run dev
```

Manual steps:

1. Open `/settings`.
2. Open Shift & Tutup Kasir.
3. Open shift with modal awal `100000`.
4. Go to Kasir.
5. Make one tunai transaction.
6. Return to Shift page.
7. Confirm transaction count increments and cash sales equals transaction total.
8. Close the active shift.
9. Return to Kasir and confirm checkout/payment is blocked until a new shift is opened.
8. Close shift with counted cash = opening cash + cash sales.
9. Confirm difference is `Rp 0`.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Cashier.tsx version.json
git commit -m "feat: require active shift for checkout"
```

---

## Task 4: Show Shift Context in History, Reports, and Printable Closing Receipt

**Files:**
- Modify: `src/pages/TransactionHistory.tsx`
- Modify: `src/pages/Reports.tsx`
- Create: `src/components/ShiftReportReceipt.tsx`
- Modify: `src/pages/Shifts.tsx`
- Modify: `src/lib/printer.ts`

- [ ] **Step 1: Show shift in transaction detail**

In `src/pages/TransactionHistory.tsx`, add query:

```ts
const shifts = useLiveQuery(() => db.cashierShifts.toArray());
const shiftById = (id?: number) => (id ? shifts?.find((s) => s.id === id) : undefined);
```

In transaction detail sheet/card, near receipt number/payment/cashier info, render:

```tsx
{selectedTx?.shiftId && (
  <div className="flex justify-between text-sm">
    <span className="text-muted-foreground">Shift</span>
    <span className="font-medium">{shiftById(selectedTx.shiftId)?.code ?? `#${selectedTx.shiftId}`}</span>
  </div>
)}
```

- [ ] **Step 2: Add shift summary card to reports**

In `src/pages/Reports.tsx`, add query:

```ts
const shifts = useLiveQuery(() => db.cashierShifts.orderBy('openedAt').reverse().limit(5).toArray());
```

Add a compact card after the main metric cards:

```tsx
{can('manage_shifts') && shifts && shifts.length > 0 && (
  <Card className="border-border/70 shadow-soft">
    <CardHeader className="border-b border-border/70 bg-muted/20 pb-3">
      <CardTitle className="text-sm">Shift Terakhir</CardTitle>
    </CardHeader>
    <CardContent className="space-y-2 p-3">
      {shifts.map((shift) => (
        <div key={shift.id} className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2 text-sm">
          <div>
            <p className="font-semibold">{shift.code}</p>
            <p className="text-xs text-muted-foreground">{shift.status === 'open' ? 'Berjalan' : 'Selesai'}</p>
          </div>
          <div className="text-right">
            <p className="font-bold">Rp {shift.totalSales.toLocaleString('id-ID')}</p>
            <p className="text-xs text-muted-foreground">Selisih Rp {(shift.cashDifference ?? 0).toLocaleString('id-ID')}</p>
          </div>
        </div>
      ))}
    </CardContent>
  </Card>
)}
```

- [ ] **Step 3: Add thermal Bluetooth shift report printer helpers**

Modify `src/lib/printer.ts`.

Add imports/types at the top:

```ts
import type { CashierShift, Transaction, StoreSettings, TransactionItemRecord } from './db';
```

Replace the current `type` import if needed so `CashierShift` is included.

Add this interface near `PrintData`:

```ts
interface ShiftReportPrintData {
  shift: CashierShift;
  storeSettings: StoreSettings | undefined;
  openedByName?: string;
  closedByName?: string;
}
```

Add this ESC/POS formatter below `getESCPOSData`:

```ts
export const getShiftReportESCPOSData = ({
  shift,
  storeSettings,
  openedByName,
  closedByName,
}: ShiftReportPrintData): string => {
  const lines: string[] = [];
  const rp = (n: number | null | undefined) => `Rp ${(n ?? 0).toLocaleString('id-ID')}`;
  const diff = shift.cashDifference ?? 0;

  lines.push('\x1B\x61\x01');
  lines.push(`${storeSettings?.storeName || 'Toko'}\n`);
  if (storeSettings?.address) lines.push(`${storeSettings.address}\n`);
  if (storeSettings?.phone) lines.push(`${storeSettings.phone}\n`);
  lines.push('--------------------------------\n');
  lines.push('LAPORAN TUTUP KASIR\n');
  lines.push(`${shift.code}\n`);
  lines.push('--------------------------------\n');

  lines.push('\x1B\x61\x00');
  lines.push(`Dibuka : ${format(new Date(shift.openedAt), 'dd/MM/yyyy HH:mm')}\n`);
  if (shift.closedAt) lines.push(`Ditutup: ${format(new Date(shift.closedAt), 'dd/MM/yyyy HH:mm')}\n`);
  lines.push(`Oleh   : ${openedByName ?? '-'}\n`);
  lines.push(`Penutup: ${closedByName ?? '-'}\n`);
  lines.push('--------------------------------\n');
  lines.push(`Transaksi       : ${shift.totalTransactions}\n`);
  lines.push(`Penjualan Tunai : ${rp(shift.cashSales)}\n`);
  lines.push(`Non Tunai       : ${rp(shift.nonCashSales)}\n`);
  lines.push(`TOTAL PENJUALAN : ${rp(shift.totalSales)}\n`);
  lines.push('--------------------------------\n');
  lines.push(`Uang Awal Laci  : ${rp(shift.openingCash)}\n`);
  lines.push(`Tunai Harusnya  : ${rp(shift.expectedCash)}\n`);
  lines.push(`Tunai Aktual    : ${rp(shift.countedCash)}\n`);
  lines.push(`SELISIH         : ${diff > 0 ? '+' : ''}${rp(diff)}\n`);
  if (shift.notes || shift.closingNotes) {
    lines.push('--------------------------------\n');
    if (shift.notes) lines.push(`Catatan buka : ${shift.notes}\n`);
    if (shift.closingNotes) lines.push(`Catatan tutup: ${shift.closingNotes}\n`);
  }
  lines.push('--------------------------------\n');
  lines.push('\x1B\x61\x01');
  lines.push(`Dicetak ${format(new Date(), 'dd/MM/yyyy HH:mm')}\n\n\n`);

  return lines.join('');
};
```

Add native Bluetooth helper after `printNativeBluetooth`:

```ts
export const printNativeShiftReportBluetooth = async (
  printData: ShiftReportPrintData,
  toast: { info: (m: string) => void; success: (m: string) => void; error: (m: string) => void },
): Promise<boolean> => {
  if (!window.bluetoothSerial) {
    toast.error('Plugin Bluetooth tidak tersedia.');
    return false;
  }

  const defaultPrinter = getDefaultBluetoothPrinter();
  if (!defaultPrinter) {
    toast.error('Printer default belum dipilih. Silakan atur printer di menu Pengaturan terlebih dahulu.');
    return false;
  }

  return new Promise((resolve) => {
    window.bluetoothSerial?.isEnabled(
      () => {
        toast.info('Mencari printer Bluetooth berpasangan...');
        window.bluetoothSerial?.list(
          (devices) => {
            const printer = devices.find((d) => d.address === defaultPrinter.address);
            if (!printer) {
              toast.error(`Printer "${defaultPrinter.name}" tidak terdeteksi. Pastikan printer menyala dan terhubung.`);
              resolve(false);
              return;
            }

            toast.info(`Menghubungkan ke ${printer.name}...`);
            window.bluetoothSerial?.connect(
              printer.address,
              () => {
                toast.info('Mencetak laporan shift...');
                const data = new TextEncoder().encode(getShiftReportESCPOSData(printData));
                window.bluetoothSerial?.write(
                  data,
                  () => {
                    toast.success('Laporan shift berhasil dicetak!');
                    window.bluetoothSerial?.disconnect(() => {}, () => {});
                    resolve(true);
                  },
                  (err) => {
                    toast.error(`Gagal mencetak: ${err}`);
                    window.bluetoothSerial?.disconnect(() => {}, () => {});
                    resolve(false);
                  },
                );
              },
              (err) => {
                toast.error(`Koneksi gagal: ${err}`);
                resolve(false);
              },
            );
          },
          (err) => {
            toast.error(`Gagal mendapatkan daftar printer: ${err}`);
            resolve(false);
          },
        );
      },
      () => {
        toast.error('Bluetooth tidak aktif. Silakan aktifkan Bluetooth.');
        resolve(false);
      },
    );
  });
};
```

Add Web Bluetooth helper for compatible browsers:

```ts
export const printWebBluetoothShiftReport = async (
  printData: ShiftReportPrintData,
  toast: { info: (m: string) => void; success: (m: string) => void; error: (m: string) => void },
): Promise<boolean> => {
  if (!('bluetooth' in navigator)) {
    toast.error('Bluetooth tidak tersedia di browser ini.');
    return false;
  }

  try {
    toast.info('Mencari printer Bluetooth...');
    // @ts-expect-error Web Bluetooth API is not fully typed in TypeScript
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
      optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb'],
    });
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
    const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');
    const data = new TextEncoder().encode(getShiftReportESCPOSData(printData));

    for (let i = 0; i < data.length; i += 100) {
      await characteristic.writeValue(data.slice(i, i + 100));
    }

    toast.success('Laporan shift berhasil dicetak!');
    await server.disconnect();
    return true;
  } catch (err: unknown) {
    if (err instanceof Error && err.name !== 'NotFoundError') {
      toast.error('Gagal mencetak laporan shift. Pastikan printer Bluetooth menyala.');
    }
    return false;
  }
};
```

- [ ] **Step 4: Create printable shift closing receipt**

Create `src/components/ShiftReportReceipt.tsx`:

```tsx
import { useRef, useState } from 'react';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import html2canvas from 'html2canvas';
import { Download, Printer, Share2, X } from 'lucide-react';
import type { CashierShift, StoreSettings, User } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { isNativePlatform, printNativeShiftReportBluetooth, printWebBluetoothShiftReport } from '@/lib/printer';

interface ShiftReportReceiptProps {
  open: boolean;
  onClose: () => void;
  shift: CashierShift;
  storeSettings: StoreSettings | undefined;
  openedBy?: User;
  closedBy?: User;
}

const rp = (n: number | null | undefined) => `Rp ${(n ?? 0).toLocaleString('id-ID')}`;

export default function ShiftReportReceipt({
  open,
  onClose,
  shift,
  storeSettings,
  openedBy,
  closedBy,
}: ShiftReportReceiptProps) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [generating, setGenerating] = useState(false);

  const captureReceipt = async (): Promise<HTMLCanvasElement | null> => {
    if (!receiptRef.current) return null;
    setGenerating(true);
    try {
      return await html2canvas(receiptRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
      });
    } catch {
      toast.error('Gagal membuat gambar laporan shift');
      return null;
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async () => {
    const canvas = await captureReceipt();
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `laporan-shift-${shift.code}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast.success('Laporan shift berhasil diunduh');
  };

  const handleShare = async () => {
    const canvas = await captureReceipt();
    if (!canvas) return;
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) return;
      if (navigator.share) {
        const file = new File([blob], `laporan-shift-${shift.code}.png`, { type: 'image/png' });
        await navigator.share({
          title: `Laporan Shift ${shift.code}`,
          text: `Laporan tutup kasir ${storeSettings?.storeName || 'Toko'}`,
          files: [file],
        });
      } else {
        await handleDownload();
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        toast.error('Gagal membagikan laporan shift');
      }
    }
  };

  const handlePrint = async () => {
    const printData = { shift, storeSettings, openedByName: openedBy?.name, closedByName: closedBy?.name };

    if (isNativePlatform()) {
      await printNativeShiftReportBluetooth(printData, toast);
      return;
    }

    if ('bluetooth' in navigator) {
      await printWebBluetoothShiftReport(printData, toast);
      return;
    }

    window.print();
  };

  const diff = shift.cashDifference ?? 0;

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-[95vw] overflow-y-auto rounded-xl p-4">
        <DialogHeader>
          <DialogTitle className="text-center">Laporan Tutup Kasir</DialogTitle>
        </DialogHeader>

        <div ref={receiptRef} className="mx-auto rounded-lg bg-white p-4 text-black" style={{ width: '280px', fontFamily: 'monospace', fontSize: '12px' }}>
          <div className="mb-2 text-center">
            {storeSettings?.logo && <img src={storeSettings.logo} alt="Logo" className="mx-auto mb-1 h-14 w-14 object-contain" />}
            <p className="text-sm font-bold">{storeSettings?.storeName || 'Toko'}</p>
            {storeSettings?.address && <p className="text-[10px]">{storeSettings.address}</p>}
            {storeSettings?.phone && <p className="text-[10px]">{storeSettings.phone}</p>}
          </div>

          <div className="my-2 border-t border-dashed border-gray-400" />
          <p className="text-center font-bold">LAPORAN TUTUP KASIR</p>
          <p className="text-center text-[10px]">{shift.code}</p>
          <div className="my-2 border-t border-dashed border-gray-400" />

          <div className="space-y-0.5 text-[10px]">
            <div className="flex justify-between"><span>Dibuka</span><span>{format(new Date(shift.openedAt), 'dd/MM/yyyy HH:mm', { locale: localeId })}</span></div>
            {shift.closedAt && <div className="flex justify-between"><span>Ditutup</span><span>{format(new Date(shift.closedAt), 'dd/MM/yyyy HH:mm', { locale: localeId })}</span></div>}
            <div className="flex justify-between"><span>Oleh</span><span>{openedBy?.name ?? '-'}</span></div>
            <div className="flex justify-between"><span>Penutup</span><span>{closedBy?.name ?? '-'}</span></div>
          </div>

          <div className="my-2 border-t border-dashed border-gray-400" />
          <div className="space-y-1">
            <div className="flex justify-between"><span>Jumlah Transaksi</span><span>{shift.totalTransactions}</span></div>
            <div className="flex justify-between"><span>Penjualan Tunai</span><span>{rp(shift.cashSales)}</span></div>
            <div className="flex justify-between"><span>Penjualan Non Tunai</span><span>{rp(shift.nonCashSales)}</span></div>
            <div className="flex justify-between font-bold"><span>Total Penjualan</span><span>{rp(shift.totalSales)}</span></div>
          </div>

          <div className="my-2 border-t border-dashed border-gray-400" />
          <div className="space-y-1">
            <div className="flex justify-between"><span>Uang Awal Laci</span><span>{rp(shift.openingCash)}</span></div>
            <div className="flex justify-between"><span>Tunai Seharusnya</span><span>{rp(shift.expectedCash)}</span></div>
            <div className="flex justify-between"><span>Tunai Aktual</span><span>{rp(shift.countedCash)}</span></div>
            <div className="flex justify-between font-bold"><span>Selisih</span><span>{diff > 0 ? '+' : ''}{rp(diff)}</span></div>
          </div>

          {(shift.notes || shift.closingNotes) && (
            <>
              <div className="my-2 border-t border-dashed border-gray-400" />
              {shift.notes && <p className="text-[10px]">Catatan buka: {shift.notes}</p>}
              {shift.closingNotes && <p className="text-[10px]">Catatan tutup: {shift.closingNotes}</p>}
            </>
          )}

          <div className="my-2 border-t border-dashed border-gray-400" />
          <p className="text-center text-[10px]">Dicetak {format(new Date(), 'dd/MM/yyyy HH:mm', { locale: localeId })}</p>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={handleDownload} disabled={generating}>
            <Download className="mr-1 h-4 w-4" /> Unduh
          </Button>
          <Button variant="outline" size="sm" onClick={handleShare} disabled={generating}>
            <Share2 className="mr-1 h-4 w-4" /> Bagikan
          </Button>
          <Button size="sm" onClick={handlePrint} disabled={generating}>
            <Printer className="mr-1 h-4 w-4" /> Cetak
          </Button>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="mr-1 h-4 w-4" /> Tutup
        </Button>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Wire receipt dialog into shift page**

In `src/pages/Shifts.tsx`, import the receipt component:

```ts
import ShiftReportReceipt from '@/components/ShiftReportReceipt';
```

Add state near other state:

```ts
const [printShift, setPrintShift] = useState<CashierShift | null>(null);
```

Add helpers near `userName`:

```ts
const userById = (id?: number) => users?.find((u) => u.id === id);
```

After successful `closeShift`, set the just-closed shift for printing. Replace the update call with an object variable:

```ts
const closedShiftUpdate = {
  status: 'closed' as const,
  closedAt: new Date(),
  closedBy: currentUser?.id,
  countedCash: validation.value ?? 0,
  expectedCash: totals.expectedCash,
  cashDifference: totals.cashDifference,
  totalSales: summary.totalSales,
  totalTransactions: summary.totalTransactions,
  cashSales: summary.cashSales,
  nonCashSales: summary.nonCashSales,
  closingNotes: closingNotes.trim() || undefined,
};
await db.cashierShifts.update(activeShift.id, closedShiftUpdate);
setPrintShift({ ...activeShift, ...closedShiftUpdate });
```

In each closed shift history card, add a print button:

```tsx
<Button variant="outline" size="sm" className="h-8 rounded-full" onClick={() => setPrintShift(shift)}>
  Cetak Laporan
</Button>
```

At the bottom of the component JSX, before the final closing `</div>`, render:

```tsx
{printShift && (
  <ShiftReportReceipt
    open={!!printShift}
    onClose={() => setPrintShift(null)}
    shift={printShift}
    storeSettings={storeSettings}
    openedBy={userById(printShift.openedBy)}
    closedBy={userById(printShift.closedBy)}
  />
)}
```

Make sure `storeSettings` is queried in `Shifts.tsx`:

```ts
const storeSettings = useLiveQuery(() => db.storeSettings.toCollection().first());
```

- [ ] **Step 6: Run verification**

```bash
npm run lint
npm run test -- src/lib/shifts.test.ts
npm run build
```

Expected: lint has no errors, test passes, build passes.

- [ ] **Step 7: Commit**

```bash
git add src/pages/TransactionHistory.tsx src/pages/Reports.tsx src/components/ShiftReportReceipt.tsx src/pages/Shifts.tsx src/lib/printer.ts version.json
git commit -m "feat: add printable shift closing report"
```

---

## Task 5: Backup and Restore Shift Data

**Files:**
- Modify: `src/components/BackupReminder.tsx`
- Modify: `src/pages/Settings.tsx`
- Modify: `src/components/Onboarding.tsx`

- [ ] **Step 1: Export `cashierShifts` in backup**

In `src/components/BackupReminder.tsx`, add to `data` object in `exportBackupData()`:

```ts
cashierShifts: await db.cashierShifts.toArray(),
```

Increase backup version from `5` to `6` only if the existing export version is meant as backup format version. Use:

```ts
version: 6,
```

- [ ] **Step 2: Add import type in Settings**

In `src/pages/Settings.tsx`, add `CashierShift` to the `db` type import list:

```ts
type CashierShift
```

Add to `BackupData`:

```ts
cashierShifts?: CashierShift[];
```

- [ ] **Step 3: Restore shift table in Settings import**

In `handleImport`, include `cashierShifts` in snapshot:

```ts
cashierShifts: await db.cashierShifts.toArray(),
```

Before inserting imported rows, clear if backup contains shift data:

```ts
if (Array.isArray(data.cashierShifts)) {
  await db.cashierShifts.clear();
}
```

After other data insertions, add:

```ts
if (data.cashierShifts?.length) await db.cashierShifts.bulkAdd(data.cashierShifts);
```

In rollback, clear and restore:

```ts
await db.cashierShifts.clear();
if (snapshot.cashierShifts.length) await db.cashierShifts.bulkAdd(snapshot.cashierShifts);
```

- [ ] **Step 4: Restore shift table in onboarding import**

In `src/components/Onboarding.tsx`, add to restore flow:

```ts
await db.cashierShifts.clear();
if (data.cashierShifts?.length) await db.cashierShifts.bulkAdd(data.cashierShifts);
```

Do this after transactions/transactionItems are restored so references are preserved.

- [ ] **Step 5: Run verification**

```bash
npm run lint
npm run test -- src/lib/shifts.test.ts
npm run build
```

Expected: lint has no errors, test passes, build passes.

- [ ] **Step 6: Commit**

```bash
git add src/components/BackupReminder.tsx src/pages/Settings.tsx src/components/Onboarding.tsx version.json
git commit -m "feat: include shifts in backup restore"
```

---

## Task 6: Final Verification and Polish

**Files:**
- Review all changed files.

- [ ] **Step 1: Run full verification**

```bash
npm run lint && npm run test && npm run build
```

Expected:

- `npm run lint`: no errors. Existing Fast Refresh warnings are acceptable only if they were present before this feature.
- `npm run test`: all tests pass.
- `npm run build`: build succeeds.

- [ ] **Step 2: Manual end-to-end test**

Run:

```bash
npm run dev
```

Manual checklist:

- Open shift with `100000` modal awal.
- Complete one cash transaction.
- Complete one QRIS/non-cash transaction.
- Confirm active shift shows:
  - total transactions `2`
  - cash sales equal cash transaction total
  - non-cash sales equal QRIS transaction total
  - total sales equals both transactions
- Close shift with correct counted cash and confirm selisih `Rp 0`.
- Open Transaction History and confirm the completed transactions show shift code.
- Export backup and confirm JSON contains `cashierShifts`.
- Restore backup on a fresh/onboarding state if practical.

- [ ] **Step 3: Inspect git diff**

```bash
git diff --stat HEAD~5..HEAD
git status --short
```

Expected: only intended files changed. Working tree clean after final commit.

- [ ] **Step 4: Optional final commit if polish changes were made**

```bash
git add <changed-files> version.json
git commit -m "polish: refine cashier shift flow"
```

---

## Self-Review

- **Spec coverage:** The plan covers schema, permission, shift page, checkout linking, reporting visibility, backup/restore, tests, and verification.
- **Placeholder scan:** No TBD/TODO placeholders remain. Each code-touching task includes exact file paths and concrete snippets.
- **Type consistency:** `CashierShift`, `shiftId`, `manage_shifts`, `calculateShiftSummary`, `getCloseShiftTotals`, and `getActiveShift` are consistently named across tasks.

---

## Out of Scope for First Release

These are intentionally deferred:

- Cash drawer in/out movements outside sales.
- Multiple simultaneous shifts per device.
- Optional setting to allow transactions without shift.
- Excel export specifically filtered by shift.
- Optional advanced ESC/POS layout customization beyond the basic thermal shift report.
- Audit log table for all shift actions.
