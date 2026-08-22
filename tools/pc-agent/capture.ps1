param(
    [int]$TargetW = 900,
    [int]$Fps = 5,
    [int]$Quality = 45
)

# Streams JPEG screenshots as base64 lines to stdout.
# Line 1 is a JSON header {"w":..,"h":..} with the scaled frame size.

$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
$w = $bounds.Width
$h = $bounds.Height
if ($w -le 0) { $w = 1920 }
if ($h -le 0) { $h = 1080 }

$tw = [Math]::Min($w, $TargetW)
$th = [int][Math]::Round($h * $tw / $w)
if ($th -lt 1) { $th = 1 }

[Console]::Out.WriteLine('{"w":' + $tw + ',"h":' + $th + '}')
[Console]::Out.Flush()

$jpegEncoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
    Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
$encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
    [System.Drawing.Imaging.Encoder]::Quality, [long]$Quality)

$intervalMs = [Math]::Max(50, [int](1000 / $Fps))

while ($true) {
    try {
        $bmp = New-Object System.Drawing.Bitmap($w, $h)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, (New-Object System.Drawing.Size($w, $h)))
        $g.Dispose()

        $small = New-Object System.Drawing.Bitmap($bmp, $tw, $th)
        $bmp.Dispose()

        $ms = New-Object System.IO.MemoryStream
        $small.Save($ms, $jpegEncoder, $encoderParams)
        $small.Dispose()

        [Console]::Out.WriteLine([Convert]::ToBase64String($ms.ToArray()))
        [Console]::Out.Flush()
        $ms.Dispose()
    }
    catch {
        # Screen may be locked; keep looping.
    }
    Start-Sleep -Milliseconds $intervalMs
}
