## C-9104 Conventional Ultraviolet Flame Detector Wiring

This schematic details the 24VDC loop wiring and internal alarm logic for the C-9104 UV flame detector utilizing the DZ-03 base.

```text
[ FIRE ALARM CONTROL PANEL ]
  (24VDC Loop Power)
         |
         v
+-------------------------------------------------------+
| DZ-03 DETECTOR BASE                                   |
|                                                       |
|  [ Terminal 1 ] <---- (+) 24V DC IN (Anode)           |
|                                                       |
|  [ Terminal 3 ] <---- (-) 24V DC IN (Cathode)         |
|                                                       |
|  [ Terminal 2 ] ----> (+) 24V DC OUT (To next device) |
|                                                       |
| *Note: The detector operates in current output mode   |
|  and shorts the loop with an internal 680-ohm         |
|  resistor upon alarming.                              |
+-------------------------------------------------------+
         |
         v
    [ TO NEXT DETECTOR ]
