
# Dexter HMS Network Configuration

Dexter HMS uses a hierarchical network configuration system for connectivity with the cloud server.

---

# Network Configuration Architecture

```mermaid
flowchart TD

A[Dexter HMS System]

A --> B[eSIM Settings]
A --> C[GNSS Module]
A --> D[IP Module]
A --> E[LAN Setup]
A --> F[IP Configuration]

B --> B1[Client ID]
B --> B2[Username]
B --> B3[Password]
B --> B4[SOL ID]

C --> C1[Enable / Disable]

D --> D1[Enable / Disable]

E --> E1[LAN LED Status]
E --> E2[Wireless LAN Interface]
E --> E3[Ethernet LAN Interface]

F --> F1[Dynamic IP Mode]
F --> F2[Static IP Mode]

F2 --> G1[IP Address]
F2 --> G2[Port Number]
F2 --> G3[Account Number]
F2 --> G4[Subnet Mask]
F2 --> G5[Gateway Address]
F2 --> G6[Heartbeat Interval]
F2 --> G7[CMS Module Enable]