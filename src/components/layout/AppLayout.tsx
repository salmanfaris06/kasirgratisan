import { Outlet } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, seedDefaultData } from '@/lib/db';
import { useEffect } from 'react';
import BottomNav from './BottomNav';
import { useThemeColor } from '@/hooks/use-theme-color';
import Onboarding from '@/components/Onboarding';
import LoginScreen from '@/components/LoginScreen';
import { useAuth } from '@/hooks/use-auth';

export default function AppLayout() {
  useThemeColor(); // Apply saved theme color on mount
  const { multiUserEnabled, currentUser, loading } = useAuth();

  useEffect(() => {
    seedDefaultData();
  }, []);

  const storeSettings = useLiveQuery(() => db.storeSettings.toCollection().first());

  // Loading state
  if (storeSettings === undefined || loading) return null;

  // Show onboarding if not done yet
  if (!storeSettings || !storeSettings.onboardingDone) {
    return <Onboarding onComplete={() => { /* Dexie live query will auto-refresh */ }} />;
  }

  // Multi-user mode is on but no one is logged in → show login
  if (multiUserEnabled && !currentUser) {
    return <LoginScreen />;
  }

  return (
    <div className="relative mx-auto min-h-screen max-w-lg overflow-x-hidden bg-background/85 md:max-w-6xl">
      <main className="relative z-10 pb-24">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
