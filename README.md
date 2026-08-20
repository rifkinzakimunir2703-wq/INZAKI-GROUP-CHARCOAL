# INZAKI GROUP — Charcoal Business Portal (Online / Supabase)

Alur: Bahan Baku → Produksi Batch → Penyusutan → HPP → Barang Jadi → Penjualan → Laba.

Data sekarang tersimpan **online di Supabase** (bukan lagi di HP/browser saja), sehingga:
- **Siapa saja** yang membuka link portal bisa **melihat** Dashboard, Barang Jadi, dan Laba & Laporan tanpa login (read-only).
- **Hanya admin yang login** yang bisa menambah Bahan Baku, Produksi Batch, Penjualan, dan Pengeluaran.
- Perubahan data **langsung tersinkron real-time** ke semua orang yang sedang membuka halaman (tanpa refresh).

---

## Setup awal (sekali saja)

### 1. Buat project Supabase
1. Daftar/login di https://supabase.com → **New project** (gratis).
2. Tunggu sampai project selesai dibuat (±2 menit).

### 2. Jalankan skema database
1. Di dashboard Supabase, buka **SQL Editor**.
2. Buka file `supabase-schema.sql` yang ada di folder ini, copy semua isinya, paste ke SQL Editor, lalu klik **Run**.
3. Ini akan membuat 4 tabel (`raw_materials`, `batches`, `sales`, `expenses`), aturan keamanan (RLS), dan mengaktifkan realtime.

### 3. Ambil API key
1. Buka **Project Settings → API**.
2. Salin **Project URL** dan **anon public key**.
3. Buka file `config.js`, ganti:
   ```js
   const SUPABASE_URL = "https://xxxxx.supabase.co";
   const SUPABASE_ANON_KEY = "eyJhbGciOi....";
   ```

### 4. Buat akun admin
1. Buka **Authentication → Providers**, pastikan **Email** aktif (biasanya sudah default).
2. Buka **Authentication → Users → Add user**, isi email & password untuk admin (misalnya kamu sendiri).
3. **Penting:** buka **Authentication → Settings** (atau **Sign In / Providers**) dan **matikan "Allow new users to sign up"**. Ini mencegah orang lain mendaftar sendiri dan otomatis jadi admin — di portal ini tidak ada tombol daftar, admin harus dibuat manual dari dashboard Supabase.

### 5. Upload ke GitHub Pages (atau hosting statis lain)
Upload `index.html`, `style.css`, `app.js`, `config.js`, `README.md` ke root repository. Aktifkan **Settings → Pages → Deploy from a branch → main → /(root)**.
File `supabase-schema.sql` tidak perlu diupload ke hosting (hanya dipakai sekali di SQL Editor).

Selesai — portal sudah online. Bagikan link ke siapa saja untuk mode lihat (view), dan login sebagai admin dari tombol **"Login Admin"** di sidebar untuk mengelola data.

---

## Cara kerja mode Publik vs Admin
- **Publik (belum login):** hanya melihat Dashboard, Barang Jadi, Laba & Laporan. Tombol tambah data dan hapus data disembunyikan.
- **Admin (sudah login):** semua menu terbuka — Bahan Baku, Produksi Batch, Penjualan, Pengeluaran, tombol "+ Catat", dan "Hapus Semua Data".
- Keamanan ditegakkan dua lapis: UI menyembunyikan tombol untuk publik, **dan** database (Row Level Security) menolak semua percobaan insert/update/delete dari yang belum login — jadi aman walau seseorang mencoba lewat cara teknis.

## Menambah admin lain
Ulangi langkah **4** di atas (Authentication → Users → Add user) dengan email berbeda. Tidak perlu ubah kode.

## Troubleshooting
- **Muncul banner "Supabase belum dikonfigurasi"** → `config.js` belum diisi dengan URL/key asli.
- **Login gagal terus** → cek email/password di Authentication → Users, atau reset password dari sana.
- **Data tidak muncul / kosong** → pastikan `supabase-schema.sql` sudah dijalankan dan tidak ada error di SQL Editor.
- **Simpan data gagal padahal sudah login** → cek kembali RLS policy di SQL Editor sudah ter-apply (`select` dari tab **Authentication → Policies**).

---

## Riwayat versi
### v3
- Input bahan baku: harga/kg, biaya transportasi, biaya lain-lain, supplier.
- Transportasi + biaya lain-lain masuk ke biaya bahan dan memengaruhi HPP/kg bahan.
- Dashboard global, batch produksi otomatis, penyusutan otomatis, HPP batch otomatis, laba per batch dan margin, backup JSON, responsive, data lokal di browser.

### v4 Modern
- Tampilan modern minimalis, tema ember/bara arang (dark).
- Phone friendly dan responsive.
- Grafik keuangan bulanan: omzet, HPP, pengeluaran, laba. Grafik produksi. Filter tahun grafik.

### v4 Online (Supabase)
- Data pindah dari localStorage ke **Supabase** (database online).
- **Login admin** (Supabase Auth) untuk kelola data.
- **Mode publik/view online** — siapa saja bisa lihat dashboard & laporan tanpa login.
- **Realtime sync** — perubahan data langsung tampil ke semua orang yang membuka halaman.
- Row Level Security: hanya admin yang login bisa insert/update/delete.
