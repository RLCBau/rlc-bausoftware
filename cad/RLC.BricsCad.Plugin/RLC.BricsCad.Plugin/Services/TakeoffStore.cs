using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;

namespace RLC.BricsCAD.Plugin.Services
{
    public static class TakeoffStore
    {
        public class TakeoffRow
        {
            public string EntityType { get; set; }
            public string Layer { get; set; }
            public string Handle { get; set; }
            public double Length { get; set; }
            public double Area { get; set; }

            // ✅ Neues: LV-Verknüpfung
            public string LvPos { get; set; }   // z.B. 01.02.0030
            public string LvText { get; set; }  // optional Kurztext
        }

        private static readonly List<TakeoffRow> _rows = new List<TakeoffRow>();

        public static IReadOnlyList<TakeoffRow> Rows => _rows;

        public static void Clear() => _rows.Clear();

        public static void Add(TakeoffRow row)
        {
            if (row == null) return;
            _rows.Add(row);
        }

        // ✅ Setzt LV-Daten auf ausgewählte Handles (oder alle, wenn handles leer)
        public static void ApplyLvToHandles(IEnumerable<string> handles, string lvPos, string lvText)
        {
            lvPos = (lvPos ?? "").Trim();
            lvText = (lvText ?? "").Trim();

            if (string.IsNullOrWhiteSpace(lvPos) && string.IsNullOrWhiteSpace(lvText))
                return;

            HashSet<string> set = null;
            if (handles != null)
            {
                var arr = handles.Where(h => !string.IsNullOrWhiteSpace(h)).Select(h => h.Trim()).ToArray();
                if (arr.Length > 0) set = new HashSet<string>(arr, StringComparer.OrdinalIgnoreCase);
            }

            foreach (var r in _rows)
            {
                if (set != null && !set.Contains(r.Handle ?? "")) continue;

                if (!string.IsNullOrWhiteSpace(lvPos)) r.LvPos = lvPos;
                if (!string.IsNullOrWhiteSpace(lvText)) r.LvText = lvText;
            }
        }

        public static void ExportCsv(string filePath)
        {
            var sb = new StringBuilder();

            // ✅ erweitert
            sb.AppendLine("LVPos;LVText;EntityType;Layer;Handle;Length;Area");

            foreach (var r in _rows)
            {
                sb.Append(Esc(r.LvPos)); sb.Append(';');
                sb.Append(Esc(r.LvText)); sb.Append(';');
                sb.Append(Esc(r.EntityType)); sb.Append(';');
                sb.Append(Esc(r.Layer)); sb.Append(';');
                sb.Append(Esc(r.Handle)); sb.Append(';');
                sb.Append(r.Length.ToString("0.###", CultureInfo.InvariantCulture)); sb.Append(';');
                sb.Append(r.Area.ToString("0.###", CultureInfo.InvariantCulture));
                sb.AppendLine();
            }

            File.WriteAllText(filePath, sb.ToString(), Encoding.UTF8);
        }

        // ✅ JSON v2: LV enthalten
        // { "type":"rlc_takeoff_v2", "rows":[ {lvPos, lvText, entityType, layer, handle, length, area}, ... ] }
        public static void ExportJson(string filePath)
        {
            var sb = new StringBuilder();
            sb.Append("{\"type\":\"rlc_takeoff_v2\",\"rows\":[");

            for (int i = 0; i < _rows.Count; i++)
            {
                var r = _rows[i];
                if (i > 0) sb.Append(',');

                sb.Append("{");
                sb.Append("\"lvPos\":").Append(Json(r.LvPos)).Append(",");
                sb.Append("\"lvText\":").Append(Json(r.LvText)).Append(",");
                sb.Append("\"entityType\":").Append(Json(r.EntityType)).Append(",");
                sb.Append("\"layer\":").Append(Json(r.Layer)).Append(",");
                sb.Append("\"handle\":").Append(Json(r.Handle)).Append(",");
                sb.Append("\"length\":").Append(r.Length.ToString("0.###", CultureInfo.InvariantCulture)).Append(",");
                sb.Append("\"area\":").Append(r.Area.ToString("0.###", CultureInfo.InvariantCulture));
                sb.Append("}");
            }

            sb.Append("]}");

            File.WriteAllText(filePath, sb.ToString(), Encoding.UTF8);
        }

        private static string Esc(string s)
        {
            s = s ?? "";
            if (s.Contains(";") || s.Contains("\"") || s.Contains("\n"))
                return "\"" + s.Replace("\"", "\"\"") + "\"";
            return s;
        }

        private static string Json(string s)
        {
            s = s ?? "";
            return "\"" + s.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
        }
    }
}
