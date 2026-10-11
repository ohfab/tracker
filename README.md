# Period Tracker

A private, offline period tracker that runs entirely in your browser.
There is no account, no server and no analytics. Everything you log stays on your device.

## Features

- **Today view** shows your cycle day, days until your next period, and the current phase.
- **One-tap logging** with "Period started today".
- **Calendar** with logged periods, predicted periods, the estimated fertile window and ovulation day.
- **Daily log** for flow, symptoms, mood and free-text notes.
- **Insights** with average cycle and period length, cycle range, regularity, cycle history and your most common symptoms.
- **Backups** you can export to a JSON file and import on another device.
- **Delete all data** in one step.
- Works offline and can be installed to your home screen when served over HTTPS.
- Light and dark themes, and usable at phone width.

## How predictions work

- Consecutive flow days form one period. A single missed day does not split it. Spotting alone does not start a period.
- Cycle length is measured from one period start to the next. The average uses your six most recent cycles.
- Cycles shorter than 15 days or longer than 90 days are left out of averages, since they usually mean a gap in logging.
- Until two periods are logged, predictions use the defaults in Settings.
- Ovulation is estimated as the luteal phase length, 14 days by default, before the next expected period. The fertile window runs from five days before ovulation to one day after.

Predictions are estimates. They are not medical advice and must not be used as contraception.

## Run it

Open `index.html` directly in a browser, or serve the folder to enable offline mode:

```sh
npm start            # serves on http://localhost:8080
# or
python3 -m http.server 8080
```

To host it, publish the folder as-is on any static host such as GitHub Pages. There is no build step.

## Tests

The cycle math lives in `cycle.js` and has unit tests using Node's built-in test runner:

```sh
npm test
```

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page layout |
| `styles.css` | Styles and light/dark theme |
| `cycle.js` | Cycle grouping, statistics and predictions |
| `app.js` | UI, storage, import and export |
| `sw.js` | Offline caching of the app files |
| `test/` | Unit tests for `cycle.js` |

## Privacy

Data is saved in your browser's `localStorage` under the key `period-tracker:v1`.
Clearing site data in your browser erases it, so export a backup regularly.
