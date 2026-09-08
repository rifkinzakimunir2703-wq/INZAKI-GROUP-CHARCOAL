/* ================= INZAKI GROUP — Business Dashboard (Online/Supabase) ================= */
const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s),today=new Date().toISOString().slice(0,10);
$$('input[type=date]').forEach(x=>x.value=today);

let S={raw:[],batches:[],sales:[],expenses:[],debts:[]};
let isAdmin=false;
const ADMIN_PAGES=['raw','batch','sales','expenses','debts'];

/* ---- Icons (inline SVG, no external deps) ---- */
const ICON={
  trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="ic-inline"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>',
  cash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="ic-inline"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></svg>',
  calendar:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="ic-inline"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>',
  admin:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="ic-inline"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z"/><path d="M9 12l2 2 4-4"/></svg>',
  lock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="ic-inline"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M7 10V7a5 5 0 0110 0v3"/></svg>'
};
const reduceMotion=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---- Supabase client ---- */
const configOk = typeof SUPABASE_URL!=='undefined' && SUPABASE_URL && !SUPABASE_URL.includes('YOUR-PROJECT') && typeof SUPABASE_ANON_KEY!=='undefined' && SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes('YOUR-ANON');
const sb = (configOk && window.supabase) ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
if(!configOk){$('#configBanner').classList.add('show')}

/* ---- Helpers (formatting) ---- */
const rp=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(+n||0),kg=n=>(+n||0).toLocaleString('id-ID',{maximumFractionDigits:2})+' kg',esc=x=>String(x??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])),landed=r=>(+r.price||0)+((+r.transport||0)+(+r.other||0))/(+r.originalQty||+r.qty||1),day=d=>new Date(d+'T00:00:00'),last7=d=>{let s=new Date();s.setHours(0,0,0,0);s.setDate(s.getDate()-6);return day(d)>=s},thisMonth=d=>{let n=new Date(),x=day(d);return x.getFullYear()==n.getFullYear()&&x.getMonth()==n.getMonth()};
const signed=n=>`<span class="${(+n||0)<0?'neg':'pos'}">${rp(n)}</span>`;
const fmtDate=d=>d?day(d).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}):'-';
/* Animasi hitung naik pada angka statistik utama (KPI) — dinonaktifkan otomatis jika user memilih "reduce motion" */
function animateNum(ids,target,formatFn){
  ids.forEach(id=>{
    const el=document.getElementById(id);if(!el)return;
    const from=+el.dataset.raw||0;
    el.dataset.raw=target;
    if(reduceMotion||from===target){el.textContent=formatFn(target);return}
    const dur=600,t0=performance.now();
    function step(t){
      const p=Math.min((t-t0)/dur,1),e=1-Math.pow(1-p,3),val=from+(target-from)*e;
      el.textContent=formatFn(val);
      if(p<1)requestAnimationFrame(step);else el.textContent=formatFn(target);
    }
    requestAnimationFrame(step);
  });
}
function debtRemaining(d){return Math.max(0,(+d.amount||0)-(+d.paidAmount||0))}
function debtStatus(d){let r=debtRemaining(d);if(r<=0)return{label:'Lunas',cls:'badge-ok'};if(d.dueDate&&day(d.dueDate)<new Date(new Date().setHours(0,0,0,0)))return{label:'Jatuh Tempo',cls:'badge-overdue'};return{label:'Belum Lunas',cls:'badge-pending'}}
function B(id){return S.batches.find(x=>x.id==id)}
function sold(id){return S.sales.filter(x=>x.batchId==id).reduce((a,x)=>a+x.qty,0)}
/* ---- Business Intelligence: rendemen, BEP, harga jual minimum, simulasi ---- */
function yieldPct(b){return b.input?b.output/b.input*100:0}
function getBiMargin(){let el=$('#biMarginTarget');return el?(+el.value||0):20}
function empty(n){return `<tr><td colspan="${n}" style="text-align:center;color:#929a93">Belum ada data</td></tr>`}
function requireAdmin(){if(!isAdmin){alert('Silakan login sebagai admin terlebih dahulu.');return false}return true}
/* Mengisi beberapa elemen sekaligus dengan konten yang sama (dipakai supaya panel Laba & Laporan tampil identik di Dashboard dan halaman Laporan) */
function setAll(ids,value,isText){ids.forEach(id=>{let el=document.getElementById(id);if(el){if(isText)el.textContent=value;else el.innerHTML=value}})}

/* ---- DB <-> JS field mapping (snake_case <-> camelCase) ---- */
const mapRaw=r=>({id:r.id,date:r.date,name:r.name,qty:+r.qty,originalQty:+r.original_qty,price:+r.price,transport:+r.transport,other:+r.other,supplier:r.supplier});
const mapBatch=b=>({id:b.id,code:b.code,date:b.date,rawId:b.raw_id,rawName:b.raw_name,productName:b.product_name||b.raw_name,input:+b.input,output:+b.output,loss:+b.loss,lossPct:+b.loss_pct,totalHpp:+b.total_hpp,hppkg:+b.hpp_kg,labor:+b.labor,energy:+b.energy,other:+b.other,note:b.note});
const mapSale=x=>({id:x.id,date:x.date,batchId:x.batch_id,customer:x.customer_name||x.customer,qty:+x.qty,price:+x.price,total:+x.total,status:x.status});
const mapExpense=x=>({id:x.id,date:x.date,cat:x.cat,desc:x.desc,amount:+x.amount});
const mapDebt=x=>({id:x.id,date:x.date,creditor:x.creditor,desc:x.desc,amount:+x.amount,dueDate:x.due_date,paidAmount:+x.paid_amount||0});

/* ---- Sync badge & loading overlay ---- */
function setSync(state){
  const dot=document.querySelector('#syncBadge .sync-dot'),txt=$('#syncText'),badge=$('#syncBadge');
  if(!badge)return;
  badge.className='sync-badge '+state;
  if(state==='live')txt.textContent='Tersinkron · '+new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
  else if(state==='syncing')txt.textContent='Menyinkronkan…';
  else if(state==='offline')txt.textContent='Mode offline (lokal)';
  else txt.textContent='Menghubungkan…';
}
function hideLoading(){const o=$('#loadingOverlay');if(o)o.classList.add('hide')}

/* ---- Network timeout guard ----
   Jangan biarkan layar loading berputar selamanya jika Supabase
   lambat, offline, RLS salah, atau salah satu tabel tidak merespons. */
function withTimeout(promise, ms=9000, label='Permintaan'){
  return Promise.race([
    promise,
    new Promise((_,reject)=>setTimeout(()=>reject(new Error(label+' timeout setelah '+Math.round(ms/1000)+' detik')),ms))
  ]);
}

/* ---- Load all data from Supabase ---- */
async function loadAll(){
  if(!sb)return;
  setSync('syncing');
  const tables=[
    {key:'raw',table:'raw_materials',map:mapRaw},
    {key:'batches',table:'batches',map:mapBatch},
    {key:'sales',table:'sales',map:mapSale},
    {key:'expenses',table:'expenses',map:mapExpense},
    {key:'debts',table:'debts',map:mapDebt}
  ];

  /* Query dijalankan per tabel dengan timeout, jadi satu tabel bermasalah
     tidak akan menahan seluruh dashboard. */
  const results=await Promise.all(tables.map(async t=>{
    try{
      const res=await withTimeout(
        sb.from(t.table).select('*').order('id'),
        9000,
        'Memuat '+t.table
      );
      return {...res,__table:t};
    }catch(error){
      console.error(`Gagal memuat tabel "${t.table}":`,error);
      return {data:null,error,__table:t};
    }
  }));

  let hasError=false;
  results.forEach(res=>{
    const t=res.__table;
    if(res.error){
      hasError=true;
      console.error(`Gagal memuat tabel "${t.table}":`,res.error.message);
      return;
    }
    S[t.key]=(res.data||[]).map(t.map);
  });

  setSync(hasError?'offline':'live');
  return !hasError;
}

/* ---- Realtime sync across devices ---- */
let refetchTimer=null;
function scheduleRefetch(){clearTimeout(refetchTimer);setSync('syncing');refetchTimer=setTimeout(async()=>{await loadAll();render()},300)}
function subscribeRealtime(){
  if(!sb)return;
  sb.channel('inzaki-live')
    .on('postgres_changes',{event:'*',schema:'public',table:'raw_materials'},scheduleRefetch)
    .on('postgres_changes',{event:'*',schema:'public',table:'batches'},scheduleRefetch)
    .on('postgres_changes',{event:'*',schema:'public',table:'sales'},scheduleRefetch)
    .on('postgres_changes',{event:'*',schema:'public',table:'expenses'},scheduleRefetch)
    .on('postgres_changes',{event:'*',schema:'public',table:'debts'},scheduleRefetch)
    .subscribe();
}

/* ---- Auth ---- */
function applyAdminVisibility(){$$('.admin-only').forEach(el=>{el.style.display=isAdmin?'':'none'})}
function applyAuthState(session){
  isAdmin=!!session;
  document.body.classList.toggle('is-admin',isAdmin);
  applyAdminVisibility();
  $('#loginBtn').style.display=isAdmin?'none':'block';
  $('#logoutBtn').style.display=isAdmin?'block':'none';
  $('#authStatus').innerHTML=isAdmin?(ICON.admin+' Admin — '+esc(session.user.email)):(ICON.lock+' Mode Publik — lihat saja');
  render();
}
async function initAuth(){
  if(!sb)return;
  try{
    const {data:{session}}=await withTimeout(sb.auth.getSession(),7000,'Memeriksa sesi login');
    applyAuthState(session);
  }catch(error){
    console.error('Gagal memeriksa sesi:',error);
    applyAuthState(null);
    setSync('offline');
  }
  try{
    sb.auth.onAuthStateChange((_event,session)=>applyAuthState(session));
  }catch(error){
    console.error('Auth listener gagal:',error);
  }
}

/* ---- Charts ---- */
let financeChart=null,productionChart=null;
const PALETTE={ember:'#22C55E',gold:'#F5A524',red:'#F76E7E',green:'#22C55E',teal:'#2DD4CF',violet:'#A78BFA',ink:'#F1F4EF',muted:'#8E9A8B',grid:'rgba(255,255,255,.08)'};
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
 const isSmall=window.innerWidth<=520;
 const legendFont={size:isSmall?10:12};
 const tickFont={size:isSmall?9.5:11};
 if(financeChart)financeChart.destroy();
 financeChart=new Chart($('#financeChart'),{type:'line',data:{labels,datasets:[
   {label:'Omzet',data:omzet,tension:.35,borderWidth:2.5,borderColor:PALETTE.gold,backgroundColor:PALETTE.gold,pointRadius:2,pointBackgroundColor:PALETTE.gold},
   {label:'HPP',data:hpp,tension:.35,borderWidth:2,borderColor:PALETTE.teal,backgroundColor:PALETTE.teal,pointRadius:0},
   {label:'Pengeluaran',data:expense,tension:.35,borderWidth:2,borderColor:PALETTE.red,backgroundColor:PALETTE.red,pointRadius:0},
   {label:'Laba',data:profit,tension:.35,borderWidth:3,borderColor:PALETTE.ember,backgroundColor:'rgba(34,197,94,.14)',fill:true,pointRadius:2,pointBackgroundColor:PALETTE.ember}
 ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'bottom',labels:{color:PALETTE.ink,boxWidth:9,boxHeight:9,usePointStyle:true,pointStyle:'circle',font:legendFont,padding:isSmall?10:14}}},scales:{x:{grid,ticks:{font:tickFont}},y:{grid,ticks:{font:tickFont,callback:v=>rp(v)}}}}});
 if(productionChart)productionChart.destroy();
 productionChart=new Chart($('#productionChart'),{type:'bar',data:{labels,datasets:[
   {label:'Bahan masuk (kg)',data:input,borderRadius:6,backgroundColor:'rgba(232,184,75,.75)'},
   {label:'Barang jadi (kg)',data:output,borderRadius:6,backgroundColor:PALETTE.ember}
 ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:PALETTE.ink,boxWidth:9,boxHeight:9,usePointStyle:true,pointStyle:'circle',font:legendFont,padding:isSmall?10:14}}},scales:{x:{grid,ticks:{font:tickFont}},y:{beginAtZero:true,grid,ticks:{font:tickFont,callback:v=>v+' kg'}}}}});
}

/* ---- Chart komposisi biaya (donut) — dipakai untuk 2 canvas (Laporan & Dashboard) ---- */
let costCharts={};
function drawCostChart(elId,rows,total){
 let el=$('#'+elId);if(!el||typeof Chart==='undefined')return;
 if(costCharts[elId]){costCharts[elId].destroy();delete costCharts[elId]}
 if(!total){el.style.display='none';return}
 el.style.display='';
 costCharts[elId]=new Chart(el,{type:'doughnut',data:{labels:rows.map(r=>r.label),datasets:[{data:rows.map(r=>r.val),backgroundColor:rows.map(r=>r.color),borderColor:'#121614',borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,cutout:'72%',plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>` ${c.label}: ${rp(c.parsed)} (${(c.parsed/total*100).toFixed(1)}%)`}}}}});
}

/* ---- Insight & Rekomendasi otomatis (rule-based dari data yang ada) ---- */
function buildInsightsHtml(){
 let insights=[];
 let sorted=S.batches.slice().sort((a,b)=>new Date(a.date)-new Date(b.date));
 if(sorted.length>=2){
   let prev=sorted[sorted.length-2],cur=sorted[sorted.length-1],py=yieldPct(prev),cy=yieldPct(cur),diff=cy-py;
   if(Math.abs(diff)>=0.5)insights.push({type:diff>0?'up':'down',title:diff>0?'Rendemen meningkat':'Rendemen menurun',body:`${esc(cur.code)} ${diff>0?'naik':'turun'} ${Math.abs(diff).toFixed(1)} poin dibanding ${esc(prev.code)} (${py.toFixed(1)}% → ${cy.toFixed(1)}%).`});
 }
 let sellPriceOf=b=>{let ss=S.sales.filter(x=>x.batchId==b.id),q=ss.reduce((a,x)=>a+x.qty,0);return q?ss.reduce((a,x)=>a+x.total,0)/q:null};
 let belowHpp=S.batches.map(b=>({b,p:sellPriceOf(b)})).filter(x=>x.p!==null&&x.p<x.b.hppkg);
 if(belowHpp.length){
   let prices=belowHpp.map(x=>x.p),minP=Math.min(...prices),maxP=Math.max(...prices),bepMin=Math.min(...belowHpp.map(x=>x.b.hppkg));
   insights.push({type:'warn',title:'Harga jual masih di bawah HPP',body:`Harga jual efektif: ${rp(minP)} – ${rp(maxP)}/kg. BEP minimal: ${rp(bepMin)}/kg.`});
 }
 let saran=[];
 let avgYieldAll=S.batches.length?S.batches.reduce((a,b)=>a+yieldPct(b),0)/S.batches.length:0;
 if(S.batches.length&&avgYieldAll<27)saran.push('Tingkatkan rendemen produksi (target ≥27%).');
 let highLoss=S.batches.filter(b=>b.lossPct>75);
 if(highLoss.length)saran.push(`Evaluasi penyebab susut tinggi di ${highLoss.map(b=>esc(b.code)).join(', ')}.`);
 if(belowHpp.length)saran.push('Naikkan harga jual atau cari pasar dengan harga lebih baik.');
 if(saran.length)insights.push({type:'ok',title:'Saran fokus',body:saran});
 if(!insights.length)return '<div class="stock-empty">Belum cukup data untuk insight. Tambahkan batch &amp; penjualan dulu.</div>';
 return insights.map(i=>{
   let icon=i.type==='up'?'▲':i.type==='down'?'▼':i.type==='warn'?'⚠':'✓';
   let body=Array.isArray(i.body)?`<ol>${i.body.map(x=>`<li>${x}</li>`).join('')}</ol>`:`<p>${i.body}</p>`;
   return `<div class="insight-card ins-${i.type}"><div class="insight-head"><span class="insight-ic">${icon}</span><b>${esc(i.title)}</b></div>${body}</div>`;
 }).join('');
}

/* ---- Render ---- */
function render(){
let rawQty=S.raw.reduce((a,x)=>a+x.qty,0),rawValue=S.raw.reduce((a,x)=>a+x.qty*landed(x),0),out=S.batches.reduce((a,x)=>a+x.output,0),inp=S.batches.reduce((a,x)=>a+x.input,0),loss=inp-out;
let finishedQty=out-S.sales.reduce((a,x)=>a+x.qty,0),finishedValue=S.batches.reduce((a,b)=>a+Math.max(0,b.output-sold(b.id))*b.hppkg,0);
let ws=S.sales.filter(x=>last7(x.date)),ms=S.sales.filter(x=>thisMonth(x.date)),we=S.expenses.filter(x=>last7(x.date)).reduce((a,x)=>a+x.amount,0),me=S.expenses.filter(x=>thisMonth(x.date)).reduce((a,x)=>a+x.amount,0);
let wc=ws.reduce((a,x)=>{let b=B(x.batchId);return a+(b?x.qty*b.hppkg:0)},0),mc=ms.reduce((a,x)=>{let b=B(x.batchId);return a+(b?x.qty*b.hppkg:0)},0);
/* Kartu stok terpisah per jenis: tiap bahan baku & tiap produk jadi dapat kartu sendiri */
let normName=n=>(n||'').trim().toLowerCase();
let rawByName={};S.raw.forEach(r=>{let disp=(r.name||'(tanpa nama)').trim(),k=normName(disp)||'(tanpa nama)';if(!rawByName[k])rawByName[k]={name:disp,qty:0,value:0};rawByName[k].qty+=r.qty;rawByName[k].value+=r.qty*landed(r)});
let finByName={};S.batches.forEach(b=>{let q=b.output-sold(b.id);if(q<=0)return;let disp=(b.productName||'(tanpa nama)').trim(),k=normName(disp)||'(tanpa nama)';if(!finByName[k])finByName[k]={name:disp,qty:0,value:0};finByName[k].qty+=q;finByName[k].value+=q*b.hppkg});
let stockCardsHtml=Object.values(rawByName).map(v=>`<div class="stock-card is-raw"><span class="stock-tag">Bahan Baku</span><div class="stock-card-name">${esc(v.name)}</div><div class="stock-card-qty">${kg(v.qty)}</div><div class="stock-card-value">${rp(v.value)}</div></div>`).join('')
 +Object.values(finByName).map(v=>`<div class="stock-card is-product"><span class="stock-tag">Barang Jadi</span><div class="stock-card-name">${esc(v.name)}</div><div class="stock-card-qty">${kg(v.qty)}</div><div class="stock-card-value">${rp(v.value)}</div></div>`).join('');
$('#stockCards').innerHTML=stockCardsHtml||'<div class="stock-empty">Belum ada data bahan baku maupun barang jadi</div>';
$('#dProfitWeek').innerHTML=signed(ws.reduce((a,x)=>a+x.total,0)-wc-we);$('#dProfitMonth').innerHTML=signed(ms.reduce((a,x)=>a+x.total,0)-mc-me);$('#dExpenseWeek').textContent=rp(we);$('#dExpenseMonth').textContent=rp(me);
/* Hutang perusahaan */
let activeDebts=S.debts.filter(d=>debtRemaining(d)>0),outstanding=activeDebts.reduce((a,d)=>a+debtRemaining(d),0),overdue=activeDebts.filter(d=>debtStatus(d).label==='Jatuh Tempo').length;
$('#dDebtOutstanding').textContent=rp(outstanding);
$('#dDebtInfo').textContent=`${activeDebts.length} kreditur aktif${overdue?' · '+overdue+' jatuh tempo':''}`;
$('#dDebtBreakdown').innerHTML=activeDebts.length?activeDebts.map(d=>`<div class="bd-row"><span>${esc(d.creditor)}</span><span>${rp(debtRemaining(d))} · ${debtStatus(d).label}</span></div>`).join(''):'<div class="bd-row bd-empty">Tidak ada hutang aktif</div>';
/* ---- Untung/rugi per batch (dihitung lebih awal supaya bisa dipakai di kartu Statistik Susut) ---- */
function batchProfitInfo(b){let ss=S.sales.filter(x=>x.batchId==b.id),om=ss.reduce((a,x)=>a+x.total,0),q=ss.reduce((a,x)=>a+x.qty,0),hc=q*b.hppkg,l=om-hc;return{om,q,hc,l,sisa:b.output-q}}
let allBatchProfit=S.batches.map(batchProfitInfo);
let totalRealizedProfit=allBatchProfit.reduce((a,x)=>a+x.l,0);
$('#susutTotal').innerHTML=`<span>Total ${totalRealizedProfit<0?'Kerugian':'Keuntungan'} Terjual: </span>${signed(totalRealizedProfit)}`;
$('#susutTotal').className='susut-total '+(totalRealizedProfit<0?'neg':'pos');
/* Statistik susut per batch (individual, bukan digabung per lini), + untung/rugi Rp */
$('#batchLossList').innerHTML=S.batches.slice().reverse().slice(0,10).map(b=>{
  let pct=b.lossPct||0,cls=pct<=10?'good':(pct<=20?'warn':'bad'),pf=batchProfitInfo(b);
  let profitRow=pf.q>0?`<div class="blc-profit ${pf.l<0?'neg':'pos'}"><span>${pf.l<0?'Rugi':'Untung'}</span><b>${rp(Math.abs(pf.l))}</b></div>`:`<div class="blc-profit"><span>Belum terjual</span><b>—</b></div>`;
  return `<div class="batch-loss-card ${cls}"><div class="blc-top"><b>${esc(b.code)}</b><span class="blc-pct">${pct.toFixed(1)}%</span></div><div class="blc-name">${esc(b.productName)}<small>dari ${esc(b.rawName)}</small></div><div class="blc-date">${ICON.calendar} Produksi: ${fmtDate(b.date)}</div><div class="blc-bar"><div class="blc-bar-fill" style="width:${Math.min(100,pct)}%"></div></div><div class="blc-meta"><span>Masuk ${kg(b.input)}</span><span>Jadi ${kg(b.output)}</span><span>Susut ${kg(b.loss)}</span></div>${profitRow}</div>`;
}).join('')||'<div class="stock-empty">Belum ada data batch produksi</div>';
/* Statistik per lini produksi (mis. Kelapa → Kopra, Batok Kelapa → Arang), dipakai di dashboard & laporan */
let lineStats={};S.batches.forEach(b=>{let k=`${b.rawName||'?'}→${b.productName||'?'}`;if(!lineStats[k])lineStats[k]={raw:b.rawName,product:b.productName,batches:0,input:0,output:0,loss:0,hpp:0};let s=lineStats[k];s.batches++;s.input+=b.input;s.output+=b.output;s.loss+=b.loss;s.hpp+=b.totalHpp});
$('#lineStatsCards').innerHTML=Object.values(lineStats).length?Object.values(lineStats).map((s,i)=>{
  let lp=s.input?s.loss/s.input*100:0,avgHpp=s.output?s.hpp/s.output:0;
  let lineBatches=S.batches.filter(b=>b.rawName===s.raw&&b.productName===s.product);
  let sisaStok=lineBatches.reduce((a,b)=>a+Math.max(0,b.output-sold(b.id)),0),nilaiStok=lineBatches.reduce((a,b)=>a+Math.max(0,b.output-sold(b.id))*b.hppkg,0);
  return `<div class="line-card"><div class="line-card-head"><b>${esc(s.raw)} → ${esc(s.product)}</b><span>${s.batches} batch</span></div><div class="line-stats-mini">
  <div><span>Bahan Masuk</span><b>${kg(s.input)}</b></div>
  <div><span>Hasil Produksi</span><b>${kg(s.output)}</b></div>
  <div><span>Susut</span><b>${kg(s.loss)} (${lp.toFixed(1)}%)</b></div>
  <div><span>Rendemen</span><b>${(s.input?s.output/s.input*100:0).toFixed(1)}%</b></div>
  <div><span>HPP / kg</span><b>${rp(avgHpp)}</b></div>
  <div><span>Stok Tersisa</span><b>${kg(sisaStok)}</b></div>
  <div><span>Nilai Stok</span><b>${rp(nilaiStok)}</b></div>
  </div></div>`;
}).join(''):'<div class="stock-empty">Belum ada data produksi</div>';
/* ---- Business Intelligence: ringkasan per lini (rendemen, HPP, BEP, harga rekomendasi, margin aktual) ---- */
let biMargin=getBiMargin();
let biRows=Object.values(lineStats).map(s=>{
  let lineBatches=S.batches.filter(b=>b.rawName===s.raw&&b.productName===s.product),ids=new Set(lineBatches.map(b=>b.id));
  let lineSales=S.sales.filter(x=>ids.has(x.batchId)),soldQty=lineSales.reduce((a,x)=>a+x.qty,0),soldRev=lineSales.reduce((a,x)=>a+x.total,0);
  let avgSell=soldQty?soldRev/soldQty:0,avgYield=s.input?s.output/s.input*100:0,avgHpp=s.output?s.hpp/s.output:0;
  let bep=avgHpp,rec=avgHpp*(1+biMargin/100),marginNow=soldQty?((avgSell-avgHpp)/avgSell*100):null;
  return{raw:s.raw,product:s.product,avgYield,avgHpp,avgSell,soldQty,bep,rec,marginNow};
});
let biHtml=biRows.length?biRows.map(r=>`<tr><td data-label="Lini Produksi">${esc(r.raw)} → ${esc(r.product)}</td><td data-label="Rendemen">${r.avgYield.toFixed(1)}%</td><td data-label="HPP/kg">${rp(r.avgHpp)}</td><td data-label="BEP (Harga Min)">${rp(r.bep)}</td><td data-label="Harga Rekomendasi">${rp(r.rec)}</td><td data-label="Harga Jual Rata²">${r.soldQty?rp(r.avgSell):'—'}</td><td data-label="Margin Aktual">${r.marginNow===null?'— (belum terjual)':(r.marginNow<0?'<span class="neg">':'<span class="pos">')+r.marginNow.toFixed(1)+'%</span>'}</td></tr>`).join(''):empty(7);
setAll(['biTable','biTableD'],biHtml,false);
fillBiSimBatch();
/* ---- BEP & Harga Jual Minimum (ringkasan global, seluruh batch) ---- */
let totalOutputAll=S.batches.reduce((a,b)=>a+b.output,0),totalHppAll=S.batches.reduce((a,b)=>a+b.totalHpp,0);
let globalBep=totalOutputAll?totalHppAll/totalOutputAll:0;
let totalSoldQtyAll=S.sales.reduce((a,x)=>a+x.qty,0),totalSoldRevAll=S.sales.reduce((a,x)=>a+x.total,0);
let globalAvgSell=totalSoldQtyAll?totalSoldRevAll/totalSoldQtyAll:0,sellGap=globalAvgSell-globalBep;
if($('#bepValue'))$('#bepValue').textContent=rp(globalBep)+'/kg';
if($('#bepCurrentPrice'))$('#bepCurrentPrice').textContent=totalSoldQtyAll?rp(globalAvgSell)+'/kg':'Belum ada penjualan';
if($('#bepGap')){let g=$('#bepGap');g.textContent=totalSoldQtyAll?(sellGap<0?'-':'+')+rp(Math.abs(sellGap)):'—';g.className=sellGap<0?'neg':'pos'}
if($('#bepCta'))$('#bepCta').style.display=(totalSoldQtyAll&&sellGap<0)?'block':'none';
if($('#bepValueD'))$('#bepValueD').textContent=rp(globalBep)+'/kg';
if($('#bepCurrentPriceD'))$('#bepCurrentPriceD').textContent=totalSoldQtyAll?rp(globalAvgSell)+'/kg':'Belum ada penjualan';
if($('#bepGapD')){let g=$('#bepGapD');g.textContent=totalSoldQtyAll?(sellGap<0?'-':'+')+rp(Math.abs(sellGap)):'—';g.className=sellGap<0?'neg':'pos'}
if($('#bepCtaD'))$('#bepCtaD').style.display=(totalSoldQtyAll&&sellGap<0)?'block':'none';
/* ---- Komposisi Biaya Produksi ---- */
let costComp={bahan:0,transport:0,tenaga:0,energi:0,lain:0};
S.batches.forEach(b=>{
  let r=S.raw.find(x=>x.id===b.rawId),basis=r?(+r.originalQty||+r.qty||1):1;
  let rawPrice=r?+r.price:0,rawTransport=r?+r.transport:0,rawOther=r?+r.other:0;
  costComp.bahan+=b.input*rawPrice;
  costComp.transport+=b.input*(rawTransport/basis);
  costComp.lain+=b.input*(rawOther/basis)+(+b.other||0);
  costComp.tenaga+=+b.labor||0;
  costComp.energi+=+b.energy||0;
});
let costTotal=costComp.bahan+costComp.transport+costComp.tenaga+costComp.energi+costComp.lain;
let costRows=[
 {label:'Bahan Baku',val:costComp.bahan,color:PALETTE.ember},
 {label:'Tenaga Kerja',val:costComp.tenaga,color:PALETTE.teal},
 {label:'Energi & Bahan Bakar',val:costComp.energi,color:PALETTE.gold},
 {label:'Transportasi',val:costComp.transport,color:PALETTE.violet},
 {label:'Biaya Lain-lain',val:costComp.lain,color:PALETTE.muted}
];
if($('#costTotal'))$('#costTotal').textContent=rp(costTotal);
if($('#costTotalD'))$('#costTotalD').textContent=rp(costTotal);
let costLegendHtml=costRows.map(r=>`<div class="cc-legend-row"><span class="cc-dot" style="background:${r.color}"></span><span class="cc-label">${r.label}</span><b>${costTotal?(r.val/costTotal*100).toFixed(1):'0.0'}%</b></div>`).join('');
if($('#costLegend'))$('#costLegend').innerHTML=costLegendHtml;
if($('#costLegendD'))$('#costLegendD').innerHTML=costLegendHtml;
drawCostChart('costChart',costRows,costTotal);
drawCostChart('costChartD',costRows,costTotal);
/* ---- Insight & Rekomendasi otomatis ---- */
let insightHtml=buildInsightsHtml();
if($('#insightList'))$('#insightList').innerHTML=insightHtml;
if($('#insightListD'))$('#insightListD').innerHTML=insightHtml;
$('#rawTable').innerHTML=S.raw.map(r=>`<tr><td data-label="Bahan">${esc(r.name)}</td><td data-label="Stok">${kg(r.qty)}</td><td data-label="Harga/kg">${rp(r.price)}</td><td data-label="Transport">${rp(r.transport)}</td><td data-label="Biaya lain">${rp(r.other)}</td><td data-label="HPP masuk/kg">${rp(landed(r))}</td><td data-label="Nilai stok">${rp(r.qty*landed(r))}</td><td data-label="Supplier">${esc(r.supplier||'-')}</td><td data-label="Aksi"><button onclick="deleteRaw('${r.id}')" class="btn-delete">${ICON.trash} Hapus</button></td></tr>`).join('')||empty(9);
$('#rawSelect').innerHTML=S.raw.filter(r=>r.qty>0).map(r=>`<option value="${r.id}">${esc(r.name)} — ${kg(r.qty)} @ ${rp(landed(r))}/kg</option>`).join('');
$('#batchTable').innerHTML=S.batches.slice().reverse().map(b=>`<tr><td data-label="Batch">${b.code}</td><td data-label="Tanggal">${b.date}</td><td data-label="Bahan Baku">${esc(b.rawName)}</td><td data-label="Produk Jadi">${esc(b.productName)}</td><td data-label="Input">${kg(b.input)}</td><td data-label="Output">${kg(b.output)}</td><td data-label="Penyusutan">${kg(b.loss)} (${b.lossPct.toFixed(1)}%)</td><td data-label="HPP Batch">${rp(b.totalHpp)}</td><td data-label="HPP/kg">${rp(b.hppkg)}</td><td data-label="Aksi"><button onclick="deleteBatch('${b.id}')" class="btn-delete">${ICON.trash} Hapus</button></td></tr>`).join('')||empty(10);
$('#salesBatch').innerHTML=S.batches.filter(b=>b.output-sold(b.id)>0).map(b=>`<option value="${b.id}">${b.code} — ${esc(b.productName)} — sisa ${kg(b.output-sold(b.id))} — HPP ${rp(b.hppkg)}/kg</option>`).join('');
let tq=0,tv=0;$('#finishedTable').innerHTML=S.batches.map(b=>{let q=b.output-sold(b.id);tq+=q;tv+=q*b.hppkg;return `<tr><td data-label="Batch">${b.code}</td><td data-label="Produk Jadi">${esc(b.productName)}</td><td data-label="Bahan Asal">${esc(b.rawName)}</td><td data-label="Masuk">${kg(b.output)}</td><td data-label="Terjual">${kg(sold(b.id))}</td><td data-label="Sisa">${kg(q)}</td><td data-label="HPP/kg">${rp(b.hppkg)}</td></tr>`}).join('')||empty(7);
$('#fQty').textContent=kg(tq);$('#fValue').textContent=rp(tv);$('#fAvg').textContent=rp(tq?tv/tq:0);
animateNum(['fQty'],tq,kg);animateNum(['fValue'],tv,rp);animateNum(['fAvg'],tq?tv/tq:0,rp);
$('#salesTable').innerHTML=S.sales.slice().reverse().map(x=>{let b=B(x.batchId),c=x.qty*(b?b.hppkg:0),status=x.status||'Lunas';return `<tr><td data-label="Tanggal">${x.date}</td><td data-label="Batch">${b?.code||'-'}</td><td data-label="Pelanggan">${esc(x.customer||'')}</td><td data-label="Qty">${kg(x.qty)}</td><td data-label="Omzet">${rp(x.total)}</td><td data-label="HPP">${rp(c)}</td><td data-label="Laba">${signed(x.total-c)}</td><td data-label="Status"><span class="badge ${status==='Lunas'?'badge-ok':'badge-pending'}">${esc(status)}</span></td><td data-label="Aksi">${status!=='Lunas'?`<button onclick="markSalePaid('${x.id}')" class="btn-pay">${ICON.cash} Lunas</button>`:''}<button onclick="deleteSale('${x.id}')" class="btn-delete">${ICON.trash} Hapus</button></td></tr>`}).join('')||empty(9);
$('#expenseTable').innerHTML=S.expenses.slice().reverse().map(x=>`<tr><td data-label="Tanggal">${x.date}</td><td data-label="Kategori">${x.cat}</td><td data-label="Deskripsi">${esc(x.desc)}</td><td data-label="Jumlah">${rp(x.amount)}</td><td data-label="Aksi"><button onclick="deleteExpense('${x.id}')" class="btn-delete">${ICON.trash} Hapus</button></td></tr>`).join('')||empty(5);
$('#debtTable').innerHTML=S.debts.slice().reverse().map(d=>{let r=debtRemaining(d),st=debtStatus(d);return `<tr><td data-label="Tanggal">${d.date}</td><td data-label="Kreditur">${esc(d.creditor)}</td><td data-label="Keterangan">${esc(d.desc||'-')}</td><td data-label="Jumlah">${rp(d.amount)}</td><td data-label="Terbayar">${rp(d.paidAmount)}</td><td data-label="Sisa">${rp(r)}</td><td data-label="Jatuh Tempo">${d.dueDate||'-'}</td><td data-label="Status"><span class="badge ${st.cls}">${st.label}</span></td><td data-label="Aksi">${r>0?`<button onclick="payDebt('${d.id}')" class="btn-pay">${ICON.cash} Bayar</button>`:''}<button onclick="deleteDebt('${d.id}')" class="btn-delete">${ICON.trash} Hapus</button></td></tr>`}).join('')||empty(9);
/* Statistik Produksi Lengkap (akumulasi seluruh waktu, per lini produksi) — tampil di halaman Laporan & juga di Dashboard */
animateNum(['psBatches','psBatchesD'],S.batches.length,v=>Math.round(v).toLocaleString('id-ID'));
animateNum(['psInput','psInputD'],inp,kg);animateNum(['psOutput','psOutputD'],out,kg);animateNum(['psLoss','psLossD'],loss,kg);
setAll(['psLossPct','psLossPctD'],(inp?loss/inp*100:0).toFixed(1)+'%',true);
animateNum(['psHpp','psHppD'],S.batches.reduce((a,b)=>a+b.totalHpp,0),rp);
let productionDays=new Set(S.batches.map(b=>b.date).filter(Boolean)).size;
animateNum(['psDays','psDaysD'],productionDays,v=>Math.round(v)+' hari');
if($('#recentSub'))$('#recentSub').textContent=`5 batch produksi paling akhir · total ${productionDays} hari produksi tercatat`;
let prodStatsHtml=Object.values(lineStats).map(s=>{let lp=s.input?s.loss/s.input*100:0,avgHpp=s.output?s.hpp/s.output:0,avgYield=s.input?s.output/s.input*100:0;return `<tr><td data-label="Lini Produksi">${esc(s.raw)} → ${esc(s.product)}</td><td data-label="Jumlah Batch">${s.batches}</td><td data-label="Total Masuk">${kg(s.input)}</td><td data-label="Total Jadi">${kg(s.output)}</td><td data-label="Total Susut">${kg(s.loss)}</td><td data-label="Rata² Susut">${lp.toFixed(1)}%</td><td data-label="Rata² Rendemen">${avgYield.toFixed(1)}%</td><td data-label="Total HPP">${rp(s.hpp)}</td><td data-label="Rata² HPP/kg">${rp(avgHpp)}</td></tr>`}).join('')||empty(9);
setAll(['prodStatsTable','prodStatsTableD'],prodStatsHtml,false);
/* Untung/Rugi per batch — data lengkap untuk evaluasi perusahaan — tampil di halaman Laporan & juga di Dashboard */
let profitHtml=S.batches.slice().reverse().map(b=>{
  let ss=S.sales.filter(x=>x.batchId==b.id),om=ss.reduce((a,x)=>a+x.total,0),q=ss.reduce((a,x)=>a+x.qty,0),hc=q*b.hppkg,l=om-hc,sisa=b.output-q;
  let status=q===0?{t:'Belum Terjual',c:'badge-pending'}:l>0?{t:'Untung',c:'badge-ok'}:l<0?{t:'Rugi',c:'badge-overdue'}:{t:'Impas',c:'badge-pending'};
  return `<tr><td data-label="Batch">${esc(b.code)}</td><td data-label="Tanggal">${b.date}</td><td data-label="Bahan → Produk">${esc(b.rawName)} → ${esc(b.productName)}</td><td data-label="Output">${kg(b.output)}</td><td data-label="Susut">${kg(b.loss)} (${b.lossPct.toFixed(1)}%)</td><td data-label="Rendemen">${yieldPct(b).toFixed(1)}%</td><td data-label="HPP/kg">${rp(b.hppkg)}</td><td data-label="Terjual">${kg(q)}</td><td data-label="Sisa Stok">${kg(sisa)}</td><td data-label="Omzet">${rp(om)}</td><td data-label="Untung/Rugi">${signed(l)}</td><td data-label="Margin">${om?(l/om*100).toFixed(1):0}%</td><td data-label="Status"><span class="badge ${status.c}">${status.t}</span></td></tr>`;
}).join('')||empty(13);
setAll(['profitTable','profitTableD'],profitHtml,false);
let totalSales=S.sales.reduce((a,x)=>a+x.total,0),totalCogs=S.sales.reduce((a,x)=>{let b=B(x.batchId);return a+(b?x.qty*b.hppkg:0)},0),totalExp=S.expenses.reduce((a,x)=>a+x.amount,0);
let batchProfit=S.batches.map(b=>{let ss=S.sales.filter(x=>x.batchId==b.id),om=ss.reduce((a,x)=>a+x.total,0),q=ss.reduce((a,x)=>a+x.qty,0);return{q,l:om-q*b.hppkg}});
let untung=batchProfit.filter(x=>x.q>0&&x.l>0).length,rugi=batchProfit.filter(x=>x.q>0&&x.l<0).length,belum=batchProfit.filter(x=>x.q===0).length;
setAll(['report','reportD'],`<div><span>Total omzet</span><strong>${rp(totalSales)}</strong></div><div><span>HPP terjual</span><strong>${rp(totalCogs)}</strong></div><div><span>Laba kotor</span><strong>${signed(totalSales-totalCogs)}</strong></div><div><span>Pengeluaran umum</span><strong>${rp(totalExp)}</strong></div><div><span>Laba bersih</span><strong>${signed(totalSales-totalCogs-totalExp)}</strong></div><div><span>Total batch</span><strong>${S.batches.length}</strong></div><div><span>Batch untung / rugi / belum terjual</span><strong>${untung} / ${rugi} / ${belum}</strong></div><div><span>Hutang belum lunas</span><strong>${rp(S.debts.reduce((a,d)=>a+debtRemaining(d),0))}</strong></div>`,false);
$('#recent').innerHTML=`<div class="recent-list">${S.batches.slice(-5).reverse().map(b=>`<div class="recent-item"><div class="recent-item-main"><div class="recent-item-title">${esc(b.code)} <small>${esc(b.productName)} dari ${esc(b.rawName)}</small></div><div class="recent-item-meta"><span>Hasil <b>${kg(b.output)}</b></span><span>HPP <b>${rp(b.hppkg)}</b>/kg</span><span>Susut <b>${b.lossPct.toFixed(1)}%</b></span></div></div><div class="recent-item-date"><b>${fmtDate(b.date)}</b><small>Tgl Produksi</small></div></div>`).join('')}</div>`||'<div class="recent-empty">Belum ada batch.</div>';
if(!S.batches.length)$('#recent').innerHTML='<div class="recent-empty">Belum ada data batch produksi.</div>';
/* ---- Gate: sembunyikan detail keuangan dari publik, tampil hanya setelah login admin ---- */
let financeLocked=$('#financeLocked'),financeContent=$('#financeContent');
if(financeLocked&&financeContent){financeLocked.style.display=isAdmin?'none':'block';financeContent.style.display=isAdmin?'block':'none'}
drawCharts();
}

/* ---- DELETE FUNCTIONS ---- */

// Hapus Penjualan
async function deleteSale(id) {
    if (!requireAdmin()) return;
    const sale = S.sales.find(x => x.id === id);
    if (!sale) return alert('Data tidak ditemukan!');
    if (!confirm(`Hapus penjualan?\n\nTanggal: ${sale.date}\nPelanggan: ${sale.customer}\nQTY: ${sale.qty} kg\nTotal: ${rp(sale.total)}\n\nData akan dihapus permanen!`)) return;
    const { error } = await sb.from('sales').delete().eq('id', id);
    if (error) return alert('Gagal hapus: ' + error.message);
    S.sales = S.sales.filter(x => x.id !== id);
    render();
    alert('✅ Penjualan berhasil dihapus!');
}

// Tandai piutang penjualan sebagai LUNAS
async function markSalePaid(id){
    if(!requireAdmin())return;
    const sale=S.sales.find(x=>x.id===id);
    if(!sale)return alert('Data piutang tidak ditemukan!');
    if((sale.status||'Lunas')==='Lunas')return alert('Transaksi ini sudah lunas.');
    if(!confirm(`Tandai piutang menjadi LUNAS?\n\nPelanggan: ${sale.customer||'Umum'}\nNilai: ${rp(sale.total)}`))return;
    const {data,error}=await sb.from('sales').update({status:'Lunas'}).eq('id',id).select().single();
    if(error)return alert('Gagal menandai lunas: '+error.message);
    Object.assign(sale,mapSale(data));
    render();
    alert('✅ Piutang berhasil ditandai LUNAS.');
}
window.markSalePaid=markSalePaid;

// Hapus Batch
async function deleteBatch(id) {
    if (!requireAdmin()) return;
    const batch = S.batches.find(x => x.id === id);
    if (!batch) return alert('Data tidak ditemukan!');
    const hasSales = S.sales.some(x => x.batchId === id);
    if (hasSales) {
        if (!confirm(`⚠️ Batch ${batch.code} sudah memiliki penjualan.\nHapus akan menghapus semua penjualan terkait!\n\nLanjutkan?`)) return;
        for (const sale of S.sales.filter(x => x.batchId === id)) {
            await sb.from('sales').delete().eq('id', sale.id);
        }
        S.sales = S.sales.filter(x => x.batchId !== id);
    }
    if (!confirm(`Hapus batch?\n\nKode: ${batch.code}\nTanggal: ${batch.date}\nOutput: ${batch.output} kg\n\nData akan dihapus permanen!`)) return;
    if (batch.rawId) {
        const raw = S.raw.find(r => r.id === batch.rawId);
        if (raw) {
            await sb.from('raw_materials').update({ qty: raw.qty + batch.input }).eq('id', raw.id);
            raw.qty += batch.input;
        }
    }
    const { error } = await sb.from('batches').delete().eq('id', id);
    if (error) return alert('Gagal hapus: ' + error.message);
    S.batches = S.batches.filter(x => x.id !== id);
    render();
    alert('✅ Batch berhasil dihapus!');
}

// Hapus Bahan Baku
async function deleteRaw(id) {
    if (!requireAdmin()) return;
    const raw = S.raw.find(x => x.id === id);
    if (!raw) return alert('Data tidak ditemukan!');
    const usedInBatch = S.batches.some(x => x.rawId === id);
    if (usedInBatch) {
        return alert('❌ Bahan baku ini sudah digunakan dalam produksi batch, tidak bisa dihapus!');
    }
    if (!confirm(`Hapus bahan baku?\n\nNama: ${raw.name}\nQTY: ${raw.qty} kg\n\nData akan dihapus permanen!`)) return;
    const { error } = await sb.from('raw_materials').delete().eq('id', id);
    if (error) return alert('Gagal hapus: ' + error.message);
    S.raw = S.raw.filter(x => x.id !== id);
    render();
    alert('✅ Bahan baku berhasil dihapus!');
}

// Hapus Pengeluaran
async function deleteExpense(id) {
    if (!requireAdmin()) return;
    const expense = S.expenses.find(x => x.id === id);
    if (!expense) return alert('Data tidak ditemukan!');
    if (!confirm(`Hapus pengeluaran?\n\nTanggal: ${expense.date}\nKategori: ${expense.cat}\nDeskripsi: ${expense.desc}\nJumlah: ${rp(expense.amount)}\n\nData akan dihapus permanen!`)) return;
    const { error } = await sb.from('expenses').delete().eq('id', id);
    if (error) return alert('Gagal hapus: ' + error.message);
    S.expenses = S.expenses.filter(x => x.id !== id);
    render();
    alert('✅ Pengeluaran berhasil dihapus!');
}

/* ---- Navigation ---- */
function go(p){if(ADMIN_PAGES.includes(p)&&!isAdmin)p='dashboard';$$('.page').forEach(x=>x.classList.toggle('active',x.id===p));$$('nav button').forEach(x=>x.classList.toggle('active',x.dataset.page===p));$('#title').textContent=p==='dashboard'?'Dashboard Global':p==='raw'?'Bahan Baku':p==='batch'?'Produksi Batch':p==='finished'?'Barang Jadi':p==='debts'?'Hutang Perusahaan':p==='reports'?'Laba & Laporan':p[0].toUpperCase()+p.slice(1);$('#modal').classList.remove('show')}
$$('nav button').forEach(x=>x.onclick=()=>go(x.dataset.page));
$('#quick').onclick=()=>{if(requireAdmin())$('#modal').classList.add('show')};
$$('#modal [data-go]').forEach(x=>x.onclick=()=>go(x.dataset.go));

/* ---- Raw material form ---- */
function rawPreview(){let f=$('#rawForm'),q=+f.qty.value||0,p=+f.price.value||0,t=+f.transport.value||0,o=+f.other.value||0;$('#rawTotal').textContent=rp(q*p+t+o)}
['qty','price','transport','other'].forEach(n=>document.querySelector(`#rawForm [name="${n}"]`).addEventListener('input',rawPreview));rawPreview();
$('#rawForm').onsubmit=async e=>{
  e.preventDefault();if(!requireAdmin())return;
  let x=Object.fromEntries(new FormData(e.target)),q=+x.qty;
  if(q<=0)return alert('Qty bahan baku harus lebih dari 0.');
  const payload={date:x.date,name:x.name,qty:q,original_qty:q,price:+x.price||0,transport:+x.transport||0,other:+x.other||0,supplier:x.supplier||null};
  const {data,error}=await sb.from('raw_materials').insert(payload).select().single();
  if(error)return alert('Gagal simpan: '+error.message);
  S.raw.push(mapRaw(data));render();e.target.reset();e.target.date.value=today;rawPreview();
  alert('Bahan baku berhasil dicatat.');
};

/* ---- Auto-isi nama produk sesuai bahan baku (Kelapa→Kopra, Batok Kelapa→Arang), supaya nama lini produksi konsisten untuk statistik ---- */
function suggestProductName(rawName){
  let n=(rawName||'').toLowerCase();
  if(n.includes('batok')||n.includes('tempurung'))return 'Arang';
  if(n.includes('kelapa'))return 'Kopra';
  return '';
}
document.getElementById('rawSelect').addEventListener('change',()=>{
  let r=S.raw.find(z=>z.id==document.getElementById('rawSelect').value),f=document.querySelector('#batchForm [name="productName"]');
  if(r&&f&&!f.value.trim())f.value=suggestProductName(r.name);
});

/* ---- Batch production form ---- */
$('#batchForm').onsubmit=async e=>{
  e.preventDefault();if(!requireAdmin())return;
  let x=Object.fromEntries(new FormData(e.target)),r=S.raw.find(z=>z.id==x.rawId);
  if(!r||+x.inputQty>r.qty)return alert('Stok bahan baku tidak mencukupi.');
  if(+x.outputQty<=0)return alert('Hasil produksi harus lebih dari 0.');
  let material=+x.inputQty*landed(r),total=material+(+x.labor||0)+(+x.energy||0)+(+x.other||0),loss=+x.inputQty-+x.outputQty,n=S.batches.length+1;
  const payload={code:`BCH-${x.date.slice(0,4)}-${String(n).padStart(3,'0')}`,date:x.date,raw_id:r.id,raw_name:r.name,product_name:x.productName||r.name,input:+x.inputQty,output:+x.outputQty,loss,loss_pct:loss/+x.inputQty*100,total_hpp:total,hpp_kg:total/+x.outputQty,labor:+x.labor||0,energy:+x.energy||0,other:+x.other||0,note:x.note||null};
  const {data,error}=await sb.from('batches').insert(payload).select().single();
  if(error)return alert('Gagal simpan batch: '+error.message);
  const newQty=r.qty-+x.inputQty;
  const {error:e2}=await sb.from('raw_materials').update({qty:newQty}).eq('id',r.id);
  if(e2)return alert('Batch tersimpan, tapi gagal update stok bahan: '+e2.message);
  r.qty=newQty;S.batches.push(mapBatch(data));render();e.target.reset();e.target.date.value=today;
  alert('Batch produksi berhasil dibuat.');
};

/* ---- Sales form ---- */
$('#salesForm').onsubmit=async e=>{
  e.preventDefault();if(!requireAdmin())return;
  let x=Object.fromEntries(new FormData(e.target)),b=B(x.batchId);
  if(!b||+x.qty>b.output-sold(b.id))return alert('Stok batch tidak mencukupi.');

  let status = x.status || 'Lunas';
  if (status !== 'Lunas' && status !== 'Piutang') {
    status = 'Lunas';
  }

  const now = new Date();
  const year = now.getFullYear();
  const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  const invoice_no = `INV-${year}-${random}`;

  const payload={
    invoice_no: invoice_no,
    date:x.date,
    batch_id:b.id,
    customer_name:x.customer || 'Umum',
    qty:+x.qty,
    price:+x.price,
    total:+x.qty*+x.price,
    status: status
  };

  const {data,error}=await sb.from('sales').insert(payload).select().single();
  if(error)return alert('Gagal simpan penjualan: '+error.message);
  S.sales.push(mapSale(data));render();e.target.reset();e.target.date.value=today;
  alert('Penjualan berhasil dicatat.');
};

/* ---- Expenses form ---- */
$('#expenseForm').onsubmit=async e=>{
  e.preventDefault();if(!requireAdmin())return;
  let x=Object.fromEntries(new FormData(e.target));
  const payload={date:x.date,cat:x.cat,desc:x.desc,amount:+x.amount};
  const {data,error}=await sb.from('expenses').insert(payload).select().single();
  if(error)return alert('Gagal simpan pengeluaran: '+error.message);
  S.expenses.push(mapExpense(data));render();e.target.reset();e.target.date.value=today;
  alert('Pengeluaran berhasil dicatat.');
};

/* ---- Debts form ---- */
$('#debtForm').onsubmit=async e=>{
  e.preventDefault();if(!requireAdmin())return;
  let x=Object.fromEntries(new FormData(e.target));
  if(+x.amount<=0)return alert('Jumlah hutang harus lebih dari 0.');
  const payload={date:x.date,creditor:x.creditor,desc:x.desc||null,amount:+x.amount,due_date:x.dueDate||null,paid_amount:0};
  const {data,error}=await sb.from('debts').insert(payload).select().single();
  if(error)return alert('Gagal simpan hutang: '+error.message);
  S.debts.push(mapDebt(data));render();e.target.reset();e.target.date.value=today;
  alert('Hutang berhasil dicatat.');
};
async function payDebt(id){
  if(!requireAdmin())return;
  const d=S.debts.find(x=>x.id===id);
  if(!d)return alert('Data tidak ditemukan!');
  const sisa=debtRemaining(d);
  const input=prompt(`Bayar hutang ke ${d.creditor}\nSisa: ${rp(sisa)}\n\nMasukkan jumlah pembayaran (Rp):`,sisa);
  if(input===null)return;
  const jumlah=+input;
  if(!jumlah||jumlah<=0)return alert('Jumlah pembayaran tidak valid.');
  if(jumlah>sisa)return alert('Jumlah pembayaran melebihi sisa hutang.');
  const newPaid=d.paidAmount+jumlah;
  const {error}=await sb.from('debts').update({paid_amount:newPaid}).eq('id',id);
  if(error)return alert('Gagal simpan pembayaran: '+error.message);
  d.paidAmount=newPaid;render();
  alert('✅ Pembayaran berhasil dicatat.'+(newPaid>=d.amount?' Hutang lunas!':''));
}
async function deleteDebt(id){
  if(!requireAdmin())return;
  const d=S.debts.find(x=>x.id===id);
  if(!d)return alert('Data tidak ditemukan!');
  if(!confirm(`Hapus hutang?\n\nKreditur: ${d.creditor}\nJumlah: ${rp(d.amount)}\nTerbayar: ${rp(d.paidAmount)}\n\nData akan dihapus permanen!`))return;
  const {error}=await sb.from('debts').delete().eq('id',id);
  if(error)return alert('Gagal hapus: '+error.message);
  S.debts=S.debts.filter(x=>x.id!==id);render();
  alert('✅ Hutang berhasil dihapus!');
}

/* ---- Backup / Reset ---- */
$('#backup').onclick=()=>{let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(S,null,2)],{type:'application/json'}));a.download='inzaki-group-backup.json';a.click()};
$('#reset').onclick=async()=>{
  if(!requireAdmin())return;
  if(!confirm('Hapus SEMUA data dari server untuk semua orang? Tindakan ini tidak bisa dibatalkan.'))return;
  const {error:e1}=await sb.from('sales').delete().gte('id',0);
  const {error:e2}=await sb.from('batches').delete().gte('id',0);
  const {error:e3}=await sb.from('raw_materials').delete().gte('id',0);
  const {error:e4}=await sb.from('expenses').delete().gte('id',0);
  if(e1||e2||e3||e4){alert('Gagal menghapus sebagian data: '+(e1||e2||e3||e4).message);}
  await loadAll();render();
};
document.addEventListener('change',e=>{if(e.target&&e.target.id==='chartYear')drawCharts()});

/* ---- Simulasi rendemen: "kalau rendemen naik X%, berapa tambahan laba?" ---- */
function fillBiSimBatch(){
  let el=$('#biSimBatch');if(!el)return;
  let cur=el.value;
  el.innerHTML=S.batches.length?S.batches.slice().reverse().map(b=>`<option value="${b.id}">${esc(b.code)} — ${esc(b.productName)} (rendemen ${yieldPct(b).toFixed(1)}%)</option>`).join(''):'<option value="">Belum ada batch</option>';
  if(cur&&S.batches.some(b=>b.id==cur))el.value=cur;
  updateBiSim();
}
function updateBiSim(){
  let sel=$('#biSimBatch'),rangeEl=$('#biSimDelta'),priceEl=$('#biSimPrice'),out=$('#biSimResult');
  if(!sel||!rangeEl||!priceEl||!out)return;
  let b=B(sel.value);
  if(!b){out.innerHTML='<div class="stock-empty">Belum ada batch untuk disimulasikan.</div>';return}
  let delta=+rangeEl.value||0;
  if($('#biSimDeltaVal'))$('#biSimDeltaVal').textContent=(delta>=0?'+':'')+delta+'%';
  let curYield=yieldPct(b),newYield=Math.max(0,curYield+delta),newOutput=b.input*newYield/100;
  let newHpp=newOutput?b.totalHpp/newOutput:0;
  let ss=S.sales.filter(x=>x.batchId==b.id),sq=ss.reduce((a,x)=>a+x.qty,0),som=ss.reduce((a,x)=>a+x.total,0);
  let defaultPrice=sq?som/sq:b.hppkg*(1+getBiMargin()/100);
  if(priceEl.dataset.batch!==String(b.id)){priceEl.value=Math.round(defaultPrice);priceEl.dataset.batch=String(b.id)}
  let price=+priceEl.value||0;
  let curProfitTotal=(price-b.hppkg)*b.output,newProfitTotal=(price-newHpp)*newOutput,extra=newProfitTotal-curProfitTotal;
  out.innerHTML=`<div class="bi-sim-grid">
    <div><span>Rendemen Sekarang</span><b>${curYield.toFixed(1)}%</b></div>
    <div><span>Rendemen Simulasi</span><b>${newYield.toFixed(1)}%</b></div>
    <div><span>HPP/kg Sekarang</span><b>${rp(b.hppkg)}</b></div>
    <div><span>HPP/kg Simulasi</span><b>${rp(newHpp)}</b></div>
    <div><span>Hasil Produksi Sekarang</span><b>${kg(b.output)}</b></div>
    <div><span>Hasil Produksi Simulasi</span><b>${kg(newOutput)}</b></div>
    <div class="span-full"><span>Tambahan Laba (di harga jual ${rp(price)}/kg, bahan masuk ${kg(b.input)} sama)</span><b class="${extra<0?'neg':'pos'}">${extra<0?'-':'+'}${rp(Math.abs(extra))}</b></div>
  </div>`;
}
document.addEventListener('change',e=>{if(e.target&&e.target.id==='biMarginTarget')render()});
document.addEventListener('change',e=>{if(e.target&&e.target.id==='biSimBatch'){$('#biSimPrice').dataset.batch='';updateBiSim()}});
document.addEventListener('input',e=>{if(e.target&&(e.target.id==='biSimDelta'||e.target.id==='biSimPrice'))updateBiSim()});

/* ---- Login / Logout ---- */
$('#loginBtn').onclick=()=>{$('#loginError').textContent='';$('#loginModal').classList.add('show')};
$('#financeLoginBtn').onclick=()=>{$('#loginError').textContent='';$('#loginModal').classList.add('show')};
$('#loginCancel').onclick=()=>$('#loginModal').classList.remove('show');
$('#loginForm').onsubmit=async e=>{
  e.preventDefault();
  if(!sb){$('#loginError').textContent='Supabase belum dikonfigurasi.';return}
  let x=Object.fromEntries(new FormData(e.target));
  $('#loginError').textContent='Masuk...';
  const {error}=await sb.auth.signInWithPassword({email:x.email,password:x.password});
  if(error){$('#loginError').textContent='Login gagal: '+error.message;return}
  $('#loginError').textContent='';$('#loginModal').classList.remove('show');e.target.reset();
};
$('#logoutBtn').onclick=async()=>{if(sb)await sb.auth.signOut();go('dashboard')};

/* ================= INZAKI GROUP V10 UPGRADE ================= */
(function(){
  const v10Nav = `
  <button data-page="v10ops"><span class="nav-ic">📊</span><span class="nav-lb">Overview V10</span></button>
  <button data-page="v10inventory"><span class="nav-ic">📦</span><span class="nav-lb">Inventory</span></button>
  <button data-page="v10analytics"><span class="nav-ic">◔</span><span class="nav-lb">Analitik</span></button>
  <button data-page="v10alerts"><span class="nav-ic">🔔</span><span class="nav-lb">Notifikasi</span></button>`;

  const v10Sections = `
<section id="v10ops" class="page">
  <div class="v10-hero">
    <div><span class="eyebrow">INZAKI GROUP · V10 CONTROL CENTER</span><h2>Operasional bisnis dalam satu layar</h2><p>Monitor bahan baku → produksi → stok → penjualan → cash flow secara cepat.</p></div>
    <div class="v10-hero-actions"><button class="primary" data-v10-go="batch">+ Produksi</button><button class="ghost" data-v10-go="sales">+ Penjualan</button></div>
  </div>
  <div id="v10Kpis" class="v10-kpis"></div>
  <div class="v10-grid-main">
    <div class="panel"><div class="panel-head"><div><h2>Performa Produksi & Rendemen</h2><small>6 periode terakhir</small></div></div><canvas id="v10ProductionChart"></canvas></div>
    <div class="panel"><div class="panel-head"><div><h2>Smart Insight</h2><small>Prioritas yang perlu diperhatikan</small></div></div><div id="v10Insights"></div></div>
  </div>
  <div class="v10-grid-3">
    <div class="panel"><div class="panel-head"><div><h2>Quick Action</h2><small>Akses input utama</small></div></div><div class="quick-grid"><button data-v10-go="raw">＋ Bahan Baku</button><button data-v10-go="batch">🏭 Produksi</button><button data-v10-go="sales">💰 Penjualan</button><button data-v10-go="expenses">💸 Pengeluaran</button><button data-v10-go="debts">🏦 Hutang</button><button data-v10-go="reports">📑 Laporan</button></div></div>
    <div class="panel"><div class="panel-head"><div><h2>Stok Kritis</h2><small>Perlu perhatian</small></div></div><div id="v10CriticalStock"></div></div>
    <div class="panel"><div class="panel-head"><div><h2>Transaksi Terbaru</h2><small>Penjualan terakhir</small></div></div><div id="v10RecentSales"></div></div>
  </div>
</section>

<section id="v10inventory" class="page">
  <div class="page-intro"><div><span class="eyebrow">INVENTORY CONTROL</span><h2>Persediaan</h2><p>Nilai stok, mutasi sederhana, dan peringatan stok minimum.</p></div><button class="primary" data-v10-go="raw">+ Tambah Bahan</button></div>
  <div id="v10InvKpis" class="v10-kpis"></div>
  <div class="panel"><div class="panel-head"><div><h2>Ringkasan Persediaan</h2><small>Bahan baku dan barang jadi</small></div><input id="v10InvSearch" class="v10-search" placeholder="Cari bahan / produk…"></div><div id="v10InventoryTable"></div></div>
</section>

<section id="v10analytics" class="page">
  <div class="page-intro"><div><span class="eyebrow">BUSINESS INTELLIGENCE</span><h2>Analitik V10</h2><p>Ukuran kinerja utama untuk membantu mengambil keputusan.</p></div><button class="ghost" id="v10ExportCsv">Export CSV</button></div>
  <div id="v10AnalyticsCards" class="v10-kpis"></div>
  <div class="v10-grid-main"><div class="panel"><div class="panel-head"><div><h2>HPP vs Harga Jual</h2><small>Per lini produksi</small></div></div><div id="v10LineAnalytics"></div></div><div class="panel"><div class="panel-head"><div><h2>Customer & Penjualan</h2><small>Ringkasan pelanggan</small></div></div><div id="v10CustomerAnalytics"></div></div></div>
  <div class="panel"><div class="panel-head"><div><h2>Arus Kas Sederhana</h2><small>Penjualan lunas vs pengeluaran</small></div></div><div id="v10CashFlow"></div></div>
</section>

<section id="v10alerts" class="page">
  <div class="page-intro"><div><span class="eyebrow">NOTIFICATION CENTER</span><h2>Notifikasi & Peringatan</h2><p>Semua hal yang membutuhkan perhatian Owner/Admin.</p></div><button class="ghost" id="v10RefreshAlerts">Refresh</button></div>
  <div id="v10AlertSummary" class="v10-alert-summary"></div><div id="v10AlertList" class="v10-alert-list"></div>
</section>`;

  function injectUI(){
    const nav=document.querySelector('aside nav');
    if(nav && !document.querySelector('[data-page="v10ops"]')) nav.insertAdjacentHTML('beforeend',v10Nav);
    const main=document.querySelector('main');
    if(main && !document.getElementById('v10ops')) main.insertAdjacentHTML('beforeend',v10Sections);
  }

  function safe(n){return +n||0}
  function soldV10(id){return S.sales.filter(x=>x.batchId==id).reduce((a,x)=>a+safe(x.qty),0)}
  function money(n){return rp(n)}
  function pct(n){return safe(n).toFixed(1)+'%'}
  function sum(a,f){return a.reduce((x,y)=>x+safe(f(y)),0)}
  function escV(x){return esc(x)}
  function daysAgo(n){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-n);return d}
  function dateObj(s){return s?new Date(s+'T00:00:00'):new Date(0)}
  function within30(s){return dateObj(s)>=daysAgo(29)}

  function buildAlerts(){
    const alerts=[];
    const rawBy={};
    S.raw.forEach(r=>{const k=(r.name||'').trim().toLowerCase();if(!rawBy[k])rawBy[k]={name:r.name,qty:0};rawBy[k].qty+=safe(r.qty)});
    Object.values(rawBy).forEach(r=>{if(r.qty<=25)alerts.push({type:'danger',title:'Stok bahan baku rendah',body:`${r.name} tersisa ${kg(r.qty)}.`,go:'raw'})});
    const finBy={};
    S.batches.forEach(b=>{const q=Math.max(0,safe(b.output)-soldV10(b.id));const k=(b.productName||'').trim().toLowerCase();if(!finBy[k])finBy[k]={name:b.productName,qty:0};finBy[k].qty+=q});
    Object.values(finBy).forEach(r=>{if(r.qty<=20)alerts.push({type:'warn',title:'Stok produk jadi rendah',body:`${r.name} tersisa ${kg(r.qty)}.`,go:'finished'})});
    S.batches.slice().reverse().forEach(b=>{const y=b.input?safe(b.output)/safe(b.input)*100:0;if(y<27)alerts.push({type:'warn',title:'Rendemen di bawah target',body:`${b.code} hanya ${pct(y)} (target 27%).`,go:'batch'})});
    S.debts.forEach(d=>{const r=debtRemaining(d);if(r>0&&d.dueDate&&dateObj(d.dueDate)<=daysAgo(-3))alerts.push({type:'danger',title:'Hutang mendekati jatuh tempo',body:`${d.creditor} · sisa ${money(r)} · ${fmtDate(d.dueDate)}`,go:'debts'})});
    S.batches.forEach(b=>{const ss=S.sales.filter(x=>x.batchId==b.id),q=sum(ss,x=>x.qty),rev=sum(ss,x=>x.total),margin=rev-q*safe(b.hppkg);if(q>0&&margin<0)alerts.push({type:'danger',title:'Margin negatif',body:`${b.code}: ${money(margin)} dari penjualan yang sudah terjadi.`,go:'reports'})});
    return alerts.slice(0,30)
  }

  async function quickInsert(table,payload,mapFn){
    if(!requireAdmin())return null;
    const {data,error}=await sb.from(table).insert(payload).select().single();
    if(error){alert('Gagal menyimpan: '+error.message);return null;}
    return mapFn(data);
  }

  function renderCommandCenter(){
    const dateEl=$('#commandDate');if(dateEl)dateEl.textContent=new Date().toLocaleString('id-ID',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
    const out=sum(S.batches,x=>x.output),inp=sum(S.batches,x=>x.input),soldQty=sum(S.sales,x=>x.qty),revenue=sum(S.sales,x=>x.total),cogs=sum(S.sales,x=>{const b=B(x.batchId);return b?safe(x.qty)*safe(b.hppkg):0}),expenses=sum(S.expenses,x=>x.amount),receivable=sum(S.sales.filter(x=>(x.status||'Lunas')!=='Lunas'),x=>x.total),debt=sum(S.debts,x=>debtRemaining(x)),cash=revenue-receivable-expenses,profit=revenue-cogs-expenses,finished=Math.max(0,out-soldQty),yield=inp?out/inp*100:0;
    const k=[['Omzet',money(revenue),'Semua penjualan'],['Laba Bersih',money(profit),profit>=0?'Positif':'Negatif'],['Kas Masuk Bersih',money(cash),'Omzet lunas − pengeluaran'],['Piutang',money(receivable),'Belum lunas'],['Stok Jadi',kg(finished),'Estimasi stok tersedia'],['Rendemen',pct(yield),yield>=27?'Target tercapai':'Di bawah target'],['Hutang',money(debt),'Sisa kewajiban'],['Produksi',kg(out),'Output seluruh batch']];
    $('#commandKpis').innerHTML=k.map(x=>`<div class="command-kpi"><span>${x[0]}</span><b>${x[1]}</b><small>${x[2]}</small></div>`).join('');
    /* V10.3 FULL STATISTICS — semua statistik penting dipadatkan ke dashboard utama */
    const paidSales=S.sales.filter(x=>(x.status||'Lunas')==='Lunas'), unpaidSales=S.sales.filter(x=>(x.status||'Lunas')!=='Lunas');
    const tx=S.sales.length, paidCount=paidSales.length, unpaidCount=unpaidSales.length, avgTicket=tx?revenue/tx:0, avgSellKg=soldQty?safe(revenue/soldQty):0;
    const rawValue=sum(S.raw,x=>safe(x.qty)*landed(x)), finishedValue=sum(S.batches,x=>Math.max(0,safe(x.output)-soldV10(x.id))*safe(x.hppkg));
    const hppProduced=sum(S.batches,x=>safe(x.totalHpp)), avgHppKg=out?hppProduced/out:0, totalLoss=Math.max(0,inp-out), lossPct=inp?totalLoss/inp*100:0;
    const debtPaid=sum(S.debts,x=>safe(x.paidAmount)), debtTotal=sum(S.debts,x=>safe(x.amount)), debtCount=S.debts.length, debtOverdue=S.debts.filter(x=>debtRemaining(x)>0&&x.dueDate&&new Date(x.dueDate)<new Date()).length;
    const expenseCount=S.expenses.length, avgExpense=expenseCount?expenses/expenseCount:0, margin=revenue?(profit/revenue*100):0, cashLunas=sum(paidSales,x=>x.total)-expenses;
    const statCards=[
      ['Total Transaksi',tx,'Penjualan tercatat'],['Transaksi Lunas',paidCount,'Sudah dibayar'],['Transaksi Piutang',unpaidCount,'Belum lunas'],['Rata-rata Transaksi',money(avgTicket),'Nilai per transaksi'],
      ['Volume Terjual',kg(soldQty),'Total kg terjual'],['Harga Jual Rata²',money(avgSellKg)+'/kg','Rata-rata harga aktual'],['Omzet Lunas',money(sum(paidSales,x=>x.total)),'Kas dari penjualan lunas'],['Piutang Aktif',money(receivable),'Tagihan pelanggan'],
      ['Total Batch',S.batches.length,'Produksi tercatat'],['Bahan Masuk',kg(inp),'Total input produksi'],['Output Jadi',kg(out),'Total hasil produksi'],['Total Susut',kg(totalLoss),'Bahan hilang/penyusutan'],
      ['Rendemen',pct(yield),'Output ÷ input'],['HPP Produksi',money(hppProduced),'Total biaya batch'],['HPP Rata²',money(avgHppKg)+'/kg','HPP output rata-rata'],['Stok Jadi',kg(finished),'Estimasi belum terjual'],
      ['Nilai Stok Jadi',money(finishedValue),'Nilai HPP stok'],['Stok Bahan',kg(rawQty),'Bahan baku tersisa'],['Nilai Bahan',money(rawValue),'Nilai stok bahan'],['Jenis Bahan',new Set(S.raw.map(x=>(x.name||'').trim().toLowerCase()).filter(Boolean)).size,'Jenis bahan tercatat'],
      ['Pengeluaran',money(expenses),'Total biaya umum'],['Jumlah Pengeluaran',expenseCount,'Transaksi biaya'],['Rata² Pengeluaran',money(avgExpense),'Per transaksi'],['Laba Bersih',money(profit),`Margin ${margin.toFixed(1)}%`],
      ['Kas Operasional',money(cashLunas),'Penjualan lunas − biaya'],['Total Hutang',money(debtTotal),'Nilai kewajiban'],['Hutang Tersisa',money(debt),'Belum dibayar'],['Hutang Terbayar',money(debtPaid),'Akumulasi pembayaran'],
      ['Kreditur Aktif',S.debts.filter(x=>debtRemaining(x)>0).length,'Hutang masih berjalan'],['Jatuh Tempo Lewat',debtOverdue,'Hutang overdue'],['Margin Bersih',margin.toFixed(1)+'%','Laba bersih ÷ omzet'],['Rasio Piutang',revenue?(receivable/revenue*100).toFixed(1)+'%':'0%','Piutang ÷ omzet']
    ];
    const cardCls=(name)=>name==='Laba Bersih'?(profit<0?'bad':'good'):['Piutang Aktif','Hutang Tersisa','Jatuh Tempo Lewat'].includes(name)?'warn':'';
    if($('#fullStatsGrid'))$('#fullStatsGrid').innerHTML=statCards.map(x=>`<div class="full-stat-card ${cardCls(x[0])}"><span>${x[0]}</span><b>${x[1]}</b><small>${x[2]}</small></div>`).join('');
    if($('#fullSalesStats'))$('#fullSalesStats').innerHTML=`<table><tbody><tr><td>Total transaksi</td><td>${tx}</td></tr><tr><td>Transaksi lunas</td><td>${paidCount}</td></tr><tr><td>Transaksi piutang</td><td>${unpaidCount}</td></tr><tr><td>Omzet total</td><td>${money(revenue)}</td></tr><tr><td>Omzet sudah lunas</td><td>${money(sum(paidSales,x=>x.total))}</td></tr><tr><td>Piutang aktif</td><td>${money(receivable)}</td></tr><tr><td>Volume terjual</td><td>${kg(soldQty)}</td></tr><tr><td>Harga jual rata-rata</td><td>${money(avgSellKg)}/kg</td></tr><tr><td>Nilai transaksi rata-rata</td><td>${money(avgTicket)}</td></tr></tbody></table>`;
    if($('#fullFinanceStats'))$('#fullFinanceStats').innerHTML=`<table><tbody><tr><td>Omzet</td><td>${money(revenue)}</td></tr><tr><td>HPP terjual</td><td>${money(cogs)}</td></tr><tr><td>Laba kotor</td><td>${money(revenue-cogs)}</td></tr><tr><td>Pengeluaran umum</td><td>${money(expenses)}</td></tr><tr><td>Laba bersih</td><td>${money(profit)}</td></tr><tr><td>Margin bersih</td><td>${margin.toFixed(1)}%</td></tr><tr><td>Kas operasional sederhana</td><td>${money(cashLunas)}</td></tr><tr><td>Hutang tersisa</td><td>${money(debt)}</td></tr><tr><td>Piutang aktif</td><td>${money(receivable)}</td></tr></tbody></table>`;
    if($('#fullProductionStats'))$('#fullProductionStats').innerHTML=`<table><tbody><tr><td>Total batch</td><td>${S.batches.length}</td></tr><tr><td>Hari produksi</td><td>${new Set(S.batches.map(b=>b.date).filter(Boolean)).size}</td></tr><tr><td>Bahan masuk</td><td>${kg(inp)}</td></tr><tr><td>Output jadi</td><td>${kg(out)}</td></tr><tr><td>Total susut</td><td>${kg(totalLoss)}</td></tr><tr><td>Persentase susut</td><td>${lossPct.toFixed(1)}%</td></tr><tr><td>Rendemen</td><td>${yield.toFixed(1)}%</td></tr><tr><td>Total HPP produksi</td><td>${money(hppProduced)}</td></tr><tr><td>HPP rata-rata output</td><td>${money(avgHppKg)}/kg</td></tr></tbody></table>`;
    if($('#fullStockStats'))$('#fullStockStats').innerHTML=`<table><tbody><tr><td>Stok bahan baku</td><td>${kg(rawQty)}</td></tr><tr><td>Nilai bahan baku</td><td>${money(rawValue)}</td></tr><tr><td>Jenis bahan</td><td>${new Set(S.raw.map(x=>(x.name||'').trim().toLowerCase()).filter(Boolean)).size}</td></tr><tr><td>Stok barang jadi</td><td>${kg(finished)}</td></tr><tr><td>Nilai stok jadi</td><td>${money(finishedValue)}</td></tr><tr><td>Jenis produk</td><td>${new Set(S.batches.map(x=>(x.productName||'').trim().toLowerCase()).filter(Boolean)).size}</td></tr></tbody></table>`;
    const paid=S.sales.filter(x=>(x.status||'Lunas')==='Lunas');
    $('#receivableTotal').textContent=money(receivable);
    $('#dashboardReceivables').innerHTML=S.sales.filter(x=>(x.status||'Lunas')!=='Lunas').slice().reverse().map(x=>{const b=B(x.batchId);return `<div class="receivable-row"><div><b>${esc(x.customer||'Umum')}</b><small>${x.invoice_no||'Tanpa invoice'} · ${fmtDate(x.date)} · ${kg(x.qty)} · ${money(x.total)}</small></div><div class="receivable-actions"><button class="btn-lunas" onclick="markSalePaid('${x.id}')">✓ Lunas</button><button class="btn-delete-mini" onclick="deleteSale('${x.id}')">Hapus</button></div></div>`}).join('')||'<div class="empty-command">Tidak ada piutang. Semua penjualan sudah lunas.</div>';
    $('#dashboardProductionControl').innerHTML=S.batches.slice().reverse().slice(0,6).map(b=>`<div class="control-row"><div><b>${esc(b.code)}</b><small>${esc(b.productName)} · ${fmtDate(b.date)}</small></div><div class="metric">${kg(b.output)}</div><div class="metric">Susut ${safe(b.lossPct).toFixed(1)}%</div><div class="metric">Rend. ${safe(b.input)?(safe(b.output)/safe(b.input)*100).toFixed(1):'0.0'}%</div></div>`).join('')||'<div class="empty-command">Belum ada batch produksi.</div>';
    const alerts=buildAlerts();
    $('#dashboardAlerts').innerHTML=alerts.slice(0,7).map(a=>`<div class="alert-compact ${a.type}"><div><b>${escV(a.title)}</b><small>${escV(a.body)}</small></div></div>`).join('')||'<div class="empty-command">Tidak ada peringatan aktif.</div>';
    const qr=$('#quickSalesBatch');if(qr)qr.innerHTML=S.batches.filter(b=>safe(b.output)-soldV10(b.id)>0).map(b=>`<option value="${b.id}">${esc(b.code)} · ${esc(b.productName)} · sisa ${kg(safe(b.output)-soldV10(b.id))}</option>`).join('');
    const rr=$('#quickBatchRaw');if(rr)rr.innerHTML=S.raw.filter(r=>safe(r.qty)>0).map(r=>`<option value="${r.id}">${esc(r.name)} · ${kg(r.qty)}</option>`).join('');
  }

  function bindQuickForms(){
    if(window.__quickFormsBound)return;window.__quickFormsBound=true;
    ['quickSalesForm','quickRawForm','quickExpenseForm','quickDebtForm','quickBatchForm'].forEach(id=>{const f=$('#'+id);if(f)f.querySelector('[name="date"]').value=today;});
    $('#quickSalesForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!requireAdmin())return;const x=Object.fromEntries(new FormData(e.currentTarget)),b=B(x.batchId);if(!b||+x.qty>safe(b.output)-soldV10(b.id))return alert('Stok batch tidak mencukupi.');const payload={invoice_no:`INV-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`,date:x.date,batch_id:b.id,customer_name:x.customer||'Umum',qty:+x.qty,price:+x.price,total:+x.qty*+x.price,status:x.status};const d=await quickInsert('sales',payload,mapSale);if(d){S.sales.push(d);e.currentTarget.reset();e.currentTarget.date.value=today;render();alert('✅ Penjualan tersimpan.');}});
    $('#quickRawForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!requireAdmin())return;const x=Object.fromEntries(new FormData(e.currentTarget)),q=+x.qty;const d=await quickInsert('raw_materials',{date:x.date,name:x.name,qty:q,original_qty:q,price:+x.price||0,transport:+x.transport||0,other:0,supplier:x.supplier||null},mapRaw);if(d){S.raw.push(d);e.currentTarget.reset();e.currentTarget.date.value=today;render();alert('✅ Bahan baku tersimpan.');}});
    $('#quickExpenseForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!requireAdmin())return;const x=Object.fromEntries(new FormData(e.currentTarget)),d=await quickInsert('expenses',{date:x.date,cat:x.cat,desc:x.desc,amount:+x.amount},mapExpense);if(d){S.expenses.push(d);e.currentTarget.reset();e.currentTarget.date.value=today;render();alert('✅ Pengeluaran tersimpan.');}});
    $('#quickDebtForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!requireAdmin())return;const x=Object.fromEntries(new FormData(e.currentTarget)),d=await quickInsert('debts',{date:x.date,creditor:x.creditor,desc:x.desc||null,amount:+x.amount,due_date:x.dueDate||null,paid_amount:0},mapDebt);if(d){S.debts.push(d);e.currentTarget.reset();e.currentTarget.date.value=today;render();alert('✅ Hutang tersimpan.');}});
    $('#quickBatchForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!requireAdmin())return;const x=Object.fromEntries(new FormData(e.currentTarget)),r=S.raw.find(z=>z.id==x.rawId);if(!r||+x.inputQty>safe(r.qty))return alert('Stok bahan baku tidak mencukupi.');if(+x.outputQty<=0)return alert('Hasil produksi harus lebih dari 0.');const material=+x.inputQty*landed(r),total=material+(+x.labor||0)+(+x.energy||0),loss=+x.inputQty-+x.outputQty,n=S.batches.length+1;const d=await quickInsert('batches',{code:`BCH-${x.date.slice(0,4)}-${String(n).padStart(3,'0')}`,date:x.date,raw_id:r.id,raw_name:r.name,product_name:x.productName,input:+x.inputQty,output:+x.outputQty,loss,loss_pct:loss/+x.inputQty*100,total_hpp:total,hpp_kg:total/+x.outputQty,labor:+x.labor||0,energy:+x.energy||0,other:0,note:null},mapBatch);if(d){const newQty=safe(r.qty)-+x.inputQty;const {error}=await sb.from('raw_materials').update({qty:newQty}).eq('id',r.id);if(error)return alert('Batch tersimpan, tetapi stok bahan gagal diperbarui: '+error.message);r.qty=newQty;S.batches.push(d);e.currentTarget.reset();e.currentTarget.date.value=today;render();alert('✅ Produksi batch tersimpan.');}});
  }

  function renderV10(){
    if(!document.getElementById('v10ops'))return;
    bindQuickForms();
    renderCommandCenter();
    const out=S.batches.reduce((a,b)=>a+safe(b.output),0), inp=S.batches.reduce((a,b)=>a+safe(b.input),0), soldQty=sum(S.sales,x=>x.qty), revenue=sum(S.sales,x=>x.total), cogs=sum(S.sales,x=>{const b=B(x.batchId);return b?safe(x.qty)*safe(b.hppkg):0}), expenses=sum(S.expenses,x=>x.amount), debt=sum(S.debts,x=>debtRemaining(x));
    const profit=revenue-cogs-expenses, finished=Math.max(0,out-soldQty), rawQty=sum(S.raw,x=>x.qty), yield=inp?out/inp*100:0;
    const kpis=[['Penjualan',money(revenue),'Omzet seluruh transaksi','good'],['Laba Bersih',money(profit),'Omzet − HPP terjual − pengeluaran',profit>=0?'good':'bad'],['Stok Produk',kg(finished),'Produk jadi yang belum terjual','info'],['Rendemen',pct(yield),'Output ÷ bahan masuk',yield>=27?'good':'warn'],['Hutang',money(debt),'Sisa kewajiban','warn'],['Bahan Baku',kg(rawQty),'Stok bahan tersisa','info']];
    $('#v10Kpis').innerHTML=kpis.map(k=>`<div class="v10-kpi ${k[3]}"><span>${k[0]}</span><b>${k[1]}</b><small>${k[2]}</small></div>`).join('');
    $('#v10InvKpis').innerHTML=[['Bahan Baku',kg(rawQty)],['Barang Jadi',kg(finished)],['Nilai Produk Jadi',money(S.batches.reduce((a,b)=>a+Math.max(0,b.output-soldV10(b.id))*b.hppkg,0))],['Total Jenis',new Set([...S.raw.map(x=>(x.name||'').toLowerCase()),...S.batches.map(x=>(x.productName||'').toLowerCase())]).size+' jenis']].map(k=>`<div class="v10-kpi info"><span>${k[0]}</span><b>${k[1]}</b></div>`).join('');
    const alerts=buildAlerts();
    $('#v10Insights').innerHTML=alerts.slice(0,5).map(a=>`<div class="v10-insight ${a.type}"><span>${a.type==='danger'?'!':'↗'}</span><div><b>${escV(a.title)}</b><p>${escV(a.body)}</p></div></div>`).join('')||'<div class="v10-empty">Tidak ada peringatan. Operasional terlihat aman.</div>';
    const critical=alerts.filter(a=>a.type==='danger').slice(0,5);
    $('#v10CriticalStock').innerHTML=critical.map(a=>`<button class="v10-alert-row ${a.type}" data-v10-go="${a.go}"><span>${a.title}</span><small>${a.body}</small></button>`).join('')||'<div class="v10-empty">Tidak ada stok/keuangan kritis.</div>';
    $('#v10RecentSales').innerHTML=S.sales.slice().sort((a,b)=>dateObj(b.date)-dateObj(a.date)).slice(0,5).map(x=>{const b=B(x.batchId);return `<div class="v10-list-row"><div><b>${escV(x.customer||'Umum')}</b><small>${fmtDate(x.date)} · ${b?escV(b.code):'-'}</small></div><strong>${money(x.total)}</strong></div>`}).join('')||'<div class="v10-empty">Belum ada transaksi.</div>';
    const invSearch=($('#v10InvSearch')?.value||'').toLowerCase();
    const rows=[];
    S.raw.forEach(r=>{if(invSearch&&!(`${r.name}`.toLowerCase().includes(invSearch)))return;rows.push({type:'Bahan Baku',name:r.name,qty:r.qty,value:r.qty*landed(r),status:r.qty<=25?'Kritis':'Aman',go:'raw'})});
    const productMap={};S.batches.forEach(b=>{const q=Math.max(0,b.output-soldV10(b.id));const k=(b.productName||'').trim().toLowerCase();if(!productMap[k])productMap[k]={name:b.productName,qty:0,value:0};productMap[k].qty+=q;productMap[k].value+=q*b.hppkg});
    Object.values(productMap).forEach(r=>{if(invSearch&&!r.name.toLowerCase().includes(invSearch))return;rows.push({type:'Barang Jadi',name:r.name,qty:r.qty,value:r.value,status:r.qty<=20?'Kritis':'Aman',go:'finished'})});
    $('#v10InventoryTable').innerHTML=`<div class="v10-table-wrap"><table><thead><tr><th>Jenis</th><th>Nama</th><th>Qty</th><th>Nilai</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.type}</td><td><b>${escV(r.name)}</b></td><td>${kg(r.qty)}</td><td>${money(r.value)}</td><td><span class="badge ${r.status==='Kritis'?'badge-overdue':'badge-ok'}">${r.status}</span></td><td><button class="ghost small" data-v10-go="${r.go}">Buka</button></td></tr>`).join('')||empty(6)}</tbody></table></div>`;
    const line={};S.batches.forEach(b=>{const k=`${b.rawName||'?'} → ${b.productName||'?'}`;if(!line[k])line[k]={name:k,input:0,output:0,hpp:0,sales:0,qty:0};line[k].input+=safe(b.input);line[k].output+=safe(b.output);line[k].hpp+=safe(b.totalHpp);const ss=S.sales.filter(x=>x.batchId==b.id);line[k].sales+=sum(ss,x=>x.total);line[k].qty+=sum(ss,x=>x.qty)});
    $('#v10LineAnalytics').innerHTML=Object.values(line).map(x=>{const h=x.output?x.hpp/x.output:0,p=x.qty?x.sales/x.qty:0,m=p-h;return `<div class="v10-line"><div><b>${escV(x.name)}</b><small>Rendemen ${pct(x.input?x.output/x.input*100:0)}</small></div><div><span>HPP/kg</span><b>${money(h)}</b></div><div><span>Harga jual/kg</span><b>${money(p)}</b></div><div><span>Margin/kg</span><b class="${m<0?'neg':'pos'}">${money(m)}</b></div></div>`}).join('')||'<div class="v10-empty">Belum ada batch produksi.</div>';
    const cust={};S.sales.forEach(x=>{const k=x.customer||'Umum';if(!cust[k])cust[k]={name:k,qty:0,total:0,count:0};cust[k].qty+=safe(x.qty);cust[k].total+=safe(x.total);cust[k].count++});
    $('#v10CustomerAnalytics').innerHTML=Object.values(cust).sort((a,b)=>b.total-a.total).slice(0,8).map(c=>`<div class="v10-list-row"><div><b>${escV(c.name)}</b><small>${c.count} transaksi · ${kg(c.qty)}</small></div><strong>${money(c.total)}</strong></div>`).join('')||'<div class="v10-empty">Belum ada pelanggan.</div>';
    const paidRevenue=sum(S.sales.filter(x=>x.status==='Lunas'),x=>x.total), receivable=sum(S.sales.filter(x=>x.status!=='Lunas'),x=>x.total);
    $('#v10AnalyticsCards').innerHTML=[['Omzet Lunas',money(paidRevenue)],['Piutang Penjualan',money(receivable)],['HPP Terjual',money(cogs)],['Pengeluaran',money(expenses)],['Laba Bersih',money(profit)],['Margin Bersih',revenue?(profit/revenue*100).toFixed(1)+'%':'0%']].map(k=>`<div class="v10-kpi ${k[0].includes('Laba')&&profit<0?'bad':'info'}"><span>${k[0]}</span><b>${k[1]}</b></div>`).join('');
    $('#v10CashFlow').innerHTML=`<div class="cashflow"><div><span>Uang masuk dari penjualan lunas</span><b class="pos">${money(paidRevenue)}</b></div><div><span>Uang keluar pengeluaran umum</span><b class="neg">${money(expenses)}</b></div><div><span>Arus kas operasional sederhana</span><b class="${paidRevenue-expenses<0?'neg':'pos'}">${money(paidRevenue-expenses)}</b></div></div>`;
    $('#v10AlertSummary').innerHTML=`<div><b>${alerts.length}</b><span>Total peringatan</span></div><div><b>${alerts.filter(x=>x.type==='danger').length}</b><span>Kritis</span></div><div><b>${alerts.filter(x=>x.type==='warn').length}</b><span>Perhatian</span></div>`;
    $('#v10AlertList').innerHTML=alerts.map(a=>`<div class="v10-alert-card ${a.type}"><div class="alert-icon">${a.type==='danger'?'!':'⚠'}</div><div><b>${escV(a.title)}</b><p>${escV(a.body)}</p><button class="ghost small" data-v10-go="${a.go}">Buka terkait</button></div></div>`).join('')||'<div class="panel v10-empty">Tidak ada notifikasi.</div>';
    drawV10ProductionChart();
  }

  function drawV10ProductionChart(){
    const c=document.getElementById('v10ProductionChart');if(!c||!window.Chart)return;
    if(window.__v10Chart)window.__v10Chart.destroy();
    const months=[];const now=new Date();for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);months.push({key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,label:d.toLocaleDateString('id-ID',{month:'short'})})}
    const prod=months.map(m=>S.batches.filter(b=>(b.date||'').slice(0,7)===m.key).reduce((a,b)=>a+b.output,0));
    const yld=months.map(m=>{const bs=S.batches.filter(b=>(b.date||'').slice(0,7)===m.key),i=bs.reduce((a,b)=>a+b.input,0),o=bs.reduce((a,b)=>a+b.output,0);return i?o/i*100:0});
    window.__v10Chart=new Chart(c,{type:'line',data:{labels:months.map(m=>m.label),datasets:[{label:'Produksi (kg)',data:prod,tension:.35,yAxisID:'y'},{label:'Rendemen (%)',data:yld,tension:.35,yAxisID:'y1'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#9aa79d'}}},scales:{x:{ticks:{color:'#829087'},grid:{color:'rgba(255,255,255,.05)'}},y:{ticks:{color:'#829087'},grid:{color:'rgba(255,255,255,.05)'}},y1:{position:'right',ticks:{color:'#829087'},grid:{drawOnChartArea:false}}}}});
  }

  function exportCSV(){
    const rows=[['Tanggal','Invoice','Pelanggan','Batch','Produk','Qty kg','Harga/kg','Total','Status']];
    S.sales.forEach(x=>{const b=B(x.batchId);rows.push([x.date,x.invoice_no||'',x.customer||'Umum',b?.code||'',b?.productName||'',x.qty,x.price,x.total,x.status||''])});
    const csv=rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='inzaki-penjualan-v10.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)
  }

  function patchNavigation(){
    const oldGo=go;
    window.go=function(p){oldGo(p);if(['v10ops','v10inventory','v10analytics','v10alerts'].includes(p)){$('#title').textContent={v10ops:'Overview V10',v10inventory:'Inventory Control',v10analytics:'Analitik V10',v10alerts:'Notifikasi & Peringatan'}[p];renderV10()}};
    document.querySelectorAll('[data-v10-go]').forEach(el=>el.addEventListener('click',()=>window.go(el.dataset.v10Go)));
    document.querySelectorAll('nav button[data-page]').forEach(el=>{if(!el.dataset.v10bound){el.dataset.v10bound='1';el.addEventListener('click',()=>{if(['v10ops','v10inventory','v10analytics','v10alerts'].includes(el.dataset.page)){window.go(el.dataset.page)}})}});
    $('#v10InvSearch')?.addEventListener('input',renderV10);$('#v10RefreshAlerts')?.addEventListener('click',renderV10);$('#v10ExportCsv')?.addEventListener('click',exportCSV);
  }

  function patchRender(){
    const base=render;
    window.render=function(){base();renderV10()};
  }

  injectUI();patchNavigation();patchRender();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',renderV10);else setTimeout(renderV10,0);
})();


/* ---- Init ---- */
(async function init(){
  try{
    if(!sb){
      setSync('offline');
      render();
      return;
    }

    await initAuth();
    await loadAll();
    render();
    subscribeRealtime();
  }catch(error){
    console.error('Dashboard init gagal:',error);
    setSync('offline');
    try{render()}catch(renderError){console.error('Render gagal:',renderError)}
  }finally{
    /* WAJIB: overlay harus ditutup walaupun Supabase gagal/timeout. */
    hideLoading();
  }
})();
