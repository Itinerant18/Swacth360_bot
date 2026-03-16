# JARVIS Security Panel Wiring Architecture

```mermaid
flowchart LR

%% =========================
%% SENSOR ZONES
%% =========================

subgraph ZONES["8 Wired Sensor Zones"]
Z1[Zone 1\nPanic Switch]
Z2[Zone 2\nGlass Break Sensor\nvia Driver Unit]
Z3[Zone 3\nVibration Sensor\nvia Driver Unit]
Z4[Zone 4\nSmoke Detector]
Z5[Zone 5\nPIR Sensor\nvia Driver Unit]
Z6[Zone 6\nMagnetic Door Switch\nvia Driver Unit]
Z7[Zone 7\nNight Zone Sensor]
Z8[Zone 8\nFire / Heat Detector]
end

%% =========================
%% MAIN PANEL
%% =========================

subgraph PANEL["JARVIS Main Alarm Panel"]
P1[Zone Terminal Block\nZ1-Z8 (+/-)]
P2[Autodialer Interface]
P3[Output Control Section]
P4[Communication Port]
end

%% =========================
%% AUTO DIALER
%% =========================

subgraph AUTODIALER["Whisper G Auto Dialer"]
A1[Fire Input]
A2[Intrusion Input]
A3[Tamper Input]
A4[Silent Alarm Input]
end

%% =========================
%% OUTPUT DEVICES
%% =========================

subgraph OUTPUTS["External Alarm Outputs"]
O1[Electronic Siren / Hooter]
O2[Motorized Siren Driver\n220V AC]
O3[External Relay Devices]
O4[Night Zone Sensor Power]
end

%% =========================
%% COMMUNICATION MODULE
%% =========================

subgraph COMM["Remote Keypad Module"]
K1[Keypad Controller]
end

%% =========================
%% SENSOR CONNECTIONS
%% =========================

Z1 --> P1
Z2 --> P1
Z3 --> P1
Z4 --> P1
Z5 --> P1
Z6 --> P1
Z7 --> P1
Z8 --> P1

%% =========================
%% AUTODIALER CONNECTIONS
%% =========================

P2 -->|AD FIRE + -| A1
P2 -->|AD INTR + -| A2
P2 -->|AD TAMPER + -| A3
P2 -->|AD SILENT + -| A4

%% =========================
%% OUTPUT CONNECTIONS
%% =========================

P3 -->|SIREN + -| O1
P3 -->|MOT_SIR C T V G| O2
P3 -->|Relay NO NC COM| O3
P3 -->|Night Power + -| O4

%% =========================
%% COMMUNICATION
%% =========================

P4 -->|TX RX + -| K1
```

# Terminal Connection Table

| Terminal | Connection         | Purpose                        |
| -------- | ------------------ | ------------------------------ |
| ZONE 1   | Panic Switch       | Emergency trigger              |
| ZONE 2   | Glass Break Sensor | Window break detection         |
| ZONE 3   | Vibration Sensor   | Structural vibration detection |
| ZONE 4   | Smoke Detector     | Fire detection                 |
| ZONE 5   | PIR Sensor         | Motion detection               |
| ZONE 6   | Magnetic Switch    | Door/window monitoring         |
| ZONE 7   | Night Zone Sensor  | Night-time protection          |
| ZONE 8   | Fire/Heat Detector | Fire safety                    |


# Auto-Dialer Interface

| Panel Terminal | Connected Device          | Function           |
| -------------- | ------------------------- | ------------------ |
| AD FIRE        | Whisper G Fire Input      | Fire alarm dialing |
| AD INTR        | Whisper G Intrusion Input | Intrusion alert    |
| AD TAMPER      | Whisper G Tamper Input    | Panel tamper alert |
| AD SILENT      | Whisper G Silent Input    | Silent panic alert |


# Output Terminals

| Terminal          | Device                 | Description         |
| ----------------- | ---------------------- | ------------------- |
| RELAY (NO/NC/COM) | External devices       | Relay switching     |
| NIGHT POWER       | Night sensors          | Sensor power supply |
| MOT_SIR           | Motorized siren driver | 220V AC siren       |
| SIREN             | Electronic hooter      | Audible alarm       |


# Communication Connections

| Pins | Device        | Function      |
| ---- | ------------- | ------------- |
| TX   | Remote keypad | Data transmit |
| RX   | Remote keypad | Data receive  |
| +    | Keypad power  | +12V supply   |
| -    | Ground        | System ground |


# System Operation Flow

1. Sensors connected to Zone 1–8 detect events.
2. The JARVIS panel processes the alarm condition.
3. The panel activates:
   - External sirens
   - Motorized alarm
4. The panel triggers Whisper G auto-dialer inputs.
5. Auto-dialer sends calls/SMS alerts.
6. System status is displayed on the remote keypad module.
