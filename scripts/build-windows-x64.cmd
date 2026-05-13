@echo off
setlocal

rem Windows cmd.exe cannot run reliably from a UNC working directory.
rem pushd maps the repo path to a temporary drive letter, including from WSL.
pushd "%~dp0\.." || exit /b 1

set TARGET_ARCH=%~1
if "%TARGET_ARCH%"=="" set TARGET_ARCH=x64

if /i "%TARGET_ARCH%"=="x64" (
  set RUST_TARGET=x86_64-pc-windows-msvc
) else if /i "%TARGET_ARCH%"=="arm64" (
  set RUST_TARGET=aarch64-pc-windows-msvc
) else (
  echo Usage: %~nx0 [x64^|arm64] [tauri build args...]
  popd
  exit /b 2
)
shift /1

set EXTRA_ARGS=
:collect_args
if "%~1"=="" goto args_done
set EXTRA_ARGS=%EXTRA_ARGS% %1
shift /1
goto collect_args
:args_done

call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -arch=%TARGET_ARCH% || exit /b 1

set CARGO_BUILD_JOBS=1
npm run tauri:build -- --target %RUST_TARGET% %EXTRA_ARGS%
set BUILD_EXIT=%ERRORLEVEL%

popd
exit /b %BUILD_EXIT%
