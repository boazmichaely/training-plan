# training-plan

A small local app for following a personal training plan.

## Browser demo

Try the app without installing anything: [open the training plan](https://boazmichaely.github.io/training-plan/). The demo is hosted publicly and runs in your browser. The training plan and images are visible to anyone who visits the site.

## Concepts

A **workout** is a day's training session and contains an ordered list of **modules**. Each module is one task, such as a warm-up or exercise, and can be reused in multiple workouts. A module may contain timed **steps**, such as the movements in an interval. The app displays the current module and, when it has steps, highlights and times the active step.

## Run it

Start the local server with `python server.py`, then open the address it prints (normally `http://localhost:8765/`).
The server uses only Python's standard library.

Debug mode:  open `http://localhost:8765/?debugTimer=1`. Timed steps run at one-tenth duration (30 seconds becomes 3 seconds).
Remove the query flag to use normal timings.

## Plan data

Edit `modules.json` to change the weekly plan. It contains three related lists:

- `days` maps each weekday to a workout.
- `workouts` names each day's workout and lists ordered modules. Each reference has a `moduleId` and may have a `repeat` count. Exercise **sets × reps** are written in the module instructions.
- `modules` contains module content. IDs use a continuous `NN-slug` sequence and modules are kept in that order.

The app opens to today's workout. The header groups the previous/next day arrows and **Today** button beside the weekday. Arrows browse other days; **Today** returns to the current day and is disabled when you are already there. Images are optional: add an `image` path relative to this folder and optional `imageAlt` text to a module or step. A step image appears while that step is active; otherwise the module image is used. Keep each exercise photo as its own file so it renders at its natural proportions.

Each workout can list at most 16 modules. To repeat one, set its reference's `repeat` count, for example `{ "moduleId": "16-indoor-cardio-a", "repeat": 8 }`. In `modules.json`, timed steps have a `type` (`movement` or `recovery`), label, duration in seconds, and short cue. The app counts down each step and advances automatically. The step cards provide the cues during timed modules; use `instructions.md` for guidance that applies to the whole module. Choosing another module while one is active stops its timer and switches to the selected module.

In `instructions.md`, start each section with its exact module ID, such as `## 01-warmup`. Write ordinary Markdown beneath it with real line breaks, paragraphs, numbered or bulleted lists, **bold**, *italic*, and `inline code`. Wrapped list items keep their hanging indent. Raw HTML is displayed as text. Keep the module IDs in `modules.json` and `instructions.md` in sync.

The cardio plan places a warm-up, repeated interval module, and cool-down in sequence. Its interval modules currently use six 30-second steps: five brisk movement choices and an easy march. Pause and resume preserve the current step. Progression guidance belongs in the workout description.
Strength is scheduled Friday and Sunday; balance appears three days a week. The plan is a starting point, not a medical assessment.

## Timer and privacy
The timer runs in your browser and is not saved. **Start** begins the module clock; **Done** stops it and moves to the next module.
Interval steps count down, highlight the active movement, and advance automatically.
No dates, start times, durations, completed rounds, or session history are recorded or sent to the server.
The server only reads plan data and serves static files.


## Access from another device
By default, `python server.py` listens only on this computer (`localhost`).
To let devices on your trusted home Wi-Fi access the app, run `python server.py --lan`.
It prints the address to open on the other device.
If Windows Firewall asks, allow Python on **Private networks only**. Do not configure router port forwarding.

LAN mode has no sign-in: anyone on the network can view the training plan and its images.
Use it only on a trusted private network.
