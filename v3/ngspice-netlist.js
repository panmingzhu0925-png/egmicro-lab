/* Schematic graph -> ngspice. No JavaScript circuit solver is used here. */
(function(root){
'use strict';
function compile(c,options={}){
 const parts=new Map(c.parts.map(p=>[p.id,p])),parent=new Map();
 const find=k=>{if(!parent.has(k))parent.set(k,k);if(parent.get(k)!==k)parent.set(k,find(parent.get(k)));return parent.get(k)},join=(a,b)=>parent.set(find(a),find(b));
 const pinNames={R:['a','b'],C:['a','b'],L:['a','b'],D:['a','b'],A:['a','b'],V:['a','b'],I:['a','b'],G:['a'],J:['a'],Q:['D','G','S'],T:['p1','p2','s1','s2','aux1','aux2'],B:['ac1','ac2','p','n'],O:['A','K','C','E'],Z:['A','K','REF'],U:['NC1','VCC','OUT','VIN','SS','FB','CC','CS','RI','AGND','PGND','LO','NC13','VS','HO','VB']};
 for(const w of c.wires){if(!Array.isArray(w)||w.length!==2)throw Error('无效导线');for(const endpoint of w){const [id,pin,...rest]=String(endpoint).split('.'),part=parts.get(id);if(!part||rest.length||!pinNames[part.type]?.includes(pin))throw Error('无效引脚连接 '+endpoint)}join(...w)}
 const grounds=new Set(c.parts.filter(p=>p.type==='G').map(p=>find(p.id+'.a')));
 for(const pin of ['U1.PGND','R21.b','DB1.n','T1.aux1','U3.E'])if(grounds.has(find(pin)))join('U1.AGND',pin);
 for(const pin of ['Q3.A','LOAD.b'])if(grounds.has(find(pin)))join('T1.s2',pin);
 if(find('U1.AGND')===find('T1.s2'))throw Error('原副边地短接，请检查原理图');
 for(const p of c.parts.filter(p=>p.type==='G'))if(![find('U1.AGND'),find('T1.s2')].includes(find(p.id+'.a')))throw Error('未识别的地网络 '+p.id);
 const nets=new Map(),n=pin=>{let r=find(pin);if(r===find('U1.AGND'))return '0';if(!nets.has(r))nets.set(r,'n'+(nets.size+1));return nets.get(r)},p=id=>{if(!parts.has(id))throw Error('缺少元件 '+id);return parts.get(id)},num=(v,label,positive=true)=>{if(!Number.isFinite(v)||(positive?v<=0:v<0))throw Error('无效参数 '+label);return v},lines=['EG12523 v3 schematic-driven ngspice engineering preview'],emit=s=>lines.push(s),dv=(a,b)=>`v(${a},${b})`,u=pin=>n('U1.'+pin);
 const duration=num(options.duration??.1,'时长'),dt=num(options.maxStep??200e-9,'步长'),sampleStep=num(options.sampleStep??1e-6,'记录间隔');if(duration>1||dt<20e-9||dt>1e-6)throw Error('预览支持时长≤1s、步长20ns～1µs');if(sampleStep<dt||duration/sampleStep>1000001)throw Error('记录间隔应不小于最大步长，且总记录点数不超过100万；放大开关周期时可缩短仿真时长');
 const probes=[],probe=(key,label,unit,expression,group)=>probes.push({key,label,unit,expression,group});
 emit('* All R/C/L and wires below originate from the user schematic.');
 for(const part of c.parts){
  const {id,type}=part;if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(id))throw Error('无效元件ID');const a=n(id+'.a'),b=n(id+'.b');emit('* '+String(part.refdes||id).replace(/[\r\n]/g,' ')+' ['+id+']');
  switch(type){
   case 'R':emit(`R_${id} ${a} ${b} ${num(part.value,id)}`);break;
   case 'C':{let internal=a;let esr=part.esr??(part.capKind==='electrolytic'?.02:0);if(esr>0){internal='esr_'+id;emit(`R_esr_${id} ${a} ${internal} ${num(esr,id+' ESR')}`)}emit(`C_${id} ${internal} ${b} ${num(part.value,id)*1e-6} IC=${part.initialVoltage??0}`);break;}
   case 'L':{let internal=a;if(part.seriesResistance>0){internal='dcr_'+id;emit(`R_dcr_${id} ${a} ${internal} ${num(part.seriesResistance,id+' DCR')}`)}emit(`L_${id} ${internal} ${b} ${num(part.value,id)*1e-6} IC=${part.initialCurrent??0}`);break;}
   case 'A':emit(`V_${id} ${a} ${b} SIN(0 ${num(part.value,id)*Math.SQRT2} ${num(options.lineHz??50,'电网频率')})`);break;
   case 'V':if(!Number.isFinite(part.value))throw Error('无效电压 '+id);emit(`V_${id} ${a} ${b} ${part.value}`);break;
   case 'I':{const points=part.id==='LOAD'&&c.loadProgram?.enabled?c.loadProgram.points:[{t:0,current:part.value},{t:duration,current:part.value}];if(!Array.isArray(points)||points.length<2||points[0].t!==0)throw Error('负载时序需从0s开始，至少两个点');points.forEach((q,i)=>{num(q.current,'负载电流',false);num(q.t,'负载时间',false);if(i&&q.t<=points[i-1].t)throw Error('负载时间必须递增')});emit(`V_set_${id} set_${id} 0 PWL(${points.map(q=>q.t+' '+q.current).join(' ')})`);emit(`B_${id} ${a} ${b} I=v(set_${id})*${dv(a,b)}/max(${dv(a,b)},0.5)`);break;}
   case 'D':{const rs=num((part.onResistance??.02)/(part.parallelCount??1),id+' Ron'),sch=part.diodeKind==='schottky',bv=part.breakdownVoltage;emit(`.model M_${id} D(Is=${num(part.spiceIs??(sch?1e-6:1e-9),id+' Is')} N=${num(part.spiceN??(sch?1.1:1.5),id+' N')} Rs=${rs} Cjo=${num(part.spiceCjo??30e-12,id+' Cjo',false)}${bv>0?' BV='+bv+' Ibv=1m':''})`);if(part.diodeKind==='tvs-bi'){if(!(bv>0))throw Error('双向TVS需击穿电压');emit(`D_${id} ${a} tvs_${id} M_${id}`);emit(`D_rev_${id} ${b} tvs_${id} M_${id}`)}else emit(`D_${id} ${a} ${b} M_${id}`);break;}
   case 'B':{let x=n(id+'.ac1'),y=n(id+'.ac2'),v=n(id+'.p'),g=n(id+'.n');emit(`D_${id}1 ${x} ${v} GENERIC_D`);emit(`D_${id}2 ${y} ${v} GENERIC_D`);emit(`D_${id}3 ${g} ${x} GENERIC_D`);emit(`D_${id}4 ${g} ${y} GENERIC_D`);break;}
   case 'Q':{if(part.mosKind==='P')throw Error('预览尚不支持P沟道MOS');const d=n(id+'.D'),s=n(id+'.S'),g=n(id+'.G');emit(`.model M_${id} SW(Ron=${num(part.onResistance??.02,id+' Ron')} Roff=1G Vt=${part.thresholdVoltage??4} Vh=.1)`);emit(`V_sense_${id} ${d} drain_${id} 0`);emit(`S_${id} drain_${id} ${s} ${g} ${s} M_${id}`);emit(`D_body_${id} ${s} ${d} GENERIC_D`);emit(`C_gate_${id} ${g} ${s} ${(part.gateCharge??50e-9)/15}`);emit(`C_oss_${id} ${d} ${s} ${num(part.outputCapacitance??200e-12,id+' Coss')}`);probe('vgs'+id,(part.refdes||id)+' VGS','V',dv(g,s),'驱动与功率管');probe('vds'+id,(part.refdes||id)+' VDS','V',dv(d,s),'驱动与功率管');probe('ids'+id,(part.refdes||id)+' IDS','A',`i(V_sense_${id})`,'驱动与功率管');break;}
   case 'T':{let np=num(part.primaryTurns??16,id+' Np'),ns=num(part.secondaryTurns??np/part.value,id+' Ns'),na=num(part.auxiliaryTurns??1,id+' Na'),lm=num(part.magnetizingInductance??.002,id+' Lm');emit(`R_winding_p_${id} ${n(id+'.p1')} winding_p_${id} ${num(part.primaryResistance??.05,id+' Rp')}`);emit(`R_winding_s_${id} ${n(id+'.s1')} winding_s_${id} ${num(part.secondaryResistance??.005,id+' Rs')}`);emit(`R_winding_a_${id} ${n(id+'.aux2')} winding_a_${id} ${num(part.auxiliaryResistance??.1,id+' Ra')}`);emit(`L_p_${id} winding_p_${id} ${n(id+'.p2')} ${lm}`);emit(`L_s_${id} winding_s_${id} ${n(id+'.s2')} ${lm*(ns/np)**2}`);emit(`L_a_${id} winding_a_${id} ${n(id+'.aux1')} ${lm*(na/np)**2}`);if((part.couplingCoefficient??.999)>=1)throw Error('耦合系数需小于1');emit(`K_${id} L_p_${id} L_s_${id} L_a_${id} ${num(part.couplingCoefficient??.999,id+' k')}`);probe('ip','初级绕组电流','A',`i(L_p_${id})`,'变压器');probe('is','次级绕组电流','A',`i(L_s_${id})`,'变压器');break;}
   case 'O':{const an=n(id+'.A'),k=n(id+'.K'),cc=n(id+'.C'),ee=n(id+'.E');emit(`V_led_${id} ${an} led_${id} 0`);emit(`D_led_${id} led_${id} ${k} LED`);emit(`B_led_current_${id} led_target_${id} 0 V=max(0,i(V_led_${id}))`);emit(`R_opto_${id} led_target_${id} led_dynamic_${id} 1k`);emit(`C_opto_${id} led_dynamic_${id} 0 ${num(part.responseTime??10e-6,id+' tau')/1000}`);emit(`B_opto_${id} ${cc} ${ee} I=max(0,v(led_dynamic_${id}))*${num(part.ctr??1,id+' CTR',false)}*max(0,min(1,${dv(cc,ee)}/.2))`);break;}
   case 'Z':{const ref=n(id+'.REF'),k=n(id+'.K'),an=n(id+'.A');emit(`B_error_${id} error_target_${id} 0 V=${dv(ref,an)}-${num(part.referenceVoltage??2.5,id+' Vref')}`);emit(`R_431_${id} error_target_${id} error_dynamic_${id} 1k`);emit(`C_431_${id} error_dynamic_${id} 0 ${num(part.responseTime??20e-6,id+' tau')/1000} IC=-2.5`);emit(`B_431_${id} ${k} ${an} I=max(0,min(${num(part.maxCathodeCurrent??.1,id+' Imax')},v(error_dynamic_${id})*${num(part.transconductance??.05,id+' Gm')}))*max(0,min(1,${dv(k,an)}/2.5))`);break;}
   case 'U':if(id!=='U1')throw Error('未定义控制器宏模型 '+id);break;
   case 'J':case 'G':break;
   default:throw Error('尚不支持元件类型 '+type);
  }
 }
 // A DC reference fixes only the secondary common-mode; power remains transformer coupled.
 emit(`R_secondary_reference ${n('T1.s2')} 0 1G`);
 const fs=4300000/(num(p('R29').value,'RI')/1000),period=1/fs;
 emit('* EG12523 engineering macro: VIN hysteresis, SS, FB/CS comparator, floating HO.');
 emit('V_logic one 0 1');emit(`S_uv enable 0 ${u('VIN')} ${u('AGND')} UVLO`);emit('R_enable one enable 1k');
 // Inverted switch: enable pulled to zero while VIN is above startup threshold.
 emit(`B_uvrun uv_run 0 V=1-v(enable)`);
 emit('C_fault fault_timer 0 1u IC=0');emit(`B_fault 0 fault_timer I=1u*(v(uv_run)>.5)*(${dv(u('FB'),u('AGND'))}>4.9)`);emit(`B_fault_reset fault_timer 0 I=v(fault_timer)*((v(uv_run)<.5)+(${dv(u('FB'),u('AGND'))}<4.9))/100`);
 emit('C_fault_latch fault_latched 0 1n IC=0');emit('B_fault_set 0 fault_latched I=(v(fault_timer)>.07)*max(0,1-v(fault_latched))/10');emit('B_fault_clear fault_latched 0 I=(v(uv_run)<.5)*v(fault_latched)/10');emit('R_fault_hold fault_latched 0 1e12');
 emit(`B_run run 0 V=v(uv_run)*(v(fault_latched)<.5)`);
 emit(`B_vinload ${u('VIN')} ${u('AGND')} I=${num(p('U1').startupCurrent??30e-6,'启动电流')}*(1-v(run))+v(run)*${num(p('U1').runningCurrent??.0023,'工作电流')}`);
 emit(`B_fbpull ${u('FB')} ${u('AGND')} I=(${dv(u('FB'),u('AGND'))}-5*v(run))/6250`);
 emit(`B_ss ${u('AGND')} ${u('SS')} I=10u*v(run)*(${dv(u('SS'),u('AGND'))}<3.5)`);
 emit(`B_ssreset ${u('SS')} ${u('AGND')} I=(1-v(run))*${dv(u('SS'),u('AGND'))}/10`);
 emit(`V_clock saw 0 PULSE(0 1 0 ${period-20e-9} 10n 1n ${period})`);
 emit(`B_limit eg_threshold 0 V=max(0,min(.8,min(${dv(u('FB'),u('AGND'))}/2.8,${dv(u('SS'),u('AGND'))}/2.8)))`);
 // Cycle latch: trip after the leading-edge blanking interval; reset at each clock.
 emit('C_trip trip 0 1n IC=0');emit(`B_trip_set 0 trip I=(v(run)>.5)*.5*(1+tanh((v(saw)-${80e-9/period})/.0002))*.5*(1+tanh((${dv(u('CS'),u('AGND'))}-v(eg_threshold))/.001))*max(0,1-v(trip))/10`);emit(`B_trip_reset trip 0 I=(.5*(1-tanh((v(saw)-${40e-9/period})/.0002))+(v(run)<.5))*v(trip)/10`);emit('R_trip_hold trip 0 1e12');
 emit(`B_pwm pwm 0 V=(v(run)>.5)*(v(saw)<.46)*(v(trip)<.5)`);
 emit(`B_out out_internal ${u('AGND')} V=v(pwm)*max(0,min(17,${dv(u('VIN'),u('AGND'))}))`);
 emit(`R_out out_internal ${u('OUT')} 1`);
 emit(`B_ho ho_internal ${u('VS')} V=v(pwm)*(${dv(u('VCC'),u('PGND'))}>5)*max(0,min(17,${dv(u('VB'),u('VS'))}))`);emit(`R_ho ho_internal ${u('HO')} .25`);
 emit(`B_lo lo_internal ${u('PGND')} V=v(pwm)*(${dv(u('VCC'),u('PGND'))}>5)*max(0,min(17,${dv(u('VCC'),u('PGND'))}))`);emit(`R_lo lo_internal ${u('LO')} .25`);
 emit(`B_vcc_load ${u('VCC')} ${u('PGND')} I=1m*v(run)`);
 for(const r of nets.values())emit(`R_leak_${r} ${r} 0 1e12`);
 emit('.model UVLO SW(Ron=.001 Roff=1e12 Vt=12 Vh=3)');emit('.model GENERIC_D D(Is=1n N=1.5 Rs=.02 Cjo=30p)');emit('.model LED D(Is=1e-18 N=1.6 Rs=20 Cjo=10p)');
 probe('vo','输出电压','V',dv(n('LOAD.a'),n('LOAD.b')),'输出');probe('il','输出电感电流','A','i(L_L1)','输出');probe('iset','负载设定','A','v(set_LOAD)','输出');
 probe('bus','母线电压','V',dv(n('DB1.p'),n('DB1.n')),'输入');probe('vac','交流输入','V',dv(n('AC.a'),n('AC.b')),'输入');
 for(const pin of ['VIN','VCC','OUT','FB','SS','CS','HO','LO'])probe(pin,pin,'V',dv(u(pin),u(pin==='HO'?'VS':'AGND')),'芯片引脚');
 for(const id of ['D8','D1']){const part=p(id);probe('vd'+id,(part.refdes||id)+' 电压','V',dv(n(id+'.a'),n(id+'.b')),'次级二极管');probe('id'+id,(part.refdes||id)+' 电流','A',`@D_${id}[id]`,'次级二极管')}
 const transformer=p('T1'),np=transformer.primaryTurns??16,ns=transformer.secondaryTurns??5,na=transformer.auxiliaryTurns??1,k=transformer.couplingCoefficient??.999,lm=transformer.magnetizingInductance??.002;
 const terms=[{expression:'i(L_p_T1)',factor:1},{expression:'i(L_s_T1)',factor:k*ns/np},{expression:'i(L_a_T1)',factor:k*na/np}];
 probe('im','励磁等效电流','A','','变压器');probes.at(-1).terms=terms;
 probe('b','磁通密度 B','mT','','变压器');probes.at(-1).terms=terms.map(t=>({...t,factor:t.factor*lm/(np*num(transformer.effectiveAreaMm2??286.9,'Ae')*1e-6)*1000}));
 probe('bridgeI','整流桥输出电流','A','','输入');probes.at(-1).terms=[{expression:'@D_DB11[id]',factor:1},{expression:'@D_DB12[id]',factor:1}];
 probe('busCapI','母线电解电流','A','','输入');probes.at(-1).terms=['C4','C5'].map(id=>({expression:`@C_${id}[i]`,factor:1}));
 const primitive=probes.flatMap(q=>q.terms?q.terms.map(t=>t.expression):[q.expression]);
 const save=primitive.flatMap(expression=>{let m=expression.match(/^v\(([^,()]+),([^()]+)\)$/);return m?m.slice(1).filter(n=>n!=='0').map(n=>`v(${n})`):[expression]});emit(`.save ${[...new Set(save)].join(' ')}`);
 emit('.options method=gear reltol=.002 abstol=1u vntol=1u itl4=100 gmin=1e-9 interp');emit(`.tran ${sampleStep} ${duration} 0 ${dt} UIC`);emit('.end');
 return {text:lines.join('\n'),probes,duration,fs,assumptions:['实验性EG12523宏模型：CS锁存/消隐和FB70ms/UVLO恢复已建立但尚未通过功能验收；驱动延时未实现','输出按1µs网格保存；内部最大步长独立设置，短脉冲峰值可能未记录','未设寄生参数时使用显式工程假设：电解ESR20mΩ/只、原/次/辅绕组电阻50/5/100mΩ、MOS Coss200pF；均可修改，非实测值','TL431/光耦为跨导/CTR与20µs/10µs单极点等效，未实测校准','MOS为通用SW，二极管为通用D参数，型号标签不是厂家SPICE模型','变压器使用线性三绕组耦合电感，k=0.999；未模拟饱和与磁损']};
}
root.EG12523Spice={compile};if(typeof module!=='undefined')module.exports=root.EG12523Spice;
})(globalThis);


