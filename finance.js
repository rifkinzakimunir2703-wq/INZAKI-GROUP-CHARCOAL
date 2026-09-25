/* ================= INZAKI GROUP — Modul Keuangan (Kas) — finance.js =================
   Modul mandiri untuk halaman "Keuangan": menggabungkan arus kas otomatis
   (penjualan, pengeluaran, pembelian bahan baku, pembelian barang jadi,
   penerimaan & pembayaran hutang) dengan transaksi kas manual (setor modal,
   tarik tunai/prive, koreksi saldo) yang disimpan di tabel Supabase "finance".
   Dibangun ulang setelah file aslinya hilang — lihat finance.sql untuk skema tabel.
*/

let FS = { tx: [], grp: 'all', per: 'all' };
/* Pengelompokan riwayat keuangan: tiap sumber masuk satu kelompok + warna */
const FGROUPS = [['all','Semua'],['Penjualan','Penjualan'],['Pengeluaran','Pengeluaran'],['Pembelian','Pembelian'],['DP','Uang Muka (DP)'],['Hutang','Hutang'],['Manual','Manual']];
const FCOLOR = { Penjualan:'#22C55E', Pengeluaran:'#F76E7E', Pembelian:'#F5A524', DP:'#2DD4CF', Hutang:'#A78BFA', Manual:'#8E9A8B' };
const fgroup = r => r.source==='Penjualan' ? 'Penjualan' : r.source==='Pengeluaran' ? 'Pengeluaran' : /^Pembelian/.test(r.source) ? 'Pembelian' : r.source==='Uang Muka Supplier' ? 'DP' : /Hutang$/.test(r.source) ? 'Hutang' : 'Manual';
const mapFinance = x => ({ id: x.id, date: x.date, type: x.type, category: x.category, desc: x.desc, amount: +x.amount });

/* ---- Bangun markup halaman Keuangan sekali saja ---- */
function ensureFinanceUI(){
  const sec = document.getElementById('finance');
  if(!sec || sec.dataset.built) return;
  sec.dataset.built = '1';
  sec.innerHTML = `
    ${typeof dpHero==='function'?dpHero('Keuangan &amp; Kas Perusahaan','Saldo kas, arus masuk-keluar, dan uang muka petani — semua terpantau di satu tempat.','Saldo real-time'):''}
    <div class="cards quick-glance" id="financeKpi">
      <div><span>Saldo Kas Saat Ini</span><b id="fkSaldo">Rp0</b></div>
      <div><span>Kas Masuk Bulan Ini</span><b id="fkMasukBulan">Rp0</b></div>
      <div><span>Kas Keluar Bulan Ini</span><b id="fkKeluarBulan">Rp0</b></div>
      <div><span>Transaksi Manual</span><b id="fkManualCount">0</b></div>
    </div>

    <div class="panel">
      <h2>Catat Transaksi Kas</h2>
      <p class="hint">Untuk kas yang tidak berasal dari penjualan/pengeluaran/hutang otomatis — contoh: setor modal, tarik tunai (prive), koreksi saldo.</p>
      <form id="financeForm" class="form">
        <label>Tanggal<input type="date" name="date" required></label>
        <label>Tipe<select name="type"><option value="in">Kas Masuk</option><option value="out">Kas Keluar</option></select></label>
        <label>Kategori<select name="category"><option>Setor Modal</option><option>Tarik Tunai / Prive</option><option>Transfer Bank ke Kas</option><option>Transfer Kas ke Bank</option><option>Koreksi Saldo</option><option>Lainnya</option></select></label>
        <label>Keterangan<input name="desc" placeholder="Contoh: Setor modal awal dari pemilik"></label>
        <label>Jumlah (Rp)<input type="number" name="amount" min="0" required></label>
        <button class="primary full">Simpan Transaksi</button>
      </form>
    </div>

    <div class="panel chart-panel">
      <div class="panel-head"><div><h2>Arus Kas</h2><small>Saldo kas berjalan dari waktu ke waktu</small></div></div>
      <canvas id="kasChart"></canvas>
    </div>

    <div class="panel">
      <div class="panel-head">
        <div><h2>Riwayat Keuangan</h2><small>Penjualan, pengeluaran, pembelian, uang muka (DP), hutang &amp; kas manual — semua di sini</small></div>
        <input type="text" id="searchFinance" class="table-search" placeholder="Cari sumber / keterangan…">
      </div>
      <div class="chips" id="finGroupChips" style="flex-wrap:wrap;margin-bottom:10px"></div>
      <div class="chips" id="finPeriodChips" style="margin-bottom:12px"><button data-p="all" class="on">Semua Waktu</button><button data-p="week">Minggu Ini</button><button data-p="month">Bulan Ini</button></div>
      <div class="cards mini" id="finSummary" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))"></div>
      <table><thead><tr><th>Tanggal</th><th>Sumber</th><th>Keterangan</th><th>Masuk</th><th>Keluar</th><th>Saldo</th><th>AKSI</th></tr></thead><tbody id="financeLedgerTable"></tbody></table>
    </div>
  `;
  $('#financeForm').onsubmit = addFinance;
  $('#searchFinance').oninput = renderFinance;
  $('#financeForm').date.value = today;
  $('#finGroupChips').onclick = e => { const b=e.target.closest('button'); if(b){ FS.grp=b.dataset.g; renderFinance() } };
  $('#finPeriodChips').onclick = e => { const b=e.target.closest('button'); if(b){ FS.per=b.dataset.p; renderFinance() } };
}

/* ---- Muat transaksi kas manual dari Supabase ---- */
async function loadFinance(){
  if(!sb) return;
  const { data, error } = await sb.from('finance').select('*').order('id');
  if(error){ console.error('Gagal memuat tabel finance:', error.message); return }
  FS.tx = (data||[]).map(mapFinance);
}

/* ---- Simpan transaksi kas manual dari form ---- */
async function addFinance(e){
  e.preventDefault(); if(!requireAdmin()) return;
  let x = Object.fromEntries(new FormData(e.target));
  if(+x.amount<=0) return toast('Jumlah harus lebih dari 0.');
  const payload = { date:x.date, type:x.type, category:x.category, desc:x.desc||null, amount:+x.amount };
  const { data, error } = await sb.from('finance').insert(payload).select().single();
  if(error) return toast('Gagal simpan transaksi kas: '+error.message);
  FS.tx.push(mapFinance(data)); renderFinance(); e.target.reset(); e.target.date.value=today;
  toast('Transaksi kas berhasil dicatat.');
}

/* ---- Hapus transaksi kas manual ---- */
async function deleteFinance(id){
  if(!requireAdmin()) return;
  const tx = FS.tx.find(x => String(x.id)===String(id));
  if(!tx) return toast('Data tidak ditemukan!');
  if(!await confirmDialog(`Hapus transaksi kas?\n\nTanggal: ${tx.date}\nKategori: ${tx.category||'-'}\nJumlah: ${rp(tx.amount)}\n\nData akan dihapus permanen!`)) return;
  const { error } = await sb.from('finance').delete().eq('id', id);
  if(error) return toast('Gagal hapus: '+error.message);
  FS.tx = FS.tx.filter(x => String(x.id)!==String(id));
  renderFinance();
}

/* ---- Gabungkan semua sumber arus kas jadi satu buku kas dengan saldo berjalan ---- */
function buildLedger(){
  let rows = [];
  const dpBy = (typeof DP!=='undefined') ? DP.allocByRaw() : {}; // DP yang sudah memotong pembelian bahan baku
  (S.sales||[]).forEach(x => { const lunas = x.status !== 'Piutang'; rows.push({ date:x.date, source:'Penjualan', auto:true, desc:(x.customer?x.customer+' — ':'')+(x.invoice?'#'+x.invoice:'Penjualan produk')+(lunas?'':' (piutang, belum masuk kas)'), in:lunas?(+x.total||0):0, out:0 }) });
  (S.expenses||[]).forEach(x => rows.push({ date:x.date, source:'Pengeluaran', auto:true, desc:(x.cat||'')+(x.desc?': '+x.desc:''), in:0, out:+x.amount||0 }));
  (S.raw||[]).forEach(r => { const dp=dpBy[String(r.id)]||0; rows.push({ date:r.date, source:'Pembelian Bahan Baku', auto:true, desc:(r.name||'')+(r.supplier?' — '+r.supplier:'')+(dp?' (lunas dari DP '+rp(dp)+')':''), in:0, out:Math.max(0,(+r.price||0)*(+r.originalQty||+r.qty||0)+(+r.transport||0)+(+r.other||0)-dp) }) });
  (typeof DP!=='undefined'?DP.list:[]).forEach(d => rows.push({ date:d.date, source:'Uang Muka Supplier', auto:true, desc:'DP ke '+d.farmer+(d.note?' — '+d.note:''), in:0, out:+d.amount||0 }));
  (S.batches||[]).filter(isBuy).forEach(b => rows.push({ date:b.date, source:'Pembelian Barang Jadi', auto:true, desc:(b.code||'')+' — '+(b.productName||''), in:0, out:+b.totalHpp||0 }));
  (S.debts||[]).forEach(d => {
    rows.push({ date:d.date, source:'Penerimaan Hutang', auto:true, desc:'Pinjaman dari '+(d.creditor||'-'), in:+d.amount||0, out:0 });
    if(+d.paidAmount>0) rows.push({ date:d.date, source:'Pembayaran Hutang', auto:true, desc:'Cicilan ke '+(d.creditor||'-')+' (akumulasi)', in:0, out:+d.paidAmount||0 });
  });
  FS.tx.forEach(m => rows.push({ id:m.id, date:m.date, source:m.category||(m.type==='in'?'Kas Masuk Manual':'Kas Keluar Manual'), auto:false, desc:m.desc||'-', in:m.type==='in'?+m.amount:0, out:m.type==='out'?+m.amount:0 }));
  rows.sort((a,b)=> a.date===b.date?0:(a.date<b.date?-1:1));
  let bal=0; rows.forEach(r=>{ bal += r.in-r.out; r.balance=bal });
  return rows;
}

/* ---- Grafik saldo kas berjalan ---- */
let kasChart=null;
function drawKasChart(rows){
  const el=$('#kasChart'); if(!el || typeof Chart==='undefined') return;
  const last=rows.slice(-30);
  if(kasChart) kasChart.destroy();
  kasChart=new Chart(el,{type:'line',data:{labels:last.map(r=>fmtDate(r.date)),datasets:[
    { label:'Saldo Kas', data:last.map(r=>r.balance), tension:.35, borderWidth:2.5, borderColor:'#22C55E', backgroundColor:'rgba(34,197,94,.14)', fill:true, pointRadius:0 }
  ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{maxTicksLimit:6}},y:{ticks:{callback:v=>rp(v)}}}}});
}

/* ---- Render halaman Keuangan ---- */
function renderFinance(){
  if(typeof S==='undefined') return;
  ensureFinanceUI();
  const rows = buildLedger();
  const total = rows.length ? rows[rows.length-1].balance : 0;
  const masukBulan = rows.filter(r=>thisMonth(r.date)).reduce((a,r)=>a+r.in,0);
  const keluarBulan = rows.filter(r=>thisMonth(r.date)).reduce((a,r)=>a+r.out,0);
  animateNum(['fkSaldo'], total, rp);
  animateNum(['fkMasukBulan'], masukBulan, rp);
  animateNum(['fkKeluarBulan'], keluarBulan, rp);
  $('#fkManualCount').textContent = FS.tx.length;
  drawKasChart(rows);

  rows.forEach(r => r.grp = fgroup(r));
  const q=($('#searchFinance')?.value||'').toLowerCase();
  const base = rows.filter(r=> (FS.per==='all' || (FS.per==='week' ? last7(r.date) : thisMonth(r.date))) && (!q || r.source.toLowerCase().includes(q) || (r.desc||'').toLowerCase().includes(q)));
  const filtered = base.filter(r => FS.grp==='all' || r.grp===FS.grp);
  $('#finGroupChips').innerHTML = FGROUPS.map(([k,l]) => `<button data-g="${k}" class="${FS.grp===k?'on':''}">${l} (${k==='all'?base.length:base.filter(r=>r.grp===k).length})</button>`).join('');
  $('#finPeriodChips').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.p===FS.per));
  const sIn=filtered.reduce((a,r)=>a+r.in,0), sOut=filtered.reduce((a,r)=>a+r.out,0);
  $('#finSummary').innerHTML = `<div><span>Total Masuk</span><b class="amt-in">${rp(sIn)}</b></div><div><span>Total Keluar</span><b class="amt-out">${rp(sOut)}</b></div><div><span>Jumlah Transaksi</span><b>${filtered.length}</b></div>`;
  $('#financeLedgerTable').innerHTML = filtered.slice().reverse().map(r=>{ const c=FCOLOR[r.grp]; return `<tr><td data-label="Tanggal">${fmtDate(r.date)}</td><td data-label="Sumber"><span class="badge" style="background:${c}26;color:${c}">${esc(r.source)}</span></td><td data-label="Keterangan">${esc(r.desc)}</td><td data-label="Masuk">${r.in?rp(r.in):'-'}</td><td data-label="Keluar">${r.out?rp(r.out):'-'}</td><td data-label="Saldo">${signed(r.balance)}</td><td data-label="Aksi">${r.auto?'<span class="badge badge-ok">Otomatis</span>':`<button onclick="deleteFinance('${r.id}')" class="btn-delete">${ICON.trash} Hapus</button>`}</td></tr>` }).join('') || empty(7);
}

/* ---- Hook ke render() utama app.js supaya Keuangan selalu ikut ter-update ---- */
const _renderFinanceHook = render;
render = function(){ _renderFinanceHook(); try{ renderFinance() }catch(err){ console.error('Keuangan:', err) } };

/* ---- Realtime khusus tabel finance ---- */
function subscribeFinanceRealtime(){
  if(!sb) return;
  sb.channel('inzaki-finance').on('postgres_changes', { event:'*', schema:'public', table:'finance' }, async()=>{ await loadFinance(); renderFinance() }).subscribe();
}

(async function initFinance(){
  ensureFinanceUI();
  await loadFinance();
  renderFinance();
  subscribeFinanceRealtime();
})();
