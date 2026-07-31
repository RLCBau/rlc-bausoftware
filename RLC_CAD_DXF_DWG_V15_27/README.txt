RLC CAD DXF/DWG V15.27

WEB
- API vollständig auf /api/cad/* umgestellt.
- DXF bis 12 MB wird lokal mit dem erweiterten RLC-Parser geöffnet.
- Große, binäre oder lokal fehlerhafte DXF-Dateien gehen automatisch an den Server.
- DWG wird immer serverseitig verarbeitet.

SERVER
- Gleicher erweiterter RLC-DXF-Parser wie im Web.
- Unterstützt unter anderem LINE, LWPOLYLINE/POLYLINE mit Bulge, CIRCLE, ARC,
  ELLIPSE, SPLINE, INSERT/BLOCK, DIMENSION, TEXT/MTEXT/ATTRIB,
  HATCH/LEADER, SOLID/TRACE/3DFACE und Layerfarben/-linientypen.
- DWG und binäres DXF werden vor dem Parsen in ASCII-DXF konvertiert.
- Unterstützte Konverter:
  1. RLC_CAD_CONVERTER_COMMAND mit {input} und {output}
  2. dwg2dxf
  3. ODAFileConverter

WEB INSTALLATION (PowerShell)
  .\INSTALL_WEB.ps1 -RlcRoot "C:\RLC\rlc-app" -RunChecks

SERVER INSTALLATION
  chmod +x INSTALL_SERVER_UBUNTU.sh
  ./INSTALL_SERVER_UBUNTU.sh /opt/rlc-bausoftware

HINWEIS DWG
Der Quellcode kann DWG nicht nativ dekodieren. Im Docker-Host oder Container muss
mindestens ein realer DWG->DXF-Konverter vorhanden sein.
