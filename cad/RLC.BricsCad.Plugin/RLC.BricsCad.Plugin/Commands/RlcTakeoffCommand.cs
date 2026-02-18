using Teigha.Runtime;
using RLC.BricsCAD.Plugin.UI;

namespace RLC.BricsCAD.Plugin.Commands
{
    public class RlcTakeoffCommand
    {
        [CommandMethod("RLC_TAKEOFF")]
        public void Run()
        {
            // apre panel e resta lì; le azioni le fai dai bottoni del tab Takeoff
            RlcPalette.ShowOrFocus(selectTab: "Takeoff");
        }
    }
}
