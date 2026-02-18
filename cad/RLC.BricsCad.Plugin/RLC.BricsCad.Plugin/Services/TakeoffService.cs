using System;

using Bricscad.ApplicationServices;
using Bricscad.EditorInput;

using Teigha.DatabaseServices;
using Teigha.Geometry;

namespace RLC.BricsCAD.Plugin.Services
{
    public static class TakeoffService
    {
        public static void TakeoffFromSelection()
        {
            var doc = Application.DocumentManager.MdiActiveDocument;
            var ed = doc.Editor;

            // ✅ 1) prova prima la selezione già fatta con il mouse (PickFirst)
            var implied = ed.SelectImplied();
            if (implied.Status == PromptStatus.OK && implied.Value != null && implied.Value.Count > 0)
            {
                ComputeFromObjectIds(implied.Value.GetObjectIds());
                ed.WriteMessage($"\nRLC Takeoff: {implied.Value.Count} Objekt(e) aus Auswahl übernommen.");
                return;
            }

            // ✅ 2) fallback: selezione manuale dal prompt
            var pso = new PromptSelectionOptions
            {
                MessageForAdding = "\nObjekte wählen (Polyline, Line, Arc, Circle, Spline, etc.): "
            };

            var psr = ed.GetSelection(pso);
            if (psr.Status != PromptStatus.OK) return;

            ComputeFromObjectIds(psr.Value.GetObjectIds());
            ed.WriteMessage($"\nRLC Takeoff: {psr.Value.Count} Objekt(e) erfasst.");
        }

        public static void TakeoffFromLayer(string layerName)
        {
            var doc = Application.DocumentManager.MdiActiveDocument;
            var ed = doc.Editor;

            var tvs = new TypedValue[]
            {
                new TypedValue((int)DxfCode.LayerName, layerName)
            };
            var filter = new SelectionFilter(tvs);

            var psr = ed.SelectAll(filter);
            if (psr.Status != PromptStatus.OK) return;

            ComputeFromObjectIds(psr.Value.GetObjectIds());
            ed.WriteMessage($"\nRLC Takeoff: {psr.Value.Count} Objekt(e) aus Layer '{layerName}' erfasst.");
        }

        private static void ComputeFromObjectIds(ObjectId[] ids)
        {
            if (ids == null || ids.Length == 0) return;

            var doc = Application.DocumentManager.MdiActiveDocument;
            var db = doc.Database;

            using (var tr = db.TransactionManager.StartTransaction())
            {
                foreach (var id in ids)
                {
                    var ent = tr.GetObject(id, OpenMode.ForRead) as Entity;
                    if (ent == null) continue;

                    var row = ComputeEntity(ent, tr);
                    if (row != null) TakeoffStore.Add(row);
                }

                tr.Commit();
            }
        }

        private static TakeoffStore.TakeoffRow ComputeEntity(Entity ent, Transaction tr)
        {
            double len = 0.0;
            double area = 0.0;
            string type = ent.GetType().Name;

            if (ent is Polyline pl)
            {
                // ✅ direkter, zuverlässiger Weg
                len = SafeLength(pl);
                area = SafeArea(pl);
            }
            else if (ent is Polyline2d pl2)
            {
                // Länge ja, Fläche nur wenn Closed & planar -> Region-Fallback
                len = SafeCurveLength(pl2);
                area = TryComputeAreaFromClosedCurve(ent, tr);
            }
            else if (ent is Polyline3d pl3)
            {
                // 3D Polyline: Länge ok, Fläche nur wenn wirklich planar & closed -> Region-Fallback probieren
                len = SafeCurveLength(pl3);
                area = TryComputeAreaFromClosedCurve(ent, tr);
            }
            else if (ent is Circle c)
            {
                len = 2.0 * Math.PI * c.Radius;
                area = Math.PI * c.Radius * c.Radius;
            }
            else if (ent is Arc a)
            {
                len = a.Length;
                area = 0.0;
            }
            else if (ent is Ellipse e)
            {
                len = SafeCurveLength(e);
                area = TryComputeAreaFromClosedCurve(ent, tr);
            }
            else if (ent is Curve curve)
            {
                // ✅ Line, Spline, etc.
                len = SafeCurveLength(curve);
                area = TryComputeAreaFromClosedCurve(ent, tr);
            }
            else
            {
                return null;
            }

            return new TakeoffStore.TakeoffRow
            {
                EntityType = type,
                Layer = ent.Layer,
                Handle = ent.Handle.ToString(),
                Length = len,
                Area = area
            };
        }

        private static double SafeLength(Polyline pl)
        {
            try { return pl.Length; } catch { return 0.0; }
        }

        private static double SafeArea(Polyline pl)
        {
            try
            {
                if (!pl.Closed) return 0.0;
                return Math.Abs(pl.Area);
            }
            catch
            {
                return 0.0;
            }
        }

        private static double SafeCurveLength(Curve c)
        {
            try
            {
                var start = c.StartParam;
                var end = c.EndParam;
                return c.GetDistanceAtParameter(end) - c.GetDistanceAtParameter(start);
            }
            catch
            {
                try { return c.GetDistanceAtParameter(c.EndParam); }
                catch { return 0.0; }
            }
        }

        // ✅ Fläche für geschlossene Kurven (Polyline2d/Spline/Ellipse/3d-planar) per Region-Fallback
        private static double TryComputeAreaFromClosedCurve(Entity ent, Transaction tr)
        {
            try
            {
                // nur wenn "closed"
                bool isClosed = false;

                if (ent is Polyline pl) isClosed = pl.Closed;
                else if (ent is Polyline2d pl2) isClosed = pl2.Closed;
                else if (ent is Polyline3d pl3) isClosed = pl3.Closed;
                else if (ent is Curve c)
                {
                    try { isClosed = c.Closed; } catch { isClosed = false; }
                }

                if (!isClosed) return 0.0;

                // Region.CreateFromCurves benötigt planare, geschlossene Kurven
                var curves = new DBObjectCollection();
                curves.Add(ent);

                var regions = Region.CreateFromCurves(curves);
                if (regions == null || regions.Count == 0) return 0.0;

                double area = 0.0;

                // take first region
                var reg = regions[0] as Region;
                if (reg != null)
                {
                    try { area = Math.Abs(reg.Area); } catch { area = 0.0; }
                    try { reg.Dispose(); } catch { }
                }

                // dispose remaining regions (safety)
                for (int i = 1; i < regions.Count; i++)
                {
                    try { (regions[i] as IDisposable)?.Dispose(); } catch { }
                }

                return area;
            }
            catch
            {
                return 0.0;
            }
        }
    }
}
