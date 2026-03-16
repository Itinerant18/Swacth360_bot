## SB UNI Unified Panic Switch Wiring
This outlines the 4-wire HT connector configurations required to integrate the SB UNI switch across different SEPL alarm panels [3, 4].

```text
[ SB UNI INTERNAL COMPONENTS ]
  |-- FPB Micro Switch
  |-- 1K 5% 1/4W Resistor

[ 4-WIRE HT CONNECTOR ]
  Pin 1: Red
  Pin 2: Black
  Pin 3: Yellow
  Pin 4: Green

=== PANEL WIRING COMBINATIONS ===
* For ATUM & BAS3-6Z Panels:
  Connect wires 1 & 2 (Red & Black) to the zone terminals.

* For ISIS & JARVIS Panels:
  Connect wires 1 & 3 (Red & Yellow) to the zone terminals.

* For CHRONOS Time Lock (Lite/Pro):
  Connect wires 1 & 4 (Red & Green) to the lock inputs.

```
## SB UNI Universal Panic Switch Wiring

This details the specific 4-wire HT connector routing required to interface the universal SB UNI switch with the various SEPL control panels.

```text
[ SB UNI INTERNAL HARDWARE ]
 |--> FPB Micro Switch [19]
 |--> 1K 5% 1/4W Resistor [19]

[ 4-WIRE HT CONNECTOR ]
 Pin 1: Red     (Zone / Loop +) [19]
 Pin 2: Black   (Zone / Loop -) [19]
 Pin 3: Yellow  (Zone / Loop -) [19]
 Pin 4: Green   (Lock / Aux)    [19]

=== PANEL INTEGRATION MAPPING ===
* ATUM & BAS3-6Z Panels : Connect Pins 1 & 2 (Red + Black) [20]
* ISIS & JARVIS Panels  : Connect Pins 1 & 3 (Red + Yellow) [20]
* CHRONOS Time Lock     : Connect Pins 1 & 4 (Red + Green) [20]
