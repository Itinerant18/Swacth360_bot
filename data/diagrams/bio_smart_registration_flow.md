## Bio-Smart Fingerprint & Dual-User Registration Flow

This outlines the specific UI flow for enrolling users and configuring high-security "Raid Access" (dual-authentication) on the Bio-Smart access control panel [15-17].

```text
=== 1. STANDARD USER ENROLLMENT ===
[ Menu ] -> [ Add User ] [15]
  |
  |-> Enter ID Number -> Press Enter [15]
  |-> "Want to add card?" -> Press Enter -> Show Card [15]
  |-> "Want to add fingerprint?" -> Press Enter [15]
  |    |
  |    +-> Place Finger -> "Scan complete" [15]
  |    +-> Place Finger Again -> Shows Fingerprint Image Percentage [15]
  |    +-> Press Enter to Save (or '0' to retry for a better image) [15]

=== 2. RAID ACCESS (Dual-User Authentication) ===
(Requires two separate users to authenticate within 10 seconds to open the door) [16]
[ Menu ] -> [ Raid Access ]
  |
  |-> Press Enter to Enroll New IDs (or '0' to save Old IDs) [16]
  |-> Enter Member 1 ID -> Place Finger Twice -> "Member 1 Enrolled" [16]
  |-> Enter Member 2 ID -> Place Finger Twice -> "Member 2 Enrolled" [16]

=== 3. HARDWARE SHORTCUT KEYS ===
* KEY 2: Insert Pen Drive -> Press Key 2 -> Enter Password -> Downloads all logs to USB [17].
* KEY 3: Insert Pen Drive -> Press Key 3 -> Select format (0 for .txt, 1 for Excel) -> Uploads holiday list to system [18].