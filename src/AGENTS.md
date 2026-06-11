# Web/PWA App (`src/`)

## Package Identity
This folder contains the React 18 + TypeScript POS application for PWA/web and the web bundle used by Capacitor Android.
State is mostly local React state plus reactive IndexedDB queries through Dexie and `dexie-react-hooks`.

## Setup & Run
From repo root:
```bash
npm run dev
npm run lint
npm run test
npm run test:watch
npm run build
```
The dev server runs on `http://localhost:8080` per `vite.config.ts`.

## Patterns & Conventions
- Pages live in `src/pages/`; copy page-level patterns from `src/pages/Cashier.tsx`, `src/pages/Products.tsx`, and `src/pages/Settings.tsx`.
- App shell and route-gated layout live in `src/components/layout/AppLayout.tsx`; keep bottom navigation intact when showing locked/empty states.
- Use Dexie live data via `useLiveQuery()` as in `src/pages/Cashier.tsx` and `src/components/layout/AppLayout.tsx`.
- Central database schema, table interfaces, seed data, and migration path live in `src/lib/db.ts`; update migrations carefully when changing persisted shapes.
- Use soft-delete fields (`isDeleted`, `deletedAt`) for master data, matching `Product`, `Category`, `Supplier`, and `Customer` in `src/lib/db.ts`.
- IndexedDB booleans that need indexing are often stored as `0 | 1`; follow `isDeleted`/`isActive` patterns in `src/lib/db.ts`.
- Gate sensitive actions/UI with `const { can } = useAuth()` from `src/hooks/use-auth.tsx` and render `src/components/LockedPage.tsx` when blocked.
- Permission keys are defined in `PermissionKey` and `ALL_PERMISSIONS` in `src/lib/db.ts`; update both when adding a permission.
- Keep hook ordering valid: compute permission gates after hooks; do not return before `useLiveQuery()`/state hooks. See `src/pages/Cashier.tsx` permission gate pattern.
- Use shadcn/ui primitives from `src/components/ui/` and `cn()` from `src/lib/utils.ts` for class composition.
- Use `toast` from `sonner` for user feedback, as in `src/pages/Cashier.tsx`.
- Monetary values are integer Rupiah; display with Indonesian formatting (`toLocaleString('id-ID')`).
- For images/logos/product photos, reuse compression helpers in `src/lib/image-utils.ts` instead of storing large raw images.
- For receipt/printing behavior, inspect `src/components/Receipt.tsx` and `src/lib/printer.ts` before changing Bluetooth or export flows.
- For PWA install behavior, inspect `src/hooks/use-pwa-install.ts` and `vite.config.ts`.

## Key Files
- App/root routing: `src/App.tsx`
- Entry point: `src/main.tsx`
- Global CSS and design tokens: `src/index.css`
- DB schema/migrations/seed: `src/lib/db.ts`
- Auth/session/PIN helpers: `src/lib/auth.ts`
- Auth provider/hook: `src/hooks/use-auth.tsx`
- POS cashier flow: `src/pages/Cashier.tsx`
- Product CRUD: `src/pages/Products.tsx`
- Settings/master data: `src/pages/Settings.tsx`
- Reports/export: `src/pages/Reports.tsx`, `src/lib/export-report.ts`
- Receipt and printing: `src/components/Receipt.tsx`, `src/lib/printer.ts`
- Test setup: `src/test/setup.ts`

## JIT Index Hints
```bash
rg -n "interface .*|type .*" src/lib/db.ts
rg -n "version\([0-9]+\)\.stores|upgrade\(" src/lib/db.ts
rg -n "useLiveQuery\(" src/pages src/components src/hooks
rg -n "can\('|useAuth\(" src/pages src/components
rg -n "toast\.(success|error|message)" src
rg -n "toLocaleString\('id-ID'\)" src
rg -n "Receipt|print|Bluetooth|ESC" src
rg -n "describe\(|it\(" src
find src/components/ui -maxdepth 1 -type f
```

## Common Gotchas
- The app must work fully offline; do not add server-only flows for core POS data.
- `useAuth().can()` returns `true` in legacy/single-user mode; owner/staff checks only matter when multi-user is enabled.
- Dexie schema changes require preserving old versions for existing users; do not collapse migrations in `src/lib/db.ts`.
- `npm run build` bumps `version.json` via `scripts/bump-version.js`; expect that file to change after builds.
- Camera/barcode/PWA behavior may differ between browser PWA and Android APK; check `src/components/BarcodeScanner.tsx` plus Capacitor config before changing scanner flows.
- Android uses the built `dist` web bundle; web changes can affect APK behavior even without editing `android/`.

## Testing
- Unit/component tests use Vitest + jsdom per `vitest.config.ts`.
- Global test setup is `src/test/setup.ts`.
- Existing example test: `src/test/example.test.ts`.
- Add tests as `src/**/*.{test,spec}.{ts,tsx}`.

## Pre-PR Checks
```bash
npm run lint && npm run test && npm run build
```
