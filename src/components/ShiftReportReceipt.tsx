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
      const file = new File([blob], `laporan-shift-${shift.code}.png`, { type: 'image/png' });
      const canShareFiles =
        !!navigator.share &&
        (!navigator.canShare || navigator.canShare({ files: [file] }));

      if (!canShareFiles) {
        await handleDownload();
        return;
      }

      await navigator.share({
        title: `Laporan Shift ${shift.code}`,
        text: `Laporan tutup kasir ${storeSettings?.storeName || 'Toko'}`,
        files: [file],
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        toast.error('Gagal membagikan laporan shift');
      }
    }
  };

  const handlePrint = async () => {
    const printData = {
      shift,
      storeSettings,
      openedByName: openedBy?.name,
      closedByName: closedBy?.name,
    };

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
