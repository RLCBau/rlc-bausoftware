// RLC.BricsCAD.Plugin/Services/ExportUtmCsvService.cs
using System;
using System.Globalization;
using System.IO;
using System.Text;
using Teigha.DatabaseServices;
using Teigha.Geometry;

namespace RLC.BricsCAD.Plugin.Services
{
    public static class ExportUtmCsvService
    {
        public class Options
        {
            public string ProjectId { get; set; } = "";
            public string ProjectsRoot { get; set; } = ""; // optional override
            public string LayerName { get; set; } = "RLC_UTM";
            public bool IncludeHeader { get; set; } = true;
        }

        public static string GetProjectsRootFallback()
        {
            // identisch zur Server-Default-Logik, aber als Plugin-Fallback
            // Wichtig: passe diesen Pfad an dein Setup an, falls nötig.
            // Du kannst ihn auch über ENV setzen: PROJECTS_ROOT
            var env = Environment.GetEnvironmentVariable("PROJECTS_ROOT");
            if (!string.IsNullOrWhiteSpace(env)) return env;

            // Standard: <repo>\apps\server\data\projects
            // Wenn du den Plugin woanders installierst, setze PROJECTS_ROOT env.
            return Path.Combine(Environment.CurrentDirectory, "data", "projects");
        }

        public static string BuildUtmCsvPath(string projectId, string projectsRoot)
        {
            var root = string.IsNullOrWhiteSpace(projectsRoot) ? GetProjectsRootFallback() : projectsRoot;
            return Path.Combine(root, projectId, "bricscad", "utm.csv");
        }

        public static int ExportFromCurrentDrawing(Database db, Options opt)
        {
            if (string.IsNullOrWhiteSpace(opt.ProjectId))
                throw new ArgumentException("ProjectId is required.");

            var projectsRoot = string.IsNullOrWhiteSpace(opt.ProjectsRoot) ? GetProjectsRootFallback() : opt.ProjectsRoot;
            var outPath = BuildUtmCsvPath(opt.ProjectId, projectsRoot);

            Directory.CreateDirectory(Path.GetDirectoryName(outPath));

            var sb = new StringBuilder();
            if (opt.IncludeHeader)
                sb.AppendLine("id,easting,northing");

            int count = 0;

            using (var tr = db.TransactionManager.StartTransaction())
            {
                var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
                var btr = (BlockTableRecord)tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForRead);

                foreach (ObjectId id in btr)
                {
                    var ent = tr.GetObject(id, OpenMode.ForRead) as Entity;
                    if (ent == null) continue;

                    if (!string.Equals(ent.Layer, opt.LayerName, StringComparison.OrdinalIgnoreCase))
                        continue;

                    // DBPoint
                    if (ent is DBPoint p)
                    {
                        var pt = p.Position;
                        var label = $"P_{count + 1}";
                        sb.AppendLine($"{Escape(label)},{ToInv(pt.X)},{ToInv(pt.Y)}");
                        count++;
                        continue;
                    }

                    // Optional: Texte als Punkt (falls du Labels exportieren willst)
                    if (ent is DBText t)
                    {
                        var pt = t.Position;
                        var label = string.IsNullOrWhiteSpace(t.TextString) ? $"T_{count + 1}" : t.TextString.Trim();
                        sb.AppendLine($"{Escape(label)},{ToInv(pt.X)},{ToInv(pt.Y)}");
                        count++;
                        continue;
                    }
                }

                tr.Commit();
            }

            File.WriteAllText(outPath, sb.ToString(), Encoding.UTF8);
            return count;
        }

        static string ToInv(double v) => v.ToString("0.###", CultureInfo.InvariantCulture);

        static string Escape(string s)
        {
            if (s == null) return "";
            s = s.Replace("\"", "\"\"");
            return s.Contains(",") ? $"\"{s}\"" : s;
        }
    }
}
