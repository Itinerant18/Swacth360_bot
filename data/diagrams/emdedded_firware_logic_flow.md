# Embedded Firmware Logic Flow

```mermaid
flowchart TD

A[System Boot]

A --> B[Initialize Hardware]

B --> C[Load Configuration]

C --> D[Check Power Status]

D --> E{Battery OK}

E -->|Yes| F[Start Sensor Monitoring]
E -->|No| G[Trigger Battery Low Alert]

F --> H{Sensor Trigger}

H -->|Fire| I[Activate Fire Alarm]
H -->|Intrusion| J[Activate Intrusion Alarm]
H -->|Tamper| K[Activate Tamper Alert]

I --> L[Send SMS]
J --> L
K --> L

L --> M[Place Voice Call]

M --> N[Log Event]

N --> F