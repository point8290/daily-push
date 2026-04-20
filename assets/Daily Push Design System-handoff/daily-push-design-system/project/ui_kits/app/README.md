# Daily Push — App UI Kit

Pixel-ish recreations of the live Daily Push web app. Cosmetic only; logic is faked with local state.

## Screens

- `Login.jsx` — email/password, split-toggle sign-in / register
- `GoalSetup.jsx` — goal intake with textarea + quick-pick chips
- `TodayDashboard.jsx` — idle Today view (streak, progress, next node, review card)
- `SessionTimer.jsx` — active study session + confidence rating
- `MapPreview.jsx` — knowledge-map graph with status-coded nodes + edges
- `HistoryView.jsx` — streak stats + 90-day heatmap
- `TopNav.jsx` — shared dark nav (slate-900 + sky-400 active)
- `index.html` — click-through combining all screens

## Run

Open `index.html` — use the floating switcher at the bottom to jump between screens.

## Fidelity notes

- Copy is lifted directly from the codebase.
- Status colors (done/avail/review/locked) match the live `Map.tsx` palette exactly.
- Icons are currently inline SVG / unicode (matches production); swap for Lucide when the icon decision is confirmed.
