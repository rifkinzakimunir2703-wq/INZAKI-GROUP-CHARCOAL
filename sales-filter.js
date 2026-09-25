/* sales-filter.js — Filter Riwayat Penjualan: periode (minggu/bulan/rentang tanggal) + status (Lunas/Piutang).
   Bekerja setelah tabel dirender: menyembunyikan baris yang tidak cocok, tidak mengubah data. */
(function(){
  const SF = { per: 'all', status: 'all' };
  const $=q=>document.querySelector(q);

  function applySalesFilter(){
    const tbody = $('#salesTable'); if(!tbody) return;
    const from = $('#salesDateFrom')?.value, to = $('#salesDateTo')?.value, mon = $('#salesMonthPick')?.value;
    tbody.querySelectorAll('tr').forEach(tr => {
      const dEl = tr.querySelector('[data-label="Tanggal"]'), sEl = tr.querySelector('[data-label="Status"]');
      if(!dEl || !sEl){ return } // baris kosong (empty state)
      const d = dEl.textContent.trim(), st = sEl.textContent.trim();
      let ok = true;
      if(SF.status !== 'all') ok = ok && st === SF.status;
      if(mon) ok = ok && d.slice(0,7) === mon;
      else if(from || to) { if(from) ok = ok && d >= from; if(to) ok = ok && d <= to }
      else if(SF.per === 'week') ok = ok && (typeof last7 === 'function' ? last7(d) : true);
      else if(SF.per === 'month') ok = ok && (typeof thisMonth === 'function' ? thisMonth(d) : true);
      tr.dataset.sfHide = ok ? '' : '1';
      tr.style.display = (ok && tr.dataset.searchHide !== '1') ? '' : 'none';
    });
  }

  function wireChips(id, key, extra){
    const box = document.getElementById(id); if(!box) return;
    box.addEventListener('click', e => {
      const b = e.target.closest('button'); if(!b) return;
      box.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      SF[key] = b.dataset[extra];
      if(key === 'per'){ $('#salesDateFrom').value = ''; $('#salesDateTo').value = ''; $('#salesMonthPick').value = '' }
      applySalesFilter();
    });
  }
  wireChips('salesPeriodChips', 'per', 'p');
  wireChips('salesStatusChips', 'status', 's');
  ['salesDateFrom', 'salesDateTo', 'salesMonthPick'].forEach(id => {
    const el = document.getElementById(id); if(!el) return;
    el.addEventListener('input', () => {
      if(id === 'salesMonthPick'){ $('#salesDateFrom').value = ''; $('#salesDateTo').value = '' }
      else if($('#salesMonthPick').value) $('#salesMonthPick').value = '';
      document.getElementById('salesPeriodChips')?.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.p === 'all'));
      SF.per = 'all'; applySalesFilter();
    });
  });

  /* Tetap hormati pencarian teks yang sudah ada (#searchSales) supaya kedua filter bisa dipakai bersamaan */
  const search = document.getElementById('searchSales');
  if(search){
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      $('#salesTable')?.querySelectorAll('tr').forEach(tr => {
        tr.dataset.searchHide = (q && !tr.textContent.toLowerCase().includes(q)) ? '1' : '';
        tr.style.display = (tr.dataset.sfHide !== '1' && tr.dataset.searchHide !== '1') ? '' : 'none';
      });
    });
  }

  const _sfRender = render;
  render = function(){ _sfRender(); try{ applySalesFilter() }catch(err){ console.error('Filter Penjualan:', err) } };
})();
