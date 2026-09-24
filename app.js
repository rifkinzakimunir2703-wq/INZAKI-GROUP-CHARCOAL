/* ================= INZAKI GROUP — Business Dashboard (Online/Supabase) ================= */
const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s),today=new Date().toISOString().slice(0,10);
$$('input[type=date]').forEach(x=>x.value=today);

let S={raw:[],batches:[],sales:[],expenses:[],debts:[]};
let isAdmin=false;
const ADMIN_PAGES=['raw','batch','buy','sales','expenses','debts','finance'];

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
/* Pembelian langsung barang jadi disimpan sebagai baris di tabel batches dengan kode BLI-... (bukan hasil produksi). PB() = hanya batch produksi, dipakai untuk statistik susut/rendemen/HPP produksi. */
const isBuy=b=>/^BLI-/i.test((b&&b.code)||'');
const PB=()=>S.batches.filter(b=>!isBuy(b));
function sold(id){return S.sales.filter(x=>x.batchId==id).reduce((a,x)=>a+x.qty,0)}
const normName=n=>(n||'').trim().toLowerCase();
/* ---- Stok bahan baku digabung per NAMA (lintas lot), dari yang paling lama masuk dulu (FIFO) ---- */
function rawStockByName(){
  let g={};
  S.raw.filter(r=>r.qty>0).slice().sort((a,b)=>a.date===b.date?0:(a.date<b.date?-1:1)).forEach(r=>{
    let disp=(r.name||'(tanpa nama)').trim(),k=normName(disp)||'(tanpa nama)';
    if(!g[k])g[k]={key:k,name:disp,totalQty:0,lots:[]};
    g[k].totalQty+=r.qty;g[k].lots.push(r);
  });
  return g;
}
/* ---- Stok barang jadi digabung per NAMA PRODUK (lintas batch), dari batch paling lama dulu (FIFO) ---- */
function finishedStockByProduct(){
  let g={};
  S.batches.filter(b=>b.output-sold(b.id)>0.0001).slice().sort((a,b)=>a.date===b.date?0:(a.date<b.date?-1:1)).forEach(b=>{
    let disp=(b.productName||'(tanpa nama)').trim(),k=normName(disp)||'(tanpa nama)',rem=b.output-sold(b.id);
    if(!g[k])g[k]={key:k,name:disp,totalQty:0,batches:[]};
    g[k].totalQty+=rem;g[k].batches.push(b);
  });
  return g;
}
/* ---- Business Intelligence: rendemen, BEP, harga jual minimum, simulasi ---- */
function yieldPct(b){return b.input?b.output/b.input*100:0}
function getBiMargin(){let el=$('#biMarginTarget');return el?(+el.value||0):20}
function empty(n){return `<tr><td colspan="${n}" style="text-align:center;color:#929a93">Belum ada data</td></tr>`}
function requireAdmin(){if(!isAdmin){toast('Silakan login sebagai admin terlebih dahulu.');return false}return true}

/* ---- Toast notifikasi (pengganti toast() bawaan browser) ---- */
function toast(msg,opts){
  const type=(opts&&opts.type)||(/^✅/.test(msg)?'ok':(/^❌|gagal/i.test(msg)?'err':'warn'));
  const stack=document.getElementById('toastStack');
  if(!stack){window.alert(msg);return}
  const el=document.createElement('div');
  el.className='toast toast-'+type;
  el.innerHTML=`<span>${esc(msg)}</span><button class="toast-x" aria-label="Tutup">&times;</button>`;
  stack.appendChild(el);
  requestAnimationFrame(()=>el.classList.add('show'));
  const remove=()=>{el.classList.remove('show');setTimeout(()=>el.remove(),250)};
  el.querySelector('.toast-x').onclick=remove;
  setTimeout(remove,type==='err'?5500:3800);
}
/* ---- Dialog konfirmasi kustom (pengganti confirm() bawaan browser) ---- */
function confirmDialog(msg,title){
  return new Promise(resolve=>{
    const modal=$('#confirmModal');
    if(!modal){resolve(window.confirm(msg));return}
    $('#confirmTitle').textContent=title||'Konfirmasi';
    $('#confirmMsg').textContent=msg;
    modal.classList.add('show');
    const ok=$('#confirmOk'),cancel=$('#confirmCancel');
    function cleanup(v){modal.classList.remove('show');ok.onclick=null;cancel.onclick=null;resolve(v)}
    ok.onclick=()=>cleanup(true);
    cancel.onclick=()=>cleanup(false);
  });
}
/* ---- Dialog input angka kustom (pengganti prompt() bawaan browser) ---- */
function promptDialog(msg,defaultVal,title){
  return new Promise(resolve=>{
    const modal=$('#promptModal');
    if(!modal){resolve(window.prompt(msg,defaultVal));return}
    $('#promptTitle').textContent=title||'Masukkan Jumlah';
    $('#promptMsg').textContent=msg;
    const input=$('#promptInput');input.value=defaultVal??'';
    modal.classList.add('show');
    setTimeout(()=>input.focus(),50);
    const ok=$('#promptOk'),cancel=$('#promptCancel');
    function cleanup(v){modal.classList.remove('show');ok.onclick=null;cancel.onclick=null;resolve(v)}
    ok.onclick=()=>cleanup(input.value);
    cancel.onclick=()=>cleanup(null);
  });
}
/* Mengisi beberapa elemen sekaligus dengan konten yang sama (dipakai supaya panel Laba & Laporan tampil identik di Dashboard dan halaman Laporan) */
function setAll(ids,value,isText){ids.forEach(id=>{let el=document.getElementById(id);if(el){if(isText)el.textContent=value;else el.innerHTML=value}})}

/* ---- DB <-> JS field mapping (snake_case <-> camelCase) ---- */
const mapRaw=r=>({id:r.id,date:r.date,name:r.name,qty:+r.qty,originalQty:+r.original_qty,price:+r.price,transport:+r.transport,other:+r.other,supplier:r.supplier});
const mapBatch=b=>({id:b.id,code:b.code,date:b.date,rawId:b.raw_id,rawName:b.raw_name,productName:b.product_name||b.raw_name,input:+b.input,output:+b.output,loss:+b.loss,lossPct:+b.loss_pct,totalHpp:+b.total_hpp,hppkg:+b.hpp_kg,labor:+b.labor,energy:+b.energy,other:+b.other,note:b.note,rawMaterialCost:b.raw_material_cost!=null?+b.raw_material_cost:null,rawTransportCost:b.raw_transport_cost!=null?+b.raw_transport_cost:null,rawOtherCost:b.raw_other_cost!=null?+b.raw_other_cost:null,lotCount:b.lot_count!=null?+b.lot_count:1,rawAllocations:b.raw_allocations?(typeof b.raw_allocations==='string'?JSON.parse(b.raw_allocations):b.raw_allocations):null});
const mapSale=x=>({id:x.id,invoice:x.invoice_no||'',date:x.date,batchId:x.batch_id,customer:x.customer_name||x.customer,qty:+x.qty,price:+x.price,total:+x.total,status:x.status||'Lunas'});
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
 PB().forEach(x=>{let d=new Date(x.date+'T00:00:00');if(d.getFullYear()===year){input[d.getMonth()]+=+x.input||0;output[d.getMonth()]+=+x.output||0}});
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
 let sorted=PB().slice().sort((a,b)=>new Date(a.date)-new Date(b.date));
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
 let avgYieldAll=PB().length?PB().reduce((a,b)=>a+yieldPct(b),0)/PB().length:0;
 if(PB().length&&avgYieldAll<27)saran.push('Tingkatkan rendemen produksi (target ≥27%).');
 let highLoss=PB().filter(b=>b.lossPct>75);
 if(highLoss.length)saran.push(`Evaluasi penyebab susut tinggi di ${highLoss.map(b=>esc(b.code)).join(', ')}.`);
 if(belowHpp.length)saran.push('Naikkan harga jual atau cari pasar dengan harga lebih baik.');
 if(saran.length)insights.push({type:'ok',title:'Saran fokus',body:saran});
 /* Stok barang jadi menipis — info stok fisik, aman ditampilkan ke publik (sama seperti halaman Barang Jadi) */
 let finStock={};S.batches.forEach(b=>{let q=Math.max(0,b.output-sold(b.id)),k=(b.productName||'').trim().toLowerCase();if(!k)return;if(!finStock[k])finStock[k]={name:b.productName,qty:0};finStock[k].qty+=q});
 let lowFin=Object.values(finStock).filter(f=>f.qty>0&&f.qty<=20);
 if(lowFin.length)insights.push({type:'warn',title:'Stok barang jadi menipis',body:lowFin.map(f=>`${esc(f.name)}: sisa ${kg(f.qty)}`)});
 /* Stok bahan baku & hutang jatuh tempo — data rahasia, hanya untuk admin yang sudah login */
 if(isAdmin){
   let rawStock={};S.raw.forEach(r=>{let k=(r.name||'').trim().toLowerCase();if(!k)return;if(!rawStock[k])rawStock[k]={name:r.name,qty:0};rawStock[k].qty+=r.qty});
   let lowRaw=Object.values(rawStock).filter(r=>r.qty<=25);
   if(lowRaw.length)insights.push({type:'warn',title:'Stok bahan baku menipis',body:lowRaw.map(r=>`${esc(r.name)}: sisa ${kg(r.qty)}`)});
   let soon=new Date();soon.setHours(0,0,0,0);soon.setDate(soon.getDate()+7);
   let dueDebts=S.debts.filter(d=>debtRemaining(d)>0&&d.dueDate&&day(d.dueDate)<=soon);
   if(dueDebts.length)insights.push({type:'warn',title:'Hutang jatuh tempo dalam 7 hari',body:dueDebts.map(d=>`${esc(d.creditor)}: ${rp(debtRemaining(d))} · jatuh tempo ${fmtDate(d.dueDate)}`)});
 }
 if(!insights.length)return '<div class="stock-empty">Belum cukup data untuk insight. Tambahkan batch &amp; penjualan dulu.</div>';
 return insights.map(i=>{
   let icon=i.type==='up'?'▲':i.type==='down'?'▼':i.type==='warn'?'⚠':'✓';
   let body=Array.isArray(i.body)?`<ol>${i.body.map(x=>`<li>${x}</li>`).join('')}</ol>`:`<p>${i.body}</p>`;
   return `<div class="insight-card ins-${i.type}"><div class="insight-head"><span class="insight-ic">${icon}</span><b>${esc(i.title)}</b></div>${body}</div>`;
 }).join('');
}

/* ---- Render ---- */
function render(){
let rawQty=S.raw.reduce((a,x)=>a+x.qty,0),rawValue=S.raw.reduce((a,x)=>a+x.qty*landed(x),0),out=PB().reduce((a,x)=>a+x.output,0),inp=PB().reduce((a,x)=>a+x.input,0),loss=inp-out;
let finishedQty=S.batches.reduce((a,x)=>a+x.output,0)-S.sales.reduce((a,x)=>a+x.qty,0),finishedValue=S.batches.reduce((a,b)=>a+Math.max(0,b.output-sold(b.id))*b.hppkg,0);
/* ---- Ringkasan Cepat (KPI strip paling atas dashboard) ---- */
let batchesThisMonth=PB().filter(b=>thisMonth(b.date)),outputThisMonth=batchesThisMonth.reduce((a,b)=>a+b.output,0);
let avgYieldAll=PB().length?PB().reduce((a,b)=>a+yieldPct(b),0)/PB().length:0;
let sortedByDate=PB().slice().sort((a,b)=>new Date(a.date)-new Date(b.date));
let yieldTrendTxt='Belum ada tren';
if(sortedByDate.length>=2){let d=yieldPct(sortedByDate[sortedByDate.length-1])-yieldPct(sortedByDate[sortedByDate.length-2]);if(Math.abs(d)>=0.1)yieldTrendTxt=(d>0?'▲ Naik ':'▼ Turun ')+Math.abs(d).toFixed(1)+' poin dari batch sebelumnya'}
animateNum(['qgRawValue'],rawValue,rp);
if($('#qgRawQty'))$('#qgRawQty').textContent=kg(rawQty)+' tersimpan';
animateNum(['qgFinValue'],finishedValue,rp);
if($('#qgFinQty'))$('#qgFinQty').textContent=kg(finishedQty)+' siap jual';
animateNum(['qgBatchMonth'],batchesThisMonth.length,v=>Math.round(v).toLocaleString('id-ID'));
if($('#qgOutputMonth'))$('#qgOutputMonth').textContent=kg(outputThisMonth)+' dihasilkan';
animateNum(['qgYieldAvg'],avgYieldAll,v=>v.toFixed(1)+'%');
if($('#qgYieldTrend'))$('#qgYieldTrend').textContent=yieldTrendTxt;
let ws=S.sales.filter(x=>last7(x.date)),ms=S.sales.filter(x=>thisMonth(x.date)),we=S.expenses.filter(x=>last7(x.date)).reduce((a,x)=>a+x.amount,0),me=S.expenses.filter(x=>thisMonth(x.date)).reduce((a,x)=>a+x.amount,0);
let wc=ws.reduce((a,x)=>{let b=B(x.batchId);return a+(b?x.qty*b.hppkg:0)},0),mc=ms.reduce((a,x)=>{let b=B(x.batchId);return a+(b?x.qty*b.hppkg:0)},0);
/* Kartu stok terpisah per jenis: tiap bahan baku & tiap produk jadi dapat kartu sendiri */
let rawByName={};S.raw.forEach(r=>{let disp=(r.name||'(tanpa nama)').trim(),k=normName(disp)||'(tanpa nama)';if(!rawByName[k])rawByName[k]={name:disp,qty:0,value:0};rawByName[k].qty+=r.qty;rawByName[k].value+=r.qty*landed(r)});
/* Estimasi hari stok tersisa per bahan, dari rata² pemakaian harian (berdasar batch yang memakai bahan tsb) — supaya kartu stok berguna untuk keputusan restock, bukan cuma angka statis */
let usageByRaw={};PB().forEach(b=>{let k=normName(b.rawName)||'(tanpa nama)';if(!usageByRaw[k])usageByRaw[k]={total:0,firstDate:b.date,lastDate:b.date};let u=usageByRaw[k];u.total+=b.input;if(b.date<u.firstDate)u.firstDate=b.date;if(b.date>u.lastDate)u.lastDate=b.date});
Object.keys(rawByName).forEach(k=>{
  let u=usageByRaw[k];
  if(!u){rawByName[k].daysLeft=null;return}
  let span=Math.max(1,Math.round((day(u.lastDate)-day(u.firstDate))/86400000)+1),perDay=u.total/span;
  rawByName[k].daysLeft=perDay>0?rawByName[k].qty/perDay:null;
});
let finByName={};S.batches.forEach(b=>{let q=b.output-sold(b.id);if(q<=0)return;let disp=(b.productName||'(tanpa nama)').trim(),k=normName(disp)||'(tanpa nama)';if(!finByName[k])finByName[k]={name:disp,qty:0,value:0};finByName[k].qty+=q;finByName[k].value+=q*b.hppkg});
let rawCardsHtml=Object.values(rawByName).map(v=>{
  let dl=v.daysLeft,warn=dl!==null&&dl<=14,footer=dl===null?'Belum ada data pemakaian':`≈${Math.round(dl)} hari lagi pada laju pakai saat ini`;
  return `<div class="stock-card is-raw${warn?' is-low':''}"><span class="stock-tag">Bahan Baku</span><div class="stock-card-name">${esc(v.name)}</div><div class="stock-card-qty">${kg(v.qty)}</div><div class="stock-card-value">${rp(v.value)}</div><div class="stock-card-eta${warn?' warn':''}">${warn?'⚠ ':''}${footer}</div></div>`;
}).join('');
let finCardsHtml=Object.values(finByName).map(v=>`<div class="stock-card is-product"><span class="stock-tag">Barang Jadi</span><div class="stock-card-name">${esc(v.name)}</div><div class="stock-card-qty">${kg(v.qty)}</div><div class="stock-card-value">${rp(v.value)}</div></div>`).join('');
if($('#stockCardsRaw'))$('#stockCardsRaw').innerHTML=rawCardsHtml||'<div class="stock-empty">Belum ada stok bahan baku. Tiap jenis bahan (mis. Kelapa) tampil sebagai kartu sendiri, jumlahnya tidak digabung dengan bahan lain.</div>';
if($('#stockCardsFinished'))$('#stockCardsFinished').innerHTML=finCardsHtml||'<div class="stock-empty">Belum ada stok barang jadi.</div>';
$('#dProfitWeek').innerHTML=signed(ws.reduce((a,x)=>a+x.total,0)-wc-we);$('#dProfitMonth').innerHTML=signed(ms.reduce((a,x)=>a+x.total,0)-mc-me);$('#dExpenseWeek').textContent=rp(we);$('#dExpenseMonth').textContent=rp(me);
/* Hutang perusahaan */
let activeDebts=S.debts.filter(d=>debtRemaining(d)>0),outstanding=activeDebts.reduce((a,d)=>a+debtRemaining(d),0),overdue=activeDebts.filter(d=>debtStatus(d).label==='Jatuh Tempo').length;
$('#dDebtOutstanding').textContent=rp(outstanding);
$('#dDebtInfo').textContent=`${activeDebts.length} kreditur aktif${overdue?' · '+overdue+' jatuh tempo':''}`;
$('#dDebtBreakdown').innerHTML=activeDebts.length?activeDebts.map(d=>`<div class="bd-row"><span>${esc(d.creditor)}</span><span>${rp(debtRemaining(d))} · ${debtStatus(d).label}</span></div>`).join(''):'<div class="bd-row bd-empty">Tidak ada hutang aktif</div>';
/* Piutang penjualan (belum tertagih) */
let piutangSales=S.sales.filter(x=>x.status==='Piutang'),totalPiutang=piutangSales.reduce((a,x)=>a+x.total,0);
if($('#dReceivable'))$('#dReceivable').textContent=rp(totalPiutang);
if($('#dReceivableInfo'))$('#dReceivableInfo').textContent=`${piutangSales.length} transaksi belum tertagih`;
/* ---- Untung/rugi per batch (dihitung lebih awal supaya bisa dipakai di kartu Statistik Susut) ---- */
function batchProfitInfo(b){let ss=S.sales.filter(x=>x.batchId==b.id),om=ss.reduce((a,x)=>a+x.total,0),q=ss.reduce((a,x)=>a+x.qty,0),hc=q*b.hppkg,l=om-hc;return{om,q,hc,l,sisa:b.output-q}}
let allBatchProfit=S.batches.map(batchProfitInfo);
let totalRealizedProfit=allBatchProfit.reduce((a,x)=>a+x.l,0);
$('#susutTotal').innerHTML=`<span>Total ${totalRealizedProfit<0?'Kerugian':'Keuntungan'} Terjual: </span>${signed(totalRealizedProfit)}`;
$('#susutTotal').className='susut-total '+(totalRealizedProfit<0?'neg':'pos');
/* Statistik susut per batch (individual, bukan digabung per lini), + untung/rugi Rp */
$('#batchLossList').innerHTML=PB().slice().reverse().slice(0,10).map(b=>{
  let pct=b.lossPct||0,cls=pct<=10?'good':(pct<=20?'warn':'bad'),pf=batchProfitInfo(b);
  let profitRow=pf.q>0?`<div class="blc-profit ${pf.l<0?'neg':'pos'}"><span>${pf.l<0?'Rugi':'Untung'}</span><b>${rp(Math.abs(pf.l))}</b></div>`:`<div class="blc-profit"><span>Belum terjual</span><b>—</b></div>`;
  return `<div class="batch-loss-card ${cls}"><div class="blc-top"><b>${esc(b.code)}</b><span class="blc-pct">${pct.toFixed(1)}%</span></div><div class="blc-name">${esc(b.productName)}<small>dari ${esc(b.rawName)}</small></div><div class="blc-date">${ICON.calendar} Produksi: ${fmtDate(b.date)}</div><div class="blc-bar"><div class="blc-bar-fill" style="width:${Math.min(100,pct)}%"></div></div><div class="blc-meta"><span>Masuk ${kg(b.input)}</span><span>Jadi ${kg(b.output)}</span><span>Susut ${kg(b.loss)}</span><span>Rendemen ${yieldPct(b).toFixed(1)}%</span></div>${profitRow}</div>`;
}).join('')||'<div class="stock-empty">Belum ada data batch produksi</div>';
/* Statistik per lini produksi (mis. Kelapa → Kopra, Batok Kelapa → Arang), dipakai di dashboard & laporan */
let lineStats={};PB().forEach(b=>{let k=`${b.rawName||'?'}→${b.productName||'?'}`;if(!lineStats[k])lineStats[k]={raw:b.rawName,product:b.productName,batches:0,input:0,output:0,loss:0,hpp:0};let s=lineStats[k];s.batches++;s.input+=b.input;s.output+=b.output;s.loss+=b.loss;s.hpp+=b.totalHpp});
/* Total bahan masuk per JENIS bahan baku saja (lintas lini produksi), supaya tidak jadi satu angka gabungan — mis. Kelapa dan Batok Kelapa tampil terpisah */
let inputByRaw={};PB().forEach(b=>{let k=normName(b.rawName)||'(tanpa nama)';if(!inputByRaw[k])inputByRaw[k]={name:(b.rawName||'(tanpa nama)').trim(),input:0};inputByRaw[k].input+=b.input});
let inputBreakdownHtml=Object.values(inputByRaw).length?Object.values(inputByRaw).sort((a,b)=>b.input-a.input).map(v=>`<div class="ib-row"><span>${esc(v.name)}</span><b>${kg(v.input)}</b></div>`).join(''):'<div class="ib-row ib-empty">Belum ada bahan yang diproses</div>';
setAll(['psInputBreakdown','psInputBreakdownD'],inputBreakdownHtml,false);
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
PB().forEach(b=>{
  if(b.rawMaterialCost!=null){
    /* Sudah tersimpan akurat saat batch dibuat (bisa gabungan beberapa lot bahan baku) */
    costComp.bahan+=+b.rawMaterialCost||0;
    costComp.transport+=+b.rawTransportCost||0;
    costComp.lain+=(+b.rawOtherCost||0)+(+b.other||0);
  }else{
    /* Data lama (sebelum fitur multi-lot): ambil dari 1 lot yang tertaut ke batch ini */
    let r=S.raw.find(x=>x.id===b.rawId),basis=r?(+r.originalQty||+r.qty||1):1;
    let rawPrice=r?+r.price:0,rawTransport=r?+r.transport:0,rawOther=r?+r.other:0;
    costComp.bahan+=b.input*rawPrice;
    costComp.transport+=b.input*(rawTransport/basis);
    costComp.lain+=b.input*(rawOther/basis)+(+b.other||0);
  }
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
let rawGroups=rawStockByName();
$('#rawSelect').innerHTML=Object.keys(rawGroups).length?Object.values(rawGroups).map(g=>`<option value="${esc(g.key)}">${esc(g.name)} — tersedia total ${kg(g.totalQty)}</option>`).join(''):'<option value="">Belum ada stok bahan baku</option>';
if(typeof updateRawAvailHint==='function')updateRawAvailHint();
renderBatchTable();
let finGroups=finishedStockByProduct();
$('#salesBatch').innerHTML=Object.keys(finGroups).length?Object.values(finGroups).map(g=>`<option value="${esc(g.key)}">${esc(g.name)} — sisa total ${kg(g.totalQty)}</option>`).join(''):'<option value="">Belum ada stok barang jadi</option>';
if(typeof updateSalesAvailHint==='function')updateSalesAvailHint();
let tq=0,tv=0;$('#finishedTable').innerHTML=S.batches.map(b=>{let q=b.output-sold(b.id);tq+=q;tv+=q*b.hppkg;return `<tr><td data-label="Batch">${b.code}</td><td data-label="Produk Jadi">${esc(b.productName)}</td><td data-label="Bahan Asal">${esc(b.rawName)}</td><td data-label="Masuk">${kg(b.output)}</td><td data-label="Terjual">${kg(sold(b.id))}</td><td data-label="Sisa">${kg(q)}</td><td data-label="HPP/kg">${rp(b.hppkg)}</td></tr>`}).join('')||empty(7);
/* Riwayat pembelian langsung barang jadi */
if($('#buyTable')){
  const buys=S.batches.filter(isBuy).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.code).localeCompare(String(a.code)));
  const bTotal=buys.reduce((a,b)=>a+b.totalHpp,0),bQty=buys.reduce((a,b)=>a+b.output,0),bLeft=buys.reduce((a,b)=>a+Math.max(0,b.output-sold(b.id)),0);
  if($('#buyKTotal')){$('#buyKTotal').textContent=rp(bTotal);$('#buyKCount').textContent=buys.length+' transaksi';$('#buyKQty').textContent=kg(bQty);$('#buyKLeft').textContent=kg(bLeft)}
  $('#buyTable').innerHTML=buys.map(b=>{const s=sold(b.id),sisa=b.output-s;return `<tr><td data-label="Tanggal">${fmtDate(b.date)}</td><td data-label="Kode">${esc(b.code)}</td><td data-label="Produk">${esc(b.productName)}${b.note?`<small class="lot-count"> · ${esc(b.note)}</small>`:''}</td><td data-label="Qty">${kg(b.output)}</td><td data-label="HPP/kg">${rp(b.hppkg)}</td><td data-label="Total">${rp(b.totalHpp)}</td><td data-label="Terjual">${kg(s)}</td><td data-label="Sisa">${kg(sisa)}</td><td data-label="Aksi" class="admin-only"><button type="button" onclick="deleteBuy('${b.id}')" class="btn-delete">${ICON.trash} Hapus</button></td></tr>`}).join('')||empty(9);
  if(typeof applyAdminVisibility==='function')applyAdminVisibility();
}
$('#fQty').textContent=kg(tq);$('#fValue').textContent=rp(tv);$('#fAvg').textContent=rp(tq?tv/tq:0);
animateNum(['fQty'],tq,kg);animateNum(['fValue'],tv,rp);animateNum(['fAvg'],tq?tv/tq:0,rp);
$('#salesTable').innerHTML=S.sales.slice().reverse().map(x=>{let b=B(x.batchId),c=x.qty*(b?b.hppkg:0),isPiutang=x.status==='Piutang';return `<tr><td data-label="Invoice"><span class="invoice-code">${esc(x.invoice||'-')}</span></td><td data-label="Tanggal">${x.date}</td><td data-label="Batch">${b?.code||'-'}</td><td data-label="Pelanggan">${esc(x.customer||'')}</td><td data-label="Qty">${kg(x.qty)}</td><td data-label="Omzet">${rp(x.total)}</td><td data-label="HPP">${rp(c)}</td><td data-label="Laba">${signed(x.total-c)}</td><td data-label="Status"><span class="badge ${isPiutang?'badge-pending':'badge-ok'}">${esc(x.status)}</span></td><td data-label="Aksi"><div class="sale-actions">${isPiutang?`<button onclick="markSalePaid('${x.id}')" class="btn-paid">${ICON.cash} Lunas</button>`:''}<button onclick="deleteSale('${x.id}')" class="btn-delete">${ICON.trash} Hapus</button></div></td></tr>`}).join('')||empty(10);
$('#expenseTable').innerHTML=S.expenses.slice().reverse().map(x=>`<tr><td data-label="Tanggal">${x.date}</td><td data-label="Kategori">${x.cat}</td><td data-label="Deskripsi">${esc(x.desc)}</td><td data-label="Jumlah">${rp(x.amount)}</td><td data-label="Aksi"><button onclick="deleteExpense('${x.id}')" class="btn-delete">${ICON.trash} Hapus</button></td></tr>`).join('')||empty(5);
$('#debtTable').innerHTML=S.debts.slice().reverse().map(d=>{let r=debtRemaining(d),st=debtStatus(d);return `<tr><td data-label="Tanggal">${d.date}</td><td data-label="Kreditur">${esc(d.creditor)}</td><td data-label="Keterangan">${esc(d.desc||'-')}</td><td data-label="Jumlah">${rp(d.amount)}</td><td data-label="Terbayar">${rp(d.paidAmount)}</td><td data-label="Sisa">${rp(r)}</td><td data-label="Jatuh Tempo">${d.dueDate||'-'}</td><td data-label="Status"><span class="badge ${st.cls}">${st.label}</span></td><td data-label="Aksi">${r>0?`<button onclick="payDebt('${d.id}')" class="btn-pay">${ICON.cash} Bayar</button>`:''}<button onclick="deleteDebt('${d.id}')" class="btn-delete">${ICON.trash} Hapus</button></td></tr>`}).join('')||empty(9);
/* Statistik Produksi Lengkap (akumulasi seluruh waktu, per lini produksi) — tampil di halaman Laporan & juga di Dashboard */
animateNum(['psBatches','psBatchesD'],PB().length,v=>Math.round(v).toLocaleString('id-ID'));
animateNum(['psInput','psInputD'],inp,kg);animateNum(['psOutput','psOutputD'],out,kg);animateNum(['psLoss','psLossD'],loss,kg);
setAll(['psLossPct','psLossPctD'],(inp?loss/inp*100:0).toFixed(1)+'%',true);
animateNum(['psHpp','psHppD'],PB().reduce((a,b)=>a+b.totalHpp,0),rp);
let productionDays=new Set(PB().map(b=>b.date).filter(Boolean)).size;
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
setAll(['report','reportD'],`<div><span>Total omzet</span><strong>${rp(totalSales)}</strong></div><div><span>HPP terjual</span><strong>${rp(totalCogs)}</strong></div><div><span>Laba kotor</span><strong>${signed(totalSales-totalCogs)}</strong></div><div><span>Pengeluaran umum</span><strong>${rp(totalExp)}</strong></div><div><span>Laba bersih</span><strong>${signed(totalSales-totalCogs-totalExp)}</strong></div><div><span>Piutang belum tertagih</span><strong>${rp(totalPiutang)}</strong></div><div><span>Total batch</span><strong>${S.batches.length}</strong></div><div><span>Batch untung / rugi / belum terjual</span><strong>${untung} / ${rugi} / ${belum}</strong></div><div><span>Hutang belum lunas</span><strong>${rp(S.debts.reduce((a,d)=>a+debtRemaining(d),0))}</strong></div>`,false);
$('#recent').innerHTML=`<div class="recent-list">${PB().slice(-5).reverse().map(b=>`<div class="recent-item"><div class="recent-item-main"><div class="recent-item-title">${esc(b.code)} <small>${esc(b.productName)} dari ${esc(b.rawName)}</small></div><div class="recent-item-meta"><span>Hasil <b>${kg(b.output)}</b></span><span>HPP <b>${rp(b.hppkg)}</b>/kg</span><span>Susut <b>${b.lossPct.toFixed(1)}%</b></span></div></div><div class="recent-item-date"><b>${fmtDate(b.date)}</b><small>Tgl Produksi</small></div></div>`).join('')}</div>`||'<div class="recent-empty">Belum ada batch.</div>';
if(!PB().length)$('#recent').innerHTML='<div class="recent-empty">Belum ada data batch produksi.</div>';
/* ---- Gate: sembunyikan detail keuangan dari publik, tampil hanya setelah login admin ---- */
let financeLocked=$('#financeLocked'),financeContent=$('#financeContent');
if(financeLocked&&financeContent){financeLocked.style.display=isAdmin?'none':'block';financeContent.style.display=isAdmin?'block':'none'}
drawCharts();
reapplyTableFilters();
}

/* ---- Riwayat Batch: statistik + filter + sort, terpisah dari render() supaya bisa dipanggil ulang sendiri saat filter diganti ---- */
function renderBatchTable(){
  let prodSel=$('#batchFilterProduct'),periodSel=$('#batchFilterPeriod'),sortSel=$('#batchSort');
  if(!prodSel||!periodSel||!sortSel||!$('#batchTable'))return;
  let curProd=prodSel.value;
  let productNames=[...new Set(PB().map(b=>(b.productName||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  prodSel.innerHTML='<option value="">Semua Produk</option>'+productNames.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('');
  if(productNames.includes(curProd))prodSel.value=curProd;

  let list=PB();
  if(prodSel.value)list=list.filter(b=>(b.productName||'').trim()===prodSel.value);
  let period=periodSel.value;
  if(period==='7')list=list.filter(b=>{let s=new Date();s.setHours(0,0,0,0);s.setDate(s.getDate()-6);return day(b.date)>=s});
  else if(period==='30')list=list.filter(b=>{let s=new Date();s.setHours(0,0,0,0);s.setDate(s.getDate()-29);return day(b.date)>=s});
  else if(period==='month')list=list.filter(b=>thisMonth(b.date));

  let sortMode=sortSel.value;
  list.sort((a,b)=>{
    switch(sortMode){
      case 'oldest':return new Date(a.date)-new Date(b.date)||a.code.localeCompare(b.code);
      case 'yield_desc':return yieldPct(b)-yieldPct(a);
      case 'yield_asc':return yieldPct(a)-yieldPct(b);
      case 'hpp_desc':return b.hppkg-a.hppkg;
      case 'hpp_asc':return a.hppkg-b.hppkg;
      default:return new Date(b.date)-new Date(a.date)||b.code.localeCompare(a.code);
    }
  });

  /* Statistik ringkas mengikuti filter yang aktif */
  let n=list.length,totalIn=list.reduce((a,b)=>a+b.input,0),totalOut=list.reduce((a,b)=>a+b.output,0),totalHpp=list.reduce((a,b)=>a+b.totalHpp,0);
  let avgYield=n?list.reduce((a,b)=>a+yieldPct(b),0)/n:0;
  let best=n?list.reduce((a,b)=>yieldPct(b)>yieldPct(a)?b:a):null;
  if($('#batchStatsStrip'))$('#batchStatsStrip').innerHTML=`
<div><span>Jumlah Batch</span><b>${n}</b><small>${prodSel.value?esc(prodSel.value):'Semua produk'}</small></div>
<div><span>Total Bahan Masuk</span><b>${kg(totalIn)}</b><small>Rata² ${n?kg(totalIn/n):'0 kg'}/batch</small></div>
<div><span>Total Produk Jadi</span><b>${kg(totalOut)}</b><small>Total HPP ${rp(totalHpp)}</small></div>
<div><span>Rata² Rendemen</span><b>${avgYield.toFixed(1)}%</b><small>${best?`Terbaik ${esc(best.code)} (${yieldPct(best).toFixed(1)}%)`:'Belum ada data'}</small></div>`;

  $('#batchTable').innerHTML=list.map(b=>{
    let pct=yieldPct(b),cls=pct>=27?'good':(pct>=18?'warn':'bad');
    return `<tr><td data-label="Batch">${esc(b.code)}</td><td data-label="Tanggal">${fmtDate(b.date)}</td><td data-label="Bahan Baku">${esc(b.rawName)}${b.lotCount>1?`<small class="lot-count"> (${b.lotCount} lot)</small>`:''}</td><td data-label="Produk Jadi">${esc(b.productName)}</td><td data-label="Input">${kg(b.input)}</td><td data-label="Output">${kg(b.output)}</td><td data-label="Penyusutan">${kg(b.loss)} (${b.lossPct.toFixed(1)}%)</td><td data-label="Rendemen"><span class="rendemen-pill ${cls}">${pct.toFixed(1)}%</span></td><td data-label="HPP Batch">${rp(b.totalHpp)}</td><td data-label="HPP/kg">${rp(b.hppkg)}</td><td data-label="Aksi"><button onclick="deleteBatch('${b.id}')" class="btn-delete">${ICON.trash} Hapus</button></td></tr>`;
  }).join('');
  if(!PB().length){
    $('#batchTable').innerHTML=empty(11);
    if($('#batchHistoryEmpty'))$('#batchHistoryEmpty').style.display='none';
  }else if($('#batchHistoryEmpty')){
    $('#batchHistoryEmpty').style.display=n?'none':'block';
  }
  if(typeof reapplyTableFilters==='function')reapplyTableFilters();
}
['batchFilterProduct','batchFilterPeriod','batchSort'].forEach(id=>{let el=document.getElementById(id);if(el)el.addEventListener('change',renderBatchTable)});
const TABLE_SEARCH_MAP={searchRaw:'rawTable',searchBatch:'batchTable',searchSales:'salesTable',searchExpense:'expenseTable',searchDebt:'debtTable'};
function filterTable(inputId,tbodyId){
  const input=$('#'+inputId),tbody=$('#'+tbodyId);
  if(!input||!tbody)return;
  const q=input.value.trim().toLowerCase();
  tbody.querySelectorAll('tr').forEach(tr=>{tr.style.display=(!q||tr.textContent.toLowerCase().includes(q))?'':'none'});
}
function reapplyTableFilters(){Object.entries(TABLE_SEARCH_MAP).forEach(([inputId,tbodyId])=>filterTable(inputId,tbodyId))}
Object.entries(TABLE_SEARCH_MAP).forEach(([inputId,tbodyId])=>{const el=document.getElementById(inputId);if(el)el.addEventListener('input',()=>filterTable(inputId,tbodyId))});

/* ---- DELETE FUNCTIONS ---- */

// Tandai penjualan piutang sebagai lunas (seluruh baris invoice yang sama)
function saleGroup(sale){return sale.invoice?S.sales.filter(x=>x.invoice===sale.invoice&&x.customer===sale.customer&&x.date===sale.date):[sale]}
async function markSalePaid(id){
  if(!requireAdmin())return;
  const sale=S.sales.find(x=>String(x.id)===String(id));
  if(!sale)return toast('Data tidak ditemukan!');
  const grp=saleGroup(sale),total=grp.reduce((a,x)=>a+x.total,0);
  if(!await confirmDialog(`Tandai lunas?\n\nInvoice: ${sale.invoice||'-'}\nPelanggan: ${sale.customer}\nTotal: ${rp(total)}`))return;
  const {data,error}=await sb.from('sales').update({status:'Lunas'}).in('id',grp.map(x=>x.id)).select('id');
  if(error)return toast('Gagal memperbarui status: '+error.message);
  if(!data||!data.length)return toast('Tidak ada data yang berubah. Periksa kebijakan (RLS) UPDATE untuk tabel sales di Supabase.');
  grp.forEach(x=>x.status='Lunas');render();
  toast('✅ Penjualan ditandai lunas.');
}

// Hapus Penjualan / Piutang (satu invoice bisa terpecah ke beberapa baris batch)
async function deleteSale(id) {
    if (!requireAdmin()) return;
    const sale = S.sales.find(x => String(x.id) === String(id));
    if (!sale) return toast('Data tidak ditemukan!');
    const grp = saleGroup(sale), total = grp.reduce((a,x)=>a+x.total,0), qty = grp.reduce((a,x)=>a+x.qty,0);
    const info = grp.length>1 ? `\n\nInvoice ini terdiri dari ${grp.length} baris (dialokasikan ke beberapa batch). Semua baris ikut dihapus.` : '';
    if (!await confirmDialog(`Hapus ${sale.status==='Piutang'?'piutang':'penjualan'}?\n\nInvoice: ${sale.invoice||'-'}\nTanggal: ${sale.date}\nPelanggan: ${sale.customer}\nQTY: ${qty} kg\nTotal: ${rp(total)}${info}\n\nData akan dihapus permanen!`)) return;
    const ids = grp.map(x => x.id);
    const { data, error } = await sb.from('sales').delete().in('id', ids).select('id');
    if (error) return toast('Gagal hapus: ' + error.message);
    if (!data || !data.length) return toast('Data tidak terhapus di server. Buka Supabase → tabel sales → tambahkan kebijakan (RLS) DELETE untuk pengguna login (lihat keuangan.sql).');
    const gone = data.map(r => String(r.id));
    S.sales = S.sales.filter(x => !gone.includes(String(x.id)));
    render();
    toast('✅ ' + (sale.status==='Piutang'?'Piutang':'Penjualan') + ' berhasil dihapus!');
}

// Hapus Batch
async function deleteBatch(id) {
    if (!requireAdmin()) return;
    const batch = S.batches.find(x => String(x.id)===String(id));
    if (!batch) return toast('Data tidak ditemukan!');
    const hasSales = S.sales.some(x => x.batchId === id);
    if (hasSales) {
        if (!await confirmDialog(`⚠️ Batch ${batch.code} sudah memiliki penjualan.\nHapus akan menghapus semua penjualan terkait!\n\nLanjutkan?`)) return;
        for (const sale of S.sales.filter(x => x.batchId === id)) {
            await sb.from('sales').delete().eq('id', sale.id);
        }
        S.sales = S.sales.filter(x => x.batchId !== id);
    }
    if (!await confirmDialog(`Hapus batch?\n\nKode: ${batch.code}\nTanggal: ${batch.date}\nOutput: ${batch.output} kg\n\nData akan dihapus permanen!`)) return;
    if (batch.rawAllocations && batch.rawAllocations.length) {
        for (const alloc of batch.rawAllocations) {
            const raw = S.raw.find(r => r.id === alloc.raw_id);
            if (raw) {
                await sb.from('raw_materials').update({ qty: raw.qty + (+alloc.qty||0) }).eq('id', raw.id);
                raw.qty += (+alloc.qty||0);
            }
        }
    } else if (batch.rawId) {
        const raw = S.raw.find(r => r.id === batch.rawId);
        if (raw) {
            await sb.from('raw_materials').update({ qty: raw.qty + batch.input }).eq('id', raw.id);
            raw.qty += batch.input;
        }
    }
    const { error } = await sb.from('batches').delete().eq('id', id);
    if (error) return toast('Gagal hapus: ' + error.message);
    S.batches = S.batches.filter(x => String(x.id)!==String(id));
    render();
    toast('✅ Batch berhasil dihapus!');
}

// Hapus Bahan Baku
async function deleteRaw(id) {
    if (!requireAdmin()) return;
    const raw = S.raw.find(x => String(x.id)===String(id));
    if (!raw) return toast('Data tidak ditemukan!');
    const usedInBatch = S.batches.some(x => x.rawId === id);
    if (usedInBatch) {
        return toast('❌ Bahan baku ini sudah digunakan dalam produksi batch, tidak bisa dihapus!');
    }
    if (!await confirmDialog(`Hapus bahan baku?\n\nNama: ${raw.name}\nQTY: ${raw.qty} kg\n\nData akan dihapus permanen!`)) return;
    const { error } = await sb.from('raw_materials').delete().eq('id', id);
    if (error) return toast('Gagal hapus: ' + error.message);
    S.raw = S.raw.filter(x => String(x.id)!==String(id));
    render();
    toast('✅ Bahan baku berhasil dihapus!');
}

// Hapus Pengeluaran
async function deleteExpense(id) {
    if (!requireAdmin()) return;
    const expense = S.expenses.find(x => String(x.id)===String(id));
    if (!expense) return toast('Data tidak ditemukan!');
    if (!await confirmDialog(`Hapus pengeluaran?\n\nTanggal: ${expense.date}\nKategori: ${expense.cat}\nDeskripsi: ${expense.desc}\nJumlah: ${rp(expense.amount)}\n\nData akan dihapus permanen!`)) return;
    const { error } = await sb.from('expenses').delete().eq('id', id);
    if (error) return toast('Gagal hapus: ' + error.message);
    S.expenses = S.expenses.filter(x => String(x.id)!==String(id));
    render();
    toast('✅ Pengeluaran berhasil dihapus!');
}

/* ---- Navigation ---- */
function go(p){if(ADMIN_PAGES.includes(p)&&!isAdmin)p='dashboard';$$('.page').forEach(x=>x.classList.toggle('active',x.id===p));$$('nav button').forEach(x=>x.classList.toggle('active',x.dataset.page===p));$('#title').textContent=p==='dashboard'?'Dashboard Global':p==='raw'?'Bahan Baku':p==='batch'?'Produksi Batch':p==='finished'?'Barang Jadi':p==='buy'?'Pembelian Barang Jadi':p==='debts'?'Hutang Perusahaan':p==='finance'?'Keuangan':p==='reports'?'Laba & Laporan':p[0].toUpperCase()+p.slice(1);$('#modal').classList.remove('show')}
$$('nav button').forEach(x=>x.onclick=()=>go(x.dataset.page));
$('#quick').onclick=()=>{if(requireAdmin())$('#modal').classList.add('show')};
$$('#modal [data-go]').forEach(x=>x.onclick=()=>go(x.dataset.go));

/* ---- Raw material form ---- */
function rawPreview(){let f=$('#rawForm'),q=+f.qty.value||0,p=+f.price.value||0,t=+f.transport.value||0,o=+f.other.value||0;$('#rawTotal').textContent=rp(q*p+t+o)}
['qty','price','transport','other'].forEach(n=>document.querySelector(`#rawForm [name="${n}"]`).addEventListener('input',rawPreview));rawPreview();
$('#rawForm').onsubmit=async e=>{
  e.preventDefault();if(!requireAdmin())return;
  let x=Object.fromEntries(new FormData(e.target)),q=+x.qty;
  if(q<=0)return toast('Qty bahan baku harus lebih dari 0.');
  const payload={date:x.date,name:x.name,qty:q,original_qty:q,price:+x.price||0,transport:+x.transport||0,other:+x.other||0,supplier:x.supplier||null};
  const {data,error}=await sb.from('raw_materials').insert(payload).select().single();
  if(error)return toast('Gagal simpan: '+error.message);
  S.raw.push(mapRaw(data));render();e.target.reset();e.target.date.value=today;rawPreview();
  toast('Bahan baku berhasil dicatat.');
};

/* ---- Auto-isi nama produk sesuai bahan baku (Kelapa→Kopra, Batok Kelapa→Arang), supaya nama lini produksi konsisten untuk statistik ---- */
function suggestProductName(rawName){
  let n=(rawName||'').toLowerCase();
  if(n.includes('batok')||n.includes('tempurung'))return 'Arang';
  if(n.includes('kelapa'))return 'Kopra';
  return '';
}
document.getElementById('rawSelect').addEventListener('change',()=>{
  let sel=document.getElementById('rawSelect'),key=sel.value,g=rawStockByName()[key],f=document.querySelector('#batchForm [name="productName"]');
  if(g&&f&&!f.value.trim())f.value=suggestProductName(g.name);
  updateRawAvailHint();
});
/* ---- Hint total stok tersedia untuk bahan baku terpilih (gabungan semua lot) + batas qty ---- */
function updateRawAvailHint(){
  let sel=$('#rawSelect'),hint=$('#rawAvailHint'),qtyField=$('#inputQtyField');
  if(!sel||!hint)return;
  let g=rawStockByName()[sel.value];
  if(!g){hint.textContent='';if(qtyField)qtyField.removeAttribute('max');return}
  hint.textContent=`Tersedia total ${kg(g.totalQty)} dari ${g.lots.length} lot — dipakai otomatis dari stok paling lama masuk`;
  if(qtyField)qtyField.setAttribute('max',g.totalQty);
}
/* ---- Hint total stok tersedia untuk produk terpilih (gabungan semua batch) + tombol Jual Semua Sisa ---- */
function updateSalesAvailHint(){
  let sel=$('#salesBatch'),hint=$('#salesAvailHint'),qtyField=$('#salesQtyField');
  if(!sel||!hint)return;
  let g=finishedStockByProduct()[sel.value];
  if(!g){hint.textContent='';if(qtyField)qtyField.removeAttribute('max');return}
  hint.textContent=`Sisa total ${kg(g.totalQty)} dari ${g.batches.length} batch`;
  if(qtyField)qtyField.setAttribute('max',g.totalQty);
}
document.getElementById('salesBatch').addEventListener('change',updateSalesAvailHint);
document.getElementById('sellAllBtn').addEventListener('click',()=>{
  let g=finishedStockByProduct()[$('#salesBatch').value];
  if(g&&$('#salesQtyField'))$('#salesQtyField').value=(Math.round(g.totalQty*100)/100);
});
/* ---- Preview rendemen real-time saat isi form, sebelum disimpan ---- */
function updateYieldPreview(){
  let out=$('#batchYieldPreview'),inQ=+($('#inputQtyField')?.value||0),outQ=+($('#outputQtyField')?.value||0);
  if(!out)return;
  if(!inQ||!outQ){out.innerHTML='';return}
  let pct=outQ/inQ*100,lossQ=inQ-outQ,cls=pct>=27?'good':(pct>=18?'warn':'bad');
  out.innerHTML=`<div class="yield-preview-box ${cls}"><span>Rendemen batch ini</span><b>${pct.toFixed(1)}%</b><small>Susut ${kg(Math.max(0,lossQ))}</small></div>`;
}
['inputQtyField','outputQtyField'].forEach(id=>{let el=document.getElementById(id);if(el)el.addEventListener('input',updateYieldPreview)});

/* ---- Batch production form ---- */
$('#batchForm').onsubmit=async e=>{
  e.preventDefault();if(!requireAdmin())return;
  let x=Object.fromEntries(new FormData(e.target)),g=rawStockByName()[x.rawKey],inputQty=+x.inputQty;
  if(!g||inputQty<=0)return toast('Pilih bahan baku yang valid.');
  if(inputQty>g.totalQty+0.0001)return toast('Total stok bahan baku tidak mencukupi.');
  if(+x.outputQty<=0)return toast('Hasil produksi harus lebih dari 0.');
  /* Konsumsi otomatis dari lot paling lama dulu (FIFO), sambil hitung biaya bahan/transport/lain secara presisi walau lintas lot */
  let remaining=inputQty,materialCost=0,transportCost=0,otherCost=0,consumed=[];
  for(const lot of g.lots){
    if(remaining<=0.0001)break;
    let take=Math.min(remaining,lot.qty),basis=(+lot.originalQty||+lot.qty||1);
    materialCost+=take*(+lot.price||0);
    transportCost+=take*((+lot.transport||0)/basis);
    otherCost+=take*((+lot.other||0)/basis);
    consumed.push({id:lot.id,take,newQty:lot.qty-take});
    remaining-=take;
  }
  let total=materialCost+transportCost+otherCost+(+x.labor||0)+(+x.energy||0)+(+x.other||0),loss=inputQty-+x.outputQty,n=S.batches.length+1,primary=consumed[0];
  const basePayload={code:`BCH-${x.date.slice(0,4)}-${String(n).padStart(3,'0')}`,date:x.date,raw_id:primary?primary.id:null,raw_name:g.name,product_name:x.productName||g.name,input:inputQty,output:+x.outputQty,loss,loss_pct:loss/inputQty*100,total_hpp:total,hpp_kg:total/+x.outputQty,labor:+x.labor||0,energy:+x.energy||0,other:+x.other||0,note:x.note||null};
  const extraFields={raw_material_cost:materialCost,raw_transport_cost:transportCost,raw_other_cost:otherCost,lot_count:consumed.length,raw_allocations:consumed.map(c=>({raw_id:c.id,qty:c.take}))};
  let {data,error}=await sb.from('batches').insert({...basePayload,...extraFields}).select().single();
  if(error&&/column|schema cache/i.test(error.message)){
    /* Kolom baru belum ada di database (migrasi belum dijalankan) — simpan tanpa rincian per-lot, tetap akurat untuk total_hpp */
    ({data,error}=await sb.from('batches').insert(basePayload).select().single());
  }
  if(error)return toast('Gagal simpan batch: '+error.message);
  const {error:e2}=await Promise.all(consumed.map(c=>sb.from('raw_materials').update({qty:c.newQty}).eq('id',c.id)))
    .then(results=>({error:results.find(r=>r.error)?.error}));
  if(e2)toast('Batch tersimpan, tapi sebagian update stok bahan gagal: '+e2.message);
  consumed.forEach(c=>{let r=S.raw.find(z=>z.id===c.id);if(r)r.qty=c.newQty});
  S.batches.push(mapBatch(data));render();e.target.reset();e.target.date.value=today;
  updateRawAvailHint();updateYieldPreview();
  toast('Batch produksi berhasil dibuat.');
};

/* ---- Sales form ---- */
$('#salesForm').onsubmit=async e=>{
  e.preventDefault();if(!requireAdmin())return;
  let x=Object.fromEntries(new FormData(e.target)),g=finishedStockByProduct()[x.productKey],qty=+x.qty;
  if(!g||qty<=0)return toast('Pilih produk yang valid.');
  if(qty>g.totalQty+0.0001)return toast('Total stok produk tidak mencukupi.');

  let status = x.status || 'Lunas';
  if (status !== 'Lunas' && status !== 'Piutang') {
    status = 'Lunas';
  }

  const year = x.date.slice(0,4);
  const seq = S.sales.filter(s=>s.invoice&&s.invoice.startsWith(`INV-${year}-`)).length + 1;
  const invoice_no = `INV-${year}-${String(seq).padStart(4,'0')}`;

  /* Alokasi otomatis ke batch-batch produk ini, dari yang paling lama dulu (FIFO) */
  let remaining=qty,rows=[];
  for(const b of g.batches){
    if(remaining<=0.0001)break;
    let avail=b.output-sold(b.id);if(avail<=0.0001)continue;
    let take=Math.min(remaining,avail);
    rows.push({invoice_no,date:x.date,batch_id:b.id,customer_name:x.customer||'Umum',qty:take,price:+x.price,total:take*+x.price,status});
    remaining-=take;
  }
  if(!rows.length)return toast('Stok produk tidak mencukupi.');

  const {data,error}=await sb.from('sales').insert(rows).select();
  if(error)return toast('Gagal simpan penjualan: '+error.message);
  data.forEach(row=>S.sales.push(mapSale(row)));
  render();e.target.reset();e.target.date.value=today;
  updateSalesAvailHint();
  toast(rows.length>1?`Penjualan berhasil dicatat (dialokasikan ke ${rows.length} batch).`:'Penjualan berhasil dicatat.');
};

/* ---- Expenses form ---- */
$('#expenseForm').onsubmit=async e=>{
  e.preventDefault();if(!requireAdmin())return;
  let x=Object.fromEntries(new FormData(e.target));
  const payload={date:x.date,cat:x.cat,desc:x.desc,amount:+x.amount};
  const {data,error}=await sb.from('expenses').insert(payload).select().single();
  if(error)return toast('Gagal simpan pengeluaran: '+error.message);
  S.expenses.push(mapExpense(data));render();e.target.reset();e.target.date.value=today;
  toast('Pengeluaran berhasil dicatat.');
};

/* ---- Debts form ---- */
$('#debtForm').onsubmit=async e=>{
  e.preventDefault();if(!requireAdmin())return;
  let x=Object.fromEntries(new FormData(e.target));
  if(+x.amount<=0)return toast('Jumlah hutang harus lebih dari 0.');
  const payload={date:x.date,creditor:x.creditor,desc:x.desc||null,amount:+x.amount,due_date:x.dueDate||null,paid_amount:0};
  const {data,error}=await sb.from('debts').insert(payload).select().single();
  if(error)return toast('Gagal simpan hutang: '+error.message);
  S.debts.push(mapDebt(data));render();e.target.reset();e.target.date.value=today;
  toast('Hutang berhasil dicatat.');
};
async function payDebt(id){
  if(!requireAdmin())return;
  const d=S.debts.find(x=>String(x.id)===String(id));
  if(!d)return toast('Data tidak ditemukan!');
  const sisa=debtRemaining(d);
  const input=await promptDialog(`Bayar hutang ke ${d.creditor}\nSisa: ${rp(sisa)}`,sisa,'Bayar Hutang');
  if(input===null)return;
  const jumlah=+input;
  if(!jumlah||jumlah<=0)return toast('Jumlah pembayaran tidak valid.');
  if(jumlah>sisa)return toast('Jumlah pembayaran melebihi sisa hutang.');
  const newPaid=d.paidAmount+jumlah;
  const {error}=await sb.from('debts').update({paid_amount:newPaid}).eq('id',id);
  if(error)return toast('Gagal simpan pembayaran: '+error.message);
  d.paidAmount=newPaid;render();
  toast('✅ Pembayaran berhasil dicatat.'+(newPaid>=d.amount?' Hutang lunas!':''));
}
async function deleteDebt(id){
  if(!requireAdmin())return;
  const d=S.debts.find(x=>String(x.id)===String(id));
  if(!d)return toast('Data tidak ditemukan!');
  if(!await confirmDialog(`Hapus hutang?\n\nKreditur: ${d.creditor}\nJumlah: ${rp(d.amount)}\nTerbayar: ${rp(d.paidAmount)}\n\nData akan dihapus permanen!`))return;
  const {error}=await sb.from('debts').delete().eq('id',id);
  if(error)return toast('Gagal hapus: '+error.message);
  S.debts=S.debts.filter(x=>String(x.id)!==String(id));render();
  toast('✅ Hutang berhasil dihapus!');
}

/* ---- Backup / Reset ---- */
$('#backup').onclick=()=>{let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(S,null,2)],{type:'application/json'}));a.download='inzaki-group-backup.json';a.click()};
$('#reset').onclick=async()=>{
  if(!requireAdmin())return;
  if(!await confirmDialog('Hapus SEMUA data dari server untuk semua orang? Tindakan ini tidak bisa dibatalkan.'))return;
  const {error:e1}=await sb.from('sales').delete().gte('id',0);
  const {error:e2}=await sb.from('batches').delete().gte('id',0);
  const {error:e3}=await sb.from('raw_materials').delete().gte('id',0);
  const {error:e4}=await sb.from('expenses').delete().gte('id',0);
  const {error:e5}=await sb.from('debts').delete().gte('id',0);
  if(e1||e2||e3||e4||e5){toast('Gagal menghapus sebagian data: '+(e1||e2||e3||e4||e5).message);}
  await loadAll();render();
};
document.addEventListener('change',e=>{if(e.target&&e.target.id==='chartYear')drawCharts()});

/* ---- Simulasi rendemen: "kalau rendemen naik X%, berapa tambahan laba?" ---- */
function fillBiSimBatch(){
  let el=$('#biSimBatch');if(!el)return;
  let cur=el.value;
  el.innerHTML=PB().length?PB().slice().reverse().map(b=>`<option value="${b.id}">${esc(b.code)} — ${esc(b.productName)} (rendemen ${yieldPct(b).toFixed(1)}%)</option>`).join(''):'<option value="">Belum ada batch</option>';
  if(cur&&PB().some(b=>b.id==cur))el.value=cur;
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


/* ================= Tambah stok barang jadi (pembelian langsung) ================= */
function buyPreview(){
  const f=$('#buyForm');if(!f)return;
  const q=+f.qty.value||0,p=+f.price.value||0,t=+f.transport.value||0,o=+f.other.value||0,total=q*p+t+o;
  $('#buyTotal').textContent=rp(total);
  $('#buyHpp').textContent=q>0?rp(total/q)+' /kg':'-';
}
function fillBuyProducts(){
  const dl=$('#buyProducts');if(!dl)return;
  dl.innerHTML=[...new Set(S.batches.map(b=>(b.productName||'').trim()).filter(Boolean))].sort().map(p=>`<option value="${esc(p)}">`).join('');
}
async function deleteBuy(id){
  if(!requireAdmin())return;
  const b=S.batches.find(x=>String(x.id)===String(id));if(!b)return toast('Data tidak ditemukan!');
  const related=S.sales.filter(x=>String(x.batchId)===String(b.id));
  const msg=related.length?`Pembelian ${b.code} (${b.productName}, ${kg(b.output)}) sudah memiliki ${related.length} penjualan.\nMenghapus akan ikut menghapus penjualan terkait!\n\nLanjutkan?`:`Hapus pembelian ${b.code}?\n\nProduk: ${b.productName}\nQty: ${kg(b.output)}\n\nStok barang jadi akan berkurang.`;
  if(!await confirmDialog(msg))return;
  for(const s of related){const {error}=await sb.from('sales').delete().eq('id',s.id);if(error)return toast('Gagal hapus penjualan: '+error.message)}
  const {error}=await sb.from('batches').delete().eq('id',b.id);
  if(error)return toast('Gagal hapus: '+error.message);
  S.sales=S.sales.filter(x=>String(x.batchId)!==String(b.id));
  S.batches=S.batches.filter(x=>String(x.id)!==String(b.id));
  render();toast('✅ Pembelian barang jadi dihapus.');
}
(function(){
  const f=$('#buyForm');if(!f)return;
  ['qty','price','transport','other'].forEach(n=>f.elements[n].addEventListener('input',buyPreview));
  f.elements.date.value=today;buyPreview();
  f.onsubmit=async e=>{
    e.preventDefault();if(!requireAdmin())return;
    const x=Object.fromEntries(new FormData(f)),qty=+x.qty,price=+x.price||0,transport=+x.transport||0,other=+x.other||0,name=(x.productName||'').trim();
    if(!name)return toast('Nama produk wajib diisi.');
    if(!(qty>0))return toast('Qty harus lebih dari 0.');
    const total=qty*price+transport+other,year=String(x.date||today).slice(0,4);
    let n=S.batches.filter(isBuy).length+1,code;
    do{code=`BLI-${year}-${String(n).padStart(3,'0')}`;n++}while(S.batches.some(b=>b.code===code));
    const note=[x.supplier?('Pemasok: '+x.supplier.trim()):'',(x.note||'').trim()].filter(Boolean).join(' · ')||null;
    const base={code,date:x.date||today,raw_id:null,raw_name:'Pembelian Langsung',product_name:name,input:qty,output:qty,loss:0,loss_pct:0,total_hpp:total,hpp_kg:total/qty,labor:0,energy:0,other:0,note};
    const extra={raw_material_cost:qty*price,raw_transport_cost:transport,raw_other_cost:other,lot_count:0,raw_allocations:null};
    const btn=f.querySelector('button.primary');btn.disabled=true;
    try{
      let {data,error}=await sb.from('batches').insert({...base,...extra}).select().single();
      if(error&&/column|schema cache/i.test(error.message))({data,error}=await sb.from('batches').insert(base).select().single());
      if(error)return toast('Gagal simpan: '+error.message);
      S.batches.push(mapBatch(data));render();
      f.reset();f.elements.date.value=today;buyPreview();
      toast(`✅ Stok ${name} bertambah ${kg(qty)} (pembelian langsung).`);
    }finally{btn.disabled=false}
  };
})();
/* ---- Statistik per lini & hasil dari kelapa (dashboard) — filter: Semua / Terbaru / Bulan ini / Per tanggal, tampilan: Ringkasan / Riwayat per tanggal ---- */
var dsState;
function dsGet(){return dsState||(dsState={mode:'all',view:'summary',date:''})}
const dsD=d=>String(d||'').slice(0,10);
function dsLatest(){let m='';PB().forEach(b=>{const d=dsD(b.date);if(d>m)m=d});return m}
function dsPeriod(){
  const ds=dsGet();
  if(ds.mode==='latest'){const d=dsLatest();return{test:x=>!!d&&dsD(x)===d,label:d?'Produksi terbaru: '+fmtDate(d):'Belum ada batch'}}
  if(ds.mode==='month')return{test:x=>thisMonth(x),label:'Bulan ini'};
  if(ds.mode==='date'){const d=ds.date;return{test:x=>!!d&&dsD(x)===d,label:d?'Tanggal: '+fmtDate(d):'Pilih tanggal'}}
  return{test:()=>true,label:'Seluruh data'};
}
function dsBar(label){
  const ds=dsGet(),chips=(kind,list,cur,attr)=>`<div class="chips" data-ds="${kind}">${list.map(([k,t])=>`<button type="button" data-${attr}="${k}" class="${cur===k?'on':''}">${t}</button>`).join('')}</div>`;
  return `<div class="ds-bar">${chips('mode',[['all','Semua'],['latest','Terbaru'],['month','Bulan ini'],['date','Per tanggal']],ds.mode,'m')}${ds.mode==='date'?`<input type="date" class="ds-date" value="${esc(ds.date)}">`:''}${chips('view',[['summary','Ringkasan'],['daily','Riwayat per tanggal']],ds.view,'v')}<small class="ds-info">Menampilkan: ${esc(label)}</small></div>`;
}
document.addEventListener('click',e=>{
  const b=e.target&&e.target.closest?e.target.closest('.ds-bar .chips button'):null;if(!b)return;
  const ds=dsGet(),kind=b.parentElement.dataset.ds;
  if(kind==='mode'){ds.mode=b.dataset.m;if(ds.mode==='date'&&!ds.date)ds.date=dsLatest()||today}
  else ds.view=b.dataset.v;
  try{renderDashExtra()}catch(err){console.error('Statistik:',err)}
});
document.addEventListener('change',e=>{
  if(e.target&&e.target.classList&&e.target.classList.contains('ds-date')){const ds=dsGet();ds.date=e.target.value;ds.mode='date';try{renderDashExtra()}catch(err){console.error('Statistik:',err)}}
});
function renderDashExtra(){
  if(!$('#lineTable'))return;
  const ds=dsGet(),P=dsPeriod(),daily=ds.view==='daily';
  const isB=n=>/batok|tempurung/i.test(n||''),isK=n=>/kelapa/i.test(n||'')&&!isB(n),f1=v=>v.toFixed(1).replace('.',','),sm=(arr,k)=>arr.reduce((s,x)=>s+(+x[k]||0),0);
  const bar=dsBar(P.label);
  ['dsBarKelapa','dsBarLine'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML=bar});
  const bs=PB().filter(b=>P.test(b.date));

  /* ---- Statistik per lini ---- */
  const groupLines=arr=>{const L={};arr.forEach(b=>{const k=(b.rawName||'?')+'→'+(b.productName||'?');(L[k]=L[k]||{raw:b.rawName,prod:b.productName,b:[]}).b.push(b)});return Object.values(L)};
  const lineRow=(l,dateCell)=>{
    const inp=sm(l.b,'input'),out=sm(l.b,'output'),loss=inp-out,hpp=sm(l.b,'totalHpp'),avg=l.b.reduce((s,b)=>s+(b.input?b.output/b.input*100:0),0)/l.b.length;
    return `<tr>${dateCell?`<td data-label="Tanggal"><b>${dateCell}</b></td>`:''}<td data-label="Lini"><b>${esc(l.raw)} → ${esc(l.prod)}</b></td><td data-label="Batch">${l.b.length}</td><td data-label="Bahan masuk">${kg(inp)}</td><td data-label="Hasil">${kg(out)}</td><td data-label="Susut">${kg(loss)} (${f1(inp?loss/inp*100:0)}%)</td><td data-label="Rata² rendemen"><b>${f1(avg)}%</b></td><td data-label="Rendemen total">${f1(inp?out/inp*100:0)}%</td><td data-label="HPP/kg">${rp(out?hpp/out:0)}</td></tr>`};
  const cols=['Lini','Batch','Bahan masuk','Hasil','Susut','Rata² rendemen','Rendemen total','HPP/kg'];
  if(daily)cols.unshift('Tanggal');
  const head=$('#lineHead');if(head)head.innerHTML=cols.map(c=>`<th>${c}</th>`).join('');
  let lineHtml;
  if(!bs.length)lineHtml=`<tr><td colspan="${cols.length}" style="text-align:center;color:#929a93">Tidak ada batch produksi pada periode ini</td></tr>`;
  else if(daily){
    const dates=[...new Set(bs.map(b=>dsD(b.date)))].sort().reverse();
    lineHtml=dates.map(d=>groupLines(bs.filter(b=>dsD(b.date)===d)).map(l=>lineRow(l,fmtDate(d))).join('')).join('');
  }else lineHtml=groupLines(bs).map(l=>lineRow(l)).join('');
  $('#lineTable').innerHTML=lineHtml;

  /* ---- Hasil dari kelapa ---- */
  const el=$('#kelapaYield');if(!el)return;
  const kb=bs.filter(b=>isK(b.rawName)),bb=bs.filter(b=>isB(b.rawName));
  const batokRaw=S.raw.filter(r=>isB(r.name)&&P.test(r.date)),rawQty=r=>+r.originalQty||+r.qty||0;
  if(daily){
    const dates=[...new Set([...kb,...bb].map(b=>dsD(b.date)).concat(batokRaw.map(r=>dsD(r.date))))].filter(Boolean).sort().reverse();
    if(!dates.length){el.innerHTML='<p class="hint">Tidak ada data kelapa pada periode ini.</p>';return}
    const rows=dates.map(d=>{
      const k=kb.filter(b=>dsD(b.date)===d),o=bb.filter(b=>dsD(b.date)===d),pk=sm(k,'input'),kp=sm(k,'output'),bt=batokRaw.filter(r=>dsD(r.date)===d).reduce((s,r)=>s+rawQty(r),0),ar=sm(o,'output');
      const kpp=pk?kp/pk*100:0,btp=pk?bt/pk*100:0;
      return `<tr><td data-label="Tanggal"><b>${fmtDate(d)}</b></td><td data-label="Kelapa diproses">${kg(pk)}</td><td data-label="Kopra">${kg(kp)}</td><td data-label="Kopra %">${pk?f1(kpp)+'%':'—'}</td><td data-label="Batok kelapa">${kg(bt)}</td><td data-label="Batok %">${pk?f1(btp)+'%':'—'}</td><td data-label="Arang dari batok">${kg(ar)}</td><td data-label="Air &amp; susut">${pk?f1(Math.max(0,100-kpp-btp))+'%':'—'}</td></tr>`}).join('');
    el.innerHTML=`<table><thead><tr><th>Tanggal</th><th>Kelapa diproses</th><th>Kopra</th><th>Kopra %</th><th>Batok kelapa</th><th>Batok %</th><th>Arang dari batok</th><th>Air &amp; susut</th></tr></thead><tbody>${rows}</tbody></table><p class="hint">Persentase dihitung terhadap kelapa yang diproses pada tanggal tersebut. Batok = yang dicatat di menu Bahan Baku pada tanggal itu.</p>`;
    return;
  }
  const all=ds.mode==='all',procK=sm(kb,'input'),kopra=sm(kb,'output'),procB=sm(bb,'input'),arang=sm(bb,'output');
  let dibeli,batok,labelK,subK;
  if(all){
    const stokK=S.raw.filter(r=>isK(r.name)).reduce((s,r)=>s+r.qty,0),stokB=S.raw.filter(r=>isB(r.name)).reduce((s,r)=>s+r.qty,0);
    dibeli=stokK+procK;batok=stokB+procB;labelK='Kelapa dibeli';subK=`${kg(procK)} sudah diproses · ${kg(stokK)} masih stok`;
  }else{dibeli=procK;batok=batokRaw.reduce((s,r)=>s+rawQty(r),0);labelK='Kelapa diproses';subK=P.label}
  if(all?!dibeli:(!procK&&!batok&&!arang)){el.innerHTML=all?'<p class="hint">Belum ada data kelapa. Catat pembelian kelapa di menu Bahan Baku dan hasil produksinya di menu Batch.</p>':'<p class="hint">Tidak ada data kelapa pada periode ini.</p>';return}
  const base=procK||(all?dibeli:0),kp=base?kopra/base*100:0,bp=base?batok/base*100:0,lain=Math.max(0,100-kp-bp);
  el.innerHTML=`<div class="cards yield-cards"><div><span>${labelK}</span><b>${kg(dibeli)}</b><small>${subK}</small></div><div class="accent-green"><span>Kopra dihasilkan</span><b>${kg(kopra)}</b><small>${f1(kp)}% dari kelapa diproses</small></div><div class="accent-amber"><span>Batok kelapa dihasilkan</span><b>${kg(batok)}</b><small>${f1(bp)}% dari kelapa diproses</small></div><div><span>Arang dari batok</span><b>${kg(arang)}</b><small>${procB?f1(arang/procB*100)+'% dari batok diproses':'Batok belum diproses'}</small></div></div>
  <div class="ystack"><i style="width:${kp}%;background:#22C55E"></i><i style="width:${bp}%;background:#F5A524"></i><i style="width:${lain}%;background:#3A423C"></i></div>
  <div class="ylegend"><span><i style="background:#22C55E"></i>Kopra ${f1(kp)}%</span><span><i style="background:#F5A524"></i>Batok ${f1(bp)}%</span><span><i style="background:#3A423C"></i>Air &amp; susut ${f1(lain)}%</span></div>
  <p class="hint">Rata-rata setiap <b>100 kg kelapa</b> menghasilkan sekitar <b>${f1(kp)} kg kopra</b> dan <b>${f1(bp)} kg batok kelapa</b>. Batok dihitung dari yang tercatat di menu Bahan Baku.</p>`;
}
/* Hook render: statistik per lini (dashboard). Modul Keuangan mandiri ada di finance.js */
const _render=render;render=function(){_render();try{renderDashExtra()}catch(err){console.error('Statistik:',err)}try{fillBuyProducts()}catch(err){}};
$$('nav button').forEach(x=>x.onclick=()=>go(x.dataset.page));
