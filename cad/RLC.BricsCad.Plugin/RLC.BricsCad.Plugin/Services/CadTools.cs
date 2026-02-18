using System;
using System.Collections.Generic;
using Bricscad.ApplicationServices;
using Bricscad.EditorInput;
using Teigha.DatabaseServices;
using Teigha.Geometry;
using Teigha.Colors;

namespace RLC.BricsCAD.Plugin.Services
{
    public static class CadTools
    {
        private static Document Doc => Application.DocumentManager.MdiActiveDocument;
        private static Editor Ed => Doc.Editor;
        private static Database Db => Doc.Database;

        public static void EnsureLayer(string name, short aciColor = 3)
        {
            using (Doc.LockDocument())
            using (var tr = Db.TransactionManager.StartTransaction())
            {
                var lt = (LayerTable)tr.GetObject(Db.LayerTableId, OpenMode.ForRead);

                if (!lt.Has(name))
                {
                    lt.UpgradeOpen();
                    var ltr = new LayerTableRecord
                    {
                        Name = name,
                        Color = Color.FromColorIndex(ColorMethod.ByAci, aciColor)
                    };
                    lt.Add(ltr);
                    tr.AddNewlyCreatedDBObject(ltr, true);
                }

                tr.Commit();
            }
        }

        public static void SetCurrentLayer(string name)
        {
            using (Doc.LockDocument())
            using (var tr = Db.TransactionManager.StartTransaction())
            {
                var lt = (LayerTable)tr.GetObject(Db.LayerTableId, OpenMode.ForRead);
                if (!lt.Has(name))
                    throw new InvalidOperationException($"Layer '{name}' not found.");

                Db.Clayer = lt[name];
                tr.Commit();
            }
        }

        public static void DrawPolylineInteractive()
        {
            // Click points; ENTER to finish
            var pts = new List<Point2d>();

            PromptPointResult ppr = Ed.GetPoint("\nFirst point: ");
            if (ppr.Status != PromptStatus.OK) return;

            var prev = ppr.Value;
            pts.Add(new Point2d(prev.X, prev.Y));

            while (true)
            {
                var ppo = new PromptPointOptions("\nNext point (Enter to finish): ")
                {
                    UseBasePoint = true,
                    BasePoint = prev
                };

                var nextRes = Ed.GetPoint(ppo);
                if (nextRes.Status == PromptStatus.None) break; // Enter
                if (nextRes.Status != PromptStatus.OK) return;

                prev = nextRes.Value;
                pts.Add(new Point2d(prev.X, prev.Y));
            }

            if (pts.Count < 2) return;

            using (Doc.LockDocument())
            using (var tr = Db.TransactionManager.StartTransaction())
            {
                var bt = (BlockTable)tr.GetObject(Db.BlockTableId, OpenMode.ForRead);
                var btr = (BlockTableRecord)tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForWrite);

                var pl = new Polyline();
                for (int i = 0; i < pts.Count; i++)
                    pl.AddVertexAt(i, pts[i], 0, 0, 0);

                btr.AppendEntity(pl);
                tr.AddNewlyCreatedDBObject(pl, true);

                tr.Commit();
            }
        }

        public static double GetTotalLengthFromSelection()
        {
            var psr = Ed.GetSelection();
            if (psr.Status != PromptStatus.OK) return 0;

            double total = 0;

            using (Doc.LockDocument())
            using (var tr = Db.TransactionManager.StartTransaction())
            {
                foreach (SelectedObject so in psr.Value)
                {
                    if (so == null) continue;
                    var ent = tr.GetObject(so.ObjectId, OpenMode.ForRead) as Entity;
                    if (ent == null) continue;

                    // Polyline
                    if (ent is Polyline pl)
                    {
                        total += pl.Length;
                        continue;
                    }

                    // Line
                    if (ent is Line ln)
                    {
                        total += ln.Length;
                        continue;
                    }

                    // Arc / Circle etc. (estendibile)
                    if (ent is Arc arc)
                    {
                        total += arc.Length;
                        continue;
                    }
                }

                tr.Commit();
            }

            return total;
        }
    }
}
