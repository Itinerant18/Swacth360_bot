## Apollo Series 65 Optical Chamber Architecture

This diagram illustrates the internal signal processing and physical labyrinth design of the Apollo Series 65 Optical Smoke Detector [6-8].

```text
=== PHYSICAL CHAMBER (LABYRINTH) ===
+---------------------------------------------------+
| - Moulded self-extinguishing white polycarbonate  |
| - Black labyrinth moulding to block ambient light |
| - Fine gauze insect-resistant mesh cover          |
+---------------------------------------------------+
                         |
                         v
=== OPTICAL BENCH & SENSORS ===
[ GaAs Infra-Red LED ]         [ Silicon PIN Photo-Diode ]
(Positioned at an obtuse angle so light does not fall directly on the diode in clear air)

=== SIGNAL PROCESSING LOGIC ===
1. Normal State: LED emits a burst of collimated light at 4kHz every 3 seconds.
2. Smoke Enters: Smoke particles scatter the collimated light onto the Photo-Diode.
3. Threshold Met: If the photo-diode signal passes the threshold, the LED emits two confirmation bursts at 2-second intervals.
4. Alarm Trigger: If both confirmation pulses detect scattered light, the alarm latch is switched ON.
5. Current Draw: Impedance drops, drawing up to 75mA to signal the control panel and illuminate the internal red LED.
