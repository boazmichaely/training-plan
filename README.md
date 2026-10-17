# trainin-plan

A small local app for following a personal training plan one module at a time.

## Run it

Start the local server with `python server.py`, then open the address it prints (normally `http://localhost:8765/`). The server uses only Python's standard library.

## Plan data

Edit `modules.json` to change the weekly plan. It contains three related lists:

- `days` maps each weekday to a training set.
- `sets` names each day's set and lists its modules by ID.
- `modules` contains the reusable module content. IDs use a continuous `NN-slug` sequence and modules are kept in that order. A module ID can be listed in multiple sets, so common warmups do not need to be duplicated.

The app opens to today's set. The day arrows browse the other sets, and **Today** returns to the current weekday. Module content can include an `image` path relative to this folder and optional `imageAlt` text.

Each set can contain up to five module IDs. Write module instructions in the `instructions` field using Markdown paragraphs, numbered or bulleted lists, **bold**, *italic*, and `inline code`. The app renders list items as real HTML lists, so wrapped lines keep their hanging indent. Raw HTML is displayed as text.

The current daily exercises are realistic stand-ins for checking the layout; they are not the final personal plan. The shared warmup is `01-warmup`, reused by each weekday set.

## Session history

Completed sessions are stored locally in `session-log.json`. Entries keep the date, start time, duration in seconds and `mm:ss`, module ID and name, and the weekday/set ID and name used for that session. The log is excluded from the public repository because it is personal data.

JSON is kept deliberately simple for this personal app. It is easy to edit and sufficient for basic summaries or exporting to a spreadsheet. If reporting later needs more complex filtering or larger histories, the same IDs and fields can move into SQLite without changing the plan's conceptual structure.
