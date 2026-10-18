# trainin-plan

A small local app for following a personal training plan.

## Run it

Start the local server with `python server.py`, then open the address it prints (normally `http://localhost:8765/`). The server uses only Python's standard library.

## Plan data

Edit `modules.json` to change the weekly plan. It contains three related lists:

- `days` maps each weekday to a workout.
- `workouts` names each day's workout and lists ordered `steps`. Each step has a `moduleId` and may have a `repeat` count. A workout is the day's collection of tasks; an exercise's **sets × reps** are written in the module instructions.
- `modules` contains the reusable task content. IDs use a continuous `NN-slug` sequence and modules are kept in that order. A module ID can be listed in multiple workouts, so common warmups and exercises do not need to be duplicated.

The app opens to today's workout. The day arrows browse the other workouts, and **Today** returns to the current weekday. Module content can include an `image` path relative to this folder and optional `imageAlt` text. Keep each exercise photo as its own file so it renders at its natural proportions.

Each workout can expand to at most 16 displayed module steps. To repeat a task, set its step's `repeat` count, for example `{ "moduleId": "16-indoor-cardio-a", "repeat": 8 }`. The module pane shows the current round number and total, while the JSON keeps the repeated step compact. Edit `instructions.md` for all module instruction text. Each section starts with a heading containing the exact module ID, such as `## 01-warmup`; write ordinary Markdown beneath it with real line breaks, paragraphs, numbered or bulleted lists, **bold**, *italic*, and `inline code`. The app renders list items as real HTML lists, so wrapped lines keep their hanging indent. Raw HTML is displayed as text. Keep the module IDs in `modules.json` and `instructions.md` in sync.

Cardio workouts place a warm-up, eight repeated interval-round steps, and a cool-down in sequence. The cardio workout description holds the progression toward 12 rounds. Strength is scheduled Friday and Sunday; balance appears three days a week. The plan is a starting point, not a medical assessment.

## Session history

Completed sessions are stored locally in `session-log.json`. Entries keep the date, start time, duration in seconds and `mm:ss`, module ID and name, and the weekday/workout ID and name used for that session. Older log entries that used the former “set” fields remain readable. The log is excluded from the public repository because it is personal data.

JSON is kept deliberately simple for this personal app. It is easy to edit and sufficient for basic summaries or exporting to a spreadsheet. If reporting later needs more complex filtering or larger histories, the same IDs and fields can move into SQLite without changing the plan's conceptual structure.
