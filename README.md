# NexaBank-ARIA 🏦

**ARIA** (AI-Responsive Interactive Assistant) is a voice-first, AI-powered banking assistant prototype built entirely in the browser. The app demonstrates hands-free banking interactions using natural language voice commands with live session synchronization between Customer and Supervisor roles.

## ✨ Features

### Voice & Interaction
- **Voice-First UI**: Built-in Web Speech API for continuous voice input
- **Real-time Waveform**: Live audio visualization during speech
- **Voice Activity Detection (VAD)**: Automatic silence detection and command submission
- **Manual Input**: Text fallback for voice commands
- **Quick Commands**: Pre-built button shortcuts for common tasks

### Banking Operations
- **Account Management**: View balances for Savings & Current accounts
- **Fund Transfers**: Transfer between own accounts or to beneficiaries
- **Bill Payments**: Pay utility bills, credit cards, and loans
- **Transaction History**: Complete ledger with filtering and export
- **Smart NLP**: Rule-based intent recognition from natural language

### Live Synchronization
- **Firebase Firestore**: Real-time session sync across devices
- **Dual Roles**: Customer (local) and Supervisor (remote monitoring)
- **Session Locking**: Prevents multiple customers from conflicting
- **Heartbeat System**: Keep-alive mechanism for active sessions
- **BroadcastChannel**: Same-device, zero-latency local tab sync

### UI/UX
- **HSBC Branding**: Professional banking aesthetic
- **Responsive Layout**: Three-column grid (Agent Console, Log, Ledger)
- **ARIA Orb**: Animated status indicator (Ready, Listening, Processing, Speaking, Error)
- **Export Logs**: Download interaction history as JSON
- **Live Status**: Real-time connection status badges

---

## 🗂️ Project Structure

```
NexaBank-ARIA/
├── index.html                     # Main application shell
└── assets/
    ├── css/
    │   ├── variables.css          # Design tokens (colors, fonts, spacing)
    │   ├── base.css               # CSS reset + global styles
    │   ├── layout.css             # Shell, topbar, 3-column grid
    │   ├── components.css         # UI components (cards, buttons, ledger)
    │   └── states.css             # ARIA states, animations, mic overlay
    └── js/
        ├── helpers.js             # Utility functions (formatCurrency, timestamp)
        ├── profile.js             # Mock user profile (name, accounts)
        ├── state.js               # Central application state object
        ├── dom.js                 # DOM element references + badge updaters
        ├── log.js                 # Interaction log (add, clear, export)
        ├── ledger.js              # Transaction ledger table + stats
        ├── waveform.js            # Canvas-based audio waveform visualizer
        ├── voice-ui.js            # ARIA orb animation + status state machine
        ├── nlp.js                 # Rule-based NLP: tokenizer, extractors
        ├── intents.js             # Intent handler map (transfer, pay bill, etc.)
        ├── process-input.js       # Main input pipeline: text → NLP → intent
        ├── mic.js                 # Web Speech API mic controller (VAD, mute)
        ├── session-store.js       # In-memory session ID generator
        ├── firebase-sync.js       # Firestore read/write: session sync
        ├── role-gate.js           # Role selection screen logic
        ├── globals.js             # Global helper functions for onclick handlers
        └── app-init.js            # App bootstrap: Firebase → role gate → mic init
```

---

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/dhritimanhaldar/NexaBank-ARIA.git
cd NexaBank-ARIA
git checkout dev-0.1.4
```

### 2. Firebase Setup

**Create a Firebase Project:**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable **Firestore Database** (start in test mode)
4. Copy your Firebase config object

**Add Firebase Config:**

Open `index.html` and replace the `NEXA_FIREBASE_CONFIG` object (around line 60):

```javascript
window.NEXA_FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

**Firestore Security Rules:**

In Firebase Console → Firestore → Rules, paste:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /channels/{channelId}/{document=**} {
      allow read, write: if true;  // Open for demo; lock down in production
    }
    match /_health/{doc} {
      allow read, write: if true;
    }
  }
}
```

### 3. Deploy

**Option A: Local Server**
```bash
python3 -m http.server 8000
# Visit: http://localhost:8000
```

**Option B: GitHub Pages**
1. Push to GitHub
2. Go to **Settings** → **Pages**
3. Deploy from branch `dev-0.1.4`
4. Access at: `https://YOUR_USERNAME.github.io/NexaBank-ARIA/`

### 4. Run the App

1. **Open in Browser**: Chrome/Edge recommended (best Web Speech API support)
2. **Grant Microphone Permission**: Click "Allow" when prompted
3. **Select Role**:
   - **Customer**: Interactive banking user (local mode)
   - **Supervisor**: Remote monitoring view (Firebase sync)

---

## 🎤 Using Voice Commands

### Example Commands

**Check Balance:**
- "What's my savings balance?"
- "Show current account balance"
- "How much do I have?"

**Transfer Money:**
- "Transfer 5000 to current"
- "Send 2000 rupees to Raj from savings"
- "Move 10000 from current to savings"

**Pay Bills:**
- "Pay electricity bill 1500 rupees"
- "Pay my credit card 5000"
- "Make water bill payment 800"

**Transaction History:**
- "Show transaction history"
- "Export logs"
- "Clear history"

---

## 🏗️ Architecture

### Core Components

#### 1. **Voice Pipeline** (`mic.js`)
- Initializes Web Speech API `SpeechRecognition`
- Implements Voice Activity Detection (VAD)
- Auto-submits after 1.5s of silence
- Feeds transcript to `processInput()`

#### 2. **NLP Engine** (`nlp.js` + `intents.js`)
- Tokenizes and normalizes user input
- Extracts: amounts, account types, beneficiary names
- Maps to intents: `TRANSFER`, `PAY_BILL`, `CHECK_BALANCE`, `HISTORY`, etc.
- Intent handlers execute banking logic

#### 3. **State Management** (`state.js`)
- Central `S` object: accounts, transactions, logs, Firebase status
- Updates trigger UI re-renders via DOM manipulation
- Balance updates propagate to all UI elements

#### 4. **Firebase Sync** (`firebase-sync.js`)
- **Customer**: Acquires lock, publishes snapshots every 300ms
- **Supervisor**: Subscribes to `channels/global-live-session/meta/state`
- Uses Firestore transactions to prevent race conditions
- Falls back to local-only mode if Firebase unavailable

#### 5. **UI Orchestration**
- **ARIA Orb** (`voice-ui.js`): 5-state visual feedback (Ready → Listening → Processing → Speaking → Error)
- **Waveform** (`waveform.js`): Real-time audio visualization using Canvas API
- **Ledger** (`ledger.js`): Dynamic transaction table with auto-balancing
- **Log** (`log.js`): Timestamped conversation history

---

## 🔧 Configuration

### Environment Variables (in `index.html`)

```javascript
// Mock user profile (profile.js)
const USER_PROFILE = {
  name: "Sarah Martinez",
  customerId: "HSBC-IN-927364",
  accounts: {
    savings: 125000.0,
    current: 58000.0
  }
};

// Session settings (session-store.js)
const SESSION_ID_LENGTH = 8;

// VAD silence threshold (mic.js)
const SILENCE_THRESHOLD_MS = 1500;

// Publish debounce delay (firebase-sync.js)
const PUBLISH_DELAY_MS = 300;
```

---

## 🧪 Testing

### Manual Testing Checklist

**Voice Input:**
- [ ] Mic permission granted
- [ ] VAD detects silence and auto-submits
- [ ] Waveform animates during speech
- [ ] ARIA orb transitions: Ready → Listening → Processing

**NLP & Intents:**
- [ ] Transfer between accounts works
- [ ] Transfer to beneficiary deducts from source
- [ ] Bill payments reduce balance
- [ ] Balance queries return correct amounts
- [ ] Unknown commands trigger fallback response

**Firebase Sync:**
- [ ] Customer acquires lock successfully
- [ ] Supervisor sees live updates within 1s
- [ ] Session heartbeat keeps connection alive
- [ ] Browser refresh maintains session
- [ ] Lock releases on customer tab close

**UI/UX:**
- [ ] Log scrolls to newest entry
- [ ] Ledger table updates after each transaction
- [ ] Export logs downloads JSON file
- [ ] Clear history wipes log + ledger
- [ ] Mute button stops mic input

---

## 🐛 Known Issues

1. **Web Speech API Limitations:**
   - Works best in Chrome/Edge (Chromium)
   - Safari has limited support
   - Requires HTTPS (or localhost) for mic access

2. **Firebase Compat SDK:**
   - `DocumentSnapshot.exists` is a method, not a property (fixed in v0.1.4)
   - Firestore transactions may fail if network is unstable

3. **NLP Edge Cases:**
   - Cannot handle complex multi-clause commands
   - Beneficiary name extraction relies on simple pattern matching
   - No support for date/time-based queries

4. **Session Management:**
   - Customer lock doesn't auto-release on browser crash (manual Firestore cleanup needed)
   - No authentication — anyone can join as Supervisor

---

## 📜 License

MIT License - see LICENSE file for details.

---

## 👤 Author

**Dhritiman Haldar**
- GitHub: [@dhritimanhaldar](https://github.com/dhritimanhaldar)

---

## 🙏 Acknowledgments

- Firebase for real-time database
- Web Speech API for voice recognition
- HSBC brand inspiration (educational prototype only)

---

## 🔮 Future Roadmap

- [ ] Multi-language support (Hindi, Bengali)
- [ ] Voice biometric authentication
- [ ] Integration with real banking APIs
- [ ] Mobile-responsive design
- [ ] Advanced NLP with ML models (DialogFlow, Rasa)
- [ ] Customer authentication & session security
- [ ] Transaction reversal & dispute handling
- [ ] Voice feedback via Web Speech Synthesis API

---

**Built with ❤️ for hands-free banking experiences.**
