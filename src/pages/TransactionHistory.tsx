import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Transaction, type TransactionItemRecord } from '@/lib/db';
import { useState, useEffect } from 'react';
import { format, startOfDay, endOfDay } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { ArrowLeft, Search, Receipt as ReceiptIcon, Calendar, ChevronRight, ShoppingBag, CalendarIcon, X, Trash2, ShoppingCart, UserCircle2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import ReceiptDialog from '@/components/Receipt';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';

export default function TransactionHistory() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { can, multiUserEnabled } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [restoreStock, setRestoreStock] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'open'>('all');
  const [filterCashier, setFilterCashier] = useState<string>('all');

  const transactions = useLiveQuery(() =>
    db.transactions.orderBy('date').reverse().toArray()
  );

  // Query all transaction items and build lookup map
  const txItemsMap = useLiveQuery(async () => {
    const items = await db.transactionItems.toArray();
    const map: Record<number, TransactionItemRecord[]> = {};
    for (const item of items) {
      if (!map[item.transactionId]) map[item.transactionId] = [];
      map[item.transactionId].push(item);
    }
    return map;
  });

  const getTxItems = (txId: number | undefined): TransactionItemRecord[] =>
    txId ? (txItemsMap?.[txId] ?? []) : [];
  const paymentMethods = useLiveQuery(() => db.paymentMethods.toArray());
  const storeSettings = useLiveQuery(() => db.storeSettings.toCollection().first());
  const users = useLiveQuery(() => db.users.toArray());

  const userById = (uid?: number) => (uid ? users?.find((u) => u.id === uid) : undefined);
  const cashierName = (uid?: number) => userById(uid)?.name ?? '—';

  // Auto-open detail if txId is in URL
  const txIdParam = searchParams.get('txId');
  useEffect(() => {
    if (txIdParam && transactions) {
      const tx = transactions.find(t => t.id === Number(txIdParam) || t.receiptNumber === txIdParam);
      if (tx) {
        setSelectedTx(tx);
        setDetailOpen(true);
      }
    }
  }, [txIdParam, transactions]);

  const getPaymentName = (pmId: number) =>
    paymentMethods?.find(pm => pm.id === pmId)?.name || 'Tunai';

  const filtered = transactions?.filter(tx => {
    // Status filter
    if (filterStatus !== 'all' && tx.status !== filterStatus) return false;
    // Cashier filter
    if (filterCashier !== 'all') {
      if (filterCashier === 'unknown') {
        if (tx.createdBy !== undefined && tx.createdBy !== null) return false;
      } else if (String(tx.createdBy) !== filterCashier) {
        return false;
      }
    }
    // Date filter
    if (dateFrom) {
      const txDate = new Date(tx.date);
      if (txDate < startOfDay(dateFrom)) return false;
    }
    if (dateTo) {
      const txDate = new Date(tx.date);
      if (txDate > endOfDay(dateTo)) return false;
    }
    // Search filter
    if (search) {
      const q = search.toLowerCase();
      const items = getTxItems(tx.id);
      return (
        tx.receiptNumber.toLowerCase().includes(q) ||
        items.some(it => it.productName.toLowerCase().includes(q))
      );
    }
    return true;
  }) ?? [];

  // Group by date
  const grouped = filtered.reduce<Record<string, Transaction[]>>((acc, tx) => {
    const key = format(new Date(tx.date), 'yyyy-MM-dd');
    if (!acc[key]) acc[key] = [];
    acc[key].push(tx);
    return acc;
  }, {});

  const dateKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const filteredTotal = filtered.filter(t => t.status !== 'open').reduce((s, t) => s + t.total, 0);
  const hasDateFilter = dateFrom || dateTo;

  const openDetail = (tx: Transaction) => {
    setSelectedTx(tx);
    setDetailOpen(true);
  };

  const openReceipt = () => {
    setDetailOpen(false);
    setTimeout(() => setReceiptOpen(true), 200);
  };

  const clearDateFilter = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  const handleDeleteTransaction = async () => {
    if (!selectedTx?.id) return;
    try {
      if (restoreStock) {
        const items = getTxItems(selectedTx.id);
        for (const item of items) {
          const product = await db.products.get(item.productId);
          if (product) {
            await db.products.update(item.productId, { stock: product.stock + item.quantity });
          }
        }
      }
      await db.transactionItems.where('transactionId').equals(selectedTx.id).delete();
      await db.transactions.delete(selectedTx.id);
      setDeleteDialogOpen(false);
      setDetailOpen(false);
      setSelectedTx(null);
      toast.success('Transaksi berhasil dihapus');
    } catch {
      toast.error('Gagal menghapus transaksi');
    }
  };

  const rp = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

  return (
    <div className="space-y-4 px-4 pb-4 pt-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" aria-label="Kembali" className="mt-1 h-8 w-8 rounded-full" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
            <ReceiptIcon className="h-5 w-5 text-primary" />
            Riwayat Transaksi
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">Cari struk, cek open bill, dan telusuri transaksi lama.</p>
        </div>
      </div>

      <Card className="border-border/70 bg-card/80 shadow-soft backdrop-blur-sm">
        <CardContent className="space-y-2.5 p-2.5">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="transaction-search"
              autoComplete="off"
              placeholder="Cari no. struk atau nama produk…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-10 border-transparent bg-background/70 pl-9"
            />
          </div>

          {/* Date Filter */}
          <div className="flex items-center gap-2">
            <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("h-9 flex-1 gap-1.5 rounded-xl bg-background/70 text-xs", dateFrom && "border-primary text-primary")}>
              <CalendarIcon className="w-3.5 h-3.5" />
              {dateFrom ? format(dateFrom, 'dd MMM yyyy', { locale: localeId }) : 'Dari tanggal'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarPicker
              mode="single"
              selected={dateFrom}
              onSelect={setDateFrom}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>

            <span className="text-xs text-muted-foreground">—</span>

            <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("h-9 flex-1 gap-1.5 rounded-xl bg-background/70 text-xs", dateTo && "border-primary text-primary")}>
              <CalendarIcon className="w-3.5 h-3.5" />
              {dateTo ? format(dateTo, 'dd MMM yyyy', { locale: localeId }) : 'Sampai tanggal'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <CalendarPicker
              mode="single"
              selected={dateTo}
              onSelect={setDateTo}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>

            {hasDateFilter && (
              <Button variant="ghost" size="icon" aria-label="Hapus filter tanggal" className="h-9 w-9 shrink-0 rounded-xl" onClick={clearDateFilter}>
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Status filter tabs */}
      <div className="flex gap-1.5 rounded-2xl border border-border/70 bg-card/80 p-1 shadow-soft">
        {([
          { value: 'all', label: 'Semua' },
          { value: 'open', label: 'Open Bill' },
          { value: 'completed', label: 'Lunas' },
        ] as const).map(tab => (
          <button
            key={tab.value}
            onClick={() => setFilterStatus(tab.value)}
            className={cn(
              'flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-[background-color,color,box-shadow] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              filterStatus === tab.value ? 'bg-primary text-primary-foreground shadow-glow' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Cashier filter (only when multi-user is on) */}
      {multiUserEnabled && users && users.length > 0 && (
        <Card className="border-border/70 bg-card/80 shadow-soft">
          <CardContent className="p-2.5">
            <Select value={filterCashier} onValueChange={setFilterCashier}>
            <SelectTrigger className="h-9 border-transparent bg-background/70 text-xs">
              <div className="flex items-center gap-1.5">
                <UserCircle2 className="w-3.5 h-3.5 text-muted-foreground" />
                <SelectValue placeholder="Filter Kasir" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Kasir</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {u.name} (@{u.username})
                </SelectItem>
              ))}
              <SelectItem value="unknown">Tanpa Kasir (data lama)</SelectItem>
            </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <Card className="border-border/70 shadow-soft">
            <CardContent className="p-3 text-center">
              <p className="text-[10px] text-muted-foreground">Total Transaksi</p>
              <p className="text-lg font-bold text-primary">{filtered.length}</p>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-soft">
            <CardContent className="p-3 text-center">
              <p className="text-[10px] text-muted-foreground">Total Penjualan</p>
              <p className="text-lg font-bold text-primary">{rp(filteredTotal)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Transaction list grouped by date */}
      {dateKeys.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border/80 bg-card/60 px-6 py-16 text-center shadow-soft">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ShoppingBag className="h-7 w-7" />
          </div>
          <p className="text-sm font-semibold">
            {hasDateFilter ? 'Tidak ada transaksi di rentang tanggal ini' : 'Belum ada transaksi'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Transaksi yang selesai dari kasir akan muncul di sini.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {dateKeys.map(dateKey => (
            <section key={dateKey}>
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-xs font-semibold text-muted-foreground">
                  {format(new Date(dateKey), 'EEEE, dd MMMM yyyy', { locale: localeId })}
                </p>
                <Badge variant="secondary" className="text-[10px] h-5">
                  {grouped[dateKey].length} transaksi
                </Badge>
              </div>
              <div className="space-y-2">
                {grouped[dateKey].map(tx => (
                  <Card
                    key={tx.id ?? tx.receiptNumber}
                    className="cursor-pointer border-border/70 shadow-soft transition-[box-shadow,transform] duration-150 ease-out hover:shadow-card active:scale-[0.99]"
                    onClick={() => openDetail(tx)}
                  >
                    <CardContent className="flex items-center gap-3 p-3.5">
                      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', tx.status === 'open' ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-primary')}>
                        {tx.status === 'open' ? <ShoppingCart className="w-4 h-4" /> : <ReceiptIcon className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-mono text-muted-foreground truncate">{tx.receiptNumber}</p>
                            {tx.status === 'open' ? (
                              <Badge variant="secondary" className="text-[9px] h-4 px-1.5 bg-warning/20 text-warning border-warning/30">Open</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[9px] h-4 px-1.5 bg-success/20 text-success border-success/30">Lunas</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{format(new Date(tx.date), 'HH:mm')}</p>
                        </div>
                        <p className="text-sm font-bold text-primary">{rp(tx.total)}</p>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground truncate">
                          {multiUserEnabled && (
                            <span className="flex items-center gap-0.5">
                              <UserCircle2 className="w-3 h-3" />
                              {cashierName(tx.createdBy)}
                            </span>
                          )}
                          {tx.customerName && <span>👤 {tx.customerName}</span>}
                          {tx.tableNumber && <span>Meja {tx.tableNumber}</span>}
                          {tx.remarks && <span>📝 {tx.remarks}</span>}
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {getTxItems(tx.id).map(it => it.productName).join(', ')}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Detail Sheet */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent side="bottom" className="h-[80vh] rounded-t-2xl max-w-lg md:max-w-xl mx-auto flex flex-col">
          <SheetHeader className="shrink-0">
            <SheetTitle className="text-left">Detail Transaksi</SheetTitle>
          </SheetHeader>
          {selectedTx && (
            <div className="flex-1 overflow-y-auto mt-4 space-y-4 pb-6">
              <div className="bg-muted/50 rounded-xl p-3 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Status</span>
                  <span className={cn('font-semibold', selectedTx.status === 'open' ? 'text-warning' : 'text-success')}>
                    {selectedTx.status === 'open' ? 'Open Bill' : 'Lunas'}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">No. Struk</span>
                  <span className="font-mono font-medium">{selectedTx.receiptNumber}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Tanggal</span>
                  <span>{format(new Date(selectedTx.date), 'dd MMM yyyy, HH:mm', { locale: localeId })}</span>
                </div>
                 <div className="flex justify-between text-xs">
                   <span className="text-muted-foreground">Pembayaran</span>
                   <span>{selectedTx.status === 'open' ? '-' : getPaymentName(selectedTx.paymentMethodId)}</span>
                 </div>
                 {multiUserEnabled && (
                   <div className="flex justify-between text-xs">
                     <span className="text-muted-foreground">Kasir</span>
                     <span className="flex items-center gap-1">
                       <UserCircle2 className="w-3 h-3" />
                       {cashierName(selectedTx.createdBy)}
                     </span>
                   </div>
                 )}
                 {selectedTx.customerName && (
                   <div className="flex justify-between text-xs">
                     <span className="text-muted-foreground">Pelanggan</span>
                     <span>👤 {selectedTx.customerName}</span>
                   </div>
                 )}
                 {selectedTx.tableNumber && (
                   <div className="flex justify-between text-xs">
                     <span className="text-muted-foreground">Meja</span>
                     <span>{selectedTx.tableNumber}</span>
                   </div>
                 )}
                  {selectedTx.remarks && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Catatan</span>
                      <span className="text-right max-w-[60%]">{selectedTx.remarks}</span>
                    </div>
                  )}
                </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Item</p>
                {getTxItems(selectedTx.id).map((item, i) => (
                  <div key={i} className="flex justify-between items-start bg-muted/30 p-2.5 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{item.productName}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {item.quantity} × {rp(item.price)}
                        {item.discountAmount > 0 && ` (diskon ${rp(item.discountAmount)})`}
                      </p>
                      {item.notes && (
                        <p className="text-[10px] text-accent mt-0.5">📝 {item.notes}</p>
                      )}
                    </div>
                    <p className="text-sm font-semibold">{rp(item.subtotal)}</p>
                  </div>
                ))}
              </div>

              <div className="border-t pt-3 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{rp(selectedTx.subtotal)}</span>
                </div>
                {selectedTx.discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-destructive">
                    <span>Diskon</span>
                    <span>-{rp(selectedTx.discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold">
                  <span>Total</span>
                  <span className="text-primary">{rp(selectedTx.total)}</span>
                </div>
                {selectedTx.status !== 'open' ? (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Bayar</span>
                      <span>{rp(selectedTx.paymentAmount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Kembali</span>
                      <span className="text-success font-medium">{rp(selectedTx.change)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Profit</span>
                      <span className="text-success font-medium">{rp(selectedTx.profit)}</span>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-warning italic">Bill belum dibayar</p>
                )}
              </div>

              {selectedTx.status === 'open' ? (
                <Button className="w-full h-11" onClick={() => { setDetailOpen(false); navigate('/cashier'); }}>
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Lanjutkan di Kasir
                </Button>
              ) : (
                <Button className="w-full h-11" onClick={openReceipt}>
                  <ReceiptIcon className="w-4 h-4 mr-2" />
                  Lihat & Cetak Struk
                </Button>
              )}

              <Button
                variant="outline"
                className="w-full h-11 text-destructive border-destructive/30 hover:bg-destructive/5"
                onClick={() => { setRestoreStock(true); setDeleteDialogOpen(true); }}
                disabled={!can('delete_transaction')}
                title={!can('delete_transaction') ? 'Anda tidak punya akses untuk menghapus transaksi' : undefined}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Hapus Transaksi
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Receipt reprint */}
      {selectedTx && (
        <ReceiptDialog
          open={receiptOpen}
          onClose={() => setReceiptOpen(false)}
          transaction={selectedTx}
          items={getTxItems(selectedTx.id)}
          storeSettings={storeSettings}
          paymentMethodName={getPaymentName(selectedTx.paymentMethodId)}
          cashierName={selectedTx.createdBy ? cashierName(selectedTx.createdBy) : undefined}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="max-w-[90vw] rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Transaksi?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Transaksi <span className="font-mono font-semibold">{selectedTx?.receiptNumber}</span> senilai <span className="font-semibold">Rp {selectedTx?.total.toLocaleString('id-ID')}</span> akan dihapus permanen.</p>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="restore-stock"
                    checked={restoreStock}
                    onCheckedChange={(checked) => setRestoreStock(checked === true)}
                  />
                  <label htmlFor="restore-stock" className="text-sm cursor-pointer">
                    Kembalikan stok produk
                  </label>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTransaction} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
