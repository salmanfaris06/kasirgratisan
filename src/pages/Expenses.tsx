import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Expense, type ExpenseCategory } from '@/lib/db';
import { useState, useMemo } from 'react';
import { Wallet, Plus, ChevronLeft, Edit2, Trash2, Calendar, Receipt, FilterX } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { format, startOfDay, startOfMonth, subDays } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import LockedPage from '@/components/LockedPage';

type RangePreset = 'today' | '7' | '30' | 'month' | 'all';

const RANGE_LABELS: Record<RangePreset, string> = {
  today: 'Hari ini',
  '7': '7 hari',
  '30': '30 hari',
  month: 'Bulan ini',
  all: 'Semua',
};

function rangeStart(range: RangePreset): Date | null {
  const now = new Date();
  switch (range) {
    case 'today':
      return startOfDay(now);
    case '7':
      return startOfDay(subDays(now, 6));
    case '30':
      return startOfDay(subDays(now, 29));
    case 'month':
      return startOfMonth(now);
    case 'all':
      return null;
  }
}

const rp = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

export default function ExpensesPage() {
  const { currentUser, can } = useAuth();

  const [range, setRange] = useState<RangePreset>('30');
  const [filterCategoryId, setFilterCategoryId] = useState<string>('all');

  // Add/edit form
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);

  const expenses = useLiveQuery(async () => {
    const start = rangeStart(range);
    const all = start
      ? await db.expenses.where('date').aboveOrEqual(start).toArray()
      : await db.expenses.toArray();
    return all.filter((e) => e.isDeleted === 0).sort((a, b) => +new Date(b.date) - +new Date(a.date));
  }, [range]);

  const categories = useLiveQuery(() =>
    db.expenseCategories.where('isDeleted').equals(0).toArray(),
  );
  const paymentMethods = useLiveQuery(() => db.paymentMethods.toArray());

  const canManage = can('manage_expenses');
  const canView = can('view_expenses') || canManage;

  const filtered = useMemo(() => {
    if (!expenses) return [];
    if (filterCategoryId === 'all') return expenses;
    return expenses.filter((e) => e.categoryId === Number(filterCategoryId));
  }, [expenses, filterCategoryId]);

  const totalAmount = useMemo(
    () => filtered.reduce((s, e) => s + e.amount, 0),
    [filtered],
  );

  const getCategory = (id: number): ExpenseCategory | undefined =>
    categories?.find((c) => c.id === id);
  const getPaymentName = (id: number): string =>
    paymentMethods?.find((p) => p.id === id)?.name ?? '-';

  // === Form helpers ===

  const resetForm = () => {
    setEditing(null);
    setTitle('');
    setCategoryId(categories && categories.length > 0 ? String(categories[0].id) : '');
    setAmount('');
    setPaymentMethodId(
      paymentMethods && paymentMethods.length > 0 ? String(paymentMethods[0].id) : '',
    );
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setNotes('');
  };

  const openAdd = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (exp: Expense) => {
    setEditing(exp);
    setTitle(exp.title);
    setCategoryId(String(exp.categoryId));
    setAmount(String(exp.amount));
    setPaymentMethodId(String(exp.paymentMethodId));
    setDate(format(new Date(exp.date), 'yyyy-MM-dd'));
    setNotes(exp.notes ?? '');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    const numericAmount = Number(amount);
    if (!trimmedTitle) {
      toast.error('Judul pengeluaran wajib diisi');
      return;
    }
    if (!categoryId) {
      toast.error('Pilih kategori');
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error('Nominal harus lebih dari 0');
      return;
    }
    if (!paymentMethodId) {
      toast.error('Pilih metode pembayaran');
      return;
    }
    if (!date) {
      toast.error('Pilih tanggal');
      return;
    }

    // Build a Date at midnight local; users only pick date, not time.
    const expenseDate = new Date(`${date}T00:00:00`);

    try {
      if (editing?.id) {
        await db.expenses.update(editing.id, {
          title: trimmedTitle,
          categoryId: Number(categoryId),
          amount: numericAmount,
          paymentMethodId: Number(paymentMethodId),
          date: expenseDate,
          notes: notes.trim() || undefined,
        });
        toast.success('Pengeluaran diperbarui');
      } else {
        await db.expenses.add({
          title: trimmedTitle,
          categoryId: Number(categoryId),
          amount: numericAmount,
          paymentMethodId: Number(paymentMethodId),
          date: expenseDate,
          notes: notes.trim() || undefined,
          createdAt: new Date(),
          createdBy: currentUser?.id,
          isDeleted: 0,
          deletedAt: null,
        });
        toast.success('Pengeluaran dicatat');
      }
      setDialogOpen(false);
    } catch {
      toast.error('Gagal menyimpan pengeluaran');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;
    await db.expenses.update(deleteTarget.id, {
      isDeleted: 1,
      deletedAt: new Date(),
    });
    toast.success('Pengeluaran dihapus');
    setDeleteTarget(null);
  };

  // === Permission gates ===

  if (!canView) {
    return <LockedPage title="Pengeluaran" permissionLabel="Lihat Pengeluaran" />;
  }

  // === Render ===

  const noCategories = !categories || categories.length === 0;
  const noPaymentMethods = !paymentMethods || paymentMethods.length === 0;

  return (
    <div className="space-y-4 px-4 pb-20 pt-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Link to="/settings" className="mt-1 shrink-0">
            <Button variant="ghost" size="icon" aria-label="Kembali ke pengaturan" className="h-8 w-8 rounded-full">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-warning/80">Operasional</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-extrabold tracking-tight">
              <Wallet className="h-5 w-5 text-warning" />
              Pengeluaran
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">Catat biaya operasional agar laba bersih lebih akurat.</p>
          </div>
        </div>
        {canManage && (
          <Button size="sm" onClick={openAdd} className="h-10 gap-1.5 rounded-full px-4 shadow-glow">
            <Plus className="w-4 h-4" /> Tambah
          </Button>
        )}
      </div>

      {/* Range filter */}
      <div className="flex flex-wrap gap-2 rounded-2xl border border-border/70 bg-card/80 p-2 shadow-soft">
        {(Object.keys(RANGE_LABELS) as RangePreset[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-[background-color,color,border-color,box-shadow] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              range === r
                ? 'border-warning bg-warning/10 text-warning shadow-soft'
                : 'border-border/70 bg-background/70 text-muted-foreground hover:text-foreground'
            }`}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
      </div>

      {/* Total summary */}
      <Card className="border-border/70 bg-warning/5 shadow-soft">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-warning/15 text-warning flex items-center justify-center shrink-0">
            <Receipt className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
              Total Pengeluaran ({RANGE_LABELS[range]})
            </p>
            <p className="text-lg font-bold">{rp(totalAmount)}</p>
            <p className="text-[10px] text-muted-foreground">{filtered.length} catatan</p>
          </div>
        </CardContent>
      </Card>

      {/* Category filter */}
      <Card className="border-border/70 bg-card/80 shadow-soft backdrop-blur-sm">
        <CardContent className="flex items-center gap-2 p-2.5">
        <Select value={filterCategoryId} onValueChange={setFilterCategoryId}>
          <SelectTrigger className="h-10 flex-1 border-transparent bg-background/70">
            <SelectValue placeholder="Filter kategori" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua kategori</SelectItem>
            {categories?.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.icon} {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filterCategoryId !== 'all' && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Hapus filter kategori"
            className="h-10 w-10 shrink-0 rounded-xl"
            onClick={() => setFilterCategoryId('all')}
            title="Hapus filter"
          >
            <FilterX className="w-4 h-4" />
          </Button>
        )}
        </CardContent>
      </Card>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border/80 bg-card/60 px-6 py-12 text-center shadow-soft">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-warning/10 text-warning">
            <Wallet className="h-7 w-7" />
          </div>
          <p className="text-sm font-semibold">
            {expenses && expenses.length === 0
              ? 'Belum ada pengeluaran tercatat'
              : 'Tidak ada pengeluaran sesuai filter'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((exp) => {
            const cat = getCategory(exp.categoryId);
            return (
              <Card key={exp.id} className="border-border/70 shadow-soft transition-shadow hover:shadow-card">
                <CardContent className="p-3.5">
                  <div className="flex items-start gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-base"
                      style={{ backgroundColor: (cat?.color ?? '#6B7280') + '20' }}
                    >
                      {cat?.icon ?? '📦'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate">{exp.title}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {cat?.name ?? '—'} · {getPaymentName(exp.paymentMethodId)}
                          </p>
                        </div>
                        <p className="text-sm font-bold text-warning shrink-0">
                          -{rp(exp.amount)}
                        </p>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        <span>{format(new Date(exp.date), 'dd MMM yyyy', { locale: idLocale })}</span>
                      </div>
                      {exp.notes && (
                        <p className="text-[11px] text-muted-foreground mt-1 italic line-clamp-2">
                          {exp.notes}
                        </p>
                      )}
                      {canManage && (
                        <div className="flex gap-1 mt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1"
                            onClick={() => openEdit(exp)}
                          >
                            <Edit2 className="w-3 h-3" /> Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-destructive gap-1"
                            onClick={() => setDeleteTarget(exp)}
                          >
                            <Trash2 className="w-3 h-3" /> Hapus
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-[95vw] overflow-y-auto rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Pengeluaran' : 'Tambah Pengeluaran'}</DialogTitle>
          </DialogHeader>

          {(noCategories || noPaymentMethods) && (
            <div className="rounded-xl bg-warning/10 border border-warning/30 p-3 text-xs text-foreground">
              {noCategories && (
                <p>
                  Belum ada kategori pengeluaran. Tambahkan dulu di Pengaturan.
                </p>
              )}
              {noPaymentMethods && (
                <p>Belum ada metode pembayaran. Tambahkan dulu di Pengaturan.</p>
              )}
            </div>
          )}

          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Judul *</Label>
              <Input
                name="expense-title"
                autoComplete="off"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Contoh: Bayar listrik bulan ini"
                className="h-11"
                maxLength={120}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Kategori *</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Pilih kategori" />
                </SelectTrigger>
                <SelectContent>
                  {categories?.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.icon} {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nominal *</Label>
                <Input
                  name="expense-amount"
                  autoComplete="off"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="50000"
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tanggal *</Label>
                <Input
                  name="expense-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-11"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Metode Pembayaran *</Label>
              <Select value={paymentMethodId} onValueChange={setPaymentMethodId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Pilih metode" />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods?.map((pm) => (
                    <SelectItem key={pm.id} value={String(pm.id)}>
                      {pm.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Catatan</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Opsional"
                rows={3}
                className="resize-none"
              />
            </div>

            <Button
              className="w-full h-12 text-base font-semibold"
              onClick={handleSave}
              disabled={noCategories || noPaymentMethods}
            >
              {editing ? 'Simpan Perubahan' : 'Catat Pengeluaran'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="max-w-[90vw] rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus pengeluaran?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.title}" sebesar {deleteTarget && rp(deleteTarget.amount)} akan dihapus.
              Catatan ini tidak akan masuk ke laporan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
