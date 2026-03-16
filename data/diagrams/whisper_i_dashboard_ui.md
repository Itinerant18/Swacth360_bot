## Whisper-I Web Dashboard & Notification Architecture

This maps the user interface and data hierarchy for the Whisper-I standalone autodialer's cloud dashboard [2, 3].

```text
[ WHISPER-I DASHBOARD ]

=== 1. REAL-TIME ENERGY & STATUS ===
[ Energy Consumed per minute ] --> Total kWh
[ Current & Power ] -------------> Amperage (A) / Power (W)
[ Voltage & Frequency ] ---------> 233.70V / 57.70Hz
[ Virtual LCD ] -----------------> Replicates Physical Keypad & System Status LEDs

=== 2. SYSTEM ALARMS & NOTIFICATIONS ===
* User can toggle SMS or Email notifications independently for each alarm type:
  [ ] Low Battery Alarm (Threshold: e.g., 20)
  [ ] Low Temperature Alarm (Threshold: e.g., 19°C)
  [ ] Exceeding Daily Consumption Alarm (Threshold: e.g., 100)
  [ ] Exceeding Weekly Consumption Alarm (Threshold: e.g., 500)
  [ ] Inactivity Alarm

=== 3. PANEL PARAMETERS ===
[ Panel Name ] ------------------> e.g., "Whisper - I"
[ Date/Time Setup ] -------------> HH:MM / DD:MM:YY
[ Fire Numbers ] ----------------> Slots 1 to 10
[ Intrusion Numbers ] -----------> Slots 1 to 10
[ Message Triggers ] ------------> Toggle Call/SMS for: Fire, Intrusion, Tamper, Silent, Power On/Off
