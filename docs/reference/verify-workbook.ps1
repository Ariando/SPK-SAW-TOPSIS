# Membaca hasil perhitungan workbook verifikasi F0 lewat Excel.
# Dijalankan: powershell -NoProfile -ExecutionPolicy Bypass -File docs/reference/verify-workbook.ps1
# Memerlukan Microsoft Excel terpasang. Skrip ini membuka workbook, menghitung
# ulang seluruh formula, lalu mencetak nilai V dan peringkat ketiga metode.

$ErrorActionPreference = 'Stop'

$path = Join-Path $PSScriptRoot 'perhitungan-manual.xlsx'
if (-not (Test-Path $path)) { throw "Workbook tidak ditemukan: $path" }

$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false
$xl.DisplayAlerts = $false
$wb = $xl.Workbooks.Open($path)
$xl.CalculateFullRebuild()

Write-Output ('Input!C10 total bobot = ' + $wb.Worksheets.Item('Input').Range('C10').Value2)

$saw = $wb.Worksheets.Item('SAW')
Write-Output '--- SAW ---'
for ($r = 5; $r -le 8; $r++) {
  Write-Output ('{0}  V={1}  rank={2}' -f $saw.Range("A$r").Text, [math]::Round($saw.Range("F$r").Value2, 6), $saw.Range("G$r").Value2)
}

$wp = $wb.Worksheets.Item('WP')
Write-Output '--- WP ---'
Write-Output ('w ternormalisasi = ' + (2..5 | ForEach-Object { [math]::Round($wp.Cells.Item(4, $_).Value2, 6) }) -join ' ')
for ($r = 7; $r -le 10; $r++) {
  Write-Output ('{0}  S={1}  V={2}  rank={3}' -f $wp.Range("A$r").Text, [math]::Round($wp.Range("F$r").Value2, 6), [math]::Round($wp.Range("G$r").Value2, 6), $wp.Range("H$r").Value2)
}

$tm = $wb.Worksheets.Item('TOPSIS')
Write-Output '--- TOPSIS ---'
Write-Output ('pembagi = ' + (2..5 | ForEach-Object { [math]::Round($tm.Cells.Item(4, $_).Value2, 6) }) -join ' ')
Write-Output ('A+ = ' + (2..5 | ForEach-Object { [math]::Round($tm.Cells.Item(20, $_).Value2, 6) }) -join ' ')
Write-Output ('A- = ' + (2..5 | ForEach-Object { [math]::Round($tm.Cells.Item(21, $_).Value2, 6) }) -join ' ')
for ($r = 25; $r -le 28; $r++) {
  Write-Output ('{0}  D+={1}  D-={2}  V={3}  rank={4}' -f $tm.Range("A$r").Text, [math]::Round($tm.Range("B$r").Value2, 6), [math]::Round($tm.Range("C$r").Value2, 6), [math]::Round($tm.Range("D$r").Value2, 6), $tm.Range("E$r").Value2)
}

$wb.Close($false)
$xl.Quit()
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null