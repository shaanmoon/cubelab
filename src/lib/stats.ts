import type { Mode } from "./engine";
export type Attempt = {
  id:string; date:string; caseId:string; caseLabel:string; mode:Mode|"SOLVE";
  finished:boolean; milliseconds:number; recognitionMs:number;
  moveCount:number; referenceMoves:number; moves:string[];
};
const KEY="cubelab-v2-attempts";
const PREVIOUS="cube-lab-solves-v1";
export const loadAttempts=():Attempt[]=>{
  try {
    const now=JSON.parse(localStorage.getItem(KEY)||"null");
    if(Array.isArray(now))return now;
    const old=JSON.parse(localStorage.getItem(PREVIOUS)||"[]");
    return Array.isArray(old)?old.map((x:Record<string,unknown>)=>({
      ...x, finished:true, recognitionMs:0,referenceMoves:0,moves:[]
    } as unknown as Attempt)):[];
  }catch{return []}
};
export const persist=(items:Attempt[])=>{try{localStorage.setItem(KEY,JSON.stringify(items))}catch{/* storage unavailable */}};
export const fmt=(ms:number|null|undefined)=>ms==null||!Number.isFinite(ms)?"—":`${Math.floor(ms/60000).toString().padStart(2,"0")}:${(Math.floor(ms/1000)%60).toString().padStart(2,"0")}.${Math.floor(ms%1000).toString().padStart(3,"0")}`;
export const avg=(numbers:number[])=>numbers.length?numbers.reduce((a,b)=>a+b,0)/numbers.length:null;
export function wcaAverage(records:Attempt[],count:5|12):number|null {
  const recent=records.filter(x=>x.finished).slice(0,count);
  if(recent.length<count)return null;
  const ordered=recent.map(x=>x.milliseconds).sort((a,b)=>a-b);
  return avg(ordered.slice(1,-1));
}
export const tps=(a:Attempt)=>a.milliseconds>0?a.moveCount*1000/a.milliseconds:null;
export const efficiency=(a:Attempt)=>a.moveCount&&a.referenceMoves?a.referenceMoves/a.moveCount:null;
// Reference agreement is diagnostic, not "accuracy": an alternate valid solution can differ.
export function referenceAgreement(observed:string[],expected:string[]):number|null {
  if(!expected.length)return null;
  let common=0;
  for(let i=0;i<Math.min(observed.length,expected.length);i++)if(observed[i]===expected[i])common++;
  return common/Math.max(observed.length,expected.length);
}
export function exportCSV(records:Attempt[]):string {
  const escape=(s:string)=>`"${s.replaceAll('"','""')}"`;
  return ["date,mode,case,finished,time_ms,recognition_ms,moves,reference_moves,tps,efficiency",...records.map(a=>
    [a.date,a.mode,escape(a.caseLabel),a.finished,a.milliseconds.toFixed(0),a.recognitionMs.toFixed(0),a.moveCount,a.referenceMoves,tps(a)?.toFixed(3)||"",efficiency(a)?.toFixed(3)||""].join(",")
  )].join("\n");
}
