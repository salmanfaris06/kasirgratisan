import { useLiveQuery } from 'dexie-react-hooks';
import { db, isStockManaged, type TransactionItemRecord } from '@/lib/db';
import { useState, useEffect, useMemo } from 'react';
import { ShoppingCart, Package, BarChart3, TrendingUp, AlertTriangle, Receipt, ChevronRight, ClipboardList, Wallet, CalendarDays } from 'lucide-react';
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

  const quickActions: { to: string; icon: typeof ShoppingCart; label: string; desc: string; color: string; perm?: PermissionKey }[] = [
    { to: '/cashier', icon: ShoppingCart, label: 'Kasir', desc: 'Mulai transaksi', color: 'bg-primary/15 text-primary ring-primary/20', perm: 'create_transaction' },
    { to: '/products', icon: Package, label: 'Produk', desc: 'Kelola produk', color: 'bg-accent/15 text-accent ring-accent/20' },
    { to: '/reports', icon: BarChart3, label: 'Laporan', desc: 'Lihat laporan', color: 'bg-success/15 text-success ring-success/20', perm: 'view_reports' },
  ];
  const visibleActions = quickActions.filter((a) => !a.perm || can(a.perm));

  return (
    <div className="space-y-6 px-4 pt-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <CalendarDays className="h-4 w-4 text-primary" />
            {format(new Date(), 'EEEE, d MMMM yyyy', { locale: id })}
          </p>
          <h1 className="truncate text-4xl font-extrabold tracking-tight md:text-5xl">{storeSettings?.storeName || 'KasirGratisan'}</h1>
        </div>
        <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-border/70 bg-card/70 shadow-soft backdrop-blur-sm">
          <ShoppingCart className="h-6 w-6 text-muted-foreground" />
          <span className="absolute bottom-1.5 right-1.5 h-3.5 w-3.5 rounded-full border-2 border-background bg-primary shadow-glow" />
        </div>
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
        <Card className="overflow-hidden border-primary/40 bg-[radial-gradient(circle_at_85%_30%,hsl(38_92%_55%/0.95),transparent_18rem),linear-gradient(135deg,hsl(32_100%_50%),hsl(14_100%_50%))] text-primary-foreground shadow-[0_18px_45px_hsl(var(--primary)/0.35)]">
          <CardContent className="relative min-h-[168px] p-6 md:p-7">
            <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
            <div className="absolute -bottom-20 right-8 h-36 w-56 rounded-[100%] border border-white/20 bg-white/10 blur-sm" />
            <div className="absolute -bottom-10 right-0 h-24 w-72 rounded-[100%] border-t border-white/25 bg-[radial-gradient(circle,hsl(0_0%_100%/0.28)_1px,transparent_1.5px)] [background-size:13px_13px] opacity-60" />
            <div className="relative flex h-full items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-primary-foreground/85">Penjualan Hari Ini</p>
                <p className="mt-5 text-5xl font-extrabold tracking-tight drop-shadow md:text-6xl">Rp {totalSales.toLocaleString('id-ID')}</p>
                <div className="mt-5 flex flex-wrap items-center gap-2 text-xs font-bold text-primary-foreground/90">
                  <span className="rounded-full border border-white/25 bg-white/12 px-3 py-1.5 shadow-soft backdrop-blur-sm">{txCount} transaksi</span>
                  {can('view_reports') && <span className="rounded-full border border-white/25 bg-white/12 px-3 py-1.5 shadow-soft backdrop-blur-sm">Profit Rp {totalProfit.toLocaleString('id-ID')}</span>}
                </div>
              </div>
              <div className="mt-5 rounded-full border border-white/25 bg-white/15 p-4 shadow-[0_0_35px_hsl(0_0%_100%/0.25)] backdrop-blur-sm">
                <TrendingUp className="h-8 w-8" />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {can('view_reports') && (
            <Card className="border-border/70 bg-card/80 shadow-soft backdrop-blur-sm transition-shadow hover:shadow-card">
              <CardContent className="p-4 md:p-5">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-success/15 text-success ring-1 ring-success/20">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <p className="text-xs font-medium text-muted-foreground">Profit Hari Ini</p>
                <p className="mt-1 text-lg font-bold tracking-tight">Rp {totalProfit.toLocaleString('id-ID')}</p>
              </CardContent>
            </Card>
          )}
          {(can('view_expenses') || can('manage_expenses')) && (
            <Link to="/expenses" className="contents">
              <Card className="border-border/70 bg-card/80 shadow-soft backdrop-blur-sm transition-shadow hover:shadow-card">
                <CardContent className="p-4 md:p-5">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-warning/15 text-warning ring-1 ring-warning/20">
                    <Wallet className="h-4 w-4" />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground">Pengeluaran</p>
                  <p className="mt-1 text-lg font-bold tracking-tight">Rp {totalExpensesToday.toLocaleString('id-ID')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{expenseCount} catatan</p>
                </CardContent>
              </Card>
            </Link>
          )}
          <Card className="border-border/70 bg-card/80 shadow-soft backdrop-blur-sm transition-shadow hover:shadow-card">
            <CardContent className="p-4 md:p-5">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/20">
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
          <div className={`grid gap-3 ${visibleActions.length === 1 ? 'grid-cols-1' : visibleActions.length === 2 ? 'grid-cols-2' : 'grid-cols-1 md:grid-cols-3'}`}>
            {visibleActions.map(({ to, icon: Icon, label, desc, color }) => (
              <Link key={to} to={to}>
                <Card className="group border-border/70 bg-card/80 shadow-soft backdrop-blur-sm transition-[box-shadow,transform] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-card active:translate-y-0 active:scale-[0.99]">
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ring-1 transition-transform duration-150 ease-out group-hover:scale-105 ${color}`}>
                      <Icon className="h-7 w-7" />
                    </div>
                    <div className="min-w-0 flex-1 text-left">
                      <p className="text-sm font-extrabold">{label}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{desc}</p>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
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
