# Levelling Up — Change Request (v1.1)

Applied on top of the v1 build. Original brief in `SPEC.md`.

## 1. Categories to set up (v1, final)

1. **Career Growth** — project/target-driven, not a daily habit. Use WeeklyGoals and Milestones for this one rather than a recurring daily checklist.
2. **Health** — sleep, nutrition, movement. Daily-task-driven.
3. **Reading/Learning** — daily-task-driven.
4. **Mindset/Discipline** — daily-task-driven.

Don't pre-populate daily tasks per category — keep the "add/edit task" flow front and centre so these get defined by use, not assumed upfront.

## 2. Dashboard needs two panel states

- **Daily-driven panel**: today's checklist, streak indicator, XP bar.
- **Goal-driven panel**: active goals/milestones with progress, no streak indicator, XP bar.

## 3. Daily task logging format

Each daily task completion is a checkbox plus an optional free-text note (not scored, just a log — e.g. "why I skipped it").

```
DailyTask
  ...
  completions: { date: string, note?: string }[]   // was: completedDates: string[]
```

Surface notes on the weekly review screen where relevant.

Implementation note: entries also carry `done` (default `true`) so a note can be
logged for a day the task was skipped.

## 4. Design tokens

Unchanged from `SPEC.md` section 3; already applied in v1.

## 5. Not changing

Platform/PWA approach, IndexedDB storage, export/import backup, XP curve formula.
