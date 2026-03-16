## Ademco Contact ID Communication Handshake Flowchart

This diagram outlines the precise timing and transmission sequence between an alarm transmitter and a central station receiver using the Ademco Contact ID protocol [1, 2].

```text
[ CENTRAL STATION RECEIVER ]                     [ ALARM TRANSMITTER ]

      Goes Off-Hook
           |
      Wait 0.5 to 2.0 sec
           |
      Send Handshake Tone
      (1400Hz -> pause -> 2300Hz)
           |
           +-------------------------------------> Detect Handshake
                                                         |
                                                   Wait 250 msec (min)
                                                         |
                                                   Format Message (Attempt = 1)
                                                         |
                                                   Transmit Message (DTMF)
                                                         |
           <---------------------------------------+ Search for Kissoff Tone
           |                                             |
      Receive Message                               [ Kissoff Received? ]
           |                                         /                 \
      Send Kissoff Tone                           [YES]                [NO]
      (Acknowledgment)                              |                    |
           |                                        v                    v
           +-------------------------------------->(End)           Increment Attempt Count
                                                                         |
                                                                   [ Count > 4? ]
                                                                    /          \
                                                                 [NO]         [YES]
                                                                  |             |
                                                             (Resend Msg)   (Hang Up & End)
