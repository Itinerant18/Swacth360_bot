## Dexter HMS Webserver - Network & Comms Architecture

This maps the specific sub-menus and data fields required to establish network connectivity, location tracking, and cellular data for the Dexter panel [1].

```text
[ NETWORK & COMMS SETTINGS ]
       |
       +--> 1. GNSS SETTINGS
       |         |-- Toggle: GNSS Enable/Disable [2]
       |         +-- Note: Provides location-based services for device tracking [2].
       |
       +--> 2. DEVICE CREDENTIAL (e-SIM)
       |         |-- Client ID (e.g., RND-CL14) [3]
       |         |-- User Name (e.g., RND-UN14) [3]
       |         |-- Password (with visibility toggle) [3]
       |         +-- SOL ID (e.g., RND14) [3]
       |
       +--> 3. LAN SETUP
                 |-- Interface: IPv4 [4]
                 |-- IP Mode: Static / DHCP Auto-enable [4]
                 |-- DNS Setup: Preferred DNS / Alternate DNS [4]
                 +-- LAN Status LEDs: Wireless LAN (On/Off) / Ethernet LAN (On/Off) [5]
