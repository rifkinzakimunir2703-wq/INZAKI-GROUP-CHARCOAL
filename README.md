# INZAKI GROUP — Charcoal Business Portal v2

Portal jurnal industri arang dengan alur:
Bahan Baku → Produksi Batch → Penyusutan → HPP → Barang Jadi → Penjualan → Laba per Batch.

## Rumus
Penyusutan (kg) = bahan baku masuk - hasil barang jadi.
Penyusutan (%) = penyusutan / bahan baku masuk × 100%.
HPP batch = biaya bahan baku + tenaga kerja + energi + biaya lain.
HPP/kg = HPP batch / hasil barang jadi.
Laba batch = omzet penjualan dari batch - HPP barang yang terjual.
Laba bersih jurnal = omzet - HPP terjual - pengeluaran umum.

## Fitur
- Stok bahan baku dengan harga/kg dan supplier.
- Batch produksi otomatis BCH-YYYY-XXX.
- Pemakaian bahan baku otomatis mengurangi stok.
- Penyusutan otomatis.
- HPP bahan baku berdasarkan harga bahan yang dipakai.
- Biaya tenaga kerja, energi, dan biaya lain per batch.
- Stok barang jadi per batch.
- Penjualan wajib memilih batch sehingga HPP dan laba dapat ditelusuri.
- Laporan profitabilitas per batch.
- Backup JSON.
- Responsive HP/desktop.
- LocalStorage, tanpa server.

Upload seluruh file ke repository GitHub lalu aktifkan GitHub Pages.
