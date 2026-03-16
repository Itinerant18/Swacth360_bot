## Pinnacle Fire Alarm System Block Diagram

This details the interconnected boards, pin cables, and audio flow for the Pinnacle system.

```text
+---------------+      +-------------------------+      +-------------------+
|     SMPS      | ---> |      POWER BOARD        | ---> |   COOLING FAN     |
+---------------+      +-------------------------+      +-------------------+
                         ^       |            |
+---------------+        |       | 16-PIN     v
| 2x BATTERIES  | -------+       |      +-------------------+
+---------------+                v      |      PA AMP       |
                       +-------------------------+          ^
                       |   MAIN MOTHER BOARD     |          |
                       +-------------------------+          | AUX_IN
                         |  |        |          |           |
                  34-PIN |  | 20-PIN | 16-PIN   | 20-PIN    | AUDIO_IN
                         v  v        v          v           |
+---------------+   +-----------+  +-----------+  +-------------------+    +------------+
| LCD / KEYPAD  |   | LED BOARD |  | FIRE ZONE |  |    MIXER BOARD    | <- | MICROPHONE |
| SYSTEM STATUS |   |           |  |   CARD    |  |                   |    +------------+
+---------------+   +-----------+  +-----------+  +-------------------+
        |                 ^                                 |
        |                 |                                 v
        +---(Rx/Tx)-------+                           +------------+
                                                      |  SPEAKERS  |
                                                      +------------+
```

### Interconnections
- `SMPS` + `2x BATTERIES` provide power to `POWER BOARD`
- Power Board to Mother Board: Power Distribution
- Mother Board to LCD/Keypad: `34-PIN`
- Mother Board to LED Board: `20-PIN` (and Rx/Tx from Keypad)
- Mother Board to Fire Zone Card: `16-PIN`
- Mother Board to Mixer Board: `20-PIN`


### Pinnacle Fire Alarm System — Detailed Architecture Diagram
# Pinnacle Fire Alarm System Architecture

This diagram illustrates the **complete internal architecture** of the Pinnacle Fire Alarm and Public Address (PA) system, including:

- Power subsystem
- Control motherboard
- Fire detection zones
- Audio mixer and amplifier
- User interface modules

---

## System Architecture Diagram

```mermaid
flowchart LR

%% ==========================
%% POWER SYSTEM
%% ==========================

subgraph POWER["Power Subsystem"]

SMPS[SMPS Power Supply]

BAT[2x Backup Batteries]

PWRBD[Power Distribution Board]

FAN[Cooling Fan]

end


%% ==========================
%% MAIN CONTROL BOARD
%% ==========================

subgraph CONTROL["Main Control System"]

MB[Main Mother Board\n(System Controller)]

end


%% ==========================
%% USER INTERFACE
%% ==========================

subgraph UI["User Interface Modules"]

LCD[LCD Display + Keypad]

LED[LED Status Board]

end


%% ==========================
%% FIRE DETECTION SYSTEM
%% ==========================

subgraph FIRE["Fire Detection Subsystem"]

ZONECARD[Fire Zone Card\n(Sensor Inputs)]

DETECTORS[Fire Sensors\nSmoke / Heat / MCP]

end


%% ==========================
%% AUDIO ANNOUNCEMENT SYSTEM
%% ==========================

subgraph AUDIO["Public Address System"]

MIC[Microphone Input]

MIXER[Mixer Board]

AMP[PA Amplifier]

SPEAKERS[Speaker Network]

end


%% ==========================
%% POWER FLOW
%% ==========================

SMPS --> PWRBD
BAT --> PWRBD

PWRBD --> MB
PWRBD --> FAN
PWRBD --> AMP


%% ==========================
%% CONTROL CONNECTIONS
%% ==========================

MB -->|34-PIN| LCD

MB -->|20-PIN| LED

MB -->|16-PIN| ZONECARD

MB -->|20-PIN| MIXER


%% ==========================
%% FIRE SENSOR CONNECTIONS
%% ==========================

DETECTORS --> ZONECARD

ZONECARD --> MB


%% ==========================
%% AUDIO FLOW
%% ==========================

MIC --> MIXER

MIXER -->|AUX_IN| AMP

AMP --> SPEAKERS


%% ==========================
%% STATUS COMMUNICATION
%% ==========================

LCD -->|Rx/Tx| LED
```

### Hardware Interconnections
| Connection                    | Cable Type     |
| ----------------------------- | -------------- |
| Mother Board → LCD/Keypad     | 34-PIN Ribbon  |
| Mother Board → LED Board      | 20-PIN Ribbon  |
| Mother Board → Fire Zone Card | 16-PIN         |
| Mother Board → Mixer Board    | 20-PIN         |
| Mixer → PA Amplifier          | AUX Audio Line |

```
```
### Power Distribution
flowchart TD

SMPS[AC to DC SMPS]

BAT[Backup Batteries]

PWRBD[Power Board]

MB[Mother Board]

AMP[PA Amplifier]

FAN[Cooling Fan]

SMPS --> PWRBD

BAT --> PWRBD

PWRBD --> MB
PWRBD --> AMP
PWRBD --> FAN
```
```
### Audio Signal Flow
flowchart LR

MIC[Microphone]

MIXER[Mixer Board]

AMP[PA Amplifier]

SPK[Speakers]

MIC --> MIXER

MIXER --> AMP

AMP --> SPK
```
```
### Fire Alarm Detection Flow
Fire Sensor Trigger
        ↓
Fire Zone Card
        ↓
Mother Board Processing
        ↓
Alarm Event Generated
        ↓
LED Indicators + LCD Alert
        ↓
Public Address Announcement
        ↓
Speakers Broadcast Alarm

```
```
### System Functional Layers
| Layer           | Components                   | Purpose                 |
| --------------- | ---------------------------- | ----------------------- |
| Power Layer     | SMPS, Batteries, Power Board | System power and backup |
| Control Layer   | Mother Board                 | Central system control  |
| Detection Layer | Fire Zone Card + Sensors     | Detect fire conditions  |
| Interface Layer | LCD, Keypad, LED Board       | User monitoring/control |
| Audio Layer     | Mixer, Amplifier, Speakers   | Alarm announcements     |

