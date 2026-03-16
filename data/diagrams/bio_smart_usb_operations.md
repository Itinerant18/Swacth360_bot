## Bio-Smart Biometric Access - USB & Shortcut Log Flow
This diagram details the specific hardware shortcut keys and logic flows used for downloading transaction logs and uploading holiday lists via USB 2.0 without needing PC software [1, 2].

```text
[ BIO-SMART PANEL ]
        |
   (Insert USB Pen Drive)
        |
+-------+-------+
|               |
v               v
[ KEY 2 ]       [ KEY 3 ]
(Log Download)  (Holiday Upload)
  |               |
  v               v
[Process Start] [Process Start]
  |               |
  |               +-> Select File Format:
  |                   '0' = .txt format
  |                   '1' = Excel format
  |                       |
  v                       v
[Logs Download] [Upload Dates] ---> (More dates = more time needed)
  |                       |
  v                       v
[Download Comp] [Upload Completed]