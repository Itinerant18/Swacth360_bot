## SEPL UPS SMPS Block Diagram (40W / 60W / 100W Series)

This architecture maps the internal circuitry of the Switched-Mode Power Supply (SMPS) units used across SEPL panels (like Jarvis, Isis, and Hestia), featuring built-in battery charging and backup control [1].

```text
[ AC INPUT: 110-265 VAC ]
         |
         v
+------------------+      +-------------------+      +-------------------+
|    EMI FILTER    | ---> | RECTIFIER & FILTER| ---> | POWER SWITCHING   |
+------------------+      |    (Primary)      |      |     FILTER        |
                          +-------------------+      +-------------------+
                                   |                           |
                                   v                           v
                           [ Primary Ground ]          +-------------------+
                                                       |   TRANSFORMER     |
                                                       |   (Isolation)     |
                                                       +-------------------+
                                                               |
+------------------+      +-------------------+                v
|    PWM / DRIVER  | <--- |   OPTOISOLATOR    |      +-------------------+
|    CONTROLLER    |      |    (Feedback)     | <--- | RECTIFIER & FILTER| ---> [ DC OUTPUT ]
+------------------+      +-------------------+      |   (Secondary)     |      (13.8V / 14.0V)
                                   ^                 +-------------------+
                                   |                           |
                          +-------------------+                v
                          | REFERENCE / ERROR |        [ Secondary Ground ]
                          |       AMP         |                |
                          +-------------------+                v
                                                     +-------------------+
                                                     | BATTERY CHARGER & | ---> [ BATTERY +/- ]
                                                     | BACK UP CONTROL   | 
                                                     +-------------------+
                                                     | -> AC OK Signal   |
                                                     | -> Bat Low Signal |
                                                     +-------------------+
