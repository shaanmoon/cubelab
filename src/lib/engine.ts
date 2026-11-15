import { pll } from "@moishy/algsets/pll";
import { oll } from "@moishy/algsets/oll";
import { f2lBySlot } from "@moishy/algsets/f2l";
import { advancedF2lBySlot } from "@moishy/algsets/advanced-f2l";
import { f2lSlotLookups } from "@moishy/steps";
import {
  solvedCube, applyAlg, isSolved, toFacelets, parseAlg, formatAlg, invert,
  stripRotations, normalizeOrientation,
  type CubeState, type Move,
} from "@moishy/cubing-core";

export type Mode = "PLL" | "OLL" | "F2L";
export type Slot = "fr" | "fl" | "br" | "bl";
export type Case = { id: string; mode: Mode; label: string; category: string; algorithm: string; slot?: Slot; variants: string[] };
export type Frame = { up: Face; front: Face };
export type Face = "U" | "R" | "F" | "D" | "L" | "B";
export type Goal = "pair" | "f2l";
export type GeneratedCase = { item: Case; setup: string; solution: string; target: CubeState; frame: Frame; preAUF: string; postAUF: string };

const pieces = (c: {id:string;name?:string;subset?:string;algs: {moves:Move[]}[]}, mode: Mode, slot?:Slot): Case => ({
  id: `${mode.toLowerCase()}-${slot ?? "ll"}-${c.id}`,
  mode, slot,
  label: c.name?.trim() || `${mode} ${c.id}`,
  category: c.subset || (slot ? ({fr:"Front right",fl:"Front left",br:"Back right",bl:"Back left"} as const)[slot] : mode),
  algorithm: formatAlg(stripRotations(c.algs[0].moves)),
  variants: c.algs.map(a => formatAlg(stripRotations(a.moves))),
});
const slots:Slot[] = ["fr","fl","br","bl"];
export const CASES:Record<Mode,Case[]> = {
  PLL: pll.cases.map(c => pieces(c,"PLL")),
  OLL: oll.cases.map(c => pieces(c,"OLL")),
  F2L: slots.flatMap(slot => f2lBySlot[slot].cases.map(c => pieces(c,"F2L",slot))),
};
export const ADVANCED_F2L_COUNT = slots.reduce((n,s)=>n + advancedF2lBySlot[s].cases.length,0);
export const COLORS:Record<Face,string> = {U:"White",R:"Red",F:"Green",D:"Yellow",L:"Orange",B:"Blue"};
const faceNames:Face[] = ["U","R","F","D","L","B"];
const norm:Record<Face,[number,number,number]> = {U:[0,1,0],R:[1,0,0],F:[0,0,1],D:[0,-1,0],L:[-1,0,0],B:[0,0,-1]};
const negate = (v:number[])=>v.map(x=>-x);
const cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const key=(v:number[])=>v.join(",");
const byNorm = new Map(Object.entries(norm).map(([f,v])=>[key(v),f as Face]));
export const opposite=(f:Face):Face=>byNorm.get(key(negate(norm[f])))!;
export function validFronts(up:Face):Face[] { return faceNames.filter(f=> f!==up && f!==opposite(up)); }
export const FRAMES:Frame[]=faceNames.flatMap(up=>validFronts(up).map(front=>({up,front})));
export function frameMap({up,front}:Frame):Record<Face,Face>{
  const U=norm[up], F=norm[front];
  const R=cross(U,F); // right handed: U cross F = R
  const normals:Record<Face,number[]>={U,R,F,D:negate(U),L:negate(R),B:negate(F)};
  return Object.fromEntries(Object.entries(normals).map(([f,v])=>[f,byNorm.get(key(v))])) as Record<Face,Face>;
}
function mappedSlice(family:"M"|"E"|"S",map:Record<Face,Face>,amount:1|2|3):Move {
  const anchor=family==="M"?"L":family==="E"?"D":"F";
  const target=map[anchor];
  const slice = target === "L"||target==="R" ? "M" : target === "D"||target==="U" ? "E" : "S";
  const same = target === "L" || target === "D" || target === "F";
  return {family:slice,amount:same?amount:(amount===1?3:amount===3?1:2)} as Move;
}
export function remapAlgorithm(algorithm:string,frame:Frame):string {
  const map=frameMap(frame);
  const moves=stripRotations(parseAlg(algorithm));
  const remapped:Move[]=moves.map(m=>{
    const f=m.family;
    if(f==="M"||f==="E"||f==="S")return mappedSlice(f,map,m.amount);
    if (/^[URFDLB]$/.test(f))return {family:map[f as Face],amount:m.amount};
    if (/^[urfdlb]$/.test(f))return {family:map[f.toUpperCase() as Face].toLowerCase(),amount:m.amount} as Move;
    throw new Error(`Unmapped move family ${f}. Use a face-turn-only alternative for this case.`);
  });
  return formatAlg(remapped);
}
const AUFS=["","U","U2","U'"];
const sample=<T,>(values:T[])=>values[Math.floor(Math.random()*values.length)];
const join=(...strings:string[])=>strings.filter(Boolean).join(" ").trim();
export function generateCase(item:Case,frame:Frame,randomAUF:boolean,randomOrientation:boolean):GeneratedCase {
  const actualFrame=randomOrientation? sample(FRAMES):frame;
  const mapped=remapAlgorithm(item.algorithm,actualFrame);
  const up=frameMap(actualFrame).U;
  const pre=randomAUF?sample(AUFS):"";
  const post=randomAUF&&item.mode==="PLL"?sample(AUFS):"";
  const preAUF=pre?`${up}${pre.slice(1)}`:"";
  const postAUF=post?`${up}${post.slice(1)}`:"";
  const solution=join(preAUF,mapped,postAUF);
  const setup=formatAlg(invert(parseAlg(solution)));
  const target=applyAlg(solvedCube(),setup);
  if (isSolved(target)) throw new Error("Generated case is already solved; select another variation.");
  return {item,setup,solution,target,frame:actualFrame,preAUF,postAUF};
}
export function sameState(a:CubeState,b:CubeState):boolean {return toFacelets(normalizeOrientation(a))===toFacelets(normalizeOrientation(b));}

// Kociemba cubie / facelet indexing, with face blocks ordered U R F D L B.
const corFacelet:number[][]=[[8,9,20],[6,18,38],[0,36,47],[2,45,11],[29,26,15],[27,44,24],[33,53,42],[35,17,51]];
const corColor=["URF","UFL","ULB","UBR","DFR","DLF","DBL","DRB"];
const edgeFacelet:number[][]=[[5,10],[7,19],[3,37],[1,46],[32,16],[28,25],[30,43],[34,52],[23,12],[21,41],[50,39],[48,14]];
const edgeColor=["UR","UF","UL","UB","DR","DF","DL","DB","FR","FL","BL","BR"];
/** FACELETS must be a 54-character URFDLB-ordered sticker stream, or a 54-entry symbol array. */
export function fromFacelets(raw:unknown):CubeState|null {
  let letters:string;
  if(typeof raw==="string") letters=raw.replace(/\s/g,"");
  else if(Array.isArray(raw)&&raw.length===54) letters=raw.map(x=>String(x)).join("");
  else return null;
  if(letters.length!==54)return null;
  const chars=[...letters];
  const centers=[4,13,22,31,40,49].map(i=>chars[i]);
  if(new Set(centers).size!==6)return null;
  const colorToFace=new Map(centers.map((color,i)=>[color,"URFDLB"[i]]));
  const normalized=chars.map(c=>colorToFace.get(c)||"?").join("");
  if(normalized.includes("?"))return null;
  if([..."URFDLB"].some(f=>[...normalized].filter(x=>x===f).length!==9))return null;
  const cp:number[]=[],co:number[]=[],ep:number[]=[],eo:number[]=[];
  for(let i=0;i<8;i++) {
    const colors=corFacelet[i].map(idx=>normalized[idx]);
    const ori=colors.findIndex(c=>c==="U"||c==="D");
    if(ori<0)return null;
    const p=corColor.findIndex(c=>c[1]===colors[(ori+1)%3]&&c[2]===colors[(ori+2)%3]);
    if(p<0)return null;
    cp[i]=p;co[i]=ori;
  }
  for(let i=0;i<12;i++) {
    const [a,b]=edgeFacelet[i].map(idx=>normalized[idx]);
    const p=edgeColor.findIndex(c=>c===a+b||c===b+a);
    if(p<0)return null;
    ep[i]=p;eo[i]=edgeColor[p]===a+b?0:1;
  }
  if(new Set(cp).size!==8||new Set(ep).size!==12)return null;
  const cube:CubeState={cp,co,ep,eo,cn:[0,1,2,3,4,5]};
  if(toFacelets(cube)!==normalized)return null;
  return cube;
}
export function snapshotIsSolved(raw:unknown):boolean {
  const state=fromFacelets(raw);
  return !!state&&isSolved(state);
}

export function slotPairSolved(state:CubeState,slot:Slot,frame:Frame={up:"U",front:"F"}):boolean {
  const map=frameMap(frame),dn=opposite(map.U);
  const slotFaces:Record<Slot,[Face,Face]>={fr:[map.F,map.R],fl:[map.F,map.L],br:[map.B,map.R],bl:[map.B,map.L]};
  const [a,b]=slotFaces[slot];
  const ci=corColor.findIndex(n=>n.includes(dn)&&n.includes(a)&&n.includes(b));
  const ei=edgeColor.findIndex(n=>n.includes(a)&&n.includes(b));
  if(ci<0||ei<0)return false;
  const s=normalizeOrientation(state);
  return s.cp[ci]===ci&&s.co[ci]===0&&s.ep[ei]===ei&&s.eo[ei]===0;
}
export function crossSolved(state:CubeState,frame:Frame={up:"U",front:"F"}):boolean {
  const dn=opposite(frameMap(frame).U),s=normalizeOrientation(state);
  return edgeColor.every((n,i)=>!n.includes(dn)||(s.ep[i]===i&&s.eo[i]===0));
}
export function f2lSolved(state:CubeState,frame:Frame={up:"U",front:"F"}):boolean {
  return crossSolved(state,frame)&&slots.every(slot=>slotPairSolved(state,slot,frame));
}
export function orientedTop(state:CubeState,frame:Frame={up:"U",front:"F"}):boolean {
  const face=frameMap(frame).U;
  const start="URFDLB".indexOf(face)*9;
  const stickers=toFacelets(normalizeOrientation(state)).slice(start,start+9);
  return [...stickers].every(c=>c===face);
}
export function ollSolved(state:CubeState,frame:Frame):boolean {return f2lSolved(state,frame)&&orientedTop(state,frame);}
export function goalReached(state:CubeState,generated:GeneratedCase,goal:Goal):boolean {
  return generated.item.mode==="PLL"?isSolved(state):generated.item.mode==="OLL"?ollSolved(state,generated.frame):goal==="pair"?slotPairSolved(state,generated.item.slot||"fr",generated.frame):f2lSolved(state,generated.frame);
}
export function solvedSlotCount(state:CubeState,frame:Frame):number{return slots.filter(s=>slotPairSolved(state,s,frame)).length;}
export function stage(state:CubeState,frame:Frame):string {
  if(isSolved(state))return "Solved";
  if(!crossSolved(state,frame))return "Cross";
  if(!f2lSolved(state,frame))return `F2L · ${solvedSlotCount(state,frame)}/4 pairs`;
  if(!ollSolved(state,frame))return "OLL";
  return "PLL";
}
export function randomCase(modes:Mode[],previousId?:string):Case {
  if(!modes.length)throw new Error("Select at least one practice category.");
  const mode=sample(modes);
  const list=CASES[mode];
  return sample(list.filter(c=>list.length===1||c.id!==previousId));
}

export type F2LAdvice={slot:Slot;setup:string;algorithm:string;caseId:string;htm:number;source:string};
const f2lLookups=f2lSlotLookups([f2lBySlot,advancedF2lBySlot]);
export function getF2LAdvice(state:CubeState,frame:Frame={up:"U",front:"F"}):F2LAdvice[] {
  // The curated lookup is calibrated for the standard U-up / D-cross cube frame.
  // Never claim a rotated-color result is verified until the frame mapping is validated.
  if(frame.up!=="U"||frame.front!=="F" || !crossSolved(state,frame))return [];
  const already=solvedSlotCount(state,frame);
  const found:F2LAdvice[]=[];
  for(const slot of slots) {
    if(slotPairSolved(state,slot,frame))continue;
    for(const auf of AUFS) {
      const aligned=applyAlg(state,auf);
      const match=f2lLookups[slot].find(aligned);
      if(!match)continue;
      for(const variant of match.algs.slice(0,4)) {
        const alg=formatAlg(variant.moves);
        const sequence=join(auf,alg);
        try {
          const after=applyAlg(state,sequence);
          if(crossSolved(after,frame)&&solvedSlotCount(after,frame)>already&&slots.every(s=>!slotPairSolved(state,s,frame)||slotPairSolved(after,s,frame))) {
            found.push({slot,setup:auf,algorithm:sequence,caseId:match.id,htm:parseAlg(sequence).length,source:"Curated F2L lookup"});
          }
        }catch {/* reject variants that do not work in the actual state */}
      }
    }
  }
  return found.sort((a,b)=>a.htm-b.htm);
}

// Recognition uses actual live orientation/permutation stickers, never merely the
// algorithm that CubeLab previously asked the user to execute.
const TOP_SIDE_INDICES=[9,10,11,18,19,20,36,37,38,45,46,47];
function orientationMask(state:CubeState):string {
  const facelets=toFacelets(normalizeOrientation(state));
  const indices=[0,1,2,3,4,5,6,7,8,...TOP_SIDE_INDICES];
  return indices.map(i=>facelets[i]==="U"?"1":"0").join("");
}
let ollLookup:Map<string,string>|null=null;
let pllLookup:Map<string,string>|null=null;
function buildOLLMap(){
  if(ollLookup)return ollLookup;
  const map=new Map<string,string>();
  for(const item of CASES.OLL){
    const inverted=formatAlg(invert(parseAlg(item.algorithm)));
    for(const u of ["","U","U2","U'"]){
      const state=applyAlg(solvedCube(),[inverted,u].filter(Boolean).join(" "));
      if(!map.has(orientationMask(state)))map.set(orientationMask(state),item.label);
    }
  }
  ollLookup=map;return map;
}
function buildPLLMap(){
  if(pllLookup)return pllLookup;
  const map=new Map<string,string>();
  for(const item of CASES.PLL){
    for(const before of ["","U","U2","U'"]){
      for(const after of ["","U","U2","U'"]){
        const solution=[before,item.algorithm,after].filter(Boolean).join(" ");
        const state=applyAlg(solvedCube(),formatAlg(invert(parseAlg(solution))));
        map.set(toFacelets(normalizeOrientation(state)),item.label);
      }
    }
  }
  pllLookup=map;return map;
}
/** Returns standard U-up case names only; other reference frames need mapped recognition. */
export function identifyLastLayer(state:CubeState):{stage:"F2L"|"OLL"|"PLL"|"SOLVED";caseName:string} {
  const standard:Frame={up:"U",front:"F"};
  if(!f2lSolved(state,standard))return {stage:"F2L",caseName:"Finish F2L first"};
  if(!ollSolved(state,standard))return {stage:"OLL",caseName:buildOLLMap().get(orientationMask(state))||"Unrecognized OLL; check synchronization"};
  if(isSolved(state))return {stage:"SOLVED",caseName:"PLL skip / solved"};
  return {stage:"PLL",caseName:buildPLLMap().get(toFacelets(normalizeOrientation(state)))||"PLL AUF or unrecognized case"};
}
