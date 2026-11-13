/* SPICE parameters are explicit; model labels do not imply vendor model cards. */
function spiceProperties(part){
 if(document.querySelector('dialog[open]'))return;
 const dialog=document.createElement('dialog');dialog.style.cssText='border:1px solid #cbdbe7;border-radius:12px;max-width:520px;width:90vw;padding:24px;color:#223b50';
 const form=document.createElement('form');form.innerHTML='<h3 style="margin-top:0">元器件参数</h3><p style="color:#708699;font-size:12px">修改后点击运行，由 ngspice 重新求解。</p>';
 let fields=[['refdes','位号',part.refdes||part.id,'text']];
 if(['R','C','L','A','V','I'].includes(part.type))fields.push(['value',({R:'电阻 / Ω',C:'电容 / µF',L:'电感 / µH',A:'交流电压 / Vac RMS',V:'直流电压 / V',I:'电流 / A'})[part.type],part.value]);
 const spec={
 U:[['startupCurrent','VIN 启动电流 / A（规格最大）',30e-6],['runningCurrent','VIN 工作电流 / A（规格典型）',.0023]],
 C:[['esr','ESR / Ω（未填时电解假设20mΩ）',part.capKind==='electrolytic'?.02:0],['initialVoltage','初始电压 / V',0]],
 L:[['seriesResistance','DCR / Ω',0],['initialCurrent','初始电流 / A',0]],
 D:[['model','型号标注（非厂商模型）',part.model||'通用二极管','text'],['spiceIs','SPICE Is / A',part.diodeKind==='schottky'?1e-6:1e-9],['spiceN','SPICE N',part.diodeKind==='schottky'?1.1:1.5],['onResistance','串联电阻 Rs / Ω',.02],['spiceCjo','结电容 Cjo / F',30e-12],['breakdownVoltage','击穿电压 BV / V（0为未设）',0]],
 Q:[['onResistance','导通电阻 / Ω',.02],['thresholdVoltage','开关阈值 / V',4],['gateCharge','等效栅电荷 / C',50e-9],['outputCapacitance','等效Coss / F（假设值）',200e-12]],
 T:[['primaryTurns','原边匝数',16],['secondaryTurns','次级匝数',5],['auxiliaryTurns','辅助绕组匝数',1],['magnetizingInductance','原边自感 / H',.002],['couplingCoefficient','绕组耦合系数 k',.999],['primaryResistance','原边电阻 / Ω（假设值）',.05],['secondaryResistance','次级电阻 / Ω（假设值）',.005],['auxiliaryResistance','辅助电阻 / Ω（假设值）',.1]],
 O:[['ctr','CTR 比值',1],['responseTime','等效响应时间 / s',10e-6]],
 Z:[['referenceVoltage','基准电压 / V',2.5],['transconductance','等效跨导 / S',.05],['maxCathodeCurrent','等效最大阴极电流 / A',.1],['responseTime','等效响应时间 / s',20e-6]]
 };
 for(const f of spec[part.type]||[])fields.push([f[0],f[1],part[f[0]]??f[2],f[3]]);
 for(const [key,label,value,type]of fields){const row=document.createElement('label');row.style.cssText='display:flex;align-items:center;gap:15px;justify-content:space-between;font-size:12px;margin:12px 0';row.append(document.createTextNode(label));const input=document.createElement('input');input.name=key;input.type=type||'number';input.step='any';input.value=value;input.required=true;input.style.cssText='padding:8px;border:1px solid #ccdce8;border-radius:6px;width:200px;max-width:55%';row.append(input);form.append(row)}
 const error=document.createElement('p');error.style.color='#b34b3a';form.append(error);
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='取消';cancel.onclick=()=>dialog.close();const save=document.createElement('button');save.type='submit';save.textContent='应用参数';save.style.cssText='background:#327ab4;color:white;margin-left:10px';form.append(cancel,save);
 form.onsubmit=e=>{e.preventDefault();const next={...part};for(const [key,, ,type]of fields){const value=form.elements.namedItem(key).value;if(type==='text')next[key]=value;else{next[key]=Number(value);if(!Number.isFinite(next[key]))return}}if(next.type==='T')next.value=next.primaryTurns/next.secondaryTurns;try{EG12523Spice.compile({...circuit,parts:circuit.parts.map(p=>p.id===next.id?next:p)},spiceOptions())}catch(e){error.textContent=e.message;return}remember();Object.assign(part,next);dialog.close();renderEditor();update()};
 dialog.onclose=()=>dialog.remove();dialog.append(form);document.body.append(dialog);dialog.showModal();
}
