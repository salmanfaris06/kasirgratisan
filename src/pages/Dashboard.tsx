import { useLiveQuery } from 'dexie-react-hooks';
import { db, isStockManaged, type TransactionItemRecord } from '@/lib/db';
import { useState, useEffect, useMemo } from 'react';
import { ShoppingCart, Package, BarChart3, TrendingUp, AlertTriangle, Receipt, ChevronRight, ClipboardList, Wallet } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import BackupReminder, { shouldShowBackupReminder, exportBackupData } from '@/components/BackupReminder';
import WhatsNewModal from '@/components/WhatsNewModal';
import { getUnseenFeatures } from '@/lib/whats-new';
import { useAuth } from '@/hooks/use-auth';
import type { PermissionKey } from '@/lib/db';

export default function Dashboard() {
  const { can } = useAuth();
  const [backupDismissed, setBackupDismissed] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);

  const storeSettings = useLiveQuery(() => db.storeSettings.toCollection().first());

  // Compute unseen features once storeSettings loaded. Memoized so the array
  // identity is stable until seenWhatsNewIds actually changes.
  const unseenFeatures = useMemo(
    () => getUnseenFeatures(storeSettings?.seenWhatsNewIds),
    [storeSettings?.seenWhatsNewIds],
  );

  // Auto-show modal once on landing if there are unseen features.
  // Only fires when onboarding is done (existing user, not first-launch flow).
  useEffect(() => {
    if (!storeSettings) return;
    if (!storeSettings.onboardingDone) return;
    if (unseenFeatures.length === 0) return;
    setWhatsNewOpen(true);
    // Intentionally only run when unseen list transitions from empty → non-empty
    // for the *current* settings doc. The dependency on the array length
    // guards against re-opening after dismissal in the same session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeSettings?.id, unseenFeatures.length > 0]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayTransactions = useLiveQuery(async () => {
    const all = await db.transactions.where('date').aboveOrEqual(today).toArray();
    return all.filter(t => t.status !== 'open');
  }, []);

  const openBillsCount = useLiveQuery(async () => {
    const open = await db.transactions.where('status').equals('open').toArray();
    return open.length;
  }, []);

  const lowStockProducts = useLiveQuery(() => db.products.filter(p => p.isDeleted === 0 && isStockManaged(p) && p.stock <= 5).toArray());

  const todayExpenses = useLiveQuery(async () => {
    const all = await db.expenses.where('date').aboveOrEqual(today).toArray();
    return all.filter(e => e.isDeleted === 0);
  }, []);

  const recentTransactions = useLiveQuery(() =>
    db.transactions.orderBy('date').reverse().limit(5).toArray()
  );

  // Query items for recent transactions
  const recentTxItems = useLiveQuery(async () => {
    if (!recentTransactions || recentTransactions.length === 0) return {};
    const txIds = recentTransactions.map(t => t.id!).filter(Boolean);
    const items = await db.transactionItems.where('transactionId').anyOf(txIds).toArray();
    const map: Record<number, TransactionItemRecord[]> = {};
    for (const item of items) {
      if (!map[item.transactionId]) map[item.transactionId] = [];
      map[item.transactionId].push(item);
    }
    return map;
  }, [recentTransactions]);

  const paymentMethods = useLiveQuery(() => db.paymentMethods.toArray());

  // Show onboarding if not done yet
  if (storeSettings === undefined) return null; // loading

  const totalSales = todayTransactions?.reduce((sum, t) => sum + t.total, 0) ?? 0;
  const totalProfit = todayTransactions?.reduce((sum, t) => sum + t.profit, 0) ?? 0;
  const totalExpensesToday = todayExpenses?.reduce((sum, e) => sum + e.amount, 0) ?? 0;
  const txCount = todayTransactions?.length ?? 0;
  const expenseCount = todayExpenses?.length ?? 0;

  const showBackup = !backupDismissed && storeSettings && shouldShowBackupReminder(storeSettings.lastBackupAt) && can('manage_backup');

  const quickActions: { to: string; icon: typeof ShoppingCart; label: string; color: string; perm?: PermissionKey }[] = [
    { to: '/cashier', icon: ShoppingCart, label: 'Kasir', color: 'bg-primary/10 text-primary', perm: 'create_transaction' },
    { to: '/products', icon: Package, label: 'Produk', color: 'bg-accent/10 text-accent' },
    { to: '/reports', icon: BarChart3, label: 'Laporan', color: 'bg-success/10 text-success', perm: 'view_reports' },
  ];
  const visibleActions = quickActions.filter((a) => !a.perm || can(a.perm));

  return (
    <div className="px-4 pt-6 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">{format(new Date(), 'EEEE, d MMMM yyyy', { locale: id })}</p>
        <h1 className="text-2xl font-extrabold tracking-tight">{storeSettings?.storeName || 'KasirGratisan'}</h1>
      </div>

      {/* Backup Reminder */}
      {showBackup && (
        <BackupReminder
          lastBackupAt={storeSettings?.lastBackupAt ?? null}
          onDismiss={() => setBackupDismissed(true)}
          onBackup={exportBackupData}
        />
      )}

      {/* Stats */}
      <section className="space-y-3">
        <Card className="overflow-hidden border-primary/20 bg-primary text-primary-foreground shadow-glow">
          <CardContent className="relative p-5 md:p-6">
            <div className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/15 blur-2xl" />
            <div className="absolute -bottom-16 right-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
            <div className="relative flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-foreground/75">Penjualan Hari Ini</p>
                <p className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">Rp {totalSales.toLocaleString('id-ID')}</p>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-primary-foreground/85">
                  <span className="rounded-full bg-white/15 px-3 py-1">{txCount} transaksi</span>
                  {can('view_reports') && <span className="rounded-full bg-white/15 px-3 py-1">Profit Rp {totalProfit.toLocaleString('id-ID')}</span>}
                </div>
              </div>
              <div className="rounded-2xl bg-white/15 p-3 shadow-soft backdrop-blur-sm">
                <TrendingUp className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {can('view_reports') && (
            <Card className="border-border/70 shadow-soft">
              <CardContent className="p-4">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-success/10 text-success">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <p className="text-xs font-medium text-muted-foreground">Profit Hari Ini</p>
                <p className="mt-1 text-lg font-bold tracking-tight">Rp {totalProfit.toLocaleString('id-ID')}</p>
              </CardContent>
            </Card>
          )}
          {(can('view_expenses') || can('manage_expenses')) && (
            <Link to="/expenses" className="contents">
              <Card className="border-border/70 shadow-soft transition-shadow hover:shadow-card">
                <CardContent className="p-4">
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-warning/10 text-warning">
                    <Wallet className="h-4 w-4" />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground">Pengeluaran</p>
                  <p className="mt-1 text-lg font-bold tracking-tight">Rp {totalExpensesToday.toLocaleString('id-ID')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{expenseCount} catatan</p>
                </CardContent>
              </Card>
            </Link>
          )}
          <Card className="border-border/70 shadow-soft">
            <CardContent className="p-4">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Receipt className="h-4 w-4" />
              </div>
              <p className="text-xs font-medium text-muted-foreground">Transaksi</p>
              <p className="mt-1 text-lg font-bold tracking-tight">{txCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">hari ini</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Open Bills */}
      {openBillsCount != null && openBillsCount > 0 && (
        <Link to="/cashier">
          <Card className="border-border/70 shadow-soft bg-warning/10 hover:shadow-card transition-shadow cursor-pointer mt-2">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-warning/20 text-warning flex items-center justify-center shrink-0">
                <ClipboardList className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">Open Bills</p>
                <p className="text-xs text-muted-foreground">{openBillsCount} bill menunggu pembayaran</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      )}

      {/* Quick Actions */}
      {visibleActions.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold tracking-tight">Akses Cepat</h2>
            <span className="text-xs text-muted-foreground">Operasi utama</span>
          </div>
          <div className={`grid gap-3 ${visibleActions.length === 1 ? 'grid-cols-1' : visibleActions.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {visibleActions.map(({ to, icon: Icon, label, color }) => (
              <Link key={to} to={to}>
                <Card className="group border-border/70 shadow-soft transition-[box-shadow,transform] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-card active:translate-y-0 active:scale-[0.99]">
                  <CardContent className="flex flex-col items-center gap-3 p-4">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-2xl transition-transform duration-150 ease-out group-hover:scale-105 ${color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-xs font-bold">{label}</span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Recent Transactions */}
      {recentTransactions && recentTransactions.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-primary" />
              Transaksi Terakhir
            </h2>
            <Link to="/history">
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary">
                Lihat Semua <ChevronRight className="w-3 h-3" />
              </Button>
            </Link>
          </div>
          <div className="space-y-2">
            {recentTransactions.map(tx => (
              <Link key={tx.id ?? tx.receiptNumber} to={`/history?txId=${tx.id ?? tx.receiptNumber}`}>
                <Card className="border-border/70 shadow-soft hover:shadow-card transition-shadow mb-2">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Receipt className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground truncate">{(recentTxItems?.[tx.id!] ?? []).map(i => i.productName).join(', ')}</p>
                        <p className="text-[10px] text-muted-foreground shrink-0 ml-2">{format(new Date(tx.date), 'HH:mm')}</p>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-sm font-bold text-primary">Rp {tx.total.toLocaleString('id-ID')}</p>
                        <p className="text-[10px] text-muted-foreground">{paymentMethods?.find(pm => pm.id === tx.paymentMethodId)?.name || 'Tunai'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Low Stock Alert */}
      {lowStockProducts && lowStockProducts.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-bold tracking-tight">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Stok Menipis
            </h2>
            <Link to="/products" className="text-xs font-semibold text-primary">
              Kelola
            </Link>
          </div>
          <Card className="border-warning/30 bg-warning/5 shadow-soft">
            <CardContent className="divide-y divide-border/60 p-0">
              {lowStockProducts.slice(0, 5).map(product => (
                <div key={product.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{product.name}</p>
                    <p className="text-xs text-muted-foreground">Segera tambah stok</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-bold text-destructive">
                    Sisa {product.stock} {product.unit}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}

      <WhatsNewModal
        open={whatsNewOpen}
        onOpenChange={setWhatsNewOpen}
        features={unseenFeatures}
      />
    </div>
  );
}
