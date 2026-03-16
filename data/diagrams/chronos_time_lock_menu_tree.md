## Chronos Time Lock System Menu Hierarchy

This maps the strict user-level access hierarchy within the Chronos Time Lock, restricting specific security configurations to authorized personnel only [7-9].

```text
[ CHRONOS MAIN MENU ]
        |
        v
 (Enter Authorized Password)
        |
+-------+-------+-------+
|       |       |       |
v       v       v       v
[MASTER MODE]   [MANAGER MODE]   [PROGRAMMER MODE]   [TASK MANAGER]
(Full Access)   (Daily Ops)      (System Setup)      (Maintenance)
  |               |                |                   |
  |- Date/Time    |- Access Time   |- Clock/Calendar   |- Restart
  |- Network      |- Holiday List  |- Network Setup    |- Shutdown
  |- Access Time  |- User Group A  |- Date/Time Format |- Sleep Mode
  |- Holiday List |- User Group B  |- Exit             |- Maintenance Mode
  |- Special Evts |- Emergency Acc                     |- Logs
  |- User Group A |- Exit                              |- Lamp Test
  |- User Group B                                      |- Relay/Buzzer Test
  |- Passwords (All)                                   |- Exit
  |- Duress Time
  |- Date Format
  |- Emg. Access
  |- Low Battery
  |- Reset & Exit
