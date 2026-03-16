## Whisper G V2.0 Hardware Architecture (Updated)

This schematic reflects the updated component bill of materials (BOM) for the Whisper G Auto-Dialer, highlighting the specific voltage regulators and the transition to newer Voice and GSM ICs.

```text
[ POWER SUPPLY ]
   9V - 16V DC In (Idle: 40mA / Active: 87mA) [8]
         |
         +---> [ LM2576T-5.0 ] (Fixed 5V Regulator) [8]
         |       |--> Powers: SST89E516RD2 MCU, LCD, EEPROM, RTC [8]
         |       +--> Powers: APR2060 (Replaced APR9301 for Voice) [8, 9]
         |
         +---> [ LM2576S-ADJ ] (Adjusted to 4.0V) [8]
                 |--> Powers: SIM800A / SIM800C GSM Modem [8, 9]

[ DATA BUSES ]
[ MCU ] <--- (I2C Bus: SDA/SCL) ---> [ DS1307 RTC ] & [ AT24C64 EEPROM ] [10, 11]
[ MCU ] <--- (RS232 / UART) -------> [ SIM800A Modem ] [11]
