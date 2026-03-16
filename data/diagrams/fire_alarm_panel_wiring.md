# Complete Fire Alarm Panel Wiring

```mermaid
flowchart LR

%% Sensors
A[Smoke Detector]
B[Heat Detector]
C[Manual Call Point]
D[Fire Alarm Bell]
E[Fire Alarm Strobe]

%% Control Panel
F[Fire Alarm Control Panel]

%% Power
G[SMPS Power Supply]
H[Battery Backup]

%% Communication
I[Whisper Auto Dialer]
J[GSM Modem]
K[PSTN Line]

%% Users
L[Monitoring Center]
M[Mobile Phones]

%% Wiring Connections
A --> F
B --> F
C --> F

F --> D
F --> E

G --> F
H --> F

F --> I

I --> J
I --> K

J --> M
K --> M

J --> L