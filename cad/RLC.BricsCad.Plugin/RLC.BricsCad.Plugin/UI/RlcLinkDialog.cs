// RLC.BricsCAD.Plugin/UI/RlcLinkDialog.cs
using System;
using System.Drawing;
using System.Reflection;
using System.Windows.Forms;
using RLC.BricsCAD.Plugin.Services;

namespace RLC.BricsCAD.Plugin.UI
{
    public class RlcLinkDialog : Form
    {
        private TextBox _tbApiBaseUrl;
        private TextBox _tbProjectId;
        private Button _btnOk;
        private Button _btnCancel;

        public RlcSettings ResultSettings { get; private set; }

        public RlcLinkDialog()
        {
            Text = "RLC Link";
            Width = 520;
            Height = 220;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            StartPosition = FormStartPosition.CenterScreen;
            MaximizeBox = false;
            MinimizeBox = false;

            BuildUi();
            LoadFromStore();
        }

        private void BuildUi()
        {
            var panel = new Panel { Dock = DockStyle.Fill, Padding = new Padding(12) };
            Controls.Add(panel);

            var grid = new TableLayoutPanel
            {
                Dock = DockStyle.Top,
                ColumnCount = 2,
                RowCount = 2,
                Height = 80
            };
            grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 140));
            grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

            var lblApi = new Label
            {
                Text = "API Base URL",
                Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleLeft
            };
            _tbApiBaseUrl = new TextBox { Dock = DockStyle.Fill };

            var lblProject = new Label
            {
                Text = "ProjectId",
                Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleLeft
            };
            _tbProjectId = new TextBox { Dock = DockStyle.Fill };

            grid.Controls.Add(lblApi, 0, 0);
            grid.Controls.Add(_tbApiBaseUrl, 1, 0);
            grid.Controls.Add(lblProject, 0, 1);
            grid.Controls.Add(_tbProjectId, 1, 1);

            panel.Controls.Add(grid);

            var btnPanel = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom,
                FlowDirection = FlowDirection.RightToLeft,
                Height = 42
            };
            panel.Controls.Add(btnPanel);

            _btnOk = new Button { Text = "OK", Width = 90, Height = 28 };
            _btnCancel = new Button { Text = "Abbrechen", Width = 90, Height = 28 };

            _btnOk.Click += (s, e) => OnOk();
            _btnCancel.Click += (s, e) => { DialogResult = DialogResult.Cancel; Close(); };

            btnPanel.Controls.Add(_btnOk);
            btnPanel.Controls.Add(_btnCancel);

            AcceptButton = _btnOk;
            CancelButton = _btnCancel;
        }

        private void LoadFromStore()
        {
            var s = SettingsStore.Settings ?? new RlcSettings();

            // ✅ Il tuo RlcSettings sembra avere ApiBaseUrlUrl (non ApiBaseUrl)
            _tbApiBaseUrl.Text = GetStringProp(s, "ApiBaseUrlUrl", "ApiBaseUrl", "ApiUrl", "BaseUrl");
            _tbProjectId.Text = GetStringProp(s, "ProjectId", "ProjektId", "Project", "Projekt");
        }

        private void OnOk()
        {
            var api = (_tbApiBaseUrl.Text ?? "").Trim();
            var projectId = (_tbProjectId.Text ?? "").Trim();

            if (string.IsNullOrWhiteSpace(api))
            {
                MessageBox.Show("Bitte API Base URL eingeben.", "RLC", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            var s = SettingsStore.Settings ?? new RlcSettings();

            // ✅ set con fallback ai nomi reali
            SetStringProp(s, api, "ApiBaseUrlUrl", "ApiBaseUrl", "ApiUrl", "BaseUrl");
            SetStringProp(s, projectId, "ProjectId", "ProjektId");

            SettingsStore.Save(s);

            ResultSettings = s;
            DialogResult = DialogResult.OK;
            Close();
        }

        // ----------------- Reflection helpers -----------------

        private static string GetStringProp(object obj, params string[] names)
        {
            if (obj == null) return "";
            var t = obj.GetType();

            foreach (var n in names)
            {
                var p = t.GetProperty(n, BindingFlags.Public | BindingFlags.Instance);
                if (p != null && p.PropertyType == typeof(string))
                {
                    var v = p.GetValue(obj) as string;
                    return (v ?? "").Trim();
                }
            }

            return "";
        }

        private static void SetStringProp(object obj, string value, params string[] names)
        {
            if (obj == null) return;
            var t = obj.GetType();

            foreach (var n in names)
            {
                var p = t.GetProperty(n, BindingFlags.Public | BindingFlags.Instance);
                if (p != null && p.PropertyType == typeof(string) && p.CanWrite)
                {
                    p.SetValue(obj, value ?? "");
                    return;
                }
            }
        }
    }
}
