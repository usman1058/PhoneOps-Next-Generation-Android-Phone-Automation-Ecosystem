# Reads JSON action lines from stdin and injects mouse/keyboard input.
# Lines: {"kind":"click","x":123,"y":456}
#        {"kind":"drag","x":..,"y":..,"x2":..,"y2":..,"durationMs":250}
#        {"kind":"text","text":"hello"}
#        {"kind":"key","key":"enter"}

$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class NativeInput {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
}
"@

$LEFTDOWN = 0x0002
$LEFTUP = 0x0004
$WHEEL = 0x0800

function Move-To([double]$x, [double]$y) {
    # Coordinates arrive relative (0..1) to the streamed frame; map onto the
    # full virtual screen.
    $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $sx = $bounds.X + [int][Math]::Round($x * $bounds.Width)
    $sy = $bounds.Y + [int][Math]::Round($y * $bounds.Height)
    [NativeInput]::SetCursorPos($sx, $sy) | Out-Null
}

function Send-Key([string]$name) {
    $map = @{
        'enter'     = '{ENTER}'
        'tab'       = '{TAB}'
        'esc'       = '{ESC}'
        'backspace' = '{BACKSPACE}'
        'delete'    = '{DEL}'
        'space'     = ' '
        'up'        = '{UP}'
        'down'      = '{DOWN}'
        'left'      = '{LEFT}'
        'right'     = '{RIGHT}'
    }
    if ($map.ContainsKey($name)) {
        [System.Windows.Forms.SendKeys]::SendWait($map[$name])
    }
}

while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { break }
    if ($line.Trim().Length -eq 0) { continue }

    try { $action = $line | ConvertFrom-Json } catch { continue }

    switch ($action.kind) {
        'click' {
            Move-To ([double]$action.x) ([double]$action.y)
            Start-Sleep -Milliseconds 40
            [NativeInput]::mouse_event($LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
            Start-Sleep -Milliseconds 50
            [NativeInput]::mouse_event($LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
        }
        'drag' {
            Move-To ([double]$action.x) ([double]$action.y)
            Start-Sleep -Milliseconds 60
            [NativeInput]::mouse_event($LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
            $duration = [Math]::Max(80, [int]$action.durationMs)
            $steps = 12
            for ($i = 1; $i -le $steps; $i++) {
                $t = $i / $steps
                Move-To ($action.x + ($action.x2 - $action.x) * $t) ($action.y + ($action.y2 - $action.y) * $t)
                Start-Sleep -Milliseconds ([int]($duration / $steps))
            }
            [NativeInput]::mouse_event($LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
        }
        'text' {
            $escaped = $action.text -replace '\+', '{+}' -replace '\^', '{^}' -replace '%', '{%}' -replace '~', '{~}' -replace '\(', '{(}' -replace '\)', '{)}' -replace '\{', '{{}' -replace '\}', '{}}'
            [System.Windows.Forms.SendKeys]::SendWait($escaped)
        }
        'key' {
            Send-Key ([string]$action.key)
        }
    }
}
