# Execution Log

Snap! loads `src/execution-log.js` and its stylesheet from `snap.html` by
default. Both files are included in the offline cache. New scenes start
with **Blocks only** enabled; imported projects retain their saved choice.
The settings menu contains **Execution Log** beside **Blocks only**. The
log starts enabled and remembers its on/off preference on this browser.

The notebook lists script executions from oldest to newest, in the order
they start. Each cell captures the script before execution, its sprite or
stage, output, and running/completed/stopped/failed status. Reporter
results, report values, say/think messages (including timed messages), and
uncaught errors appear with their originating script. Timed messages are
recorded once. Concurrent scripts retain separate cells. Internal
synchronous evaluations and generic condition polling are excluded;
generic hats are recorded when they actually fire.

Outputs are captured values, so changing a list, image, or script later
does not change its history. Text/numbers/booleans export as text, lists
as JSON where possible (otherwise text), costumes and other images as
PNG or SVG, sounds as WAV, and contexts as XML. Each value has its own
**Export value** button. Capture failures leave a message and do not
interrupt the program. This is an execution/result history, not a trace of
every block or every stage redraw.

- Drag a script thumbnail into the scripting area to restore a copy at
  that position, or click **Restore script** to insert it automatically.
- **Export blocks** saves native Snap! script XML with custom block
  dependencies. **Export block image** saves a PNG of that script.
- **Export all scripts** saves native Snap! sprite-module XML, one sprite
  per execution, in notebook order. Import it into Snap! to recover the
  scripts. Local block dependencies stay with each sprite; global custom
  definitions gain an execution-number suffix so definitions edited
  between runs remain distinct. Captured dependency variables are scoped
  to the exported receiver. Exported scripts are not executed on import.
- **Clear log** releases the history. Existing running processes cannot
  repopulate cleared cells. Execution numbers continue increasing.
- **Hide**, or unchecking **Execution Log**, hides the notebook and stops
  recording new executions. Re-enable it from the settings menu.

The history is in memory for the open project. Opening or creating a
project clears it; switching scenes within a project preserves it. It is
not included in project saves. Export values/scripts before closing the
page to keep them. The entire-log scripts export contains scripts and
dependencies; output values are exported individually.

Implementation hooks live in the extension, delegating to the original
IDE/interpreter methods. Removing its script and stylesheet from the
launcher removes the notebook. The separate default for Blocks only is
set in the `Scene` constructor. No JavaScript-extension permission or
project library import is needed.

Run the behavior checks with `cd tests && npm ci && npx playwright install
chromium && npx playwright test 80-execution-log`. The existing axe scan
also checks the notebook's empty state.
