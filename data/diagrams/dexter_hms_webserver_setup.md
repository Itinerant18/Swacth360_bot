## Dexter HMS Webserver Configuration Logic

This maps the software configuration flow for setting up zones, network parameters, and output relays via the Dexter Webserver [6-8].

```text
[ DEXTER WEBSERVER CONFIGURATION ]

=== 1. NORMAL ZONE CONFIGURATION (Zones 1-16) ===
For each zone, select the device type from the dropdown list:
  1. BAS (Burglar Alarm System)
  2. FAS (Fire Alarm System)
  3. Time Lock
  4. BACS (Biometric Access Control System)
  5. NVR & DVR (Network / Digital Video Recorder)
  6. IAS (Intruder Alarm System)
  * Toggle "Buzzer: On/Off" for each zone.

=== 2. OUTPUT MANAGEMENT (Relay Triggers) ===
Configure what actions trigger the internal relays:
  [ ] Action on trigger
  [ ] Clear buffer
  [ ] Active Integration (On/Off)
  [ ] Act INT HV-NVR (Hikvision NVR)
  [ ] INT HV-BIO (Hikvision Biometrics)
  [ ] Act INT DU-NVR (Dahua NVR)

=== 3. NETWORK & LAN SETUP ===
  [ Interface ] -------> IPv4
  [ Mode ] ------------> Static / DHCP Auto-enable
  [ DNS ] -------------> Preferred / Alternate
  [ IP Details ] ------> IP Address / Subnet / Gateway