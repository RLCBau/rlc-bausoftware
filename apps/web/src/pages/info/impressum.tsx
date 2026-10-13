import React from "react";
import {Link} from "react-router-dom";
import "./infoProfessional.css";
export default function Impressum(){
return <main className="rlc-info-pro rlc-info-impressum">
<header className="rlc-page-hero"><div className="rlc-page-hero__eyebrow">RLC Bausoftware · Rechtliches</div><h1>Impressum</h1><p>Anbieterkennzeichnung und rechtliche Kontaktinformationen.</p></header>
<div className="rlc-info-legal-grid">
<section className="card"><h2>Anbieter</h2><dl className="rlc-info-legal-list"><dt>Bezeichnung</dt><dd>RLC Bausoftware</dd><dt>Inhaber</dt><dd>Roberto Lo Curto</dd><dt>E-Mail</dt><dd><a href="mailto:info@rlcbausoftware.com">info@rlcbausoftware.com</a></dd><dt>Postanschrift</dt><dd className="rlc-info-pending">Noch zu ergänzen und zu prüfen</dd><dt>USt-IdNr. / Registerangaben</dt><dd className="rlc-info-pending">Soweit anwendbar, noch zu prüfen und zu ergänzen</dd></dl></section>
<section className="card"><h2>Kontakt & rechtliche Hinweise</h2><p>Für technische Fragen und Rückmeldungen nutzen Sie den integrierten Support. Für rechtliche Anfragen verwenden Sie die angegebene Kontaktadresse.</p><div className="rlc-page-toolbar"><Link className="btn" to="/info/support">Support & Feedback</Link><Link className="btn" to="/info/datenschutz">Datenschutz</Link></div><h3>Prüfstatus</h3><p className="rlc-info-warning">Die Anbieterkennzeichnung ist noch nicht vollständig. Vor rechtskonformer öffentlicher Veröffentlichung sind insbesondere die ladungsfähige Anschrift und eventuell weitere anwendbare Pflichtangaben rechtlich zu prüfen und zu ergänzen.</p></section>
</div></main>;
}
