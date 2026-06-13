# PulseDEX — Setup di MacBook

Panduan ini menjalankan website trending coin Anda yang terhubung langsung ke **Zora Coins API**.

## ⚠️ Sebelum mulai

1. Buka **Zora → Developer Settings**, **revoke** API key lama yang pernah Anda ketik di chat.
2. Buat API key **baru**.
3. Jangan pernah taruh API key di kode frontend (HTML/JS yang dikirim ke browser) — selalu lewat backend.

## 1. Install Node.js (jika belum)

Buka **Terminal** di MacBook:

```bash
brew install node
```

Cek sudah terpasang:
```bash
node -v
npm -v
```

## 2. Siapkan project

Salin semua file ini ke satu folder, misal `~/pulsedex/`, dengan struktur:

```
pulsedex/
├── server.js
├── package.json
├── .env.example
└── public/
    └── index.html
```

Masuk ke folder lalu install dependensi:

```bash
cd ~/pulsedex
npm install
```

## 3. Atur API key

```bash
cp .env.example .env
```

Buka file `.env` dengan editor (misal `nano .env`), lalu isi:

```
ZORA_API_KEY=zora_api_xxx_key_baru_anda
PORT=3000
```

Simpan file.

## 4. Jalankan server

```bash
node server.js
```

Jika berhasil, akan muncul:
```
✅ PulseDEX backend jalan di http://localhost:3000
```

## 5. Buka website

Buka browser, akses:

```
http://localhost:3000
```

Anda akan melihat daftar coin trending dari Zora, otomatis diperbarui setiap **15 detik**.

## Cara kerja

```
Browser (frontend)  →  http://localhost:3000/api/trending
                                    │
                                    ▼
                         server.js (backend Anda)
                                    │  header: api-key
                                    ▼
                  https://api-sdk.zora.engineering (Zora API)
```

API key **hanya** ada di file `.env` di komputer Anda — tidak pernah dikirim ke browser pengguna.

## Endpoint yang tersedia

- `GET /api/trending?count=20` — coin top gainers / trending
- `GET /api/new?count=20` — coin yang baru dibuat
- `GET /api/coin?address=0x...&chain=8453` — detail satu coin

## Tombol "Beli" dan "Wallet"

Saat ini tombol Beli/Connect/Buat Wallet masih berupa **simulasi UI** (toast notifikasi).
Untuk transaksi sungguhan, Anda perlu:
1. Integrasi wallet (misal via `wagmi` + `viem` atau RainbowKit) agar pengguna bisa menandatangani transaksi dari MetaMask/Coinbase Wallet mereka sendiri.
2. Memakai fungsi `createTradeCall` / fungsi trade dari `@zoralabs/coins-sdk` di backend untuk menyiapkan data transaksi, lalu mengirimkannya ke wallet pengguna untuk ditandatangani.

Beri tahu saya jika Anda ingin lanjut ke tahap ini — saya bisa bantu strukturnya.

## Troubleshooting

- **"Gagal terhubung ke server lokal"** → pastikan `node server.js` masih berjalan di terminal terpisah.
- **401 / Unauthorized dari Zora** → API key salah/belum diset, cek file `.env`.
- **Port 3000 sudah dipakai** → ubah `PORT` di `.env`, lalu buka `http://localhost:<port_baru>`.
