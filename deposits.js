/* ================= INZAKI GROUP — Modul Uang Muka / DP Supplier — deposits.js =================
   DP ke petani dicatat terpisah (tabel "deposits") dan langsung jadi kas keluar di modul Keuangan.
   Saat Bahan Baku diinput dengan harga penuh, DP petani yang sama otomatis "melunasi" nilai barangnya
   (tabel "deposit_allocations") — HPP tetap penuh, tapi kas keluar pembelian dipotong sebesar DP
   supaya tidak terhitung dua kali. Lihat deposits.sql untuk skema tabel.
*/

let DP = { list: [], alloc: [], loaded: false, busy: false, tried: 0 };
const mapDeposit  = x => ({ id: x.id, date: x.date, farmer: x.farmer, note: x.note || '', amount: +x.amount });
const mapDepAlloc = x => ({ id: x.id, depositId: x.deposit_id, rawId: String(x.raw_id), amount: +x.amount, date: x.date });
const dpNorm   = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const rawGoods = r => (+r.price || 0) * (+r.originalQty || +r.qty || 0);   // nilai barang saja (tanpa transport/biaya lain)
const dpByDate = (a, b) => a.date === b.date ? 0 : (a.date < b.date ? 1 : -1);

/* Alokasi yang bahan bakunya masih ada (kalau bahan baku dihapus, DP otomatis kembali berjalan) */
function dpAllocs(){ const ids = new Set((S.raw || []).map(r => String(r.id))); return DP.alloc.filter(a => ids.has(a.rawId)); }
DP.allocByRaw = () => { const m = {}; dpAllocs().forEach(a => m[a.rawId] = (m[a.rawId] || 0) + a.amount); return m; };

/* ---- Muat data dari Supabase ---- */
async function loadDeposits(){
  if(!sb || !isAdmin) return;   // data DP hanya untuk admin
  DP.tried = Date.now();
  const [a, b] = await Promise.all([sb.from('deposits').select('*').order('id'), sb.from('deposit_allocations').select('*').order('id')]);
  if(a.error || b.error){ console.error('Gagal memuat Uang Muka:', (a.error || b.error).message); return }
  DP.list = (a.data || []).map(mapDeposit); DP.alloc = (b.data || []).map(mapDepAlloc); DP.loaded = true;
}

/* ---- Simpan & hapus DP ---- */
async function addDeposit(e){
  e.preventDefault(); if(!requireAdmin()) return;
  const x = Object.fromEntries(new FormData(e.target));
  if(+x.amount <= 0) return toast('Jumlah DP harus lebih dari 0.');
  const { data, error } = await sb.from('deposits').insert({ date: x.date, farmer: x.farmer.trim(), note: x.note || null, amount: +x.amount }).select().single();
  if(error) return toast('Gagal simpan DP: ' + error.message);
  DP.list.push(mapDeposit(data)); renderDeposits(); renderFinance(); e.target.reset(); e.target.date.value = today;
  toast('DP berhasil dicatat sebagai kas keluar.');
}
async function deleteDeposit(id){
  if(!requireAdmin()) return;
  const d = DP.list.find(x => String(x.id) === String(id)); if(!d) return toast('Data tidak ditemukan!');
  if(dpAllocs().some(a => String(a.depositId) === String(id))) return toast('DP ini sudah dipakai melunasi bahan baku — hapus/ubah bahan baku terkait dulu.');
  if(!await confirmDialog(`Hapus DP?\n\nPetani: ${d.farmer}\nTanggal: ${d.date}\nJumlah: ${rp(d.amount)}\n\nKas keluar DP ini ikut hilang dari Keuangan.`)) return;
  const { error } = await sb.from('deposits').delete().eq('id', id);
  if(error) return toast('Gagal hapus: ' + error.message);
  DP.list = DP.list.filter(x => String(x.id) !== String(id)); renderDeposits(); renderFinance();
}

/* ---- Pelunasan otomatis: bahan baku dari petani yang punya DP memotong DP (terlama dulu) ---- */
async function autoSettle(){
  if(DP.busy || !sb || !isAdmin || !DP.loaded || !Array.isArray(S.raw)) return;
  DP.busy = true;
  try{
    const done = DP.allocByRaw(), used = {};
    dpAllocs().forEach(a => used[a.depositId] = (used[a.depositId] || 0) + a.amount);
    const left = new Map(DP.list.map(d => [d.id, d.amount - (used[d.id] || 0)]));
    const plan = [];
    S.raw.filter(r => r.id != null && r.supplier).slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0).forEach(r => {
      let need = rawGoods(r) - (done[String(r.id)] || 0);
      DP.list.filter(d => dpNorm(d.farmer) === dpNorm(r.supplier) && d.date <= r.date && left.get(d.id) > 0)
        .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id).forEach(d => {
          if(need <= 0) return;
          const take = Math.min(need, left.get(d.id));
          plan.push({ deposit_id: d.id, raw_id: String(r.id), amount: take, date: r.date });
          left.set(d.id, left.get(d.id) - take); need -= take;
        });
    });
    if(!plan.length) return;
    const { error } = await sb.from('deposit_allocations').upsert(plan, { onConflict: 'deposit_id,raw_id', ignoreDuplicates: true });
    if(error) return console.error('Gagal melunasi DP otomatis:', error.message);
    await loadDeposits(); renderDeposits(); renderFinance();
    toast('DP otomatis dipotong dari pembelian bahan baku: ' + rp(plan.reduce((t, p) => t + p.amount, 0)));
  } finally { DP.busy = false }
}

/* ---- Render halaman ---- */
function renderDeposits(){
  if(typeof S === 'undefined' || !$('#dpForm')) return;
  const al = dpAllocs(), used = {}; al.forEach(a => used[a.depositId] = (used[a.depositId] || 0) + a.amount);
  const rows = DP.list.map(d => { const u = used[d.id] || 0; return { ...d, used: u, left: Math.max(0, d.amount - u) } });
  const open = rows.filter(d => d.left > 0), sum = (a, k) => a.reduce((t, x) => t + x[k], 0);

  const byF = {};
  open.forEach(d => { const k = dpNorm(d.farmer), f = byF[k] = byF[k] || { name: d.farmer, left: 0, n: 0, since: d.date }; f.left += d.left; f.n++; if(d.date < f.since) f.since = d.date });
  const farmers = Object.values(byF).sort((a, b) => b.left - a.left);
  $('#dpKRunning').textContent = rp(sum(open, 'left'));
  $('#dpKRunningInfo').textContent = farmers.length + ' petani belum kirim barang';
  $('#dpKTotal').textContent = rp(sum(rows, 'amount')); $('#dpKCount').textContent = rows.length + ' transaksi';
  $('#dpKUsed').textContent = rp(sum(rows, 'used'));
  $('#dpFarmerTable').innerHTML = farmers.map(f => `<tr><td data-label="Petani">${esc(f.name)}</td><td data-label="DP Berjalan">${rp(f.left)}</td><td data-label="Jumlah DP">${f.n}</td><td data-label="Sejak">${fmtDate(f.since)}</td></tr>`).join('') || empty(4);

  const flt = $('#dpFilter').value, st = d => d.used === 0 ? ['Belum ada barang', '#F59E0B'] : d.left > 0 ? ['Sebagian', '#38BDF8'] : ['Lunas', '#22C55E'];
  $('#dpTable').innerHTML = rows.filter(d => flt === 'all' || (flt === 'open' ? d.left > 0 : d.left === 0)).sort(dpByDate).map(d => { const [t, c] = st(d);
    return `<tr><td data-label="Tanggal">${fmtDate(d.date)}</td><td data-label="Petani">${esc(d.farmer)}</td><td data-label="Keterangan">${esc(d.note || '-')}</td><td data-label="DP">${rp(d.amount)}</td><td data-label="Terpakai">${d.used ? rp(d.used) : '-'}</td><td data-label="Sisa">${rp(d.left)}</td><td data-label="Status"><span class="badge" style="background:${c}26;color:${c}">${t}</span></td><td data-label="Aksi"><button onclick="deleteDeposit('${d.id}')" class="btn-delete">${ICON.trash} Hapus</button></td></tr>` }).join('') || empty(8);

  const rawBy = new Map((S.raw || []).map(r => [String(r.id), r])), depBy = new Map(DP.list.map(d => [d.id, d]));
  $('#dpAllocTable').innerHTML = al.slice().sort(dpByDate).map(a => { const r = rawBy.get(a.rawId) || {}, d = depBy.get(a.depositId) || {};
    return `<tr><td data-label="Tanggal">${fmtDate(a.date || r.date)}</td><td data-label="Petani">${esc(d.farmer || '-')}</td><td data-label="Bahan Baku">${esc(r.name || '-')} · ${+r.originalQty || +r.qty || 0} kg</td><td data-label="Dipotong dari DP">${rp(a.amount)}</td></tr>` }).join('') || empty(4);

  const names = new Set([...DP.list.map(d => d.farmer), ...(S.raw || []).map(r => r.supplier).filter(Boolean)]);
  $('#dpFarmerList').innerHTML = [...names].map(n => `<option value="${esc(n)}">`).join('');
}

/* ---- Hook render, jadwal pelunasan otomatis, realtime ---- */
let _dpTimer;
function dpSchedule(){
  clearTimeout(_dpTimer);
  _dpTimer = setTimeout(async () => {
    if(!DP.loaded && isAdmin && Date.now() - DP.tried > 3000){ await loadDeposits(); renderDeposits(); renderFinance() }
    await autoSettle();
  }, 400);
}
const _renderDepositHook = render;
render = function(){ _renderDepositHook(); try{ renderDeposits(); dpSchedule() }catch(err){ console.error('Uang Muka:', err) } };

(async function initDeposits(){
  if(!ADMIN_PAGES.includes('deposits')) ADMIN_PAGES.push('deposits');   // halaman DP khusus admin
  $('#dpForm').onsubmit = addDeposit; $('#dpFilter').onchange = renderDeposits;
  const sup = document.querySelector('#rawForm [name=supplier]'); if(sup) sup.setAttribute('list', 'dpFarmerList');   // saran nama petani yang punya DP
  const f = $('#dpForm').date; if(f && !f.value) f.value = today;
  document.querySelectorAll('[data-page="deposits"],[data-go="deposits"]').forEach(b => b.addEventListener('click', () => setTimeout(() => { $('#title').textContent = 'Uang Muka / DP Supplier' }, 0)));
  await loadDeposits(); renderDeposits(); renderFinance(); dpSchedule();
  if(sb){ const ch = sb.channel('inzaki-deposits'); ['deposits', 'deposit_allocations'].forEach(t => ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, async () => { await loadDeposits(); renderDeposits(); renderFinance() })); ch.subscribe() }
})();
