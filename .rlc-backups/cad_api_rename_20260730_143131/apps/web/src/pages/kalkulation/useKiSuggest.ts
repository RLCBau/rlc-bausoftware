import { useState } from "react";

type SuggestResult = { unitPrice:number; confidence:number };

export function useKiSuggest(){
  const [loading,setLoading]=useState(false);
  const mode = import.meta.env.VITE_KI_MODE || "mock";

  async function suggest(text:string,unit:string):Promise<SuggestResult>{
    setLoading(true);
    try{
      if(mode==="openai"){
        const res=await fetch("/api/openai/kalkulation",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text,unit})});
        return await res.json();
      }else{
        const base=Math.random()*80;
        const factor=text.includes("Rohr")?2.2:1.5;
        return { unitPrice:+(base*factor).toFixed(2), confidence:+(0.6+Math.random()*0.4).toFixed(2)};
      }
    }finally{setLoading(false);}
  }

  return { suggest, loading };
}
