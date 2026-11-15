import { toFacelets, type CubeState } from "@moishy/cubing-core";
const palette:Record<string,string>={U:"#f1f5f9",R:"#e84650",F:"#10b981",D:"#facc15",L:"#fb923c",B:"#4e8cf6"};
export default function FaceletNet({state,title}:{state:CubeState|null;title:string}) {
  const faces=state?toFacelets(state):"";
  const tiles=(index:number)=><div className="facelet-grid">{Array.from({length:9},(_,j)=><span key={j} className="facelet" style={{background:palette[faces[index*9+j]]||"#283444"}}/>)}</div>;
  return <div className="net-wrap">
    <div className="eyebrow muted">{title}</div>
    <div className="net-grid">
      {([null,"U",null,null,"L","F","R","B",null,"D",null,null] as (string|null)[]).map((f,i)=><div className="net-cell" key={i}>{f? <><small>{f}</small>{tiles("URFDLB".indexOf(f))}</>:null}</div>)}
    </div>
  </div>;
}
