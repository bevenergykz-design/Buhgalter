'use strict';
// Загрузка файлов: приватные документы клиентов (data/files) и публичные изображения (data/uploads → /uploads/)
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { DATA_DIR, settings } = require('./db');

const DOC_EXT = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.gif', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt', '.rtf', '.odt', '.ods', '.xml', '.zip', '.rar', '.7z'];
const IMG_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const FILES_DIR = path.join(DATA_DIR, 'files');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads'); // публичные изображения (обложки, фото), отдаются по адресу /uploads/
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// имя файла от multer приходит в latin1 — восстанавливаем кириллицу
const fixName = (n) => { try { return Buffer.from(n, 'latin1').toString('utf8'); } catch { return n; } };
const rnd = () => crypto.randomBytes(16).toString('hex');

function clientDocsUpload() {
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        const dir = path.join(FILES_DIR, String(req.uploadClientId));
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (req, file, cb) => cb(null, rnd() + path.extname(fixName(file.originalname)).toLowerCase()),
    }),
    limits: { fileSize: (Number(settings().max_upload_mb) || 20) * 1024 * 1024, files: 20 },
    fileFilter: (req, file, cb) => {
      file.originalname = fixName(file.originalname);
      cb(null, DOC_EXT.includes(path.extname(file.originalname).toLowerCase()));
    },
  }).array('files', 20);
}

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => cb(null, `${Date.now().toString(36)}-${rnd().slice(0, 10)}${path.extname(fixName(file.originalname)).toLowerCase()}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, IMG_EXT.includes(path.extname(fixName(file.originalname)).toLowerCase())),
});

const clientFilePath = (f) => path.join(FILES_DIR, String(f.client_id), f.stored_name);
function removeClientFile(f) { try { fs.unlinkSync(clientFilePath(f)); } catch { /* уже удалён */ } }

// отдать файл с корректным русским именем
function sendDownload(res, f) {
  const p = clientFilePath(f);
  if (!fs.existsSync(p)) return res.status(404).type('text').send('Файл не найден');
  const ascii = f.orig_name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.orig_name)}`);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, no-store');
  fs.createReadStream(p).pipe(res);
}

module.exports = { clientDocsUpload, imageUpload, clientFilePath, removeClientFile, sendDownload, FILES_DIR, UPLOADS_DIR, DOC_EXT };
