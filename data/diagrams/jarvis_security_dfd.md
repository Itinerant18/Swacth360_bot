-- This shows DFD Level-0, Level-1, and Level-2 used in system engineering documentation.
* DFD Level 0 (System Context)
flowchart LR

USER[User]

SENSORS[Security Sensors]

SYSTEM[JARVIS Security System]

AUTODIALER[GSM Autodialer]

CLOUD[Monitoring Server]

USER --> SYSTEM

SENSORS --> SYSTEM

SYSTEM --> AUTODIALER

AUTODIALER --> CLOUD

CLOUD --> USER

* DFD Level 1 (Subsystem Breakdown)
flowchart LR

SENSORS[Security Sensors]

ZONEPROC[Zone Processing Module]

ALARMENG[Alarm Engine]

OUTPUTS[Siren / Relay Outputs]

DIALER[GSM Dialer]

CLOUD[Monitoring Server]

SENSORS --> ZONEPROC

ZONEPROC --> ALARMENG

ALARMENG --> OUTPUTS

ALARMENG --> DIALER

DIALER --> CLOUD

* DFD Level 2 (Internal Processing)
flowchart TD

SENSOR[Sensor Inputs]

ZONEFILTER[Zone Validation]

EVENTGEN[Event Generator]

ALARMLOGIC[Alarm Logic]

SIRENCTRL[Siren Controller]

DIALERCTRL[GSM Dialer Controller]

LOG[Event Logger]

SENSOR --> ZONEFILTER

ZONEFILTER --> EVENTGEN

EVENTGEN --> ALARMLOGIC

ALARMLOGIC --> SIRENCTRL

ALARMLOGIC --> DIALERCTRL

ALARMLOGIC --> LOG
```
```
### Engineering Data Flow Summary
Sensor → Zone Processing → Alarm Logic → Siren + Dialer → User Notification