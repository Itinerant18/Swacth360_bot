## Jarvis Intruder Alarm Peripheral & Driver Topology

This diagram maps how the Jarvis panel interfaces with external sensors, remote keypads, and high-power sirens, specifically highlighting where intermediate driver units are required.

```text
[ JARVIS INTRUDER ALARM MAIN PANEL ]
       |
       +-- (RS232 Protocol) ---------------------> [ REMOTE KEYPAD ] (Up to 50 meters)
       |
       +-- (Dedicated Zone Inputs)
       |      |-- Panic Switch (Direct NC/COM)
       |      |-- Smoke Detector (Direct Power/Loop)
       |      +-- Night Zone Sensor (Dedicated Input)
       |
       +-- (Driver Unit Interfaces)
       |      * Required to convert analog sensor signals to NC/COM logic
       |      |-- [ DRIVER UNIT ] <--- Glass Break Sensor
       |      |-- [ DRIVER UNIT ] <--- Vibration Sensor
       |      |-- [ DRIVER UNIT ] <--- PIR Sensor
       |      +-- [ DRIVER UNIT ] <--- Magnetic Contact Switch
       |
       +-- (High Power Outputs)
       |      |-- [ MOTORIZED SIREN DRIVER ] ---> 220V AC Motorized Siren
       |      +-- Direct Hooter Output (12V, Max 1A)
       |
       +-- (Communication)
              +-- [ WHISPER G / I AUTODIALER ] (Triggered via Fire/Intr/Tamper/Silent Relays)