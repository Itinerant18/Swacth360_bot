## Dexter HMS Front Panel & LED Diagnostic Layout

This diagram maps the physical layout of the front interface for the Dexter Health Monitoring System (HMS), detailing the keypad matrix and the specific groupings of the diagnostic LEDs.

```text
[ DEXTER HMS FRONT PANEL ]

      +-----------------------------------------+
      |                LCD DISPLAY              |
      +-----------------------------------------+

                 [ 4x4 HEX KEYPAD ]
      +-----+-----+-----+-----+
      |  1  |  2  |  3  |Menu | (a,b,c / d,e,f / g,h,i)
      +-----+-----+-----+-----+
      |  4  |  5  |  6  |Enter| (j,k,l / m,n,o / p,q,r)
      +-----+-----+-----+-----+
      |  7  |  8  |  9  |  <  | (s,t,u / v,w,x / y,z,@)
      +-----+-----+-----+-----+
      | Task|  0  | CLR |  >  | (-,/,_)
      +-----+-----+-----+-----+

=== SYSTEM STATUS LEDS ===
[ MAINS ON ]        [ NETWORK ]
[ SYSTEM ON ]       [ 4G LTE ]
[ SYS HEALTHY ]     [ BATTERY LOW ]
[ NVR/DVR ON ]      [ BATTERY REVERSE ]

=== SUBSYSTEM STATUS LEDS ===
[ FAS STATUS ]      [ BAS STATUS ]      [ CCTV STATUS ]
[ FAS ON ]          [ BAS ON ]          [ TAMPER ]
[ ACTIVATE ]        [ ACTIVATE ]        [ DISCONNECT ]
[ FAULT ]           [ FAULT ]           [ HDD ERROR ]
