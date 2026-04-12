$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $PSScriptRoot
$assetRoot = Join-Path $repoRoot "public\assets\town-rush"
$musicRoot = Join-Path $repoRoot "public\assets\music\town-rush"

New-Item -ItemType Directory -Force -Path $assetRoot | Out-Null
New-Item -ItemType Directory -Force -Path $musicRoot | Out-Null

$sourceMusic = @{
  "SwinginSafari.wav" = "title"
  "BourbonBlues.wav" = "gameplay"
  "CoolCatCaper.wav" = "results"
  "BoogieWonderland.wav" = "bonus"
}

foreach ($file in $sourceMusic.Keys) {
  $source = Join-Path "D:\Downloads" $file
  if (Test-Path $source) {
    Copy-Item -LiteralPath $source -Destination (Join-Path $musicRoot $file) -Force
  }
}

function New-Color {
  param(
    [int]$R,
    [int]$G,
    [int]$B,
    [int]$A = 255
  )

  return [System.Drawing.Color]::FromArgb($A, $R, $G, $B)
}

function Fill-Circle {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.Brush]$Brush,
    [float]$CenterX,
    [float]$CenterY,
    [float]$Radius
  )

  $Graphics.FillEllipse($Brush, $CenterX - $Radius, $CenterY - $Radius, $Radius * 2, $Radius * 2)
}

function Draw-PieEye {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.Brush]$Brush,
    [float]$CenterX,
    [float]$CenterY,
    [float]$Radius,
    [float]$StartAngle
  )

  $Graphics.FillPie($Brush, $CenterX - $Radius, $CenterY - $Radius, $Radius * 2, $Radius * 2, $StartAngle, 300)
}

function Draw-RunnerFrame {
  param(
    [System.Drawing.Graphics]$Graphics,
    [int]$FrameX,
    [int]$FrameY,
    [int]$FrameWidth,
    [int]$FrameHeight,
    [int]$FrameIndex,
    [int]$FrameCount,
    [string]$Mode,
    [string]$Style = "classic"
  )

  $ink = New-Color 24 21 18
  $paper = if ($Style -eq "expressive") { New-Color 250 244 228 } else { New-Color 248 241 221 }
  $accent = if ($Style -eq "expressive") { New-Color 232 74 56 } else { New-Color 222 63 51 }
  $shadow = New-Color 0 0 0 26
  $smile = New-Color 40 34 28

  $inkPen = New-Object System.Drawing.Pen $ink, 5.6
  $inkPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $inkPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $inkPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

  $thinPen = New-Object System.Drawing.Pen $ink, 2.2
  $thinPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $thinPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

  $paperBrush = New-Object System.Drawing.SolidBrush $paper
  $inkBrush = New-Object System.Drawing.SolidBrush $ink
  $accentBrush = New-Object System.Drawing.SolidBrush $accent
  $shadowBrush = New-Object System.Drawing.SolidBrush $shadow
  $smilePen = New-Object System.Drawing.Pen $smile, 2.6
  $smilePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $smilePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

  $progress = if ($FrameCount -le 1) { 0 } else { [double]$FrameIndex / ($FrameCount - 1) }
  $swing = [Math]::Sin($progress * [Math]::PI * 2)
  $bounce = [Math]::Abs([Math]::Sin($progress * [Math]::PI * 2))

  $baseX = $FrameX + ($FrameWidth / 2)
  $baseY = $FrameY + ($FrameHeight * 0.80)
  $headRadius = if ($Style -eq "expressive") { 16 } else { 14 }
  $torsoHeight = 24
  $headY = $baseY - 48 - ($bounce * 5)
  $torsoTopY = $headY + 18
  $torsoBottomY = $torsoTopY + $torsoHeight
  $facing = 1

  switch ($Mode) {
    "run" {
      $leadLeg = 18 * $swing
      $trailLeg = -16 * $swing
      $leadArm = -18 * $swing
      $trailArm = 15 * $swing
      $lean = 5
      $dust = $FrameIndex % 2 -eq 0
    }
    "jump" {
      $leadLeg = -6 + (10 * $progress)
      $trailLeg = 10 - (18 * $progress)
      $leadArm = -20 + (26 * $progress)
      $trailArm = 14 - (18 * $progress)
      $lean = -4 + (8 * $progress)
      $headY -= 18 * [Math]::Sin($progress * [Math]::PI)
      $torsoTopY = $headY + 18
      $torsoBottomY = $torsoTopY + $torsoHeight
      $dust = $false
    }
    "slide" {
      $leadLeg = 22
      $trailLeg = -8
      $leadArm = -4
      $trailArm = 18
      $lean = 24
      $headY = $baseY - 24
      $torsoTopY = $headY + 16
      $torsoBottomY = $torsoTopY + 16
      $dust = $true
    }
    "wallrun" {
      $leadLeg = -14 + 24 * $swing
      $trailLeg = 8 - 20 * $swing
      $leadArm = -8
      $trailArm = 22
      $lean = -16
      $baseX = $FrameX + ($FrameWidth * 0.70)
      $dust = $false
      $Graphics.DrawLine($thinPen, $FrameX + ($FrameWidth * 0.82), $FrameY + 8, $FrameX + ($FrameWidth * 0.82), $FrameY + $FrameHeight - 10)
      $Graphics.DrawLine($thinPen, $FrameX + ($FrameWidth * 0.84), $FrameY + 8, $FrameX + ($FrameWidth * 0.84), $FrameY + $FrameHeight - 10)
    }
    default {
      $leadLeg = 0
      $trailLeg = 0
      $leadArm = 0
      $trailArm = 0
      $lean = 0
      $dust = $false
    }
  }

  if ($dust) {
    Fill-Circle $Graphics $shadowBrush ($baseX - 18) ($baseY + 2) 7
    Fill-Circle $Graphics $shadowBrush ($baseX - 8) ($baseY + 4) 5
  }

  $Graphics.TranslateTransform([float]$baseX, [float]$torsoTopY)
  $Graphics.RotateTransform([float]$lean)
  if ($facing -eq -1) {
    $Graphics.ScaleTransform(-1, 1)
  }

  Fill-Circle $Graphics $shadowBrush 0 54 13

  if ($Style -eq "expressive") {
    $Graphics.FillEllipse($paperBrush, -12, -16, 31, 31)
    $Graphics.DrawEllipse($thinPen, -12, -16, 31, 31)
    $Graphics.FillEllipse($paperBrush, 12, -5, 10, 9)
    $Graphics.DrawEllipse($thinPen, 12, -5, 10, 9)
    $Graphics.FillPie($inkBrush, 2, -8, 10, 10, 215, 290)
    $Graphics.DrawArc($smilePen, 2, 2, 11, 8, 322, 100)
    $Graphics.DrawLine($thinPen, 10, -12, 15, -18)
    $Graphics.DrawLine($thinPen, 4, -15, 2, -21)
  } else {
    $Graphics.FillEllipse($paperBrush, -9, -14, 26, 28)
    $Graphics.DrawEllipse($thinPen, -9, -14, 26, 28)
    $Graphics.FillEllipse($paperBrush, 11, -4, 9, 8)
    $Graphics.DrawEllipse($thinPen, 11, -4, 9, 8)
    $Graphics.FillEllipse($inkBrush, 4, -4, 4, 4)
    $Graphics.DrawArc($smilePen, 3, 1, 8, 7, 320, 90)
    $Graphics.DrawLine($thinPen, 8, -12, 13, -17)
  }

  $Graphics.DrawBezier($inkPen, -3, 12, 3, 19, 7, 28, 6, $torsoHeight + 10)

  if ($Style -eq "expressive") {
    Fill-Circle $Graphics $paperBrush -8 ($torsoHeight + 13) 4.4
    Fill-Circle $Graphics $paperBrush 12 ($torsoHeight + 13) 5.4
    $Graphics.DrawEllipse($thinPen, -12.4, $torsoHeight + 8.6, 8.8, 8.8)
    $Graphics.DrawEllipse($thinPen, 6.6, $torsoHeight + 7.6, 10.8, 10.8)
  } else {
    Fill-Circle $Graphics $paperBrush -8 ($torsoHeight + 13) 3.9
    Fill-Circle $Graphics $paperBrush 12 ($torsoHeight + 13) 4.8
    $Graphics.DrawEllipse($thinPen, -11.9, $torsoHeight + 9.1, 7.8, 7.8)
    $Graphics.DrawEllipse($thinPen, 7.2, $torsoHeight + 8.2, 9.6, 9.6)
  }

  $Graphics.DrawBezier($inkPen, 1, 20, -8, 24, -13, 30 + ($leadArm * 0.16), -9, $torsoHeight + 10 + $leadArm)
  $Graphics.DrawBezier($inkPen, 5, 22, 13, 24, 17, 31 + ($trailArm * 0.15), 13, $torsoHeight + 11 + $trailArm)

  $Graphics.DrawBezier($inkPen, 4, $torsoHeight + 8, -4, $torsoHeight + 18, -12, 37 + ($leadLeg * 0.22), -9, 55 + $leadLeg)
  $Graphics.DrawBezier($inkPen, 5, $torsoHeight + 8, 14, $torsoHeight + 18, 18, 38 + ($trailLeg * 0.22), 15, 55 + $trailLeg)

  if ($Style -eq "expressive") {
    $Graphics.FillEllipse($accentBrush, -3, 20, 18, 11)
    $Graphics.DrawEllipse($thinPen, -3, 20, 18, 11)
    $Graphics.DrawArc($thinPen, -5, 18, 22, 16, 210, 115)
  } else {
    $Graphics.FillEllipse($accentBrush, -2, 21, 16, 10)
    $Graphics.DrawEllipse($thinPen, -2, 21, 16, 10)
  }

  $Graphics.ResetTransform()

  $inkPen.Dispose()
  $thinPen.Dispose()
  $paperBrush.Dispose()
  $inkBrush.Dispose()
  $accentBrush.Dispose()
  $shadowBrush.Dispose()
  $smilePen.Dispose()
}

function New-SpriteSheet {
  param(
    [string]$Name,
    [int]$FrameCount,
    [int]$FrameWidth = 96,
    [int]$FrameHeight = 96,
    [string]$Style = "classic",
    [string]$Prefix = "runner"
  )

  $sheetWidth = $FrameCount * $FrameWidth
  $sheetHeight = $FrameHeight
  $bitmap = New-Object System.Drawing.Bitmap $sheetWidth, $sheetHeight
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)

  for ($frame = 0; $frame -lt $FrameCount; $frame += 1) {
    $frameX = $frame * $FrameWidth
    Draw-RunnerFrame -Graphics $graphics -FrameX $frameX -FrameY 0 -FrameWidth $FrameWidth -FrameHeight $FrameHeight -FrameIndex $frame -FrameCount $FrameCount -Mode $Name -Style $Style
  }

  $outputPath = Join-Path $assetRoot ("{0}-{1}-sheet.png" -f $Prefix, $Name)
  $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
}

New-SpriteSheet -Name "run" -FrameCount 8 -Style "classic" -Prefix "runner"
New-SpriteSheet -Name "jump" -FrameCount 5 -Style "classic" -Prefix "runner"
New-SpriteSheet -Name "slide" -FrameCount 4 -Style "classic" -Prefix "runner"
New-SpriteSheet -Name "wallrun" -FrameCount 6 -Style "classic" -Prefix "runner"

New-SpriteSheet -Name "run" -FrameCount 8 -Style "expressive" -Prefix "runner-expressive"
New-SpriteSheet -Name "jump" -FrameCount 5 -Style "expressive" -Prefix "runner-expressive"
New-SpriteSheet -Name "slide" -FrameCount 4 -Style "expressive" -Prefix "runner-expressive"
New-SpriteSheet -Name "wallrun" -FrameCount 6 -Style "expressive" -Prefix "runner-expressive"

$manifest = @"
{
  "titleMusic": "SwinginSafari.wav",
  "gameplayMusic": "BourbonBlues.wav",
  "bonusMusic": "BoogieWonderland.wav",
  "resultsMusic": "CoolCatCaper.wav",
  "spritesheets": {
    "run": { "path": "/assets/town-rush/runner-run-sheet.png", "frameWidth": 96, "frameHeight": 96, "frames": 8 },
    "jump": { "path": "/assets/town-rush/runner-jump-sheet.png", "frameWidth": 96, "frameHeight": 96, "frames": 5 },
    "slide": { "path": "/assets/town-rush/runner-slide-sheet.png", "frameWidth": 96, "frameHeight": 96, "frames": 4 },
    "wallrun": { "path": "/assets/town-rush/runner-wallrun-sheet.png", "frameWidth": 96, "frameHeight": 96, "frames": 6 }
  },
  "expressiveSpritesheets": {
    "run": { "path": "/assets/town-rush/runner-expressive-run-sheet.png", "frameWidth": 96, "frameHeight": 96, "frames": 8 },
    "jump": { "path": "/assets/town-rush/runner-expressive-jump-sheet.png", "frameWidth": 96, "frameHeight": 96, "frames": 5 },
    "slide": { "path": "/assets/town-rush/runner-expressive-slide-sheet.png", "frameWidth": 96, "frameHeight": 96, "frames": 4 },
    "wallrun": { "path": "/assets/town-rush/runner-expressive-wallrun-sheet.png", "frameWidth": 96, "frameHeight": 96, "frames": 6 }
  }
}
"@

Set-Content -Path (Join-Path $assetRoot "runner-manifest.json") -Value $manifest -Encoding utf8
Write-Output "Generated Town Rush audio placements and runner sprite sheets."
