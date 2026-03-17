import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { POWERUP_DEFS, type PowerUpKey } from "@shared/schema";

// ── CONSTANTS ────────────────────────────────────────────────
const COLS = 7, ROWS = 7;
const BASE_SURGE = 20000;
const DPR = window.devicePixelRatio || 1;
const MULT_DECAY = 12000;

// Harder leveling: higher levels need exponentially more XP
const LEVEL_THRESHOLDS = [
  0, 500, 1200, 2200, 3700, 5700, 8500, 12500, 18000, 25500,
  35000, 48000, 65000, 87000, 115000, 150000, 195000, 252000, 325000, 420000
];
function getLevelFromXP(xp: number) {
  let l = 0;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) { l = i; break; }
  }
  return Math.min(l, LEVEL_THRESHOLDS.length - 1);
}
function xpPct(xp: number, level: number) {
  if (level >= LEVEL_THRESHOLDS.length - 1) return 100;
  const s = LEVEL_THRESHOLDS[level], e = LEVEL_THRESHOLDS[level + 1];
  return Math.min(((xp - s) / (e - s)) * 100, 100);
}

// Encouragement messages keyed by combo/context
const ENCOURAGE: string[] = [
  "NICE!", "GREAT!", "AMAZING!", "FIRE!", "BEAST MODE!",
  "LOCKED IN!", "CLEAN!", "SMOOTH!", "LETS GO!", "TOO EASY!",
  "UNSTOPPABLE!", "GOATED!", "DIFFERENT LEVEL!", "ELITE!", "W PLAY!"
];
function randEncourage() { return ENCOURAGE[Math.floor(Math.random() * ENCOURAGE.length)]; }

// ── SHAPES ───────────────────────────────────────────────────
const SHAPES = [
  { cells: [[0,0]], color: 0 },
  { cells: [[0,0],[0,1]], color: 1 }, { cells: [[0,0],[1,0]], color: 1 },
  { cells: [[0,0],[0,1],[0,2]], color: 2 }, { cells: [[0,0],[1,0],[2,0]], color: 2 },
  { cells: [[0,0],[1,0],[1,1]], color: 3 }, { cells: [[0,0],[0,1],[1,0]], color: 3 },
  { cells: [[0,1],[1,0],[1,1]], color: 3 }, { cells: [[0,0],[0,1],[1,1]], color: 3 },
  { cells: [[0,0],[0,1],[1,0],[1,1]], color: 5 },
  { cells: [[0,0],[0,1],[0,2],[1,1]], color: 6 },
  { cells: [[0,1],[1,0],[1,1],[1,2]], color: 6 },
  { cells: [[0,0],[1,0],[1,1],[2,0]], color: 6 },
  { cells: [[0,1],[1,0],[1,1],[2,1]], color: 6 },
  { cells: [[0,0],[0,1],[0,2],[0,3]], color: 7 },
  { cells: [[0,0],[1,0],[2,0],[3,0]], color: 7 },
  { cells: [[0,0],[1,0],[0,1]], color: 5 },
];
const PIECE_COLORS = ["#7dd3fc","#818cf8","#34d399","#fb923c","#f472b6","#fbbf24","#60a5fa","#c084fc"];
type PowerType = "freeze"|"bomb"|"refresh";
const POWER_TYPES: PowerType[] = ["freeze","bomb","refresh"];
const LEVEL_REWARDS: Record<number,{type:string;power?:PowerUpKey;coins?:number;label:string}> = {
  2:{type:"power",power:"freeze5",label:"Freeze 5s unlocked"},
  3:{type:"coins",coins:100,label:"+100 coins"},
  4:{type:"power",power:"bomb",label:"Free Bomb"},
  5:{type:"coins",coins:150,label:"+150 coins"},
  6:{type:"power",power:"freeze10",label:"Freeze 10s unlocked"},
  7:{type:"coins",coins:200,label:"+200 coins"},
  8:{type:"power",power:"clearRow",label:"Free Clear Row"},
  9:{type:"coins",coins:250,label:"+250 coins"},
  10:{type:"power",power:"clearAll",label:"Free Clear All!"},
  12:{type:"coins",coins:300,label:"+300 coins"},
  14:{type:"power",power:"freeze30",label:"Freeze 30s unlocked"},
  15:{type:"coins",coins:500,label:"+500 coins bonus"},
};

interface Cell { filled:boolean; color:string|null; surge:boolean; power:PowerType|null; }
interface Piece { cells:number[][]; color:string; placed:boolean; }
interface DragState { pieceIdx:number; gridR:number; gridC:number; valid:boolean; }

// Mutable game state refs
let _grid: Cell[][] = [];
let _score=0, _combo=0, _multiplier=1, _multTimer=0;
let _surgeTimer=0, _surgeFrozen=false, _surgeFreeze=0, _surgeFreezeDur=0, _surgeDelay=BASE_SURGE;
let _xp=0, _level=1, _paused=false;
let _xpGainedThisGame=0;
// Rows/cols that are about to be cleared (for highlight)
let _highlightRows: Set<number> = new Set();
let _highlightCols: Set<number> = new Set();

function makeGrid():Cell[][] { return Array.from({length:ROWS},()=>Array.from({length:COLS},()=>({filled:false,color:null,surge:false,power:null}))); }
function randPiece():Piece { const s=SHAPES[Math.floor(Math.random()*SHAPES.length)]; return {cells:s.cells,color:PIECE_COLORS[s.color],placed:false}; }
function canPlace(cells:number[][],row:number,col:number):boolean {
  for(const[dr,dc] of cells){const r=row+dr,c=col+dc; if(r<0||r>=ROWS||c<0||c>=COLS||_grid[r][c].filled) return false;} return true;
}

function rr(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number){
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
}
function drawCell(ctx:CanvasRenderingContext2D,x:number,y:number,sz:number,color:string,surge:boolean,power:boolean){
  const p=2,r=3; ctx.save();
  if(surge&&!power){const g=ctx.createLinearGradient(x,y,x+sz,y+sz);g.addColorStop(0,"#ef4444");g.addColorStop(1,"#f97316");ctx.fillStyle=g;}
  else if(power){const g=ctx.createRadialGradient(x+sz/2,y+sz/2,0,x+sz/2,y+sz/2,sz/2);g.addColorStop(0,"#fff");g.addColorStop(0.5,"#bae6fd");g.addColorStop(1,"#0284c7");ctx.fillStyle=g;}
  else ctx.fillStyle=color;
  ctx.shadowColor=power?"#fff":surge?"#f97316":color; ctx.shadowBlur=power?12:surge?8:5;
  rr(ctx,x+p,y+p,sz-p*2,sz-p*2,r); ctx.fill();
  ctx.shadowBlur=0; ctx.globalAlpha=0.25; ctx.fillStyle="#fff";
  rr(ctx,x+p+2,y+p+2,sz-p*2-4,(sz-p*2)*0.32,2); ctx.fill();
  ctx.restore();
}
function drawPowerIcon(ctx:CanvasRenderingContext2D,x:number,y:number,sz:number,power:PowerType){
  const icons={freeze:"❄",bomb:"💥",refresh:"🔀"};
  ctx.save();ctx.font=`${Math.floor(sz*0.44)}px serif`;ctx.textAlign="center";ctx.textBaseline="middle";
  ctx.shadowColor="#fff";ctx.shadowBlur=5;ctx.fillText(icons[power],x+sz/2,y+sz/2+1);ctx.restore();
}

export default function GameTab({ onLoginClick }:{onLoginClick:()=>void}) {
  const { user, refreshUser } = useAuth();
  const [gameState, setGameState] = useState<"menu"|"playing"|"paused"|"gameover">("menu");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [surgeProgress, setSurgeProgress] = useState(0);
  const [surgeFrozen, setSurgeFrozen] = useState(false);
  const [trayPieces, setTrayPieces] = useState<Piece[]>([]);
  const [dragState, setDragState] = useState<DragState|null>(null);
  const [toastMsg, setToastMsg] = useState<{text:string;color:string}|null>(null);
  const [flashColor, setFlashColor] = useState<string|null>(null);
  const [levelUpInfo, setLevelUpInfo] = useState<{newLevel:number;reward:string}|null>(null);
  const [xp, setXp] = useState(0);
  const [level, setLevel] = useState(1);
  const [coins, setCoins] = useState(0);
  const [inventory, setInventory] = useState<Record<string,number>>({});
  const [pulseGrid, setPulseGrid] = useState(false);

  const gcRef=useRef<HTMLCanvasElement>(null), tcRef=useRef<HTMLCanvasElement>(null);
  const animRef=useRef<number>(0), lastTsRef=useRef(0);
  const dragRef=useRef<DragState|null>(null), trayRef=useRef<Piece[]>([]);
  const stateRef=useRef<"menu"|"playing"|"paused"|"gameover">("menu");
  const scoreRef=useRef(0), highRef=useRef(0);
  const toastTRef=useRef<ReturnType<typeof setTimeout>|null>(null);
  const ghostRef=useRef<HTMLCanvasElement|null>(null);
  const xpRef=useRef(0), levelRef=useRef(1);
  const invRef=useRef<Record<string,number>>({});

  useEffect(()=>{
    if(user){
      xpRef.current=user.xp; levelRef.current=user.level;
      setXp(user.xp); setLevel(user.level);
      setCoins(user.coins);
      setHighScore(user.highScore); highRef.current=user.highScore;
      invRef.current=user.inventory as Record<string,number>;
      setInventory({...user.inventory as Record<string,number>});
    }
  },[user?.id]);

  const cellSz = useRef(40);
  const computeCell = useCallback(()=>{
    const vw=window.innerWidth, vh=window.innerHeight;
    const maxW=Math.min(vw-16,360), maxH=vh-300;
    cellSz.current = Math.max(26,Math.min(48,Math.floor(Math.min(maxW/COLS,maxH/ROWS))));
  },[]);

  const resizeCanvases=useCallback(()=>{
    computeCell(); const cs=cellSz.current;
    const gc=gcRef.current,tc=tcRef.current; if(!gc||!tc) return;
    const gw=COLS*cs,gh=ROWS*cs;
    gc.style.width=gw+"px";gc.style.height=gh+"px";gc.width=gw*DPR;gc.height=gh*DPR;
    gc.getContext("2d")!.scale(DPR,DPR);
    const tw=Math.min(window.innerWidth-16,360),th=cs*4+14;
    tc.style.width=tw+"px";tc.style.height=th+"px";tc.width=tw*DPR;tc.height=th*DPR;
    tc.getContext("2d")!.scale(DPR,DPR);
  },[computeCell]);

  const renderGrid=useCallback(()=>{
    const gc=gcRef.current; if(!gc) return;
    const ctx=gc.getContext("2d")!,cs=cellSz.current,gw=COLS*cs,gh=ROWS*cs;
    ctx.clearRect(0,0,gw,gh);
    ctx.fillStyle="#0d1626";rr(ctx,0,0,gw,gh,6);ctx.fill();

    // Draw highlight overlay for rows/cols about to clear
    _highlightRows.forEach(r=>{
      ctx.save();
      const pulse = (Date.now()%600)/600;
      ctx.globalAlpha=0.18+0.18*Math.sin(pulse*Math.PI*2);
      ctx.fillStyle="#7dd3fc";
      ctx.fillRect(0,r*cs,gw,cs);
      ctx.restore();
    });
    _highlightCols.forEach(c=>{
      ctx.save();
      const pulse = (Date.now()%600)/600;
      ctx.globalAlpha=0.18+0.18*Math.sin(pulse*Math.PI*2);
      ctx.fillStyle="#7dd3fc";
      ctx.fillRect(c*cs,0,cs,gh);
      ctx.restore();
    });

    ctx.strokeStyle="#1e3050";ctx.lineWidth=0.5;
    for(let r=0;r<=ROWS;r++){ctx.beginPath();ctx.moveTo(0,r*cs);ctx.lineTo(gw,r*cs);ctx.stroke();}
    for(let c=0;c<=COLS;c++){ctx.beginPath();ctx.moveTo(c*cs,0);ctx.lineTo(c*cs,gh);ctx.stroke();}
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
      const cell=_grid[r][c]; if(cell.filled){drawCell(ctx,c*cs,r*cs,cs,cell.color!,cell.surge,!!cell.power); if(cell.power) drawPowerIcon(ctx,c*cs,r*cs,cs,cell.power);}
    }

    // Draw highlight borders on about-to-clear rows/cols
    if(_highlightRows.size>0||_highlightCols.size>0){
      ctx.save();
      ctx.strokeStyle="#38bdf8";
      ctx.lineWidth=2;
      ctx.shadowColor="#7dd3fc";
      ctx.shadowBlur=10;
      _highlightRows.forEach(r=>{
        ctx.strokeRect(2,r*cs+2,gw-4,cs-4);
      });
      _highlightCols.forEach(c=>{
        ctx.strokeRect(c*cs+2,2,cs-4,gh-4);
      });
      ctx.restore();
    }

    const drag=dragRef.current;
    if(drag){
      const piece=trayRef.current[drag.pieceIdx];
      if(piece&&!piece.placed) piece.cells.forEach(([dr,dc])=>{
        const r=drag.gridR+dr,c=drag.gridC+dc;
        if(r>=0&&r<ROWS&&c>=0&&c<COLS){
          ctx.save();ctx.globalAlpha=drag.valid?0.45:0.18;drawCell(ctx,c*cs,r*cs,cs,drag.valid?piece.color:"#ef4444",false,false);ctx.restore();
          if(drag.valid){ctx.save();ctx.strokeStyle=piece.color;ctx.lineWidth=2;ctx.shadowColor=piece.color;ctx.shadowBlur=8;ctx.strokeRect(c*cs+2,r*cs+2,cs-4,cs-4);ctx.restore();}
        }
      });
    }
  },[]);

  const renderTray=useCallback(()=>{
    const tc=tcRef.current; if(!tc) return;
    const ctx=tc.getContext("2d")!,cs=cellSz.current,tw=tc.width/DPR,th=tc.height/DPR;
    ctx.clearRect(0,0,tw,th);ctx.fillStyle="#0d1626";rr(ctx,0,0,tw,th,6);ctx.fill();
    ctx.strokeStyle="#1e3050";ctx.lineWidth=1;
    for(let i=1;i<3;i++){ctx.beginPath();ctx.moveTo((tw/3)*i,6);ctx.lineTo((tw/3)*i,th-6);ctx.stroke();}
    const sw=tw/3;
    trayRef.current.forEach((piece,i)=>{
      if(!piece||piece.placed){ctx.save();ctx.globalAlpha=0.1;ctx.fillStyle="#fff";rr(ctx,i*sw+8,8,sw-16,th-16,5);ctx.fill();ctx.restore();return;}
      const isDrag=dragRef.current?.pieceIdx===i;
      const mR=Math.max(...piece.cells.map(([r])=>r))+1,mC=Math.max(...piece.cells.map(([_,c])=>c))+1;
      const tcs=Math.min(cs*0.8,(sw-18)/mC,(th-18)/mR);
      const ox=i*sw+sw/2-(mC*tcs)/2,oy=th/2-(mR*tcs)/2;
      ctx.save();if(isDrag)ctx.globalAlpha=0.25;
      piece.cells.forEach(([dr,dc])=>drawCell(ctx,ox+dc*tcs,oy+dr*tcs,tcs,piece.color,false,false));
      ctx.restore();
    });
  },[]);

  const renderAll=useCallback(()=>{renderGrid();renderTray();},[renderGrid,renderTray]);

  const showToast=useCallback((text:string,color:string)=>{
    setToastMsg({text,color});
    if(toastTRef.current) clearTimeout(toastTRef.current);
    toastTRef.current=setTimeout(()=>setToastMsg(null),2400);
  },[]);
  const showFlash=useCallback((color:string)=>{setFlashColor(color);setTimeout(()=>setFlashColor(null),300);},[]);

  const spawnScorePop=useCallback((pts:number,col:string,label?:string)=>{
    if(!gcRef.current) return;
    const rect=gcRef.current.getBoundingClientRect();
    const el=document.createElement("div");
    el.className="score-pop";el.textContent=label||`+${pts}`;el.style.color=col;
    el.style.left=(rect.left+rect.width/2-24)+"px";el.style.top=(rect.top+rect.height/2-40)+"px";
    document.body.appendChild(el);el.addEventListener("animationend",()=>el.remove());
  },[]);

  const spawnCoinPop=useCallback((c:number)=>{
    if(!gcRef.current) return;
    const rect=gcRef.current.getBoundingClientRect();
    const el=document.createElement("div");
    el.className="coin-pop";el.textContent=`🪙+${c}`;el.style.color="#fbbf24";el.style.fontWeight="900";el.style.fontSize="1rem";
    el.style.left=(rect.left+10)+"px";el.style.top=(rect.top+40)+"px";
    document.body.appendChild(el);el.addEventListener("animationend",()=>el.remove());
  },[]);

  const addXP=useCallback((pts:number)=>{
    const gained=Math.round(pts*0.15);
    const oldXP=xpRef.current,newXP=oldXP+gained;
    xpRef.current=newXP;_xp=newXP;_xpGainedThisGame+=gained;
    setXp(newXP);
    const oldL=getLevelFromXP(oldXP),newL=getLevelFromXP(newXP);
    if(newL>oldL){
      levelRef.current=newL;_level=newL;setLevel(newL);
      const reward=LEVEL_REWARDS[newL];
      setLevelUpInfo({newLevel:newL,reward:reward?.label||`Level ${newL}!`});
      setTimeout(()=>setLevelUpInfo(null),3000);
      if(reward?.type==="coins"&&reward.coins){
        setCoins(c=>c+reward.coins!);
        spawnCoinPop(reward.coins!);
      }
      if(reward?.type==="power"&&reward.power){
        const inv={...invRef.current};
        inv[reward.power]=(inv[reward.power]||0)+1;
        invRef.current=inv;setInventory({...inv});
        showToast(`🎁 ${reward.label}`,POWERUP_DEFS[reward.power]?.color||"#7dd3fc");
      }
    }
  },[spawnCoinPop,showToast]);

  const addScore=useCallback((base:number)=>{
    const pts=Math.round(base*_multiplier);
    _score+=pts;scoreRef.current=_score;setScore(_score);
    if(_score>highRef.current){highRef.current=_score;setHighScore(_score);}
    const col=_multiplier>=4?"#fbbf24":_multiplier>=2?"#fb923c":"#7dd3fc";
    spawnScorePop(pts,col);addXP(pts);
  },[spawnScorePop,addXP]);

  const triggerPower=useCallback((type:string,duration?:number)=>{
    if(type==="freeze"||type==="freeze5"||type==="freeze10"||type==="freeze30"){
      const dur=type==="freeze30"?30000:type==="freeze10"?10000:type==="freeze5"?5000:duration||5000;
      // Only apply if this duration is longer than what's remaining — never stack or shorten
      if(!_surgeFrozen||dur>_surgeFreeze){
        _surgeFrozen=true;
        _surgeFreeze=dur;   // exact allotted time — no more, no less
        _surgeFreezeDur=dur; // store original for progress bar
        _surgeTimer=0;
        setSurgeFrozen(true);
        showToast(`❄ FREEZE ${dur/1000}s!`,"#7dd3fc");showFlash("#7dd3fc18");
      }
    } else if(type==="bomb"){
      let b=0;
      for(let r=ROWS-1;r>=0&&b<2;r--){if(_grid[r].some(c=>c.surge)){for(let c=0;c<COLS;c++)_grid[r][c]={filled:false,color:null,surge:false,power:null};b++;}}
      if(b===0) for(let c=0;c<COLS;c++) _grid[ROWS-1][c]={filled:false,color:null,surge:false,power:null};
      addScore(250);showToast("💥 BOMB!","#fb923c");showFlash("#fb923c18");
    } else if(type==="refresh"){
      const np=trayRef.current.map(p=>p.placed?p:randPiece());trayRef.current=np;setTrayPieces([...np]);
      showToast("🔀 REFRESH!","#a78bfa");showFlash("#a78bfa18");
    } else if(type==="clearRow"){
      let cleared=false;
      for(let r=ROWS-1;r>=0&&!cleared;r--){
        if(_grid[r].some(c=>c.filled)){for(let c=0;c<COLS;c++)_grid[r][c]={filled:false,color:null,surge:false,power:null};cleared=true;}
      }
      addScore(150);showToast("💠 CLEAR ROW!","#818cf8");showFlash("#818cf818");
    } else if(type==="clearAll"){
      _grid=makeGrid();addScore(500);showToast("🌊 CLEAR ALL!","#34d399");showFlash("#34d39918");
    }
  },[addScore,showToast,showFlash]);

  // Update highlight state whenever drag position changes
  const updateHighlights=useCallback((piece:Piece|null,row:number,col:number,valid:boolean)=>{
    _highlightRows=new Set<number>();
    _highlightCols=new Set<number>();
    if(!piece||!valid||row<0||col<0) return;
    // Simulate placing piece, then find which rows/cols would be full
    const tempGrid=_grid.map(r=>r.map(c=>({...c})));
    for(const[dr,dc] of piece.cells){
      const r=row+dr,c=col+dc;
      if(r>=0&&r<ROWS&&c>=0&&c<COLS) tempGrid[r][c]={filled:true,color:piece.color,surge:false,power:null};
    }
    for(let r=0;r<ROWS;r++) if(tempGrid[r].every(c=>c.filled)) _highlightRows.add(r);
    for(let c=0;c<COLS;c++){let full=true;for(let r=0;r<ROWS;r++) if(!tempGrid[r][c].filled){full=false;break;} if(full) _highlightCols.add(c);}
  },[]);

  const clearLines=useCallback((anchorRow:number,anchorCol:number,placedCells:number[][])=>{
    const tR=[...new Set(placedCells.map(([dr])=>anchorRow+dr))];
    const tC=[...new Set(placedCells.map(([_,dc])=>anchorCol+dc))];
    const fR=tR.filter(r=>r>=0&&r<ROWS&&_grid[r].every(c=>c.filled));
    const fC=tC.filter(c=>{for(let r=0;r<ROWS;r++) if(!_grid[r][c].filled) return false;return true;});
    const total=fR.length+fC.length;
    _highlightRows=new Set(); _highlightCols=new Set();
    if(total===0){_multTimer=0;return;}
    const powers:PowerType[]=[]; const cleared=new Set<string>();
    fR.forEach(r=>{for(let c=0;c<COLS;c++){if(_grid[r][c].power)powers.push(_grid[r][c].power!);cleared.add(`${r},${c}`);}});
    fC.forEach(c=>{for(let r=0;r<ROWS;r++){const k=`${r},${c}`;if(!cleared.has(k)){if(_grid[r][c].power)powers.push(_grid[r][c].power!);cleared.add(k);}}});
    cleared.forEach(key=>{const[r,c]=key.split(",").map(Number);_grid[r][c]={filled:false,color:null,surge:false,power:null};});
    _combo++;setCombo(_combo);
    _multiplier=Math.min(_multiplier+total*0.5,8);_multTimer=MULT_DECAY;setMultiplier(Math.round(_multiplier*10)/10);
    _surgeTimer=0;
    const base=cleared.size*10*total;
    const cb=_combo>1?Math.round(base*(_combo-1)*0.4):0;
    addScore(base+cb);
    // Encouragement popup
    const msg=_combo>=5?"UNSTOPPABLE!":_combo>=3?"ON FIRE!":total>=2?"DOUBLE CLEAR!":randEncourage();
    const msgCol=_combo>=5?"#fbbf24":_combo>=3?"#fb923c":"#34d399";
    spawnScorePop(0,msgCol,msg);
    setPulseGrid(true); setTimeout(()=>setPulseGrid(false),350);
    if(_combo>1){
      document.querySelectorAll(".combo-badge").forEach(e=>e.remove());
      const el=document.createElement("div");el.className="combo-badge";el.textContent=`x${_combo} COMBO!`;
      el.style.color=_combo>=5?"#fbbf24":_combo>=3?"#fb923c":"#7dd3fc";
      el.style.top=(window.innerHeight*0.5)+"px";document.body.appendChild(el);
      el.addEventListener("animationend",()=>el.remove());
    }
    powers.forEach(p=>triggerPower(p));
  },[addScore,triggerPower,spawnScorePop]);

  const doSurge=useCallback(()=>{
    for(let r=0;r<ROWS-1;r++) for(let c=0;c<COLS;c++) _grid[r][c]={..._grid[r+1][c]};
    const gaps=2+Math.floor(Math.random()*3);
    const pool=Array.from({length:COLS},(_,i)=>i),gapArr:number[]=[];
    while(gapArr.length<gaps) gapArr.push(...pool.splice(Math.floor(Math.random()*pool.length),1));
    const nonGaps=Array.from({length:COLS},(_,i)=>i).filter(c=>!gapArr.includes(c));
    const pCol=Math.random()<0.35&&nonGaps.length>0?nonGaps[Math.floor(Math.random()*nonGaps.length)]:-1;
    for(let c=0;c<COLS;c++){
      if(gapArr.includes(c))_grid[ROWS-1][c]={filled:false,color:null,surge:false,power:null};
      else{const ip=c===pCol;_grid[ROWS-1][c]={filled:true,color:ip?"#fff":"#ef4444",surge:true,power:ip?POWER_TYPES[Math.floor(Math.random()*POWER_TYPES.length)]:null};}
    }
    for(let c=0;c<COLS;c++) if(_grid[0][c].filled){endGame();return;}
  },[]);

  const placePiece=useCallback((piece:Piece,row:number,col:number)=>{
    for(const[dr,dc] of piece.cells) _grid[row+dr][col+dc]={filled:true,color:piece.color,surge:false,power:null};
    _highlightRows=new Set(); _highlightCols=new Set();
    clearLines(row,col,piece.cells);
  },[clearLines]);

  const checkGameOver=useCallback(()=>{
    const av=trayRef.current.filter(p=>!p.placed);if(!av.length)return;
    const ok=av.some(p=>{for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) if(canPlace(p.cells,r,c))return true;return false;});
    if(!ok) endGame();
  },[]);

  const endGame=useCallback(async()=>{
    stateRef.current="gameover";cancelAnimationFrame(animRef.current);
    if(user){
      try{
        const res=await apiRequest("POST","/api/game/save",{score:scoreRef.current,xpGained:_xpGainedThisGame});
        if(res.ok){const d=await res.json();setCoins(d.user.coins);spawnCoinPop(d.coinsEarned);}
        await refreshUser();
      }catch{}
    }
    setTimeout(()=>setGameState("gameover"),300);
  },[user,refreshUser,spawnCoinPop]);

  const gameLoop=useCallback((ts:number)=>{
    if(stateRef.current!=="playing")return;
    const dt=Math.min(ts-lastTsRef.current,120);lastTsRef.current=ts;
    if(_paused)return;
    if(_multTimer>0){_multTimer-=dt;if(_multTimer<=0){_multTimer=0;_multiplier=Math.max(1,_multiplier-0.5);setMultiplier(Math.round(_multiplier*10)/10);}}
    if(_surgeFrozen){_surgeFreeze-=dt;if(_surgeFreeze<=0){_surgeFrozen=false;_surgeFreeze=0;_surgeFreezeDur=0;setSurgeFrozen(false);}setSurgeProgress(_surgeFreezeDur>0?_surgeFreeze/_surgeFreezeDur:0);}
    else{_surgeTimer+=dt;if(_surgeTimer>=_surgeDelay){_surgeTimer=0;doSurge();}setSurgeProgress(_surgeTimer/_surgeDelay);}
    renderAll();animRef.current=requestAnimationFrame(gameLoop);
  },[doSurge,renderAll]);

  const startGame=useCallback(()=>{
    _grid=makeGrid();_score=0;_combo=0;_multiplier=1;_multTimer=0;
    _surgeTimer=0;_surgeFrozen=false;_surgeFreeze=0;_surgeFreezeDur=0;_surgeDelay=BASE_SURGE;
    _paused=false;scoreRef.current=0;_xpGainedThisGame=0;
    _highlightRows=new Set();_highlightCols=new Set();
    if(user){xpRef.current=user.xp;levelRef.current=user.level;_xp=user.xp;_level=user.level;setXp(user.xp);setLevel(user.level);setInventory({...user.inventory as Record<string,number>});invRef.current=user.inventory as Record<string,number>;}
    setScore(0);setCombo(0);setMultiplier(1);setSurgeProgress(0);setSurgeFrozen(false);
    dragRef.current=null;setDragState(null);
    ghostRef.current&&ghostRef.current.remove();ghostRef.current=null;
    const pieces=[randPiece(),randPiece(),randPiece()];trayRef.current=pieces;setTrayPieces([...pieces]);
    stateRef.current="playing";setGameState("playing");cancelAnimationFrame(animRef.current);
    setTimeout(()=>{resizeCanvases();lastTsRef.current=performance.now();animRef.current=requestAnimationFrame(gameLoop);},50);
  },[resizeCanvases,gameLoop,user]);

  const togglePause=useCallback(()=>{
    if(stateRef.current==="playing"){_paused=!_paused;setGameState(_paused?"paused":"playing");}
  },[]);

  // ── DRAG ────────────────────────────────────────────────────
  const createGhost=useCallback((piece:Piece,cx:number,cy:number)=>{
    if(ghostRef.current){ghostRef.current.remove();ghostRef.current=null;}
    const cs=cellSz.current,mR=Math.max(...piece.cells.map(([r])=>r))+1,mC=Math.max(...piece.cells.map(([_,c])=>c))+1;
    const w=mC*cs,h=mR*cs;
    const el=document.createElement("canvas");el.width=w*DPR;el.height=h*DPR;
    el.style.cssText=`width:${w}px;height:${h}px;position:fixed;pointer-events:none;z-index:300;opacity:0.85;transform:translate(-50%,-50%);left:${cx}px;top:${cy}px;`;
    document.body.appendChild(el);ghostRef.current=el;
    const ctx=el.getContext("2d")!;ctx.scale(DPR,DPR);
    piece.cells.forEach(([dr,dc])=>drawCell(ctx,dc*cs,dr*cs,cs,piece.color,false,false));
  },[]);
  const moveGhost=useCallback((cx:number,cy:number)=>{if(ghostRef.current){ghostRef.current.style.left=cx+"px";ghostRef.current.style.top=cy+"px";}},[]);
  const destroyGhost=useCallback(()=>{if(ghostRef.current){ghostRef.current.remove();ghostRef.current=null;}},[]);

  const onTrayDown=useCallback((e:React.PointerEvent|React.TouchEvent)=>{
    if(stateRef.current!=="playing"||_paused) return;
    const raw="touches"in e?(e as React.TouchEvent).touches[0]:(e as React.PointerEvent);
    const cx=raw.clientX,cy=raw.clientY;
    const tc=tcRef.current;if(!tc) return;
    const rect=tc.getBoundingClientRect(),x=cx-rect.left,sw=rect.width/3;
    for(let i=0;i<3;i++){
      const piece=trayRef.current[i];if(!piece||piece.placed) continue;
      const cs=cellSz.current,mC=Math.max(...piece.cells.map(([_,c])=>c))+1;
      const tcs=Math.min(cs*0.8,(sw-18)/mC);
      const ox=i*sw+sw/2-(mC*tcs)/2;
      if(x>=ox-10&&x<=ox+mC*tcs+10){createGhost(piece,cx,cy);dragRef.current={pieceIdx:i,gridR:-99,gridC:-99,valid:false};setDragState({pieceIdx:i,gridR:-99,gridC:-99,valid:false});break;}
    }
  },[createGhost]);

  const onGlobalMove=useCallback((e:PointerEvent|TouchEvent)=>{
    if(!dragRef.current||stateRef.current!=="playing"||_paused) return;
    const raw="touches"in e?(e as TouchEvent).touches[0]:(e as PointerEvent);
    moveGhost(raw.clientX,raw.clientY);
    const gc=gcRef.current;if(!gc) return;
    const rect=gc.getBoundingClientRect(),gx=raw.clientX-rect.left,gy=raw.clientY-rect.top,cs=cellSz.current;
    const piece=trayRef.current[dragRef.current.pieceIdx];if(!piece) return;
    const mR=Math.max(...piece.cells.map(([r])=>r)),mC=Math.max(...piece.cells.map(([_,c])=>c));
    const col=Math.round((gx-(mC+1)*cs/2)/cs),row=Math.round((gy-(mR+1)*cs/2)/cs);
    const valid=canPlace(piece.cells,row,col);
    dragRef.current={pieceIdx:dragRef.current.pieceIdx,gridR:row,gridC:col,valid};
    setDragState({...dragRef.current});
    updateHighlights(piece,row,col,valid);
  },[moveGhost,updateHighlights]);

  const onGlobalUp=useCallback((e:PointerEvent|TouchEvent)=>{
    if(!dragRef.current||stateRef.current!=="playing"||_paused) return;
    const drag=dragRef.current,piece=trayRef.current[drag.pieceIdx];
    if(piece&&drag.valid&&drag.gridR>-99){
      piece.placed=true;placePiece(piece,drag.gridR,drag.gridC);
      const allPlaced=trayRef.current.every(p=>p.placed);
      if(allPlaced){const np=[randPiece(),randPiece(),randPiece()];trayRef.current=np;setTrayPieces([...np]);_multiplier=Math.min(_multiplier+1,8);_multTimer=MULT_DECAY;setMultiplier(Math.round(_multiplier*10)/10);addScore(75);}
      else setTrayPieces([...trayRef.current]);
      checkGameOver();
    }
    _highlightRows=new Set();_highlightCols=new Set();
    destroyGhost();dragRef.current=null;setDragState(null);
  },[placePiece,checkGameOver,destroyGhost,addScore]);

  useEffect(()=>{
    const mv=(e:PointerEvent|TouchEvent)=>{"touches"in e&&e.preventDefault();onGlobalMove(e);};
    const up=(e:PointerEvent|TouchEvent)=>{"touches"in e&&e.preventDefault();onGlobalUp(e);};
    window.addEventListener("pointermove",mv);window.addEventListener("pointerup",up);
    window.addEventListener("touchmove",mv as any,{passive:false});window.addEventListener("touchend",up as any,{passive:false});
    window.addEventListener("resize",resizeCanvases);
    return()=>{window.removeEventListener("pointermove",mv);window.removeEventListener("pointerup",up);window.removeEventListener("touchmove",mv as any);window.removeEventListener("touchend",up as any);window.removeEventListener("resize",resizeCanvases);};
  },[onGlobalMove,onGlobalUp,resizeCanvases]);
  useEffect(()=>()=>{cancelAnimationFrame(animRef.current);destroyGhost();},[destroyGhost]);

  const usePowerUp=useCallback(async(key:string)=>{
    if(stateRef.current!=="playing") return;
    const inv={...invRef.current};
    if(!inv[key]||inv[key]<=0) return;
    inv[key]--;if(inv[key]<=0) delete inv[key];
    invRef.current=inv;setInventory({...inv});
    triggerPower(key);
    if(user){ try{ await apiRequest("POST","/api/shop/use",{powerUp:key}); }catch{} }
  },[triggerPower,user]);

  const multColor=multiplier>=6?"#fbbf24":multiplier>=4?"#fb923c":multiplier>=2?"#a78bfa":"#7dd3fc";
  const curLevel=getLevelFromXP(xp);
  const xpP=xpPct(xp,curLevel);
  const powerUpKeys=Object.keys(inventory).filter(k=>inventory[k]>0);

  // ── ANIMATED PIXEL CHARACTERS for menu ───────────────────────────
  const PixelChar = ({ color, offset }: { color: string; offset: number }) => (
    <div className="flex flex-col items-center" style={{ animation: `float${offset} 2s ease-in-out infinite`, marginTop: offset*4 }}>
      <div style={{ width: 28, height: 28, background: color, borderRadius: 4, boxShadow: `0 0 12px ${color}88`, border: `2px solid ${color}cc` }} />
    </div>
  );

  return (
    <div className="flex flex-col items-center w-full h-full overflow-y-auto pb-2" style={{fontFamily:"'Courier New',monospace"}}>
      {flashColor&&<div className="power-flash" style={{background:flashColor}}/>}
      {toastMsg&&<div className="fixed top-16 left-1/2 -translate-x-1/2 z-[201] px-4 py-1.5 rounded-full font-black text-xs tracking-widest pointer-events-none" style={{background:"#000c",color:toastMsg.color,boxShadow:`0 0 20px ${toastMsg.color}88`,border:`1px solid ${toastMsg.color}44`}}>{toastMsg.text}</div>}
      {levelUpInfo&&<div className="levelup-banner top-20 px-6 py-3 rounded-xl text-center" style={{background:"#000d",border:"1px solid #fbbf2466",boxShadow:"0 0 30px #fbbf2444"}}><div className="text-lg font-black tracking-widest text-[#fbbf24] retro-glow">LEVEL UP!</div><div className="text-2xl font-black text-white">LVL {levelUpInfo.newLevel}</div><div className="text-xs text-[#7dd3fc] mt-0.5 tracking-wider">{levelUpInfo.reward}</div></div>}

      {/* MENU */}
      {gameState==="menu"&&(
        <div className="screen-enter flex flex-col items-center gap-4 pt-6 px-4 w-full max-w-sm">
          {/* TITLE */}
          <div className="text-center relative w-full">
            <div className="text-5xl font-black retro-glow" style={{color:"#7dd3fc",textShadow:"0 0 20px #7dd3fc88,0 0 50px #7dd3fc44"}}>GRID<span style={{color:"#38bdf8"}}>SURGE</span></div>
            <div className="text-[0.6rem] tracking-[0.3em] text-[#4a5580] mt-1">PLACE · CLEAR · SURVIVE</div>
          </div>

          {/* FLOATING GRID PREVIEW */}
          <div className="grid grid-cols-7 gap-0.5 p-2 rounded-xl" style={{background:"#0d1626",border:"1px solid #1e3050",boxShadow:"0 0 30px #7dd3fc18"}}>
            {Array.from({length:49}).map((_,i)=>{
              const colors=["#7dd3fc","#818cf8","#34d399","#fb923c","#f472b6","#fbbf24","#60a5fa","#c084fc","transparent"];
              const preset=[1,0,2,0,3,0,4,0,5,0,0,1,2,3,0,4,5,0,2,0,1,0,4,0,3,0,5,0,0,2,3,1,0,5,4,0,1,0,2,0,3,0,4,0,2,3,1,0,5];
              const c=colors[preset[i]||8];
              return <div key={i} style={{width:22,height:22,borderRadius:3,background:c==="transparent"?"#0d1626":c,boxShadow:c!=="transparent"?`0 0 6px ${c}66`:undefined,border:c==="transparent"?"1px solid #1e3050":"none",opacity:c==="transparent"?0.3:1}} />;
            })}
          </div>

          {/* FEATURE BADGES */}
          <div className="flex flex-wrap gap-2 justify-center">
            {[["🎮","7x7 Grid"],["⚡","Power-Ups"],["🎲","Casino"],["👥","Friends"],["🏆","Leaderboard"],["🪙","Coins"]].map(([icon,label])=>(
              <div key={label} className="flex items-center gap-1 px-2 py-1 rounded-full text-[0.55rem] font-bold tracking-wider" style={{background:"#111828",border:"1px solid #1e3050",color:"#7dd3fc"}}>
                <span>{icon}</span><span>{label}</span>
              </div>
            ))}
          </div>

          {/* STATS PREVIEW (if logged in) */}
          {user&&(
            <div className="w-full retro-border rounded-xl px-4 py-3 flex justify-between items-center bg-[#0d1220]">
              <div className="text-center"><div className="text-[0.5rem] text-[#4a5580]">LEVEL</div><div className="text-xl font-black text-[#fbbf24]">{user.level}</div></div>
              <div className="text-center"><div className="text-[0.5rem] text-[#4a5580]">HIGH SCORE</div><div className="text-xl font-black text-white">{user.highScore.toLocaleString()}</div></div>
              <div className="text-center"><div className="text-[0.5rem] text-[#4a5580]">COINS</div><div className="text-xl font-black text-[#fbbf24]">🪙{user.coins}</div></div>
            </div>
          )}

          {/* HOW TO PLAY */}
          <div className="w-full retro-border rounded-xl p-3 bg-[#0d1220] space-y-1">
            <div className="text-[#7dd3fc] text-xs font-bold tracking-widest mb-1">HOW TO PLAY</div>
            {[["🟦","Drag pieces from the tray onto the grid"],["✅","Fill a full row OR column to clear it"],["⚡","Clearing lines resets the surge timer"],["🔴","Surge wall rises every 30 seconds"],["💀","Game over if pieces reach the top"]].map(([icon,txt])=>(
              <div key={txt as string} className="flex gap-2 text-[0.6rem] text-[#4a5580]">
                <span>{icon}</span><span>{txt}</span>
              </div>
            ))}
          </div>

          <div className="w-full flex flex-col gap-2">
            <button onClick={startGame} className="w-full py-3 retro-btn text-[#0d1220] font-black text-sm rounded-xl" style={{background:"linear-gradient(135deg,#7dd3fc,#38bdf8)",boxShadow:"0 0 20px #7dd3fc55"}}>► PLAY NOW</button>
            {!user&&<button onClick={onLoginClick} className="w-full py-2.5 retro-btn text-[#7dd3fc] text-xs rounded-xl border border-[#7dd3fc44] hover:bg-[#7dd3fc12]">LOGIN TO SAVE PROGRESS & EARN COINS</button>}
          </div>
          <div className="text-[0.55rem] tracking-[0.15em] text-[#2a3560]">Developed by KJB</div>
        </div>
      )}

      {/* PLAYING / PAUSED */}
      {(gameState==="playing"||gameState==="paused")&&(
        <div className="flex flex-col items-center gap-1.5 w-full max-w-[380px] px-2 pt-1">
          {/* TOP BAR */}
          <div className="w-full flex justify-between items-center px-1">
            <div className="text-center min-w-[64px]"><div className="text-[0.5rem] tracking-widest text-[#4a5580]">SCORE</div><div className="text-lg font-black text-white">{score.toLocaleString()}</div></div>
            <div className="flex flex-col items-center gap-0.5">
              {multiplier>1&&<div className="text-[0.65rem] font-black px-2 py-0.5 rounded-full mult-pulse" style={{background:`${multColor}22`,color:multColor,border:`1px solid ${multColor}55`}}>{multiplier.toFixed(1)}×</div>}
              <button onClick={togglePause} className="text-[0.6rem] retro-btn text-[#4a5580] border border-[#1e2840] px-2 py-0.5 rounded hover:text-[#7dd3fc]">{gameState==="paused"?"▶ RESUME":"⏸ PAUSE"}</button>
            </div>
            <div className="text-center min-w-[64px]"><div className="text-[0.5rem] tracking-widest text-[#4a5580]">BEST</div><div className="text-lg font-black text-white">{highScore.toLocaleString()}</div></div>
          </div>
          {/* XP BAR */}
          <div className="w-full px-1"><div className="flex justify-between mb-0.5"><span className="text-[0.5rem] text-[#a78bfa]">LVL {curLevel}</span><span className="text-[0.5rem] text-[#4a5580]">{xp.toLocaleString()} XP</span></div><div className="w-full h-0.5 bg-[#1a1a2e] rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-300" style={{width:`${xpP}%`,background:"linear-gradient(90deg,#a78bfa,#ec4899)"}}/></div></div>
          {/* SURGE BAR */}
          <div className="w-full flex items-center gap-2 px-1"><span className="text-[0.5rem] text-[#ef4444] font-bold min-w-[40px]">SURGE</span><div className="flex-1 h-0.5 bg-[#1a1a2e] rounded-full overflow-hidden"><div className="h-full rounded-full surge-fill-anim" style={{width:`${surgeProgress*100}%`,background:surgeFrozen?"linear-gradient(90deg,#38bdf8,#7dd3fc)":"linear-gradient(90deg,#ef4444,#f97316)"}}/></div>{surgeFrozen&&<span className="text-[0.5rem] text-[#7dd3fc]">❄ FROZEN</span>}</div>
          {/* GRID */}
          <div className="relative" style={{transition:"transform 0.15s",transform:pulseGrid?"scale(1.012)":"scale(1)"}}>
            {gameState==="paused"&&<div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 rounded-lg"><div className="text-2xl font-black text-[#7dd3fc] retro-glow">PAUSED</div></div>}
            <canvas ref={gcRef} className="rounded-lg cursor-crosshair"/>
          </div>
          {/* TRAY */}
          <canvas ref={tcRef} className="rounded-lg" onPointerDown={onTrayDown as any} onTouchStart={onTrayDown as any}/>
          {/* POWER-UP INVENTORY BAR */}
          {powerUpKeys.length>0&&(
            <div className="flex gap-1.5 items-center flex-wrap justify-center w-full px-1">
              <span className="text-[0.5rem] text-[#4a5580]">POWERS:</span>
              {powerUpKeys.map(k=>{
                const def=POWERUP_DEFS[k as PowerUpKey];if(!def) return null;
                return(<button key={k} onClick={()=>usePowerUp(k)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs retro-btn hover:scale-110 transition-transform active:scale-95" style={{background:`${def.color}22`,border:`1px solid ${def.color}55`,color:def.color,boxShadow:`0 0 6px ${def.color}33`}} title={def.description}>{def.icon}<span>{inventory[k]}</span></button>);
              })}
            </div>
          )}
          {!user&&<button onClick={onLoginClick} className="text-[0.55rem] text-[#4a5580] retro-btn hover:text-[#7dd3fc]">Login to save progress</button>}
        </div>
      )}

      {/* GAME OVER */}
      {gameState==="gameover"&&(
        <div className="screen-enter flex flex-col items-center gap-4 pt-6 px-4 w-full max-w-xs">
          <div className="text-3xl font-black tracking-widest retro-glow" style={{color:"#ef4444",textShadow:"0 0 20px #ef444466"}}>GAME OVER</div>
          <div className="flex gap-6"><div className="text-center"><div className="text-[0.5rem] text-[#4a5580]">SCORE</div><div className="text-4xl font-black text-white">{score.toLocaleString()}</div></div><div className="text-center"><div className="text-[0.5rem] text-[#4a5580]">BEST</div><div className="text-4xl font-black text-white">{highScore.toLocaleString()}</div></div></div>
          {score>=highScore&&score>0&&<div className="bg-[#fbbf24] text-black text-xs font-black tracking-widest px-4 py-1.5 rounded-full retro-btn">NEW BEST!</div>}
          <div className="flex items-center gap-2 w-full bg-[#a78bfa11] border border-[#a78bfa33] rounded-lg px-3 py-2"><span className="text-[#a78bfa]">⭐</span><span className="text-xs text-[#a78bfa] font-black">Level {curLevel}</span><div className="flex-1 h-1 bg-[#1a1a2e] rounded-full overflow-hidden ml-1"><div className="h-full rounded-full" style={{width:`${xpP}%`,background:"linear-gradient(90deg,#a78bfa,#ec4899)"}}/></div></div>
          <div className="flex gap-2 w-full">
            <button onClick={startGame} className="flex-1 py-2.5 retro-btn text-[#0d1220] font-black text-sm rounded" style={{background:"#7dd3fc"}}>PLAY AGAIN</button>
            <button onClick={()=>setGameState("menu")} className="flex-1 py-2.5 retro-btn text-[#7dd3fc] text-sm rounded border border-[#7dd3fc44]">MENU</button>
          </div>
        </div>
      )}
    </div>
  );
}
