## Dexter HMS Webserver Diagnostics & System Test Architecture

This maps the specific hardware testing and OTA update flows accessible via the advanced settings on the Dexter Webserver.

```text
[ DEXTER WEBSERVER UI ]
       |
       +--> [ SYSTEM TEST ] (Hardware Diagnostics)
       |      |
       |      +-- Lamp Test   -> Toggles all Front Panel LEDs (ON/OFF)
       |      +-- Relay Test  -> Toggles all 3 internal relays (ON/OFF)
       |      +-- Buzzer Test -> Toggles internal panel buzzer (ON/OFF)
       |
       +--> [ OUTPUT MANAGEMENT ]
       |      |
       |      +-- Clear Buffer -> Clears temporary commands/data in output buffer
       |      +-- Setup Mode   -> Re-initialization / low-level config
       |      +-- Reset to Default -> Full Factory Reset
       |
       +--> [ OTA UPDATE ]
              |
              +-- Firmware Version Check
              +-- [ Initiate Over-The-Air Update ] (Downloads new features/fixes)