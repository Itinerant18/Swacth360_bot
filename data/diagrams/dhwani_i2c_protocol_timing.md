## Dhwani / Pinnacle PA System I2C Protocol Timing

This diagram illustrates the 2-wire I2C protocol (SDA for serial data and SCL for serial clock) used for internal board communication in the Dhwani and Pinnacle PA systems [4-6].

```text
=== I2C WRITE SEQUENCE (Master to Slave) ===

[START] ---> [ Slave Address (7-bit) ] ---> [ R/nW Bit (0) ] ---> [ ACK (from Slave) ]
                                                                          |
+-------------------------------------------------------------------------+
|
+--> [ Data Byte (8-bit) ] ---> [ ACK (from Slave) ] ---> [ Data Byte (8-bit) ] ---> [ ACK ] ---> [STOP]

=== I2C READ SEQUENCE (Master from Slave) ===

[START] ---> [ Slave Address (7-bit) ] ---> [ R/nW Bit (1) ] ---> [ ACK (from Slave) ]
                                                                          |
+-------------------------------------------------------------------------+
|
+--> [ Data Byte (from Slave) ] ---> [ ACK (from Master) ] ---> [ Data Byte ] ---> [ NACK (Master) ] ---> [STOP]

*Note: The master issues a NACK when it has received enough data, releasing the bus before the STOP condition [4, 6].*
