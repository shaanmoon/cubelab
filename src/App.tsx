import { useEffect, useRef, useState, type ReactNode } from "react";
import { connectSmartCube } from "smartcube-web-bluetooth";
import type { Subscription } from "rxjs";
import { randomScrambleForEvent } from "cubing/scramble";
import {
  applyAlg, solvedCube, isSolved, formatAlg,parseAlg,
  type CubeState,
} from "@moishy/cubing-core";
import CubeView from "./components/CubeView";
import FaceletNet from "./components/FaceletNet";
import {
  CASES, COLORS, validFronts, generateCase, randomCase, fromFacelets, goalReached, sameState,
  stage, crossSolved, f2lSolved, ollSolved, identifyLastLayer,
  type Case, type Mode, type Frame, type Face, type Goal, type GeneratedCase,
} from "./lib/engine";
import { avg, efficiency, exportCSV, fmt, loadAttempts, persist, tps, wcaAverage, type Attempt } from "./lib/stats";
import { computeGuidance, compareF2LOptions, countHTM, type Guidance, type F2LOptions } from "./lib/guide";

type Screen="practice"|"random"|"example"|"statistics";
type Phase="unsynced"|"ready"|"setup"|"armed"|"running"|"finished"|"scramble";
type Example={scramble:string;target:CubeState;guidance:Guidance|null;original:string};
const MOVES=["U","U'","R","R'","F","F'","D","D'","L","L'","B","B'","U2","R2","F2"];
const fmtPercent=(v:number|null)=>v==null?"—":`${(v*100).toFixed(1)}%`;
const join=(...s:string[])=>s.filter(Boolean).join(" ");

function Metric({label,value,note}:{label:string;value:string|number;note?:string}){
  return <div className="metric-card"><div className="metric-label">{label}</div><div className="metric-val">{value}</div>{note&&<small>{note}</small>}</div>;
}
function Panel({title,children,className=""}:{title:string;children:ReactNode;className?:string}){
  return <section className={`panel ${className}`}><div className="panel-title">{title}</div>{children}</section>;
}

export default function App(){
  const [screen,setScreen]=useState<Screen>("practice");
  const [phase,setPhase]=useState<Phase>("unsynced");
  const phaseRef=useRef<Phase>("unsynced");
  const [cube,setCube]=useState<CubeState|null>(null);
  const cubeRef=useRef<CubeState|null>(null);
  const [synced,setSynced]=useState(false);
  const syncedRef=useRef(false);
  const [connected,setConnected]=useState(false);
  const [connecting,setConnecting]=useState(false);
  const [snapshotSupported,setSnapshotSupported]=useState(false);
  const [message,setMessage]=useState("Connect a cube and request its state, or select ‘Demo: assume solved’.");
  const connRef=useRef<Awaited<ReturnType<typeof connectSmartCube>>|null>(null);
  const subscriptionRef=useRef<Subscription|null>(null);
  const nextTimerRef=useRef<number|null>(null);
  const frameDefault:Frame={up:"U",front:"F"};
  const [frame,setFrame]=useState<Frame>(frameDefault);
  const [mode,setMode]=useState<Mode>("PLL");
  const [caseId,setCaseId]=useState(CASES.PLL[0].id);
  const [f2lGoal,setF2lGoal]=useState<Goal>("pair");
  const [randomModes,setRandomModes]=useState<Mode[]>(["PLL","OLL","F2L"]);
  const [randomAUF,setRandomAUF]=useState(true);
  const [randomOrientation,setRandomOrientation]=useState(false);
  const [autoNext,setAutoNext]=useState(true);
  const [active,setActive]=useState<GeneratedCase|null>(null);
  const activeRef=useRef<GeneratedCase|null>(null);
  const [example,setExample]=useState<Example|null>(null);
  const exampleRef=useRef<Example|null>(null);
  const [showReference,setShowReference]=useState(false);
  const [guiding,setGuiding]=useState(false);
  const [currentGuidance,setCurrentGuidance]=useState<Guidance|null>(null);
  const [pairAdvice,setPairAdvice]=useState<F2LOptions|null>(null);
  const [elapsed,setElapsed]=useState(0);
  const [recognitionElapsed,setRecognitionElapsed]=useState(0);
  const startRef=useRef(0),armRef=useRef(0);
  const [,setMoveLog]=useState<string[]>([]);
  const moveLogRef=useRef<string[]>([]);
  const [sessionMoves,setSessionMoves]=useState<string[]>([]);
  const sessionMovesRef=useRef<string[]>([]);
  const [lastMove,setLastMove]=useState("—");
  const [attempts,setAttempts]=useState<Attempt[]>(loadAttempts);
  const [deviceInfo,setDeviceInfo]=useState("No device");
  const [demo,setDemo]=useState(false);
  const [viewHistoryAvailable,setViewHistoryAvailable]=useState(false);
  const screenRef=useRef(screen),randomModesRef=useRef(randomModes),autoNextRef=useRef(autoNext);
  const frameRef=useRef(frame),goalRef=useRef(f2lGoal);
  screenRef.current=screen;randomModesRef.current=randomModes;autoNextRef.current=autoNext;frameRef.current=frame;goalRef.current=f2lGoal;

  function setP(next:Phase){phaseRef.current=next;setPhase(next);}
  function notify(s:string){setMessage(s);}
  function setState(next:CubeState){cubeRef.current=next;setCube(next);}
  function replaceLog(next:string[]){moveLogRef.current=next;setMoveLog(next);}
  function replaceSessionLog(next:string[]){sessionMovesRef.current=next;setSessionMoves(next);}
  function cleanupNext(){if(nextTimerRef.current!==null){window.clearTimeout(nextTimerRef.current);nextTimerRef.current=null}}
  useEffect(()=>()=>{subscriptionRef.current?.unsubscribe();if(nextTimerRef.current!==null)window.clearTimeout(nextTimerRef.current)},[]);
  useEffect(()=>{
    if(phase!=="running")return;
    const interval=window.setInterval(()=>setElapsed(performance.now()-startRef.current),33);
    return()=>window.clearInterval(interval);
  },[phase]);
  const chosen=CASES[mode].find(c=>c.id===caseId)||CASES[mode][0];

  function saveAttempt(finished:boolean,ms:number,recognitionMs:number){
    const item=activeRef.current;
    const ex=exampleRef.current;
    const isExample=screenRef.current==="example"&&ex!==null;
    const planned=isExample?ex?.guidance?.fullSolution||"":item?.solution||"";
    const record:Attempt={
      id:crypto.randomUUID(),date:new Date().toISOString(),
      caseId:isExample?"example":item?.item.id||"unknown",caseLabel:isExample?"Full CFOP solve":item?.item.label||"Practice",
      mode:isExample?"SOLVE":item?.item.mode||"PLL",finished,milliseconds:ms,
      recognitionMs,moveCount:sessionMovesRef.current.length,referenceMoves:planned?countHTM(planned):0,
      moves:[...sessionMovesRef.current]
    };
    setAttempts(prev=>{const next=[record,...prev];persist(next);return next});
  }
  function clearSession(){cleanupNext();activeRef.current=null;setActive(null);exampleRef.current=null;setExample(null);setElapsed(0);setRecognitionElapsed(0);replaceSessionLog([]);setCurrentGuidance(null);setPairAdvice(null);setP(syncedRef.current?"ready":"unsynced")}
  function markSynced(next:CubeState){
    setState(next);syncedRef.current=true;setSynced(true);
    if(isSolved(next)){
      replaceLog([]);setViewHistoryAvailable(true);
      if(phaseRef.current==="unsynced")setP("ready");
    }else{replaceLog([]);setViewHistoryAvailable(false);if(phaseRef.current==="unsynced")setP("ready")}
  }
  function demoSolved(){
    if(connected){notify("Use Request live state while connected. Demo reset is disabled to prevent a false cube state.");return;}
    setDemo(true);markSynced(solvedCube());clearSession();setP("ready");
    notify("Demo cube initialized. The virtual turn buttons can now drive training sessions.");
  }
  function onSnapshot(raw:unknown){
    const state=fromFacelets(raw);
    if(!state){notify("Received a facelet event, but its format could not be validated as a URFDLB 54-facelet snapshot. Check the raw data in Developer Tools; manual solved baseline remains available.");return;}
    const wasReady=syncedRef.current;
    // A full state snapshot is authoritative when valid: it repairs missed move tracking.
    setState(state);syncedRef.current=true;setSynced(true);
    if(!wasReady){replaceLog([]);setViewHistoryAvailable(isSolved(state));setP("ready")}
    const a=activeRef.current,ex=exampleRef.current;
    const p=phaseRef.current;
    if(p==="setup"&&a&&sameState(state,a.target)){
      setP("armed");armRef.current=performance.now();setElapsed(0);
      notify("Live snapshot confirms the target case. Timer armed.");
    }else if(p==="scramble"&&ex&&sameState(state,ex.target)){
      setP("armed");armRef.current=performance.now();setElapsed(0);
      notify("Live snapshot confirms the example scramble. Timer armed.");
    }else if(p==="running"&&((screenRef.current==="example"&&isSolved(state))||(a&&goalReached(state,a,goalRef.current)))){
      finishSessionWithRecognition(recognitionElapsed);
    }else if(isSolved(state)){
      if(phaseRef.current==="unsynced")setP("ready");
      if(phaseRef.current==="ready" || phaseRef.current==="finished") {replaceLog([]);setViewHistoryAvailable(true);}
      notify("Cube state read successfully; solved position detected automatically.");
      if(phaseRef.current==="finished"&&screenRef.current==="random")scheduleNextRandom();
    }else if(!wasReady)notify("Live cube synchronized in its current scrambled state. Solve the cube first to start case drills.");
  }
  function scheduleNextRandom(){
    if(!autoNextRef.current||!randomModesRef.current.length)return;
    cleanupNext();
    nextTimerRef.current=window.setTimeout(()=>{
      nextTimerRef.current=null;
      const s=cubeRef.current;
      if(screenRef.current==="random"&&s&&isSolved(s)&&phaseRef.current!=="running")loadRandomCase();
    },1100);
  }
  function receiveMove(raw:string){
    const move=String(raw).replaceAll("’","'").trim();
    try{if(parseAlg(move).length!==1)throw new Error("Expected a single move")}catch{notify(`Unrecognized move ${move}; tracking not updated.`);return}
    if(!syncedRef.current||!cubeRef.current)return;
    let updated:CubeState;
    try{updated=applyAlg(cubeRef.current,move)}catch(e){notify(`Move cannot be applied: ${String(e)}`);return}
    setState(updated);setLastMove(move);
    replaceLog([...moveLogRef.current,move]);
    const current=phaseRef.current;
    const item=activeRef.current;
    const ex=exampleRef.current;
    if(current==="setup"&&item&&sameState(updated,item.target)){
      setP("armed");armRef.current=performance.now();setElapsed(0);setRecognitionElapsed(0);
      notify("Target case reached. Inspection / recognition time has begun; the first turn starts the solve timer.");return;
    }
    if(current==="scramble"&&ex&&sameState(updated,ex.target)){
      setP("armed");armRef.current=performance.now();setElapsed(0);setRecognitionElapsed(0);
      notify("Scramble verified. First solve move starts the timer. Show the CFOP plan only if you want guidance.");return;
    }
    if(current==="armed"){
      setRecognitionElapsed(performance.now()-armRef.current);
      startRef.current=performance.now();replaceSessionLog([move]);setElapsed(0);setP("running");
    }else if(current==="running")replaceSessionLog([...sessionMovesRef.current,move]);
    if(current==="armed"||current==="running"){
      if(screenRef.current==="example"?isSolved(updated):!!item&&goalReached(updated,item,goalRef.current)){
        const recognition=current==="armed"?performance.now()-armRef.current:recognitionElapsed;
        // React state may still hold stale recognitionMs if the first move also solves.
        setRecognitionElapsed(recognition);
        finishSessionWithRecognition(recognition);
      }
      return;
    }
    if(current==="finished"&&isSolved(updated)&&screenRef.current==="random")scheduleNextRandom();
    if(current==="ready"&&isSolved(updated)){replaceLog([]);setViewHistoryAvailable(true);notify("Solved state detected automatically. Select a case or generate a random practice case.");}
  }
  function finishSessionWithRecognition(recognitionMs:number){
    const duration=performance.now()-startRef.current;
    setElapsed(duration);setP("finished");
    saveAttempt(true,duration,recognitionMs);
    notify(`Completed in ${fmt(duration)}. Recognition ${fmt(recognitionMs)}. ${screenRef.current==="random"?"Return to solved for the next case.":"Session recorded."}`);
    if(screenRef.current==="random"&&cubeRef.current&&isSolved(cubeRef.current))scheduleNextRandom();
  }
  const receiveRef=useRef(receiveMove);receiveRef.current=receiveMove;
  const snapshotRef=useRef(onSnapshot);snapshotRef.current=onSnapshot;
  async function connect(){
    if(connected||connecting)return;
    if(!("bluetooth" in navigator)){notify("Web Bluetooth unavailable. Open in desktop Chrome or Edge on localhost or an HTTPS site.");return}
    setConnecting(true);notify("Wake the smart cube, close its manufacturer's app, then select it in the Bluetooth picker.");
    try{
      const conn=await connectSmartCube();connRef.current=conn;
      subscriptionRef.current?.unsubscribe();
      subscriptionRef.current=conn.events$.subscribe(event=>{
        if(event.type==="MOVE")receiveRef.current(String(event.move));
        else if(event.type==="FACELETS")snapshotRef.current(event.facelets);
        else if(event.type==="BATTERY")setDeviceInfo(`Battery ${event.batteryLevel}%`);
        else if(String(event.type).includes("DISCONNECT")){
          setConnected(false);syncedRef.current=false;setSynced(false);setP("unsynced");notify("Disconnected; reconnect and request an absolute cube state before further timed practice.");
        }
      });
      setConnected(true);setDemo(false);
      const stateCap=Boolean(conn.capabilities?.facelets);setSnapshotSupported(stateCap);
      if(stateCap){try{await conn.sendCommand({type:"REQUEST_FACELETS"});notify("Connected. Requested live facelets; CubeLab will recognize solved state automatically when received.")}catch{notify("Connected, but the cube did not respond to a state request. Solve it and use the manual verified baseline if necessary.")}}
      else notify("Connected. This firmware does not advertise full facelet snapshots. Solve the physical cube, then use the manual baseline as a fallback.");
    }catch(e){notify(`Bluetooth connection failed: ${String(e)}`)}finally{setConnecting(false)}
  }
  async function requestState(){
    const conn=connRef.current;
    if(!conn||!snapshotSupported){notify("A facelet snapshot is not advertised by this cube. Use manual solved baseline after solving physically.");return}
    try{await conn.sendCommand({type:"REQUEST_FACELETS"});notify("Requested an updated state from the cube.")}catch(e){notify(`Request failed: ${String(e)}`)}
  }
  function manualSolved(){
    if(!confirm("Is the real cube physically solved? This resets tracking and is not sensor verification."))return;
    markSynced(solvedCube());clearSession();setP("ready");notify("Manual solved reference established. Check R / R' and U / U' tracking before timing drills.");
  }
  function switchScreen(next:Screen){
    if(phaseRef.current==="running"&&!confirm("Abandon and record this attempt as incomplete?"))return;
    if(phaseRef.current==="running")saveAttempt(false,performance.now()-startRef.current,recognitionElapsed);
    clearSession();setScreen(next);
    if(next==="example")notify("Generate a scramble from a solved cube. The example trainer uses a fixed D-cross reference.");
    else if(next==="random")notify("Choose the practice categories and click Start random practice.");
  }
  function loadAlgorithmCase(item:Case,origin:Screen=screenRef.current){
    if(!cubeRef.current||!syncedRef.current){notify("First synchronize the cube. Request its state or establish a solved baseline.");return}
    if(!isSolved(cubeRef.current)){notify("Complete the physical cube first. CubeLab will recognize the solved state automatically if synchronized.");return}
    try{
      let generated:GeneratedCase|undefined;
      for(let i=0;i<24;i++){
        const g=generateCase(item,frameRef.current,randomAUF,origin==="random"&&randomOrientation);
        if(!goalReached(g.target,g,goalRef.current)){generated=g;break}
      }
      if(!generated)throw new Error("No meaningful unsolved configuration found for this goal.");
      replaceLog([]);setViewHistoryAvailable(true);
      activeRef.current=generated;setActive(generated);exampleRef.current=null;setExample(null);
      replaceSessionLog([]);setElapsed(0);setRecognitionElapsed(0);setP("setup");
      notify(`Set up ${item.label}. Follow the setup sequence from solved; CubeLab arms automatically when the correct state appears.`);
    }catch(e){notify(`Cannot generate case: ${String(e)}`)}
  }
  function loadRandomCase(){
    if(!randomModesRef.current.length){notify("Select at least one training category.");return}
    try{const next=randomCase(randomModesRef.current,activeRef.current?.item.id);
      setMode(next.mode);setCaseId(next.id);loadAlgorithmCase(next,"random");
    }catch(e){notify(String(e))}
  }
  function demoSetup(){
    if(connected){notify("Instant virtual setup is disabled during physical Bluetooth tracking.");return}
    const a=activeRef.current,ex=exampleRef.current;
    if(a&&phaseRef.current==="setup"){
      setState(a.target);replaceLog([...moveLogRef.current,...parseAlg(a.setup).map(m=>formatAlg([m]))]);
      setP("armed");armRef.current=performance.now();setElapsed(0);setRecognitionElapsed(0);
      notify("Target case loaded virtually. Use the turn buttons to execute a solution.");
    }else if(ex&&phaseRef.current==="scramble"){
      setState(ex.target);replaceLog([...moveLogRef.current,...parseAlg(ex.scramble).map(m=>formatAlg([m]))]);
      setP("armed");armRef.current=performance.now();setElapsed(0);setRecognitionElapsed(0);
      notify("Example scramble loaded virtually. Use turn buttons to solve.");
    }
  }
  async function createScramble(){
    if(!syncedRef.current||!cubeRef.current||!isSolved(cubeRef.current)){notify("Start from a physically solved and synchronized cube.");return}
    try{
      replaceLog([]);setViewHistoryAvailable(true);
      const scramble=(await randomScrambleForEvent("333")).toString();
      const target=applyAlg(solvedCube(),scramble);
      const ex:Example={scramble,target,guidance:null,original:scramble};
      exampleRef.current=ex;setExample(ex);activeRef.current=null;setActive(null);
      replaceSessionLog([]);setP("scramble");setShowReference(false);setPairAdvice(null);setCurrentGuidance(null);
      notify("Scramble the physical cube exactly as displayed. Timing arms after CubeLab confirms the target state.");
    }catch(e){notify(`Scramble generation failed: ${String(e)}`)}
  }
  async function getReference(fromCurrent=false){
    const ex=exampleRef.current;
    if(!ex)return;
    setGuiding(true);
    try{
      if(fromCurrent&&!viewHistoryAvailable)throw new Error("A full move-history baseline is unavailable; solve and resynchronize first.");
      const input=fromCurrent?join(...moveLogRef.current):ex.scramble;
      const result=await computeGuidance(input);
      if(fromCurrent)setCurrentGuidance(result);
      else{const n={...ex,guidance:result};exampleRef.current=n;setExample(n)}
      notify(result.verified?"CFOP plan generated and solver-reported as complete. Check suggestions against the tracked state.":"Solver reached its time budget; only a partial plan is available.");
    }catch(e){notify(`CFOP analysis unavailable: ${String(e)}`)}finally{setGuiding(false)}
  }
  function analyzeStage(){
    if(!cubeRef.current)return;
    setPairAdvice(compareF2LOptions(cubeRef.current,frameDefault));
    void getReference(true);
  }
  function toggleRandomMode(m:Mode){setRandomModes(prev=>prev.includes(m)?prev.filter(x=>x!==m):[...prev,m])}
  const selectedAttempts=attempts.filter(a=>screen==="statistics"||a.caseId===(active?.item.id||caseId));
  const done=selectedAttempts.filter(x=>x.finished);
  const best=done.length?Math.min(...done.map(x=>x.milliseconds)):null;
  const liveTPS=phase==="running"&&elapsed>0?sessionMoves.length*1000/elapsed:null;
  const liveStage=cube?stage(cube,frameDefault):"Unknown";
  const lastLayer=cube&&screen==="example"?identifyLastLayer(cube):null;
  function downloadCSV(){
    const blob=new Blob([exportCSV(attempts)],{type:"text/csv;charset=utf-8"});
    const uri=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=uri;a.download="cubelab-results.csv";a.click();URL.revokeObjectURL(uri);
  }

  return <main className="shell">
    <header className="topbar">
      <div className="wordmark">◈ CUBELAB <span className="subtitle">V2 · CONNECTED TRAINER</span></div>
      <div className="connection-indicator"><span className={`dot ${connected?"on":""}`}/>{connected?"Bluetooth connected":demo?"Demo mode":"Bluetooth disconnected"}<span className="separator">·</span>{synced?"State synchronized":"Unsynchronized"}</div>
    </header>
    <nav className="tabs" aria-label="CubeLab navigation">
      {([["practice","Algorithm trainer"],["random","Randomizer"],["example","Example solve"],["statistics","Statistics"]] as [Screen,string][]).map(([key,label])=><button key={key} className={screen===key?"active":""} onClick={()=>switchScreen(key)}>{label}</button>)}
    </nav>
    <section className="hero">
      <div className="eyebrow">BLUETOOTH + CFOP TRAINING</div>
      <h1>{screen==="practice"?"Master each case.":screen==="random"?"Train without patterns.":screen==="example"?"Learn from every solve.":"Measure your improvement."}</h1>
      <p>Automatic case detection · first-move timer · 21 PLL, 57 OLL and 41 F2L cases for each slot · live 54-facelet state</p>
    </section>
    <div className="layout">
      <aside className="left-stack">
        <Panel title="01 · DEVICE & STATE">
          <div className="connection-buttons"><button className="primary" onClick={connect} disabled={connected||connecting}>{connecting?"Connecting…":connected?"Connected":"Connect Bluetooth cube"}</button><button className="outline" disabled={!connected||!snapshotSupported} onClick={requestState}>Request live state</button></div>
          <div className="subtle">{connected?deviceInfo:snapshotSupported?"Facelets supported":"Supported on Chrome/Edge via HTTPS or localhost"}</div>
          <div className="divider"/>
          <button className="outline" onClick={manualSolved} disabled={!connected}>Manual solved baseline · fallback</button>
          <button className="outline ghost" onClick={demoSolved} disabled={connected}>Demo: assume solved</button>
          <p className="subtle">Automatic solved detection uses a validated cube-state snapshot or a previously synchronized turn history. Never trust a manual reset while physically scrambled.</p>
        </Panel>
        {(screen==="practice"||screen==="random")&&<Panel title="02 · CASE SETTINGS">
          {screen==="practice"?<>
            <div className="segmented">{(["PLL","OLL","F2L"] as Mode[]).map(m=><button className={mode===m?"active":""} key={m} onClick={()=>{setMode(m);setCaseId(CASES[m][0].id)}}>{m}</button>)}</div>
            <label htmlFor="case-select">Choose case</label>
            <select id="case-select" value={caseId} onChange={e=>setCaseId(e.target.value)}>{CASES[mode].map(c=><option key={c.id} value={c.id}>{c.slot?`${c.slot.toUpperCase()} · `:""}{c.label}</option>)}</select>
            <p className="subtle">{chosen.category} · {chosen.variants.length} algorithm variant(s)</p>
          </>:<>
            <label>Randomized categories</label>
            <div className="checkrow">{(["F2L","OLL","PLL"] as Mode[]).map(m=><label key={m}><input type="checkbox" checked={randomModes.includes(m)} onChange={()=>toggleRandomMode(m)}/>{m}</label>)}</div>
            <label className="toggle"><input type="checkbox" checked={autoNext} onChange={e=>setAutoNext(e.target.checked)}/>Load next case after returning to solved</label>
          </>}
          <label htmlFor="top">Practice orientation · top center</label>
          <select id="top" value={frame.up} onChange={e=>setFrame({up:e.target.value as Face,front:validFronts(e.target.value as Face)[0]})}>
            {Object.entries(COLORS).map(([k,v])=><option key={k} value={k}>{v} ({k})</option>)}
          </select>
          <label htmlFor="front">Front center</label>
          <select id="front" value={frame.front} onChange={e=>setFrame({...frame,front:e.target.value as Face})}>
            {validFronts(frame.up).map(k=><option value={k} key={k}>{COLORS[k]} ({k})</option>)}
          </select>
          <label className="toggle"><input type="checkbox" checked={randomAUF} onChange={e=>setRandomAUF(e.target.checked)}/>Random AUF offsets</label>
          {screen==="random"&&<label className="toggle"><input type="checkbox" checked={randomOrientation} onChange={e=>setRandomOrientation(e.target.checked)}/>Randomize all 24 reference orientations</label>}
          {mode==="F2L"&&<><label htmlFor="f2lgoal">F2L stop condition</label><select id="f2lgoal" value={f2lGoal} onChange={e=>setF2lGoal(e.target.value as Goal)}><option value="pair">Selected pair solved</option><option value="f2l">All F2L complete</option></select></>}
          <div className="divider"/>
          <button className="primary" disabled={!synced||phase==="running"||screen==="random"&&!randomModes.length} onClick={()=>screen==="practice"?loadAlgorithmCase(chosen,"practice"):loadRandomCase()}>{screen==="practice"?"Load selected case":"Start / next random case"}</button>
        </Panel>}
        {screen==="example"&&<Panel title="02 · SCRAMBLE & GUIDED CFOP">
          <p className="subtle">Start solved. CubeLab verifies the scramble automatically. Timed solving starts with your first turn.</p>
          <button className="primary" disabled={!synced||phase==="running"} onClick={createScramble}>Generate new 3×3 scramble</button>
          {example&&<><label>Scramble</label><div className="alg setup-alg">{example.scramble}</div><button className="outline" disabled={guiding} onClick={()=>{setShowReference(!showReference);if(!showReference&&!example.guidance)void getReference(false)}}>{showReference?"Hide guided CFOP reference":"Show guided CFOP reference"}</button><label className="toggle"><input type="checkbox" checked={showReference} onChange={e=>setShowReference(e.target.checked)}/>Display reference while solving</label></>}
        </Panel>}
      </aside>
      <section className="center-stack">
        <Panel title="LIVE SESSION">
          <div className="timer-head"><span className="pill">{phase.toUpperCase()}</span><span className="pill alt">{screen==="example"?liveStage:active?.item.mode||mode}</span></div>
          <div className="timer">{fmt(elapsed)}</div>
          <div className="timermeta"><span>Recognition: <b>{fmt(recognitionElapsed)}</b></span><span>Moves: <b>{sessionMoves.length}</b></span><span>TPS: <b>{liveTPS?.toFixed(2)||"—"}</b></span></div>
          <div className="status-message" role="status">{message}</div>
          {(screen==="practice"||screen==="random")&&<div className="target-data"><div className="eyebrow muted">ACTIVE CASE</div><h2>{active?.item.label||chosen.label}</h2><span className="hint">{active?`${active.frame.up} top · ${active.frame.front} front · ${active.item.category}`:chosen.category}</span><div className="twoalg"><div><label>Setup (from solved)</label><div className="alg setup-alg">{active?.setup||"Load a case to generate the setup"}</div></div><div><label>Reference solution</label><div className="alg">{active?.solution||chosen.algorithm}</div></div></div></div>}
          {screen==="example"&&example&&<><div className="target-data"><h2>Example solve · {liveStage}</h2><label>Scramble</label><div className="alg setup-alg">{example.scramble}</div></div>{showReference&&<div className="reference-panel"><div className="eyebrow muted">CFOP REFERENCE</div>{example.guidance?<><div className="notice">{example.guidance.notes}</div>{example.guidance.steps.map((part,i)=><div className="guidance-line" key={i}><b>{part.stage}</b><code>{part.algorithm||"(already satisfied)"}</code></div>)}</>:<div className="subtle">{guiding?"Calculating a reference plan…":"Press ‘Show guided CFOP reference’ to calculate the solution."}</div>}</div>}</>}
          <div className="viewer-pair"><CubeView title="TARGET CONFIGURATION" setup={active?.setup||example?.scramble||""}/><FaceletNet state={cube} title="LIVE 54-FACELET STATE"/></div>
          <div className="bottomline"><span>Last move: <b>{lastMove}</b></span><span>Synced state: <b>{cube&&isSolved(cube)?"SOLVED":synced?"Tracked":"Unverified"}</b></span></div>
          <div className="actionline">
            <button className="outline" onClick={demoSetup} disabled={connected||!(phase==="setup"||phase==="scramble")}>Instant setup · demo</button>
            <button className="outline danger" disabled={phase!=="armed"&&phase!=="running"} onClick={()=>{if(phase==="running")saveAttempt(false,performance.now()-startRef.current,recognitionElapsed);setP("finished");notify("Attempt abandoned and marked incomplete.")}}>Abandon attempt</button>
          </div>
          <div className="divider"/><div className="panel-title">VIRTUAL TURN CONTROLS</div>
          <p className="subtle">For software tests. Disabled while the real Bluetooth cube is connected.</p>
          <div className="moves-grid">{MOVES.map(m=><button key={m} disabled={connected||!synced} onClick={()=>receiveMove(m)}>{m}</button>)}</div>
        </Panel>
        {screen==="example"&&<Panel title="STATE-DEPENDENT CFOP COACH">
          <p className="subtle">Do your own cross and pair insertions. After each stage, analyze the tracked state to get revised guidance. Suggestions are never forced.</p>
          <button className="primary" disabled={!example||!synced||guiding} onClick={analyzeStage}>{guiding?"Analyzing…":"Analyze current state & suggest next step"}</button>
          {lastLayer&&<div className="notice"><strong>Detected CFOP case:</strong> {lastLayer.stage} — {lastLayer.caseName}</div>}
          {cube&&<div className="stage-badges"><span>Cross {crossSolved(cube,frameDefault)?"✓":"·"}</span><span>F2L {f2lSolved(cube,frameDefault)?"✓":"·"}</span><span>OLL {ollSolved(cube,frameDefault)?"✓":"·"}</span><span>Solved {isSolved(cube)?"✓":"·"}</span></div>}
          {pairAdvice&&<div className="strategy-list">
            {([["Front-right only",pairAdvice.frontRightOnly,"Only currently actionable FR insertions; rotate/reorient for other slots"],["Any of four slots",pairAdvice.anySlot,"Lowest HTM verified candidate across all slots"],["Hybrid",pairAdvice.hybrid,"Adds a two-move familiarity preference for FR"]] as [string,typeof pairAdvice.anySlot,string][]).map(([label,advice,description])=><div key={label} className="strategy-card"><strong>{label}</strong><p className="subtle">{description}</p>{advice?<><div className="alg">{advice.algorithm}</div><small>{advice.slot.toUpperCase()} · {advice.htm} moves · {advice.caseId}</small></>:<small>No validated candidate for this state. May require extraction or a different reference frame.</small>}</div>)}
          </div>}
          {currentGuidance&&<div className="reference-panel"><div className="eyebrow muted">REVISED PLAN FROM CURRENT POSITION</div><div className="notice">{currentGuidance.notes}</div>{currentGuidance.steps.map((p,i)=><div className="guidance-line" key={i}><b>{p.stage}</b><code>{p.algorithm}</code></div>)}</div>}
        </Panel>}
      </section>
      <aside className="right-stack">
        <Panel title="PRACTICE STATISTICS">
          <div className="metric-grid"><Metric label="Completed" value={done.length}/><Metric label="Best" value={fmt(best)}/><Metric label="Mean" value={fmt(avg(done.map(s=>s.milliseconds)))}/><Metric label="Ao5" value={fmt(wcaAverage(selectedAttempts,5))}/><Metric label="Ao12" value={fmt(wcaAverage(selectedAttempts,12))}/><Metric label="Completion" value={fmtPercent(attempts.length?attempts.filter(a=>a.finished).length/attempts.length:null)}/><Metric label="Mean TPS" value={avg(done.map(tps).filter((x):x is number=>x!=null))?.toFixed(2)||"—"}/><Metric label="Move efficiency" value={fmtPercent(avg(done.map(efficiency).filter((x):x is number=>x!=null)))}/><Metric label="Recognition" value={fmt(avg(done.map(x=>x.recognitionMs)))}/></div>
          <div className="divider"/><div className="panel-title">RECENT SESSIONS</div>
          <div className="results">{attempts.length?attempts.slice(0,12).map(s=><div className="result" key={s.id}><div><strong>{s.caseLabel}</strong><small>{s.mode} · {s.moveCount} moves · {new Date(s.date).toLocaleDateString()}</small></div><div className="result-time">{s.finished?fmt(s.milliseconds):"DNF"}</div></div>):<p className="subtle">Complete a timed session to begin tracking your improvement.</p>}</div>
          <button className="outline" onClick={downloadCSV}>Export CSV</button>
          <p className="subtle">Statistics are local to this browser. TPS uses detected move events; the efficiency ratio compares completed move counts to the selected reference, not global optimality. “Completion” is the success rate for recorded attempts.</p>
        </Panel>
        {screen==="statistics"&&<Panel title="LIBRARY COVERAGE"><div className="metric-grid"><Metric label="PLL" value={CASES.PLL.length}/><Metric label="OLL" value={CASES.OLL.length}/><Metric label="F2L · 4 slots" value={CASES.F2L.length}/></div><p className="subtle">One primary algorithm plus alternatives per case. F2L advanced/extraction cases are available to the live next-pair advisor.</p></Panel>}
      </aside>
    </div>
    <footer>CubeLab v2 · Local-first prototype. BLE timestamps, facelet formatting, arbitrary frame mapping and solver results must be checked with your physical cube before relying on timing or optimality. · Data stored locally in your browser.</footer>
  </main>;
}
