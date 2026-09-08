PERBAIKAN INZAKI GROUP - LOADING TIDAK BERHENTI

Penyebab utama:
Dashboard menunggu Promise.all() dari 5 query Supabase sekaligus. Jika salah satu
query/API tidak merespons, Promise tidak selesai dan overlay "Memuat data dashboard..."
tetap terbuka.

Perbaikan V9.1:
- Timeout 9 detik untuk setiap tabel.
- Timeout 7 detik untuk pemeriksaan sesi login.
- Satu tabel gagal tidak memblokir tabel lainnya.
- Dashboard tetap dirender saat Supabase offline/error.
- Loading overlay selalu ditutup melalui finally.
- Status sinkronisasi berubah menjadi "Mode offline (lokal)" jika ada kegagalan.

FILE DEPLOY:
Upload/replace index.html, style.css, app.js.
Pastikan config.js tetap ada di root GitHub Pages dan berisi SUPABASE_URL serta
SUPABASE_ANON_KEY milik project Supabase Anda.

Setelah upload:
1. Tunggu GitHub Pages selesai deploy.
2. Di Chrome Android lakukan hard refresh / hapus cache situs.
3. Jika masih error, buka DevTools/console dan cek pesan "Gagal memuat tabel".
