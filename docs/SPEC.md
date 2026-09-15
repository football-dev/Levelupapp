# Levelling Up — Project Spec

A personal self-improvement app, RPG-styled, running as an installed web app on iPhone.

## 1. Goal

Track custom life categories (e.g. Coaching, Fitness, Personal) as RPG-style stats. Each category earns XP from daily check-ins and weekly reviews, levels up over time, and tracks goals/milestones and streaks. Single user, no login, no backend required.

## 2. Platform decision

Build as a PWA (Progressive Web App): HTML/CSS/JS, installed via Safari's "Add to Home Screen," running full-screen with no browser chrome.

Trade-offs to accept going in:
- No reliable push notifications on iOS PWAs. Skip notification-based reminders for v1.
- iOS can clear local storage after ~7 days of not opening the app (Safari's ITP policy). Mitigate with: (a) an install prompt that ensures it's opened as a *standalone* installed app (not a Safari tab, which is more protected), and (b) a manual export/import (JSON file) as a backup, built in from day one, not bolted on later.
- No backend means no cross-device sync. If that's wanted later, the data model below should still translate cleanly to a small sync backend (e.g. Supabase) — flagged in section 8.

## 3. Design direction

Reference points: lvluplife.app and Habitica (gamified habit trackers), plus a Mario / Animal Crossing cozy-game feel. Note: don't lift actual Nintendo assets, fonts, or characters — those are copyrighted. The brief is borrowing the *vibe* (chunky, warm, cheerful, tactile game UI), not the IP.

**Colour** — warm and saturated rather than the flat SaaS palette:
- `#7EC8E3` sky blue — background/base
- `#8FD14F` grass green — primary accent, positive actions
- `#FFC93C` sunny yellow — XP bars, highlights, level-up state
- `#F2784B` coral — streaks, urgent/attention states
- `#5C4033` wood brown — text, borders, panel outlines
- `#FFF8EC` warm cream — card/panel fill

**Type** — one rounded, chunky display face for headings and numbers (level, XP counts) that reads as "game UI" without being an illegible pixel font; one plain, highly legible sans for body text (task lists, settings). Big level numbers and XP totals are a legitimate place for a bold display treatment here, since the content really is game-stat data.

**Layout** — panels, not flat cards. Thick (3–4px) rounded borders in wood-brown around each category panel, like a game dialogue box, with a subtle drop shadow for a "sitting above the background" feel rather than the generic soft grey SaaS shadow. XP bars are chunky and segmented (visible notches per 10%), not thin gradient slivers. Dashboard is a vertical stack of category panels below the headline player-level panel — no dense grid, this should feel like a cosy game menu, not a data table.

**Principles**
- One moment of real delight: the level-up screen. A short celebratory animation/sound-free visual burst when a category or the player levels up — this is the "boldness spent in one place," everything else stays calm.
- Icons are simple, flat, rounded (fruit, tools, dumbbells, books) rather than line icons — matches the Animal Crossing warmth better than a minimal icon set would.
- Streak indicators as a small flame or stack of icons next to the panel title, not a separate stat block.
- Avoid pixel-perfect 8-bit styling (that's Habitica's specific look) — aim for the rounder, friendlier Animal Crossing register instead, since it's the better fit for a "levelling up my life" tone rather than a dungeon-crawl tone.

## 4. Tech stack recommendation

- Vanilla HTML/CSS/JS, or Vite + vanilla JS/TypeScript if you want build tooling. No need for React for something this contained — it adds complexity without much payoff for a single-user local-state app.
- Storage: `IndexedDB` (via a tiny wrapper like `idb`) rather than `localStorage`. Same iOS eviction risk applies to both, but IndexedDB handles larger/structured data better as this grows.
- Manifest: `manifest.json` + apple-specific meta tags for full-screen standalone mode and home screen icon.
- No service worker needed for v1 unless offline caching of the shell matters (it will — add a minimal one so the app opens instantly with no network).
- Hosting: a static host. GitHub Pages or Cloudflare Pages both work and are free; Cloudflare Pages is the faster/more reliable option and has an Australian presence in its edge network.

## 5. Data model

```
Category
  id, name, colour, icon (emoji), createdAt
  totalXP, level (derived from totalXP)
  streakCount, lastActivityDate

DailyTask (belongs to a Category)
  id, categoryId, title, xpValue
  completedDates: string[]  // ISO dates

WeeklyGoal (belongs to a Category)
  id, categoryId, title, xpValue
  weekOf: string            // ISO date, Monday of the week
  completed: boolean

Milestone (belongs to a Category)
  id, categoryId, title, targetLevel, achieved: boolean, achievedAt

AppState
  categories: Category[]
  dailyTasks: DailyTask[]
  weeklyGoals: WeeklyGoal[]
  milestones: Milestone[]
  lastOpened: string
```

## 6. XP and levelling

- Per-category level: `xpForLevel(n) = 50 * n^1.5`, rounded. Cumulative, so level-up happens when `totalXP` crosses the threshold for the next level.
- Daily task completion: award its `xpValue` once per day per task (no double-counting if tapped twice).
- Weekly review: a dedicated weekly screen lists that week's goals; completing each awards its `xpValue`, plus a small flat completion bonus (e.g. +20 XP) if all goals for the week are done, to reward consistency over individual wins.
- Streaks: increments when a category has at least one daily task completed on consecutive days; resets on a missed day. Store `streakCount` and `lastActivityDate` per category, recalculated on load.
- Overall "Player Level": sum of XP across all categories, run through the same curve, shown on the home dashboard as the headline stat.

## 7. Screens

1. **Dashboard** — overall level and XP bar, then a category panel per category showing level, XP bar, streak. Tapping a panel opens category detail. Empty state (no categories yet) prompts creating the first one.
2. **Category detail** — today's daily tasks as a checklist, this week's goals, milestones list, streak indicator. Edit/delete task and goal from here.
3. **Add/edit category** — name, colour, icon.
4. **Weekly review** — triggered manually or auto-prompted once a new week starts; shows last week's goals, lets you tick completions, shows XP earned, lets you set next week's goals.
5. **Settings** — manage categories, export data to JSON, import from JSON, reset app.

## 8. Build phases (for Claude Code)

1. Static shell: manifest, icons, meta tags, confirm standalone install works on iPhone.
2. Data layer: IndexedDB wrapper, CRUD for categories/tasks/goals/milestones, XP/level calculation functions (unit-testable, no UI dependency).
3. Dashboard + category detail screens, wired to real data, using the design tokens in section 3.
4. Daily check-in flow and streak logic.
5. Weekly review flow.
6. Export/import (JSON backup) — do this before calling v1 done, given the storage-eviction risk above.
7. Polish: level-up celebration moment, offline shell caching, empty states, install prompt copy.

Future (not v1): milestones/achievements screen with celebration state; optional backend sync if cross-device access becomes a priority.
