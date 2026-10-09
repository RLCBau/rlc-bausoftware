import { prisma } from "../lib/prisma";
const terms=[
"Verf. von Rohrl. herstellen",
"Schicht ohne Bindemittel aufnehmen FSS",
"Sandbettung- und -überdeckung für Rohre DN 100",
"Anpassung Frostschutzschicht, Zufahrten",
"Haufwerke herstellen",
"Sand Einbettung Kabel einbauen verdichten D 30-50cm",
"Pflasterdecke aus Betonpflaster- steinen ausbauen",
"Pflasterdecke aus Naturpflaster- steinen ausbauen",
"Streifen/Rinne/ Mulde 2-zeilig aus Natur- steinen ausbauen",
"Betonpflasterbelag aufnehmen, zwischenlagern",
"Betonkeil Pflasterbelag abbrechen",
"Äussere Reihe Zufahrtspflaster auf Einkornbeton",
"Zulage zu SoB herstellen an Zaun",
"Mehraufwendungen für Ableitung Schmutzwasser im BA 01",
"Wasserhaltung bis 100 cm über RS",
"Rohrleitung einbinden PE DA 110",
"Probebetrieb durchführen",
"Zulage Wasserhaltungsanlage Ableitung"
];
(async()=>{for(const t of terms){const v=await prisma.lVPosition.findFirst({where:{kurztext:{contains:t,mode:"insensitive"}}});console.log("\n###",t,"|",v?.position,v?.einheit,v?.kurztext);console.log(String(v?.langtext||"").replace(/\s+/g," ").slice(0,1500));}await prisma.$disconnect()})();