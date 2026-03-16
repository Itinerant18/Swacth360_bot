## iHoot Intelligent Sounder Battery & Delay Logic

The iHoot features an isolated battery stack and configurable dip switches that control detection delays and active alarm duration independent of the main panel [3-5].

```text
[ MAIN ALARM PANEL ]                         [ iHOOT INTELLIGENT SOUNDER ]
 (12-15VDC / Triggers)
         |
         |                                   [ INTERNAL POWER MANAGEMENT ]
         +---------------------------------> + 7.4V 2-S Li-ion 2200mAh Battery
                                             + Up to 8 hours backup time
                                             + Indigenous charging algorithm

[ TRIGGER & TAMPER DETECTION ]               [ HARDWARE DIP SWITCH SETTINGS ]
         |
         +--> Main Panel Triggered --------> [ DETECT DELAY TIME SELECTION ]
         |                                   Options: Immediate, 5, 10, 15, or 20 Seconds
         +--> Wire Cut / Tamper Detected --> 
                                                               |
                                                               v
[ AUDIO / VISUAL ALARM DRIVER ] <------------------------------+
         |
         +--> [ SOUNDER ALARM TIME SELECTION ]
         |    Options: Immediate, 5, 10, 15, or 20 Minutes
         |
         +--> Audio: Twin 115dB Piezo Sounders (peak at 1m)
         +--> Visual: Xenon Strobe (or 9x1W LED Strobe)
         +--> Health LEDs: Alternate (Healthy) / Simultaneous (Alert)