# Dexter & Security Systems -- Detailed Engineering Diagrams

This document consolidates multiple **engineering-grade architecture and
wiring diagrams** for security monitoring systems, panic switches, SMPS
power supplies, and fire detector relay bases.

Contents 1. Dexter Central Monitoring System (CMS) Architecture 2. SB
UNI Unified Panic Switch Internal Wiring 3. SMPS PSC‑60 Power Supply
Block Diagram 4. Apollo Series 65 Relay Base Wiring

------------------------------------------------------------------------

# 1. Dexter Central Monitoring System (CMS) Architecture

The Dexter CMS is a scalable IoT backend used for monitoring alarm
panels, detectors, CCTV integrations, and security telemetry.

It processes millions of events from distributed field devices.

## System Architecture Diagram

    [ FIELD SECURITY DEVICES ]

    +-----------------------------+
    | Dexter HMS Panels           |
    | Fire / Intrusion / Access   |
    | Control / NVR Integration   |
    +--------------+--------------+
                   |
                   | MQTT
                   v

    +-----------------------------+
    | Device Provisioning Service |
    | Device Authentication       |
    | Asset Management            |
    +--------------+--------------+
                   |
                   v

    +-----------------------------+
    | Telemetry Processing Engine |
    | Event Parsing               |
    | Alarm Detection             |
    | Status Monitoring           |
    +--------------+--------------+
                   |
                   v

    +-----------------------------+
    | Rule Engine / Automation    |
    | Alarm Routing               |
    | Trigger Workflows           |
    | Notification Dispatch       |
    +--------------+--------------+
                   |
                   v

    +-----------------------------+
    | Distributed Database Layer  |
    | Event Logs                  |
    | Device Metadata             |
    | Backup Replication          |
    +--------------+--------------+
                   |
                   v

    +-----------------------------+
    | Web & Mobile Applications   |
    | Monitoring Dashboards       |
    | Analytics                   |
    | Alert Visualization         |
    +-----------------------------+

## Communication Protocols

  Layer              Protocol
  ------------------ ----------
  Device Telemetry   MQTT
  Device API         REST
  Control Commands   RPC
  User Access        HTTPS

------------------------------------------------------------------------

# 2. SB UNI Unified Panic Switch Wiring

The SB‑UNI switch contains a micro‑switch and resistor that allows the
device to interface with multiple alarm panels.

## Internal Circuit Diagram

              SB UNI PANIC SWITCH

              +------------------------------+
              |                              |
              |      FPB MICRO SWITCH        |
              |                              |
              |        ┌───────────┐         |
    RED (1) ---+-------|           |---------+----> Panel Zone +
              |        |           |
    BLACK(2)--+--------|           |--------------> ATUM / BAS Panels
              |        |           |
    YELLOW(3)-+--------|           |--------------> ISIS / JARVIS
              |        |           |
    GREEN(4)--+--------|           |--------------> CHRONOS Time Lock
              |        └───────────┘
              |
              |       1KΩ Resistor
              +----------/\/\/\----------- GND

## Wiring Combinations

  Panel Type          Wires
  ------------------- --------------
  ATUM                Red + Black
  JARVIS / ISIS       Red + Yellow
  Chronos Time Lock   Red + Green

------------------------------------------------------------------------

# 3. SMPS PSC‑60 Power Supply Block Diagram

This switched‑mode power supply converts **AC mains to regulated DC
output** and also provides battery backup charging.

## Internal Circuit Flow

    AC INPUT
    150‑265V
       |
       v

    +------------+
    | EMI Filter |
    +------------+
       |
       v

    +-------------------+
    | Bridge Rectifier  |
    | & Bulk Capacitor  |
    +-------------------+
       |
       v

    +-------------------+
    | Switching MOSFET  |
    | PWM Controller    |
    +-------------------+
       |
       v

    +-------------------+
    | High‑Frequency    |
    | Transformer       |
    +-------------------+
       |
       v

    +-------------------+
    | Secondary         |
    | Rectifier & LC    |
    | Output Filter     |
    +-------------------+
       |
       v

    +-------------------+
    | DC Output Stage   |
    | 12V / 15V / 27.6V |
    +-------------------+
       |
       v

    +-------------------+
    | Battery Charger   |
    | Float Charging    |
    | Backup Switching  |
    +-------------------+
       |
       v
    Battery Backup

## Feedback Control Loop

    Output Voltage
          |
          v
    +-------------+
    | Error Amp   |
    +-------------+
          |
          v
    +-------------+
    | Optocoupler |
    +-------------+
          |
          v
    +-------------+
    | PWM Driver  |
    +-------------+

------------------------------------------------------------------------

# 4. Apollo Series 65 Relay Base Wiring

The relay base allows fire detectors to activate external systems such
as doors, sirens, or security panels.

## Relay Base Wiring Diagram

    Fire Alarm Panel
          |
          |
          +-------------+
                        |
                        v

    +----------------------------------+
    | Apollo 12V Relay Base            |
    | Model: 45681‑508                 |
    |                                  |
    | Terminal Connections             |
    |                                  |
    |  IN+   ----> Positive Supply     |
    |  OUT+  ----> Loop Continuation   |
    |                                  |
    |  L1 IN ----> Negative Line       |
    |  L1 OUT----> Next Detector       |
    |                                  |
    | Relay Contacts                   |
    |                                  |
    |  NO ----> Auxiliary Trigger      |
    |  COM ---> Control Device         |
    |  NC ----> Fail‑Safe Output       |
    +----------------------------------+

## Typical Use Case

    Detector Alarm
          ↓
    Relay Base Activated
          ↓
    External Device Triggered
          ↓
    Door Release / Siren / Alarm Panel Input

------------------------------------------------------------------------

# Engineering Notes

These diagrams represent typical integration between:

• Fire detection systems\
• Intrusion alarm panels\
• Monitoring servers\
• Power backup systems

The architectures allow security installations to scale from **single
building installations** to **nationwide monitoring infrastructures**.

------------------------------------------------------------------------

END OF DOCUMENT
