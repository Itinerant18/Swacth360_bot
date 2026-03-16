## Dexter HMS Shift Register (74HC595) Pinout Mapping

This diagram maps the specific microcontroller output pins to the 4 cascaded shift registers (SR-1 through SR-4) on the Dexter Health Monitoring System main board, which drive the relays, buzzers, LEDs, and multiplexer lines [1-3].

```text
[ SHIFT REGISTER 1: Outputs & Relays ]
Pin 15 (Bit 0)  ---> RELAY 1 (Tamper / System Off)
Pin 1  (Bit 1)  ---> RELAY 2 (Fault Condition)
Pin 2  (Bit 2)  ---> RELAY 3 (Trigger Condition)
Pin 3  (Bit 3)  ---> INTERNAL BUZZER
Pin 4  (Bit 4)  ---> REMOTE LED 1
Pin 5  (Bit 5)  ---> REMOTE BUZZER
Pin 6  (Bit 6)  ---> LCD BACKLIGHT

[ SHIFT REGISTER 2: Fire & Burglar LEDs ]
Pin 15 (Bit 8)  ---> FIRE PANEL FAULT
Pin 1  (Bit 9)  ---> FIRE PANEL ACTIVE
Pin 2  (Bit 10) ---> FIRE PANEL ON
Pin 3  (Bit 11) ---> BURGLAR PANEL FAULT
Pin 4  (Bit 12) ---> BURGLAR PANEL ACTIVE
Pin 5  (Bit 13) ---> BURGLAR PANEL ON
Pin 6  (Bit 14) ---> HDD ERROR

[ SHIFT REGISTER 3: Camera & Network LEDs ]
Pin 15 (Bit 16) ---> CAMERA DISCONNECT
Pin 1  (Bit 17) ---> CAMERA TAMPER
Pin 2  (Bit 18) ---> NETWORK
Pin 3  (Bit 19) ---> 4G LTE
Pin 4  (Bit 20) ---> SYSTEM HEALTHY
Pin 5  (Bit 21) ---> NVR/DVR ON
Pin 6  (Bit 22) ---> SYSTEM ON

[ SHIFT REGISTER 4: Multiplexer Selection Lines ]
Pin 15 (Bit 24) ---> MUX SELECT LINE A
Pin 1  (Bit 25) ---> MUX SELECT LINE B
Pin 2  (Bit 26) ---> MUX SELECT LINE C
Pin 3  (Bit 27) ---> MUX SELECT LINE D
