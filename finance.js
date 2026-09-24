/* ================= INZAKI GROUP — Modul Keuangan (Kas) — finance.js =================
   Modul mandiri untuk halaman "Keuangan": menggabungkan arus kas otomatis
   (penjualan, pengeluaran, pembelian bahan baku, pembelian barang jadi,
   penerimaan & pembayaran hutang) dengan transaksi kas manual (setor modal,
   tarik tunai/prive, koreksi saldo) yang disimpan di tabel Supabase "finance".
   Dibangun ulang setelah file aslinya hilang — lihat finance.sql untuk skema tabel.
*/

let FS = { tx: [] };
const mapFinance = x => ({ id: x.id, date: x.date, type: x.type, category: x.category, desc: x.desc, amount: +x.amount });

/* ---- Bangun markup halaman Keuangan sekali saja ---- */
function ensureFinanceUI(){
  const sec = document.getElementById('finance');
  if(!sec || sec.dataset.built) return;
  sec.dataset.built = '1';
  sec.innerHTML = `
    <div class="cards quick-glance" id="financeKpi">
      <div><span>Saldo Kas Saat Ini</span><b id="fkSaldo">Rp0</b></div>
      <div><span>Kas Masuk Bulan Ini</span><b id="fkMasukBulan">Rp0</b></div>
      <div><span>Kas Keluar Bulan Ini</span><b id="fkKeluarBulan">Rp0</b></div>
      <div><span>Transaksi Manual</span><b id="fkManualCount">0</b></div>
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>Saldo Kas</h2><small>Catat kas masuk/keluar di luar transaksi otomatis — setor modal, tarik tunai, koreksi saldo</small></div></div>
      <div class="saldo-actions">
        <button type="button" class="ghost sa-add" id="saAdd">+ Tambah Kas</button>
        <button type="button" class="ghost sa-sub" id="saSub">− Kurangi Kas</button>
      </div>
    </div>

    <div class="panel chart-panel">
      <div class="panel-head"><div><h2>Arus Kas</h2><small>Saldo kas berjalan dari waktu ke waktu</small></div></div>
      <canvas id="kasChart"></canvas>
    </div>

    <div class="panel">
      <div class="panel-head">
        <div><h2>Riwayat Arus Kas</h2><small>Gabungan otomatis (penjualan, pengeluaran, pembelian, hutang) &amp; manual</small></div>
        <input type="text" id="searchFinance" class="table-search" placeholder="Cari sumber / keterangan…">
      </div>
      <table><thead><tr><th>Tanggal</th><th>Sumber</th><th>Keterangan</th><th>Masuk</th><th>Keluar</th><th>Saldo</th><th>AKSI</th></tr></thead><tbody id="financeLedgerTable"></tbody></table>
    </div>
  `;
  $('#saAdd').onclick = () => quickCash('in');
  $('#saSub').onclick = () => quickCash('out');
  $('#searchFinance').oninput = renderFinance;
}

/* ---- Muat transaksi kas manual dari Supabase ---- */
async function loadFinance(){
  if(!sb) return;
  const { data, error } = await sb.from('finance').select('*').order('id');
  if(error){ console.error('Gagal memuat tabel finance:', error.message); return }
  FS.tx = (data||[]).map(mapFinance);
}

/* ---- Tambah/kurangi kas cepat lewat dialog jumlah ---- */
async function quickCash(type){
  if(!requireAdmin()) return;
  const label = type==='in' ? 'Tambah Kas' : 'Kurangi Kas';
  const val = await promptDialog(`Masukkan jumlah kas ${type==='in'?'masuk':'keluar'} (di luar transaksi otomatis)`, '', label);
  if(val===null || val===undefined || val==='' || +val<=0) return;
  const payload = { date: today, type, category: label+' (Manual)', desc: null, amount: +val };
  const { data, error } = await sb.from('finance').insert(payload).select().single();
  if(error) return toast('Gagal simpan transaksi kas: '+error.message);
  FS.tx.push(mapFinance(data)); renderFinance();
  toast(type==='in' ? 'Kas berhasil ditambahkan.' : 'Kas berhasil dikurangi.');
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
  (S.sales||[]).forEach(x => rows.push({ date:x.date, source:'Penjualan', auto:true, desc:(x.customer?x.customer+' — ':'')+(x.invoice?'#'+x.invoice:'Penjualan produk'), in:+x.total||0, out:0 }));
  (S.expenses||[]).forEach(x => rows.push({ date:x.date, source:'Pengeluaran', auto:true, desc:(x.cat||'')+(x.desc?': '+x.desc:''), in:0, out:+x.amount||0 }));
  (S.raw||[]).forEach(r => rows.push({ date:r.date, source:'Pembelian Bahan Baku', auto:true, desc:(r.name||'')+(r.supplier?' — '+r.supplier:''), in:0, out:(+r.price||0)*(+r.originalQty||+r.qty||0)+(+r.transport||0)+(+r.other||0) }));
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

  const q=($('#searchFinance')?.value||'').toLowerCase();
  const filtered = rows.filter(r=> !q || r.source.toLowerCase().includes(q) || (r.desc||'').toLowerCase().includes(q));
  $('#financeLedgerTable').innerHTML = filtered.slice().reverse().map(r=>`<tr><td data-label="Tanggal">${fmtDate(r.date)}</td><td data-label="Sumber">${esc(r.source)}</td><td data-label="Keterangan">${esc(r.desc)}</td><td data-label="Masuk">${r.in?rp(r.in):'-'}</td><td data-label="Keluar">${r.out?rp(r.out):'-'}</td><td data-label="Saldo">${signed(r.balance)}</td><td data-label="Aksi">${r.auto?'<span class="badge badge-ok">Otomatis</span>':`<button onclick="deleteFinance('${r.id}')" class="btn-delete">${ICON.trash} Hapus</button>`}</td></tr>`).join('') || empty(7);
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
