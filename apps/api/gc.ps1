param(
  [string]$Email = "b4reel271980@yahoo.com"
)

$loginBody = @{ email = $Email } | ConvertTo-Json

$login = Invoke-RestMethod `
  -Method POST `
  -Uri "http://localhost:3000/auth/dev-login" `
  -ContentType "application/json" `
  -Body $loginBody

$global:headers = @{ Authorization = "Bearer $($login.token)" }

Write-Host "Headers set. Ready to roll." -ForegroundColor Green