# Alarm Trigger Processing Flow

```mermaid
flowchart TD

A[Sensor Trigger]

A --> B{Trigger Type}

B --> C[Fire Alarm]
B --> D[Intrusion Alarm]
B --> E[Tamper Alarm]
B --> F[Silent Alarm]

C --> G[Alarm Control Panel]
D --> G
E --> G
F --> G

G --> H[Whisper Auto Dialer]

H --> I[Check System Settings]

I --> J{Notification Mode}

J --> K[Send SMS]
J --> L[Place Voice Call]
J --> M[SMS + Voice Call]

K --> N[User Mobile Phones]

L --> O[Play Recorded Voice Message]

M --> N
M --> O

O --> N

N --> P[User Receives Alert]