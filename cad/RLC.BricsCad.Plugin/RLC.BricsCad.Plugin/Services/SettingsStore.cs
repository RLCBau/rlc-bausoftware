// RLC.BricsCAD.Plugin/Services/SettingsStore.cs
using System;
using System.IO;
using System.Runtime.Serialization.Json;
using System.Text;

namespace RLC.BricsCAD.Plugin.Services
{
    public static class SettingsStore
    {
        private static readonly object _lock = new object();
        private static RlcSettings _settings;

        // ✅ File in AppData (stabile, no permessi admin)
        private static string SettingsDir =>
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "RLC", "BricsCAD");

        private static string SettingsPath =>
            Path.Combine(SettingsDir, "settings.json");

        /// <summary>
        /// ✅ Compat: UI vecchia usa SettingsStore.Settings
        /// </summary>
        public static RlcSettings Settings
        {
            get
            {
                lock (_lock)
                {
                    if (_settings == null)
                        _settings = LoadInternal() ?? new RlcSettings();
                    return _settings;
                }
            }
        }

        /// <summary>
        /// Carica settings dal file (se esiste), altrimenti default.
        /// </summary>
        public static RlcSettings Load()
        {
            lock (_lock)
            {
                _settings = LoadInternal() ?? new RlcSettings();
                return _settings;
            }
        }

        /// <summary>
        /// Salva i settings passati e li rende anche correnti.
        /// </summary>
        public static void Save(RlcSettings settings)
        {
            if (settings == null) settings = new RlcSettings();

            lock (_lock)
            {
                _settings = settings;
                SaveInternal(_settings);
            }
        }

        /// <summary>
        /// ✅ Compat: UI vecchia chiama Save() senza parametro
        /// </summary>
        public static void Save()
        {
            lock (_lock)
            {
                if (_settings == null)
                    _settings = LoadInternal() ?? new RlcSettings();

                SaveInternal(_settings);
            }
        }

        // ----------------- Internal -----------------

        private static RlcSettings LoadInternal()
        {
            try
            {
                if (!File.Exists(SettingsPath))
                    return null;

                var json = File.ReadAllText(SettingsPath, Encoding.UTF8);
                if (string.IsNullOrWhiteSpace(json))
                    return null;

                return Deserialize<RlcSettings>(json);
            }
            catch
            {
                // Se il JSON è corrotto non bloccare il plugin
                return null;
            }
        }

        private static void SaveInternal(RlcSettings settings)
        {
            Directory.CreateDirectory(SettingsDir);

            var json = Serialize(settings);
            File.WriteAllText(SettingsPath, json, Encoding.UTF8);
        }

        private static string Serialize<T>(T obj)
        {
            using (var ms = new MemoryStream())
            {
                var ser = new DataContractJsonSerializer(typeof(T));
                ser.WriteObject(ms, obj);
                return Encoding.UTF8.GetString(ms.ToArray());
            }
        }

        private static T Deserialize<T>(string json)
        {
            using (var ms = new MemoryStream(Encoding.UTF8.GetBytes(json)))
            {
                var ser = new DataContractJsonSerializer(typeof(T));
                return (T)ser.ReadObject(ms);
            }
        }
    }
}
