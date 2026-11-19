$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $PSScriptRoot
$gddDir = Join-Path $repoRoot 'GDD'
$outDir = Join-Path $repoRoot 'public\assets\aichan'

$sourceFile = Get-ChildItem -LiteralPath $gddDir -Filter '*.jpg' | Select-Object -First 1
if (-not $sourceFile) {
  throw "Could not find source concept sheet JPG inside $gddDir"
}

New-Item -ItemType Directory -Path $outDir -Force | Out-Null

$crops = @(
  @{ Name = 'smug';      X = 126;  Y = 50;  W = 604; H = 604 },
  @{ Name = 'mocking';   X = 760;  Y = 50;  W = 604; H = 604 },
  @{ Name = 'bored';     X = 1386; Y = 50;  W = 604; H = 604 },
  @{ Name = 'malicious'; X = 127;  Y = 772; W = 604; H = 604 },
  @{ Name = 'shocked';   X = 1080; Y = 772; W = 604; H = 604 },
  @{ Name = 'clap';      X = 2022; Y = 772; W = 604; H = 604 }
)

$targetSize = 512
$srcBmp = [System.Drawing.Bitmap]::new($sourceFile.FullName)

try {
  foreach ($crop in $crops) {
    $dstBmp = [System.Drawing.Bitmap]::new($targetSize, $targetSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $gfx = [System.Drawing.Graphics]::FromImage($dstBmp)
    try {
      $gfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $gfx.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $gfx.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $gfx.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

      $srcRect = [System.Drawing.Rectangle]::new($crop.X, $crop.Y, $crop.W, $crop.H)
      $dstRect = [System.Drawing.Rectangle]::new(0, 0, $targetSize, $targetSize)
      $gfx.DrawImage($srcBmp, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)

      $outPath = Join-Path $outDir ($crop.Name + '.png')
      $dstBmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
      Write-Output ("Saved {0} ({1}x{2})" -f $outPath, $targetSize, $targetSize)
    }
    finally {
      $gfx.Dispose()
      $dstBmp.Dispose()
    }
  }
}
finally {
  $srcBmp.Dispose()
}
