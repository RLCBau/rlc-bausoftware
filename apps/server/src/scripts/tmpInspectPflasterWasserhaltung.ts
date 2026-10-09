import { prisma } from "../lib/prisma";
const terms=[
"Pflasterdecke aus Betonpflastersteinen aus- u. einbauen",
"Pflasterdecke aus Naturpflaster- steinen ausbauen",
"Streifen/Rinne/ Mulde Natur.ausbauen, 1 Z. Granit",
"Zulage Bordsteine, Rinnen",
"Winkelrahmen für Gitterrost HT 1",
"Anpassen Zufahrten",
"Herstellen von Ecken im Leistenstein",
"Dehnungsfuge in Granitgroßstein 1- Zeiler",
"Zulage Absenkung",
"Pflasterdecken-Anpassung herstellen Einzelgr. b 0,5m2",
"Verfugung Granitbelag mit Epoxydharz",
"Pumpe mit Elektromotor ein- und ausbauen in Pumpensümpfe",
"Wasserhaltungskosten 1001-2000 l/min DN 200 - 250 mm",
"Mobile Absetzanlage aufstellen",
"Pumpe Zubehör 2-4kW",
"Wasserhaltung herst., betr., vorh., abbauen",
"Verrechnungssätze f. Unterwasserpumpe",
"Herstellen von Überleitungen",
"Pumpeneinsatz 20 l/s",
"Wasserhaltung SW-Kanal",
"Blasen setzen (SK) DN 100 - 200 mm",
"Auf- und Abbau der Abflusslenkung bis 30 l/sek"
];
(async()=>{for(const t of terms){const v=await prisma.lVPosition.findFirst({where:{kurztext:{contains:t,mode:"insensitive"}}});console.log("\n###",t,"|",v?.position,v?.einheit,v?.kurztext);console.log(String(v?.langtext||"").replace(/\s+/g," ").slice(0,1500));}await prisma.$disconnect()})();