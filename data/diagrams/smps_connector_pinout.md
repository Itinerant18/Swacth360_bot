## Switched-Mode Power Supply (SMPS) Connector Pinout

This details the specific header pinouts for the 15V/27.6V SMPS boards used in the Jarvis, Isis, and Hestia panels (e.g., PSC-60/PSC-100 series).

```text
[ SMPS PCB BOARD ]

=== CN1: AC INPUT CONNECTOR (JST B3P-VH) ===
Pin 1: AC/N (Neutral)
Pin 2: No Pin (Blank for isolation)
Pin 3: AC/L (Live)

=== CN2: DC OUTPUT & ALARM CONNECTOR (JST B6P-VH) ===
Pin 1: DC Output +      (To Main Motherboard VCC)
Pin 2: DC Output COM    (Ground / V-)
Pin 3: Battery -        (To SLA Battery Negative)
Pin 4: Bat. Low         (Open Collector Output: Low when Battery < 11.5V)
Pin 5: Battery +        (To SLA Battery Positive)
Pin 6: AC OK            (Open Collector Output: Low when Mains AC is present)

*Note: AC OK and Battery Low signals sink a maximum of 30mA at 50VDC.*