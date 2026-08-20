/* ================= INZAKI GROUP — Charcoal Business Portal (Online/Supabase) ================= */
const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s),today=new Date().toISOString().slice(0,10);
$$('input[type=date]').forEach(x=>x.value=today);

let S={raw:[],batches:[],sales:[],expenses:[]};
let isAdmin=false;
const ADMIN_PAGES=['raw','batch','sales','expenses'];

/* ---- Supabase client ---- */
const configOk = typeof SUPABASE_URL!=='undefined' && SUPABASE_URL && !SUPABASE_URL.includes('YOUR-PROJECT') && typeof SUPABASE_ANON_KEY!=='undefined' && SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes('YOUR-ANON');
const sb = (configOk && window.supabase) ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
if(!configOk){$('#configBanner').classList.add('show')}

/* ---- Helpers (formatting) ---- */
const rp=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(+n||0),kg=n=>(+n||0).toLocaleString('id-ID',{maximumFractionDigits:2})+' kg',esc=x=>String(x??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])),landed=r=>(+r.price||0)+((+r.transport||0)+(+r.other||0))/(+r.originalQty||+r.qty||1),day=d=>new Date(d+'T00:00:00'),last7=d=>{let s=new Date();s.setHours(0,0,0,0);s.setDate(s.getDate()-6);return day(d)>=s},thisMonth=d=>{let n=new Date(),x=day(d);return x.getFullYear()==n.getFullYear()&&x.getMonth()==n.getMonth()};
const signed=n=>`<span class="${(+n||0)<0?'neg':'pos'}">${rp(n)}</span>`;
function B(id){return S.batches.find(x=>x.id==id)}
function sold(id){return S.sales.filter(x=>x.batchId==id).reduce((a,x)=>a+x.qty,0)}
function empty(n){return `<tr><td colspan="${n}" style="text-align:center;color:#929a93">Belum ada data</td></tr>`}
function requireAdmin(){if(!isAdmin){alert('Silakan login sebagai admin terlebih dahulu.');return false}return true}

/* ---- DB <-> JS field mapping (snake_case <-> camelCase) ---- */
const mapRaw=r=>({id:r.id,date:r.date,name:r.name,qty:+r.qty,originalQty:+r.original_qty,price:+r.price,transport:+r.transport,other:+r.other,supplier:r.supplier});
const mapBatch=b=>({id:b.id,code:b.code,date:b.date,rawId:b.raw_id,rawName:b.raw_name,input:+b.input,output:+b.output,loss:+b.loss,lossPct:+b.loss_pct,totalHpp:+b.total_hpp,hppkg:+b.hpp_kg,labor:+b.labor,energy:+b.energy,other:+b.other,note:b.note});
const mapSale=x=>({id:x.id,date:x.date,batchId:x.batch_id,customer:x.customer_name||x.customer,qty:+x.qty,price:+x.price,total:+x.total,status:x.status});
const mapExpense=x=>({id:x.id,date:x.date,cat:x.cat,desc:x.desc,amount:+x.amount});

/* ---- Load all data from Supabase ---- */
async function loadAll(){
  if(!sb)return;
  const [{data:raw,error:e1},{data:batches,error:e2},{data:sales,error:e3},{data:expenses,error:e4}]=await Promise.all([
    sb.from('raw_materials').select('*').order('id'),
    sb.from('batches').select('*').order('id'),
    sb.from('sales').select('*').order('id'),
    sb.from('expenses').select('*').order('id')
  ]);
  if(e1||e2||e3||e4){console.error(e1||e2||e3||e4);return}
  S.raw=(raw||[]).map(mapRaw);S.batches=(batches||[]).map(mapBatch);S.sales=(sales||[]).map(mapSale);S.expenses=(expenses||[]).map(mapExpense);
}

/* ---- Realtime sync across devices ---- */
let refetchTimer=null;
function scheduleRefetch(){clearTimeout(refetchTimer);refetchTimer=setTimeout(async()=>{await loadAll();render()},300)}
function subscribeRealtime(){
  if(!sb)return;
  sb.channel('inzaki-live')
    .on('postgres_changes',{event:'*',schema:'public',table:'raw_materials'},scheduleRefetch)
    .on('postgres_changes',{event:'*',schema:'public',table:'batches'},scheduleRefetch)
    .on('postgres_changes',{event:'*',schema:'public',table:'sales'},scheduleRefetch)
    .on('postgres_changes',{event:'*',schema:'public',table:'expenses'},scheduleRefetch)
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
  $('#authStatus').textContent=isAdmin?('🟢 Admin — '+session.user.email):'🔒 Mode Publik — lihat saja';
}
async function initAuth(){
  if(!sb)return;
  const {data:{session}}=await sb.auth.getSession();
  applyAuthState(session);
  sb.auth.onAuthStateChange((_event,session)=>applyAuthState(session));
}

/* ---- Charts ---- */
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

/* ---- Render ---- */
function render(){
let rawQty=S.raw.reduce((a,x)=>a+x.qty,0),rawValue=S.raw.reduce((a,x)=>a+x.qty*landed(x),0),out=S.batches.reduce((a,x)=>a+x.output,0),inp=S.batches.reduce((a,x)=>a+x.input,0),loss=inp-out;
let finishedQty=out-S.sales.reduce((a,x)=>a+x.qty,0),finishedValue=S.batches.reduce((a,b)=>a+Math.max(0,b.output-sold(b.id))*b.hppkg,0);
let ws=S.sales.filter(x=>last7(x.date)),ms=S.sales.filter(x=>thisMonth(x.date)),we=S.expenses.filter(x=>last7(x.date)).reduce((a,x)=>a+x.amount,0),me=S.expenses.filter(x=>thisMonth(x.date)).reduce((a,x)=>a+x.amount,0);
let wc=ws.reduce((a,x)=>{let b=B(x.batchId);return a+(b?x.qty*b.hppkg:0)},0),mc=ms.reduce((a,x)=>{let b=B(x.batchId);return a+(b?x.qty*b.hppkg:0)},0);
$('#dRawQty').textContent=kg(rawQty);$('#dRawValue').textContent=rp(rawValue);$('#dFinishedQty').textContent=kg(finishedQty);$('#dFinishedValue').textContent=rp(finishedValue);
$('#dProfitWeek').innerHTML=signed(ws.reduce((a,x)=>a+x.total,0)-wc-we);$('#dProfitMonth').innerHTML=signed(ms.reduce((a,x)=>a+x.total,0)-mc-me);$('#dExpenseWeek').textContent=rp(we);$('#dExpenseMonth').textContent=rp(me);
$('#dInput').textContent=kg(inp);$('#dOutput').textContent=kg(out);$('#dLoss').textContent=kg(loss);$('#dLossPct').textContent=(inp?loss/inp*100:0).toFixed(1)+'%';
$('#rawTable').innerHTML=S.raw.map(r=>`<tr><td>${esc(r.name)}</td><td>${kg(r.qty)}</td><td>${rp(r.price)}</td><td>${rp(r.transport)}</td><td>${rp(r.other)}</td><td>${rp(landed(r))}</td><td>${rp(r.qty*landed(r))}</td><td>${esc(r.supplier||'-')}</td><td><button onclick="deleteRaw('${r.id}')" style="background:#dc3545;color:#fff;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:12px;">🗑️ Hapus</button></td></tr>`).join('')||empty(9);
$('#rawSelect').innerHTML=S.raw.filter(r=>r.qty>0).map(r=>`<option value="${r.id}">${esc(r.name)} — ${kg(r.qty)} @ ${rp(landed(r))}/kg</option>`).join('');
$('#batchTable').innerHTML=S.batches.slice().reverse().map(b=>`<tr><td>${b.code}</td><td>${b.date}</td><td>${esc(b.rawName)}</td><td>${kg(b.input)}</td><td>${kg(b.output)}</td><td>${kg(b.loss)} (${b.lossPct.toFixed(1)}%)</td><td>${rp(b.totalHpp)}</td><td>${rp(b.hppkg)}</td><td><button onclick="deleteBatch('${b.id}')" style="background:#dc3545;color:#fff;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:12px;">🗑️ Hapus</button></td></tr>`).join('')||empty(9);
$('#salesBatch').innerHTML=S.batches.filter(b=>b.output-sold(b.id)>0).map(b=>`<option value="${b.id}">${b.code} — sisa ${kg(b.output-sold(b.id))} — HPP ${rp(b.hppkg)}/kg</option>`).join('');
let tq=0,tv=0;$('#finishedTable').innerHTML=S.batches.map(b=>{let q=b.output-sold(b.id);tq+=q;tv+=q*b.hppkg;return `<tr><td>${b.code}</td><td>${esc(b.rawName)}</td><td>${kg(b.output)}</td><td>${kg(sold(b.id))}</td><td>${kg(q)}</td><td>${rp(b.hppkg)}</td></tr>`}).join('')||empty(6);
$('#fQty').textContent=kg(tq);$('#fValue').textContent=rp(tv);$('#fAvg').textContent=rp(tq?tv/tq:0);
$('#salesTable').innerHTML=S.sales.slice().reverse().map(x=>{let b=B(x.batchId),c=x.qty*(b?b.hppkg:0);return `<tr><td>${x.date}</td><td>${b?.code||'-'}</td><td>${esc(x.customer||'')}</td><td>${kg(x.qty)}</td><td>${rp(x.total)}</td><td>${rp(c)}</td><td>${signed(x.total-c)}</td><td><button onclick="deleteSale('${x.id}')" style="background:#dc3545;color:#fff;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:12px;">🗑️ Hapus</button></td></tr>`}).join('')||empty(8);
$('#expenseTable').innerHTML=S.expenses.slice().reverse().map(x=>`<tr><td>${x.date}</td><td>${x.cat}</td><td>${esc(x.desc)}</td><td>${rp(x.amount)}</td><td><button onclick="deleteExpense('${x.id}')" style="background:#dc3545;color:#fff;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:12px;">🗑️ Hapus</button></td></tr>`).join('')||empty(5);
$('#profitTable').innerHTML=S.batches.map(b=>{let ss=S.sales.filter(x=>x.batchId==b.id),om=ss.reduce((a,x)=>a+x.total,0),q=ss.reduce((a,x)=>a+x.qty,0),hc=q*b.hppkg,l=om-hc;return `<tr><td>${b.code}</td><td>${kg(b.output)}</td><td>${kg(q)}</td><td>${rp(om)}</td><td>${rp(hc)}</td><td>${signed(l)}</td><td>${om?(l/om*100).toFixed(1):0}%</td></tr>`}).join('')||empty(7);
let totalSales=S.sales.reduce((a,x)=>a+x.total,0),totalCogs=S.sales.reduce((a,x)=>{let b=B(x.batchId);return a+(b?x.qty*b.hppkg:0)},0),totalExp=S.expenses.reduce((a,x)=>a+x.amount,0);
$('#report').innerHTML=`<div><span>Total omzet</span><strong>${rp(totalSales)}</strong></div><div><span>HPP terjual</span><strong>${rp(totalCogs)}</strong></div><div><span>Laba kotor</span><strong>${signed(totalSales-totalCogs)}</strong></div><div><span>Pengeluaran umum</span><strong>${rp(totalExp)}</strong></div><div><span>Laba bersih</span><strong>${signed(totalSales-totalCogs-totalExp)}</strong></div><div><span>Total batch</span><strong>${S.batches.length}</strong></div>`;
$('#recent').innerHTML=S.batches.slice(-5).reverse().map(b=>`<div style="padding:10px;border-bottom:1px solid #eee"><b>${b.code}</b> · ${esc(b.rawName)}<br><small>${b.date} · ${kg(b.output)} · HPP ${rp(b.hppkg)}/kg · susut ${b.lossPct.toFixed(1)}%</small></div>`).join('')||'Belum ada batch.';
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
function go(p){if(ADMIN_PAGES.includes(p)&&!isAdmin)p='dashboard';$$('.page').forEach(x=>x.classList.toggle('active',x.id===p));$$('nav button').forEach(x=>x.classList.toggle('active',x.dataset.page===p));$('#title').textContent=p==='dashboard'?'Dashboard Global':p==='raw'?'Bahan Baku':p==='batch'?'Produksi Batch':p==='finished'?'Barang Jadi':p==='reports'?'Laba & Laporan':p[0].toUpperCase()+p.slice(1);$('#modal').classList.remove('show')}
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

/* ---- Batch production form ---- */
$('#batchForm').onsubmit=async e=>{
  e.preventDefault();if(!requireAdmin())return;
  let x=Object.fromEntries(new FormData(e.target)),r=S.raw.find(z=>z.id==x.rawId);
  if(!r||+x.inputQty>r.qty)return alert('Stok bahan baku tidak mencukupi.');
  if(+x.outputQty<=0)return alert('Hasil produksi harus lebih dari 0.');
  let material=+x.inputQty*landed(r),total=material+(+x.labor||0)+(+x.energy||0)+(+x.other||0),loss=+x.inputQty-+x.outputQty,n=S.batches.length+1;
  const payload={code:`BCH-${x.date.slice(0,4)}-${String(n).padStart(3,'0')}`,date:x.date,raw_id:r.id,raw_name:r.name,input:+x.inputQty,output:+x.outputQty,loss,loss_pct:loss/+x.inputQty*100,total_hpp:total,hpp_kg:total/+x.outputQty,labor:+x.labor||0,energy:+x.energy||0,other:+x.other||0,note:x.note||null};
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

/* ---- Backup / Reset ---- */
$('#backup').onclick=()=>{let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(S,null,2)],{type:'application/json'}));a.download='inzaki-charcoal-backup.json';a.click()};
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
  if(!sb){render();return}
  await initAuth();
  await loadAll();
  render();
  subscribeRealtime();
})();
