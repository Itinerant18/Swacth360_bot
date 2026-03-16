## Dexter HMS Panel Complete Configuration Flow [2-8]

This flowchart maps the exact step-by-step navigation path required by an installer to fully configure the Dexter Health Monitoring System from initial login to cloud provisioning. [2, 9]

```text
[ INITIAL LOGIN ] (Default Pass: 123321) [10]
       |
       v
[ 1. DEVICE CONFIGURATION ] [10]
       |-- Normal Zone Config (Zones 1-6) -> Assign: BAS, FAS, Time Lock, BACS, NVR/DVR, IAS [3]
       |-- Power Zone Config (Zones 1-8) -> Assign Device Type & Toggle Buzzer [11]
       |
       v
[ 2. NETWORK SETTINGS ] [12]
       |-- Device Credential -> Set Client ID, Username, Password [5, 13]
       |-- LAN Setup -> Set IP Address, Port, Gateway, Subnet, DNS (Static or DHCP) [14, 15]
       |
       v
[ 3. DEVICE INTEGRATION ] [16]
       |-- Active Integrations -> Toggle ON/OFF for external platforms [17]
       |-- Hikvision NVR / Dahua NVR -> Input IP, Port, User, Pass -> Add Cameras [18, 19]
       |-- Hikvision BACS -> Input IP, Port, User, Pass [20]
       |
       v
[ 4. OUTPUT MANAGEMENT ] [21]
       |-- Relay Triggers -> Toggle Action on Trigger, Clear Buffer, Active Intgr [7, 21]
       |
       v
[ 5. SYSTEM SETTINGS ] [22]
       |-- General Settings -> Set Date/Time, User Passwords, Site Name, Brand Name [22, 23]
       |
       v
[ 6. DEVICE PROVISIONING ] [8]
       |-- SOL ID -> Add and Update SOL ID [24]
       |-- Device PVSN -> Execute Provisioning handshake with Cloud Server [24]
       |
[ REBOOT SYSTEM TO APPLY ] [25]
