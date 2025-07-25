const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;
require('dotenv').config();
const admin = require('firebase-admin');

// Parsing dan perbaiki karakter newline
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://fbuses-3e232-default-rtdb.firebaseio.com',
});


const db = admin.database();
const licenseRef = db.ref('licenses');

// 🛠 Middleware
app.use(cors());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// 🧠 Fungsi Load dan Save Lisensi ke Firebase
async function loadLicenses() {
  const snapshot = await licenseRef.once('value');
  const data = snapshot.val();
  return data ? Object.values(data) : [];
}

async function saveLicenseObject(licenseObj) {
  await licenseRef.child(licenseObj.key).set(licenseObj);
}

// 🔍 Ambil semua lisensi
app.get('/admin/api', async (req, res) => {
  try {
    const licenses = await loadLicenses();
    res.json(licenses);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal memuat data', error: err.message });
  }
});

// 🔁 Toggle status lisensi
app.post('/admin/toggle', async (req, res) => {
  const { key } = req.body;
  const snapshot = await licenseRef.child(key).once('value');
  if (!snapshot.exists()) {
    return res.status(404).json({ success: false, message: 'Lisensi tidak ditemukan' });
  }

  const data = snapshot.val();
  data.active = !data.active;
  await licenseRef.child(key).set(data);

  res.json({ success: true, message: 'Status lisensi diubah', key: key });
});

// ➕ Tambah lisensi baru
function generateLicenseKey() {
  const part = () => Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${part()}-${part()}-${part()}`;
}

app.post('/admin/add', async (req, res) => {
  let newKey;
  let exists = true;
  let attempt = 0;

  while (exists && attempt < 10) {
    newKey = generateLicenseKey();
    const snapshot = await licenseRef.child(newKey).once('value');
    exists = snapshot.exists();
    attempt++;
  }

  if (exists) return res.status(500).json({ success: false, message: 'Gagal membuat lisensi unik' });

  const newLicense = { key: newKey, active: true, used: false };
  await licenseRef.child(newKey).set(newLicense);

  res.json({ success: true, message: 'Lisensi berhasil ditambahkan', license: newLicense });
});

// 🔒 Verifikasi lisensi
app.post('/verify-license', async (req, res) => {
  const { licenseKey } = req.body;
  if (!licenseKey) {
    return res.status(400).json({ success: false, message: 'License key kosong' });
  }

  const key = licenseKey.trim();
  const snapshot = await licenseRef.child(key).once('value');

  if (!snapshot.exists()) return res.status(400).json({ success: false, message: 'Lisensi tidak ditemukan' });

  const lic = snapshot.val();

  if (!lic.active) return res.status(403).json({ success: false, message: 'Lisensi tidak aktif' });
  if (lic.used) return res.status(409).json({ success: false, message: 'Lisensi sudah digunakan' });

  lic.used = true;
  await licenseRef.child(key).set(lic);

  res.json({ success: true, key: key });
});

// 🗑️ Hapus Lisensi
app.post('/admin/delete', async (req, res) => {
  const { key } = req.body;
  const ref = licenseRef.child(key);
  const snapshot = await ref.once('value');

  if (!snapshot.exists()) {
    return res.status(404).json({ success: false, message: 'Lisensi tidak ditemukan' });
  }

  await ref.remove();
  res.json({ success: true, message: 'Lisensi berhasil dihapus', key });
});

// 🔄 Reset "used" ke false
app.post('/admin/reset', async (req, res) => {
  const { key } = req.body;
  const ref = licenseRef.child(key);
  const snapshot = await ref.once('value');

  if (!snapshot.exists()) {
    return res.status(404).json({ success: false, message: 'Lisensi tidak ditemukan' });
  }

  const data = snapshot.val();
  data.used = false;
  await ref.set(data);

  res.json({ success: true, message: 'Status lisensi direset', key });
});

app.post('/admin/check-valid', async (req, res) => {
  const { key } = req.body;
  const licenses = await loadLicenses(); // ✅ Gunakan await
  const lic = licenses.find(l => l.key === key);

  if (!lic) return res.json({ valid: false, reason: 'Lisensi tidak ditemukan' });
  if (!lic.active) return res.json({ valid: false, reason: 'Lisensi tidak aktif' });

  return res.json({ valid: true });
});


// 🔧 Health check
app.get('/', (req, res) => {
  res.send('🚀 Server Firebase Lisensi berjalan. Gunakan endpoint /admin/api');
});

// ✅ Start server
app.listen(PORT, () => {
  console.log(`✅ Server berjalan di http://localhost:${PORT}`);
});
