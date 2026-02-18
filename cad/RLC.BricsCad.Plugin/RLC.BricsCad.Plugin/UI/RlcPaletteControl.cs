using System;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Text;
using System.Windows.Forms;

using Bricscad.EditorInput;
using Teigha.DatabaseServices;

using RLC.BricsCAD.Plugin.Services;

using BcadApp = Bricscad.ApplicationServices.Application;

namespace RLC.BricsCAD.Plugin.UI
{
    public class RlcPaletteControl : UserControl
    {
        private readonly TabControl _tabs = new TabControl();

        // UTM
        private Button _btnUtmImport;
        private Button _btnUtmExportCadCsv;

        // Takeoff
        private Button _btnTakeoffSelection;
        private Button _btnTakeoffLayer;

        private Button _btnApplyLv;
        private TextBox _tbProjectId;
        private TextBox _tbLvPos;
        private TextBox _tbLvText;

        private Button _btnExportCsv;
        private Button _btnExportJson;

        private Button _btnExportCadCsv;
        private Button _btnExportCadJson;

        private Button _btnSnapshotCadPng; // ✅ NEW

        private Button _btnClear;

        private ListView _list;
        private bool _takeoffUiInitialized = false;

        private const string PROJECTS_ROOT = @"C:\RLC\rlc-app\apps\server\data\projects";

        public RlcPaletteControl()
        {
            Dock = DockStyle.Fill;

            _tabs.Dock = DockStyle.Fill;
            Controls.Add(_tabs);

            BuildUtmTab();
            BuildTakeoffTab();

            VisibleChanged += (s, e) =>
            {
                if (Visible) SafeRefreshTakeoff();
            };

            _tabs.SelectedIndexChanged += (s, e) =>
            {
                if (_tabs.SelectedTab != null && _tabs.SelectedTab.Text == "Takeoff")
                    SafeRefreshTakeoff();
            };
        }

        public void SelectTabByName(string name)
        {
            foreach (TabPage tp in _tabs.TabPages)
            {
                if (string.Equals(tp.Text, name, StringComparison.OrdinalIgnoreCase))
                {
                    _tabs.SelectedTab = tp;
                    return;
                }
            }
        }

        // =========================
        // UTM TAB
        // =========================
        private void BuildUtmTab()
        {
            var tab = new TabPage("UTM");
            _tabs.TabPages.Add(tab);

            var panel = new Panel { Dock = DockStyle.Top, Height = 120, Padding = new Padding(6, 6, 6, 6) };
            tab.Controls.Add(panel);

            _btnUtmImport = new Button
            {
                Text = "CSV UTM importieren",
                Dock = DockStyle.Top,
                Height = 38
            };

            _btnUtmImport.Click += (s, e) =>
            {
                try
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
                catch (Exception ex)
                {
                    MessageBox.Show(ex.ToString(), "UTM Import Fehler", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            };

            _btnUtmExportCadCsv = new Button
            {
                Text = "Export UTM: utm.csv (1 Klick)",
                Dock = DockStyle.Top,
                Height = 38
            };

            _btnUtmExportCadCsv.Click += (s, e) =>
            {
                try
                {
                    var projectId = (_tbProjectId?.Text ?? "BA-2025-DEMO").Trim();
                    if (string.IsNullOrWhiteSpace(projectId)) projectId = "BA-2025-DEMO";

                    var utmCsvPath = GetUtmExportPath(projectId);
                    EnsureDir(Path.GetDirectoryName(utmCsvPath));

                    var count = ExportUtmFromDrawing("RLC_UTM", utmCsvPath);

                    if (count <= 0)
                    {
                        MessageBox.Show(
                            "Keine UTM-Punkte gefunden.\n\n" +
                            "Hinweis: Export sucht DBPoint/Blocks auf Layer 'RLC_UTM'.\n" +
                            "Wenn dein Import anders arbeitet, müssen wir UTMImportService angleichen.",
                            "UTM Export",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Information
                        );
                        return;
                    }

                    MessageBox.Show($"Gespeichert:\n{utmCsvPath}\n\nPunkte: {count}", "UTM Export", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
                catch (Exception ex)
                {
                    MessageBox.Show(ex.ToString(), "UTM Export Fehler", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            };

            panel.Controls.Add(_btnUtmExportCadCsv);
            panel.Controls.Add(_btnUtmImport);
        }

        // =========================
        // TAKEOFF TAB
        // =========================
        private void BuildTakeoffTab()
        {
            var tab = new TabPage("Takeoff");
            _tabs.TabPages.Add(tab);

            var root = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 1,
                RowCount = 2,
                Padding = new Padding(6, 6, 6, 6)
            };
            root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            root.RowStyles.Add(new RowStyle(SizeType.Absolute, 370)); // ✅ +40px for Snapshot button
            root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            tab.Controls.Add(root);

            var top = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 1,
                RowCount = 8, // ✅ was 7
                Margin = new Padding(0)
            };
            top.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            top.RowStyles.Add(new RowStyle(SizeType.Absolute, 46)); // info
            top.RowStyles.Add(new RowStyle(SizeType.Absolute, 90)); // inputs
            top.RowStyles.Add(new RowStyle(SizeType.Absolute, 36)); // apply lv
            top.RowStyles.Add(new RowStyle(SizeType.Absolute, 72)); // takeoff buttons
            top.RowStyles.Add(new RowStyle(SizeType.Absolute, 72)); // export cad
            top.RowStyles.Add(new RowStyle(SizeType.Absolute, 40)); // ✅ snapshot
            top.RowStyles.Add(new RowStyle(SizeType.Absolute, 72)); // save as
            top.RowStyles.Add(new RowStyle(SizeType.Absolute, 36)); // clear
            root.Controls.Add(top, 0, 0);

            var lblTakeoffInfo = new Label
            {
                Dock = DockStyle.Fill,
                Padding = new Padding(8, 0, 8, 0),
                TextAlign = ContentAlignment.MiddleLeft,
                AutoEllipsis = true,
                BorderStyle = BorderStyle.FixedSingle,
                Text =
                    "Info: (1) Optional LV-Position/Kurztext eintragen. " +
                    "(2) Dann „Takeoff: Auswahl“ wählen. " +
                    "Offene Polylinie = Länge (m), geschlossene Polylinie = Fläche (m²)."
            };
            top.Controls.Add(lblTakeoffInfo, 0, 0);

            var grid = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                Height = 86,
                ColumnCount = 2,
                RowCount = 3,
                Margin = new Padding(0, 8, 0, 0)
            };
            grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 110));
            grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

            var lblProject = new Label { Text = "Projekt-ID", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft };
            _tbProjectId = new TextBox { Dock = DockStyle.Fill, Text = "BA-2025-DEMO" };

            var lblLvPos = new Label { Text = "LV-Position", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft };
            _tbLvPos = new TextBox { Dock = DockStyle.Fill };

            var lblLvText = new Label { Text = "Kurztext", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft };
            _tbLvText = new TextBox { Dock = DockStyle.Fill };

            ApplyPlaceholder(_tbLvPos, "z.B. 01.02.0030");
            ApplyPlaceholder(_tbLvText, "optional");

            grid.Controls.Add(lblProject, 0, 0);
            grid.Controls.Add(_tbProjectId, 1, 0);
            grid.Controls.Add(lblLvPos, 0, 1);
            grid.Controls.Add(_tbLvPos, 1, 1);
            grid.Controls.Add(lblLvText, 0, 2);
            grid.Controls.Add(_tbLvText, 1, 2);

            top.Controls.Add(grid, 0, 1);

            _btnApplyLv = new Button
            {
                Text = "LV auf Auswahl anwenden (oder alle)",
                Dock = DockStyle.Fill,
                Height = 34,
                Margin = new Padding(0, 8, 0, 0)
            };
            _btnApplyLv.Click += (s, e) =>
            {
                try
                {
                    var lvPos = ReadPlaceholderText(_tbLvPos);
                    var lvText = ReadPlaceholderText(_tbLvText);

                    if (string.IsNullOrWhiteSpace(lvPos) && string.IsNullOrWhiteSpace(lvText))
                    {
                        MessageBox.Show("Bitte LV-Position oder Kurztext eingeben.", "LV", MessageBoxButtons.OK, MessageBoxIcon.Information);
                        return;
                    }

                    var selectedHandles = _list?.SelectedItems
                        .Cast<ListViewItem>()
                        .Select(it => it.SubItems.Count > 4 ? it.SubItems[4].Text : "")
                        .Where(h => !string.IsNullOrWhiteSpace(h))
                        .ToArray();

                    if (selectedHandles == null || selectedHandles.Length == 0)
                        selectedHandles = null;

                    TakeoffStore.ApplyLvToHandles(selectedHandles, lvPos, lvText);
                    SafeRefreshTakeoff();
                }
                catch (Exception ex)
                {
                    MessageBox.Show(ex.ToString(), "LV Fehler", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            };
            top.Controls.Add(_btnApplyLv, 0, 2);

            var takeoffBtns = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 1,
                RowCount = 2,
                Margin = new Padding(0, 8, 0, 0)
            };
            takeoffBtns.RowStyles.Add(new RowStyle(SizeType.Percent, 50));
            takeoffBtns.RowStyles.Add(new RowStyle(SizeType.Percent, 50));

            _btnTakeoffSelection = new Button
            {
                Text = "Takeoff: Auswahl (PickFirst oder Auswahl)",
                Dock = DockStyle.Fill,
                Height = 34
            };
            _btnTakeoffSelection.Click += (s, e) =>
            {
                try
                {
                    TakeoffService.TakeoffFromSelection();
                    SafeRefreshTakeoff();
                }
                catch (Exception ex)
                {
                    MessageBox.Show(ex.ToString(), "Takeoff Fehler", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            };

            _btnTakeoffLayer = new Button
            {
                Text = "Takeoff: Layer",
                Dock = DockStyle.Fill,
                Height = 34
            };
            _btnTakeoffLayer.Click += (s, e) =>
            {
                try
                {
                    var layer = PromptDialogs.PromptLayerName("Layername für Takeoff:");
                    if (!string.IsNullOrWhiteSpace(layer))
                    {
                        TakeoffService.TakeoffFromLayer(layer);
                        SafeRefreshTakeoff();
                    }
                }
                catch (Exception ex)
                {
                    MessageBox.Show(ex.ToString(), "Takeoff Fehler", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            };

            takeoffBtns.Controls.Add(_btnTakeoffSelection, 0, 0);
            takeoffBtns.Controls.Add(_btnTakeoffLayer, 0, 1);
            top.Controls.Add(takeoffBtns, 0, 3);

            var exportCadBtns = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 1,
                RowCount = 2,
                Margin = new Padding(0, 8, 0, 0)
            };
            exportCadBtns.RowStyles.Add(new RowStyle(SizeType.Percent, 50));
            exportCadBtns.RowStyles.Add(new RowStyle(SizeType.Percent, 50));

            _btnExportCadJson = new Button
            {
                Text = "Export CAD: takeoff.json (1 Klick)",
                Dock = DockStyle.Fill,
                Height = 34
            };
            _btnExportCadJson.Click += (s, e) =>
            {
                try
                {
                    if (!TakeoffStore.Rows.Any())
                    {
                        MessageBox.Show("Keine Takeoff-Daten vorhanden.", "Export", MessageBoxButtons.OK, MessageBoxIcon.Information);
                        return;
                    }

                    var (jsonPath, csvPath) = GetCadExportPaths();
                    EnsureDir(Path.GetDirectoryName(jsonPath));

                    TakeoffStore.ExportJson(jsonPath);
                    MessageBox.Show($"Gespeichert:\n{jsonPath}", "Export CAD", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
                catch (Exception ex)
                {
                    MessageBox.Show(ex.ToString(), "Export CAD Fehler", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            };

            _btnExportCadCsv = new Button
            {
                Text = "Export CAD: takeoff.csv (1 Klick)",
                Dock = DockStyle.Fill,
                Height = 34
            };
            _btnExportCadCsv.Click += (s, e) =>
            {
                try
                {
                    if (!TakeoffStore.Rows.Any())
                    {
                        MessageBox.Show("Keine Takeoff-Daten vorhanden.", "Export", MessageBoxButtons.OK, MessageBoxIcon.Information);
                        return;
                    }

                    var (jsonPath, csvPath) = GetCadExportPaths();
                    EnsureDir(Path.GetDirectoryName(csvPath));

                    TakeoffStore.ExportCsv(csvPath);
                    MessageBox.Show($"Gespeichert:\n{csvPath}", "Export CAD", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
                catch (Exception ex)
                {
                    MessageBox.Show(ex.ToString(), "Export CAD Fehler", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            };

            exportCadBtns.Controls.Add(_btnExportCadJson, 0, 0);
            exportCadBtns.Controls.Add(_btnExportCadCsv, 0, 1);
            top.Controls.Add(exportCadBtns, 0, 4);

            // ✅ Snapshot button (BricsCAD -> snapshot.png)
            _btnSnapshotCadPng = new Button
            {
                Text = "Snapshot: snapshot.png (1 Klick)",
                Dock = DockStyle.Fill,
                Height = 36,
                Margin = new Padding(0, 8, 0, 0)
            };
            _btnSnapshotCadPng.Click += (s, e) =>
            {
                try
                {
                    var projectId = (_tbProjectId?.Text ?? "BA-2025-DEMO").Trim();
                    if (string.IsNullOrWhiteSpace(projectId)) projectId = "BA-2025-DEMO";

                    var outPath = GetSnapshotPath(projectId);
                    EnsureDir(Path.GetDirectoryName(outPath));

                    ExportSnapshotViaCommand(outPath);

                    MessageBox.Show(
                        "Snapshot wird erstellt.\n\n" +
                        $"Ziel:\n{outPath}\n\n" +
                        "Hinweis: Danach im CADViewer einfach neu laden (Cache-Busting ist aktiv).",
                        "Snapshot",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information
                    );
                }
                catch (Exception ex)
                {
                    MessageBox.Show(ex.ToString(), "Snapshot Fehler", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            };
            top.Controls.Add(_btnSnapshotCadPng, 0, 5);

            var saveAsBtns = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 1,
                RowCount = 2,
                Margin = new Padding(0, 8, 0, 0)
            };
            saveAsBtns.RowStyles.Add(new RowStyle(SizeType.Percent, 50));
            saveAsBtns.RowStyles.Add(new RowStyle(SizeType.Percent, 50));

            _btnExportJson = new Button
            {
                Text = "Export JSON (Save As)",
                Dock = DockStyle.Fill,
                Height = 34
            };
            _btnExportJson.Click += (s, e) =>
            {
                try
                {
                    if (!TakeoffStore.Rows.Any())
                    {
                        MessageBox.Show("Keine Takeoff-Daten vorhanden.", "Export", MessageBoxButtons.OK, MessageBoxIcon.Information);
                        return;
                    }

                    using (var sfd = new SaveFileDialog())
                    {
                        sfd.Filter = "JSON (*.json)|*.json";
                        sfd.FileName = $"takeoff_{DateTime.Now:yyyyMMdd_HHmmss}.json";
                        if (sfd.ShowDialog() == DialogResult.OK)
                        {
                            TakeoffStore.ExportJson(sfd.FileName);
                            MessageBox.Show($"Exportiert:\n{sfd.FileName}", "Export", MessageBoxButtons.OK, MessageBoxIcon.Information);
                        }
                    }
                }
                catch (Exception ex)
                {
                    MessageBox.Show(ex.ToString(), "Export Fehler", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            };

            _btnExportCsv = new Button
            {
                Text = "Export CSV (Save As)",
                Dock = DockStyle.Fill,
                Height = 34
            };
            _btnExportCsv.Click += (s, e) =>
            {
                try
                {
                    if (!TakeoffStore.Rows.Any())
                    {
                        MessageBox.Show("Keine Takeoff-Daten vorhanden.", "Export", MessageBoxButtons.OK, MessageBoxIcon.Information);
                        return;
                    }

                    using (var sfd = new SaveFileDialog())
                    {
                        sfd.Filter = "CSV (*.csv)|*.csv";
                        sfd.FileName = $"takeoff_{DateTime.Now:yyyyMMdd_HHmmss}.csv";
                        if (sfd.ShowDialog() == DialogResult.OK)
                        {
                            TakeoffStore.ExportCsv(sfd.FileName);
                            MessageBox.Show($"Exportiert:\n{sfd.FileName}", "Export", MessageBoxButtons.OK, MessageBoxIcon.Information);
                        }
                    }
                }
                catch (Exception ex)
                {
                    MessageBox.Show(ex.ToString(), "Export Fehler", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            };

            saveAsBtns.Controls.Add(_btnExportJson, 0, 0);
            saveAsBtns.Controls.Add(_btnExportCsv, 0, 1);
            top.Controls.Add(saveAsBtns, 0, 6);

            _btnClear = new Button
            {
                Text = "Clear Takeoff",
                Dock = DockStyle.Fill,
                Height = 34,
                Margin = new Padding(0, 8, 0, 0)
            };
            _btnClear.Click += (s, e) =>
            {
                TakeoffStore.Clear();
                SafeRefreshTakeoff();
            };
            top.Controls.Add(_btnClear, 0, 7);

            var listHost = new Panel { Dock = DockStyle.Fill, Padding = new Padding(0, 8, 0, 0) };
            root.Controls.Add(listHost, 0, 1);

            _list = new ListView
            {
                Dock = DockStyle.Fill,
                View = View.Details,
                FullRowSelect = true,
                HideSelection = false,
                GridLines = true
            };

            var img = new ImageList();
            img.ImageSize = new Size(1, 22);
            _list.SmallImageList = img;

            _list.Columns.Add("LV Pos", 90);
            _list.Columns.Add("Kurztext", 160);
            _list.Columns.Add("Typ", 90);
            _list.Columns.Add("Layer", 160);
            _list.Columns.Add("Handle", 90);
            _list.Columns.Add("Länge", 90);
            _list.Columns.Add("Fläche", 90);

            listHost.Controls.Add(_list);

            _takeoffUiInitialized = true;
            SafeRefreshTakeoff();
        }

        // =========================
        // PATHS
        // =========================
        private (string jsonPath, string csvPath) GetCadExportPaths()
        {
            var projectId = (_tbProjectId?.Text ?? "BA-2025-DEMO").Trim();
            if (string.IsNullOrWhiteSpace(projectId)) projectId = "BA-2025-DEMO";

            var bricscadDir = Path.Combine(PROJECTS_ROOT, projectId, "bricscad");
            var jsonPath = Path.Combine(bricscadDir, "takeoff.json");
            var csvPath = Path.Combine(bricscadDir, "takeoff.csv");

            return (jsonPath, csvPath);
        }

        private static string GetUtmExportPath(string projectId)
        {
            var bricscadDir = Path.Combine(PROJECTS_ROOT, projectId, "bricscad");
            return Path.Combine(bricscadDir, "utm.csv");
        }

        private static string GetSnapshotPath(string projectId)
        {
            var bricscadDir = Path.Combine(PROJECTS_ROOT, projectId, "bricscad");
            return Path.Combine(bricscadDir, "snapshot.png");
        }

        private static void EnsureDir(string dir)
        {
            if (string.IsNullOrWhiteSpace(dir)) return;
            if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
        }

        // =========================
        // SNAPSHOT (CAD -> PNG)
        // =========================
        private static void ExportSnapshotViaCommand(string pngPath)
        {
            var doc = BcadApp.DocumentManager.MdiActiveDocument;
            if (doc == null) throw new InvalidOperationException("Kein aktives Dokument.");

            // Make sure path is quoted; BricsCAD will ask minimal prompts depending on config.
            // PNGOUT typically: PNGOUT <filename>
            var cmd = "_.PNGOUT " + QuoteForCad(pngPath) + " ";

            // Send command to BricsCAD command line
            doc.SendStringToExecute(cmd, true, false, false);

            // Optional: message in command line
            try
            {
                doc.Editor.WriteMessage($"\n[RLC] Snapshot export (PNGOUT) -> {pngPath}\n");
            }
            catch { }
        }

        private static string QuoteForCad(string s)
        {
            if (string.IsNullOrWhiteSpace(s)) return "\"\"";
            // escape quotes for CAD commandline
            return "\"" + s.Replace("\"", "\\\"") + "\"";
        }

        // =========================
        // REFRESH LIST
        // =========================
        private void SafeRefreshTakeoff()
        {
            if (!_takeoffUiInitialized || _list == null) return;

            _list.BeginUpdate();
            try
            {
                _list.Items.Clear();

                foreach (var r in TakeoffStore.Rows)
                {
                    var it = new ListViewItem(r.LvPos ?? "");
                    it.SubItems.Add(r.LvText ?? "");
                    it.SubItems.Add(r.EntityType ?? "");
                    it.SubItems.Add(r.Layer ?? "");
                    it.SubItems.Add(r.Handle ?? "");
                    it.SubItems.Add(r.Length.ToString("0.###"));
                    it.SubItems.Add(r.Area.ToString("0.###"));
                    _list.Items.Add(it);
                }
            }
            finally
            {
                _list.EndUpdate();
            }

            try { _list.AutoResizeColumns(ColumnHeaderAutoResizeStyle.HeaderSize); } catch { }
        }

        // =========================
        // UTM EXPORT (CAD -> utm.csv)
        // =========================
        private static int ExportUtmFromDrawing(string layerName, string utmCsvPath)
        {
            var doc = BcadApp.DocumentManager.MdiActiveDocument;
            if (doc == null) throw new InvalidOperationException("Kein aktives Dokument.");

            var db = doc.Database;
            var ed = doc.Editor;

            int count = 0;
            int idx = 0;

            var sb = new StringBuilder();
            sb.AppendLine("id,easting,northing");

            using (var tr = db.TransactionManager.StartTransaction())
            {
                var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
                var ms = (BlockTableRecord)tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForRead);

                foreach (ObjectId id in ms)
                {
                    var ent = tr.GetObject(id, OpenMode.ForRead) as Entity;
                    if (ent == null) continue;

                    if (!string.Equals(ent.Layer, layerName, StringComparison.OrdinalIgnoreCase))
                        continue;

                    if (ent is DBPoint pt)
                    {
                        idx++;
                        var p = pt.Position;
                        var name = $"P_{idx}";
                        sb.AppendLine($"{EscapeCsv(name)},{p.X:0.###},{p.Y:0.###}");
                        count++;
                        continue;
                    }

                    if (ent is BlockReference br)
                    {
                        idx++;
                        var ins = br.Position;

                        string name = $"P_{idx}";
                        try
                        {
                            if (br.AttributeCollection != null && br.AttributeCollection.Count > 0)
                            {
                                foreach (ObjectId attId in br.AttributeCollection)
                                {
                                    var att = tr.GetObject(attId, OpenMode.ForRead) as AttributeReference;
                                    if (att == null) continue;

                                    var val = (att.TextString ?? "").Trim();
                                    if (!string.IsNullOrWhiteSpace(val))
                                    {
                                        name = val;
                                        break;
                                    }
                                }
                            }
                        }
                        catch
                        {
                            // ignore
                        }

                        sb.AppendLine($"{EscapeCsv(name)},{ins.X:0.###},{ins.Y:0.###}");
                        count++;
                        continue;
                    }
                }

                tr.Commit();
            }

            if (count > 0)
            {
                File.WriteAllText(utmCsvPath, sb.ToString(), Encoding.UTF8);
                ed.WriteMessage($"\n[RLC] UTM export -> {utmCsvPath} ({count} Punkte)\n");
            }

            return count;
        }

        private static string EscapeCsv(string s)
        {
            s = (s ?? "").Replace("\r", " ").Replace("\n", " ").Trim();
            if (s.Contains(",") || s.Contains("\""))
                return "\"" + s.Replace("\"", "\"\"") + "\"";
            return s;
        }

        private static void ApplyPlaceholder(TextBox tb, string placeholder)
        {
            if (tb == null) return;

            tb.Tag = placeholder ?? "";
            tb.ForeColor = Color.Gray;
            tb.Text = placeholder ?? "";

            tb.GotFocus += (s, e) =>
            {
                if (tb.ForeColor == Color.Gray && tb.Text == (string)tb.Tag)
                {
                    tb.Text = "";
                    tb.ForeColor = SystemColors.WindowText;
                }
            };

            tb.LostFocus += (s, e) =>
            {
                if (string.IsNullOrWhiteSpace(tb.Text))
                {
                    tb.ForeColor = Color.Gray;
                    tb.Text = (string)tb.Tag;
                }
            };
        }

        private static string ReadPlaceholderText(TextBox tb)
        {
            if (tb == null) return "";
            var placeholder = tb.Tag as string;

            if (tb.ForeColor == Color.Gray && tb.Text == (placeholder ?? ""))
                return "";

            return (tb.Text ?? "").Trim();
        }
    }

    internal static class PromptDialogs
    {
        public static string PromptLayerName(string title)
        {
            using (var f = new Form())
            {
                f.Text = title;
                f.Width = 420;
                f.Height = 140;
                f.FormBorderStyle = FormBorderStyle.FixedDialog;
                f.StartPosition = FormStartPosition.CenterScreen;
                f.MaximizeBox = false;
                f.MinimizeBox = false;

                var tb = new TextBox { Left = 12, Top = 12, Width = 380 };
                var ok = new Button { Text = "OK", Left = 232, Width = 75, Top = 45, DialogResult = DialogResult.OK };
                var cancel = new Button { Text = "Abbrechen", Left = 317, Width = 75, Top = 45, DialogResult = DialogResult.Cancel };

                f.Controls.Add(tb);
                f.Controls.Add(ok);
                f.Controls.Add(cancel);

                f.AcceptButton = ok;
                f.CancelButton = cancel;

                return f.ShowDialog() == DialogResult.OK ? tb.Text?.Trim() : null;
            }
        }
    }
}
