# Texecom Premier Compact PIR Detection Patterns

### Intrusion Motion Sensor Coverage & Installation Guide

---

# 1. System Overview

The **Texecom Premier Compact Series PIR detectors** provide volumetric motion detection used in intrusion alarm systems.

Supported models include:

| Model      | Detection Type     |
| ---------- | ------------------ |
| Compact IR | Passive Infrared   |
| Compact XT | Extended Range PIR |
| Compact QD | Quad Element PIR   |
| Compact PW | Pet-Immune PIR     |

These sensors are commonly installed in:

* offices
* retail stores
* bank branches
* server rooms
* residential security systems

---

# 2. PIR Detection Principle

Passive Infrared detectors monitor **changes in infrared radiation** caused by moving objects (such as people).

The sensor uses:

* Fresnel lens segments
* multiple detection zones
* infrared sensing elements

When a person crosses multiple zones, the detector generates an alarm.

---

# 3. Detection Coverage Geometry

## Top View Detection Pattern

The detector produces a **90° volumetric coverage angle**.

```text
TOP VIEW

            /\
           /  \
          /    \
         /      \
        /        \
       /          \
      /            \
Detector-----------Coverage

Angle: 90°
```

Coverage spreads outward across the monitored space.

---

# 4. Detection Range by Model

| Detector Model | Maximum Range |
| -------------- | ------------- |
| Compact IR     | 12m (40 ft)   |
| Compact PW     | 12m (40 ft)   |
| Compact XT     | 15m (50 ft)   |
| Compact QD     | 15m (50 ft)   |

---

# 5. Side View Detection Pattern

The detector creates layered detection zones across the monitored area.

```text
SIDE VIEW (IR / XT / QD MODELS)

 Detector
    |
    |\
    | \
    |  \
    |   \
    |    \
Wall |     \
     |      \
Floor --------------------------------------

Distance markers:

2m → 4m → 6m → 8m → 10m → 12m → 15m
```

As a person moves across these zones, the PIR sensor detects motion.

---

# 6. Recommended Mounting Height

| Model           | Mounting Height |
| --------------- | --------------- |
| IR / XT / QD    | 1.5m – 3.1m     |
| PW (Pet Immune) | 1.5m – 2.3m     |

Typical installation height:

```text
2m (6 ft 7 in)
```

Mounting height significantly affects detection performance.

---

# 7. Pet-Immune Detection (PW Model)

The **PW model** includes algorithms that ignore small animals.

Detection zones are shaped so that movement **below the lower beam** is ignored.

```text
SIDE VIEW – PET IMMUNE

Detector
  |
  |\
  | \
  |  \
  |   \
  |    \
  |     \   ← Human detection zone
  |      \
Floor------------------------------ 

Pets remain below the detection zone.
```

---

## Pet Weight Configuration

| Pulse Count | Pet Weight  |
| ----------- | ----------- |
| 1           | Up to 20 kg |
| 2           | Up to 35 kg |

Pulse count determines the number of detection events required to trigger an alarm.

---

# 8. Coverage Architecture

```mermaid
flowchart LR

MOTION[Human Movement]

IR_ZONE[Infrared Detection Zones]

SENSOR[PIR Sensor Element]

PROCESS[Signal Processing]

ALARM[Alarm Output]

MOTION --> IR_ZONE
IR_ZONE --> SENSOR
SENSOR --> PROCESS
PROCESS --> ALARM
```

---

# 9. Installation Best Practices

| Rule                        | Reason                                  |
| --------------------------- | --------------------------------------- |
| Mount at recommended height | Ensures correct detection geometry      |
| Avoid direct sunlight       | Prevents false triggers                 |
| Do not point at windows     | Reduces heat-based false alarms         |
| Avoid air vents             | Airflow temperature changes trigger PIR |

---

# 10. Detection Optimization

Proper placement dramatically improves performance.

Recommended placement:

```text
Corner of room
Facing across area
Avoid facing entrance directly
```

This ensures intruders **cross detection beams**, which increases sensitivity.

---

# 11. Common False Alarm Causes

| Cause                     | Explanation              |
| ------------------------- | ------------------------ |
| Sunlight heating surfaces | Creates thermal change   |
| HVAC airflow              | Temperature fluctuations |
| Small animals             | Pet movement             |
| Curtains moving           | Infrared disturbance     |

---

# 12. Troubleshooting Guide

| Symptom              | Possible Cause                |
| -------------------- | ----------------------------- |
| No detection         | Sensor mounted too high       |
| False alarms         | Heat sources nearby           |
| Reduced range        | Lens obstruction              |
| Pet triggering alarm | Incorrect pulse count setting |

---

# 13. Integration with Alarm Systems

The PIR detector connects to an **intrusion alarm panel**.

```mermaid
flowchart LR

PIR[Texecom PIR Detector]

PANEL[Intrusion Alarm Panel]

ZONE[Alarm Zone]

ALERT[Alarm Notification]

PIR --> PANEL
PANEL --> ZONE
ZONE --> ALERT
```

---

# 14. RAG Training Keywords

```text
texecom premier compact pir coverage
premier compact xt detection pattern
pet immune pir sensor coverage
pir motion sensor mounting height
intrusion detector coverage geometry
texecom pir installation guide
compact series pir detection zones
alarm pir false trigger causes
```

---

# End of Document
