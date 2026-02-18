// Services/XDataUtil.cs
using Teigha.DatabaseServices;

namespace RLC.BricsCAD.Plugin.Services
{
  public static class XDataUtil
  {
    public static void EnsureRegApp(Transaction tr, Database db, string appName)
    {
      RegAppTable rat = (RegAppTable)tr.GetObject(db.RegAppTableId, OpenMode.ForRead);
      if (!rat.Has(appName))
      {
        rat.UpgradeOpen();
        RegAppTableRecord r = new RegAppTableRecord();
        r.Name = appName;
        rat.Add(r);
        tr.AddNewlyCreatedDBObject(r, true);
      }
    }

    public static void SetStringXData(Transaction tr, Database db, Entity ent, string appName, string value)
    {
      EnsureRegApp(tr, db, appName);

      ResultBuffer rb = new ResultBuffer(
        new TypedValue((int)DxfCode.ExtendedDataRegAppName, appName),
        new TypedValue((int)DxfCode.ExtendedDataAsciiString, value)
      );

      ent.XData = rb;
    }

    public static string GetStringXData(Entity ent, string appName)
    {
      ResultBuffer rb = ent.GetXDataForApplication(appName);
      if (rb == null) return null;

      foreach (TypedValue tv in rb)
      {
        if (tv.TypeCode == (int)DxfCode.ExtendedDataAsciiString)
          return tv.Value as string;
      }

      return null;
    }
  }
}
