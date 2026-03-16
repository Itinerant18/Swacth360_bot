## UART / RS232 Serial Data Bit Stream

`UART` transmits data asynchronously one bit at a time using `TX` and `RX` lines. The transceiver (like the `MAX232`) converts the `0-5V` microcontroller logic into `+12V/-12V` RS232 levels.

### Logic Values & Bit Sequence
```text
| IDLE | START | B0 | B1 | B2 | B3 | B4 | B5 | B6 | B7 | STOP | IDLE |
|   1  |   0   | 0  | 1  | 0  | 1  | 0  | 0  | 1  | 0  |  1   |  1   |
```

### Signal Levels at UART Output Pin
```text
+5V  |-------+       +---+   +---+       +---+       +-------+-------
     |       |       |   |   |   |       |   |       |
 0V  |       +-------+   +---+   +-------+   +-------+
```

### Signal Levels at Transceiver Output Pin (RS232)
```text
-12V |-------+       +---+   +---+       +---+       +-------+-------
     |       |       |   |   |   |       |   |       |
+12V |       +-------+   +---+   +-------+   +-------+
```

### Key States
- **IDLE**: Held at logic high (`+5V` TTL / `-12V` RS232).
- **START BIT**: Drops to logic low to synchronize the receiver.
- **STOP BIT**: Returns to logic high to provide a gap before the next transmission.


# UART / RS232 Serial Communication

UART transmits data **asynchronously**, meaning there is **no shared clock** between transmitter and receiver.

Synchronization is achieved using:

• Start bit  
• Data bits  
• Optional parity  
• Stop bit  

Typical configuration: 9600 baud, 8 data bits, no parity, 1 stop bit (8N1)


---

# 1. UART Frame Structure

```mermaid
flowchart LR

IDLE1[Idle High]

START[Start Bit\nLogic 0]

B0[Bit 0]

B1[Bit 1]

B2[Bit 2]

B3[Bit 3]

B4[Bit 4]

B5[Bit 5]

B6[Bit 6]

B7[Bit 7]

STOP[Stop Bit\nLogic 1]

IDLE2[Idle]

IDLE1 --> START --> B0 --> B1 --> B2 --> B3 --> B4 --> B5 --> B6 --> B7 --> STOP --> IDLE2

# 2. Bit Timing Diagram
Example transmitting binary data: 01010010
Time → →

+5V
     ────────┐      ┌────┐   ┌────┐        ┌────┐
             │      │    │   │    │        │    │
0V  ─────────┘──────┘────┘───┘────┘────────┘────┘────

       START   B0   B1   B2   B3   B4   B5   B6   B7   STOP
        0      0    1    0    1    0    0    1    0     1


```
# 3. TTL to RS-232 Level Conversion
-- Microcontrollers use TTL logic (0–5V).
-- RS-232 requires ±12V signaling.
-- The MAX232 transceiver performs this conversion.

flowchart LR

MCU[Microcontroller UART]

TX[TX Pin]

RX[RX Pin]

MAX[MAX232 Level Converter]

RS232[RS232 Port]

DEVICE[External Device\nPC / Modem]

MCU --> TX

TX --> MAX

MAX --> RS232

RS232 --> DEVICE

DEVICE --> RS232

RS232 --> MAX

MAX --> RX

RX --> MCU

# 4. Signal Level Comparison
| Logic State | TTL UART | RS-232 |
| ----------- | -------- | ------ |
| Logic 1     | +5V      | −12V   |
| Logic 0     | 0V       | +12V   |

 --UART Logic Levels
 +5V ───────────────  Logic 1 (Idle)
 0V  ───────────────  Logic 0

 --RS-232 Logic Levels
 +12V ───────────────  Logic 0
 -12V ───────────────  Logic 1 (Idle)

# 5. MAX232 Internal Operation
flowchart TD

VCC[+5V Supply]

CP1[Charge Pump]

CP2[Voltage Doubler]

CP3[Voltage Inverter]

TXDRV[RS232 Transmitter Driver]

RXRCV[RS232 Receiver]

VCC --> CP1

CP1 --> CP2

CP2 --> CP3

CP3 --> TXDRV

TXDRV --> RXRCV

# 6. Complete Communication Path
flowchart LR

MCU[Microcontroller]

UART[UART Peripheral]

MAX232[MAX232 Transceiver]

RS232[RS232 Cable]

PC[PC Serial Port]

MCU --> UART

UART --> MAX232

MAX232 --> RS232

RS232 --> PC


# 7. UART Transmission Sequence
MCU loads byte into UART register
        ↓
UART hardware adds start bit
        ↓
Data bits transmitted LSB first
        ↓
Stop bit transmitted
        ↓
Receiver samples bits using baud clock

# 8. Common Issues
| Issue | Cause | Solution |
|-------|-------|----------|
| No data received | Wrong baud rate | Set matching baud rates |
| Garbled data | Voltage level mismatch | Use level converter |
| Communication stops | Missing stop bit | Check configuration |

# 9. Timing Example (9600 Baud)
| Parameter      | Value         |
| -------------- | ------------- |
| Bit time       | 104 µs        |
| Frame time     | 1.04 ms       |
| Max throughput | 960 bytes/sec |

# 10. DB9 Connector Pinout
```text
Pin 2: RXD (Receive Data)
Pin 3: TXD (Transmit Data)
Pin 5: GND (Ground)
```

---
> 📚 **Source:** UART/RS-232 technical specifications and MAX232 datasheet.