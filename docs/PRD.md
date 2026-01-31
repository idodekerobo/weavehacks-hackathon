# PRD — Photos-as-Intent Agent (macOS + iOS)

## Summary
Build a **self-hosted, privacy-first** agent that lives in your Photos library and turns “things you screenshot or photograph” into **organized intent** and **completed actions**.

The product has two consumer apps:
- **macOS app (Home Base)**: the user’s control center that connects to Apple Photos, **automatically analyzes existing images**, starts a secure tunnel, and runs **local models on Mac Silicon** for the core “photos → intent” pipeline.
- **iOS app (Companion)**: captures new intent as it happens. After onboarding, it **uploads new photos to the local API via the tunnel endpoint** for analysis + enrichment, and provides fast search + approvals/HITL for actions.

The flagship skill is **Flyer → RSVP → Calendar** with a human-in-the-loop approval step. Web actions are executed via **Browserbase**. The agent is observable and debuggable end-to-end via **Weave**. Work orchestration/state uses **Redis**.

Nice-to-have: voice approvals using **Daily/Pipecat** (via Modal-hosted Python functions). Extra bonus: a **Marimo** “mission control” dashboard.

---

## Goals
- **Consumer value**: Help users capture real-world intent from images (flyers, posters, event screenshots) and complete the workflow (find canonical event page → RSVP → add to calendar) with minimal friction.
- **Privacy by default**: The system is self-hosted and runs primarily on the user’s Mac; sensitive workflows use approvals before any account actions.
- **Trustworthy automation**: Every automated step is explainable and reviewable (what was detected, where it came from, what action will be taken).
- **Hackathon strength**: Make sponsor tooling central and *visible* in the product:
  - **Weave**: traces + evaluations + replayability as the core debugging and iteration loop.
  - **Browserbase**: real web execution (not just scraping) with Live View and recordings.
  - **Redis**: real agent orchestration/state, not just “we installed Redis”.

## Non-goals (for hackathon scope)
- Building a full general assistant for all photo types.
- Fully automatic purchases/RSVPs without user approval.
- Heavy “train new model weights” loop (finetuning can be a stretch goal; focus on prompt/router improvement + eval-driven iteration).

---

## Target users & Jobs To Be Done
### Primary persona: Busy, social, screenshot-heavy user
- **JTBD**: “When I screenshot an event flyer, I want it on my calendar (and ideally RSVP’d), without me typing anything.”

### Secondary persona: Hackathon judge / technical evaluator
- **JTBD**: “Show me this is a real agent with tool use, measurable improvement, and debuggable runs.”

---

## Core product concept
### “Photos are intent”
Users already record their intent via images:
- screenshots of flyers, IG stories, emails, event pages
- photos of posters on a wall

The product recognizes these patterns, enriches them on the web, and executes the final step with approval.

---

## System overview (product-level, not deep implementation)
### Components
- **macOS app (Swift)**: consumer UI for setup + status + approvals + trust controls.
- **iOS app (Swift)**: consumer UI for search + approvals + notifications; uploads newly captured photos to the Mac via the tunnel.
- **Local Node server (TypeScript, Express)**: runs locally on the Mac; orchestrates ingestion, jobs, and tool calls. For each image, it produces a structured “intent document”, including:
  - **Date taken** (from photo metadata)
  - **Location** (from EXIF / Photos metadata when available)
  - **Text via OCR** (from local vision models)
  - **Image embedding** (for similarity search / clustering / dedupe)
- **Redis**: queues, state machine, dedupe, caching (optional: vector memory if Redis Stack is used).
- **Browserbase**: remote browser sessions for event discovery, verification, and RSVP form completion.
- **Weave**: observability and tracing for each run (image → intent → web steps → approval → outcome).

Nice-to-have additions:
- **Daily/Pipecat**: voice HITL approvals.
- **Marimo**: admin/dashboard UI for judges + dev iteration.
- **Modal**: serverless Python functions for GPU / Python-first sponsor tools.

### “Intent document” (core product artifact)
Every image becomes an “intent document” that the system can search, cluster, and act on. At minimum it contains:
- Image reference (photo library id and/or hashed id)
- **Timestamp** (date taken)
- **Location** (if available)
- **OCR text** (if any)
- **Embedding** (for similarity search and dedupe)
- Detected intent labels (e.g., “event flyer”) + confidence

---

## Consumer experience

## macOS app — “Home Base” (required)
The macOS app is the user’s primary entry point. It must feel like a **local, private appliance**:

### First-run setup (happy path)
1. **Welcome + privacy promise**
   - Clear statement: “Your Photos are analyzed locally on your Mac. Web actions require approval.”
2. **Permissions**
   - Photos library access (read).
   - Notifications.
3. **Start local agent**
   - One-click: “Start Agent”
   - Automatically connects to the user’s Photos library and begins analyzing **existing images** in the background.
4. **Tunnel setup**
   - One-click: “Enable iPhone Access”
   - Creates a secure tunnel endpoint (ngrok or Cloudflare Tunnel) so the iOS app can talk to the local server when needed.
5. **Model loading**
   - Shows a simple readiness checklist: “Models loaded (Mac Silicon)”, “Worker running”, “Tunnel online”.

### Home Base main screen
Designed for clarity and control:
- **Status card**
  - Agent: Running/Stopped
  - Tunnel: Online/Offline + endpoint
  - Queue: \(N\) pending / \(M\) running / \(K\) waiting for approval
- **Scan controls**
  - “Analyze last 30 days”
  - “Analyze all photos” (with time estimate)
  - “Pause analysis”
- **Approvals inbox**
  - List of pending “actions” that require HITL approval:
    - “RSVP to Event X?”
    - “Add to calendar?”
  - Each approval shows: extracted title/date/location + confidence + “What I’m going to click”
- **Trust controls**
  - Allowed domains (whitelist)
  - “Never auto-submit forms without approval” (default ON)
  - “Mask personal data in logs” (default ON)

### How the Mac app “feels”
- Ambient/background: analysis runs quietly.
- Interruption only when needed: approvals are actionable, not spammy.
- Transparent: user can always see what’s happening and why.

---

## iOS app — “Companion” (required)
The iOS app is the “on-the-go” way to:
- search your intent/memories
- approve actions
- handle new photos as they arrive

### Onboarding
1. Pair to Mac Home Base (same network or via tunnel link/QR).
2. Enable notifications for approvals and results.
3. “Upload new photos automatically” (default ON).

### Main tabs
- **Inbox (Approvals)**
  - Cards like: “I found this event. Approve RSVP + calendar?”
  - Tap-through shows: extracted flyer details + source image + what the agent found on the web.
- **Search**
  - Natural language: “events I screenshotted this week”, “that concert flyer”, “things I meant to buy”.
  - Results are image-backed “intent cards”, not raw photo grids.
- **Timeline (optional)**
  - A feed of detected intents and outcomes: “RSVP confirmed”, “calendar added”, “couldn’t find canonical event”.

### iOS processing stance
- iOS should **upload new photos taken post-onboarding** to the local API over the tunnel endpoint.
- The Mac is the **analysis engine**: local models on Mac Silicon handle OCR/embedding/extraction and queue downstream enrichment/actions.
- Heavy backlog scanning and long-running enrichment stays on Mac.

---

## Skills system (required)
The product ships with a core capability (“agentic search”), then allows users to **toggle on skills** that add automation.

### Why “skills” matter (product)
- Keeps the product safe and understandable: users opt in to automations.
- Lets the agent feel expandable without shipping a huge monolith.
- Makes demos clearer: “Here are the skills we turned on.”

### Skills (initial set)
- **Agentic search** (default ON): natural language search over “intent documents” built from photos (OCR + embeddings + metadata).
- **Flyer → RSVP → Calendar** (default OFF): web enrichment + RSVP execution + calendar creation with HITL.
- **Price watch** (future): detect repeated item screenshots → compare prices → alerts.
- **Accountabilibuddy** (future): detect progress images/check-ins → nudges + reminders.

---

## Flagship skill A — Flyer → RSVP → Calendar (required)

### Trigger inputs
Any of:
- screenshot/photo containing a flyer/poster
- screenshot of an event page (Eventbrite/Luma/Meetup/etc.)
- QR code poster

### User-facing flow (ideal)
1. User screenshots a flyer (iPhone) or imports/has it in Photos (Mac).
2. Agent detects: “This looks like an event flyer.”
3. Agent extracts rough details (title/date/location/URL/QR).
4. Agent searches the web to find a canonical event page and verifies details.
5. User receives an approval card:
   - “Approve RSVP to **Event Name** on **Date/Time** at **Location**?”
   - Buttons: “Approve”, “Edit”, “Reject”
6. On approve:
   - Agent completes RSVP on the web.
   - Agent adds calendar event (with location + link + confirmation).
7. User gets confirmation:
   - “RSVP confirmed. Added to Calendar.”

### Where Browserbase is *product-critical*
Browserbase is used for the “hard parts”:
- Navigating real websites to locate the canonical event page.
- Extracting structured event details reliably (time zone, address, ticketing rules).
- Completing RSVP/sign-up forms.
- Producing evidence artifacts (screenshots/recordings) for trust and debugging.

### HITL (must)
User approval is required before:
- submitting RSVP / sign-up forms
- logging into accounts (if needed)
- final calendar write (optional toggle; default ON to ask)

### Failure states (product behavior)
- **Couldn’t find canonical page**
  - Ask user: “Pick the right link” (show 3 candidates with previews).
- **Date/time ambiguous**
  - Ask a single clarification (time zone or day).
- **Form blocked/captcha**
  - Offer “Open Review” (see Live View) or “Try again later”.
- **Duplicate detection**
  - “Looks like you already RSVP’d / already added to calendar.”

---

## Voice HITL (Daily/Pipecat) — nice-to-have
Make approvals feel magical and faster than tapping.

### Consumer flow
1. Approval arrives: “Want me to RSVP you?”
2. User taps “Talk” (or answers a call-like UI).
3. Voice agent summarizes: “I found Event X on Friday at 7pm at Y. Tickets are free. Want me to RSVP and add it to your calendar?”
4. User says “Yes, RSVP for one.”
5. Agent executes the Browserbase workflow and confirms.

### Product constraints
- Voice must never silently take actions; it is a conversational approval layer for the same HITL gate.

### Implementation stance (per your instruction)
- Use **Modal** serverless functions in Python for Pipecat + any GPU needs.
- Keep the rest of the product in Swift + Node/TypeScript.

---

## Admin / hackathon demo dashboard (required)
This is for presenting + debugging. It can be a simple web app served by the local Node server.

### Goals of the dashboard
- Make sponsor tooling **visible**.
- Provide a reliable “presenter cockpit” during live demo.
- Allow quick recovery when anything fails.

### Core screens
#### 1) Live runs
- List of the latest agent runs with:
  - source (macOS backlog scan vs iOS new photo)
  - detected intent type
  - status (queued/running/waiting approval/succeeded/failed)
  - links:
    - “Open Weave Trace”
    - “Watch Live” (Browserbase Live View when applicable)
    - “Replay Recording” (Browserbase session recording)

#### 2) Approval inbox (admin view)
- Shows pending approvals with:
  - the triggering image thumbnail
  - extracted details + confidence
  - proposed action summary
  - Approve/Reject/Edit (mirrors consumer experience)

#### 3) Browser sessions
- Active/previous Browserbase sessions:
  - session id, target domain, current step
  - “Live View” link
  - “Recording” link

#### 4) System health
- Redis queue health and throughput
- Worker status
- Tunnel status
- Last error and suggested remediation

### Why Live View matters here
In the product, Live View is optional for “review before submit.”
In the demo, Live View is a high-signal way to show:
- real browser automation
- trust and transparency
- debuggability when things go sideways

---

## Sponsor tooling: how you’ll get credit (must-use)

## Weave (required)
Weave is not “just logging”; it is the **primary way you prove the agent is real and improving**.

### What to trace (high-level)
Each run should include spans for:
- **Ingestion**
  - new image detected / selected
  - metadata (device, time)
- **Local extraction**
  - model name, confidence, extracted entities
- **Routing**
  - “flyer detected” → selected skill
- **Web execution (Browserbase)**
  - search → page selections → extraction → form-fill plan
- **HITL gate**
  - what the user saw, approved, edited, or rejected
- **Outcome**
  - RSVP success, calendar success, notifications sent

### Weave “wow” moments for judges
- Click a trace and see the full story end-to-end.
- Evaluate runs with simple scorers:
  - “Did we extract the correct date/time?”
  - “Did we pick the right event page?”
  - “Did we avoid duplicates?”
- Compare success rate before/after **system prompt updates** and routing-policy changes.

### “Post-training” (required framing)
For hackathon scope, “post-training” is primarily **iterating the system prompt and policies** (routing + extraction schema) based on user behavior and feedback:
- feedback from search results (“this is the wrong event”)
- approval/rejection patterns (“stop asking me about X”)
- edits before approval (what users correct most)
- downstream success/failure outcomes (RSVP success, calendar success)

These changes should be **visible in Weave** by versioning and logging:
- the active system prompt (or prompt ID)
- skill configuration toggles
- model/version identifiers for local extractors
- evaluation scores over time

## Browserbase (required)
Browserbase should be the **execution substrate** for RSVP flows:
- Use stealth mode where needed.
- Use Live View in the admin dashboard and optionally in the consumer “Review” step.
- Use session recordings for replayable proof + debugging artifacts.

## Redis (required)
Redis should power the agent as a stateful system:
- **Queues**: ingestion → enrichment → action execution → notifications
- **State machine**: runs waiting on HITL, retries, backoffs
- **Dedupe**: prevent double-RSVP or duplicate calendar entries
- **Caching**: canonical event page results

Optional “bonus Redis” (if Redis Stack):
- vector memory for “have I seen this flyer/event before?”

---

## Optional sponsor tooling

## Daily/Pipecat (nice-to-have)
Use voice as a **premium HITL surface**:
- Faster approvals
- Better demo
- Makes the agent feel alive

## Marimo (extra bonus / if time)
Use Marimo as “Agent Mission Control” (judge-facing):
- dashboards of run success rates
- failure taxonomy
- links to Weave traces
- queue throughput over time

---

## UX principles (keep it product-grade)
- **Ambient by default**: do work quietly; interrupt only for approvals.
- **One-tap approvals**: approval cards should be decisive and minimal.
- **Explainability**: “Here’s what I found, here’s why I think it’s an event, here’s what I’m about to do.”
- **Safety**: domain allowlist + approval gates.
- **Recoverability**: offer Live View takeover when automation fails.

---

## Success metrics (hackathon-friendly)
- **Flyer detection precision**: % of “event-like” images correctly classified.
- **Canonical event match rate**: % of flyers matched to a real event page.
- **RSVP completion rate**: % of approved actions successfully RSVP’d.
- **Calendar completion rate**: % of approved actions added to calendar.
- **Median time-to-calendar**: from screenshot → calendar event created.
- **User effort**: average approvals per successful event (aim: 1).

---

## Demo plan (2–3 minutes)
1. Open macOS Home Base: show “Agent Running”, “Tunnel Online”, “Models Loaded”.
2. Take/screen-capture an event flyer (or import a sample image).
3. Show the admin dashboard:
   - new run appears in “Live runs”
   - click “Watch Live” to show Browserbase navigating to the canonical event page
4. HITL moment:
   - approval card appears on iOS
   - approve (or approve via voice if implemented)
5. Show outcomes:
   - “RSVP confirmed” + calendar event created
   - open Weave trace and scroll the trace tree to prove full instrumentation
6. Close with the “why”:
   - “Your photos are your intent; this agent turns them into actions privately.”

---

## Open questions (to resolve during build)
- Which tunnel provider is the default (ngrok vs Cloudflare Tunnel)?
- What is the minimal set of event sites to support in the hackathon (Eventbrite, Luma, Meetup, Google Forms)?
- Where do user credentials live (keychain) and how is consent handled for logins?
- What is the first on-device vision model you’ll ship with for flyer detection and OCR?

