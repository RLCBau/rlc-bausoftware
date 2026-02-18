using Bricscad.Windows;

namespace RLC.BricsCAD.Plugin.UI
{
    public static class RlcPalette
    {
        private static PaletteSet _ps;
        private static RlcPaletteControl _ctrl;

        public static void ShowOrFocus(string selectTab = null)
        {
            if (_ps == null)
            {
                _ps = new PaletteSet("RLC PANEL");
                _ps.Style =
                    PaletteSetStyles.ShowCloseButton |
                    PaletteSetStyles.ShowAutoHideButton |
                    PaletteSetStyles.ShowPropertiesMenu;

                _ps.DockEnabled = DockSides.Left | DockSides.Right;

                _ctrl = new RlcPaletteControl();
                _ps.Add("RLC", _ctrl);

                _ps.MinimumSize = new System.Drawing.Size(320, 400);
            }

            _ps.Visible = true;
            _ps.Activate(0);

            if (!string.IsNullOrWhiteSpace(selectTab))
                _ctrl.SelectTabByName(selectTab);
        }
    }
}
