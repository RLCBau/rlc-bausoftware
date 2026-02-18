using System;

namespace RLC.BricsCAD.Plugin.Services
{
    public class TakeoffRow
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public DateTime CreatedAt { get; set; } = DateTime.Now;

        public string Layer { get; set; } = "";
        public string EntityType { get; set; } = ""; // Line, Polyline, Arc, Circle...
        public int Count { get; set; } = 0;
        public double TotalLength { get; set; } = 0;

        public string LvPosition { get; set; } = ""; // opzionale
        public string Note { get; set; } = "";
    }
}
