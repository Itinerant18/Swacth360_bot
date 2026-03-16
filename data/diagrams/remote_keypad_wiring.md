
# Remote Keypad Wiring Diagram

The remote keypad connects to the main alarm panel using a **4-wire serial communication link**.

---

# System Wiring Architecture

```mermaid
flowchart LR

A[Main Alarm Panel]

A -->|TX| B[RX Keypad]
B -->|TX| A

A -->|+12V| C[Power Input]
A -->|GND| D[Ground]

C --> B
D --> B