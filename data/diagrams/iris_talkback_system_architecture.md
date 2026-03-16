## IRIS 16-Channel Talk Back System Architecture

This outlines the communication routing for the IRIS telephone-line-based talkback system, allowing up to 15 peripheral receivers to communicate with the master unit.

```text
[ EPAX EXCHANGE ] 
       |
       +--- (Hot Line Facility) ---> [ IRIS MASTER CONSOLE ]
                                            |
                                    [ MOTHER BOARD ] <------> [ MIXER BOARD ]
                                            |
       +------------------------------------+------------------------------------+
       |                                    |                                    |
[ RECEIVER 1 ]                       [ RECEIVER 2 ]  ...                 [ RECEIVER 15 ]
(via Telephone Line)                 (via Telephone Line)                (via Telephone Line)
