## Dexter HMS Webserver - Device Integration Architecture

This maps the specific configuration fields required to integrate third-party surveillance and access control systems into the Dexter HMS platform via the webserver [1, 2].

```text
[ DEVICE INTEGRATION MENU ]
        |
        v
[ ACTIVE INTEGRATIONS ]
  |
  +-- 1. HIKVISION NVR
  |      |-- NVR IP Address (e.g., 192.168.0.72) [3]
  |      |-- NVR Port Number (Default: 8080) [3]
  |      |-- NVR Username & Password [3]
  |      |
  |      +-- Connected Cameras (List of IP addresses & Usernames) [3]
  |      +-- [+ Add Camera] -> Prompts for Camera IP, Username, Password [4]
  |
  +-- 2. DAHUA NVR
  |      |-- IP Address (e.g., 192.168.0.108) [5]
  |      |-- Port Number (Default: 8080) [5]
  |      |-- Username & Password [5]
  |      |
  |      +-- Connected Cameras (List of IP addresses & Usernames) [5]
  |      +-- [+ Add Camera] -> Prompts for Camera IP, Username, Password [5]
  |
  +-- 3. HIKVISION BACS (Building Access Control System)
         |-- IP Address (e.g., 192.168.0.249) [6]
         |-- Port Number (Default: 8080) [6]
         |-- Username & Password [6]
