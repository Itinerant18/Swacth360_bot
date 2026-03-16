## Apollo Series 65 Optical & Heat Detection Internal Logic

This maps the specific sensing mechanisms used inside the Apollo Series 65 point-type detectors to differentiate between normal environments and active fire conditions. [28-30]

```text
=== OPTICAL SMOKE SENSING LOGIC (55000-317) === [31]
[ NORMAL STATE ]
 1. GaAs Infra-Red LED emits a burst of collimated light modulated at 4kHz every 3 seconds. [28]
 2. Light is blocked from the Silicon PIN Photo-Diode by the black labyrinth molding. [28]

[ ALARM STATE ]
 1. Smoke enters the chamber and scatters the IR light onto the photo-diode. [28]
 2. If the signal exceeds the threshold, the LED emits two rapid confirmation bursts at 2-second intervals. [29]
 3. If light is scattered onto the diode during both confirmation pulses, the alarm latch activates. [29]
 4. Current draw increases from ~40µA to a maximum of 75mA to trigger the panel. [29]

=== HEAT SENSING LOGIC (Class A1R/BR/CR/CS) === [30, 32, 33]
[ SENSOR DESIGN ]
 1. Utilizes a pair of matched negative temperature co-efficient thermistors. [30]
 2. Thermistor A: Exposed for good thermal contact with surrounding air. [30]
 3. Thermistor B: Thermally insulated inside the housing. [30]

[ ALARM STATE ]
 1. Rate-of-Rise (A1R/BR/CR): A sudden temperature increase alters the resistance ratio between the exposed and insulated thermistors, triggering the alarm. [30]
 2. Static Limit: If the ambient temperature slowly reaches the maximum static response threshold (e.g., 65°C for A1R, 85°C for BR), the alarm triggers regardless of the rate of rise. [33]
