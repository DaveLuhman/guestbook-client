# Guestbook Kiosk Client: System Architecture and Planning

## 📏 Project Goal

**Build a kiosk client for the Guestbook system** that:

- Captures guest entries from HID devices (barcode and/or MSR)
- Submits those entries to the central API
- Handles offline scenarios gracefully (e.g., retries on failure)
- Authenticates with a per-device token
- Provides minimal feedback to users (success/fail/error sounds or visual cue)
- Optionally sends heartbeats to the server for liveness tracking

---

## 📙 High-Level System Design

### 1. Core Responsibilities

| Responsibility          | Detail                                                      | Complete |
| ----------------------- | ----------------------------------------------------------- | -------- |
| Input acquisition       | HID device listeners (scanner, swiper)                      | [X]       |
| Entry formatting        | Consistent data object (onecard, name, timestamp, deviceId) | [x]       |
| Submission to API       | `POST /api/v1/entries/submit`                               | [x]       |
| Local queue & retry     | File-based or SQLite-based buffer                           | []       |
| Config + auth           | Token stored locally in JSON                                | [x]       |
| Heartbeat               | `GET /api/v1/devices/heartbeat/{token}` ping                | [x]       |
| Sound + visual feedback | Play success/error sound; maybe flash background briefly    | []       |
| UI                      | Minimal: config screen + status indicator only              | []       |

---

## 🧱 Proposed Folder Structure

```text
guestbook-client/
├── electron/
│   ├── main.js                # Electron app entry
│   ├── preload.js             # Secure API bridge
│   └── windows/
│       └── mainWindow.html
├── src/
│   ├── hid/
│   │   ├── barcodeScanner.js
│   │   ├── magtekSwiper.js
│   │   └── HIDManager.js
│   ├── network/
│   │   ├── submitEntry.js     # Posts entries to API
│   │   └── heartbeat.js
│   ├── queue/
│   │   └── retryQueue.js      # Local queue for failed submissions
│   ├── config/
│   │   └── deviceConfig.js    # Loads/saves token and device info
│   ├── sound/
│   │   └── soundManager.js    # New, headless implementation
│   └── index.js               # App startup logic (init HID, etc.)
├── public/
│   └── sounds/
│       ├── success.wav
│       └── error.wav
├── package.json
└── README.md
```

---

## ⚙️ Initial Planning Checklist

| Area             | Questions to Decide                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| ✅ Authentication | Should the client prompt for token on first launch? Register itself? Pull token from config?             |
| ✅ Storage        | JSON file or SQLite for queue/config?                                                                    |
| ✅ Sound          | WebAudio API in renderer or Node native bindings (e.g. `node-speaker`, `play-sound`, or `audioworklet`)? |
| 🧠 Feedback      | UI modal? LED feedback? Sound-only?                                                                      |
| ⚠️ Offline Mode  | Should the kiosk continue silently if the network is down? Show warning UI?                              |
| 🔁 Retry Logic   | Backoff timing? Max retries? Auto-retry vs manual?                                                       |
| 🖥️ OS Support   | Will this run only on Raspberry Pi (Linux)? Will you also support Windows clients?                       |

---

## ⚡ Next Steps

To proceed methodically, choose a focus area:

1. **Config Format & First-Launch Flow**: Determine how token and device ID are stored or retrieved
2. **Entry Submission Logic**: Define payload shape, error handling, and retry/backoff rules
3. **UI Feedback & States**: Design kiosk-facing user feedback for success/failure/network state
4. **Device Bootstrapping:** Design process-flow for how devices will initialize, both OOBE and normal boot-up.
5. **Milestone Roadmap**: Establish phased build targets and testing steps

---

Prepared for inclusion in the Guestbook Kiosk Client project plan.

