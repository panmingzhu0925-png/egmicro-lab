const {chromium}=require('playwright-core'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../v3'),types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm'};
const server=http.createServer((req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',types[path.extname(file)]||'text/plain');res.end(fs.readFileSync(file))}catch{res.writeHead(404).end()}});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({executablePath:process.env.EDGE_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];let engineRequests=0;
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/vendor\/|ngspice-worker/.test(r.url()))engineRequests++});
  await page.goto('http://127.0.0.1:'+server.address().port+'/EG12523.html');await page.waitForFunction(()=>document.getElementById('spiceStatus').textContent.includes('预计算'));
  assert.equal(engineRequests,0);assert.equal(await page.evaluate(()=>spiceData.numPoints),13932);assert((await page.locator('#out').textContent()).startsWith('24.27'));assert(await page.locator('[data-probe="b"]').count());
  await page.locator('[data-probe="b"]').click();assert(await page.locator('#pfcWave polyline').count()>8);assert(!await page.locator('#pfcWave').innerHTML().then(s=>s.includes('NaN')));
  const preserved=await page.evaluate(()=>{const data=spiceData;circuit.parts.find(p=>p.id==='AC').x+=10;editorChanged();return data===spiceData});assert(preserved);
  await page.screenshot({path:path.join(root,'browser-cache.png'),fullPage:true});
  await page.locator('#vin').fill('230');await page.locator('#vin').dispatchEvent('change');assert.equal(await page.evaluate(()=>spiceData),null);assert.equal(await page.locator('#out').textContent(),'—');
  const late=await browser.newPage();await late.route('**/default-wave-cache.json*',async route=>{await new Promise(r=>setTimeout(r,800));await route.continue()});await late.goto('http://127.0.0.1:'+server.address().port+'/EG12523.html');await late.locator('#vin').fill('230');await late.locator('#vin').dispatchEvent('change');await late.waitForTimeout(1200);assert.equal(await late.evaluate(()=>spiceData),null);
  assert.deepEqual(errors,[]);console.log('PASS: instant real cache without WASM download, full-tail measurements, B probe, geometry preservation, parameter invalidation, late-cache rejection');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
