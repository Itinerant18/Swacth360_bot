## Apollo Series 65 Optical Smoke Labyrinth Logic

This details the specific optical bench sampling frequencies and threshold logic used by the Series 65 detectors to confirm a fire [14-17].

```text
=== NORMAL STATE ===
[ GaAs Infra-Red LED ] emits a collimated light burst every 3 seconds (4 kHz) [15, 16].
Light is blocked from the Silicon PIN Photo-Diode by the internal labyrinth [15, 16].

=== SMOKE DETECTION & CONFIRMATION ===
1. Smoke enters the chamber, scattering IR light onto the Photo-Diode [15].
2. If the signal passes the clean air reference voltage, the LED enters "Confirmation Mode" [15, 18].
3. LED emits two rapid confirmation bursts at 2-second intervals [15, 16].
4. If 3 consecutive sensed alarm signals detect scattered light, the alarm triggers [17].

=== ALARM LATCH STATE ===
Current draw jumps from ~40µA to a maximum of 75mA [15].
The 6V-28V alarm voltage illuminates the internal red LED and the remote indicator [14, 19].

