# Usage: scripts/docker-build.ps1 [-Repo olafimus/olivers-master-repo] [-Tag 1.0.0] [-Push] [-MultiArch]
# Images: <repo>:scheisse-server-<tag>, <repo>:scheisse-web-<tag> (+ -latest when tag != latest)
param([string]$Repo = $(if ($env:IMAGE_REPO) { $env:IMAGE_REPO } else { "olafimus/olivers-master-repo" }),
      [string]$Tag = $(if ($env:TAG) { $env:TAG } else { "latest" }), [switch]$Push, [switch]$MultiArch)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
$env:IMAGE_REPO = $Repo; $env:TAG = $Tag
if (-not $env:JWT_SECRET) { $env:JWT_SECRET = "build-only" }
function Check { if ($LASTEXITCODE) { exit $LASTEXITCODE } }
if ($MultiArch) {
  docker buildx inspect scheisse-builder *> $null
  if ($LASTEXITCODE -ne 0) { docker buildx create --name scheisse-builder --driver docker-container --use; Check }
  if ($Push) { $plat = "linux/amd64,linux/arm64"; $out = "--push" }
  else { Write-Host "multi-arch cannot be loaded locally; amd64 only (use -Push)"; $plat = "linux/amd64"; $out = "--load" }
  foreach ($app in "server", "web") {
    $t = @("-t", "${Repo}:scheisse-$app-$Tag")
    if ($Tag -ne "latest") { $t += @("-t", "${Repo}:scheisse-$app-latest") }
    docker buildx build --builder scheisse-builder --platform $plat $out -f "apps/$app/Dockerfile" @t .; Check
  }
} else {
  docker compose -f docker-compose.prod.yml build server web; Check
  foreach ($app in "server", "web") {
    if ($Tag -ne "latest") { docker tag "${Repo}:scheisse-$app-$Tag" "${Repo}:scheisse-$app-latest"; Check }
    if ($Push) {
      docker push "${Repo}:scheisse-$app-$Tag"; Check
      if ($Tag -ne "latest") { docker push "${Repo}:scheisse-$app-latest"; Check }
    }
  }
}
