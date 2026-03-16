## Dexter HMS CCTV/NVR Telemetry Data Schema

This outlines the specific data formats and status indicators transmitted from the edge DVR/NVR devices to the Dexter Cloud Dashboard for surveillance monitoring [6-8].

```text
=== 1. NVR / DVR OVERVIEW METRICS ===
[ Branch Name ] : Text (e.g., "BRANCH PODASTIA")
[ Heartbeat ] : ON / OFF (Connectivity status)
[ System Status ] : Healthy / Fault / Inactive
[ Total Cameras ] : X/Y Format (e.g., "16/16" Active/Total)
[ Storage Info ] : Used Space + Slots (e.g., "0 TB, 4/4")

=== 2. INDIVIDUAL CAMERA DATA (Per Channel) ===
[ Channel ] --------> CH 1 through CH 16
[ Link Status ] ----> Online / Offline
[ Camera Status ] --> Healthy / Fault / Tampered
[ Resolution ] -----> e.g., "1920x1080"
[ FPS ] ------------> Number (Frames Per Second)

=== 3. HDD STORAGE & RECORDING DATA ===
[ HDD Slot ] -------> Slot 1, 2, 3, 4
[ HDD Status ] -----> OK / Error / Idle
[ Capacity ] -------> TB / GB (Total & Free Space)
[ Recording ] ------> Total Duration (Days/Hours) + Start/End Timestamps

=== 4. ALARM COUNTERS ===
- Camera Tamper Count (Number)
- Camera Disconnections Count (Number)
- HDD Errors Count (Number)
