# 🎓 EduMonitor — Virtual Classroom Student Monitoring Platform

A real-time student engagement monitoring system for virtual classrooms built with **Python (Flask + Flask-SocketIO)**, **Firebase / Firestore**, **WebRTC**, and **Vanilla Modern JS**.


---

## 🌟 Key Features

### 1. 👨‍🏫 Teacher Role
- **Class & Session Management**: Create classes, generate join codes, schedule and launch live sessions.
- **Students Directory & Deep Dossiers**: View cross-class student roster and inspect individual learner performance dossiers with attendance velocity, focus index, session history, and coursework status.
- **Coursework & Assignments**: Create assignments with due dates, maximum points, and starter links; review submissions, assign marks, and provide constructive **teacher remarks/feedback**.
- **Study Materials Hub**: Share lecture notes, documents, and curated YouTube video walkthroughs with embedded playback.
- **Live Classroom Controls**: Video/mic/screen share controls, broadcast instant polls and multi-question quizzes.
- **Real-Time Monitoring Grid**: Live visual dashboard displaying all connected students with status badges (Active, Idle, Tab Away, Face Detection).
- **Automated Inactivity Alerts**: Instant alerts when students lose focus or remain inactive for 3+ minutes.
- **Comprehensive Reports**: Dynamic Chart.js visualizations (engagement distribution, class radar breakdowns) with one-click **CSV** and **PDF** export.

### 2. 🎓 Student Role
- **Seamless Participation**: Join classes with a 6-character code or enter live sessions directly via code/link (with standby waiting room for scheduled lectures).
- **Coursework Submissions**: Submit written explanations and project/code URLs, and receive grades and personal remarks from teachers.
- **Study Materials Access**: Watch YouTube video walkthroughs in an embedded player and read lecture notes.
- **Interactive Tools**: In-session chat, raise hand ✋ with visual queue indicator, instant poll voting, and live quiz answering.
- **Privacy-Preserving Activity Detection**:
  - Window & tab visibility tracking (*Page Visibility API*).
  - Mouse & keyboard idle detection.
  - Opt-in face presence tracking using client-side `face-api.js` (no video frames leave the browser).
- **Personal Engagement History**: View past session attendance, focus score, and participation history in your profile.

### 3. ⚙️ Admin Role
- **Platform Analytics**: High-level platform statistics (total users, active classes, live sessions).
- **User Management**: View all platform users, update roles (`student`, `teacher`, `admin`), and enable/disable accounts.
- **Class & Session Oversight**: Monitor and audit all classes across the institution.

---

## 📐 Engagement Scoring Algorithm

Engagement scores (0–100%) are calculated per student per session using weighted behavioral metrics:

$$\text{Score} = w_1 \cdot \text{Attendance}\% + w_2 \cdot \text{Focus}\% + w_3 \cdot \text{Participation}\% + w_4 \cdot \text{FacePresence}\%$$

| Component | Default Weight | Calculation Basis |
| :--- | :---: | :--- |
| **Attendance** | **25%** | $\frac{\text{Time present in session}}{\text{Total session duration}}$ |
| **Focus** | **30%** | $1 - \frac{\text{Tab away time} + 0.5 \times \text{Idle time}}{\text{Total session duration}}$ |
| **Participation** | **30%** | Normalized sum: $\text{Chats} + 2 \times \text{Poll Responses} + 3 \times \text{Quiz Answers} + \text{Hand Raises}$ |
| **Face Presence** | **15%** | $\frac{\text{Face detected duration}}{\text{Total session duration}}$ *(opt-in client-side)* |

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- Python 3.10+ (tested on Python 3.13)
- Modern web browser (Chrome, Edge, Firefox, or Safari)

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Run the Application
```bash
python app.py
```
Open **[http://localhost:5000](http://localhost:5000)** in your browser.

---

## ⚡ Zero-Setup Local Mode & Firebase Cloud Dual Support

The platform runs in **two modes**:

### Mode A: Zero-Setup Institutional Database Mode (Default — Instant Out of the Box)
- If `firebase_admin_key.json` is not present, EduMonitor automatically starts its high-performance local database with disk persistence (`data/edumonitor_db.json`).
- The system comes pre-seeded with 5 university courses, faculty profiles, scholar records, assignments, and sessions:

| Role | Institutional Email | Quick Alias | Password | Pre-seeded Department / Resources |
| :--- | :--- | :--- | :--- | :--- |
| **Faculty Chair** | `robert.anderson@edumonitor.edu` | `teacher@example.com` | `password123` | *CS 301: Advanced Algorithms* & *CY 310: Network Security* |
| **AI Professor** | `elena.rostova@edumonitor.edu` | — | `password123` | *AI 402: Deep Neural Networks & Transformers* |
| **Cloud Professor** | `marcus.sterling@edumonitor.edu` | — | `password123` | *SE 250: Distributed Systems* & *CS 220: Full-Stack Web* |
| **Senior Scholar** | `liam.chen@student.edumonitor.edu` | `student@example.com` | `password123` | Enrolled across CS 301, AI 402, SE 250, CS 220 |
| **Data Scholar** | `sophia.rodriguez@student.edumonitor.edu` | `student2@example.com` | `password123` | Enrolled across CS 301, AI 402, CY 310, CS 220 |
| **Dean / Admin** | `admin@edumonitor.edu` | `admin@example.com` | `password123` | Full academic administration oversight |

> [!TIP]
> On the Sign In screen, click any of the **1-Click Institutional Access** cards (**Dr. Anderson**, **Liam Chen**, **Dr. Vance**) for instant 1-click access!

### Mode B: Google Cloud Firebase Mode (Running on Other Computers / Production)
When cloning to another computer, you can connect your Google Cloud Firebase project without editing any frontend code (preventing secret leakage):
1. **Option 1 (Recommended)**: Place your Firebase service account private key as **`firebase_admin_key.json`** in the project root.
2. **Option 2 (Environment variables)**: Copy `.env.example` to `.env` and fill in your Firebase project credentials:
   ```env
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_API_KEY=AIzaSy...your-web-api-key
   FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
   ```
3. Run `python app.py`. EduMonitor automatically detects your credentials, initializes the Admin SDK, and syncs client-side authentication dynamically!

---

## 🧪 Running Automated Tests

Run the comprehensive unit and integration test suite:

```bash
python test_app.py
```

Tests cover:
- Engagement scoring algorithm math and clamping
- User authentication and role-based access control
- Class lifecycle (create, list, join with code, view students)
- Session lifecycle (schedule, live transition, attendance, quiz creation)
- Report exports (Session CSV, Session PDF, Class CSV, Class PDF)
- Admin statistics and user management
- Socket.IO real-time communications (chat, hand-raising, activity pings)
- Student directory & deep performance dossiers
- Assignments & Coursework system with grading and teacher remarks
- Study Materials hub with YouTube video walkthroughs and lecture notes
- Session joining by join code and session ID

---

## 📖 Simple Explanatory Guide

For a simple, beginner-friendly explanation of how the entire platform operates, see:
👉 **[HOW_IT_WORKS.md](file:///e:/student_monitoring/HOW_IT_WORKS.md)**

---

## 📁 Project Architecture

```
student_monitoring/
├── app.py                  # Flask + Socket.IO entry point
├── config.py               # Firebase config & local emulator switcher
├── mock_firebase.py        # High-fidelity in-memory Firestore & Auth emulator
├── requirements.txt        # Python package dependencies
├── test_app.py             # Full automated test suite (11/11 tests)
├── HOW_IT_WORKS.md         # Simple plain-English guide to the platform
├── firebase_admin_key.example.json # Service account template
│
├── auth/
│   ├── routes.py           # Register, login, profile, user listing
│   └── middleware.py       # JWT & Firebase token verification decorator
│
├── classes/
│   └── routes.py           # Class CRUD, student enrollment, teacher student dossiers
│
├── assignments/
│   └── routes.py           # Coursework CRUD, submissions, grading & teacher remarks
│
├── materials/
│   └── routes.py           # Study materials, YouTube video parser, lecture notes
│
├── sessions/
│   ├── routes.py           # Session lifecycle, attendance, polls, quizzes, join
│   └── realtime.py         # Socket.IO handlers (video signaling, chat, alerts, pings)
│
├── monitoring/
│   ├── routes.py           # Activity log queries & engagement score calculation
│   └── scoring.py          # Mathematical engagement scoring algorithm
│
├── reports/
│   └── routes.py           # CSV generation & ReportLab PDF report generation
│
├── admin/
│   └── routes.py           # System metrics, user activation/deactivation
│
└── static/
    ├── index.html          # SPA shell, modals, and templates
    ├── css/
    │   └── style.css       # White Slate luxury design system
    └── js/
        ├── app.js          # SPA router, page controller, modal handlers
        ├── firebase-init.js# Dual Firebase Auth / Local JWT manager
        ├── socket-client.js# Socket.IO client, hand-raise & poll UI
        ├── activity-monitor.js# Page visibility, idle timer & face-api detection
        ├── video.js        # WebRTC peer-mesh video & screen sharing
        ├── dashboard.js    # Teacher real-time activity monitoring grid
        └── charts.js       # Chart.js radar, doughnut, and history visualizations
```

