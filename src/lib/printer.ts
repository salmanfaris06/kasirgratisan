import { Capacitor } from '@capacitor/core';
import { format } from 'date-fns';
import type { CashierShift, Transaction, StoreSettings, TransactionItemRecord } from './db';

declare global {
  interface Window {
    bluetoothSerial?: {
      isEnabled: (success: () => void, failure: (err: string) => void) => void;
      list: (success: (devices: Array<{ name: string; address: string; id: string }>) => void, failure: (err: string) => void) => void;
      connect: (address: string, success: () => void, failure: (err: string) => void) => void;
      write: (data: string | Uint8Array, success: () => void, failure: (err: string) => void) => void;
      disconnect: (success: () => void, failure: (err: string) => void) => void;
    };
  }
}

export interface BluetoothPrinter {
  name: string;
  address: string;
  id?: string;
}

interface PrintData {
  transaction: Transaction;
  items: TransactionItemRecord[];
  storeSettings: StoreSettings | undefined;
  paymentMethodName: string;
  cashierName?: string;
}

interface ShiftReportPrintData {
  shift: CashierShift;
  storeSettings: StoreSettings | undefined;
  openedByName?: string;
  closedByName?: string;
}

interface ToastLike {
  info: (m: string) => void;
  success: (m: string) => void;
  error: (m: string) => void;
}

const DEFAULT_PRINTER_KEY = 'kg_default_bluetooth_printer';

export const isNativePlatform = (): boolean => {
  return Capacitor.isNativePlatform();
};

export const getDefaultBluetoothPrinter = (): BluetoothPrinter | null => {
  try {
    const value = localStorage.getItem(DEFAULT_PRINTER_KEY);
    return value ? JSON.parse(value) as BluetoothPrinter : null;
  } catch {
    return null;
  }
};

export const setDefaultBluetoothPrinter = (printer: BluetoothPrinter | null): void => {
  try {
    if (printer) {
      localStorage.setItem(DEFAULT_PRINTER_KEY, JSON.stringify(printer));
    } else {
      localStorage.removeItem(DEFAULT_PRINTER_KEY);
    }
  } catch {
    // ignore storage errors
  }
};

export const listPairedBluetoothDevices = async (): Promise<BluetoothPrinter[]> => {
  if (!window.bluetoothSerial) return [];

  return new Promise((resolve, reject) => {
    window.bluetoothSerial?.isEnabled(
      () => {
        window.bluetoothSerial?.list(
          devices => resolve(devices.map(device => ({
            name: device.name,
            address: device.address,
            id: device.id,
          }))),
          err => reject(new Error(err)),
        );
      },
      () => reject(new Error('Bluetooth tidak aktif')),
    );
  });
};

export const getESCPOSData = ({
  transaction,
  items,
  storeSettings,
  paymentMethodName,
  cashierName,
}: PrintData): string => {
  const lines: string[] = [];
  
  lines.push('\x1B\x61\x01'); // Center align
  lines.push(`${storeSettings?.storeName || 'Toko'}\n`);
  if (storeSettings?.address) lines.push(`${storeSettings.address}\n`);
  if (storeSettings?.phone) lines.push(`${storeSettings.phone}\n`);
  lines.push('--------------------------------\n');
  lines.push(`No: ${transaction.receiptNumber}\n`);
  lines.push(`${format(new Date(transaction.date), 'dd/MM/yyyy HH:mm')}\n`);
  if (cashierName) lines.push(`Kasir: ${cashierName}\n`);
  if (transaction.customerName) lines.push(`Pelanggan: ${transaction.customerName}\n`);
  if (transaction.tableNumber) lines.push(`Meja: ${transaction.tableNumber}\n`);
  if (transaction.remarks) lines.push(`Catatan: ${transaction.remarks}\n`);
  lines.push('--------------------------------\n');
  
  lines.push('\x1B\x61\x00'); // Left align
  const rp = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;
  for (const item of items) {
    lines.push(`${item.productName}\n`);
    if (item.notes) lines.push(`  ${item.notes}\n`);
    lines.push(`  ${item.quantity} x ${rp(item.price)}  ${rp(item.subtotal)}\n`);
  }
  
  lines.push('--------------------------------\n');
  lines.push(`Subtotal:  ${rp(transaction.subtotal)}\n`);
  if (transaction.discountAmount > 0) {
    lines.push(`Diskon:   -${rp(transaction.discountAmount)}\n`);
  }
  lines.push(`TOTAL:     ${rp(transaction.total)}\n`);
  lines.push(`Bayar:     ${rp(transaction.paymentAmount)}\n`);
  lines.push(`Kembali:   ${rp(transaction.change)}\n`);
  lines.push('--------------------------------\n');
  lines.push('\x1B\x61\x01'); // Center
  lines.push(`${storeSettings?.receiptFooter || 'Terima kasih!'}\n\n\n`);

  return lines.join('');
};

export const getShiftReportESCPOSData = ({
  shift,
  storeSettings,
  openedByName,
  closedByName,
}: ShiftReportPrintData): string => {
  const lines: string[] = [];
  const rp = (n: number | null | undefined) => `Rp ${(n ?? 0).toLocaleString('id-ID')}`;
  const diff = shift.cashDifference ?? 0;

  lines.push('\x1B\x61\x01'); // Center align
  lines.push(`${storeSettings?.storeName || 'Toko'}\n`);
  if (storeSettings?.address) lines.push(`${storeSettings.address}\n`);
  if (storeSettings?.phone) lines.push(`${storeSettings.phone}\n`);
  lines.push('--------------------------------\n');
  lines.push('LAPORAN TUTUP KASIR\n');
  lines.push(`${shift.code}\n`);
  lines.push('--------------------------------\n');

  lines.push('\x1B\x61\x00'); // Left align
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
  lines.push('\x1B\x61\x01'); // Center align
  lines.push(`Dicetak ${format(new Date(), 'dd/MM/yyyy HH:mm')}\n\n\n`);

  return lines.join('');
};

export const printNativeBluetooth = async (printData: PrintData, toast: ToastLike): Promise<boolean> => {
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
          async (devices) => {
            if (devices.length === 0) {
              toast.error('Tidak ada printer Bluetooth yang dipasangkan (paired). Hubungkan di Pengaturan Android dulu.');
              resolve(false);
              return;
            }

            const printer = devices.find(d => d.address === defaultPrinter.address);
            if (!printer) {
              toast.error(`Printer "${defaultPrinter.name}" tidak terdeteksi. Pastikan printer menyala dan terhubung.`);
              resolve(false);
              return;
            }

            toast.info(`Menghubungkan ke ${printer.name}...`);
            window.bluetoothSerial?.connect(
              printer.address,
              () => {
                toast.info('Mencetak struk...');
                const encoder = new TextEncoder();
                const rawText = getESCPOSData(printData);
                const data = encoder.encode(rawText);

                window.bluetoothSerial?.write(
                  data,
                  () => {
                    toast.success('Struk berhasil dicetak!');
                    window.bluetoothSerial?.disconnect(() => {}, () => {});
                    resolve(true);
                  },
                  (err) => {
                    toast.error(`Gagal mencetak: ${err}`);
                    window.bluetoothSerial?.disconnect(() => {}, () => {});
                    resolve(false);
                  }
                );
              },
              (err) => {
                toast.error(`Koneksi gagal: ${err}`);
                resolve(false);
              }
            );
          },
          (err) => {
            toast.error(`Gagal mendapatkan daftar printer: ${err}`);
            resolve(false);
          }
        );
      },
      () => {
        toast.error('Bluetooth tidak aktif. Silakan aktifkan Bluetooth.');
        resolve(false);
      }
    );
  });
};

export const printNativeShiftReportBluetooth = async (
  printData: ShiftReportPrintData,
  toast: ToastLike,
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
            if (devices.length === 0) {
              toast.error('Tidak ada printer Bluetooth yang dipasangkan (paired). Hubungkan di Pengaturan Android dulu.');
              resolve(false);
              return;
            }

            const printer = devices.find((device) => device.address === defaultPrinter.address);
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

export const printWebBluetoothShiftReport = async (
  printData: ShiftReportPrintData,
  toast: ToastLike,
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
