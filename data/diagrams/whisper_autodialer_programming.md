
# Whisper Auto-Dialer Programming Commands

Programming is done using the front keypad.

---

# Programming Flow

```mermaid
flowchart TD

A[Power ON System]

A --> B[Press SETUP Key]

B --> C[Enter User Password]

C --> D{Password Valid}

D -->|Yes| E[Enter Command Code]

D -->|No| F[Use Master Password 1367]

F --> E

E --> G[Execute Command]

G --> H[System Stores Configuration]