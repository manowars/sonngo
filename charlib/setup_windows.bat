@echo off
rem Nhap dup de cai ComfyUI + TripoSplat va tao 3D cho anh trong input\
rem Them tham so neu can, vd:  setup_windows.bat -ComfyDir D:\ComfyUI_windows_portable
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\setup_windows.ps1" %*
echo.
pause
