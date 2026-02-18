// RLC.BricsCAD.Plugin/Commands/RlcExportUtmCommand.cs
using Teigha.Runtime;                 // ✅ CommandMethodAttribute sta qui
using Bricscad.ApplicationServices;   // ✅ DocumentManager / Document
using Bricscad.EditorInput;           // ✅ PromptStatus / GetString

using RLC.BricsCAD.Plugin.Services;

namespace RLC.BricsCAD.Plugin.Commands
{
    public class RlcExportUtmCommand
    {
        [CommandMethod("RLC_EXPORT_UTM")]
        public void Run()
        {
            var doc = Application.DocumentManager.MdiActiveDocument;
            if (doc == null) return;

            var ed = doc.Editor;

            var pr = ed.GetString("\nProjectId (z.B. BA-2025-DEMO): ");
            if (pr.Status != PromptStatus.OK) return;

            var projectId = (pr.StringResult ?? "").Trim();
            if (string.IsNullOrWhiteSpace(projectId))
            {
                ed.WriteMessage("\nKein ProjectId.");
                return;
            }

            var n = ExportUtmCsvService.ExportFromCurrentDrawing(doc.Database, new ExportUtmCsvService.Options
            {
                ProjectId = projectId,
                LayerName = "RLC_UTM",
                IncludeHeader = true
            });

            ed.WriteMessage($"\nUTM exportiert: {n} Zeilen (Layer RLC_UTM).");
        }
    }
}
