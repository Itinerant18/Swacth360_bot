## iHoot Intelligent Sounder Delay & Alert Logic
This maps the hardware DIP switch settings and visual health indicators programmed into the iHoot standalone sounder's microcontroller [4, 5].

```text
[ SYSTEM TRIGGERS ]
  |-- Main Panel Alarm Trigger (12-15VDC)
  |-- Communication Wire Cut / Tamper
  |
  v
[ DETECTION DELAY SWITCH ]
  |-- Immediate, 5, 10, 15, or 20 Seconds
  |
  v
[ ALARM OUTPUT DRIVERS ]
  |
  +-- [ SOUNDER ALARM TIME SWITCH ]
  |     |-- Immediate, 5, 10, 15, or 20 Minutes
  |     +-- Drives Twin 115dB Piezo Sounders
  |
  +-- [ VISUAL ALERT ]
        +-- Drives 1Ws Xenon Flash Tube

[ SYSTEM HEALTH LEDs ]
  |-- Alternate Blinking    ====> SYSTEM HEALTHY
  +-- Simultaneous Blinking ====> SYSTEM ALERT (Tamper/Low Battery)
