const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const LICENSE_PATH = path.join(__dirname, 'data', 'licenses.json');

// View engine
app.set('view engine', 'ejs');

// Static assets
app.use(express.static('public'));

// Middleware untuk parsing form dan JSON
app.use(express.urlencoded({ extended: false }));
app.use(express.json()); // Penting untuk API

// Fungsi Load dan Save Lisensi
function loadLicenses() {
  if (!fs.existsSync(LICENSE_PATH)) return [];
  return JSON.parse(fs.readFileSync(LICENSE_PATH, 'utf-8'));
}

function saveLicenses(data) {
  fs.writeFileSync(LICENSE_PATH, JSON.stringify(data, null, 2));
}

// Halaman Panel Admin
app.get('/admin', (req, res) => {
  const licenses = loadLicenses();
  res.render('index', { licenses });
});

// 🔒 API: Verifikasi Lisensi
app.post('/verify-license', (req, res) => {
  const { licenseKey } = req.body;

  if (!licenseKey) {
    return res.status(400).json({ success: false, message: 'License key kosong' });
  }

  const keyTrimmed = licenseKey.trim();
  const licenses = loadLicenses();
  const license = licenses.find(l => l.key === keyTrimmed);

  if (!license) return res.status(400).json({ success: false, message: 'Lisensi tidak ditemukan' });

  if (!license.active) {
    return res.status(403).json({ success: false, message: 'Lisensi tidak aktif' });
  }

  if (license.used) {
    return res.status(409).json({ success: false, message: 'Lisensi sudah digunakan' });
  }

// Jika lolos semua, tandai sebagai digunakan
  license.used = true;
  saveLicenses(licenses);

// Kirim info lengkap jika ingin diproses di Electron
  res.json({ success: true, key: license.key });

});

// 🔁 Toggle Status Aktif
app.post('/admin/toggle', (req, res) => {
  const { key } = req.body;
  const licenses = loadLicenses();
  const lic = licenses.find(l => l.key === key.trim());
  if (lic) {
    lic.active = !lic.active;
    saveLicenses(licenses);
  }
  res.redirect('/admin');
});

// ➕ Tambah Lisensi
// Fungsi pembuat kode lisensi acak
function generateLicenseKey() {
  const part = () => Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${part()}-${part()}-${part()}`; // Contoh: X8GJ-PQL2-ZK7W
}

app.post('/admin/add', (req, res) => {
  const licenses = loadLicenses();

  let newKey;
  let attempt = 0;
  do {
    newKey = generateLicenseKey();
    attempt++;
  } while (licenses.some(l => l.key === newKey) && attempt < 10);

  if (!newKey) return res.redirect('/admin');

  licenses.push({ key: newKey, active: true, used: false });
  saveLicenses(licenses);

  res.redirect('/admin');
});


// Start server
app.listen(PORT, () => {
  console.log(`✅ Server berjalan di http://localhost:${PORT}/admin`);
});
