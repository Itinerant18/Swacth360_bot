# Integrated Security System Architecture

```mermaid
flowchart TD

%% Sensors
A1[Fire Detector]
A2[Smoke Detector]
A3[Door Sensor]
A4[Motion Sensor]
A5[Tamper Switch]

%% Alarm Panel
B[Security Alarm Panel]

%% Remote Interface
C[Remote Keypad]

%% Auto Dialer
D[Whisper Auto Dialer]

%% Communication Layer
E[GSM Network]
F[PSTN Network]

%% Internet / Cloud
G[Router / LAN]
H[Cloud Monitoring Server]

%% Users
I[Security Control Room]
J[Mobile Users]

%% Connections
A1 --> B
A2 --> B
A3 --> B
A4 --> B
A5 --> B

C --> B

B --> D

D --> E
D --> F

E --> J
F --> J

B --> G

G --> H

H --> I
H --> J