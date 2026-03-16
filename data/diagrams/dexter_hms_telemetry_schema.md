## Dexter HMS / Swatch 360 Telemetry Data Schema

This maps the specific data parameters and historical arrays transmitted from the Dexter local receiving station to the Cloud CMS (ThingsBoard/Swatch 360) via MQTT.

```text
=== 1. ELECTRICAL & HEALTH TELEMETRY ===
* SMPS VOLTAGE       : Current AC/DC voltage (Thresholds: 100V / 220V / 270V)
* SYSTEM CURRENT     : Current draw in Amps (Thresholds: 2.0A / 5.0A)
* BATTERY VOLTAGE    : Current battery level (Thresholds: 14V / 15V)
* HEARTBEAT LOG      : Transmitted every 60 seconds for uptime calculation

=== 2. UPTIME INDICATORS (Last Hour Boolean 0/1) ===
* cctvLastHour       * fasLastHour       * iasLastHour
* basLastHour        * timeLockLastHour  * accessControlLastHour

=== 3. ALARM & EVENT COUNTERS ===
* alarmCount         * BASfaultCOUNT     * BASinactiveCOUNT
* CAMERA TAMPER      * CAMERA DISCONNECT * HDD ERROR

=== 4. HISTORICAL TRACKING ARRAYS (For Log Generation) ===
* iasFault_history   * fasOff_history    * tlsTamper_history
* basOff_history     * acsDoorOpen_history
