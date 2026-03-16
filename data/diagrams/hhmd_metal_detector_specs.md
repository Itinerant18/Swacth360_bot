## HHMD 1.0 Hand-Held Metal Detector Internal Specs

This block outlines the internal hardware specifications and detection thresholds for the SEPL Hand-Held Metal Detector (HHMD 1.0).

```text
[ POWER SUPPLY ]
  |-- 4 x 1.2V Ni-MH Rechargeable Batteries (4.8V Typical)
  |-- Charging Voltage: 9V / 500mA
  |-- Battery Backup: 50 Hours (Standby)
  |-- Current Draw: <= 15mA (Active), <= 9mA (Standby)

[ SENSOR & PROCESSING ]
  |-- Operating Frequency: 93 kHz
  |-- Alarm Output: <= 95 dB Sounder

[ DETECTION THRESHOLDS ]
  |-- Minimum Detectable Weight: 1 gram
  |-- Sensitivity: Detects 0.1g at 30mm distance
  |-- Steel (Max Depth): 2.5 inches
  |-- Copper (Max Depth): 3.0 inches