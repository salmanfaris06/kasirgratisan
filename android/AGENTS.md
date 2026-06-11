# Android Wrapper (`android/`)

## Package Identity
This is the Capacitor Android native project for KasirGratisan.
Most product behavior comes from the Vite web bundle in `dist/`; native files should stay minimal unless a Capacitor/Android integration requires changes.

## Setup & Run
From repo root:
```bash
npm run build
npx cap sync android
npm run cap:android
npm run cap:run
```

From `android/`:
```bash
./gradlew assembleDebug
./gradlew test
./gradlew connectedAndroidTest
```
On Windows, use `gradlew.bat` instead of `./gradlew`.

## Patterns & Conventions
- Treat `capacitor.config.ts` as the source of app identity, web output, and plugin settings.
- Keep package/app id aligned with `capacitor.config.ts`: `com.kasirgratisan.app`.
- Native entry point is `android/app/src/main/java/com/kasirgratisan/app/MainActivity.java`; keep it thin unless a plugin requires native code.
- Gradle dependency/version values are centralized in `android/variables.gradle`; avoid scattering versions across files.
- Capacitor-generated or synced files may change after `npx cap sync android`; review diffs before committing.
- Do not edit the generated web assets in Android directly; change `src/`, run `npm run build`, then sync.
- For status bar/splash behavior, update `capacitor.config.ts` first, then run `npx cap sync android`.
- For Bluetooth printing behavior, inspect web/native bridge usage in `src/lib/printer.ts` and relevant Capacitor plugins before editing native config.

## Key Files
- Capacitor config: `../capacitor.config.ts`
- Android app Gradle config: `app/build.gradle`
- Capacitor Gradle config: `app/capacitor.build.gradle`
- Gradle variables: `variables.gradle`
- Native main activity: `app/src/main/java/com/kasirgratisan/app/MainActivity.java`
- Android unit test example: `app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java`
- Android instrumentation test example: `app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java`

## JIT Index Hints
```bash
rg -n "applicationId|namespace|minSdk|targetSdk|version" android
rg -n "com.kasirgratisan.app|MainActivity" android capacitor.config.ts
rg -n "SplashScreen|StatusBar|plugins" capacitor.config.ts
find android/app/src -type f
```

## Common Gotchas
- `npm run cap:sync`, `cap:android`, and `cap:run` run a web build first, which bumps `version.json` via `scripts/bump-version.js`.
- The Android wrapper depends on `dist`; stale builds can make native testing appear broken.
- Keep Android Studio/JDK setup local; do not commit machine-specific SDK paths.
- Validate both PWA/browser and Android flows when changing camera, Bluetooth, splash, status bar, or offline behavior.

## Pre-PR Checks
```bash
npm run build && npx cap sync android && cd android && ./gradlew assembleDebug
```
