import { Home, Package, BarChart3, Settings, ShoppingCart } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/', icon: Home, label: 'Beranda' },
  { to: '/products', icon: Package, label: 'Produk' },
  { to: '/cashier', icon: ShoppingCart, label: 'Kasir', isCta: true },
  { to: '/reports', icon: BarChart3, label: 'Laporan' },
  { to: '/settings', icon: Settings, label: 'Lainnya' },
];

export default function BottomNav() {
  return (
    <nav className="fixed bottom-3 left-3 right-3 z-50 rounded-3xl border border-border/70 bg-card/90 shadow-floating backdrop-blur-xl pb-[env(safe-area-inset-bottom)] md:left-1/2 md:right-auto md:w-[calc(100%-1.5rem)] md:max-w-6xl md:-translate-x-1/2">
      <div className="flex items-end justify-around h-16 px-2 md:px-4">
        {navItems.map(({ to, icon: Icon, label, isCta }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-0.5 min-w-[52px] transition-[color,transform] duration-150 ease-out active:scale-[0.97]',
                isCta
                  ? 'relative -top-4'
                  : cn(
                      'px-2 py-1.5 rounded-xl',
                      isActive
                        ? 'text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    )
              )
            }
          >
            {({ isActive }) =>
              isCta ? (
                <>
                  <div className={cn(
                    'w-14 h-14 rounded-full flex items-center justify-center shadow-glow transition-transform duration-150 ease-out active:scale-95',
                    'bg-primary text-primary-foreground',
                    isActive && 'ring-4 ring-primary/20'
                  )}>
                    <Icon className="w-6 h-6" strokeWidth={2.5} />
                  </div>
                  <span className={cn(
                    'text-[10px] font-bold leading-tight mt-0.5',
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  )}>{label}</span>
                </>
              ) : (
                <>
                  <div className={cn(
                    'flex items-center justify-center w-10 h-7 rounded-full transition-colors',
                    isActive && 'bg-primary/10'
                  )}>
                    <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                  </div>
                  <span className="text-[10px] font-semibold leading-tight">{label}</span>
                </>
              )
            }
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
