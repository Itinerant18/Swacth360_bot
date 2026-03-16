# Industrial IoT Monitoring Architecture

```mermaid
flowchart TD

%% Field Devices
A1[Temperature Sensor]
A2[Pressure Sensor]
A3[Humidity Sensor]
A4[Smoke Detector]

%% Edge Layer
B[Industrial Controller / PLC]

%% Gateway
C[IoT Gateway]

%% Network
D[Ethernet / LAN]
E[4G GSM Network]

%% Cloud
F[Cloud IoT Platform]

%% Data Services
G[Database Server]
H[Analytics Engine]

%% Users
I[Web Dashboard]
J[Mobile Monitoring App]

%% Connections
A1 --> B
A2 --> B
A3 --> B
A4 --> B

B --> C

C --> D
C --> E

D --> F
E --> F

F --> G
F --> H

G --> I
H --> I

F --> J