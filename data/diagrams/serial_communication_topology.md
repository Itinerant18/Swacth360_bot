## SEPL Serial Communication Topologies (I2C & UART) [45, 46]

This maps the physical layer and timing requirements for the internal board-to-board communications used in the Dhwani, Pinnacle, and Isis panels. [45-47]

```text
=== I2C BUS TOPOLOGY (EEPROM, RTC, Multiplexers) === [45]
* SDA (Serial Data) and SCL (Serial Clock) are open-drain drivers. [45]
* Both lines require pull-up resistors (Rp) to the +5V supply line. [45]

       +5V
        |
      [Rp] (Pull-up Resistors)
        |
SDA ----+-------+------------------+------------------+
SCL ----+-------|                  |                  |
                |                  |                  |
          [ MASTER MCU ]     [ SLAVE DEV 1 ]    [ SLAVE DEV 2 ] [45]

I2C Frame: [START] -> [7-Bit Address] -> [R/W Bit] -> [ACK] -> [8-Bit Data] -> [ACK] -> [STOP] [48]


=== UART / RS232 TOPOLOGY (GSM Modems, PC Integration) === [46]
* Asynchronous transmission without a dedicated clock line. [46]
* For RS232 levels (+/- 12V), a transceiver chip (e.g., MAX232) boosts the 5V TTL logic. [47, 49]

[ DEVICE #1 (e.g., MCU) ]                  [ DEVICE #2 (e.g., Modem) ] [46]
        TX (Transmit) ----------------------> RX (Receive) [46]
        RX (Receive)  <---------------------- TX (Transmit) [46]

UART Frame: [IDLE] -> [START Bit] -> [B0-B7 Data] -> [Parity Bit (Optional)] -> [STOP Bit] -> [IDLE] [50]