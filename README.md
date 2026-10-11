# Period Tracker

A private, offline period tracker that runs entirely in your browser.
There is no account, no server and no analytics. Everything you log stays on your device.

## Features

- **Today view** shows a ring with all four cycle phases, your cycle day, days until your next period, and what the current phase means.
- **Cycle phases** for menstruation, follicular, ovulation and luteal, each with dates for the current cycle.
- **Heads-up from your patterns** warns about symptoms or moods that came back at the same point in earlier cycles, for example "You might feel sad Tue – Thu".
- **One-tap logging** with "Period started today".
- **Calendar** colored by phase, with logged periods, and lighter colors for predicted days.
- **Daily log** for flow, symptoms, mood and free-text notes.
- **Your own symptom list.** Add and remove symptoms in Settings, or add one straight from the daily log.
- **Insights** with average cycle and period length, cycle range, regularity, cycle history split into phases, what you log in each phase, and your most common symptoms.
- **Backups** you can export to a JSON file and import on another device.
- **Delete all data** in one step.
- Works offline and can be installed to your home screen when served over HTTPS.
- Light and dark themes, and usable at phone width.

## Install on your phone

### Android app

Download the newest APK on your phone:

**https://github.com/ohfab/tracker/releases/latest/download/period-tracker.apk**

1. Open the download. Android asks once to allow installs from your browser. Allow it.
2. Tap **Install**. Google Play Protect may warn about an unknown developer. Choose **Install anyway**.
3. To update later, install a newer APK the same way. Your data stays in place.

Every push to the default branch builds a new APK and publishes it as a GitHub release.

### iPhone, or Android without installing an APK

The web version is published with GitHub Pages at **https://ohfab.github.io/tracker/**.

- **iPhone:** open the link in Safari, tap the share button, then **Add to Home Screen**.
- **Android:** open the link in Chrome, tap the menu, then **Install app**.

It then opens like an app and works offline.

## How predictions work

- Consecutive flow days form one period. A single missed day does not split it. Spotting alone does not start a period.
- Cycle length is measured from one period start to the next. The average uses your six most recent cycles.
- Cycles shorter than 15 days or longer than 90 days are left out of averages, since they usually mean a gap in logging.
- Until two periods are logged, predictions use the defaults in Settings.
- Ovulation is estimated as the luteal phase length, 14 days by default, before the next expected period.
- Phases: menstruation covers the period days. The ovulation phase covers the estimated ovulation day plus one day either side. Follicular lies between them, and luteal runs from after ovulation to the next period.

### Pattern heads-ups

- The app looks at your six most recent completed cycles that have symptoms or moods logged.
- Days before ovulation are compared by cycle day. Later days are compared by days until the next period, because PMS-type changes line up with the coming period.
- A symptom or mood is flagged for one of the next seven days when it was logged within a day of the same point in at least two of those cycles, and in at least half of them.

Predictions are estimates. They are not medical advice and must not be used as contraception.

## Run it

Open `www/index.html` directly in a browser, or serve the folder to enable offline mode:

```sh
npm start            # serves on http://localhost:8080
# or
python3 -m http.server 8080 -d www
```

To host it, publish the `www` folder as-is on any static host. There is no build step.

### Build the Android app yourself

Requires Node 22, JDK 21 and the Android SDK.

```sh
npm ci
npx cap sync android
cd android && ./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```

Builds are signed with `android/keystore/sideload.jks`. The key is in the repository on purpose: it keeps the signature identical across builds, so updates install over the old version.
It is fine for installing the app yourself. For the Play Store, create a private key and pass it through the `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD` environment variables.

## Tests

The cycle math lives in `www/cycle.js` and has unit tests using Node's built-in test runner:

```sh
npm test
```

## Files

| File | Purpose |
| --- | --- |
| `www/index.html` | Page layout |
| `www/styles.css` | Styles and light/dark theme |
| `www/cycle.js` | Cycle grouping, statistics and predictions |
| `www/app.js` | UI, storage, import and export |
| `www/sw.js` | Offline caching of the web version |
| `android/` | Android app project (Capacitor) |
| `assets/` | Source images for the app icon and splash screen |
| `.github/workflows/` | Builds the APK and publishes the web version |
| `test/` | Unit tests for `cycle.js` |

## Privacy

Data is saved in your browser's `localStorage` under the key `period-tracker:v1`.
Clearing site data in your browser erases it, so export a backup regularly.
In the Android app, Android's cloud backup is turned off so health data is never uploaded. Use **Export backup** in Settings before switching phones.
