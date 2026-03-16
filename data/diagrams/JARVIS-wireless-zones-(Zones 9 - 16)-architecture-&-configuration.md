### JARVIS Wireless Zones (Zones 9 - 16) Architecture & Configuration

The JARVIS system features 8 wireless zones that communicate internally via an RF receiver rather than physical terminal blocks [1, 2]. 
# JARVIS Wireless Zones Architecture (433 MHz)

```mermaid
flowchart LR

%% ============================
%% WIRELESS SENSOR LAYER
%% ============================

subgraph SENSORS["Wireless Sensors / Remote Devices"]
S1[Wireless PIR Sensor]
S2[Wireless Door Sensor]
S3[Wireless Panic Remote]
S4[Wireless Smoke Detector]

S5[Encoder IC\nHT12E]
end

S1 --> S5
S2 --> S5
S3 --> S5
S4 --> S5

%% ============================
%% RF TRANSMISSION
%% ============================

S5 -->|433 MHz RF Signal| R1[RF Transmitter Module]

%% ============================
%% RECEIVER SIDE
%% ============================

R1 -->|Wireless Transmission| R2[RF Receiver Module]

subgraph PANEL["JARVIS Main Panel Wireless Interface"]
R2 --> D1[Decoder IC\nHT12D]
D1 --> MCU[Main Microcontroller]
end

%% ============================
%% INTERNAL PANEL PROCESSING
%% ============================

MCU --> Z[Wireless Zone Manager\nZones 9 - 16]

%% ============================
%% ZONE CONFIGURATION
%% ============================

subgraph CONFIG["Zone Mode Configuration"]
Z --> Z1[FIRE Mode\nAlways Active]
Z --> Z2[DAY Mode\nActive in Day]
Z --> Z3[NIGHT Mode\nActive in Night]
Z --> Z4[ISOLATE Mode\nZone Disabled]
end

%% ============================
%% SYSTEM OUTPUT
%% ============================

MCU --> A1[Alarm Processing Engine]
A1 --> A2[Trigger Siren]
A1 --> A3[Activate Auto Dialer]
A1 --> A4[Display Event on LCD]

* Wireless Communication Process
| Step | Operation                                           |
| ---- | --------------------------------------------------- |
| 1    | Sensor detects event                                |
| 2    | Encoder IC (HT12E) converts signal to digital frame |
| 3    | RF transmitter sends signal over **433 MHz**        |
| 4    | RF receiver in panel receives transmission          |
| 5    | Decoder IC (HT12D) converts RF data to digital      |
| 6    | Microcontroller identifies **Zone 9–16**            |
| 7    | Panel executes configured zone mode                 |

* Wireless Zone Configuration Modes
| Mode    | Description                                       |
| ------- | ------------------------------------------------- |
| FIRE    | Zone active at all times                          |
| DAY     | Active only when system is in Day mode            |
| NIGHT   | Active only when system is in Night mode          |
| ISOLATE | Zone is bypassed and becomes inactive             |



* Wireless Remote Control Functions
flowchart LR

R1[Wireless Remote Control]

R1 -->|433 MHz RF| R2[RF Receiver]

R2 --> MCU[Main Microcontroller]

MCU --> F1[Arm System]
MCU --> F2[Disarm System]
MCU --> F3[Reset Alarm]
MCU --> F4[Trigger Panic]


* RF Hardware Components
| Component       | Function                         |
| --------------- | -------------------------------- |
| HT12E Encoder   | Converts sensor input to RF data |
| RF Transmitter  | Sends 433 MHz signal             |
| RF Receiver     | Receives wireless signal         |
| HT12D Decoder   | Decodes RF data                  |
| Microcontroller | Maps signal to wireless zones    |


* JARVIS Zone Mapping
| Zone      | Type             |
| --------- | ---------------- |
| Zone 1–8  | Wired Sensors    |
| Zone 9–16 | Wireless Sensors |


* System Overview
-- The JARVIS panel combines wired zones and wireless RF zones into one alarm system.
-- Signal flow --> Sensor → Encoder → RF Transmitter → RF Receiver → Decoder → Microcontroller → Alarm Logic
-- Wireless zones use 433 MHz RF communication
-- Each wireless zone can be configured as FIRE, DAY, NIGHT, or ISOLATE
-- Remote controls can arm, disarm, reset, or trigger panic



# 433 MHz RF Packet Structure (HT12E / HT12D)

The HT12E encoder converts sensor signals into a **12-bit RF data frame** which is transmitted over **433 MHz RF**.  
The HT12D decoder inside the panel receives the signal and verifies the address before triggering the corresponding zone.

---

## RF Data Packet Format

```mermaid
flowchart LR

A[Start Transmission]

A --> B[Address Bit A0]
B --> C[Address Bit A1]
C --> D[Address Bit A2]
D --> E[Address Bit A3]
E --> F[Address Bit A4]
F --> G[Address Bit A5]
G --> H[Address Bit A6]
H --> I[Address Bit A7]

I --> J[Data Bit D0]
J --> K[Data Bit D1]
K --> L[Data Bit D2]
L --> M[Data Bit D3]

M --> N[End of Frame]


# HT12E Transmission Process
flowchart TD

S1[Sensor Trigger]

S1 --> S2[HT12E Encoder]

S2 --> S3[Generate Address Bits]
S2 --> S4[Generate Data Bits]

S3 --> S5[Combine into 12-bit Frame]

S4 --> S5

S5 --> S6[433 MHz RF Transmitter]

S6 --> S7[Wireless Signal]

# HT12D Reception Process
flowchart TD

R1[RF Receiver Module]

R1 --> R2[HT12D Decoder]

R2 --> R3{Address Match}

R3 -->|Yes| R4[Output Data Bits]

R3 -->|No| R5[Ignore Signal]

R4 --> R6[Send Signal to Microcontroller]


# RF Frame Structure Table

| Field       | Bits    | Purpose                           |
| ----------- | ------- | --------------------------------- |
| Address     | 8 bits  | Identifies the transmitter device |
| Data        | 4 bits  | Sensor state or command           |
| Total Frame | 12 bits | RF transmission frame             |

# Example Data Frame
Address : 10101010
Data    : 0011
-----------------
Frame   : 10101010 0011


---

# File 2: `jarvis_complete_zone_architecture.md`

This diagram shows the **full system architecture combining wired zones, wireless zones, autodialer, and alarm outputs**.

```markdown
# JARVIS Complete Zone Architecture

The JARVIS system integrates **wired sensors, wireless sensors, alarm outputs, and an auto-dialer notification system**.

---

## System Architecture Diagram

```mermaid
flowchart LR

%% WIRED SENSORS
subgraph WIRED["Wired Zones 1-8"]
W1[Panic Switch]
W2[Glass Break Sensor]
W3[Vibration Sensor]
W4[Smoke Detector]
W5[PIR Motion Sensor]
W6[Magnetic Door Switch]
W7[Night Zone Sensor]
W8[Fire / Heat Detector]
end

%% WIRELESS SENSORS
subgraph WIRELESS["Wireless Zones 9-16"]
WL1[Wireless PIR]
WL2[Wireless Door Sensor]
WL3[Wireless Smoke Sensor]
WL4[Wireless Panic Remote]
end

%% RF RECEIVER
subgraph RF["RF Receiver System"]
RF1[433 MHz Receiver]
RF2[HT12D Decoder]
end

%% MAIN PANEL
subgraph PANEL["JARVIS Main Panel"]
MCU[Main Microcontroller]
ZONES[Zone Processing Engine]
end

%% OUTPUTS
subgraph OUTPUT["Alarm Outputs"]
S1[Electronic Siren]
S2[Motorized Siren]
RLY[Relay Outputs]
end

%% AUTODIALER
subgraph DIALER["Whisper G Auto Dialer"]
FIRE[Fire Input]
INTR[Intrusion Input]
TAMP[Tamper Input]
SILENT[Silent Alarm]
end

%% CONNECTIONS
W1 --> MCU
W2 --> MCU
W3 --> MCU
W4 --> MCU
W5 --> MCU
W6 --> MCU
W7 --> MCU
W8 --> MCU

WL1 --> RF1
WL2 --> RF1
WL3 --> RF1
WL4 --> RF1

RF1 --> RF2
RF2 --> MCU

MCU --> ZONES

ZONES --> S1
ZONES --> S2
ZONES --> RLY

ZONES --> FIRE
ZONES --> INTR
ZONES --> TAMP
ZONES --> SILENT

# Zone Structure
| Zone Type      | Zone Numbers | Communication |
| -------------- | ------------ | ------------- |
| Wired Zones    | 1-8          | Direct wiring |
| Wireless Zones | 9-16         | 433 MHz RF    |


# Alarm Event Flow
1. Sensor detects event.
2. Signal reaches JARVIS microcontroller.
3. Panel determines zone type and configuration.
4. Alarm outputs activate:
   - Electronic siren
   - Motorized siren
5. Panel triggers Whisper G auto-dialer to send alerts.

# System Integration Overview
Sensors → JARVIS Panel → Alarm Output + Auto Dialer → User Notification
-- This architecture allows both wired and wireless security sensors to operate in a single integrated system.

# JARVIS Security System — Master Architecture Diagram
# JARVIS Security System Master Architecture

This diagram represents the **complete integrated architecture** of the JARVIS security system, including:

- Wired sensor zones
- Wireless RF zones
- Control interface
- Alarm outputs
- GSM communication
- Cloud monitoring

---

## System Architecture Overview

```mermaid
flowchart LR

%% ==============================
%% WIRED SENSOR LAYER
%% ==============================

subgraph WIRED["Wired Security Sensors (Zones 1–8)"]
W1[Panic Switch]
W2[Glass Break Sensor]
W3[Vibration Sensor]
W4[Smoke Detector]
W5[PIR Motion Sensor]
W6[Magnetic Door Contact]
W7[Night Zone Sensor]
W8[Heat / Fire Detector]
end


%% ==============================
%% WIRELESS SENSOR LAYER
%% ==============================

subgraph WIRELESS["Wireless RF Sensors (Zones 9–16)"]
WL1[Wireless PIR Sensor]
WL2[Wireless Door Sensor]
WL3[Wireless Smoke Detector]
WL4[Wireless Panic Remote]
WL5[Wireless Glass Sensor]
end


%% ==============================
%% RF RECEIVER SYSTEM
%% ==============================

subgraph RF["RF Receiver Subsystem"]
RF1[433 MHz RF Receiver]
RF2[HT12D Decoder]
end


%% ==============================
%% USER CONTROL INTERFACE
%% ==============================

subgraph UI["User Control Interface"]
KEYPAD[Remote Keypad Module]
LCD[LCD Display Interface]
end


%% ==============================
%% MAIN CONTROL PANEL
%% ==============================

subgraph PANEL["JARVIS Main Control Panel"]

MCU[Main Microcontroller]

ZONEPROC[Zone Processing Engine]

EVENT[Alarm Event Manager]

end


%% ==============================
%% ALARM OUTPUT SYSTEM
%% ==============================

subgraph OUTPUT["Alarm Output Devices"]

SIREN1[Electronic Siren]
SIREN2[Motorized Siren Driver]
RELAY[Programmable Relay Outputs]

end


%% ==============================
%% GSM AUTODIALER SYSTEM
%% ==============================

subgraph GSM["GSM Autodialer Module (Whisper G)"]

GSM1[Fire Alarm Input]
GSM2[Intrusion Alarm Input]
GSM3[Tamper Alarm Input]
GSM4[Silent Alarm Input]

MODEM[GSM Modem]

end


%% ==============================
%% CLOUD MONITORING SYSTEM
%% ==============================

subgraph CLOUD["Remote Monitoring"]

SERVER[Cloud Monitoring Server]

APP[Mobile Monitoring App]

WEB[Web Dashboard]

end


%% ==============================
%% WIRED SENSOR CONNECTIONS
%% ==============================

W1 --> MCU
W2 --> MCU
W3 --> MCU
W4 --> MCU
W5 --> MCU
W6 --> MCU
W7 --> MCU
W8 --> MCU


%% ==============================
%% WIRELESS SENSOR FLOW
%% ==============================

WL1 --> RF1
WL2 --> RF1
WL3 --> RF1
WL4 --> RF1
WL5 --> RF1

RF1 --> RF2
RF2 --> MCU


%% ==============================
%% KEYPAD CONTROL
%% ==============================

KEYPAD --> MCU
LCD --> MCU


%% ==============================
%% INTERNAL PANEL LOGIC
%% ==============================

MCU --> ZONEPROC
ZONEPROC --> EVENT


%% ==============================
%% OUTPUT TRIGGERS
%% ==============================

EVENT --> SIREN1
EVENT --> SIREN2
EVENT --> RELAY


%% ==============================
%% AUTODIALER CONNECTIONS
%% ==============================

EVENT --> GSM1
EVENT --> GSM2
EVENT --> GSM3
EVENT --> GSM4

GSM1 --> MODEM
GSM2 --> MODEM
GSM3 --> MODEM
GSM4 --> MODEM


%% ==============================
%% GSM TO CLOUD
%% ==============================

MODEM --> SERVER

SERVER --> APP
SERVER --> WEB
```

# System Functional Layers 
| Layer               | Components               | Function                 |
| ------------------- | ------------------------ | ------------------------ |
| Sensor Layer        | Wired + Wireless sensors | Detect intrusion or fire |
| RF Layer            | 433 MHz Receiver + HT12D | Wireless communication   |
| Control Layer       | Microcontroller          | Process zone events      |
| Output Layer        | Sirens + Relays          | Trigger alarms           |
| Communication Layer | GSM Autodialer           | Send alerts              |
| Monitoring Layer    | Cloud Server             | Remote monitoring        |


# Alarm Event Flow
Sensor Trigger
      ↓
Zone Detection
      ↓
Microcontroller Processing
      ↓
Alarm Event Manager
      ↓
Sirens + Autodialer
      ↓
GSM Network
      ↓
Cloud Monitoring Server
      ↓
Mobile App / Web Dashboard

# System Capabilities
• 8 wired sensor zones
• 8 wireless RF zones
• Remote keypad control
• GSM autodialer alerts
• Cloud monitoring support
• Siren and relay outputs

# Engineering Overview
The JARVIS system operates as a multi-layer embedded security platform:
• Sensor layer captures events
• Microcontroller layer processes alarms
• Communication layer sends alerts via GSM
• Monitoring layer allows remote supervision
This architecture enables scalable security deployments for residential, commercial, and industrial systems.