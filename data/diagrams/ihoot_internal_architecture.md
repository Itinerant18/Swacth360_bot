## iHoot Intelligent Sounder Internal Architecture

The iHoot is designed with isolated battery and logic paths to ensure it alarms even if the main panel is compromised or the wires are severed.

```text
[ MAIN ALARM PANEL ]                         [ iHOOT INTERNAL ENCLOSURE ]
 (12-15VDC / Trigger)
         |
         v
[ POWER & TRIGGER I/O ] -------------------> [ BATTERY MANAGEMENT ]
         |   (If cut, triggers tamper)              |
         |                                          v
         v                                   [ 7.4V 2S Li-Ion 2200mAh ]
[ MICROCONTROLLER LOGIC ] <----------------- (Provides up to 8 Hrs backup)
         |
         |---> [ DIP SWITCHES ]
         |      - Sounder Delay: (Imm/5/10/15/20 Sec)
         |      - Sounder Time:  (Imm/5/10/15/20 Min)
         |
         |---> [ VISUAL OUTPUT ]
         |      - 1Ws Xenon Strobe (or 9x1W High Intensity LED)
         |      - System Health LEDs (Blinking = Healthy / Alert)
         |
         +---> [ AUDIO OUTPUT ]
                - Twin Piezo Sounders (115dB at 1 meter)
