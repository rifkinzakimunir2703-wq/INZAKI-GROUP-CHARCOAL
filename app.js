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
  const results=await Promise.all(tables.map(t=>sb.from(t.table).select('*').order('id')));
  results.forEach((res,i)=>{
    const t=tables[i];
    if(res.error){
      console.error(`Gagal memuat tabel "${t.table}":`,res.error.message);
      return; // tabel ini gagal, tapi tabel lain tetap dimuat & ditampilkan
    }
    S[t.key]=(res.data||[]).map(t.map);
  });
  setSync('live');
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
  const {data:{session}}=await sb.auth.getSession();
  applyAuthState(session);
  sb.auth.onAuthStateChange((_event,session)=>applyAuthState(session));
}

/* ---- Charts ---- */
let financeChart=null,productionChart=null;
const PALETTE={ember:'#22C55E',gold:'#F5A524',red:'#F76E7E',green:'#22C55E',teal:'#2DD4CF',ink:'#F1F4EF',muted:'#8E9A8B',grid:'rgba(255,255,255,.08)'};
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
  <div><span>HPP / kg</span><b>${rp(avgHpp)}</b></div>
  <div><span>Stok Tersisa</span><b>${kg(sisaStok)}</b></div>
  <div><span>Nilai Stok</span><b>${rp(nilaiStok)}</b></div>
  </div></div>`;
}).join(''):'<div class="stock-empty">Belum ada data produksi</div>';
$('#rawTable').innerHTML=S.raw.map(r=>`<tr><td data-label="Bahan">${esc(r.name)}</td><td data-label="Stok">${kg(r.qty)}</td><td data-label="Harga/kg">${rp(r.price)}</td><td data-label="Transport">${rp(r.transport)}</td><td data-label="Biaya lain">${rp(r.other)}</td><td data-label="HPP masuk/kg">${rp(landed(r))}</td><td data-label="Nilai stok">${rp(r.qty*landed(r))}</td><td data-label="Supplier">${esc(r.supplier||'-')}</td><td data-label="Aksi"><button onclick="deleteRaw('${r.id}')" class="btn-delete">${ICON.trash} Hapus</button></td></tr>`).join('')||empty(9);
$('#rawSelect').innerHTML=S.raw.filter(r=>r.qty>0).map(r=>`<option value="${r.id}">${esc(r.name)} — ${kg(r.qty)} @ ${rp(landed(r))}/kg</option>`).join('');
$('#batchTable').innerHTML=S.batches.slice().reverse().map(b=>`<tr><td data-label="Batch">${b.code}</td><td data-label="Tanggal">${b.date}</td><td data-label="Bahan Baku">${esc(b.rawName)}</td><td data-label="Produk Jadi">${esc(b.productName)}</td><td data-label="Input">${kg(b.input)}</td><td data-label="Output">${kg(b.output)}</td><td data-label="Penyusutan">${kg(b.loss)} (${b.lossPct.toFixed(1)}%)</td><td data-label="HPP Batch">${rp(b.totalHpp)}</td><td data-label="HPP/kg">${rp(b.hppkg)}</td><td data-label="Aksi"><button onclick="deleteBatch('${b.id}')" class="btn-delete">${ICON.trash} Hapus</button></td></tr>`).join('')||empty(10);
$('#salesBatch').innerHTML=S.batches.filter(b=>b.output-sold(b.id)>0).map(b=>`<option value="${b.id}">${b.code} — ${esc(b.productName)} — sisa ${kg(b.output-sold(b.id))} — HPP ${rp(b.hppkg)}/kg</option>`).join('');
let tq=0,tv=0;$('#finishedTable').innerHTML=S.batches.map(b=>{let q=b.output-sold(b.id);tq+=q;tv+=q*b.hppkg;return `<tr><td data-label="Batch">${b.code}</td><td data-label="Produk Jadi">${esc(b.productName)}</td><td data-label="Bahan Asal">${esc(b.rawName)}</td><td data-label="Masuk">${kg(b.output)}</td><td data-label="Terjual">${kg(sold(b.id))}</td><td data-label="Sisa">${kg(q)}</td><td data-label="HPP/kg">${rp(b.hppkg)}</td></tr>`}).join('')||empty(7);
$('#fQty').textContent=kg(tq);$('#fValue').textContent=rp(tv);$('#fAvg').textContent=rp(tq?tv/tq:0);
animateNum(['fQty'],tq,kg);animateNum(['fValue'],tv,rp);animateNum(['fAvg'],tq?tv/tq:0,rp);
$('#salesTable').innerHTML=S.sales.slice().reverse().map(x=>{let b=B(x.batchId),c=x.qty*(b?b.hppkg:0);return `<tr><td data-label="Tanggal">${x.date}</td><td data-label="Batch">${b?.code||'-'}</td><td data-label="Pelanggan">${esc(x.customer||'')}</td><td data-label="Qty">${kg(x.qty)}</td><td data-label="Omzet">${rp(x.total)}</td><td data-label="HPP">${rp(c)}</td><td data-label="Laba">${signed(x.total-c)}</td><td data-label="Aksi"><button onclick="deleteSale('${x.id}')" class="btn-delete">${ICON.trash} Hapus</button></td></tr>`}).join('')||empty(8);
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
let prodStatsHtml=Object.values(lineStats).map(s=>{let lp=s.input?s.loss/s.input*100:0,avgHpp=s.output?s.hpp/s.output:0;return `<tr><td data-label="Lini Produksi">${esc(s.raw)} → ${esc(s.product)}</td><td data-label="Jumlah Batch">${s.batches}</td><td data-label="Total Masuk">${kg(s.input)}</td><td data-label="Total Jadi">${kg(s.output)}</td><td data-label="Total Susut">${kg(s.loss)}</td><td data-label="Rata² Susut">${lp.toFixed(1)}%</td><td data-label="Total HPP">${rp(s.hpp)}</td><td data-label="Rata² HPP/kg">${rp(avgHpp)}</td></tr>`}).join('')||empty(8);
setAll(['prodStatsTable','prodStatsTableD'],prodStatsHtml,false);
/* Untung/Rugi per batch — data lengkap untuk evaluasi perusahaan — tampil di halaman Laporan & juga di Dashboard */
let profitHtml=S.batches.slice().reverse().map(b=>{
  let ss=S.sales.filter(x=>x.batchId==b.id),om=ss.reduce((a,x)=>a+x.total,0),q=ss.reduce((a,x)=>a+x.qty,0),hc=q*b.hppkg,l=om-hc,sisa=b.output-q;
  let status=q===0?{t:'Belum Terjual',c:'badge-pending'}:l>0?{t:'Untung',c:'badge-ok'}:l<0?{t:'Rugi',c:'badge-overdue'}:{t:'Impas',c:'badge-pending'};
  return `<tr><td data-label="Batch">${esc(b.code)}</td><td data-label="Tanggal">${b.date}</td><td data-label="Bahan → Produk">${esc(b.rawName)} → ${esc(b.productName)}</td><td data-label="Output">${kg(b.output)}</td><td data-label="Susut">${kg(b.loss)} (${b.lossPct.toFixed(1)}%)</td><td data-label="HPP/kg">${rp(b.hppkg)}</td><td data-label="Terjual">${kg(q)}</td><td data-label="Sisa Stok">${kg(sisa)}</td><td data-label="Omzet">${rp(om)}</td><td data-label="Untung/Rugi">${signed(l)}</td><td data-label="Margin">${om?(l/om*100).toFixed(1):0}%</td><td data-label="Status"><span class="badge ${status.c}">${status.t}</span></td></tr>`;
}).join('')||empty(12);
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
  if(!sb){setSync('offline');render();hideLoading();return}
  await initAuth();
  await loadAll();
  render();
  hideLoading();
  subscribeRealtime();
})();
