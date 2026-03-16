# Security, Alarm & PA System Engineering Diagrams

This document consolidates several system architecture and protocol
diagrams used in alarm, PA, and monitoring systems.

Contents:

1.  Dhwani PA Console System Architecture
2.  SIA / Contact ID Transmission Flowchart
3.  ATUM Integrated Alarm System Architecture
4.  JARVIS Intruder Alarm System Wiring

------------------------------------------------------------------------

# 1. Dhwani PA Console System Architecture

The Dhwani Public Address Console integrates power management,
amplification, user interface boards, and audio routing.

## System Block Diagram

    [ POWER SUPPLY ]                        [ MAIN CONSOLE COMPONENTS ]

    +------------+       +-------------------+       +-------------------+
    |    SMPS    | ----> |  PINNACLE POWER   | ----> |   MOTHER BOARD    |
    +------------+       |      BOARD        |       |                   |
                         +-------------------+       +-------------------+
                                   ^                   |   |   |   |
    +------------+                 | 10-PIN            |   |   |   | 20-PIN
    | 2x UB1280  | ----------------+                   |   |   |   v
    | Batteries  |                                     |   |   | +-------------------+
    +------------+                                     |   |   | | KEYPAD LED BOARD  |
                                                       |   |   | +-------------------+
                         +-------------------+         |   |   |
                         |      PA AMP       | <-------+   |   | 20-PIN
                         +-------------------+   AUX IN    |   v
                                   ^                       | +-------------------+
                                   |                       | |   CONTROL BOARD   |
                               [Mains]                     | +-------------------+
                                                           |
                                                           v
                                                +-------------------+
                                                |    MICROPHONE &   |
                                                |     SPEAKERS      |
                                                +-------------------+

## Functional Description

  Component              Function
  ---------------------- -----------------------------------------
  SMPS                   Converts AC mains to regulated DC
  UB1280 Batteries       Backup power for emergency operation
  Pinnacle Power Board   Power distribution and battery charging
  Motherboard            Central control and signal routing
  Keypad LED Board       User interface indicators
  Control Board          Signal processing and control logic
  PA Amplifier           Amplifies audio signals
  Microphone             Audio input for announcements
  Speakers               Output audio devices

------------------------------------------------------------------------

# 2. SIA / Contact ID Message Transmission Flow

This diagram illustrates the message transmission process used in alarm
systems communicating with a monitoring station.

## Contact ID Flowchart

          [ START: Send Message ]
                     |
                     v
             (Detect Handshake)
                     |
                     v
             [ Delay 250 msec ]
                     |
                     v
     [ Format Message: Attempt Count = 1 ]
                     |
                     v
           +--> [ Transmit Message ]
           |         |
           |         v
           | (Search for Kissoff Tone)
           |         |
           |         v
           |   { Kissoff Received? }
           |    /               \
           |  [NO]             [YES]
           |   |                 |
           |   v                 v
           | (Increment      { More Messages? } --[YES]--> [ Wait for end of tone ] --+
           |  Count)             |                                                    |
           |   |                [NO]                                                  |
           |   v                 |                                                    |
           | { Count > 4? }      v                                                    |
           |  /        \      [ END ]                                                 |
           +-[NO]      [YES]                                                          |
                         |                                                            |
                         v                                                            |
                     [ Hang Up ]                                                      |
                         |                                                            |
                         v                                                            |
                      [ END ] <-------------------------------------------------------+

## Key Protocol Elements

  Parameter                   Value
  --------------------------- ------------------------
  Handshake                   1400 Hz tone
  Kissoff tone                1400 Hz acknowledgment
  Retry attempts              Up to 4
  Delay before transmission   250 ms

------------------------------------------------------------------------

# 3. ATUM Integrated Alarm System Block Diagram

The ATUM alarm panel integrates sensor zones, RF remote inputs, and
alarm outputs controlled by a microcontroller.

## Hardware Architecture

    +----------------+      +-------------------------+      +-------------------+
    |    BATTERY     | ---> |      POWER SUPPLY &     | ---> |  MICROCONTROLLER  |
    +----------------+      |     BATTERY CHARGER     |      |  & PERIPHERALS    |
                            +-------------------------+      +-------------------+
                                                               ^   ^   ^      |
    +----------------+                                         |   |   |      |
    |  ZONE INPUT    | ----------------------------------------+   |   |      |
    |  INTERFACES    |                                             |   |      |
    +----------------+                                             |   |      |
                                                                   |   |      |
    +----------------+                                             |   |      |
    |    KEYPAD      | --------------------------------------------+   |      |
    +----------------+                                                 |      |
                                                                       |      |
    +----------------+           +-------+                             |      |
    | RF REMOTE (Tx) | --------> | RF Rx | ----------------------------+      |
    +----------------+   433MHz  +-------+                                    |
                                                                              v
    +----------------+                                           +-------------------+
    |      LCD       | <---------------------------------------- |   OUTPUT DRIVER   |
    +----------------+                                           |     INTERFACE     |
                                                                 +-------------------+
                                                                   |   |   |   |
                         +------------------+                      |   |   |   |
                         | MOTORIZED SIREN  | <--------------------+   |   |   |
                         |      DRIVER      |                          |   |   |
                         +------------------+                          |   |   |
                                                                       v   |   |
                                                  +------------------+     |   |
                                                  | INTERNAL HOOTER  | <---+   |
                                                  +------------------+         |
                                                                               v
                                                             +------------------+
                                                             |   SIREN DRIVER   |
                                                             +------------------+
                                                                              |
                                                                              v
                                                                       +-----------+
                                                                       |   RELAY   |
                                                                       +-----------+

## System Features

  Module            Description
  ----------------- ----------------------------
  Zone Interface    Sensor detection
  RF Receiver       Wireless remote interface
  Microcontroller   System logic
  Output Driver     Controls sirens and relays
  Battery Charger   Maintains backup battery

------------------------------------------------------------------------

# 4. JARVIS Intruder Alarm System Detailed Wiring

## System Wiring Layout

    [ JARVIS INTRUDER ALARM MAIN PANEL ]

    === ZONE TERMINALS ===
    ZONE 1 (+/-) -------> Panic Switch
    ZONE 2 (+/-) -------> Glass Break Sensor (via Driver Unit)
    ZONE 3 (+/-) -------> Vibration Sensor (via Driver Unit)
    ZONE 4 (+/-) -------> Smoke Detector
    ZONE 5 (+/-) -------> PIR Sensor (via Driver Unit)
    ZONE 6 (+/-) -------> Magnetic Switch (via Driver Unit)
    ZONE 7 (+/-) -------> Night Zone Sensor
    ZONE 8 (+/-) -------> Fire / Heat Sensor

    === AUTODIALER TERMINALS ===
    AD FIRE (+/-) ------> Whisper G Membrane (Fire Input)
    AD INTR (+/-) ------> Whisper G Membrane (Intrusion Input)
    AD TAMPER (+/-) ----> Whisper G Membrane (Tamper Input)
    AD SILENT (+/-) ----> Whisper G Membrane (Silent Input)

    === RELAYS & POWER ===
    RELAY (-)(+) -------> External Device for Intrusion/Fire
    NIGHT POWER (+)(-) -> Power to Night Zone Sensor
    MOT_SIR (C T V G) --> Motorized Siren Driver ---> [220V AC Mains] ---> Motorized Siren
    SIREN (+)(-) -------> Electronic Siren (Hooter)

    === KEYPAD ===
    REMOTE KEYPAD ------> [Tx] [Rx] [+] [-] ---> LCD Remote Keypad

## Alarm Operation Flow

    Sensor Trigger
          ↓
    Zone Detection
          ↓
    Alarm Processing
          ↓
    Siren Activation
          ↓
    Signal to Whisper G Auto-Dialer
          ↓
    Telephone Alert

------------------------------------------------------------------------

# End of Document
