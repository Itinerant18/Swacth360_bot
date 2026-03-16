## Dhwani & Pinnacle PA Console Zone Prioritization

This maps the audio routing and priority logic for the 10-zone (Dhwani) and 20-zone (Pinnacle) public address systems [6-9].

```text
[ AUDIO INPUT SOURCES ]
|
+-- Priority 1: External Fire Alarm Trigger (12V-24V Input) [6, 8]
|      +-- Overrides all other audio.
|      +-- Plays Pre-Recorded Fire Alert Voice Message [6, 8].
|
+-- Priority 2: Front Panel Microphone [6, 8]
       +-- Controlled via "PA ALL CALL" (broadcasts to all zones) [7, 10].
       +-- Controlled via "PA ON/OFF" + "ZONE 1-10/20" (individual paging) [7, 10].

[ AUDIO ROUTING & AMPLIFICATION ]
Mixer Board (Audio In / Aux In) ---> Inbuilt PA Amplifier (Up to 125W/250W) [11, 12]
                                          |
[ ZONE OUTPUTS ] <------------------------+
(Speaker Zones 1 through 10 / 20) [12, 13]