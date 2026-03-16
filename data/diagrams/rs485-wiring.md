## 🔌 RS-485 Wiring Diagram — HMS Panel

### Connection Overview
```
  ┌──────────────────────┐                      ┌──────────────────────┐
  │     HMS PANEL        │                      │    SLAVE DEVICE      │
  │                      │                      │                      │
  │  TB1+  ──────────────┼───── 🔴 Red ───────► │  24V DC In           │
  │  TB1−  ──────────────┼───── ⚫ Black ─────► │  GND                 │
  │  A+    ──────────────┼───── 🔵 Blue ──────► │  RS-485 A+           │
  │  B−    ──────────────┼───── ⚪ White ─────► │  RS-485 B−           │
  │  GND   ──────────────┼───── 🟡 Yellow ────► │  Shield / PE         │
  └──────────────────────┘                      └──────────────────────┘

  120Ω termination resistor between A+ and B− at BOTH ends of bus
```

### Terminal Connection Table
| Terminal | Signal Type | Wire Colour | Destination | Specification |
|----------|---------------|-------------|---------------|------------------------|
| `TB1+`   | 24V DC Power  | 🔴 Red      | PSU Positive  | `18–30V DC`, max `5A`  |
| `TB1−`   | Ground (0V)   | ⚫ Black    | PSU Negative  | 0V reference           |
| `A+`     | RS-485 Data A | 🔵 Blue     | Slave A+      | EIA-485, differential  |
| `B−`     | RS-485 Data B | ⚪ White    | Slave B−      | EIA-485, differential  |
| `GND`    | Shield / PE   | 🟡 Yellow   | Earth bond    | IEC 60757              |

### Wire Colour Code (IEC 60757)
| Colour     | Signal                      | AWG / mm²          |
|-------------|----------------------------|--------------------|
| 🔴 Red     | DC Positive (+)            | 18 AWG / 1.0mm²    |
| ⚫ Black   | DC Negative / GND          | 18 AWG / 1.0mm²    |
| 🔵 Blue    | RS-485 A+ (Data)           | 22 AWG / 0.5mm²    |
| ⚪ White   | RS-485 B− (Data)           | 22 AWG / 0.5mm²    |
| 🟡 Yellow  | Shield / Protective Earth  | 20 AWG / 0.75mm²   |
| 🟢 Green   | Earth Bond                 | 18 AWG / 1.0mm²    |

### Installation Steps
1. **De-energise** all circuits before starting — verify with multimeter at `TB1+`
2. **Connect power** — `TB1+` → PSU positive (🔴 Red), `TB1−` → PSU negative (⚫ Black)
3. **Connect RS-485** — `A+` → slave `A+` (🔵 Blue), `B−` → slave `B−` (⚪ White)
4. **Add termination** — `120Ω` between `A+` and `B−` at both ends of bus
5. **Connect shield** — single-point earth at panel end only (🟡 Yellow → `GND`)
6. **Power on** — verify `PWR` LED solid 🟢 Green within 3 seconds

### ⚠️ Critical Notes
- Never exceed `30V DC` on power terminals
- RS-485 polarity reversal (`A+`/`B−` swapped) causes silent communication failure
- Always use shielded twisted pair cable for RS-485 runs longer than `10m`
- Maximum bus length: `1200m` at `9600 bps` | `600m` at `19200 bps`

---
> 📚 **Source:** SEPLe standard HMS/Dexter wiring reference (IEC 60757, EIA-485).
