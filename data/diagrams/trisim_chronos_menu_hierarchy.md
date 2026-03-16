## Trisim (Chronos) Time Lock Menu Hierarchy [26, 27]

This architecture details the rigid role-based access control (RBAC) levels programmed into the Trisim Global Solutions Time Lock system. [26, 28]

```text
[ MAIN MENU AUTHENTICATION ] [26]
       |
       +---> 1. MASTER MODE (Highest Privilege) [26]
       |          |-- Date / Time & Network Settings [26, 29]
       |          |-- Access Time & Holiday List [26]
       |          |-- Special Events [30]
       |          |-- User Group A & B (Add/Enable/Disable) [31]
       |          |-- Change ALL Passwords (Master, Manager, Prog, Time Manager, Lock) [27, 32-35]
       |          |-- Duress Time (Wait & Active period) [36, 37]
       |          |-- Reset Settings & Reset Passwords [38]
       |
       +---> 2. MANAGER MODE (Daily Operations) [26, 39]
       |          |-- Access Time [39]
       |          |-- Holiday List [39]
       |          |-- User Group A & B Management [39]
       |          |-- Emergency Access [39]
       |
       +---> 3. PROGRAMMER MODE (System Integration) [26, 39]
       |          |-- Clock / Calendar [39]
       |          |-- Network Settings [39]
       |          |-- Date / Time Format [39]
       |
       +---> 4. TASK MANAGER (Diagnostics) [26, 40]
                  |-- Restart / Shut Down [41]
                  |-- Sleep Mode / Maintenance Mode [42]
                  |-- Logs (View Event buffer) [43]
                  |-- Lamp Test / Relay Test / Buzzer Test [44]
