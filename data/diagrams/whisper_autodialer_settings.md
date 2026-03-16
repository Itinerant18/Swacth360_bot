# Whisper Auto-Dialer – System Architecture Diagram

```mermaid
flowchart TD

%% User Interaction
A[Power ON System] --> B[Press SETUP Key]
B --> C[Enter User Password]
C --> D{Authentication}

D -->|Valid| E[Setup Command Interface]
D -->|Use Master Password 1367| E

%% Command Interface
E --> F[Enter 2 Digit Command Code]

%% Core Configuration Modules
F --> G[Voice Message Module]
F --> H[Telephone Number Module]
F --> I[System Date & Time]
F --> J[Repeat Counters]
F --> K[Alarm Input Configuration]
F --> L[System Options]
F --> M[Logs & Memory]
F --> N[Diagnostics]

%% Voice Message
G --> G1[Record Message – Code 11]
G --> G2[Playback Message – Code 21]

%% Telephone Numbers
H --> H1[Fire Numbers 30–39]
H --> H2[Intrusion Numbers 40–49]
H --> H3[View Stored Numbers 51 / 52]
H --> H4[Dialing Speed Setting 53]

%% Date and Time
I --> I1[Set System Date – 71]
I --> I2[Set System Time – 72]
I --> I3[Branch Name – 75]
I --> I4[Branch Address – 76]

%% Repeat Settings
J --> J1[SMS Repeat 81]
J --> J2[Call Repeat 82]
J --> J3[Voice Playback Repeat 83]

%% Alarm Inputs
K --> K1[Fire Input Type – 91]
K --> K2[Intrusion Input Type – 92]
K --> K3[Tamper Input Type – 93]

%% Options
L --> L1[Power ON SMS]
L --> L2[Call/SMS Trigger Settings]
L --> L3[LCD Backlight Duration]

%% Logs
M --> M1[View Event Logs – 60]
M --> M2[Erase Logs – 61]
M --> M3[Factory Reset – 98]
M --> M4[Change Password – 99]

%% Diagnostics
N --> N1[Test Key]
N1 --> N2[Enter Phone Number]
N2 --> N3{Select Mode}
N3 --> N4[SMS Test]
N3 --> N5[Call Test]
N3 --> N6[SMS + Call Test]

%% System Output
K --> O[Alarm Trigger]
O --> P[Auto Dialer Engine]
P --> Q[Send SMS Alert]
P --> R[Place Voice Call]
P --> S[Play Recorded Message]
```

---

## Default Credentials

| Type            | Password |
| --------------- | -------- |
| User Password   | `1234`   |
| Master Password | `1367`   |

> The **Master Password cannot be changed**.
