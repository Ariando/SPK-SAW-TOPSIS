// Kredensial untuk uji otomatis. Satu sumber kebenaran: berkas ini membaca
// variabel lingkungan yang sama dengan seed, sehingga mengganti kata sandi
// akun awal tidak mematahkan seluruh suite.
import 'dotenv/config';

export const ADMIN_USERNAME = process.env.SEED_ADMIN_USERNAME ?? 'admin';
export const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Mbgindonesia@2026';

export const VIEWER_USERNAME = process.env.SEED_VIEWER_USERNAME ?? 'peninjau';
export const VIEWER_PASSWORD = process.env.SEED_VIEWER_PASSWORD ?? 'TelaahTinjau2026';

export const BASE_URL = process.env.VERIFY_BASE ?? 'http://localhost:4321';