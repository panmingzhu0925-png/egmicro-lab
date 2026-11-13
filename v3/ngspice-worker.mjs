import {Simulation} from './vendor/eecircuit-engine.mjs';
// A dedicated worker can be terminated immediately; every run gets a fresh engine.
self.onmessage=async({data})=>{
 try{
  const sim=new Simulation();self.postMessage({status:'正在加载 ngspice WASM…'});await sim.start();
  const version=sim.getInitInfo();self.postMessage({status:'ngspice 正在求解电路…',version});
  sim.setNetList(data.text);const result=await sim.runSim(),log=sim.getInfo();
  if(!result?.data?.length||/timestep too small|simulation interrupted|run simulation\(s\) aborted/i.test(log))throw Error(log.slice(-4000)||'ngspice 未返回有效结果');
  const time=result.data.find(q=>q.name==='time')?.values;
  if(!time?.length||time.at(-1)<data.duration*(1-1e-6))throw Error('求解未达到设定终点；'+log.slice(-2000));
  if(result.data.some(q=>q.values.some(x=>!Number.isFinite(x))))throw Error('求解结果含非有限值');
  self.postMessage({result,log,version});
 }catch(e){self.postMessage({error:e.message})}
};
