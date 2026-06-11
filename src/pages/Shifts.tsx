import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Banknote,
  CalendarClock,
  CheckCircle2,
  Clock,
  Coins,
  MinusCircle,
  PlusCircle,
  ReceiptText,
  ShieldAlert,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { db, type CashierShift, type Transaction } from '@/lib/db';
import {
  calculateShiftSummary,
  getCloseShiftTotals,
  getNextShiftCode,
  selectLatestOpenShift,
  validateOpeningCash,
} from '@/lib/shifts';
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
  const activeShift = useMemo(() => selectLatestOpenShift(shifts ?? []), [shifts]);
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
    ? getCloseShiftTotals({
        openingCash: activeShift.openingCash,
        countedCash: countedValue,
        cashSales: summary.cashSales,
      })
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
      const openShifts = await db.cashierShifts.where('status').equals('open').toArray();
      if (openShifts.length > 0) {
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
                <p className="text-xs text-muted-foreground">Uang Awal Laci</p>
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
              <Label htmlFor="opening-cash">Uang awal di laci</Label>
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
            <p>Buka shift terlebih dahulu sebelum transaksi kasir agar uang tunai dan laporan tutup kasir tercatat rapi.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
