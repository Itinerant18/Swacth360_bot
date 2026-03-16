# GSM Communication Stack

```mermaid
flowchart TD

A[Application Layer]

A --> B[AT Command Interface]

B --> C[GSM Modem Firmware]

C --> D[Communication Protocol]

D --> E[SMS Protocol]
D --> F[Voice Call Protocol]
D --> G[GPRS / Data Protocol]

E --> H[GSM Network]
F --> H
G --> H

H --> I[Mobile Devices]
H --> J[Monitoring Server]