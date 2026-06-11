# KasirGratisan

## Project Snapshot
KasirGratisan is a simple single-package React 18 + TypeScript POS app built with Vite, Tailwind CSS, shadcn/ui, Dexie IndexedDB, Vitest, and Capacitor Android.
The app is offline-first: business data lives locally in IndexedDB and new features should not depend on a backend API.
Use nearest `AGENTS.md` files for area-specific guidance:
- Web/PWA app: `src/` -> [src/AGENTS.md](src/AGENTS.md)
- Android wrapper: `android/` -> [android/AGENTS.md](android/AGENTS.md)

## Root Setup Commands
```bash
npm install
npm run dev
npm run build
npm run lint
npm run test
npm run preview
```

Android/Capacitor commands:
```bash
npm run cap:sync
npm run cap:android
npm run cap:run
```

## Universal Conventions
- Keep UI copy in Bahasa Indonesia; this app targets Indonesian UMKM users.
- Preserve offline-first behavior; avoid network/API dependencies unless explicitly required.
- Prefer existing aliases from `components.json`: `@/components`, `@/lib`, `@/hooks`, `@/components/ui`.
- Reuse shadcn/ui components from `src/components/ui/` before adding custom primitives.
- Store money as integer Indonesian Rupiah values; format display with `toLocaleString('id-ID')`.
- Do not introduce new dependencies without a clear reason and package-lock update.

## Security & Secrets
- Never commit secrets, tokens, private keys, production credentials, or real customer data.
- Use `.env.example` for documented variables; do not commit `.env`.
- Treat POS exports/backups as sensitive business data.
- Avoid logging PINs, session data, receipts, customer details, or transaction payloads.

## JIT Index
### Package Structure
- App entry/routing: `src/App.tsx`, `src/main.tsx`
- Layout/navigation: `src/components/layout/`
- Pages/features: `src/pages/`
- Local database/auth/utilities: `src/lib/`
- React hooks: `src/hooks/`
- shadcn/ui components: `src/components/ui/`
- Tests/setup: `src/test/`, `src/**/*.test.ts(x)`
- Capacitor config: `capacitor.config.ts`
- Android native project: `android/`

### Quick Find Commands
```bash
rg -n "useLiveQuery|db\." src
rg -n "can\('|PermissionKey|ALL_PERMISSIONS" src
rg -n "toLocaleString\('id-ID'\)|Intl.NumberFormat" src
rg -n "export default function|function .*\(" src/pages src/components
rg -n "from '@/components/ui" src
find src -name "*.test.ts" -o -name "*.test.tsx"
```

## Definition of Done
Before handing off a change, run the narrowest relevant checks and usually:
```bash
npm run lint && npm run test && npm run build
```
For Android-impacting changes, also run:
```bash
npm run cap:sync
```
Document any checks that could not be run and why.
