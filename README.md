# vital-crm

A custom dashboard widget for **Zoho CRM**, built for VITAL OP. It embeds directly
inside a CRM Account record and shows that client's open tasks, notes, and
meetings in one place — with quick actions to create/edit tasks, notes, and
meetings (including Microsoft Teams online meetings) without leaving the page.

## How it works

- Single-file app (`index.html`) — vanilla HTML/CSS/JS, no build step, no framework.
- Talks to Zoho directly via the [Zoho CRM Embedded App SDK](https://www.zoho.com/crm/developer/docs/widgets/) (`ZOHO.embeddedApp`, `ZOHO.CRM.API`, `ZOHO.CRM.META`).
- Deployed via **GitHub Pages** off this repo's `main` branch. Zoho CRM's widget
  configuration points at the live GitHub Pages URL — there is no packaged
  extension install step.
- Has a built-in debug console (⚙ DEBUG button, bottom-left) for inspecting
  Zoho field schemas and API responses while developing against Zoho's Events/
  Tasks/Accounts modules.

## Local development

Zoho's "Test Locally" widget option requires the widget to be served over
HTTPS, even on localhost. `dev-server.js` is a minimal static HTTPS server for
this (plain Node, no dependencies).

1. Generate a self-signed cert (once — `cert.pem`/`key.pem` are gitignored, not shared):
   ```sh
   openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 365 -subj "/CN=127.0.0.1"
   ```
2. Start the dev server:
   ```sh
   npm run dev
   ```
   This serves `index.html` at `https://127.0.0.1:5001/index.html`.
3. Open that URL directly in your browser once and accept the self-signed
   certificate warning (Advanced → Proceed), so the browser trusts it before
   Zoho tries to load it in an iframe.
4. In Zoho CRM: **Setup → Developer Hub → Widgets** (or the widget's settings
   in Marketplace/Extensions) → enable **Test Locally** → point it at
   `https://127.0.0.1:5001/index.html`.

This lets you iterate locally without touching the live GitHub Pages
deployment that production CRM users pull from.

### Testing without Zoho CRM (mock mode)

The steps above still require an actual Zoho CRM org and its "Test Locally"
setting to get a working `ZOHO` SDK object — there was previously no way to
exercise the UI at all without that. `mock-zoho-sdk.js` is a local stand-in
for Zoho's embedded-app SDK that implements the same surface `index.html`
calls (`ZOHO.embeddedApp.init/on`, `ZOHO.CRM.API.getAllRecords/
getRelatedRecords/searchRecords/insertRecord/updateRecord`,
`ZOHO.CRM.META.getFields`), backed by a small seeded dataset (3 accounts,
contacts, tasks, notes, and 4 meetings — including one online Teams meeting,
one today, one past-and-not-completed to exercise the "needs recap"
highlighting, and one completed).

**To use it:** open `https://127.0.0.1:5001/index.html` directly in a browser
(not embedded in Zoho — just visit the URL). `index.html` auto-detects it's
running standalone (`localhost`/`127.0.0.1`/`file://`, or a `?mock=1` query
param) and loads `mock-zoho-sdk.js` instead of Zoho's real SDK; a "🧪 מצב
בדיקה" banner at the top confirms mock mode is active. Everything works
normally against the fake data — selecting a client, creating/editing tasks,
notes, and meetings, and the meeting-recap flow. Inserts/updates persist to
`localStorage` so they survive a reload; use the "🔄 אפס נתוני בדיקה" button
(bottom-left) to wipe local test data and reseed.

This is what to use for quick UI iteration and for testing anything that
doesn't depend on Zoho's actual behavior. It is **not** a substitute for a
real "Test Locally" pass before shipping a change, since the mock doesn't
replicate Zoho-specific quirks (real field validation, actual Teams meeting
provisioning, workflow triggers, per-org customizations, real auth/session
behavior). Production (GitHub Pages, embedded in Zoho's iframe) always uses
the real SDK regardless of this — the mock only ever activates when the page
is opened directly, outside Zoho's iframe.

## Online meeting provisioning

Creating a meeting with the "פגישת Microsoft Teams מקוונת" checkbox actually
provisions a real Microsoft Teams link (`$meeting_details.joinmeeting_url`) by
sending, in `saveMeeting()`'s `apiData`:

```js
apiData.$meeting_details = { tool_name: "MicrosoftTeamsMeeting" };
```

This is the *only* thing that triggers provisioning. It was not obvious and
took a long debugging session to find, so the reasoning is captured here in
full:

- `Events.Meeting_Venue__s` / `Meeting_Provider__s` **do not trigger
  provisioning** at all, despite looking like the obvious fields (they're
  the venue/provider picklists shown in Zoho's UI). Setting them via
  `insertRecord`/`updateRecord` gets accepted, but a few seconds later Zoho
  silently reverts `Meeting_Venue__s` to `"Client location"` and clears
  `Meeting_Provider__s` to `null` — no error, no `$meeting_details`, no
  `Online_Meeting_External_UUID__s`. They're read-only *display* fields that
  Zoho derives automatically after a meeting is actually provisioned, not an
  input that causes provisioning.
- `ZOHO.CRM.META.getFields` reports `Meeting_Provider__s`'s only
  `actual_value` as `"MicrosoftTeamsMeeting"` — this looks authoritative but
  is a red herring for API writes. Zoho's own native meeting editor lists
  `"MicrosoftTeamsMeeting"` and `"Microsoft Teams"` as two distinct provider
  entries; selecting `"MicrosoftTeamsMeeting"` there throws "disabled for
  your organization". Neither value provisions anything when sent via the
  public REST API through `Meeting_Provider__s` — the field just isn't the
  mechanism, regardless of which value you send.
- Zoho's native meeting editor provisions the real link through internal,
  session-cookie-authenticated endpoints (`crm.zoho.com/.../
  EditCommonModule.do` and a `phonebridge.zoho.com/meetingbridge/...`
  lookup) that aren't part of the public API and aren't reachable from a
  widget or a Deluge function — there's no way to replicate that path
  programmatically.
- The actual mechanism was found in a Zoho community thread with a working
  PHP sample: provisioning is triggered by sending `$meeting_details` (the
  same field name that's read-only on *read* responses) as an *input* field
  containing `{ "tool_name": "ZoomMeeting" }`. By that naming pattern,
  `"MicrosoftTeamsMeeting"` — the value `getFields` reported as
  `Meeting_Provider__s`'s `actual_value` — turned out to be the correct
  `tool_name`, just in the wrong field. This is confirmed working in this
  org.

If this ever breaks again (e.g. a different provider is added, or Zoho
changes behavior), use the "▶ Trace Meeting Creation" debug button — it
creates an isolated test meeting and polls it at 0/3/6/10/15s, logging
`Meeting_Venue__s`, `Meeting_Provider__s`, `Online_Meeting_External_UUID__s`,
and `$meeting_details` at each step, so you can see exactly when/whether
provisioning actually happened rather than guessing from the UI.

## Meeting summary ingestion

A separate pipeline (not part of this repo) summarizes Teams meetings and
writes the results into a custom Zoho module, **Meeting Summaries**
(module api_name `Meeting_Summaries`, module_name `CustomModule1` — always
address it as `Meeting_Summaries` in API calls). It has a lookup field to
Accounts (field api_name `Account`), so Zoho automatically exposes it as a
related list on the Account page — the widget fetches it the same way it
already does for Tasks/Notes/Events (`RelatedList: "Meeting_Summaries"`,
unconfirmed against a real "Test Locally" pass yet since Zoho's
record-data REST endpoints require full OAuth that couldn't be exercised
from the admin console session used to build this — if a real fetch ever
comes back empty, check this name first via `ZOHO.CRM.META.getFields` or
the debug console).

**Fields** (all confirmed via the CRM fields API at creation time):

| Field label | api_name | Type | Notes |
|---|---|---|---|
| Meeting Summary Name | `Name` | text | Module's built-in primary field — use as the meeting title |
| Meeting Date | `Meeting_Date` | datetime | Denormalized copy of the source Event's `Start_DateTime`, not a live reference |
| Short Summary | `Short_Summary` | text | Shown inline in the widget's Meeting Summaries panel |
| Long Summary | `Long_Summary` | textarea (32000 chars) | Shown behind a "show full summary" disclosure |
| Action Items JSON | `Action_Items_JSON` | textarea (32000 chars) | JSON array of objects — see below |
| Account | `Account` | lookup → Accounts | **Left blank when the meeting can't be matched** — see below |
| Source Event Id | `Source_Event_Id` | text | Plain text copy of the matched Event's `id`, *not* a lookup — used only so the widget can flag a meeting as "already has a summary" without creating a real relationship |

**Matching**: search Events by `Online_Meeting_External_UUID__s` (the real,
read-only field Zoho populates once a Teams meeting is actually
provisioned — see "Online meeting provisioning" above) against the Teams
meeting's UUID. Falls back to `Imported_Teams_Meeting_Id` (see "Importing
an external meeting" below) for meetings that were never provisioned
through this widget at all.

- **Matched** — insert a Meeting Summary record with `Account` set to that
  Event's account and `Source_Event_Id` set to that Event's `id`.
- **Unmatched** — insert the same record with `Account` left blank. It
  will show up in the widget's home-screen "תקצירים ממתינים לשיוך"
  (summaries awaiting assignment) panel until a human picks the right
  client for it from inside the widget.

`Name` and `Meeting_Date` come from the meeting's own calendar/Teams
metadata, not from Claude's output — the pipeline merges the two sides
before inserting the record.

### Mapping Claude's summarization output onto these fields

The pipeline calls Claude to summarize the Teams transcript. Its actual
output shape (confirmed from a real run) is richer than a flat
summary/action-items pair — e.g.:

```json
{
  "summary": "<long narrative paragraph, with <strong>/<em> emphasis>",
  "highlights": ["<bullet point>", "<bullet point>", ...],
  "action_items": [
    { "task": "...", "owner": "...", "deadline": "", "deadline_text": "..." }
  ],
  "exposures": [ { "...": "...domain-specific structured fields..." } ]
}
```

`<strong>`/`<em>` tags in `summary`/`highlights` are preserved on purpose —
the widget's renderer (`sanitizeSummaryHtml()` in `app.js`) escapes
everything else but allows exactly that pair through, so emphasis survives
without opening up any injection risk. Map it onto the three fields like
this:

- **`Short_Summary`** = `highlights[0]` — the single headline point. Keep
  this genuinely short; it's a single-line field.
- **`Long_Summary`** = `summary`, followed by the full `highlights` list
  formatted as bullets. If the output includes any other structured,
  domain-specific section beyond `summary`/`highlights`/`action_items`
  (`exposures` in the example above, but the shape will vary by meeting
  type) — append it as a formatted block at the end of `Long_Summary` too,
  rather than dropping it or inventing a new Zoho field per possible
  extraction type.
- **`Action_Items_JSON`** = `JSON.stringify(action_items)` as-is — store
  the full objects, not just the task text. The widget's
  `processActionItems()` reads `item.task` for the Task's `Subject` and
  folds `item.owner`/`item.deadline_text` into the Task's `Description`
  (it does **not** try to parse `deadline_text` into an actual date —
  that's free text like "tomorrow evening or the day after morning"; the
  Task's `Due_Date` stays the meeting date + 3 days, same as always).

**Deliberately not the pipeline's job**: turning `Action_Items_JSON` into
Tasks. The widget does this itself (`processActionItems()` in `app.js`) —
once for every home-view load (covering the matched case) and immediately
when a human assigns an unmatched summary to a client — so that logic
lives in exactly one place. The field gets cleared to `""` once processed;
an empty value is a safe "nothing pending" signal whether that's because
there were never any items or because they were already turned into
Tasks.

**Why a separate module instead of fields on Events**: summaries are meant
to be a durable, growing per-client history. Fields on the Event record
would be lost if the meeting is later deleted (`deleteMeeting()` already
exists in this app), and a single accumulating text field on the Account
would eventually hit Zoho's ~32K character field cap for an active client.
A dedicated module with one record per summary has neither problem.

## Importing an external meeting

Meetings created directly in Outlook/Teams (not via this widget's "+ פגישה")
have no Zoho Event at all, so the summary pipeline can never match them. The
"+ ייבוא פגישה" button next to it (client Meetings panel) covers this: enter
the subject/start/end and paste the meeting's Teams join link, and it
`insertRecord`s a plain Event — **without** `$meeting_details`, since the
meeting already exists externally and must not trigger Zoho's own
(re-)provisioning.

The pasted link is normalized with `normalizeTeamsJoinUrl()` in `app.js`
before being stored in a new custom Events field, `Imported_Teams_Meeting_Id`
(single-line text) — it extracts just the `meetup-join/<core-id>` segment
(URL-decoded), ignoring host/query-string/tracking-param differences between
however the link was copied. `teams-pipeline`'s `zoho_client.
normalize_teams_join_url()` implements the identical rule in Python (see that
repo's README) — both sides need to stay in sync, since a plain equality
search against Zoho depends on the two normalizing the same way.

An imported meeting has no `Meeting_Venue__s`/`Meeting_Provider__s` (Zoho
would silently revert any manual write to those — see "Online meeting
provisioning" above), so `isOnlineMeeting()` and the meeting-card join-link
rendering (`getJoinUrl()`) both also check `Imported_Teams_Meeting_Id`
directly, and `getJoinUrl()` reconstructs a usable link from it when
`$meeting_details.joinmeeting_url` isn't present.

## Deploying

Push to `main` and enable/refresh GitHub Pages — Zoho CRM will pick up the new
`index.html` on next load (no separate build/package step). The browser can
cache the previous `app.js` though (especially inside Zoho's widget iframe) —
if a change doesn't seem to take effect, fully close and reopen the CRM tab
(a plain refresh doesn't always re-fetch an iframe's cached resources) before
assuming the code itself is wrong.
