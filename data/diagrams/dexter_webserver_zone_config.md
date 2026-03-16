## Dexter Webserver Zone Configuration & Diagnostics

This maps the exact user interface options available when assigning equipment to the 16 Normal Zones and 8 Power Zones within the Dexter Webserver.

```text
[ DEXTER WEBSERVER UI ]

=== 1. NORMAL ZONE CONFIGURATION (1-16) ===
[ Zones 1-6, 9-14 ] ---> Configurable Dropdown: BAS, FAS, Time Lock, BACS, IAS [12]
[ Zones 7, 8, 15, 16 ] > FIXED to CCTV (No dropdown available) [12]
* Each zone features a dedicated "Buzzer On/Off" toggle [13].

=== 2. POWER ZONE CONFIGURATION (1-8) ===
[ Zones 1-8 ] ---------> Configurable Dropdown: BAS, FAS, Time Lock, BACS, NVR/DVR, IAS [14, 15]
* Each zone features a dedicated "Buzzer On/Off" toggle [15].

=== 3. INTEGRATION MANAGEMENT ===
[ Active Integration Master Toggle ] [16]
 |--> Hikvision NVR (IP, Port, User, Pass) [16]
 |--> Dahua NVR (IP, Port, User, Pass) [16]
 |--> Hikvision Access Controls [16]

=== 4. SYSTEM TEST (Future Implementations) ===
 |--> Lamp Test (Tests indicator LEDs) [17]
 |--> Relay Test (Tests integrated relays) [18]
 |--> Buzzer Test (Tests audible notifications) [18]