# charlib - cai dat va chay TripoSplat tren Windows (GPU NVIDIA)
#
# Cach chay (PowerShell, trong thu muc charlib):
#   powershell -ExecutionPolicy Bypass -File tools\setup_windows.ps1
# hoac nhap dup vao setup_windows.bat
#
# Script lam lan luot (chay lai bao nhieu lan cung duoc, buoc nao xong roi se bo qua):
#   1. kiem tra GPU NVIDIA
#   2. tai ComfyUI ban portable (hoac dung ban co san: -ComfyDir D:\ComfyUI_windows_portable)
#   3. cap nhat ComfyUI (TripoSplat can ban moi)
#   4. tai 5 file model (~3.5 GB)
#   5. bat ComfyUI, tai workflow, chay build cho moi anh trong input\
#   6. mo trang thu vien tren trinh duyet
[CmdletBinding()]
param(
    [string]$ComfyDir = "",
    [string]$InstallRoot = "C:\AI",
    [int]$Port = 8188,
    [int]$GalleryPort = 8000,
    [switch]$NoGlb,
    [switch]$SkipUpdate,
    [switch]$SetupOnly,
    [string[]]$Only = @()
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"   # Invoke-WebRequest nhanh hon nhieu khi tat thanh tien do
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUTF8 = "1"

$Charlib = Split-Path -Parent $PSScriptRoot
function Step($msg) { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Info($msg) { Write-Host "    $msg" }
function Fail($msg) { Write-Host ""; Write-Host "LOI: $msg" -ForegroundColor Red; exit 1 }

# ---------------------------------------------------------------- 1. GPU
Step "Kiem tra GPU NVIDIA"
$smi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
if (-not $smi) { Fail "Khong thay nvidia-smi. Cai driver NVIDIA moi nhat roi chay lai." }
& nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader | ForEach-Object { Info $_ }

# ---------------------------------------------------------------- 2. ComfyUI portable
function Find-Portable($root) {
    if (-not (Test-Path $root)) { return $null }
    $hit = Get-ChildItem -Path $root -Directory -Recurse -Depth 2 -ErrorAction SilentlyContinue |
        Where-Object { (Test-Path (Join-Path $_.FullName "python_embeded\python.exe")) -and
                       (Test-Path (Join-Path $_.FullName "ComfyUI\main.py")) } |
        Select-Object -First 1
    if ($hit) { return $hit.FullName } else { return $null }
}

function Expand-7z($archive, $dest) {
    $sevenZip = @("$env:ProgramFiles\7-Zip\7z.exe", "${env:ProgramFiles(x86)}\7-Zip\7z.exe") |
        Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $sevenZip) {
        # tar.exe cua Windows 11 (libarchive) doc duoc .7z
        Info "Giai nen bang tar.exe ..."
        & tar.exe -xf $archive -C $dest
        if ($LASTEXITCODE -eq 0) { return }
        Info "tar.exe khong giai nen duoc, cai 7-Zip bang winget ..."
        & winget install --id 7zip.7zip -e --accept-source-agreements --accept-package-agreements --silent
        $sevenZip = "$env:ProgramFiles\7-Zip\7z.exe"
        if (-not (Test-Path $sevenZip)) { Fail "Khong cai duoc 7-Zip. Cai tay tu https://www.7-zip.org roi chay lai." }
    }
    Info "Giai nen bang 7-Zip ..."
    & $sevenZip x $archive "-o$dest" -y | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail "Giai nen $archive that bai" }
}

Step "ComfyUI"
if ($ComfyDir) {
    if (-not (Test-Path (Join-Path $ComfyDir "python_embeded\python.exe"))) {
        Fail "$ComfyDir khong phai ComfyUI ban portable (thieu python_embeded\python.exe)"
    }
} else {
    $ComfyDir = Find-Portable $InstallRoot
}
if (-not $ComfyDir) {
    New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
    Info "Tim ban ComfyUI portable moi nhat tren GitHub ..."
    $rel = Invoke-RestMethod -Uri "https://api.github.com/repos/comfyanonymous/ComfyUI/releases/latest" `
        -Headers @{ "User-Agent" = "charlib-setup" }
    $asset = $rel.assets | Where-Object { $_.name -like "*portable*nvidia*.7z" } | Select-Object -First 1
    if (-not $asset) { $asset = $rel.assets | Where-Object { $_.name -like "*portable*.7z" } | Select-Object -First 1 }
    if (-not $asset) { Fail "Khong thay file ComfyUI portable trong release $($rel.tag_name)" }
    $archive = Join-Path $InstallRoot $asset.name
    if (-not (Test-Path $archive) -or (Get-Item $archive).Length -ne $asset.size) {
        Info ("Tai {0} ({1:N0} MB) ..." -f $asset.name, ($asset.size / 1MB))
        & curl.exe -L --fail --retry 3 -C - -o $archive $asset.browser_download_url
        if ($LASTEXITCODE -ne 0) { Fail "Tai ComfyUI that bai" }
    }
    Expand-7z $archive $InstallRoot
    $ComfyDir = Find-Portable $InstallRoot
    if (-not $ComfyDir) { Fail "Giai nen xong nhung khong thay ComfyUI trong $InstallRoot" }
}
$Py = Join-Path $ComfyDir "python_embeded\python.exe"
$ComfyMain = Join-Path $ComfyDir "ComfyUI\main.py"
Info "ComfyUI: $ComfyDir"

# ---------------------------------------------------------------- 3. cap nhat
if (-not $SkipUpdate) {
    Step "Cap nhat ComfyUI (TripoSplat can ban moi)"
    $upd = Join-Path $ComfyDir "update\update.py"
    if (Test-Path $upd) {
        & $Py -s $upd (Join-Path $ComfyDir "ComfyUI\")
        if ($LASTEXITCODE -ne 0) { Info "Cap nhat bao loi - tiep tuc voi ban hien co" }
        $req = Join-Path $ComfyDir "ComfyUI\requirements.txt"
        if (Test-Path $req) { & $Py -s -m pip install -q -r $req }
    } else {
        Info "Khong thay update\update.py - bo qua"
    }
}

# ---------------------------------------------------------------- 4. model
Step "Tai model TripoSplat (~3.5 GB, chi tai lan dau)"
$models = @(
    @{ dir = "background_removal"; name = "birefnet.safetensors";
       url = "https://huggingface.co/Comfy-Org/BiRefNet/resolve/main/background_removal/birefnet.safetensors" },
    @{ dir = "diffusion_models"; name = "triposplat_fp16.safetensors";
       url = "https://huggingface.co/VAST-AI/TripoSplat/resolve/main/diffusion_models/triposplat_fp16.safetensors" },
    @{ dir = "clip_vision"; name = "dino_v3_vit_h.safetensors";
       url = "https://huggingface.co/VAST-AI/TripoSplat/resolve/main/clip_vision/dino_v3_vit_h.safetensors" },
    @{ dir = "vae"; name = "triposplat_vae_decoder_fp16.safetensors";
       url = "https://huggingface.co/VAST-AI/TripoSplat/resolve/main/vae/triposplat_vae_decoder_fp16.safetensors" },
    @{ dir = "vae"; name = "flux2-vae.safetensors";
       url = "https://huggingface.co/VAST-AI/TripoSplat/resolve/main/vae/flux2-vae.safetensors" }
)
foreach ($m in $models) {
    $dir = Join-Path $ComfyDir ("ComfyUI\models\" + $m.dir)
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $dest = Join-Path $dir $m.name
    $part = "$dest.part"
    if ((Test-Path $dest) -and (Get-Item $dest).Length -gt 1MB) { Info "co roi: $($m.dir)\$($m.name)"; continue }
    Info "tai $($m.dir)\$($m.name) ..."
    $curlArgs = @("-L", "--fail", "--retry", "5", "--retry-delay", "5", "-C", "-", "-o", $part)
    if ($env:HF_TOKEN) { $curlArgs += @("-H", "Authorization: Bearer $($env:HF_TOKEN)") }
    & curl.exe @curlArgs $m.url
    if ($LASTEXITCODE -ne 0) {
        Fail ("Tai $($m.name) that bai. Neu Hugging Face doi dang nhap: chap nhan dieu khoan model tren " +
              "trang VAST-AI/TripoSplat, dat bien HF_TOKEN (set HF_TOKEN=hf_...) roi chay lai.")
    }
    Move-Item -Force $part $dest
}

if ($SetupOnly) { Step "Cai dat xong (-SetupOnly)"; exit 0 }

# ---------------------------------------------------------------- 5. chay ComfyUI + build
function Test-Comfy {
    try { Invoke-RestMethod -Uri "http://127.0.0.1:$Port/system_stats" -TimeoutSec 3 | Out-Null; return $true }
    catch { return $false }
}

Step "Khoi dong ComfyUI tren cong $Port"
$started = $null
if (Test-Comfy) {
    Info "ComfyUI da chay san"
} else {
    $log = Join-Path $Charlib "comfyui.log"
    $started = Start-Process -FilePath $Py -PassThru -WindowStyle Minimized `
        -ArgumentList @("-s", "`"$ComfyMain`"", "--windows-standalone-build", "--listen", "127.0.0.1", "--port", "$Port") `
        -RedirectStandardOutput $log -RedirectStandardError "$log.err"
    Info "log: $log"
    $deadline = (Get-Date).AddMinutes(5)
    while (-not (Test-Comfy)) {
        if ($started.HasExited) { Get-Content "$log.err" -Tail 30; Fail "ComfyUI thoat khi khoi dong (xem log o tren)" }
        if ((Get-Date) -gt $deadline) { Fail "Qua 5 phut ComfyUI chua san sang" }
        Start-Sleep -Seconds 3
    }
    Info "ComfyUI san sang: http://127.0.0.1:$Port"
}

$tool = Join-Path $Charlib "tools\charlib.py"
Push-Location $Charlib
try {
    if (-not (Test-Path "workflows\3d_triposplat_image_to_gaussian_splat.json")) {
        Step "Tai workflow TripoSplat"
        & $Py -s $tool fetch-workflow
        if ($LASTEXITCODE -ne 0) { Fail "Khong tai duoc workflow" }
    }

    Step "Kiem tra workflow voi ComfyUI"
    & $Py -s $tool convert --server "http://127.0.0.1:$Port"
    if ($LASTEXITCODE -ne 0) { Fail "ComfyUI thieu nut cho TripoSplat - cap nhat ComfyUI (bo -SkipUpdate) roi chay lai" }

    $imgs = Get-ChildItem "input" -File | Where-Object { $_.Extension -match '^\.(png|jpe?g|webp)$' }
    if (-not $imgs) {
        Step "Chua co anh nao trong $Charlib\input"
        Info "Bo anh nhan vat (png/jpg/webp, toan than, nhin thang) vao do roi chay lai script."
    } else {
        Step "Tao 3D cho $($imgs.Count) anh"
        $buildArgs = @("-s", $tool, "build", "--server", "http://127.0.0.1:$Port")
        if (-not $NoGlb) { $buildArgs += "--glb" }
        if ($Only.Count -gt 0) { $buildArgs += "--only"; $buildArgs += $Only }
        & $Py @buildArgs
        if ($LASTEXITCODE -ne 0) { Info "Mot so nhan vat bi loi - xem thong bao o tren" }
    }
} finally {
    Pop-Location
}

# ---------------------------------------------------------------- 6. trang thu vien
Step "Mo trang thu vien: http://127.0.0.1:$GalleryPort"
Start-Process -FilePath $Py -WindowStyle Minimized `
    -ArgumentList @("-m", "http.server", "$GalleryPort", "--bind", "127.0.0.1", "--directory", "`"$Charlib`"")
Start-Sleep -Seconds 2
Start-Process "http://127.0.0.1:$GalleryPort"
Info "ComfyUI van chay o http://127.0.0.1:$Port (dong cua so python de tat)."
