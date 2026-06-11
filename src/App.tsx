import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { checkVersion } from "@/lib/version-check";
import { initAnalytics } from "@/lib/analytics";
import { Capacitor } from "@capacitor/core";
import { StatusBar } from "@capacitor/status-bar";
import { AuthProvider } from "@/hooks/use-auth";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import { Loader2 } from "lucide-react";
import AppLayout from "./components/layout/AppLayout";
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Cashier = lazy(() => import("./pages/Cashier"));
const Products = lazy(() => import("./pages/Products"));
const Reports = lazy(() => import("./pages/Reports"));
const Settings = lazy(() => import("./pages/Settings"));
const SupplierPage = lazy(() => import("./pages/Supplier"));
const CustomersPage = lazy(() => import("./pages/Customers"));
const StockInPage = lazy(() => import("./pages/StockIn"));
const StockOutPage = lazy(() => import("./pages/StockOut"));
const TransactionHistory = lazy(() => import("./pages/TransactionHistory"));
const StockReport = lazy(() => import("./pages/StockReport"));
const UsersPage = lazy(() => import("./pages/Users"));
const ExpensesPage = lazy(() => import("./pages/Expenses"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card/80 px-4 py-3 text-sm text-muted-foreground shadow-soft backdrop-blur-sm">
        <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
        <span>Memuat halaman…</span>
      </div>
    </div>
  );
}

function LazyRoute({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<RouteFallback />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

const App = () => {
  useEffect(() => {
    checkVersion();
    initAnalytics();

    if (Capacitor.isNativePlatform()) {
      StatusBar.setOverlaysWebView({ overlay: false }).catch(err => {
        console.warn("Gagal mengatur StatusBar overlay:", err);
      });
      document.documentElement.classList.add('is-native');
    }
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <AuthProvider>
              <AnalyticsTracker />
              <Routes>
                <Route element={<AppLayout />}>
                  <Route path="/" element={<LazyRoute><Dashboard /></LazyRoute>} />
                  <Route path="/cashier" element={<LazyRoute><Cashier /></LazyRoute>} />
                  <Route path="/products" element={<LazyRoute><Products /></LazyRoute>} />
                  <Route path="/reports" element={<LazyRoute><Reports /></LazyRoute>} />
                  <Route path="/settings" element={<LazyRoute><Settings /></LazyRoute>} />
                  <Route path="/supplier" element={<LazyRoute><SupplierPage /></LazyRoute>} />
                  <Route path="/customers" element={<LazyRoute><CustomersPage /></LazyRoute>} />
                  <Route path="/stock-in" element={<LazyRoute><StockInPage /></LazyRoute>} />
                  <Route path="/stock-out" element={<LazyRoute><StockOutPage /></LazyRoute>} />
                  <Route path="/history" element={<LazyRoute><TransactionHistory /></LazyRoute>} />
                  <Route path="/stock-report" element={<LazyRoute><StockReport /></LazyRoute>} />
                  <Route path="/users" element={<LazyRoute><UsersPage /></LazyRoute>} />
                  <Route path="/expenses" element={<LazyRoute><ExpensesPage /></LazyRoute>} />
                </Route>
                <Route path="*" element={<LazyRoute><NotFound /></LazyRoute>} />
              </Routes>
              </AuthProvider>
            </BrowserRouter>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
