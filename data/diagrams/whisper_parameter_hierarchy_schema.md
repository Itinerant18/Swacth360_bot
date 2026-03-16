## Whisper Autodialer Parameter & Asset Hierarchy

This diagram maps the programmable boolean parameters for alarms and notifications, alongside the multi-tier user configuration hierarchy used to manage fleets of Whisper devices across different branch levels [1-3].

```text
=== 1. USER ASSET CONFIGURATION HIERARCHY ===
[ BANK (Head Office) ]
       |
       +---> [ LHO (Local Head Office) 1 to 14 ]
                  |
                  +---> [ ZO (Zonal Office) 1 to 3 ]
                             |
                             +---> [ RBO (Regional Branch Office) 1 to 3 ]
                                        |
                                        +---> [ BRANCH 1 to 3 ]
                                                   |
                                                   +---> [ DEVICE 1 to 4 ] (Whisper Autodialers)

*Note: Higher offices can establish and view dashboards of lower branches, while branches are restricted to viewing only their own devices [3, 4].*

=== 2. PROGRAMMABLE ALARM & SMS SETTINGS (Boolean 1/0) ===
[ ALARM TRIGGERS ]                 [ SMS NOTIFICATIONS ]              [ EMAIL NOTIFICATIONS ]
- Fire Alarm (En/Dis)              - Fire SMS (En/Dis)                - Fire Trigger (En/Dis)
- Intrusion Alarm (En/Dis)         - Intrusion SMS (En/Dis)           - Intrusion Trigger (En/Dis)
- Silent Alarm (En/Dis)            - Tamper SMS (En/Dis)              - Tamper (En/Dis)
- Wire Cut Alarm (En/Dis)          - Silent Trigger SMS (En/Dis)      - Power On (En/Dis)
- System Tamper (En/Dis)           - Power On/Off SMS (En/Dis)        - Power Off (En/Dis)
