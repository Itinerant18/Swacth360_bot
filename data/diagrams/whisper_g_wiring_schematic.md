## Whisper G Auto-Dialer Input Wiring Schematic

This maps the physical terminal block connections required to interface the Whisper G Auto-Dialer with external security panels like ISIS or JARVIS [9, 10].

```text
[ EXTERNAL ALARM PANEL ]                   [ WHISPER G AUTO-DIALER ]
  (e.g., JARVIS / ISIS)                          (Terminal Block)
                                                         |
  Fire Relay O/P (-) --------------------------> [ 1 (O) ] FIRE
  Fire Relay O/P (+) --------------------------> [ 2 (I) ]
                                                         |
  Intrusion Relay O/P (-) ---------------------> [ 1 (O) ] INTR
  Intrusion Relay O/P (+) ---------------------> [ 2 (I) ]
                                                         |
  Tamper Trigger O/P (-) ----------------------> [ 1 (O) ] SILENT TAMPER
  Tamper Trigger O/P (+) ----------------------> [ 2 (I) ]
                                                         |
  Silent Trigger O/P (-) ----------------------> [ 1 (O) ] SILENT
  Silent Trigger O/P (+) ----------------------> [ 2 (I) ]
Note: All trigger inputs are opto-isolated, polarized, and accept a 10V-24V DC range.
