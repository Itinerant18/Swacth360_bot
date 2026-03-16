## Dexter HMS Cloud & IoT Architecture

This diagram maps the data flow from physical edge devices through the local Dexter HMS receiving station up to the Dexter Cloud Server via MQTT.

```text
=== 1. EDGE SENSORS & PANELS ===
[ Smoke / Heat Detectors ] -----> [ Fire Alarm Panel ] ------+
                                                             | (SIA / Contact ID Protocol)
[ CCTV Cameras ] ---------------> [ DVR / NVR ] -------------+
                                   (I/O Port or IP)          |
                                                             v
=== 2. LOCAL RECEIVING STATION ===                [ DEXTER HMS PANEL ]
                                                  - Debian Linux OS
                                                  - Local Dashboard (Health, Control, Logs)
                                                  - Modbus, Contact ID, SIA Support
                                                             |
                                                             | (MQTT / HTTP via LAN/GSM)
                                                             v
=== 3. IOT CLOUD PLATFORM ===                     [ DEXTER CLOUD SERVER (CMS) ]
                                                  - Fault-tolerant, horizontally scalable
                                                  - RPC Request Control
                                                  - Dynamic telemetry dashboards
                                                             |
                                                             v
                                                  [ MOBILE / DESKTOP UI ]
