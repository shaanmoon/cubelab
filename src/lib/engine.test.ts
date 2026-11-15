import {describe,it,expect} from "vitest";
import {applyAlg,solvedCube,toFacelets,isSolved} from "@moishy/cubing-core";
import {
  CASES,fromFacelets,generateCase,goalReached,frameMap,FRAMES,validFronts,
  crossSolved,f2lSolved,ollSolved,slotPairSolved,randomCase,identifyLastLayer
} from "./engine";

describe("complete CFOP catalogue",()=>{
  it("has 21 PLL, 57 OLL, and 41 F2L for each slot",()=>{
    expect(CASES.PLL).toHaveLength(21);
    expect(CASES.OLL).toHaveLength(57);
    expect(CASES.F2L).toHaveLength(164);
    for(const slot of ["fr","fl","br","bl"])expect(CASES.F2L.filter(c=>c.slot===slot)).toHaveLength(41);
  });
  it("round trips a known scramble through the facelet decoder",()=>{
    for(const alg of ["","R U R' U'","F2 D B R2 U' L2","R U2 F' L D B2 R' U F2"]) {
      const state=applyAlg(solvedCube(),alg);
      const decoded=fromFacelets(toFacelets(state));
      expect(decoded).not.toBeNull();
      expect(toFacelets(decoded!)).toBe(toFacelets(state));
    }
  });
  it("detects solved across each referenced frame",()=>{
    const solved=solvedCube();
    expect(isSolved(solved)).toBe(true);
    for(const frame of FRAMES){
      expect(crossSolved(solved,frame)).toBe(true);
      expect(f2lSolved(solved,frame)).toBe(true);
      expect(ollSolved(solved,frame)).toBe(true);
      expect(slotPairSolved(solved,"fr",frame)).toBe(true);
    }
  });
  it("offers 24 valid reference orientations",()=>{
    expect(FRAMES).toHaveLength(24);
    for(const f of FRAMES){
      expect(validFronts(f.up)).toContain(f.front);
      expect(new Set(Object.values(frameMap(f))).size).toBe(6);
    }
  });
  it("a case plus its reference solution returns to solved",()=>{
    for(const item of [...CASES.PLL,...CASES.OLL,...CASES.F2L]){
      const g=generateCase(item,{up:"U",front:"F"},false,false);
      const actual=applyAlg(g.target,g.solution);
      expect(isSolved(actual),item.id).toBe(true);
      expect(goalReached(actual,g,"pair")).toBe(true);
    }
  });
  it("identifies named PLL/OLL from generated positions",()=>{
    const pll=CASES.PLL.find(x=>x.id.includes("t-perm"))||CASES.PLL[0];
    const oll=CASES.OLL[26];
    const pllState=generateCase(pll,{up:"U",front:"F"},false,false).target;
    const ollState=generateCase(oll,{up:"U",front:"F"},false,false).target;
    expect(identifyLastLayer(pllState).stage).toBe("PLL");
    expect(identifyLastLayer(ollState).stage).toBe("OLL");
  });
  it("random mode only yields enabled categories",()=>{
    for(let i=0;i<30;i++)expect(randomCase(["OLL","PLL"]).mode).not.toBe("F2L");
  });
});
