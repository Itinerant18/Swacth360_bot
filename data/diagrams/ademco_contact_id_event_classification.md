## Ademco Contact ID - Primary Event Code Classifications

Based on the SIA DC-05-1999.09 standard, this maps the primary 3-digit XYZ event code groupings transmitted by the panels to the Central Monitoring Station [13, 14].

```text
=== EVENT CODE (XYZ) SERIES ===

[ 100s : ALARMS ]
  100 = Medical Alarms [14]
  110 = Fire Alarms [14]
  120 = Panic Alarms [14]
  130 = Burglary Alarms [14]
  140 = General Alarms [14]

[ 200s : SUPERVISORY ]
  200/210 = Fire Supervisory (e.g., water pressure, gate valves) [14]

[ 300s : TROUBLES ]
  300/310 = System Troubles [14]
  330/340 = System Peripheral Troubles [14]
  350/360 = Communication Troubles [15]
  380     = Sensor Troubles (e.g., Loss of supervision, low battery) [15]

[ 400s : OPEN/CLOSE & REMOTE ACCESS ]
  400/440/450 = Open/Close by User [16]
  410 = Remote Access [14]
  420/430 = Access Control [14]

[ 500s : BYPASSES & DISABLES ]
  500/510 = System Disables [14]
  570 = Zone / Sensor Bypasses [17]

[ 600s : TEST & MISCELLANEOUS ]
  601 = Manual Trigger Test Report [17]
  602 = Periodic Test Report [17]
  607 = Walk Test Mode [17]
