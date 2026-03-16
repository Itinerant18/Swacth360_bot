# Whisper Auto-Dialer Hardware Architecture

```mermaid
flowchart LR

%% Sensors
A[Fire Sensor]
B[Intrusion Sensor]
C[Tamper Switch]
D[Wire Cut Detection]

%% Control System
E[Alarm Control Panel]

%% Auto Dialer
F[Whisper Auto Dialer Controller]

%% Communication Modules
G[GSM Modem]
H[PSTN Line Interface]

%% Power
I[SMPS Power Supply]
J[Battery Backup]

%% Output
K[SMS Alert]
L[Voice Call]
M[Monitoring Center]
N[User Mobile Phones]

%% Connections
A --> E
B --> E
C --> E
D --> E

E --> F

F --> G
F --> H

I --> F
J --> F

G --> K
G --> L
H --> L

K --> N
L --> N

L --> M