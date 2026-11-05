# 📖 How EduMonitor Works — Simple & Clear Guide

Welcome to **EduMonitor**! This guide explains what EduMonitor is, how every part of it works in simple and clear words, and how teachers, students, and administrators use the platform.

---

## 💡 What is EduMonitor?

**EduMonitor** is a smart virtual classroom and student engagement monitoring platform. 

In traditional online classes (like standard video calls), teachers often have no idea if students are actually paying attention, if they are tabbed away playing games or browsing social media, or if they are struggling with the lecture.

EduMonitor solves this problem:
1. **Live Virtual Lectures**: High-quality video, audio, and screen sharing powered by WebRTC.
2. **Privacy-Friendly Attention Tracking**: Measures whether students are focused on the lecture, inactive, or tabbed away—**without** recording or saving their webcam video.
3. **Interactive Classroom Tools**: Live polls, pop quizzes, hand raising, and text chat.
4. **Student Progress & Dossiers**: Teachers can see every student's attendance rate, focus score, and historical performance.
5. **Assignments with Teacher Remarks**: Teachers create assignments, students submit their work (answers + project links), and teachers grade them with constructive, personalized remarks.
6. **Curated Study Materials**: Teachers share lecture notes, documents, and YouTube video walkthroughs that students can view directly inside the application.
7. **Institutional Reports**: Teachers and admins can download clean audit reports in **PDF** or **CSV** format.

---

## 👥 The 3 User Roles (Who Uses What?)

EduMonitor is designed around three distinct user roles:

```
                  ┌─────────────────────────────────────────┐
                  │               EduMonitor                │
                  └────────────────────┬────────────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
  👨‍🏫 TEACHER                     🎓 STUDENT                     ⚙️ ADMIN
  • Create Classes               • Join with 6-char Code        • System Overview
  • Start Video Sessions         • Attend Video Lectures        • Manage All Users
  • Live Telemetry Grid          • Hand Raise & Live Chat       • Audit Classes
  • Create Polls & Quizzes       • Answer Polls & Quizzes       • Global Reports
  • View Student Dossiers        • Submit Coursework
  • Grade & Add Remarks          • Read Teacher Remarks
  • Share YouTube & Notes        • Watch Video Walkthroughs
```

---

### 1. 👨‍🏫 Teacher Role

Teachers have full control over their virtual classrooms and student assessments:

* **Create Classes**: Teachers create courses (e.g. *CS101: Data Structures*). The system generates a unique **6-character Join Code** (e.g. `CS101X`) to share with students.
* **Launch Virtual Lectures**: Teachers can schedule lectures or start instant live sessions. During class, the teacher can broadcast video, audio, and share their computer screen.
* **Live Telemetry & Inactivity Alerts**: A real-time grid shows every student with a live status badge:
  * 🟢 **Active / Focused**: Student is looking at the classroom tab and actively engaged.
  * 🟡 **Tab Away**: Student switched to another browser tab or minimized the window.
  * 🔴 **Inactive / Idle**: Student has not moved their mouse or typed for several minutes.
  * ⚠️ If a student is inactive for 3+ minutes, the teacher receives an instant automatic alert.
* **Instant Classroom Interactions**:
  * **Polls**: Ask quick questions (e.g. "Did everyone understand this proof? Yes / No").
  * **Live Quizzes**: Broadcast timed checkpoint quizzes with multiple-choice questions. Results calculate in real time.
* **Students Directory & Deep Dossiers**:
  * The **Students** tab displays a directory of all learners across the teacher's classes.
  * Clicking on any student opens their **Performance Dossier** showing:
    * Their overall attendance percentage.
    * Average engagement and visual focus scores.
    * A historical timeline of every lecture attended.
    * Every assignment submitted, including marks and past teacher remarks.
* **Assignments & Coursework**:
  * Teachers can publish new assignments with due dates, maximum points, instructions, and reference links (e.g. starter code repositories).
  * Teachers can open the **Submissions Review Modal** to inspect student submissions, enter points, and type **actionable teacher remarks/feedback** (e.g. *"Great recursion logic! Keep an eye on memory limits for larger inputs."*).
* **Curated Study Materials**:
  * Teachers can upload study materials in 4 categories:
    1. **YouTube Video Walkthroughs**: Just paste any YouTube URL; EduMonitor extracts the video ID and embeds the video player.
    2. **Lecture Notes**: Formatted summaries, formulas, and cheat sheets.
    3. **Reference Documents**: Links to cloud drives or PDFs.
    4. **Web Links**: Recommended articles or guides.

---

### 2. 🎓 Student Role

Students experience an interactive, distraction-free learning space:

* **Enroll in Classes**: Enter the teacher's 6-character course code to join a class space.
* **Enter Virtual Lectures**:
  * Click **Enter Live** to join an ongoing lecture.
  * If the lecture is scheduled for later, students enter a **Classroom Standby** waiting room. As soon as the teacher clicks "Start Session", all waiting students are automatically connected into the live room!
* **Participate in Class**:
  * **Raise Hand ✋**: Signals the teacher that the student has a question. The teacher sees a queue of raised hands.
  * **Live Chat 💬**: Real-time messaging with classmates and the instructor.
  * **Vote in Polls & Answer Quizzes**: Vote on pop-up polls and answer checkpoint quizzes with live score calculation.
* **Turn in Coursework**:
  * Browse the **Assignments** section to see upcoming deadlines and instructions.
  * Write text responses and attach project/code URLs (GitHub, Google Drive, etc.).
  * Once the teacher grades the work, the student can read the teacher's **remarks and feedback** directly on their dashboard!
* **Access Study Materials**:
  * Open the **Study Materials** tab to watch video walkthroughs, read instructor lecture notes, and review attached documents anytime.

---

### 3. ⚙️ Administrator Role

System administrators oversee institutional operations:

* **Platform Overview**: High-level telemetry showing total users, active courses, and live broadcasting sessions.
* **User Management**: View user profiles, change roles (`student`, `teacher`, `admin`), or deactivate accounts.
* **Audit & Compliance**: Download comprehensive institutional audit reports in **PDF** and **CSV** formats.

---

## 🧠 How the Privacy-First Engagement Scoring Works

Unlike invasive surveillance tools that record students or capture their screens, EduMonitor respects student privacy:
* **No video recordings are ever saved to the server.**
* **Face detection runs 100% locally in the student's browser** using `face-api.js` (WebAssembly/WebGL). Only anonymous numerical telemetry pings (e.g. `facePresent: true`, `tabVisible: true`) are sent every 5 seconds.

### The Scoring Formula (0 to 100%)

Each student receives a composite engagement score calculated from four components:

$$\text{Final Score} = (\text{Attendance} \times 25\%) + (\text{Focus} \times 30\%) + (\text{Participation} \times 30\%) + (\text{Face Presence} \times 15\%)$$

1. **Attendance (25%)**: How much of the lecture duration the student was present in the room.
2. **Focus (30%)**: Measures attention by penalizing time spent tabbed away to other websites or idle without keyboard/mouse interaction.
3. **Participation (30%)**: Rewards active learning: sending chat messages (+1 pt), answering polls (+2 pts), completing quizzes (+3 pts), and raising hands (+1 pt).
4. **Face Presence (15%)**: Measures whether the student is facing the screen (opt-in; works without sending any video data to the cloud).

---

## 🔄 Real-Time Data Flow (Behind the Scenes)

```
[Student Browser]                      [Flask + Socket.IO Server]                 [Teacher Browser]
       │                                           │                                      │
       │─── 1. "join_session" ────────────────────>│                                      │
       │                                           │─── 2. "participant_update" ────────>│ (Student appears in grid)
       │                                           │                                      │
       │─── 3. Activity Ping (every 5s) ──────────>│                                      │
       │    { tabVisible, isIdle, facePresent }    │─── 4. Telemetry Update ─────────────>│ (Badges: Focused / Tab Away)
       │                                           │                                      │
       │                                           │<── 5. Broadcast Poll / Quiz ─────────│
       │<── 6. Receive Poll / Quiz ────────────────│                                      │
       │                                           │                                      │
       │─── 7. Submit Answer ─────────────────────>│                                      │
       │                                           │─── 8. Real-Time Results Update ─────>│ (Live bar chart updates)
```

1. **WebRTC Mesh**: Direct peer-to-peer audio/video streaming connects teacher and student cameras with ultra-low latency.
2. **Socket.IO Realtime Gateway**: Handles instant signaling, chat messages, hand raises, quiz broadcasts, and 5-second attention telemetry pings.
3. **Firebase / Firestore**: Persists user profiles, enrolled classes, scheduled lectures, assignment submissions, grades, remarks, and study materials.
4. **Local Fallback Engine**: If no Firebase credentials are provided, EduMonitor automatically boots an in-memory database with pre-seeded data, so anyone can run and test the application with zero cloud setup!

---

## 🎨 Visual Design — White Slate Theme

EduMonitor uses a clean, high-contrast **White Slate** design system:
* **Background**: Clean White / Slate (`#f8fafc`).
* **Cards**: Crisp white surfaces (`#ffffff`) with subtle 1px slate borders (`#e2e8f0`).
* **Primary Accent**: Deep Teal Cyan (`#06858e`) for buttons, active badges, and focus indicators.
* **Secondary / Information Accents**: Emerald Green for live states, Amber for warnings/notes, and Slate Blue for telemetry charts.
* **Typography**: Crisp modern sans-serif typography paired with monospaced code fonts for join codes and IDs.

---

## 🚀 How to Run the Project (3 Steps)

### Step 1: Install Python Dependencies
Make sure you have Python 3.10 or higher installed, then run:
```bash
pip install -r requirements.txt
```

### Step 2: Start the Server
```bash
python app.py
```

### Step 3: Open in Browser
Visit **[http://localhost:5000](http://localhost:5000)**.

### Quick Institutional Logins (Pre-seeded Production Accounts)
On the login screen, you can click the **1-Click Institutional Access** cards or enter these credentials:

| Role | Institutional Email | Quick Alias | Password | What You Can Test |
| :--- | :--- | :--- | :--- | :--- |
| **Faculty Chair** | `robert.anderson@edumonitor.edu` | `teacher@example.com` | `password123` | Start lectures, view student directory, grade assignments, add YouTube notes |
| **AI Professor** | `elena.rostova@edumonitor.edu` | — | `password123` | AI 402 courses, deep learning problem sets |
| **Cloud Professor** | `marcus.sterling@edumonitor.edu` | — | `password123` | SE 250 distributed systems, Raft consensus |
| **Senior Scholar** | `liam.chen@student.edumonitor.edu` | `student@example.com` | `password123` | Join live rooms, submit assignments, see teacher remarks, watch videos |
| **Data Scholar** | `sophia.rodriguez@student.edumonitor.edu` | `student2@example.com` | `password123` | Data science courses, coursework submissions |
| **Dean / Admin** | `admin@edumonitor.edu` | `admin@example.com` | `password123` | Inspect all users, download PDF/CSV institutional reports |

---

## 🧪 Running the Automated Test Suite

To verify that all features, security roles, scoring algorithms, and database queries work 100%:
```bash
python test_app.py
```
This runs 11 automated test suites covering Auth, Classes, Quizzes, Socket.IO, Student Directory, Assignments & Remarks, Study Materials, and Session Join.

