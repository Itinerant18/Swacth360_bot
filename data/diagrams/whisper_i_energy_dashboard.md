## Whisper-I Energy & Alert Dashboard Architecture

The Whisper-I autodialer includes a webserver dashboard for real-time electrical monitoring and customizable alarm thresholds.

```text
[ WHISPER-I CLOUD DASHBOARD ]

=== REAL-TIME TELEMETRY ===
[ Total Energy Consumed ] : Displayed in kWh
[ Energy per Minute ]     : Live graph chart
[ Amperage & Power ]      : Displayed in A and W (e.g., 14.30A / 2444W)
[ Voltage & Frequency ]   : Displayed in V and Hz (e.g., 233.70V / 57.70Hz)

=== VIRTUAL SYSTEM STATUS ===
[ Virtual Keypad ]        : Replicates the physical 16-key matrix
[ System Status LEDs ]    : Power ON / Active / GSM Network / Play Back
[ Subsystem LEDs ]        : Battery / Battery Low / LAN

=== ALARM THRESHOLD SETTINGS (Configurable via UI) ===
* LOW BATTERY ALARM            [ Default Threshold: 20 ]
* LOW TEMPERATURE ALARM        [ Default Threshold: 19°C ]
* EXCEEDING DAILY CONSUMPTION  [ Default Threshold: 100 kWh ]
* EXCEEDING WEEKLY CONSUMPTION [ Default Threshold: 500 kWh ]
* INACTIVITY ALARM