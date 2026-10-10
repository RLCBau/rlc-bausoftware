/** Contractual contradiction filter applied after advisory family matching. */
export function familyContradictions(shortText:string,longText:string,family:string):string[]{
 const text=(shortText+' '+longText).toLocaleLowerCase('de-DE');
 const name=family.toLocaleLowerCase('de-DE');
 const issues:string[]=[];
 if(/asphalt|\bac\s*\d+\s*(?:td|d|t)\b|bitumin/.test(text)&&/ohne.bindemittel/.test(name))issues.push('bound_asphalt_mapped_to_unbound_layer');
 if(/schachtwand|fertigteil.schacht|schacht\s+herstellen/.test(text)&&/steigeisen/.test(name)&&!/steigeisen/.test(text))issues.push('shaft_construction_mapped_to_steps');
 if(/beleuchtung|leuchte|lichtmast/.test(text)&&/leistenstein|bordstein|pflaster/.test(name))issues.push('lighting_mapped_to_road_stone');
 if(/kabelschutzrohr/.test(text)&&/passschnitt/.test(name)&&!/passschnitt|schnitt|kürzen|kuerzen/.test(text))issues.push('whole_pipe_mapped_to_cut');
 if(/einbauen|wiedereinbau/.test(text)&&/belasteter.boden/.test(name)&&!/belastet|kontamin|schadstoff/.test(text))issues.push('contamination_unproven');
 if(/ausbauen|abtragen|abbrechen|entsorgen/.test(text)&&/wiedereinbau|wieder[ -]?einbauen/.test(name)&&!/wiedereinbau|wiederverwend|erneut einbau/.test(text))issues.push('removal_mapped_to_reinstallation');
 if(/erstbefüllung|befüllung.*netz/.test(text)&&/isybau|dokumentation/.test(name)&&!/dokumentation|isybau/.test(text))issues.push('network_filling_mapped_to_documentation');
 if(/\blwl\b|lichtwellenleiter|glasfaser/.test(text)&&/einziehen|kabelzug|\bziehen\b/.test(text)&&/muffenschrank|kabelschrank|verteilerschrank|außengehäuse|aussengehaeuse/.test(name)&&!/schrank|gehäuse|gehaeuse/.test(text))issues.push('fibre_cable_pulling_mapped_to_cabinet');
 if(/(?:verkehrsschild|verkehrstafel|warneinr|absperr)/.test(shortText.toLocaleLowerCase('de-DE'))&&/\bvorhalten\b/.test(shortText.toLocaleLowerCase('de-DE'))&&/montieren|fundament|pfosten setzen|erstaufbau|neuaufbau/.test(name)&&!/montieren|aufbauen|fundament|setzen/.test(text))issues.push('traffic_hire_mapped_to_installation');
 if(/schutzplanke|\bse\b/.test(text)&&/abbauen|rückbau|entsorgen/.test(text)&&/pfosten setzen|holme montieren|rammgerät|neumontage/.test(name)&&!/neu montieren|wiedereinbau/.test(text))issues.push('barrier_removal_mapped_to_installation');
 if(/abwasserkanal|schmutzwasserkanal|rohrleitung/.test(text)&&/reinigen|hochdruckstrahl/.test(text)&&/dichtheitsprüfung|druckprüfung|prüfprotokoll/.test(name)&&!/dichtheit|druckprüfung|prüfprotokoll/.test(text))issues.push('sewer_cleaning_mapped_to_testing');
 return issues;
}
