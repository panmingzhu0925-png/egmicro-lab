/* Independent V3 app. Never invokes forwardSolve or EG12523Transient. */
let spiceWorker=null,spiceData=null,spiceCompiled=null,spiceTimer=null,spiceBegan=0,spiceRevision=0;
const spiceActive=new Set(['bus','vo','il','VIN','VCC','FB','vgsQ1','vgsQ2','im']);
function update(){
 try{localStorage.setItem(circuitStorageKey('circuit-draft'),JSON.stringify(circuit))}catch{}
 try{
  const next=EG12523Spice.compile(circuit,spiceOptions()),same=spiceCompiled?.text===next.text;spiceCompiled=next;
  el('spiceNetlist').textContent=next.text;if(el('spiceAssumptions'))el('spiceAssumptions').textContent=next.assumptions.join('；');
  if(same){el('netStatus').textContent='布局已保存；电气网表未改变，保留当前求解。';spiceRender();return}
  spiceRevision++;if(spiceWorker){spiceWorker.terminate();spiceWorker=null;spiceRunState(false,'电路已修改，已取消旧求解')}spiceData=null;el('netStatus').textContent='网表已更新，点击运行重新求解。';
 }catch(e){spiceRevision++;spiceWorker?.terminate();spiceWorker=null;spiceRunState(false,'参数或连接需要修正');spiceData=null;spiceCompiled=null;el('netStatus').textContent=e.message}
 for(const id of ['out','loadCurrentOut','loadPowerOut','irms','peak','ripple'])el(id).textContent='—';spiceRender();
}
function syncSliders(){} // Legacy editor calls this only for its hidden summary inputs.
function spiceLoadEditor(){
 const points=circuit.loadProgram?.points??[{t:0,current:circuit.parts.find(p=>p.id==='LOAD')?.value??2},{t:.85,current:2}];
 el('loadMode').value=circuit.loadProgram?.enabled?'program':'fixed';el('loadProgramEditor').hidden=el('loadMode').value!=='program';el('fixedLoadRow').hidden=el('loadMode').value==='program';
 el('loadProgramRows').innerHTML=points.map((p,i)=>`<tr><td><input data-load-row="${i}" data-field="t" type="number" min="0" step=".001" value="${p.t}"></td><td><input data-load-row="${i}" data-field="current" type="number" min="0" step=".1" value="${p.current}"></td><td>${i?((p.current-points[i-1].current)/(p.t-points[i-1].t)).toFixed(0):'—'}</td><td><button data-load-remove="${i}" aria-label="删除时间点">×</button></td></tr>`).join('');
 el('loadProgramRows').onchange=e=>{if(!e.target.dataset.field)return;let index=Number(e.target.dataset.loadRow);circuit.loadProgram.points[index][e.target.dataset.field]=Number(e.target.value);update();spiceLoadEditor()};
 el('loadProgramRows').onclick=e=>{let i=e.target.dataset.loadRemove;if(i===undefined)return;if(points.length<=2)return;circuit.loadProgram.points.splice(Number(i),1);update();spiceLoadEditor()};
}
function spiceOptions(){return {duration:Number(el('fullDuration').value),maxStep:Number(el('spiceStep').value)*1e-9,lineHz:Number(el('freqLine').value),sampleStep:Number(el('spiceSample').value)*1e-9}}
function spiceRunState(running,text){el('fullRun').disabled=running;el('fullStop').disabled=!running;el('spiceStatus').textContent=text;el('fullRun').classList.toggle('active',!running);el('fullStop').classList.toggle('active',running);clearInterval(spiceTimer);if(running){if(!spiceBegan)spiceBegan=performance.now();spiceTimer=setInterval(()=>{el('spiceStatus').textContent=text+' · 已用 '+((performance.now()-spiceBegan)/1000).toFixed(1)+'s'},300)}else spiceBegan=0}
async function spiceLoadDefaultWave(){
 const revision=spiceRevision,compiled=spiceCompiled;if(!compiled)return;
 try{const response=await fetch('default-wave-cache.json?v=spice-v3-1');if(!response.ok)return;const cache=await response.json(),hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(compiled.text)),signature=[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');if(spiceRevision!==revision||cache.version!==1||cache.netlistSHA256!==signature)return;spiceData=cache.result;el('pfcReadout').textContent=cache.note;el('spiceEnd').value=compiled.duration*1000;el('spiceLog').textContent=cache.engine+'\n'+cache.note;spiceRunState(false,'默认 ngspice 预计算波形已载入 · 参数改变后请重新运行');spiceRender()}catch{/* A missing or mismatching cache never substitutes for a solve. */}
}
function spiceSummary(){
 if(!spiceData)return;const time=spiceData.data.find(q=>q.name==='time').values,map=new Map(spiceData.data.map(q=>[q.name.toLowerCase(),q.values]));
 const get=key=>{const e=spiceCompiled.probes.find(q=>q.key===key)?.expression;if(!e)return null;const m=e.match(/^v\(([^,()]+),([^()]+)\)$/);return m?i=>(map.get('v('+m[1]+')')?.[i]??0)-(map.get('v('+m[2]+')')?.[i]??0):i=>map.get(e.toLowerCase())?.[i]};
 const vo=get('vo'),il=get('il'),iset=get('iset'),gate=get('vgsQ2');let start=time.length-1;while(start>0&&time[start]>time.at(-1)-.002)start--;let sumV=0,sumI=0,sumP=0,peak=-Infinity,lo=Infinity,hi=-Infinity,edges=[];
 for(let i=start;i<time.length;i++){const v=vo(i),current=iset(i)*v/Math.max(v,.5);sumV+=v;sumI+=current;sumP+=v*current;peak=Math.max(peak,il(i));lo=Math.min(lo,v);hi=Math.max(hi,v);if(i>start&&gate(i-1)<=8&&gate(i)>8)edges.push(time[i-1]+(time[i]-time[i-1])*(8-gate(i-1))/(gate(i)-gate(i-1)))}
 const count=time.length-start;el('out').textContent=(sumV/count).toFixed(3)+' V';el('loadCurrentOut').textContent=(sumI/count).toFixed(3)+' A';el('loadPowerOut').textContent=(sumP/count).toFixed(2)+' W';el('peak').textContent=peak.toFixed(3)+' A';el('ripple').textContent=((hi-lo)*1000).toFixed(1)+' mVpp';el('irms').textContent=edges.length>1?((edges.length-1)/(edges.at(-1)-edges[0])/1000).toFixed(2)+' kHz':'边沿不足';
}
function spiceRender(){
 spiceSummary();
 const svg=el('pfcWave');if(!spiceData){svg.innerHTML='<text x="30" y="55" fill="#abc4d9">运行后显示 ngspice 实际求解数据</text>';return}
 const time=spiceData.data.find(q=>q.name==='time').values,byName=new Map(spiceData.data.map(q=>[q.name.toLowerCase(),q.values]));
 const valueCache=new Map();const valuesFor=expression=>{if(valueCache.has(expression))return valueCache.get(expression);let m=expression.match(/^v\(([^,()]+),([^()]+)\)$/);if(!m)return byName.get(expression.toLowerCase())??byName.get('i('+expression.toLowerCase()+')');let a=m[1]==='0'?null:byName.get(`v(${m[1]})`.toLowerCase()),b=m[2]==='0'?null:byName.get(`v(${m[2]})`.toLowerCase());let value=time.map((_,i)=>(a?.[i]??0)-(b?.[i]??0));valueCache.set(expression,value);return value};
 const start=Number(el('spiceStart').value)/1000,end=Number(el('spiceEnd').value)/1000;
 if(!(end>start))return;
 let groups=['输入','芯片引脚','驱动与功率管','变压器','次级二极管','输出'],out='',row=0;
 for(const group of groups){const all=spiceCompiled.probes.filter(q=>q.group===group),active=all.filter(q=>spiceActive.has(q.key));out+=`<text x="80" y="${row+22}" fill="#c4d9e8" font-size="13">${group}</text>`;let bx=80;
  all.forEach((q,j)=>{bx=80+(j%7)*134;const buttonY=row+Math.floor(j/7)*30;const color=['#65c5ff','#ffd778','#8cd29e','#db9fee','#f69b8e','#b9dbe7'][j%6];out+=`<g data-probe="${q.key}" style="cursor:pointer"><rect x="${bx}" y="${buttonY+30}" width="128" height="24" rx="4" fill="${spiceActive.has(q.key)?'#345267':'#223443'}"/><text x="${bx+7}" y="${buttonY+47}" fill="${spiceActive.has(q.key)?color:'#8596a5'}" font-size="11">${pfcSafe(q.label)} / ${q.unit}</text></g>`;bx+=134});
  const extra=Math.max(0,Math.ceil(all.length/7)-1)*30,top=row+72+extra,h=120;let series=active.map(q=>({q,values:q.terms?time.map((_,i)=>q.terms.reduce((sum,t)=>sum+(valuesFor(t.expression)?.[i]??0)*t.factor,0)):valuesFor(q.expression)})).filter(q=>q.values);
  // Voltage and current have independent scales within each group.
  for(const [axis,unit] of [...new Set(series.map(s=>s.q.unit))].entries()){let selected=series.filter(q=>q.q.unit===unit);if(!selected.length)continue;let min=Infinity,max=-Infinity;for(let i=0;i<time.length;i++)if(time[i]>=start&&time[i]<=end)for(const s of selected){min=Math.min(min,s.values[i]);max=Math.max(max,s.values[i])}if(!Number.isFinite(min))continue;let pad=Math.max(.05,(max-min)*.08);min-=pad;max+=pad;out+=`<text x="${axis===0?8:900}" y="${top+10}" fill="#9ab4c8" font-size="11">${max.toFixed(2)} ${unit}</text><text x="${axis===0?8:900}" y="${top+h}" fill="#9ab4c8" font-size="11">${min.toFixed(2)}</text>`;
   for(const s of selected){let points=[];const buckets=new Map();for(let i=0;i<time.length;i++){if(time[i]<start||time[i]>end)continue;let x=Math.floor((time[i]-start)/(end-start)*800),b=buckets.get(x);if(!b)buckets.set(x,[i,i]);else{if(s.values[i]<s.values[b[0]])b[0]=i;if(s.values[i]>s.values[b[1]])b[1]=i}}for(const b of buckets.values())for(const i of [...new Set(b)].sort((a,b)=>a-b))points.push(`${(80+(time[i]-start)/(end-start)*800).toFixed(2)},${(top+h-(s.values[i]-min)/(max-min)*h).toFixed(2)}`);let index=all.findIndex(q=>q.key===s.q.key),color=['#65c5ff','#ffd778','#8cd29e','#db9fee','#f69b8e','#b9dbe7'][index%6];out+=`<polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="1.2"/>`}
  }out+=`<path d="M80 ${top+h}H880" stroke="#466071"/><text x="80" y="${top+h+20}" fill="#9ab4c8" font-size="11">${start*1000} ms</text><text x="815" y="${top+h+20}" fill="#9ab4c8" font-size="11">${end*1000} ms</text>`;row+=235+extra;
 }svg.setAttribute('viewBox',`0 0 1100 ${row}`);svg.innerHTML=out;
}
async function spiceBoot(){
 document.title='EG12523 · ngspice V3 实验版';
 el('simulationMount').innerHTML='<label>仿真时长 / s <input id="fullDuration" type="number" min=".001" max="1" step=".01" value=".85"></label><div style="display:flex;gap:8px;margin:12px 0"><button id="fullRun">▶ 运行</button><button id="fullStop" disabled>■ 停止</button></div>';
 const heading=document.querySelector('h1');if(heading)heading.textContent='EG12523 · ngspice V3';
 for(const [id,title,note] of [['out','输出电压','末2ms记录平均值'],['loadCurrentOut','输出负载电流','实际负载支路平均值'],['loadPowerOut','输出负载功率','实际电压×电流平均值'],['irms','实际开关频率','由下管VGS记录的上升沿测量'],['peak','输出电感峰值','末2ms记录最大值'],['ripple','输出电压变化','末2ms记录峰峰值，含纹波及慢变化']]){el(id).parentElement.querySelector('small').textContent=title;el(id).parentElement.querySelector('em').textContent=note}
 el('chipSelect').closest('label')?.setAttribute('hidden','');
 const container=el('fullRun').parentElement;
 const extra=document.createElement('div');extra.innerHTML='<label>最大步长 / ns <input id="spiceStep" type="number" value="200" min="20" max="1000"></label><label>波形记录间隔 / ns <input id="spiceSample" type="number" value="1000" min="20" max="100000"></label><p id="spiceStatus" role="status">待运行 · ngspice WASM</p><label>显示时间 / ms <input id="spiceStart" type="number" value="0" step=".01"> — <input id="spiceEnd" type="number" value="100" step=".01"></label><button id="spiceView">显示范围</button><button id="spiceExport">下载 SPICE 网表</button>';
 container.after(extra);
 const details=document.createElement('details');details.innerHTML='<summary>模型范围、ngspice 网表与求解日志</summary><p id="spiceAssumptions" style="padding:14px;font-size:12px;line-height:1.8"></p><pre id="spiceNetlist" style="max-height:400px;overflow:auto;font-size:11px"></pre><pre id="spiceLog" style="max-height:240px;overflow:auto;white-space:pre-wrap"></pre>';el('netStatus').after(details);
 el('fullDuration').value='.85';el('fullDuration').max='1';
 for(const id of ['wavePresets','simulationProgress','magneticSummary','fullPreset'])if(el(id))el(id).hidden=true;
 document.querySelectorAll('.notice').forEach(q=>{if(q.id!=='netStatus')q.hidden=true});document.querySelector('.foot').textContent='ngspice 45.2 实验版 · 工程宏模型及寄生参数尚未实测校准；CS/FB保护时序待独立验收。';
 bootEditor();enhanceEditor();enhanceWires();
 let lastPartPress=null;el('editor').addEventListener('pointerdown',e=>{if(e.button!==0)return;let id=e.target.closest('[data-part]')?.dataset.part;const repeat=lastPartPress&&e.timeStamp-lastPartPress.time<500&&Math.hypot(e.clientX-lastPartPress.x,e.clientY-lastPartPress.y)<5;if(repeat&&(!id||id===lastPartPress.id)){e.preventDefault();e.stopImmediatePropagation();spiceProperties(circuit.parts.find(p=>p.id===lastPartPress.id));lastPartPress=null}else if(id)lastPartPress={id,time:e.timeStamp,x:e.clientX,y:e.clientY}},true);
 const oldDouble=el('editor').ondblclick;el('editor').ondblclick=e=>{const id=e.target.closest('[data-part]')?.dataset.part;if(id){document.querySelectorAll('.inspector').forEach(q=>q.style.display='none');spiceProperties(circuit.parts.find(p=>p.id===id))}else oldDouble?.(e)};
 circuit=forwardDefault();try{const saved=localStorage.getItem(circuitStorageKey('circuit-draft'));if(saved)circuit=JSON.parse(saved)}catch{}
 // Original confirmed user coordinates and routes are retained verbatim.
 renderEditor();fitCircuitView();update();
 for(const id of ['parallelC','parallelR'])el(id).hidden=true;
 document.querySelector('[data-add="Q"][data-mos="P"]')?.setAttribute('hidden','');
 el('netLabels').onchange=()=>renderEditor();el('netNameTarget').onchange=()=>{el('netNameValue').value=circuit.netNames?.[el('netNameTarget').value]||el('netNameTarget').value};el('applyNetName').onclick=()=>{const text=el('netNameValue').value.trim();if(!/^[\w\u4e00-\u9fff.+-]{1,32}$/.test(text)){el('netStatus').textContent='网络标注支持1～32个中英文字、数字或下划线';return}remember();circuit.netNames??={};circuit.netNames[el('netNameTarget').value]=text;renderEditor()};
 el('vin').value=circuit.parts.find(p=>p.id==='AC').value;el('load').value=circuit.parts.find(p=>p.id==='LOAD').value;
 el('vin').onchange=()=>{circuit.parts.find(p=>p.id==='AC').value=Number(el('vin').value);renderEditor();update()};el('load').onchange=()=>{circuit.parts.find(p=>p.id==='LOAD').value=Number(el('load').value);renderEditor();update()};
 spiceLoadEditor();el('loadMode').onchange=()=>{if(!circuit.loadProgram)circuit.loadProgram={points:[{t:0,current:2},{t:.85,current:2}]};circuit.loadProgram.enabled=el('loadMode').value==='program';update();spiceLoadEditor()};
 el('addLoadPoint').onclick=()=>{let points=circuit.loadProgram.points;points.push({t:Number((points.at(-1).t+.01).toFixed(6)),current:points.at(-1).current});update();spiceLoadEditor()};el('loadExample').onclick=()=>{circuit.loadProgram=structuredClone(forwardDefault().loadProgram);update();spiceLoadEditor()};
 el('runIndicator').textContent='ngspice 45.2 WASM / EEcircuit 1.9.0 · 实验宏模型 · 默认启动已跑通，独立保护验收待完成';
 el('fullRun').onclick=()=>{spiceRevision++;try{spiceCompiled=EG12523Spice.compile(circuit,spiceOptions());spiceData=null;spiceRender();if(spiceWorker)spiceWorker.terminate();const worker=spiceWorker=new Worker('ngspice-worker.mjs?v=1',{type:'module'});spiceRunState(true,'正在加载 ngspice…');const begun=performance.now();worker.onerror=e=>{spiceRunState(false,'引擎异常：'+e.message);worker.terminate();if(spiceWorker===worker)spiceWorker=null};worker.onmessage=({data})=>{if(spiceWorker!==worker)return;if(data.status)spiceRunState(true,data.status);if(data.error){el('spiceLog').textContent=data.error;spiceRunState(false,'求解失败，请查看日志');worker.terminate();spiceWorker=null}if(data.result){spiceData=data.result;el('pfcReadout').textContent='实际ngspice求解记录；保存间隔 '+Number(el('spiceSample').value)+'ns。窄于记录间隔的脉冲可能未完整记录。';el('spiceLog').textContent=data.version+'\n'+data.log;el('spiceEnd').value=spiceCompiled.duration*1000;spiceRunState(false,`计算完成 · ${data.result.numPoints} 点 · ${((performance.now()-begun)/1000).toFixed(1)}s`);spiceRender();worker.terminate();spiceWorker=null}};worker.postMessage(spiceCompiled)}catch(e){spiceRunState(false,e.message)}};
 el('fullStop').onclick=()=>{spiceRevision++;spiceWorker?.terminate();spiceWorker=null;spiceRunState(false,'已停止')};spiceRunState(false,'待运行 · ngspice WASM');
 el('spiceView').onclick=spiceRender;el('pfcWave').addEventListener('click',e=>{let key=e.target.closest('[data-probe]')?.dataset.probe;if(key){spiceActive.has(key)?spiceActive.delete(key):spiceActive.add(key);spiceRender()}});
 el('spiceExport').onclick=()=>{const compiled=EG12523Spice.compile(circuit,spiceOptions()),url=URL.createObjectURL(new Blob([compiled.text],{type:'text/plain'})),a=document.createElement('a');a.href=url;a.download='EG12523-v3.cir';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 for(const id of ['fullDuration','spiceStep','spiceSample','freqLine'])el(id).onchange=update;
 spiceLoadDefaultWave();
}
spiceBoot().catch(e=>{console.error(e);document.getElementById('netStatus').textContent=e.message});
