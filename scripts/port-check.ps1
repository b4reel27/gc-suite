$ports = 3002,3005
foreach ($p in $ports) {
  $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
  if ($c) {
    $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
    "{0} LISTENING -> PID {1} ({2})" -f $p, $c.OwningProcess, $proc.ProcessName
  } else {
    "{0} FREE" -f $p
  }
}
