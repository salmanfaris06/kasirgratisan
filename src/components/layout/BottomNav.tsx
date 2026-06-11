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
    <nav className="fixed bottom-3 left-4 right-4 z-50 rounded-[2rem] border border-border/70 bg-card/90 shadow-floating backdrop-blur-2xl pb-[env(safe-area-inset-bottom)] ring-1 ring-white/5 md:left-1/2 md:right-auto md:w-[calc(100%-2rem)] md:max-w-6xl md:-translate-x-1/2">
      <div className="flex h-[5rem] items-end justify-around px-2.5 pb-2 md:px-6">
        {navItems.map(({ to, icon: Icon, label, isCta }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex min-w-[54px] flex-col items-center gap-1 transition-[color,transform] duration-150 ease-out active:scale-[0.97] md:min-w-[72px]',
                isCta
                  ? 'relative -top-5'
                  : cn(
                      'rounded-2xl px-2 py-1.5 md:px-3',
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
                    'flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full shadow-[0_0_42px_hsl(var(--primary)/0.42)] transition-transform duration-150 ease-out active:scale-95 md:h-[4.75rem] md:w-[4.75rem]',
                    'bg-primary text-primary-foreground',
                    isActive && 'ring-[6px] ring-primary/20'
                  )}>
                    <Icon className="h-8 w-8 md:h-9 md:w-9" strokeWidth={2.5} />
                  </div>
                  <span className={cn(
                    'mt-1 text-[11px] font-extrabold leading-tight md:text-xs',
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  )}>{label}</span>
                </>
              ) : (
                <>
                  <div className={cn(
                    'flex h-10 w-11 items-center justify-center rounded-2xl transition-[background-color,box-shadow,color] md:h-11 md:w-12',
                    isActive && 'bg-primary/10 shadow-soft ring-1 ring-primary/10'
                  )}>
                    <Icon className="h-5 w-5 md:h-6 md:w-6" strokeWidth={isActive ? 2.5 : 2} />
                  </div>
                  <span className="text-[11px] font-semibold leading-tight md:text-xs">{label}</span>
                </>
              )
            }
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
