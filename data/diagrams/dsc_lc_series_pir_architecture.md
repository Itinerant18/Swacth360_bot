## DSC LC-Series PIR & Microwave Detector Logic
This maps the internal digital signal processing and physical detection layers for the LC-100-PI, LC-103-PIMSK, and LC-104-PIMW quad linear imaging detectors [1, 2].

```text
[ DETECTION INPUTS ]
|
+-- 1. Quad Element PIR Sensor
|      |-- Captures thermal movement.
|      +-- Pet Immunity Logic: Ignores animals up to 25kg (55 lbs) [1, 3].
|
+-- 2. Microwave Doppler Sensor (LC-104/124-PIMW & 103-PIMSK)
|      |-- Micro-strip patch antenna [4].
|      +-- Confirms PIR thermal movement to prevent false alarms.
|
+-- 3. Active Anti-Masking (LC-103-PIMSK only)
       |-- Detects objects blocking the field of view within 0.8m (2.62 ft) [5].
       +-- Triggers dedicated NO (Normally Open) relay until PIR is activated [5].

[ ASIC SIGNAL PROCESSING ] ---> [ ALARM RELAY (Form A/C) ] + [ TAMPER SWITCH ] [1, 4]

[diff_block_end]

Please note that the above snippet only shows the MODIFIED lines from the last change. It shows up to 3 lines of unchanged lines before and after the modified lines. The actual file contents may have many more lines not shown.