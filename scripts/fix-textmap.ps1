# Fix TEXT_MAP with actual Unicode characters (not escape sequences)
$file = Join-Path $PSScriptRoot "..\src\app\page.tsx"
$file = (Resolve-Path $file).Path
$content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)
$lines = $content -split "`n"

# Build replacement with actual Unicode chars
$bn_welcome = "HMS " + [char]0x09AA + [char]0x09CD + [char]0x09AF + [char]0x09BE + [char]0x09A8 + [char]0x09C7 + [char]0x09B2 + " " + [char]0x099F + [char]0x09CD + [char]0x09B0 + [char]0x09BE + [char]0x09AC + [char]0x09B2 + [char]0x09B6 + [char]0x09C1 + [char]0x099F + [char]0x09BF + [char]0x0982 + " " + [char]0x09B8 + [char]0x09AE + [char]0x09CD + [char]0x09AA + [char]0x09B0 + [char]0x09CD + [char]0x0995 + [char]0x09C7 + " " + [char]0x099C + [char]0x09BF + [char]0x099C + [char]0x09CD + [char]0x099E + [char]0x09BE + [char]0x09B8 + [char]0x09BE + " " + [char]0x0995 + [char]0x09B0 + [char]0x09C1 + [char]0x09A8

$bn_intro = [char]0x0986 + [char]0x09AE + [char]0x09BF + " SAI, " + [char]0x0986 + [char]0x09AA + [char]0x09A8 + [char]0x09BE + [char]0x09B0 + " HMS " + [char]0x09B8 + [char]0x09BE + [char]0x09AA + [char]0x09CB + [char]0x09B0 + [char]0x09CD + [char]0x099F + " " + [char]0x0985 + [char]0x09CD + [char]0x09AF + [char]0x09BE + [char]0x09B8 + [char]0x09BF + [char]0x09B8 + [char]0x09CD + [char]0x099F + [char]0x09CD + [char]0x09AF + [char]0x09BE + [char]0x09A8 + [char]0x09CD + [char]0x099F + [char]0x0964 + " " + [char]0x099F + [char]0x09CD + [char]0x09B0 + [char]0x09BE + [char]0x09AC + [char]0x09B2 + [char]0x09B6 + [char]0x09C1 + [char]0x099F + [char]0x09BF + [char]0x0982 + ", " + [char]0x0995 + [char]0x09A8 + [char]0x09AB + [char]0x09BF + [char]0x0997 + [char]0x09BE + [char]0x09B0 + [char]0x09C7 + [char]0x09B6 + [char]0x09A8 + ", " + [char]0x09AC + [char]0x09BE + " " + [char]0x0987 + [char]0x09A8 + [char]0x09B8 + [char]0x09CD + [char]0x099F + [char]0x09B2 + [char]0x09C7 + [char]0x09B6 + [char]0x09A8 + " " + [char]0x09B8 + [char]0x09AE + [char]0x09CD + [char]0x09AA + [char]0x09B0 + [char]0x09CD + [char]0x0995 + [char]0x09C7 + " " + [char]0x099C + [char]0x09BF + [char]0x099C + [char]0x09CD + [char]0x099E + [char]0x09BE + [char]0x09B8 + [char]0x09BE + " " + [char]0x0995 + [char]0x09B0 + [char]0x09C1 + [char]0x09A8 + [char]0x0964

$bn_placeholder = [char]0x09AF + [char]0x09C7 + " " + [char]0x0995 + [char]0x09CB + [char]0x09A8 + [char]0x09CB + " " + [char]0x09AA + [char]0x09CD + [char]0x09B0 + [char]0x09B6 + [char]0x09CD + [char]0x09A8 + " " + [char]0x0995 + [char]0x09B0 + [char]0x09C1 + [char]0x09A8 + "..."

$bn_footer = "HMS " + [char]0x09AA + [char]0x09CD + [char]0x09AF + [char]0x09BE + [char]0x09A8 + [char]0x09C7 + [char]0x09B2 + " " + [char]0x09AC + [char]0x09BF + [char]0x09B6 + [char]0x09C7 + [char]0x09B7 + [char]0x099C + [char]0x09CD + [char]0x099E + " " + [char]0x00B7 + " AI " + [char]0x09A6 + [char]0x09CD + [char]0x09AC + [char]0x09BE + [char]0x09B0 + [char]0x09BE + " " + [char]0x099A + [char]0x09BE + [char]0x09B2 + [char]0x09BF + [char]0x09A4 + " " + [char]0x00B7 + " " + [char]0x09A1 + [char]0x09BE + [char]0x09AF + [char]0x09BC + [char]0x09BE + [char]0x0997 + [char]0x09CD + [char]0x09B0 + [char]0x09BE + [char]0x09AE + " " + [char]0x09B8 + [char]0x09AE + [char]0x09B0 + [char]0x09CD + [char]0x09A5 + [char]0x09BF + [char]0x09A4

$hi_welcome = "HMS " + [char]0x092A + [char]0x0948 + [char]0x0928 + [char]0x0932 + " " + [char]0x091F + [char]0x094D + [char]0x0930 + [char]0x092C + [char]0x0932 + [char]0x0936 + [char]0x0942 + [char]0x091F + [char]0x093F + [char]0x0902 + [char]0x0917 + " " + [char]0x0915 + [char]0x0947 + " " + [char]0x092C + [char]0x093E + [char]0x0930 + [char]0x0947 + " " + [char]0x092E + [char]0x0947 + [char]0x0902 + " " + [char]0x092A + [char]0x0942 + [char]0x091B + [char]0x0947 + [char]0x0902

$hi_intro = [char]0x092E + [char]0x0948 + [char]0x0902 + " SAI " + [char]0x0939 + [char]0x0942 + [char]0x0901 + ", " + [char]0x0906 + [char]0x092A + [char]0x0915 + [char]0x093E + " HMS " + [char]0x0938 + [char]0x092A + [char]0x094B + [char]0x0930 + [char]0x094D + [char]0x091F + " " + [char]0x0905 + [char]0x0938 + [char]0x093F + [char]0x0938 + [char]0x094D + [char]0x091F + [char]0x0947 + [char]0x0902 + [char]0x091F + [char]0x0964 + " " + [char]0x091F + [char]0x094D + [char]0x0930 + [char]0x092C + [char]0x0932 + [char]0x0936 + [char]0x0942 + [char]0x091F + [char]0x093F + [char]0x0902 + [char]0x0917 + ", " + [char]0x0915 + [char]0x0949 + [char]0x0928 + [char]0x094D + [char]0x092B + [char]0x093C + [char]0x093F + [char]0x0917 + [char]0x0930 + [char]0x0947 + [char]0x0936 + [char]0x0928 + " " + [char]0x092F + [char]0x093E + " " + [char]0x0907 + [char]0x0902 + [char]0x0938 + [char]0x094D + [char]0x091F + [char]0x0949 + [char]0x0932 + [char]0x0947 + [char]0x0936 + [char]0x0928 + " " + [char]0x0915 + [char]0x0947 + " " + [char]0x092C + [char]0x093E + [char]0x0930 + [char]0x0947 + " " + [char]0x092E + [char]0x0947 + [char]0x0902 + " " + [char]0x092A + [char]0x0942 + [char]0x091B + [char]0x0947 + [char]0x0902 + [char]0x0964

$hi_placeholder = [char]0x0915 + [char]0x0941 + [char]0x091B + " " + [char]0x092D + [char]0x0940 + " " + [char]0x092A + [char]0x0942 + [char]0x091B + [char]0x0947 + [char]0x0902 + "..."

$hi_footer = "HMS " + [char]0x092A + [char]0x0948 + [char]0x0928 + [char]0x0932 + " " + [char]0x0935 + [char]0x093F + [char]0x0936 + [char]0x0947 + [char]0x0937 + [char]0x091C + [char]0x094D + [char]0x091E + " " + [char]0x00B7 + " AI " + [char]0x0938 + [char]0x0902 + [char]0x091A + [char]0x093E + [char]0x0932 + [char]0x093F + [char]0x0924 + " " + [char]0x00B7 + " " + [char]0x0921 + [char]0x093E + [char]0x092F + [char]0x0917 + [char]0x094D + [char]0x0930 + [char]0x093E + [char]0x092E + " " + [char]0x0938 + [char]0x092E + [char]0x0930 + [char]0x094D + [char]0x0925 + [char]0x093F + [char]0x0924

$emdash = [char]0x2014
$middot = [char]0x00B7

$replacement = @(
    "const TEXT_MAP = {",
    "    en: {",
    "        welcome: 'Ask about HMS Panel Troubleshooting',",
    "        intro: 'I am SAI, your HMS support assistant. Ask me anything $emdash troubleshooting, configuration, or installation.',",
    "        placeholder: 'Ask anything...',",
    "        footer: 'HMS Panel Expert $middot AI Powered $middot Diagrams supported',",
    "    },",
    "    bn: {",
    "        welcome: '$bn_welcome',",
    "        intro: '$bn_intro',",
    "        placeholder: '$bn_placeholder',",
    "        footer: '$bn_footer',",
    "    },",
    "    hi: {",
    "        welcome: '$hi_welcome',",
    "        intro: '$hi_intro',",
    "        placeholder: '$hi_placeholder',",
    "        footer: '$hi_footer',",
    "    },",
    "};"
)

$before = $lines[0..87]
$after  = $lines[108..($lines.Count - 1)]

$newLines = $before + $replacement + $after
$newContent = $newLines -join "`n"

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($file, $newContent, $utf8NoBom)
Write-Host "TEXT_MAP replaced with actual Unicode characters. Total lines: $($newLines.Count)"
