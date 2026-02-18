using Teigha.Runtime;
using RLC.BricsCAD.Plugin.UI;

namespace RLC.BricsCAD.Plugin.Commands
{
    public class RlcPanelCommand
    {
        [CommandMethod("RLC_PANEL")]
        public void Run()
        {
            RlcPalette.ShowOrFocus();
        }
    }
}
