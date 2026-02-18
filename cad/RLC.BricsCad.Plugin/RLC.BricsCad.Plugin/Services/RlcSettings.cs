// RLC.BricsCAD.Plugin/Services/RlcSettings.cs
namespace RLC.BricsCAD.Plugin.Services
{
    public class RlcSettings
    {
        // Path server projects root (come vuoi tu: C:\RLC\rlc-app\apps\server\data\projects)
        public string ProjectsRoot { get; set; } = @"C:\RLC\rlc-app\apps\server\data\projects";

        // Default ProjectId comodo
        public string DefaultProjectId { get; set; } = "BA-2025-DEMO";
    }
}
