import fs from "fs";
import path from "path";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

export async function analyzeDefectLocalFile(localPath: string) {
  if (!OPENAI_API_KEY) {
    return { title: "Beschädigte Kante", desc: "Ausbruch/Kante (Fallback).", cat: "Straßenbau", prio: "hoch", lv: "ERD-1001" };
  }
  const abspath = path.resolve(localPath);
  const b64 = fs.readFileSync(abspath).toString("base64");

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Du bist Bauleiter-Assistent. Antworte NUR JSON." },
        {
          role: "user",
          content: [
            { type: "text", text: `Analysiere das Bild und liefere:
{ "title": string, "desc": string, "cat": "Erdarbeiten|Leitungen|Asphalt|Hochbau|Allgemein", "prio": "niedrig|mittel|hoch|kritisch", "lv": string }` },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } }
          ]
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2
    })
  });

  if (!resp.ok) throw new Error(await resp.text());
  const data = await resp.json();
  let obj: any = {};
  try { obj = JSON.parse(data.choices?.[0]?.message?.content || "{}"); } catch {}
  return {
    title: obj.title || "Mangel",
    desc: obj.desc || "",
    cat: obj.cat || "Allgemein",
    prio: (["niedrig","mittel","hoch","kritisch"].includes(obj.prio) ? obj.prio : "mittel"),
    lv: typeof obj.lv === "string" ? obj.lv : ""
  };
}
