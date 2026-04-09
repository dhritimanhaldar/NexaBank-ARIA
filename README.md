# NexaBank-ARIA 🏦

A browser-first NexaBank voice assistant demo. The app has been refactored from a monolithic `index.html` into a clean multi-file layout while preserving direct browser usage and hands-free interaction.

## What this repo contains

- `index.html` — main application shell and UI markup
- `assets/css/variables.css` — theme values, color tokens, spacing
- `assets/css/base.css` — resets, typography, and body styles
- `assets/css/layout.css` — shell grid layout and responsive panels
- `assets/css/components.css` — UI cards, buttons, badges, and tables
- `assets/css/states.css` — animations, transitions, and state styles
- `assets/js/helpers.js` — utility functions
- `assets/js/profile.js` — customer profile helpers
- `assets/js/state.js` — shared application state
- `assets/js/dom.js` — DOM references and helpers
- `assets/js/log.js` — logging, toast, and export support
- `assets/js/ledger.js` — transaction ledger and balance updates
- `assets/js/waveform.js` — audio waveform rendering
- `assets/js/voice-ui.js` — status indicators and microphone controls
- `assets/js/nlp.js` — local natural language parsing
- `assets/js/intents.js` — intent responses and action logic
- `assets/js/process-input.js` — command processing and follow-up prompts
- `assets/js/mic.js` — microphone initialization and speech recognition
- `assets/js/app-init.js` — bootstrapping and startup behavior
- `assets/js/globals.js` — helper safety wrappers for inline event handlers

## Run instructions

1. Open `index.html` directly in a browser.
2. Allow microphone access when prompted.
3. Speak naturally or type a command in the input field.

> Best experience: Chrome / Edge with microphone permissions enabled.

## Supported interactions

- Transfer money: "Send 2500 to Priya from savings"
- Pay bills: "Pay electricity bill 1200"
- Check balance: "What is my current balance?"
- Block card: "Block my debit card"
- Request statements: "Show my last month statement"
- Profile info: "What is my email address?"

## Notes

- This is a pure client-side demo with no build tools.
- The experience uses the Web Speech API and Web Audio API.
- Local storage is used for microphone permission state.
- No backend API is required.

## License

MIT License
