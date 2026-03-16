## Jarvis Intruder Alarm Zone & RF Topology

This diagram maps the 16-zone configuration of the Jarvis panel, detailing the division between wired and wireless zones, along with the RF remote decoding logic.

```text
[ JARVIS INTRUDER ALARM PANEL ]

=== ZONE CONFIGURATION ===
[ WIRED ZONES (1-8) ]
 |--> Zones 1-5: Configurable (Day/Night/Fire/Isolate) [1]
 |--> Zones 6-7: Dedicated Night Zones (Opto-Isolated) [2, 3]
 |--> Zone 8: Configurable

[ WIRELESS ZONES (9-16) ]
 |--> 433MHz RF Receiver Module [4]
 |--> Decoded via HT12D IC (from remote HT12E encoder) [4]
 |--> Functions: Reset, Trigger, Arm, Disarm [4, 5]

=== PERIPHERAL COMMUNICATION ===
[ REMOTE KEYPAD ] <--- (RS232 Protocol, up to 50m) ---> [ MAIN MCU ] [6]
[ AUTO-DIALER ] <--- (12V Trigger Output) ---> [ WHISPER G/I ] [7]

[diff_block_end]

Please note that the above snippet only shows the MODIFIED lines from the last change. It shows up to 3 lines of unchanged lines before and after the modified lines. The actual file contents may have many more lines not shown.