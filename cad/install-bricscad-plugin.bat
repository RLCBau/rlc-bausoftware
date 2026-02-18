@echo off
setlocal

REM === CONFIGURAZIONE FISSA ===
set SRC_DLL=C:\RLC\rlc-app\cad\RLC.BricsCAD.Plugin\RLC.BricsCAD.Plugin\bin\Release\RLC.BricsCAD.Plugin.dll
set DEST_DIR=C:\RLC\BricsCAD\Plugins\RLC
set DEST_DLL=%DEST_DIR%\RLC.BricsCAD.Plugin.dll

echo.
echo === RLC BricsCAD Plugin Installer ===
echo.

REM Verifica DLL compilata
if not exist "%SRC_DLL%" (
  echo ERRORE: DLL non trovata.
  echo Percorso atteso:
  echo %SRC_DLL%
  echo.
  echo Compila prima il progetto in modalita' RELEASE.
  pause
  exit /b 1
)

REM Crea cartella destinazione se non esiste
if not exist "%DEST_DIR%" (
  echo Creo cartella plugin:
  echo %DEST_DIR%
  mkdir "%DEST_DIR%"
)

REM Copia DLL
echo Copio DLL in:
echo %DEST_DLL%
copy /Y "%SRC_DLL%" "%DEST_DLL%" >nul

if errorlevel 1 (
  echo ERRORE durante la copia della DLL.
  pause
  exit /b 1
)

echo.
echo OK - Plugin installato correttamente.
echo.
echo Avvia BricsCAD e usa il comando:
echo NETLOAD
echo poi seleziona:
echo %DEST_DLL%
echo.

pause
endlocal
