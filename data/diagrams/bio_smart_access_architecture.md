## Bio-Smart Biometric Access Control Architecture

This maps the internal hardware inputs, outputs, and memory capacities of the Bio-Smart access control panel [9, 10].

```text
[ MICROCONTROLLER CORE ]
  32-bit ARM Cortex-M MCU (120 MHz)
  Inbuilt RTC (Real Time Clock)
  Non-Volatile Memory: 1900 templates (exp. to 9000), 55,000 events

[ INPUT PERIPHERALS ]
  +--> Optical Fingerprint Sensor (500 dpi, <1 sec verification)
  +--> Card Reader Support (RFID, Mifare, HID iClass)
  +--> Membrane Keypad
  +--> Digital Input 1: Exit Switch
  +--> Digital Input 2: Fire Panel / Door Status

[ OUTPUT PERIPHERALS ]
  +--> 16x2 LCD Display & Interactive Voice Output
  +--> Relay Output 1: Door Lock
  +--> Relay Output 2: Auxiliary Buzzer
  +--> Exit Reader: Wiegand Configuration

[ NETWORK & COMMS ]
  +--> Ethernet (TCP/IP) for PC Software (Live logs, Add/Delete users)
  +--> USB 2.0 (Direct log download to Pen-Drive)

[ SECURITY & HARDWARE ]
  +--> Tamper Switch
  +--> Power Switch
  +--> Power Supply: 12VDC (500mA)
  +--> Case: IP65 Rated