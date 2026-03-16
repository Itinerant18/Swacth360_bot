## Whisper G Auto-Dialer Hardware Architecture [1]

This block diagram maps the internal components and data buses of the Whisper G Auto-Dialer motherboard, detailing the microcontroller's peripheral connections. [1]

```text
[ HARDWARE INPUTS ]
                       +-------------------+
Keypad --------------> |  MICROCONTROLLER  | <======= (I2C Bus) =======> [ RTC (DS1307) ]
                       |  (SST89E516RD2 /  |                           |
Autodialer Terminals:  |   P89V51RD2)      | <======= (I2C Bus) =======> [ EEPROM (AT24C64) ]
 - Fire (+/-) -------> |                   |
 - Intrusion (+/-) --> |                   |
 - Silent (+/-) -----> |                   | <======= (UART/RS232) ====> [ GSM MODEM ]
 - Tamper (+/-) -----> |                   |                             (SIM900 / SIM800A)
                       +-------------------+                                   |
                               |      |                                        v
                               |      +------ (Audio Control) ------> [ VOICE RECORDER ]
                               v                                      (APR9301V2 / APR2060)
                       [ 16x2 LCD Display ]
