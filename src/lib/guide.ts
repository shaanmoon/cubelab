import type { CubeState } from "@moishy/cubing-core";
import { formatAlg, parseAlg } from "@moishy/cubing-core";
import { cfop } from "@moishy/cfop";
import { getF2LAdvice, type F2LAdvice, type Frame } from "./engine";

export type SolveStep={stage:string;algorithm:string;strategy:string;cost:number};
export type Guidance={verified:boolean;steps:SolveStep[];fullSolution:string;notes:string};
export type F2LOptions={frontRightOnly:F2LAdvice|null;anySlot:F2LAdvice|null;hybrid:F2LAdvice|null;all:F2LAdvice[]};

export async function computeGuidance(scrambleOrHistory:string):Promise<Guidance> {
  const result=await cfop.solve(scrambleOrHistory,{colorNeutrality:"fixed"},{timeBudgetMs:12000});
  return {
    verified:result.solved,
    fullSolution:result.solutionString,
    steps:result.segments.map(seg=>({
      stage:seg.unitId,algorithm:formatAlg(seg.moves),strategy:seg.strategyId,cost:seg.cost
    })),
    notes:result.solved?"Verified end-to-end CFOP reference. Ranked by the solver's ergonomic cost, not a guaranteed global optimum by move count or time.":"Solver returned a partial plan within its time budget. Don't treat it as a full solution."
  };
}
export function compareF2LOptions(state:CubeState,frame:Frame):F2LOptions {
  const all=getF2LAdvice(state,frame);
  // All suggestions are independently checked to preserve the cross and solved pairs.
  const frontRightOnly=all.find(a=>a.slot==="fr")||null;
  const anySlot=all[0]||null;
  // Hybrid: modestly prefer front-right familiarity when the difference is small.
  const hybrid=all.reduce<F2LAdvice|null>((best,a)=>{
    const penalized=(x:F2LAdvice)=>x.htm+(x.slot==="fr"?0:2);
    return !best||penalized(a)<penalized(best)?a:best;
  },null);
  return {frontRightOnly,anySlot,hybrid,all};
}
export const countHTM=(moves:string)=>parseAlg(moves).length;
