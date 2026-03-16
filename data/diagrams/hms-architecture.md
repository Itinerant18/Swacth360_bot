## Dexter Health Monitoring System (HMS) Architecture

This diagram outlines how field devices connect to the local panels, communicate with the Dexter HMS, and transmit data to the Cloud.

```text
      [ FIELD DEVICES ]                   [ LOCAL PROCESSING ]                   [ CLOUD & USER ]
                                                                    
+-------------------------+                                         
| - Smoke Detectors       |                                         
| - Heat Detectors        | ---> +---------------------------+                 +------------------+
| - Manual Call Points    |      | Security / Fire Panels    |                 |                  |
+-------------------------+      | (JARVIS / HESTIA PRO)     |                 |  Mobile Device   |
                                 +---------------------------+                 |                  |
                                              ^                                +------------------+
                                              | (SIA/Contact ID)                         ^
                                              v                                          |
                                 +---------------------------+                 +------------------+
                                 |     DEXTER HMS PANEL      | <--- MQTT ----> |                  |
                                 |  (Local Receiver Station) |                 | DEXTER CLOUD     |
                                 |                           | <--- HTTP ----> |     SERVER       |
                                 +---------------------------+                 |                  |
                                              ^                                +------------------+
                                              | (I/O Port / IP)                          v
                                              v                                +------------------+
+-------------------------+      +---------------------------+                 |                  |
|                         |      |                           |                 |  Desktop Web     |
| - CCTV Cameras          | ---> |        DVR / NVR          |                 |  Dashboard       |
|                         |      |                           |                 |                  |
+-------------------------+      +---------------------------+                 +------------------+
```

### Communication Protocols
- Field devices to local panels: Hardwired / Proprietary
- Fire Panels to HMS Panel: `SIA` / `Contact ID`
- DVR/NVR to HMS Panel: `I/O Port` / `IP`
- HMS Panel to Cloud: `MQTT` / `HTTP`



# Dexter Health Monitoring System (HMS) – Full Architecture

```mermaid
flowchart LR

%% ==============================
%% FIELD DEVICE LAYER
%% ==============================

subgraph FIELD["Field Devices"]
FD1[Smoke Detector]
FD2[Heat Detector]
FD3[Manual Call Point]
FD4[Motion Sensor]
FD5[CCTV Cameras]
end

%% ==============================
%% LOCAL PANEL LAYER
%% ==============================

subgraph PANELS["Local Security Panels"]
P1[Fire Alarm Panel\nJARVIS / HESTIA PRO]
P2[Intrusion Alarm Panel]
P3[DVR / NVR Recorder]
end

%% ==============================
%% HMS EDGE RECEIVER
%% ==============================

subgraph HMS["Dexter HMS Panel\nLocal Receiver Station"]
H1[Event Receiver Engine]
H2[Protocol Decoder\nSIA / Contact ID]
H3[I/O Interface Module]
H4[Local Event Database]
H5[Network Communication Module]
end

%% ==============================
%% NETWORK LAYER
%% ==============================

subgraph NETWORK["Communication Network"]
N1[Ethernet LAN]
N2[Cellular Network 4G/5G]
end

%% ==============================
%% CLOUD INFRASTRUCTURE
%% ==============================

subgraph CLOUD["Dexter Cloud Infrastructure"]
C1[MQTT Broker]
C2[REST API Server]
C3[Event Processing Engine]
C4[Cloud Database]
C5[Analytics & Monitoring Engine]
end

%% ==============================
%% USER ACCESS LAYER
%% ==============================

subgraph USERS["User Monitoring Systems"]
U1[Mobile Monitoring App]
U2[Desktop Web Dashboard]
U3[Security Control Room]
U4[Maintenance Engineer Portal]
end

%% ==============================
%% FIELD CONNECTIONS
%% ==============================

FD1 --> P1
FD2 --> P1
FD3 --> P1

FD4 --> P2

FD5 --> P3

%% ==============================
%% PANEL COMMUNICATION
%% ==============================

P1 -->|SIA / Contact ID| H1
P2 -->|Alarm Events| H1

P3 -->|IP / I/O Port| H3

%% ==============================
%% HMS PROCESSING
%% ==============================

H1 --> H2
H2 --> H4

H3 --> H4

H4 --> H5

%% ==============================
%% NETWORK CONNECTIVITY
%% ==============================

H5 --> N1
H5 --> N2

%% ==============================
%% CLOUD COMMUNICATION
%% ==============================

N1 --> C1
N2 --> C1

H5 -->|HTTP API| C2

C1 --> C3
C2 --> C3

C3 --> C4
C3 --> C5

%% ==============================
%% USER ACCESS
%% ==============================

C4 --> U2
C5 --> U2

C1 --> U1

C5 --> U3
C5 --> U4