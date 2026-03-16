## Dhwani PA Console Internal Bus Routing

This schematic details the internal multi-pin IDC (Insulation-Displacement Connector) ribbon cables that route power, control logic, and audio across the Dhwani Motherboard.

```text
[ SMPS & BATTERIES ]
       |
       v
[ PINNACLE POWER BOARD ]
       |
       | (10-Pin IDC Cable)
       v
[ MAIN MOTHER BOARD ] <---- (Aux_In) ---- [ PA AMPLIFIER ] (2x125W)
       |
       +--- (34-Pin IDC Cable) ---> [ FRONT PANEL LCD & SYSTEM KEYPAD ]
       |
       +--- (20-Pin IDC Cable) ---> [ KEYPAD LED BOARD ] (Zone Status LEDs)
       |
       +--- (20-Pin IDC Cable) ---> [ MIXER BOARD ]
                                          |
                                          +--> MIC IN / MIC OUT
                                          +--> HOOTER OUT
                                          +--> COMMON SPK_IN / SPK_OUT
                                          +--> SPK 1 through SPK 10 (Zone Audio)