const K="inzaki_charcoal_v3";let S=JSON.parse(localStorage.getItem(K)||'{"raw":[],"batches":[],"sales":[],"expenses":[]}');const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s),today=new Date().toISOString().slice(0,10);$$('input[type=date]').forEach(x=>x.value=today);
const rp=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(+n||0),kg=n=>(+n||0).toLocaleString('id-ID',{maximumFractionDigits:2})+' kg',esc=x=>String(x??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])),landed=r=>(+r.price||0)+((+r.transport||0)+(+r.other||0))/(+r.originalQty||+r.qty||1),day=d=>new Date(d+'T00:00:00'),last7=d=>{let s=new Date();s.setHours(0,0,0,0);s.setDate(s.getDate()-6);return day(d)>=s},thisMonth=d=>{let n=new Date(),x=day(d);return x.getFullYear()==n.getFullYear()&&x.getMonth()==n.getMonth()};
const signed=n=>`<span class="${(+n||0)<0?'neg':'pos'}">${rp(n)}</span>`;
function save(){localStorage.setItem(K,JSON.stringify(S));render()}function B(id){return S.batches.find(x=>x.id==id)}function sold(id){return S.sales.filter(x=>x.batchId==id).reduce((a,x)=>a+x.qty,0)}function empty(n){return `<tr><td colspan="${n}" style="text-align:center;color:#929a93">Belum ada data</td></tr>`}

let financeChart=null,productionChart=null;
const PALETTE={ember:'#FF6A2E',gold:'#E8B84B',red:'#F4685A',green:'#3FCE83',ink:'#F2EFE8',muted:'#8D958F',grid:'#20241F'};
function drawCharts(){
 if(typeof Chart==='undefined')return;
 Chart.defaults.color=PALETTE.muted;Chart.defaults.font.family="'Inter',system-ui,sans-serif";Chart.defaults.borderColor=PALETTE.grid;
 const sel=$('#chartYear');if(!sel)return;
 const years=new Set([new Date().getFullYear()]);
 [...S.sales,...S.expenses,...S.batches].forEach(x=>{if(x.date)years.add(new Date(x.date+'T00:00:00').getFullYear())});
 const old=+sel.value||new Date().getFullYear();
 sel.innerHTML=[...years].sort((a,b)=>b-a).map(y=>`<option value="${y}">${y}</option>`).join('');
 sel.value=years.has(old)?old:new Date().getFullYear();
 const year=+sel.value,labels=Array.from({length:12},(_,i)=>new Date(year,i,1).toLocaleDateString('id-ID',{month:'short'}));
 const omzet=Array(12).fill(0),hpp=Array(12).fill(0),expense=Array(12).fill(0),profit=Array(12).fill(0),input=Array(12).fill(0),output=Array(12).fill(0);
 S.sales.forEach(x=>{let d=new Date(x.date+'T00:00:00');if(d.getFullYear()===year){let i=d.getMonth(),b=B(x.batchId);omzet[i]+=+x.total||0;if(b)hpp[i]+=(+x.qty||0)*b.hppkg}});
 S.expenses.forEach(x=>{let d=new Date(x.date+'T00:00:00');if(d.getFullYear()===year)expense[d.getMonth()]+=+x.amount||0});
 S.batches.forEach(x=>{let d=new Date(x.date+'T00:00:00');if(d.getFullYear()===year){input[d.getMonth()]+=+x.input||0;output[d.getMonth()]+=+x.output||0}});
 for(let i=0;i<12;i++)profit[i]=omzet[i]-hpp[i]-expense[i];
 const grid={color:PALETTE.grid};
 if(financeChart)financeChart.destroy();
 financeChart=new Chart($('#financeChart'),{type:'line',data:{labels,datasets:[
   {label:'Omzet',data:omzet,tension:.35,borderWidth:2.5,borderColor:PALETTE.gold,backgroundColor:PALETTE.gold,pointRadius:2,pointBackgroundColor:PALETTE.gold},
   {label:'HPP',data:hpp,tension:.35,borderWidth:2,borderColor:PALETTE.muted,backgroundColor:PALETTE.muted,pointRadius:0},
   {label:'Pengeluaran',data:expense,tension:.35,borderWidth:2,borderColor:PALETTE.red,backgroundColor:PALETTE.red,pointRadius:0},
   {label:'Laba',data:profit,tension:.35,borderWidth:3,borderColor:PALETTE.ember,backgroundColor:'rgba(255,106,46,.12)',fill:true,pointRadius:2,pointBackgroundColor:PALETTE.ember}
 ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'bottom',labels:{color:PALETTE.ink,boxWidth:10,boxHeight:10,usePointStyle:true,pointStyle:'circle'}}},scales:{x:{grid},y:{grid,ticks:{callback:v=>rp(v)}}}}});
 if(productionChart)productionChart.destroy();
 productionChart=new Chart($('#productionChart'),{type:'bar',data:{labels,datasets:[
   {label:'Bahan masuk (kg)',data:input,borderRadius:6,backgroundColor:'rgba(232,184,75,.75)'},
   {label:'Barang jadi (kg)',data:output,borderRadius:6,backgroundColor:PALETTE.ember}
 ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:PALETTE.ink,boxWidth:10,boxHeight:10,usePointStyle:true,pointStyle:'circle'}}},scales:{x:{grid},y:{beginAtZero:true,grid,ticks:{callback:v=>v+' kg'}}}}});
}

function render(){
let rawQty=S.raw.reduce((a,x)=>a+x.qty,0),rawValue=S.raw.reduce((a,x)=>a+x.qty*landed(x),0),out=S.batches.reduce((a,x)=>a+x.output,0),inp=S.batches.reduce((a,x)=>a+x.input,0),loss=inp-out;
let finishedQty=out-S.sales.reduce((a,x)=>a+x.qty,0),finishedValue=S.batches.reduce((a,b)=>a+Math.max(0,b.output-sold(b.id))*b.hppkg,0);
let ws=S.sales.filter(x=>last7(x.date)),ms=S.sales.filter(x=>thisMonth(x.date)),we=S.expenses.filter(x=>last7(x.date)).reduce((a,x)=>a+x.amount,0),me=S.expenses.filter(x=>thisMonth(x.date)).reduce((a,x)=>a+x.amount,0);
let wc=ws.reduce((a,x)=>{let b=B(x.batchId);return a+(b?x.qty*b.hppkg:0)},0),mc=ms.reduce((a,x)=>{let b=B(x.batchId);return a+(b?x.qty*b.hppkg:0)},0);
$('#dRawQty').textContent=kg(rawQty);$('#dRawValue').textContent=rp(rawValue);$('#dFinishedQty').textContent=kg(finishedQty);$('#dFinishedValue').textContent=rp(finishedValue);
$('#dProfitWeek').innerHTML=signed(ws.reduce((a,x)=>a+x.total,0)-wc-we);$('#dProfitMonth').innerHTML=signed(ms.reduce((a,x)=>a+x.total,0)-mc-me);$('#dExpenseWeek').textContent=rp(we);$('#dExpenseMonth').textContent=rp(me);
$('#dInput').textContent=kg(inp);$('#dOutput').textContent=kg(out);$('#dLoss').textContent=kg(loss);$('#dLossPct').textContent=(inp?loss/inp*100:0).toFixed(1)+'%';
$('#rawTable').innerHTML=S.raw.map(r=>`<tr><td>${esc(r.name)}</td><td>${kg(r.qty)}</td><td>${rp(r.price)}</td><td>${rp(r.transport)}</td><td>${rp(r.other)}</td><td>${rp(landed(r))}</td><td>${rp(r.qty*landed(r))}</td><td>${esc(r.supplier||'-')}</td></tr>`).join('')||empty(8);
$('#rawSelect').innerHTML=S.raw.filter(r=>r.qty>0).map(r=>`<option value="${r.id}">${esc(r.name)} — ${kg(r.qty)} @ ${rp(landed(r))}/kg</option>`).join('');
$('#batchTable').innerHTML=S.batches.slice().reverse().map(b=>`<tr><td>${b.code}</td><td>${b.date}</td><td>${esc(b.rawName)}</td><td>${kg(b.input)}</td><td>${kg(b.output)}</td><td>${kg(b.loss)} (${b.lossPct.toFixed(1)}%)</td><td>${rp(b.totalHpp)}</td><td>${rp(b.hppkg)}</td></tr>`).join('')||empty(8);
$('#salesBatch').innerHTML=S.batches.filter(b=>b.output-sold(b.id)>0).map(b=>`<option value="${b.id}">${b.code} — sisa ${kg(b.output-sold(b.id))} — HPP ${rp(b.hppkg)}/kg</option>`).join('');
let tq=0,tv=0;$('#finishedTable').innerHTML=S.batches.map(b=>{let q=b.output-sold(b.id);tq+=q;tv+=q*b.hppkg;return `<tr><td>${b.code}</td><td>${esc(b.rawName)}</td><td>${kg(b.output)}</td><td>${kg(sold(b.id))}</td><td>${kg(q)}</td><td>${rp(b.hppkg)}</td></tr>`}).join('')||empty(6);
$('#fQty').textContent=kg(tq);$('#fValue').textContent=rp(tv);$('#fAvg').textContent=rp(tq?tv/tq:0);
$('#salesTable').innerHTML=S.sales.slice().reverse().map(x=>{let b=B(x.batchId),c=x.qty*(b?b.hppkg:0);return `<tr><td>${x.date}</td><td>${b?.code||'-'}</td><td>${esc(x.customer)}</td><td>${kg(x.qty)}</td><td>${rp(x.total)}</td><td>${rp(c)}</td><td>${signed(x.total-c)}</td></tr>`}).join('')||empty(7);
$('#expenseTable').innerHTML=S.expenses.slice().reverse().map(x=>`<tr><td>${x.date}</td><td>${x.cat}</td><td>${esc(x.desc)}</td><td>${rp(x.amount)}</td></tr>`).join('')||empty(4);
$('#profitTable').innerHTML=S.batches.map(b=>{let ss=S.sales.filter(x=>x.batchId==b.id),om=ss.reduce((a,x)=>a+x.total,0),q=ss.reduce((a,x)=>a+x.qty,0),hc=q*b.hppkg,l=om-hc;return `<tr><td>${b.code}</td><td>${kg(b.output)}</td><td>${kg(q)}</td><td>${rp(om)}</td><td>${rp(hc)}</td><td>${signed(l)}</td><td>${om?(l/om*100).toFixed(1):0}%</td></tr>`}).join('')||empty(7);
let totalSales=S.sales.reduce((a,x)=>a+x.total,0),totalCogs=S.sales.reduce((a,x)=>{let b=B(x.batchId);return a+(b?x.qty*b.hppkg:0)},0),totalExp=S.expenses.reduce((a,x)=>a+x.amount,0);
$('#report').innerHTML=`<div><span>Total omzet</span><strong>${rp(totalSales)}</strong></div><div><span>HPP terjual</span><strong>${rp(totalCogs)}</strong></div><div><span>Laba kotor</span><strong>${signed(totalSales-totalCogs)}</strong></div><div><span>Pengeluaran umum</span><strong>${rp(totalExp)}</strong></div><div><span>Laba bersih</span><strong>${signed(totalSales-totalCogs-totalExp)}</strong></div><div><span>Total batch</span><strong>${S.batches.length}</strong></div>`;
$('#recent').innerHTML=S.batches.slice(-5).reverse().map(b=>`<div style="padding:10px;border-bottom:1px solid #eee"><b>${b.code}</b> · ${esc(b.rawName)}<br><small>${b.date} · ${kg(b.output)} · HPP ${rp(b.hppkg)}/kg · susut ${b.lossPct.toFixed(1)}%</small></div>`).join('')||'Belum ada batch.';
 drawCharts();
}
function go(p){$$('.page').forEach(x=>x.classList.toggle('active',x.id===p));$$('nav button').forEach(x=>x.classList.toggle('active',x.dataset.page===p));$('#title').textContent=p==='dashboard'?'Dashboard Global':p==='raw'?'Bahan Baku':p==='batch'?'Produksi Batch':p==='finished'?'Barang Jadi':p==='reports'?'Laba & Laporan':p[0].toUpperCase()+p.slice(1);$('#modal').classList.remove('show')}
$$('nav button').forEach(x=>x.onclick=()=>go(x.dataset.page));$('#quick').onclick=()=>$('#modal').classList.add('show');$$('#modal [data-go]').forEach(x=>x.onclick=()=>go(x.dataset.go));
function rawPreview(){let f=$('#rawForm'),q=+f.qty.value||0,p=+f.price.value||0,t=+f.transport.value||0,o=+f.other.value||0;$('#rawTotal').textContent=rp(q*p+t+o)}['qty','price','transport','other'].forEach(n=>document.querySelector(`#rawForm [name="${n}"]`).addEventListener('input',rawPreview));rawPreview();
$('#rawForm').onsubmit=e=>{e.preventDefault();let x=Object.fromEntries(new FormData(e.target)),q=+x.qty;if(q<=0)return alert('Qty bahan baku harus lebih dari 0.');S.raw.push({id:Date.now(),date:x.date,name:x.name,qty:q,originalQty:q,price:+x.price||0,transport:+x.transport||0,other:+x.other||0,supplier:x.supplier});save();e.target.reset();e.target.date.value=today;rawPreview();alert('Bahan baku berhasil dicatat.')};
$('#batchForm').onsubmit=e=>{e.preventDefault();let x=Object.fromEntries(new FormData(e.target)),r=S.raw.find(z=>z.id==x.rawId);if(!r||+x.inputQty>r.qty)return alert('Stok bahan baku tidak mencukupi.');if(+x.outputQty<=0)return alert('Hasil produksi harus lebih dari 0.');let material=+x.inputQty*landed(r),total=material+(+x.labor||0)+(+x.energy||0)+(+x.other||0),loss=+x.inputQty-+x.outputQty,n=S.batches.length+1;S.batches.push({id:Date.now(),code:`BCH-${x.date.slice(0,4)}-${String(n).padStart(3,'0')}`,date:x.date,rawId:r.id,rawName:r.name,input:+x.inputQty,output:+x.outputQty,loss,lossPct:loss/+x.inputQty*100,totalHpp:total,hppkg:total/+x.outputQty,labor:+x.labor||0,energy:+x.energy||0,other:+x.other||0,note:x.note});r.qty-=+x.inputQty;save();e.target.reset();e.target.date.value=today;alert('Batch produksi berhasil dibuat.')};
$('#salesForm').onsubmit=e=>{e.preventDefault();let x=Object.fromEntries(new FormData(e.target)),b=B(x.batchId);if(!b||+x.qty>b.output-sold(b.id))return alert('Stok batch tidak mencukupi.');S.sales.push({date:x.date,batchId:b.id,customer:x.customer,qty:+x.qty,price:+x.price,total:+x.qty*+x.price,status:x.status});save();e.target.reset();e.target.date.value=today;alert('Penjualan berhasil dicatat.')};
$('#expenseForm').onsubmit=e=>{e.preventDefault();let x=Object.fromEntries(new FormData(e.target));S.expenses.push({...x,amount:+x.amount});save();e.target.reset();e.target.date.value=today;alert('Pengeluaran berhasil dicatat.')};
$('#backup').onclick=()=>{let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(S,null,2)],{type:'application/json'}));a.download='inzaki-charcoal-backup.json';a.click()};
$('#reset').onclick=()=>{if(confirm('Hapus semua data?')){localStorage.removeItem(K);location.reload()}};render();
document.addEventListener('change',e=>{if(e.target&&e.target.id==='chartYear')drawCharts()});
