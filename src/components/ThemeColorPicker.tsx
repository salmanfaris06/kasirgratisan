import { THEME_COLORS, getThemeHSL } from '@/hooks/use-theme-color';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

interface ThemeColorPickerProps {
  value: string;
  onChange: (hue: string) => void;
}

export default function ThemeColorPicker({ value, onChange }: ThemeColorPickerProps) {
  return (
    <div className="flex flex-wrap gap-3">
      {THEME_COLORS.map(color => {
        const isActive = value === color.hue;
        const hsl = getThemeHSL(color.hue);
        return (
          <button
            key={color.hue}
            type="button"
            aria-label={`Pilih warna tema ${color.name}`}
            aria-pressed={isActive}
            onClick={() => onChange(color.hue)}
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-xl border-2 transition-[border-color,box-shadow,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isActive ? 'scale-110 border-foreground/30 shadow-floating' : 'border-transparent hover:scale-105'
            )}
            style={{ backgroundColor: `hsl(${hsl})` }}
            title={color.name}
          >
            {isActive && <Check className="w-5 h-5 text-white drop-shadow" />}
          </button>
        );
      })}
    </div>
  );
}
