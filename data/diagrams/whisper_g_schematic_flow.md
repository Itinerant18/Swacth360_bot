## Whisper G Motherboard Schematic Flow

Based on the internal engineering schematics, this diagram maps the primary Integrated Circuits (ICs) and data routing across the Whisper G Auto-Dialer motherboard.

```text
[ POWER IN ]
   12V DC ---> [ LM2596-ADJ / LM2576S ] (Step-down to +5V VCC)
                      |
                      v
[ SENSORS ] ---> [ HT12D ] (Decoder) ---> [ AT89C2051P / SST89E516RD2 ] (Main MCU)
                                                   |   |   |
                  [ I2C BUS ] <--------------------+   |   |
                  |                                    |   |
                  +--> [ DS1307 ] (Real Time Clock)    |   |
                  +--> [ 24C64 ] (EEPROM Memory)       |   |
                                                       |   |
[ AUDIO & TELEPHONY ]                                  |   |
Microphone ---> [ APR2060 ] (Voice Record/Play) <------+   |
                      |                                    |
                      v                                    |
[ DTMF GEN ] <- [ HT9200A/B ] <----------------------------+
                      |                                    |
                      v                                    |
                [ CD4066 ] (Analog Switch)                 |
                      |                                    |
                      v                                    |
               [ PSTN LINE OUT ]                           v
                                                  [ MAX232CSE ] (UART/RS232)
                                                           |
                                                           v
                                                [ SIM800A/800C GSM MODEM ] ---> Antenna
