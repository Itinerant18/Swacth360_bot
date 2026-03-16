## Dexter HMS Webserver Zone Setup Logic
This outlines the step-by-step logic for configuring Normal and Power zones through the Dexter HMS Webserver interface [8-10].

```text
[ DEVICE CONFIGURATION ]
       |
       +--> 1. NORMAL ZONE CONFIGURATION (Zones 1-16)
       |         |
       |         +-- Enable / Disable Zone Toggle
       |         +-- Select Device Type:
       |         |     1 = BAS (Burglar Alarm)
       |         |     2 = FAS (Fire Alarm)
       |         |     3 = Time Lock
       |         |     4 = BACS (Access Control)
       |         |     5 = NVR & DVR (CCTV)
       |         |     6 = IAS (Intrusion Alarm)
       |         +-- Toggle Buzzer (ON/OFF)
       |
       +--> 2. POWER ZONE CONFIGURATION (Zones 1-8)
                 |
                 +-- Enable / Disable Power Zone Toggle
                 +-- Select Connected Device Type (1 through 6, same as above)
                 +-- Toggle Buzzer (ON/OFF)
                 +-- Save & Exit to Network Settings