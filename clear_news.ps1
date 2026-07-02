$body = @{ secret = "clear-news-2026"; hours = 2 } | ConvertTo-Json

$response = Invoke-RestMethod `
  -Uri "https://uppsc-pyq-production.up.railway.app/api/deleteRecentNews" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body

Write-Host "Deleted recent news:" ($response | ConvertTo-Json)
