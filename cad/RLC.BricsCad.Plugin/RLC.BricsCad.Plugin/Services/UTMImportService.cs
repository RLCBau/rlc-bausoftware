using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Windows.Forms;

using Bricscad.ApplicationServices;
using Bricscad.EditorInput;

// alias per evitare ambiguità con System.Windows.Forms.Application
using BcApp = Bricscad.ApplicationServices.Application;

// Teigha (BricsCAD .NET API)
using Teigha.Colors;
using Teigha.DatabaseServices;
using Teigha.Geometry;

namespace RLC.BricsCAD.Plugin.Services
{
    public static class UTMImportService
    {
        public class ImportOptions
        {
            public string LayerName { get; set; } = "RLC_UTM";
            public short LayerColor { get; set; } = 2;
            public bool AddLabel { get; set; } = true;
            public double TextHeight { get; set; } = 0.25;
            public bool ZoomToImported { get; set; } = true;

            // compatibilità con comando
            public bool InsertAsBlock { get; set; } = false;
        }

        private class UtmRow
        {
            public double E { get; set; }
            public double N { get; set; }
            public double Z { get; set; }
            public string Label { get; set; }
        }

        public static void ImportCsvPoints(ImportOptions opt)
        {
            if (opt == null) opt = new ImportOptions();

            var doc = BcApp.DocumentManager.MdiActiveDocument;
            var ed = doc.Editor;
            var db = doc.Database;

            string file = PickCsvFile();
            if (string.IsNullOrWhiteSpace(file)) return;

            var rows = ParseCsv(file);
            if (rows.Count == 0)
            {
                MessageBox.Show(
                    "Keine gültigen UTM-Zeilen im CSV gefunden.",
                    "UTM Import",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning
                );
                return;
            }

            Extents3d? ext = null;

            using (var tr = db.TransactionManager.StartTransaction())
            {
                EnsureLayer(db, tr, opt.LayerName, opt.LayerColor);

                var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
                var ms = (BlockTableRecord)tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForWrite);

                foreach (var r in rows)
                {
                    var pt = new Point3d(r.E, r.N, r.Z);

                    var dbp = new DBPoint(pt)
                    {
                        Layer = opt.LayerName
                    };
                    ms.AppendEntity(dbp);
                    tr.AddNewlyCreatedDBObject(dbp, true);

                    if (opt.AddLabel)
                    {
                        var dbt = new DBText
                        {
                            Position = new Point3d(
                                pt.X + opt.TextHeight * 1.2,
                                pt.Y + opt.TextHeight * 1.2,
                                pt.Z),
                            Height = opt.TextHeight,
                            TextString = r.Label,
                            Layer = opt.LayerName
                        };
                        ms.AppendEntity(dbt);
                        tr.AddNewlyCreatedDBObject(dbt, true);
                    }

                    ext = ExpandExtents(ext, pt);
                }

                tr.Commit();
            }

            if (opt.ZoomToImported && ext.HasValue)
            {
                try { ZoomToExtents(ed, ext.Value); }
                catch { }
            }

            ed.WriteMessage($"\nRLC: UTM Import OK ({rows.Count} Punkte).");
        }

        private static string PickCsvFile()
        {
            using (var ofd = new OpenFileDialog())
            {
                ofd.Filter = "CSV (*.csv)|*.csv|Alle Dateien (*.*)|*.*";
                ofd.Title = "UTM CSV auswählen";
                return ofd.ShowDialog() == DialogResult.OK ? ofd.FileName : null;
            }
        }

        // 🔥 CSV ROBUST PARSER (reale Vermessungsdateien)
        private static List<UtmRow> ParseCsv(string file)
        {
            var list = new List<UtmRow>();
            var lines = File.ReadAllLines(file);

            foreach (var raw in lines)
            {
                var line = raw?.Trim();
                if (string.IsNullOrWhiteSpace(line)) continue;
                if (line.StartsWith("#")) continue;

                char sep = DetectSeparator(line);
                string[] p = sep == '\0'
                    ? line.Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries)
                    : line.Split(sep);

                if (p.Length < 3) continue;

                double e, n, z = 0.0;
                string label = "";

                // Format:
                // ID,E,N,Z,Text
                // E,N
                // E,N,Text

                // Caso con ID davanti
                if (!TryParseDouble(p[0], out e))
                {
                    if (!TryParseDouble(p[1], out e)) continue;
                    if (!TryParseDouble(p[2], out n)) continue;

                    if (p.Length >= 4)
                        TryParseDouble(p[3], out z);

                    label = p[0];
                }
                // Caso standard
                else
                {
                    if (!TryParseDouble(p[1], out n)) continue;

                    if (p.Length >= 3 && !TryParseDouble(p[2], out z))
                        label = p[2];
                }

                list.Add(new UtmRow
                {
                    E = e,
                    N = n,
                    Z = z,
                    Label = label
                });
            }

            return list;
        }

        private static char DetectSeparator(string line)
        {
            if (line.Contains(";")) return ';';
            if (line.Contains(",")) return ',';
            if (line.Contains("\t")) return '\t';
            return '\0';
        }

        private static bool TryParseDouble(string s, out double v)
        {
            s = (s ?? "").Trim();

            if (double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out v))
                return true;

            if (double.TryParse(s, NumberStyles.Float, new CultureInfo("de-DE"), out v))
                return true;

            v = 0;
            return false;
        }

        private static void EnsureLayer(Database db, Transaction tr, string name, short colorIndex)
        {
            var lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForRead);
            if (lt.Has(name)) return;

            lt.UpgradeOpen();

            var ltr = new LayerTableRecord
            {
                Name = name,
                Color = Color.FromColorIndex(ColorMethod.ByAci, colorIndex)
            };

            lt.Add(ltr);
            tr.AddNewlyCreatedDBObject(ltr, true);
        }

        private static Extents3d ExpandExtents(Extents3d? ext, Point3d p)
        {
            if (!ext.HasValue)
                return new Extents3d(p, p);

            var e = ext.Value;
            e.AddPoint(p);
            return e;
        }

        private static void ZoomToExtents(Editor ed, Extents3d ext)
        {
            var min = ext.MinPoint;
            var max = ext.MaxPoint;

            var dx = (max.X - min.X) * 0.10;
            var dy = (max.Y - min.Y) * 0.10;

            var min2 = new Point3d(min.X - dx, min.Y - dy, 0);
            var max2 = new Point3d(max.X + dx, max.Y + dy, 0);

            var view = ed.GetCurrentView();
            view.CenterPoint = new Point2d(
                (min2.X + max2.X) / 2.0,
                (min2.Y + max2.Y) / 2.0);

            view.Height = Math.Max(1.0, max2.Y - min2.Y);
            view.Width = Math.Max(1.0, max2.X - min2.X);

            ed.SetCurrentView(view);
        }
    }
}
