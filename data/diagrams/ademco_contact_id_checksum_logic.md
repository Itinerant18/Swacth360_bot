## Ademco Contact ID Checksum Calculation Logic

This maps the specific mathematical algorithm used by alarm transmitters to generate the final checksum digit (S) in the 16-digit Ademco Contact ID message block.

```text
[ MESSAGE BLOCK FORMAT ]
ACCT (4) + MT (2) + Q (1) + XYZ (3) + GG (2) + CCC (3) + S (1)

[ CHECKSUM CALCULATION RULES ]
1. Convert all digits to their numerical value. 
   * CRITICAL: A transmitted '0' is valued as '10'.
2. Sum all 15 data digits together.
3. Divide the total sum by 15 to find the remainder (Modulo 15).
4. Subtract the remainder from 15 to get the checksum digit.
   * If the remainder is 0, the checksum digit is 'F' (15).

[ EXAMPLE CALCULATION: Perimeter Burglary ]
Message:  1 2 3 4  1 8  1  1 3 1  0 1  0 1 5  [S]
Valued:   1+2+3+4 +1+8 +1 +1+3+1 +10+1 +10+1+5 = 52

Calculation:
1. Next highest multiple of 15 above 52 is 60.
2. 60 - 52 = 8.
3. Checksum (S) = 8.