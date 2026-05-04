# NexaBank-ARIA 🏦

**NexaBank-ARIA** (AI-Responsive Interactive Assistant) is a voice-first, browser-based banking assistant prototype designed to simulate a modern hands-free banking experience. The project combines browser-native speech recognition, rule-based banking intent handling, live transaction updates, and multi-role synchronization between customer and supervisor sessions.

This README reflects the current **dev-0.1.6** implementation, which includes:
- A three-role entry flow: **Customer 1**, **Customer 2**, and **Supervisor**
- Real-time synchronization using **Firebase Firestore**
- Same-device instant sync using **BroadcastChannel**
- Supervisor monitoring across two customer sessions
- Peer-to-peer escalation support via **PeerJS**
- A dedicated **Render-hosted signaling server** for PeerJS connectivity

---

## Table of Contents

- [Overview](#overview)
- [Current Highlights](#current-highlights)
- [How the App Works](#how-the-app-works)
- [Roles and Session Model](#roles-and-session-model)
- [Core Features](#core-features)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Firebase Live Sync](#firebase-live-sync)
- [PeerJS and Render Server](#peerjs-and-render-server)
- [Local Development Setup](#local-development-setup)
- [Deployment Options](#deployment-options)
- [Usage Flow](#usage-flow)
- [Example Voice Commands](#example-voice-commands)
- [Operational Details](#operational-details)
- [Troubleshooting](#troubleshooting)
- [Security Notes](#security-notes)
- [Known Limitations](#known-limitations)
- [Future Improvements](#future-improvements)
- [License](#license)
- [Author](#author)

---

## Overview

NexaBank-ARIA is a front-end-heavy demo application that runs primarily in the browser and simulates how an AI-powered banking assistant could support voice-led interactions in a bank-grade user interface. The app is styled as an HSBC-inspired global banking assistant and is built to demonstrate customer assistance, activity logging, transaction simulation, and supervisor oversight in real time.

The application does **not** depend on an LLM API to function. Instead, it uses browser capabilities and rule-based intent parsing to:
- capture spoken or typed requests,
- identify banking actions,
- update balances and ledger data,
- maintain a timestamped interaction log,
- and publish a live mirrored session for supervisor monitoring.

In short, it is a demo of:
- **voice UX**
- **banking workflow simulation**
- **live state synchronization**
- **session locking**
- **cross-tab / cross-device supervision**
- **P2P intervention handoff**

---

## Current Highlights

### 1. Multi-entry live session model
The current app no longer has a single generic customer mode. It now supports:
- **Customer 1**
- **Customer 2**
- **Supervisor**

This makes the system better suited for multi-customer monitoring and live supervision demos.

### 2. Two built-in customer profiles
The current codebase contains two bundled demo customer profiles with separate balances, masked account numbers, and profile metadata. This helps demonstrate independent session handling without requiring a login system.

### 3. Real-time customer-to-supervisor mirroring
When a customer session is active, the app publishes a full live snapshot that includes:
- balances,
- transaction ledger,
- logs,
- session status,
- heartbeat presence,
- and peer connection identifiers.

The supervisor dashboard subscribes to those snapshots and displays each customer separately.

### 4. Supervisor intervention path
The supervisor interface can detect an online customer, surface a **Talk to Customer** action when a valid peer ID is available, and log the intervention activity. This enables a practical escalation model where the AI-led experience can be observed and then stepped into by a supervisor.

### 5. Dedicated PeerJS signaling server
The repository now includes a separate `peerjs-server/` service intended to run on Render. This server exposes the PeerJS path used for WebRTC signaling and is separate from the static front-end deployment.

---

## How the App Works

At a high level, NexaBank-ARIA follows this flow:

1. The user opens the app and selects a role.
2. A customer role prompts for microphone permission.
3. Speech or manual input is captured.
4. The input is processed through the app’s NLP and intent pipeline.
5. The app updates balances, ledger entries, and logs.
6. The customer state is published locally and remotely.
7. The supervisor dashboard receives synchronized updates and mirrors customer activity.

The experience is designed to feel like a voice-led digital banking session, but all banking operations are simulated in the front end.

---

## Roles and Session Model

## Customer 1
Customer 1 is an independent customer session with its own profile, balances, logs, and ledger. It behaves like a normal customer interaction channel and can be monitored by the supervisor.

## Customer 2
Customer 2 is a second independent customer session. It exists so the supervisor can monitor more than one live banking session side by side.

## Supervisor
Supervisor mode is **view-only** from a banking-actions perspective, but it can:
- monitor both customer sessions,
- see online/offline state,
- view balances,
- inspect logs,
- inspect ledger activity,
- clear mirrored log displays locally,
- and trigger a live call handoff when peer calling is available.

### Role availability and occupancy
The role gate periodically checks session availability and disables entry buttons when a role is already occupied by an active session. This prevents duplicate active sessions for the same role in live mode.

---

## Core Features

## Voice and Interaction
- Browser-based microphone flow
- Web Speech API recognition
- Hands-free interaction design
- Manual text input fallback
- Quick command buttons for faster demo flows
- Visual listening/processing/speaking feedback
- Real-time waveform / orb-style feedback loop

## Banking Simulation
- Savings and current account balances
- Transfers between own accounts
- Transfers to named beneficiaries
- Bill payment simulation
- Transaction ledger updates
- Running debit tracking
- Action count tracking

## Logging
- Timestamped interaction history
- System, user, ARIA, action, and error-style entries
- Exportable interaction logs
- Auto-scroll to latest entry
- Supervisor-mirrored logs for remote visibility

## Live Sync
- Firestore-based cross-device state sync
- BroadcastChannel-based same-device sync
- Lock acquisition to prevent conflicting sessions
- Heartbeat-based session presence
- Offline presence publishing when customer exits
- Stale lock detection and overwrite protection logic

## Supervisor Dashboard
- Separate columns for Customer 1 and Customer 2
- Online/offline indicators
- Balance display for each customer
- Mirrored log stream
- Mirrored transaction ledger
- Local clear-chat controls for supervisor display
- Talk-to-customer action when live calling is available

---

## Architecture

## Front-End App
The front end is a static browser app centered around `index.html` and a collection of JavaScript modules under `assets/js/`.

The UI provides:
- role selection,
- microphone permission flow,
- banking command entry,
- transaction and log rendering,
- status badges,
- and supervisor monitoring panels.

## State Layer
The app maintains a central state object that tracks:
- current role,
- session ID,
- selected customer,
- balances,
- ledger entries,
- logs,
- recognition state,
- heartbeat values,
- Firebase availability,
- and synchronization subscriptions.

This central state drives the visible UI and the data published to Firestore.

## Input Pipeline
Input enters the app in one of two ways:
- microphone speech recognition
- manual typed text

From there, the app:
- normalizes input,
- extracts structured data,
- maps the request to a known banking intent,
- performs the banking action,
- updates balances and ledger,
- logs the action,
- and publishes a fresh snapshot if the session is live.

## Synchronization Layer
The app uses two synchronization strategies:

### BroadcastChannel
Used for same-device, low-latency syncing across tabs. This is the fastest path when customer and supervisor are running in different tabs on the same machine.

### Firebase Firestore
Used for cross-device sync, session state sharing, customer role locking, heartbeat updates, and supervisor subscription to live state.

## Peer Calling Layer
Peer calling is supported through a PeerJS signaling path. The supervisor side uses peer information from synchronized customer state and can trigger a customer call if the signaling path is available and a valid peer ID exists.

---

## Project Structure

```text
NexaBank-ARIA/
├── index.html
├── README.md
├── assets/
│   ├── css/
│   │   ├── variables.css
│   │   ├── base.css
│   │   ├── layout.css
│   │   ├── components.css
│   │   └── states.css
│   └── js/
│       ├── helpers.js
│       ├── profile.js
│       ├── state.js
│       ├── dom.js
│       ├── log.js
│       ├── ledger.js
│       ├── waveform.js
│       ├── voice-ui.js
│       ├── nlp.js
│       ├── intents.js
│       ├── process-input.js
│       ├── mic.js
│       ├── session-store.js
│       ├── firebase-sync.js
│       ├── role-gate.js
│       ├── globals.js
│       └── app-init.js
└── peerjs-server/
    ├── server.js
    └── package.json
```

### Important files

#### `index.html`
Main application shell. It contains the role gate, customer console, supervisor dashboard layout, live badges, and the current embedded Firebase web config.

#### `assets/js/state.js`
Defines the main shared state object and the bundled customer profiles.

#### `assets/js/app-init.js`
Handles startup flow, role selection continuation, mic permission continuation, session bootstrapping, and session end behavior.

#### `assets/js/role-gate.js`
Controls role availability, customer/supervisor entry flow, role lock behavior, and live-mode badge setup.

#### `assets/js/firebase-sync.js`
Implements:
- Firestore initialization
- lock management
- snapshot publishing
- supervisor subscriptions
- heartbeat monitoring
- presence aging
- log mirroring
- and customer-to-supervisor synchronization

#### `assets/js/log.js`
Manages customer log rendering, export behavior, and visual log styling. In the current code, supervisor entries are mapped to the ARIA visual class while still preserving their actual identity in log data.

#### `peerjs-server/server.js`
Runs the dedicated PeerJS signaling service that the front end can use for live call handoff / escalation.

---

## Firebase Live Sync

## Current Firebase configuration model
The current front end expects a global object named:

```js
window.NEXA_FIREBASE_CONFIG
```

The dev build currently points to the `nexabank-aria` Firebase project. The front end initializes Firebase and then runs a write test to verify Firestore availability before enabling live sync.

### Current sync responsibilities
Firebase is used for:
- role occupancy checks,
- customer lock acquisition,
- supervisor lock acquisition,
- session presence,
- state snapshot publication,
- event-based transcript relay,
- and live supervisor subscription.

## Firestore structure used by the app

The current code uses documents under this general structure:

```text
channels/
  customer1/
    locks/customer1
    meta/state
    events/{autoId}
  customer2/
    locks/customer2
    meta/state
    events/{autoId}
  supervisor/
    locks/supervisor

_health/
  write-test
```

### Meaning of each path

#### `channels/{customerId}/locks/{customerId}`
Stores role lock status for a specific customer slot.

#### `channels/{customerId}/meta/state`
Stores the latest full published customer snapshot that the supervisor reads.

#### `channels/{customerId}/events/{eventId}`
Stores event-style updates such as supervisor transcript events during live call scenarios.

#### `_health/write-test`
Used by the app as a quick Firestore write availability check.

## Heartbeat and presence behavior

The current implementation uses multiple timing windows:

- **Heartbeat interval**: 5 seconds
- **Presence stale window**: 15 seconds
- **Lock stale window**: 30 seconds
- **Supervisor presence monitor**: 3 seconds
- **Snapshot publish debounce**: about 300 ms for normal scheduled updates

### What this means in practice
- Customer sessions publish full snapshots.
- A heartbeat keeps the session marked active.
- If the heartbeat ages out, the supervisor can mark the customer offline.
- If a lock becomes stale long enough, the app can treat it as reclaimable.

## Same-device fast sync
In addition to Firestore, the app also uses:

```js
new BroadcastChannel('nexabank_aria_sync')
```

This allows very fast same-device updates without waiting for network round trips.

## Suggested Firestore rules for demo use

For local demo or personal prototype use, a permissive ruleset can look like this:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /channels/{channelId}/{document=**} {
      allow read, write: if true;
    }

    match /_health/{doc} {
      allow read, write: if true;
    }
  }
}
```

> **Important:** These rules are suitable only for prototype or demo scenarios. For any serious deployment, lock down access with authentication and narrower rules.

---

## PeerJS and Render Server

## Why PeerJS is used
PeerJS is used to support supervisor-to-customer escalation through peer-assisted live calling. The synchronization layer stores customer peer IDs so the supervisor side can surface a **Talk to Customer** action only when:
- the customer is online,
- a valid peer ID is known,
- and no other active supervisor call is already blocking the session.

## Current signaling server
The repository includes a dedicated signaling service under:

```text
peerjs-server/
```

### Server behavior
The current server:
- uses `Express`
- creates an HTTP server
- mounts `ExpressPeerServer`
- listens on `0.0.0.0`
- defaults to port `9000`
- serves the PeerJS path at `/peerjs`
- exposes a health endpoint at `/status`
- exposes a root endpoint `/` returning a JSON summary

### Public path
The signaling path configured by the server is:

```text
/peerjs
```

### Root endpoint response intent
The root route reports a Render-hosted PeerJS URL in this form:

```text
https://nexabank-peerjs-server.onrender.com/peerjs
```

That means the expected live signaling deployment is on Render under the service domain:

```text
https://nexabank-peerjs-server.onrender.com
```

## Render deployment guidance

If you want to deploy the signaling server on Render:

### Recommended service setup
- **Service type**: Web Service
- **Root directory**: `peerjs-server`
- **Runtime**: Node.js
- **Start command**: `npm start`

### Current start script
The package currently defines:

```json
"start": "node server.js"
```

### Environment variables
You can optionally set:

```text
PEERJS_KEY=your_custom_secret
PORT=9000
```

If `PEERJS_KEY` is not supplied, the server falls back to a default value already present in code.

## Health check endpoints

### Root
```text
GET /
```

Returns service metadata and the public PeerJS path.

### Status
```text
GET /status
```

Returns a simple health JSON response.

## Important deployment note
The server code imports both `express` and `peer`. If you deploy this service independently, make sure the runtime environment has all required Node dependencies installed correctly before starting the server.

---

## Local Development Setup

## 1. Clone the repository

```bash
git clone https://github.com/dhritimanhaldar/NexaBank-ARIA.git
cd NexaBank-ARIA
git checkout dev-0.1.6
```

## 2. Serve the static front end

Use any simple static server. For example:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## 3. Browser recommendation
For the best experience, use:
- Google Chrome
- Microsoft Edge

These browsers generally provide the best support for the Web Speech API and microphone workflows used by the app.

## 4. Firebase setup
If you are using your own Firebase project:

1. Create a Firebase project.
2. Enable Firestore.
3. Replace the current `window.NEXA_FIREBASE_CONFIG` object in `index.html` with your own values.
4. Add the Firestore rules required for the `channels` and `_health` paths.

## 5. PeerJS server setup
If you want supervisor live calling / escalation to work in a deployed environment, run the PeerJS signaling server separately from the static front end.

Example local setup:

```bash
cd peerjs-server
npm install
npm start
```

---

## Deployment Options

## Option A: Static front end + Render signaling server
This is the recommended split for the current architecture.

### Front end
Deploy the app as a static website on:
- GitHub Pages
- Netlify
- Vercel
- Render Static Site
- or any static host

### Signaling server
Deploy `peerjs-server/` as a Node service on Render.

This gives you:
- a static front end for the UI,
- and a dedicated signaling endpoint for PeerJS.

## Option B: Local demo
Run everything locally:
- serve the front end using a local static server,
- run Firebase against your configured project,
- run the PeerJS server locally if you need live calling.

## Option C: Front end only
If you only want to demo voice input, manual banking actions, and UI flow, you can still run the front end without the full live-sync stack. In that case, the app falls back toward local-only behavior when Firebase is unavailable.

---

## Usage Flow

## Customer flow
1. Open the app.
2. Select **Customer 1** or **Customer 2**.
3. Grant microphone permission.
4. Speak or type a banking request.
5. Watch balances, logs, and ledger update live.
6. If Firebase is active, the supervisor dashboard can mirror the session.

## Supervisor flow
1. Open the app in another browser/tab/device.
2. Select **Supervisor**.
3. The supervisor dashboard opens in read-only mode.
4. Customer 1 and Customer 2 columns display status independently.
5. When a customer is online and peer signaling is available, the supervisor can escalate to a live customer call.

## Ending a customer session
When a customer ends or closes a session:
- the app stops listening,
- publishes offline presence,
- releases the customer lock,
- and updates the supervisor-visible state.

---

## Example Voice Commands

### Balance inquiries
- “What is my savings balance?”
- “Show my current account balance.”
- “How much money do I have in savings?”

### Transfers
- “Transfer 5000 to current.”
- “Move 10000 from current to savings.”
- “Send 2000 rupees to Rahul from savings.”
- “Transfer 2000 from current to Priya.”

### Bill payments
- “Pay electricity bill 1200.”
- “Pay my credit card bill.”
- “Pay water bill 800.”

### Statements and history
- “Show transaction history.”
- “Show my recent actions.”
- “Clear history.”
- “Export logs.”

### Card / service style requests
Depending on the supported intent handlers in the current app flow, quick commands and banking-support actions can also be surfaced through the interface.

---

## Operational Details

## UI layout
The main customer shell is structured around:
- agent console,
- interaction log,
- and transaction ledger.

The supervisor view displays:
- Customer 1 panel
- Customer 2 panel

Each customer panel contains:
- status indicator,
- balances,
- interaction log,
- transaction ledger,
- and local clear controls for supervisor viewing.

## Session ID
Every session gets a generated session ID such as:

```text
SES-XXXXX
```

This is displayed in the UI and helps differentiate demo sessions.

## Logging behavior
Customer logs are stored in memory and rendered with timestamps. Export currently downloads a plain text log file rather than a JSON file.

## Customer snapshot contents
The customer snapshot published for live sync includes:
- accounts
- transactions
- log entries
- transaction sequence count
- total debit
- current status label
- peer ID
- heartbeat
- online / connected / presence state

## Supervisor transcript relay
The synchronization layer includes support for publishing supervisor transcript entries into customer-visible logs during live call scenarios.

---

## Troubleshooting

## Microphone does not start
Check the following:
- you are using Chrome or Edge,
- microphone permission is allowed,
- the page is running on `localhost` or HTTPS,
- no other browser permission block is active.

## Firebase live mode is not working
Check:
- `window.NEXA_FIREBASE_CONFIG` is valid,
- Firestore is enabled,
- Firestore rules allow the required paths,
- browser network access to Firebase is available,
- the write test to `_health/write-test` succeeds.

## Role buttons stay enabled / disabled incorrectly
This usually points to:
- missing Firebase connectivity,
- stale locks in Firestore,
- or a previously crashed session that did not clean up as expected.

## Supervisor shows customer offline
Possible causes:
- heartbeat is no longer fresh,
- customer tab was closed,
- customer lock was released,
- customer session lost network,
- or no fresh snapshot is being published.

## Talk to Customer button does not work
Check:
- the customer is online,
- a peer ID is actually present in the synchronized state,
- the PeerJS signaling server is reachable,
- the signaling path matches `/peerjs`,
- and the live calling integration is loaded correctly in the front end.

## Render signaling server is not connecting
Check:
- Render service is actually running,
- the path is `/peerjs`,
- the port is set correctly,
- the proxy / HTTPS setup is not rewriting paths incorrectly,
- and all Node dependencies are installed in the server environment.

---

## Security Notes

This repository is currently a **prototype / demo application**, not a production banking platform.

### Important points
- There is no full customer authentication system yet.
- Supervisor mode is not protected by a real access-control layer.
- Demo Firestore rules may be intentionally open for prototyping.
- Banking operations are simulated and are not connected to a real core banking backend.
- Front-end Firebase web config is public by design, but Firestore access must still be protected through proper rules and auth in any serious deployment.

### For production-hardening, you would want
- authenticated customer login
- authenticated supervisor login
- role-based Firestore access
- server-validated transactions
- audited action trails
- stronger session ownership validation
- safer lock recovery logic
- and secure escalation workflows

---

## Known Limitations

- Best browser support is on Chromium-based browsers.
- Web Speech API behavior can vary by browser and environment.
- Voice recognition quality depends on microphone quality and ambient noise.
- NLP is rule-based, so complex multi-step or ambiguous commands may not resolve well.
- Firestore sync depends on active network connectivity.
- Crash-style exits may still leave temporarily stale session records until aging logic clears them.
- Peer calling depends on signaling availability and correct peer presence propagation.
- This is a demo banking assistant, not a real transaction engine.

---

## Future Improvements

- Authentication for customers and supervisors
- Stronger Firestore security rules
- Better stale-lock recovery UX
- More advanced NLP / intent extraction
- Better fallback prompts and clarifications
- Full statement-generation flow
- Voice synthesis responses
- Better mobile optimization
- Multi-language support
- Richer supervisor intervention controls
- More complete PeerJS integration documentation
- Production-ready deployment configuration for Firebase + Render + static hosting

---

## License

MIT License.

If you add a `LICENSE` file to the repository root, reference it here explicitly.

---

## Author

**Dhritiman Haldar**

- GitHub: [@dhritimanhaldar](https://github.com/dhritimanhaldar)

---

## Acknowledgments

- Firebase / Firestore for real-time synchronization
- Web Speech API for browser-based speech recognition
- PeerJS for signaling-assisted P2P communication
- Render for lightweight Node service hosting
- HSBC-inspired UI direction for banking demo presentation

---

## Final Notes

NexaBank-ARIA is a strong prototype for demonstrating what a voice-first banking support assistant can look like when combined with real-time supervision and escalation. The current codebase goes beyond a simple speech demo by adding:
- multiple customer slots,
- supervisor monitoring,
- live presence,
- session locking,
- cross-tab sync,
- and PeerJS-enabled intervention support.

It is best understood as a **live banking interaction prototype** that showcases front-end orchestration, state mirroring, session management, and voice UX in a single browser-centric system.