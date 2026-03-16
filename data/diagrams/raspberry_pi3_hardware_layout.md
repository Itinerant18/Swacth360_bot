## Raspberry Pi 3 Model B (Dexter HMS Core) Hardware Map

This details the specific component layout of the Raspberry Pi 3 Model B board, which serves as the core processing engine for devices like the Dexter HMS. [22-24]

```text
[ BOARD DIMENSIONS: 85 x 56 x 17mm ] [23]

=== PROCESSING & MEMORY ===
[ SoC ] Broadcom BCM2837 1.2GHz Quad-Core ARM Cortex-A53 [22]
[ GPU ] Dual Core VideoCore IV (1080p30 H.264 decode) [22]
[ RAM ] 1GB LPDDR2 (Mounted on underside) [22, 23]
[ Storage ] Push/pull Micro SDIO Card Slot (Underside) [22, 25]

=== CONNECTIVITY & I/O ===
[ Network ] 10/100 BaseT Ethernet Socket [23]
[ Wireless ] 802.11 b/g/n Wireless LAN + Bluetooth 4.1 (LE) & Chip Antenna [22]
[ USB ] 4 x USB 2.0 Connectors [23]
[ Power ] Micro USB Socket (5V, 2.5A) [23]

=== PERIPHERAL INTERFACES ===
[ GPIO Header ] 40-pin 2.54mm expansion header (27 GPIO pins, +3.3V, +5V, GND) [23]
[ Video Out 1 ] HDMI (rev 1.3 & 1.4) [23]
[ Video Out 2 ] Composite RCA (PAL/NTSC) via 3.5mm jack [23]
[ Camera ] 15-pin MIPI Camera Serial Interface (CSI-2) [25]
[ Display ] 15-way DSI flat flex cable connector [25]
