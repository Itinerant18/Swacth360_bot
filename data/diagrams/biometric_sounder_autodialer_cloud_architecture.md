# Security & Monitoring Systems Architecture

### Bio-Smart Access Control • iHoot Intelligent Sounder • Whisper Auto-Dialer • Swatch 360 Cloud Monitoring

---

# 1. Bio-Smart Biometric Access Control System

## 1.1 System Overview

The **Bio-Smart Access Control System** is an integrated authentication platform combining:

* biometric fingerprint identification
* RFID / Mifare card authentication
* keypad-based PIN verification

The system uses a **32-bit ARM Cortex-M microcontroller** as its central processing unit and supports multiple access control interfaces including **Ethernet, USB, and Wiegand**.

Typical deployment locations:

* bank branches
* server rooms
* vault access areas
* restricted corporate zones

---

## 1.2 Hardware Architecture

```mermaid
flowchart LR

PWR[12V DC Power Supply]

MCU[ARM Cortex-M Controller]

FP[Fingerprint Sensor]
RFID[RFID / Mifare Reader]
KEYPAD[Membrane Keypad]
EXIT[Exit Switch]
RTC[RTC + EEPROM]

LCD[LCD Display]
RELAY[Door Lock Relay]
BUZZER[Buzzer]
WIEGAND[Wiegand Output]
ETH[Ethernet TCP/IP]
USB[USB Interface]

PWR --> MCU

FP --> MCU
RFID --> MCU
KEYPAD --> MCU
EXIT --> MCU
RTC --> MCU

MCU --> LCD
MCU --> RELAY
MCU --> BUZZER
MCU --> WIEGAND
MCU --> ETH
MCU --> USB
```

---

## 1.3 Input Devices

| Device             | Function                  |
| ------------------ | ------------------------- |
| Fingerprint Sensor | Biometric authentication  |
| RFID Reader        | Card-based access         |
| Keypad             | PIN authentication        |
| Exit Switch        | Manual door exit          |
| Fire Panel Input   | Emergency unlock trigger  |
| RTC                | Time-based access control |
| EEPROM             | User data storage         |

---

## 1.4 Access Authentication Flow

```mermaid
flowchart TD

START[User Interaction]

SCAN[Fingerprint / Card / PIN]

AUTH[Authentication Engine]

TIME_CHECK[Access Time Validation]

DOOR[Door Relay Activation]

START --> SCAN
SCAN --> AUTH
AUTH --> TIME_CHECK
TIME_CHECK --> DOOR
```

---

# 2. iHoot Intelligent Sounder

## 2.1 System Overview

The **iHoot Intelligent Sounder** is a **stand-alone alarm sounder with strobe** designed to remain active even if the control panel wiring is cut.

Key features include:

* internal battery backup
* programmable alarm delay
* configurable sounder duration
* tamper detection loop
* integrated strobe indicator

---

## 2.2 Hardware Architecture

```mermaid
flowchart LR

PANEL[Alarm Control Panel]

PWR[Power & Charging Circuit]
BAT[Li-Ion Battery 7.4V 2200mAh]

MCU[iHoot Microcontroller]

DELAY[DIP Switch Delay Settings]

DRV[Output Drivers]

SND[Piezo Sounders]
STROBE[Strobe Light]
LED[Status LEDs]
TAMPER[Tamper Relay]

PANEL --> PWR
PWR --> BAT
PWR --> MCU

DELAY --> MCU

MCU --> DRV

DRV --> SND
DRV --> STROBE
DRV --> LED
DRV --> TAMPER
```

---

## 2.3 Alarm Timing Configuration

Configured via DIP switches.

| Function       | Options                              |
| -------------- | ------------------------------------ |
| Trigger Delay  | Immediate / 5 / 10 / 15 / 20 seconds |
| Alarm Duration | Immediate / 5 / 10 / 15 / 20 minutes |

---

## 2.4 Alarm Activation Flow

```mermaid
flowchart TD

TRIGGER[Panel Alarm Trigger]

CHECK[Check Delay Timer]

ACTIVATE[Activate Sounder]

STROBE[Flash Strobe]

END[Alarm Timeout]

TRIGGER --> CHECK
CHECK --> ACTIVATE
ACTIVATE --> STROBE
STROBE --> END
```

---

# 3. Whisper Auto-Dialer System

## 3.1 System Overview

The **Whisper Auto-Dialer** is an automated notification system used in alarm systems to transmit alerts via:

* GSM networks
* PSTN telephone lines
* DTMF signaling

The device supports voice recording and playback to notify emergency contacts during alarm events.

---

## 3.2 Hardware Architecture

```mermaid
flowchart LR

PWR[12V / 24V Power Input]

DC1[LM2596S-5.0 Regulator]
DC2[LM2596S-ADJ Regulator]

MCU[ATMEGA32 / SST89E516RD2]

RTC[DS1307 RTC]
EEPROM[24C64 EEPROM]

VOICE[APR-2060 Voice IC]

DTMF[HT9200B DTMF Generator]

MODEM[SIM800 GSM Modem]

LCD[LCD Display]
SHIFT[74HC595 LED Driver]

UART[MAX232 Interface]

LINE[Telephone PSTN Line]

PWR --> DC1
PWR --> DC2

DC1 --> MCU
DC2 --> MODEM

MCU --> RTC
MCU --> EEPROM
MCU --> VOICE
MCU --> DTMF
MCU --> MODEM
MCU --> LCD
MCU --> SHIFT
MCU --> UART

DTMF --> LINE
```

---

## 3.3 Alarm Notification Flow

```mermaid
flowchart TD

ALARM[Alarm Trigger]

MCU[Control Processor]

VOICE[Voice Playback]

DTMF[DTMF Dialing]

CALL[Call Transmission]

ALARM --> MCU
MCU --> VOICE
MCU --> DTMF
DTMF --> CALL
```

---

# 4. Swatch 360 / Dexter Cloud Monitoring

## 4.1 Platform Overview

The **Swatch 360 platform** provides centralized monitoring of security infrastructure deployed across multiple branch locations.

It aggregates telemetry from:

* CCTV systems
* intrusion alarm panels
* fire alarm panels
* building automation systems
* access control systems
* time-lock vault systems

---

## 4.2 Cloud Architecture

```mermaid
flowchart LR

DEVICES[Branch Devices]

DEXTER[Dexter HMS Gateway]

ROUTER[Internet Gateway]

CLOUD[Swatch 360 Cloud]

UI[Dashboard Interface]

DEVICES --> DEXTER
DEXTER --> ROUTER
ROUTER --> CLOUD
CLOUD --> UI
```

---

## 4.3 Edge Device Integration

| Device Type | Example             |
| ----------- | ------------------- |
| CCTV        | NVR / DVR           |
| IAS         | Intrusion Alarm     |
| FAS         | Fire Alarm          |
| BAS         | Building Automation |
| ACS         | Access Control      |
| TLS         | Time Lock System    |

---

## 4.4 Dashboard Monitoring Metrics

### Branch Status

| Parameter      | Description            |
| -------------- | ---------------------- |
| Gateway Status | Online / Offline       |
| Device Status  | IAS / FAS / BAS / CCTV |
| Node Health    | Device uptime          |

---

### CCTV Diagnostics

| Metric           | Description            |
| ---------------- | ---------------------- |
| Active Cameras   | Working vs installed   |
| Video Retention  | HDD recording duration |
| Storage Capacity | Used / free            |
| Error Logs       | Tamper / disconnect    |

---

### SLA & Compliance Tracking

| Metric         | Purpose                   |
| -------------- | ------------------------- |
| SLA Compliance | System availability       |
| TAT            | Maintenance response time |
| Voltage Logs   | Power quality monitoring  |
| Current Logs   | Power load monitoring     |

---

## 4.5 Data Flow Architecture

```mermaid
flowchart TD

DEV[Branch Security Devices]

EDGE[Dexter Gateway]

CLOUD[Cloud Server]

ANALYTICS[Monitoring Engine]

DASH[Swatch Dashboard]

DEV --> EDGE
EDGE --> CLOUD
CLOUD --> ANALYTICS
ANALYTICS --> DASH
```

---

# 5. End-to-End Security Infrastructure

```mermaid
flowchart LR

ACCESS[Biometric Access Control]

ALARM[Alarm Panels]

SOUNDER[Intelligent Sounders]

DIALER[Auto Dialer]

GATEWAY[Dexter Gateway]

CLOUD[Swatch Cloud]

ACCESS --> GATEWAY
ALARM --> GATEWAY
SOUNDER --> ALARM
DIALER --> ALARM

GATEWAY --> CLOUD
```

---

# 6. RAG Training Keywords

```
bio smart biometric access control architecture
ihoot intelligent sounder alarm system
whisper autodialer gsm architecture
dexter gateway cloud monitoring system
swatch 360 security monitoring platform
bank branch security infrastructure architecture
alarm autodialer dtmf signaling system
iot security monitoring gateway architecture
```

---

# End of Document
