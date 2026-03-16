## ATUM 7-Zone Integrated Alarm Architecture

This maps the specific zone division and operational modes of the ATUM hybrid security panel [20, 21].

```text
[ ATUM MAIN PANEL ]

=== ZONE CLASSIFICATIONS (7 Total) ===
|-- Zones 1-4 : Day Zones (Active when panel is in Day Mode) [21, 22].
|-- Zones 5-6 : Night Zones (Active when panel is in Night Mode) [21, 22].
|-- Zone 7    : Fire Zone (24/7 Active) [21].
|-- Zone 0    : Remote Zone (Configurable for wireless remote triggering) [23, 24].

=== DELAY & TIMER LOGIC ===
|-- Entry/Exit Delay : Configurable 1 to 120 seconds (Applies to Night Zones / Magnetic Switches) [22].
|-- Sounder Time     : Configurable Hooter duration (Default: 2 minutes) [23].

=== MODE SWITCHING ===
|-- Automatic Mode : System switches Day/Night based on the internal RTC (Set Day Time / Set Night Time) [22].
|-- Manual Mode    : Mode is changed via an external key switch [22].
