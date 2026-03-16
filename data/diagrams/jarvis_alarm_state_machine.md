# Security Alarm Event State Machine

This state machine defines how the JARVIS security system behaves during alarm events.

```mermaid
stateDiagram-v2

[*] --> DISARMED

DISARMED --> ARMED_DAY : Arm System (Day Mode)
DISARMED --> ARMED_NIGHT : Arm System (Night Mode)

ARMED_DAY --> TRIGGERED : Zone Violation
ARMED_NIGHT --> TRIGGERED : Zone Violation

TRIGGERED --> ALARM_ACTIVE : Alarm Confirmed

ALARM_ACTIVE --> SIREN_ACTIVE
ALARM_ACTIVE --> AUTODIALER_ACTIVE

SIREN_ACTIVE --> ALARM_RESET : User Reset
AUTODIALER_ACTIVE --> ALARM_RESET : Alert Sent

ALARM_RESET --> DISARMED

TRIGGERED --> FALSE_ALARM : Sensor Reset
FALSE_ALARM --> ARMED_DAY
FALSE_ALARM --> ARMED_NIGHT
```
# Alarm State Definitions
| State             | Description               |
| ----------------- | ------------------------- |
| DISARMED          | Security system inactive  |
| ARMED_DAY         | Day sensors active        |
| ARMED_NIGHT       | Night mode sensors active |
| TRIGGERED         | Sensor event detected     |
| ALARM_ACTIVE      | Alarm validated           |
| SIREN_ACTIVE      | Siren output activated    |
| AUTODIALER_ACTIVE | GSM alert transmission    |
| ALARM_RESET       | System reset              |

