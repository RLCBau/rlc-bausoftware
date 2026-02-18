// RLC.BricsCAD.Plugin/Commands/RlcImportUtmCommand.cs
using Teigha.Runtime; // ✅ CommandMethodAttribute sta qui
using RLC.BricsCAD.Plugin.Services;

namespace RLC.BricsCAD.Plugin.Commands
{
    public class RlcImportUtmCommand
    {
        [CommandMethod("RLC_IMPORT_UTM")]
        public void Run()
        {
            UTMImportService.ImportCsvPoints(new UTMImportService.ImportOptions
            {
                LayerName = "RLC_UTM",
                LayerColor = 2,
                AddLabel = true,
                TextHeight = 0.25,
                ZoomToImported = true
            });
        }
    }
}
