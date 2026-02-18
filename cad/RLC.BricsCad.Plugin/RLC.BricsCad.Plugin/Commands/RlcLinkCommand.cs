using Teigha.Runtime;
using BcadApp = Bricscad.ApplicationServices.Application;

namespace RLC.BricsCAD.Plugin.Commands
{
    public class RlcLinkCommand
    {
        [CommandMethod("RLC_LINK")]
        public void Run()
        {
            BcadApp.ShowAlertDialog("RLC_LINK: OK");
        }
    }
}
