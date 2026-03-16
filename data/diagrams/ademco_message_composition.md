## SIA Ademco Contact ID Protocol - Message Composition
Based on the SIA DC-05-1999.09 standard, this details the exact DTMF block structure transmitted from the alarm panel to the central receiver [6, 7].

```text
FORMAT: [ACCT] [MT] [Q] [XYZ] [GG] [CCC] [S]

[ ACCT ] : 4-Digit Account Number (0-9, B-F)
[  MT  ] : 2-Digit Message Type (18 is preferred, 98 optional)
[  Q   ] : 1-Digit Event Qualifier
           - 1 = New Event / Opening
           - 3 = Restoral / Closing
           - 6 = Status Report (Previously reported condition still present)
[ XYZ  ] : 3-Digit Event Code (e.g., 110 = Fire, 130 = Burglary, 301 = AC Loss)
[  GG  ] : 2-Digit Partition/Group Number (00 if no specific partition)
[ CCC  ] : 3-Digit Zone or User Number (000 if no specific zone/user)
[  S   ] : 1-Digit Checksum (Sum of all digits + S modulo 15 = 0. A '0' is valued as 10)