$u = 'https://github.com/wuxiuy/archive.git'
$input = "protocol=https`nhost=github.com`npath=wuxiuy/archive.git`n"
$cred = $input | git credential fill 2>&1
Write-Output ('RAW: [' + ($cred -join ' | ') + ']')
