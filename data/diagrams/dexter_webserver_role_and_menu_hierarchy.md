## Dexter HMS Webserver - Role & Menu Navigation Hierarchy

This maps the complete web interface navigation tree and role-based access control for the Dexter Health Monitoring System. [1-3]

```text
[ LOGIN SCREEN ]
   |-- Roles: [ USER ] (Restricted Ops) | [ INSTALLATION ] (Admin/Full Access) [1, 4]
   |-- Default Installation Creds: ADMIN / SEPLe@4321 [5]
   |
   v
[ HOME DASHBOARD ]
   |-- Device Statistics: CPU %, RAM %, Disk %, Network Mode, Uptime, CPU Temp [6]
   |
[ MAIN NAVIGATION SIDEBAR ] [2, 3]
   |
   +-- 1. Device Configuration
   |      |-- Normal Zone Config (Zones 1-16) [3]
   |      |-- Power Zone Config (Zones 1-8) [3]
   |      +-- Output Management (Active Integrations & Relays) [7]
   |
   +-- 2. Events & Log Management
   |      |-- Logs (View/Download audit trail) [8]
   |      +-- Event Reports (Daily/Periodic summaries) [9]
   |
   +-- 3. Network & Comms Settings
   |      |-- Connectivity Settings (SIM Type) [10]
   |      |-- GNSS Settings (Location tracking)
   |      |-- Device Credential (eSIM Client ID, User, Pass) [11]
   |      |-- GSM Settings
   |      +-- LAN Setup (Static/DHCP, DNS, Gateway) [12]
   |
   +-- 4. Device Integration
   |      |-- Integration Settings (Hikvision/Dahua NVRs, BACS) [13]
   |      +-- Device Management
   |
   +-- 5. Power Management
   |      |-- Low Battery (Thresholds) [14]
   |      +-- Power Backup (UPS Config) [14]
   |
   +-- 6. System Settings
   |      |-- General Settings (Brand, Site Name, Date/Time, Password) [15, 16]
   |      |-- Maintenance (Restart System) [17]
   |      +-- Advanced Settings (Setup Mode) [18]
   |
   +-- 7. System Test (Hardware Diagnostics) [19]
   |      |-- Lamp Test | Relay Test | Buzzer Test [20]
   |
   +-- 8. Protocol Configuration (Modbus, BACnet, MQTT) [20]
   |
   +-- 9. Device Registration
   |      +-- Device Provisioning (Cloud connection handshake) [21]
   |
   +-- 10. OTA Update (Over-The-Air Firmware Management) [3]