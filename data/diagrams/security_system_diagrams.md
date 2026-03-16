# Security & Monitoring System Engineering Diagrams

This document contains detailed architecture and wiring diagrams for
several systems:

1.  Dexter HMS System Architecture
2.  Apollo Series 65 Detector Loop Wiring
3.  ISIS 16‑Zone Intruder Alarm System Wiring

------------------------------------------------------------------------

# 1. Dexter HMS -- Complete System Architecture

                       ┌─────────────────────────────────────────────────────────┐
                       │                     FIELD LAYER                         │
                       │   (Fire / Safety / Surveillance Devices Installed)      │
                       └─────────────────────────────────────────────────────────┘

          FIRE DEVICES                     SECURITY DEVICES              VIDEO SYSTEM
     ┌──────────────────────┐         ┌─────────────────────┐       ┌─────────────────────┐
     │ Smoke Detector       │         │ PIR Motion Sensor   │       │ CCTV Camera #1      │
     │ Heat Detector        │         │ Magnetic Door Switch│       │ CCTV Camera #2      │
     │ Manual Call Point    │         │ Glass Break Sensor  │       │ IP Dome Camera      │
     │ Flame Detector       │         │ Vibration Sensor    │       │ PTZ Camera          │
     └─────────┬────────────┘         └─────────┬───────────┘       └─────────┬───────────┘
               │                                │                             │
               │ Conventional Loop              │ Zone Wiring                 │ Ethernet / IP
               ▼                                ▼                             ▼

            ┌──────────────────────────────────────────────────────────────────────────┐
            │                      LOCAL SECURITY PANELS                               │
            │                                                                          │
            │  +----------------------+        +----------------------+                │
            │  | JARVIS Fire Panel    |        | ISIS Intruder Panel  |                │
            │  | • Zone Monitoring    |        | • Tamper Detection   |                │
            │  | • Alarm Logic        |        | • Siren Control      |                │
            │  +-----------┬----------+        +-----------┬----------+                │
            │              │                               │                           │
            │              │ SIA / Contact-ID Protocol     │                           │
            │              └───────────────┬───────────────┘                           │
            │                              ▼                                           │
            │                     +----------------------+                             │
            │                     |    DEXTER HMS PANEL  |                             │
            │                     |  Event Processing    |                             │
            │                     |  Local Dashboard UI  |                             │
            │                     |  Alarm Log Storage   |                             │
            │                     |  Network Gateway     |                             │
            │                     +-----------┬----------+                             │
            │                                 │                                        │
            └─────────────────────────────────┼────────────────────────────────────────┘
                                              │
                                              ▼
                                   ┌─────────────────────┐
                                   │ Network Router      │
                                   │ Industrial Gateway  │
                                   └───────────┬─────────┘
                                               │
                                               ▼
                                   ┌─────────────────────┐
                                   │ Dexter Cloud Server │
                                   │ Alarm Database      │
                                   │ Device Monitoring   │
                                   │ Notification Engine │
                                   └───────────┬─────────┘
                                               │
                                               ▼
                                   ┌─────────────────────┐
                                   │ Mobile/Desktop Apps │
                                   │ Monitoring Console  │
                                   └─────────────────────┘

------------------------------------------------------------------------

# 2. Apollo Series 65 -- Detector Loop Wiring

                 FIRE ALARM CONTROL PANEL (FACP)

                    ZONE OUTPUT TERMINALS
                    +24V LOOP SUPPLY
                         │
                         ▼

             ┌─────────────────────────────────────┐
             │ DETECTOR BASE #1                    │
             │ Apollo Series 65                    │
             │                                     │
             │ L1 IN   (+) ────────────────┐       │
             │ L1 OUT  (+) ────────────────┼───────┐
             │ L2 IN   (-) ────────────────┘       │
             │ L2 OUT  (-) ────────────────────────┼─────┐
             │ -R (Remote LED) ──────┐             │     │
             │ EARTH (Shield) ───────┘             │     │
             └─────────────────────────────────────┘     │
                                                         │
                           Remote LED Indicator          │
                     +---------------------------+       │
                     |  LED +  → L1              |       │
                     |  LED -  → -R              |       │
                     +---------------------------+       │
                                                         │
                                                         ▼

             ┌────────────────────────────────────────┐
             │ DETECTOR BASE #2 (Last Device)         │
             │                                        │
             │ L1 IN  ──────────────────────────────┐ │
             │ L2 IN  ──────────────────────────────┘ │
             │ -R     ────────────────┐               │  
             │ EARTH  ────────────────┘               │
             │ L1 OUT ────────────────┐               │
             │ L2 OUT ────────────────┘               │
             └────────────────────────────────────────┘
                            │
                            ▼
                    +----------------------+                |  End-of-Line (EOL)   |
                    |  Resistor / Module   |
                    |  ~4.7kΩ supervision  |
                    +----------------------+

------------------------------------------------------------------------

# 3. ISIS 16‑Zone Intruder Alarm System Wiring

                       ┌────────────────────────────────────────┐
                       │     ISIS 16‑ZONE INTRUDER PANEL        │
                       │  Embedded Controller + Zone Interface  │
                       └────────────────────────────────────────┘


    -------------------------- SENSOR ZONES ---------------------------

    ZONE 1  → Panic Switch

    ZONE 2  → Glass Break Sensor
               │
               ▼
            Driver Unit

    ZONE 3  → Vibration Sensor
               │
               ▼
            Driver Unit

    ZONE 4  → Smoke Detector

    ZONE 5  → PIR Motion Sensor

    ZONE 6  → Magnetic Door Contact

    ZONE 7  → Night Zone Sensor

    ZONE 8  → Heat / Fire Sensor


    -------------------------- AUTODIALER ----------------------------

    ISIS PANEL                  Whisper G Auto‑Dialer

    AD FIRE   (+/-) ─────────► Fire Alarm Trigger
    AD INTR   (+/-) ─────────► Intrusion Alarm
    AD TAMPER (+/-) ─────────► Tamper Event
    AD SILENT (+/-) ─────────► Silent Alarm


    -------------------------- OUTPUT DEVICES ------------------------

    RELAY OUTPUT
          │
          ▼
    External Relay Driven Devices
    (Lights / Locks / Alarm Systems)


    MOTOR SIREN DRIVER

          C   T   V   G
          │   │   │   │
          │   │   │   └── Ground
          │   │   └──── 12V Drive
          │   └──────── Trigger
          └──────────── Control

            │
            ▼
        Motorized Siren
            │
            ▼
          220V AC


    SIREN OUTPUT (+/-)
          │
          ▼
    Electronic Hooter


    -------------------------- REMOTE KEYPAD -------------------------

    TX  → Keypad RX
    RX  ← Keypad TX
    +12V → Keypad Power
    GND  → Keypad Ground

------------------------------------------------------------------------

# Alarm Event Workflow

    Sensor Trigger
          ↓
    Zone Detection (ISIS Panel)
          ↓
    Alarm Logic Processing
          ↓
    Siren Activation
          ↓
    Signal to Whisper G Auto‑Dialer
          ↓
    Automatic Phone Call / Notification
