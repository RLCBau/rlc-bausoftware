// Services/GeometryUtil.cs
using Teigha.Geometry;

namespace RLC.BricsCAD.Plugin.Services
{
  public static class GeometryUtil
  {
    public static double Distance2D(Point3d a, Point3d b)
    {
      double dx = a.X - b.X;
      double dy = a.Y - b.Y;
      return System.Math.Sqrt(dx * dx + dy * dy);
    }
  }
}

