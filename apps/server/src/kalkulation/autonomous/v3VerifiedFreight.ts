/** Supplier-specific freight scenario, extracted from Schmid Kies 2026 price list. */
export function schmidSplitt25Delivered(distanceKm:number,tonsPerDelivery:number){
 const source='https://www.kieswerk-schmid.de/Schmid-Kies-Preisliste-2026-02.pdf';
 if(!Number.isFinite(distanceKm)||distanceKm<0||!Number.isFinite(tonsPerDelivery)||tonsPerDelivery<=0)return {status:'needs_review',source,reason:['invalid_transport_conditions']};
 if(tonsPerDelivery<=12)return {status:'needs_review',source,reason:['small_delivery_requires_zone_flat_fee'],note:'Below/at 12 tonnes: distance-dependent lump-sum delivery. Do not apply bulk price.'};
 const exWorks=25;
 const freight=5+Math.max(0,distanceKm-10)*0.3;
 return {status:'reference_only',source,priceEURPerT:Math.round((exWorks+freight)*100)/100,freightEURPerT:Math.round(freight*100)/100,materialEURPerT:exWorks,reason:[],conditions:'Schmid, quantity >12 t, truck delivered, toll extra when applicable, VAT excluded'};
}
