// Services/Dtos.cs
namespace RLC.BricsCAD.Plugin.Services
{
  public class ApiStatus
  {
    public bool ok;
    public string message;

    public ApiStatus()
    {
      ok = false;
      message = "";
    }
  }
}
