using System;
using Teigha.Runtime;
using Bricscad.ApplicationServices;

// Registrazione comandi (UNA SOLA VOLTA, QUI)
[assembly: CommandClass(typeof(RLC.BricsCAD.Plugin.Commands.RlcLinkCommand))]
[assembly: CommandClass(typeof(RLC.BricsCAD.Plugin.Commands.RlcPanelCommand))]
[assembly: CommandClass(typeof(RLC.BricsCAD.Plugin.Commands.RlcTakeoffCommand))]
[assembly: CommandClass(typeof(RLC.BricsCAD.Plugin.Commands.RlcImportUtmCommand))]
[assembly: CommandClass(typeof(RLC.BricsCAD.Plugin.Commands.RlcExportUtmCommand))]

// Autoload lifecycle (per eseguire codice all’avvio)
[assembly: ExtensionApplication(typeof(RLC.BricsCAD.Plugin.PluginEntry))]

namespace RLC.BricsCAD.Plugin
{
    public class PluginEntry : IExtensionApplication
    {
        private static bool _opened;

        public void Initialize()
        {
            // Non aprire due volte
            _opened = false;

            // Aspetta che BricsCAD sia pronto
            try { Application.Idle += OnIdle; } catch { }

            // Se apri/attivi un DWG, riprova (utile quando BricsCAD parte “vuoto”)
            try { Application.DocumentManager.DocumentActivated += OnDocActivated; } catch { }
        }

        public void Terminate()
        {
            try { Application.Idle -= OnIdle; } catch { }
            try { Application.DocumentManager.DocumentActivated -= OnDocActivated; } catch { }
        }

        private static void OnIdle(object sender, EventArgs e)
        {
            // Lo usiamo una volta
            try { Application.Idle -= OnIdle; } catch { }
            TryOpenPanel();
        }

        private static void OnDocActivated(object sender, DocumentCollectionEventArgs e)
        {
            TryOpenPanel();
        }

        private static void TryOpenPanel()
        {
            if (_opened) return;

            try
            {
                var doc = Application.DocumentManager?.MdiActiveDocument;
                if (doc == null) return;

                _opened = true;

                // Apri la palette tramite il comando registrato
                doc.SendStringToExecute("RLC_PANEL ", true, false, false);
            }
            catch
            {
                _opened = false;
            }
        }
    }
}
