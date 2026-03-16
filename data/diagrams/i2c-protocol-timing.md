## I2C Protocol Timing Sequence

The `I2C` protocol uses a 2-wire bus (`SDA` for data, `SCL` for clock) driven by a master device. Below is the standard sequence for writing or reading two bytes of data.

```text
| START | Slave Address | Rd/nWr | ACK   | Data   | ACK   | Data   | ACK / NACK | STOP  |
|-------|---------------|--------|-------|--------|-------|--------|------------|-------|
| 1 bit | 7 bits        | 1 bit  | 1 bit | 8 bits | 1 bit | 8 bits | 1 bit      | 1 bit |
```

### Sequence Details
- **START**: Master initiates the transfer.
- **Slave Address**: 7-bit identifier for the target slave device.
- **Rd/nWr**: `0` for Write, `1` for Read.
- **ACK/NACK**: Acknowledge bit. Master issues a `NACK` when it has received enough data, followed by the `STOP` condition to release the bus.
- **STOP**: Master concludes the transfer.

# I2C Protocol Timing & Communication Diagram

The **Inter-Integrated Circuit (I2C)** protocol is a synchronous serial communication bus that uses **two wires**:

| Line | Function |
|-----|-----------|
| SDA | Serial Data Line |
| SCL | Serial Clock Line |

A **master device** controls communication and generates the clock signal, while **slave devices respond to addressing**.

---

# 1. I2C Bus Architecture

```mermaid
flowchart LR

A[I2C Master Controller]

B[I2C Slave Device 1]
C[I2C Slave Device 2]
D[I2C Slave Device 3]

E[SDA Data Line]
F[SCL Clock Line]

A --- E
A --- F

B --- E
B --- F

C --- E
C --- F

D --- E
D --- F


# 2. I2C Timing Sequence Diagram

sequenceDiagram

participant Master
participant Slave

Master->>Slave: START Condition
Master->>Slave: 7-bit Slave Address
Master->>Slave: R/W Bit
Slave-->>Master: ACK

Master->>Slave: Data Byte 1 (8 bits)
Slave-->>Master: ACK

Master->>Slave: Data Byte 2 (8 bits)
Slave-->>Master: ACK or NACK

Master->>Slave: STOP Condition

```

# 3. I2C Bit-Level Timing Diagram

flowchart LR

A[START]

A --> B[7-bit Slave Address]

B --> C[Read/Write Bit]

C --> D[ACK]

D --> E[8-bit Data Byte]

E --> F[ACK]

F --> G[8-bit Data Byte]

G --> H[ACK or NACK]

H --> I[STOP]


# 4. I2C Timing Diagram (Waveform)

```mermaid

```

---

# 5. SDA vs SCL Signal Timing

SCL  ──┐ ┌─┐ ┌─┐ ┌─┐ ┌─┐ ┌─┐ ┌─┐ ┌─┐
       └─┘ └─┘ └─┘ └─┘ └─┘ └─┘ └─┘ └─

SDA  ──\___DATA___/ACK\___DATA___/NACK

       |START|ADDRESS|ACK|DATA|ACK|DATA|STOP|
---

# 6. Complete Transfer Frame

| START | Slave Address | R/W | ACK | Data Byte 1 | ACK | Data Byte 2 | ACK/NACK | STOP |
|-------|---------------|-----|-----|-------------|-----|-------------|----------|------|
| 1 bit | 7 bits        | 1   | 1   | 8 bits      | 1   | 8 bits      | 1        | 1    |

---

# 7. Read vs Write Operation

Write Operation
START
↓
Slave Address + W
↓
ACK
↓
Data Byte
↓
ACK
↓
STOP
Read Operation
START
↓
Slave Address + R
↓
ACK
↓
Receive Data
↓
Master sends NACK
↓
STOP
---

# 8. Typical I2C Device Examples

| Device             | Address Range |
| ------------------ | ------------- |
| EEPROM             | 0x50 – 0x57   |
| RTC                | 0x68          |
| Temperature Sensor | 0x48          |
| ADC                | 0x40          |

---

# 9. Embedded Firmware Example (Pseudo Code)

i2c_start();

i2c_send_address(0x50, WRITE);

i2c_write_byte(0x12);

i2c_write_byte(0x34);

i2c_stop();

---

---

✅ This documentation now includes:

- I²C **architecture diagram**
- **communication sequence diagram**
- **bit-level timing diagram**
- **SDA/SCL waveform**
- **protocol frame**
- **firmware example**

---

If you want, I can also generate **3 more advanced I²C diagrams used in embedded system documentation**:

1. **Multi-Master I²C Arbitration Diagram**  
2. **I²C Bus Electrical Circuit Diagram (Pull-up resistors)**  
3. **I²C Firmware Driver State Machine**

These are very useful for **embedded systems datasets and hardware documentation**.