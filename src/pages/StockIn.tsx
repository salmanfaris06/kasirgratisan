import { useLiveQuery } from 'dexie-react-hooks';
import { db, isStockManaged } from '@/lib/db';
import { useState } from 'react';
import { ArrowDownToLine, Plus, ChevronLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import LockedPage from '@/components/LockedPage';

export default function StockInPage() {
  const { currentUser, can } = useAuth();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [productId, setProductId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('all');

  const stockIns = useLiveQuery(() => db.stockIns.orderBy('date').reverse().toArray());
  const products = useLiveQuery(() => db.products.where('isDeleted').equals(0).toArray());
  const suppliers = useLiveQuery(() => db.suppliers.where('isDeleted').equals(0).toArray());

  if (!can('manage_stock_inout')) {
    return <LockedPage title="Stock In" permissionLabel="Stock In / Stock Out" />;
  }

  const filtered = stockIns?.filter(si =>
    filterSupplier === 'all' || si.supplierId === Number(filterSupplier)
  ) ?? [];

  const getProductName = (pid: number) => products?.find(p => p.id === pid)?.name ?? '-';
  const getSupplierName = (sid: number) => suppliers?.find(s => s.id === sid)?.name ?? '-';

  const openAdd = () => {
    setProductId(''); setSupplierId(''); setQuantity(''); setBuyPrice(''); setNotes('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const qty = Number(quantity);
    const price = Number(buyPrice);
    if (!productId || !supplierId || qty <= 0 || price <= 0) {
      toast.error('Lengkapi semua field');
      return;
    }

    const product = products?.find(p => p.id === Number(productId));
    if (!product) return;

    // Save stock in record
    await db.stockIns.add({
      productId: Number(productId),
      supplierId: Number(supplierId),
      quantity: qty,
      buyPrice: price,
      totalPrice: qty * price,
      date: new Date(),
      notes: notes.trim(),
      createdBy: currentUser?.id,
    });

    // Calculate new weighted average HPP
    const oldStock = product.stock;
    const oldHpp = product.hpp;
    const newStock = oldStock + qty;
    const newHpp = newStock > 0 ? ((oldStock * oldHpp) + (qty * price)) / newStock : price;

    // Save HPP history
    await db.hppHistory.add({
      productId: product.id!,
      oldHpp,
      newHpp,
      source: 'stock_in',
      date: new Date(),
    });

    // Update product stock and HPP
    await db.products.update(product.id!, {
      stock: newStock,
      hpp: Math.round(newHpp),
      updatedAt: new Date(),
    });

    toast.success(`Stok ${product.name} bertambah ${qty}. HPP: Rp ${Math.round(newHpp).toLocaleString('id-ID')}`);
    setDialogOpen(false);
  };

  return (
    <div className="space-y-4 px-4 pb-4 pt-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Link to="/settings" className="mt-1 shrink-0">
            <Button variant="ghost" size="icon" aria-label="Kembali ke pengaturan" className="h-8 w-8 rounded-full"><ChevronLeft className="h-4 w-4" /></Button>
          </Link>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-success/80">Stok Masuk</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-extrabold tracking-tight">
              <ArrowDownToLine className="h-5 w-5 text-success" />
              Stock In
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">Catat pembelian dan update HPP rata-rata produk.</p>
          </div>
        </div>
        <Button size="sm" onClick={openAdd} className="h-10 gap-1.5 rounded-full px-4 shadow-glow">
          <Plus className="h-4 w-4" /> Tambah
        </Button>
      </div>

      <Card className="border-border/70 bg-card/80 shadow-soft backdrop-blur-sm">
        <CardContent className="p-2.5">
          <Select value={filterSupplier} onValueChange={setFilterSupplier}>
            <SelectTrigger className="h-10 border-transparent bg-background/70"><SelectValue placeholder="Filter Supplier" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Supplier</SelectItem>
              {suppliers?.map(s => <SelectItem key={s.id} value={s.id!.toString()}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <p className="text-xs font-medium text-muted-foreground">{filtered.length} catatan</p>

      {filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border/80 bg-card/60 px-6 py-12 text-center shadow-soft">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10 text-success">
            <ArrowDownToLine className="h-7 w-7" />
          </div>
          <p className="text-sm font-semibold">Belum ada data stock in</p>
          <p className="mt-1 text-xs text-muted-foreground">Tambahkan catatan pembelian untuk memperbarui stok dan HPP.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map(si => (
            <Card key={si.id} className="border-border/70 shadow-soft transition-shadow hover:shadow-card">
              <CardContent className="p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold">{getProductName(si.productId)}</h3>
                    <p className="text-xs text-muted-foreground">dari {getSupplierName(si.supplierId)}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-xs font-medium bg-success/10 text-success px-2 py-0.5 rounded">+{si.quantity}</span>
                      <span className="text-xs text-muted-foreground">@ Rp {si.buyPrice.toLocaleString('id-ID')}</span>
                    </div>
                    {si.notes && <p className="mt-1 line-clamp-2 text-xs italic text-muted-foreground">{si.notes}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">{format(new Date(si.date), 'dd MMM yy', { locale: id })}</p>
                    <p className="text-sm font-bold mt-1">Rp {si.totalPrice.toLocaleString('id-ID')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[95vw] rounded-2xl sm:max-w-md">
          <DialogHeader className="border-b border-border/70 pb-3 text-left"><DialogTitle>Tambah Stock In</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Produk *</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Pilih produk" /></SelectTrigger>
                <SelectContent>{products?.filter(p => isStockManaged(p)).map(p => <SelectItem key={p.id} value={p.id!.toString()}>{p.name} (stok: {p.stock})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Supplier *</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Pilih supplier" /></SelectTrigger>
                <SelectContent>{suppliers?.map(s => <SelectItem key={s.id} value={s.id!.toString()}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Jumlah *</Label>
                <Input name="stock-in-quantity" autoComplete="off" type="number" inputMode="numeric" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="10" className="h-11" />
              </div>
              <div className="space-y-1.5">
                <Label>Harga Beli/Unit *</Label>
                <Input name="stock-in-buy-price" autoComplete="off" type="number" inputMode="numeric" value={buyPrice} onChange={e => setBuyPrice(e.target.value)} placeholder="5000" className="h-11" />
              </div>
            </div>
            {quantity && buyPrice && (
              <div className="bg-muted/50 p-3 rounded-xl text-sm">
                <span className="text-muted-foreground">Total: </span>
                <span className="font-bold">Rp {(Number(quantity) * Number(buyPrice)).toLocaleString('id-ID')}</span>
              </div>
            )}
            <div className="space-y-1.5"><Label>Catatan</Label><Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opsional" className="h-11" /></div>
            <Button className="w-full h-12 text-base font-semibold" onClick={handleSave}>Simpan Stock In</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
