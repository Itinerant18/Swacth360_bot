# JARVIS Embedded Firmware Architecture

This diagram illustrates the **software layers running inside the JARVIS control panel microcontroller**.

```mermaid
flowchart TD

%% ==========================
%% HARDWARE LAYER
%% ==========================

subgraph HW["Hardware Layer"]
ZONES[Wired Zone Inputs]
RF[RF Receiver Interface]
KEYPAD[Keypad Interface]
SIREN[Siren Driver]
RELAY[Relay Outputs]
UART[UART / GSM Interface]
end

%% ==========================
%% DRIVER LAYER
%% ==========================

subgraph DRIVERS["Hardware Drivers"]
GPIO[GPIO Driver]
RFDRV[RF Communication Driver]
KEYDRV[Keypad Driver]
UARTDRV[UART Driver]
ADC[ADC Driver]
end

%% ==========================
%% SYSTEM SERVICES
%% ==========================

subgraph SERVICES["System Services"]
TIMER[Timer Manager]
EEPROM[Configuration Storage]
EVENTQ[Event Queue]
WATCHDOG[Watchdog Service]
end

%% ==========================
%% APPLICATION LOGIC
%% ==========================

subgraph APP["Application Layer"]

ZONELOGIC[Zone Monitoring Engine]

ALARMLOGIC[Alarm Decision Logic]

MODEMGR[System Mode Manager\n(Day / Night / Fire)]

COMM[Autodialer Communication Manager]

LOG[Event Logger]

end

%% ==========================
%% USER INTERFACE
%% ==========================

subgraph UI["User Interface"]
LCD[LCD Display Manager]
MENU[Menu Control System]
end


%% ==========================
%% DATA FLOW
%% ==========================

ZONES --> GPIO
RF --> RFDRV
KEYPAD --> KEYDRV

GPIO --> ZONELOGIC
RFDRV --> ZONELOGIC

ZONELOGIC --> ALARMLOGIC
ALARMLOGIC --> MODEMGR
MODEMGR --> COMM

ALARMLOGIC --> SIREN
ALARMLOGIC --> RELAY

COMM --> UARTDRV
UARTDRV --> UART

KEYDRV --> MENU
MENU --> LCD

ALARMLOGIC --> LOG
LOG --> EEPROM