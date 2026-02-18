// Services/RlcApiClient.cs
using System;
using System.Net.Http;

namespace RLC.BricsCAD.Plugin.Services
{
  public class RlcApiClient
  {
    private readonly string _baseUrl;

    public RlcApiClient(string baseUrl)
    {
      _baseUrl = baseUrl ?? "";
    }

    public ApiStatus Ping()
    {
      var st = new ApiStatus();
      st.ok = true;
      st.message = "Ping OK (placeholder). BaseUrl=" + _baseUrl;
      return st;
    }

    public string GetBaseUrl()
    {
      return _baseUrl;
    }
  }
}
