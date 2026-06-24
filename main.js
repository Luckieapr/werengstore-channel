// main.js - Mova Digital System (Enhanced Admin Reply)

require("./setting");
const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");
const chalk = require("chalk");
const moment = require("moment-timezone");
const axios = require("axios");
const crypto = require("crypto");
const hashC = (str) =>
  crypto.createHash("md5").update(str).digest("hex").substring(0, 16);
const findC = (h, list) => list.find((x) => hashC(x) === h);
const sanitizeMD = (str) => String(str).replace(/[_*[\]`]/g, "");
const sanitizeHTML = (str) =>
  String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
const QRCode = require("qrcode");
const figlet = require("figlet");
const AdmZip = require("adm-zip");
const path = require("path");

class Mutex {
  constructor() {
    this._locking = Promise.resolve();
  }
  lock() {
    let unlockNext;
    let willLock = new Promise((resolve) => (unlockNext = resolve));
    let willUnlock = this._locking.then(() => unlockNext);
    this._locking = this._locking.then(() => willLock);
    return willUnlock;
  }
}
const dbMutex = new Mutex();

/**
 * SISTEM LOGGING TERMINAL
 */
const log = {
  info: (m) =>
    console.log(chalk.blue(`[INFO] [${moment().format("HH:mm:ss")}] ${m}`)),
  success: (m) =>
    console.log(chalk.green(`[SUCCESS] [${moment().format("HH:mm:ss")}] ${m}`)),
  error: (m, e) => {
    console.log(chalk.red(`[ERROR] [${moment().format("HH:mm:ss")}] ${m}`));
    if (e && e.response && e.response.data)
      console.log(
        chalk.red(`➤ Response API: ${JSON.stringify(e.response.data)}`),
      );
    else if (e && e.response && e.response.description)
      console.log(chalk.red(`➤ API Detail: ${e.response.description}`));
    else if (e) console.log(chalk.red(`➤ Detail: ${e.message || e}`));
  },
};

// === DATABASE CONFIG ===
const db_path = {
  user: "./database/user.json",
  trx: "./database/transactions.json",
  store: "./database/store.json",
  promo: "./database/promo.json",
  settings: "./database/settings.json",
};

const readDB = (p) => {
  if (!fs.existsSync("./database")) fs.mkdirSync("./database");
  if (!fs.existsSync(p)) {
    let init;
    if (p.includes("store")) init = { categories: [], products: [] };
    else if (p.includes("settings"))
      init = { success_sticker: "", cancel_sticker: "" };
    else init = [];
    fs.writeFileSync(p, JSON.stringify(init));
  }
  try {
    let data = JSON.parse(fs.readFileSync(p));
    // --- SHARED STOCKS LOGIC ---
    if (p.includes("store") && data && data.products) {
      data.products.forEach(prod => {
        if (prod.linked_product_id) {
          let parent = data.products.find(x => x.id === prod.linked_product_id);
          if (parent) {
            prod.stocks = parent.stocks;
          } else {
            if (!prod.stocks) prod.stocks = [];
          }
        }
      });
    }
    return data;
  } catch (e) {
    if (p.includes("store")) return { categories: [], products: [] };
    if (p.includes("settings"))
      return { success_sticker: "", cancel_sticker: "", ratings: [] };
    return [];
  }
};
const writeDB = (p, d) => {
  if (p.includes("store") && d && d.products) {
    fs.writeFileSync(p, JSON.stringify(d, function(key, value) {
      if (key === 'stocks' && this && this.linked_product_id) return [];
      return value;
    }, 2));
    return;
  }
  fs.writeFileSync(p, JSON.stringify(d, null, 2));
};

db_path.activity_log = "database/activity_logs.json";
function addLog(type, message, details = "") {
  try {
    let logs = [];
    if (fs.existsSync(db_path.activity_log)) {
      logs = JSON.parse(fs.readFileSync(db_path.activity_log, "utf8"));
    }
    logs.unshift({
      id: "LOG" + Date.now(),
      type: type,
      message: message,
      details: details,
      date: moment.tz("Asia/Jakarta").format(),
    });
    if (logs.length > 500) logs = logs.slice(0, 500);
    fs.writeFileSync(db_path.activity_log, JSON.stringify(logs, null, 2));
  } catch (e) {
    console.error("Gagal menulis log aktivitas:", e);
  }
}

/**
 * AUTO-CLEAR ACTIVITY LOG
 * Hapus log otomatis setiap X hari sesuai setting global.LOG_AUTO_CLEAR
 */
function startAutoLogClear() {
  const days = Number(global.LOG_AUTO_CLEAR);
  if (!days || days <= 0) return; // Nonaktif jika 0 atau tidak diisi

  const intervalMs = days * 24 * 60 * 60 * 1000;

  const doClear = () => {
    try {
      if (fs.existsSync(db_path.activity_log)) {
        fs.writeFileSync(db_path.activity_log, "[]");
        const waktu = moment().tz("Asia/Jakarta").format("DD/MM/YYYY HH:mm:ss");
        console.log(chalk.cyan(`[AUTO LOG CLEAR] Log aktivitas dihapus otomatis pada ${waktu} (interval: ${days} hari)`) );
      }
    } catch (e) {
      console.error("Gagal auto-clear log:", e);
    }
  };

  // Jalankan pertama kali setelah interval, lalu berulang
  setInterval(doClear, intervalMs);
  console.log(chalk.gray(`[AUTO LOG CLEAR] Aktif — log akan dibersihkan setiap ${days} hari sekali.`));

  const cleanupExpiredStocks = () => {
    try {
      const store = readDB(db_path.store);
      let totalDeleted = 0;
      store.products.forEach(p => {
        if (!p.stocks) return;
        const before = p.stocks.length;
        p.stocks = p.stocks.filter(s => {
          let obj = s;
          if (typeof s === "string") {
            const parts = s.split("|");
            obj = {
              expDays: parseInt(parts[5]) || 0,
              addedAt: s.addedAt || Date.now()
            };
          }
          if (obj.expDays && obj.expDays > 0) {
            const expiresAt = (obj.addedAt || Date.now()) + (obj.expDays * 86400000);
            if (Date.now() > expiresAt) {
              return false; // Expired, remove
            }
          }
          return true; // Keep
        });
        totalDeleted += (before - p.stocks.length);
      });
      if (totalDeleted > 0) {
        writeDB(db_path.store, store);
        console.log(chalk.yellow(`[STOCK EXPIRE] Menghapus otomatis ${totalDeleted} stok yang sudah expired.`));
      }
    } catch (e) {
      console.error("Gagal cleanup expired stocks:", e);
    }
  };

  // Jalankan auto-cleanup stok expired setiap 1 jam
  setInterval(cleanupExpiredStocks, 60 * 60 * 1000);
  cleanupExpiredStocks(); // Jalankan sekali saat startup
}

async function sendBackupToOwner(ctx) {
  try {
    const AdmZip = require("adm-zip");
    const zip = new AdmZip();
    
    // Backup all files and folders in root except node_modules, lockfiles, and previous backups
    const EXCLUDE_FILES = ["node_modules", "package-lock.json", "yarn.lock", ".git"];
    const items = fs.readdirSync(__dirname);
    items.forEach(item => {
      if (EXCLUDE_FILES.includes(item) || item.endsWith(".zip") || item.startsWith(".")) return;
      const p = require("path").join(__dirname, item);
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        zip.addLocalFolder(p, item);
      } else {
        zip.addLocalFile(p);
      }
    });
    
    const buffer = zip.toBuffer();
    const timestamp = moment().format("YYYYMMDD_HHmmss");
    const docOpts = { source: buffer, filename: `Backup_Bot_${timestamp}.zip` };
    const extraOpts = { caption: "✅ *BACKUP SUKSES*\n\nBerikut adalah cadangan file dan database bot Anda.", parse_mode: "Markdown" };
    if (ctx) {
      await ctx.replyWithDocument(docOpts, extraOpts);
    } else {
      await bot.telegram.sendDocument(OWNER_ID, docOpts, extraOpts);
    }
  } catch (e) {
    console.error("Gagal mengirim backup:", e);
    if (ctx) ctx.reply("❌ Terjadi kesalahan saat membuat file zip backup.");
  }
}

// === CONFIG SYNC ===
moment.tz.setDefault("Asia/Jakarta").locale("id");
const tanggal = () => moment.tz("Asia/Jakarta").format("DD MMMM YYYY");

const PAKASIR_KEY = global.PAKASIR_API_KEY;
const PAKASIR_SLUG = global.PAKASIR_PROJECT_SLUG;
const OWNER_ID = String(global.OWNER_ID);

db_path.settings = "database/settings.json";

function getSettings() {
  let s = {
    referral: true,
    language: true,
    sticker: true,
    ref_bonus: 5000,
  };
  try {
    const data = require("fs").readFileSync(db_path.settings, "utf8");
    s = { ...s, ...JSON.parse(data) };
  } catch (e) { }
  return s;
}

function processReferralClaim(u, userIdx) {
  if (u[userIdx].referredBy && !u[userIdx].refClaimed) {
    const s = getSettings();
    if (s.referral) {
      const inviterId = u[userIdx].referredBy;
      const invIdx = u.findIndex((x) => String(x.id) === String(inviterId));
      if (invIdx !== -1) {
        // FIX: Gunakan Number() agar tidak NaN jika balance undefined
        u[invIdx].balance = (Number(u[invIdx].balance) || 0) + Number(s.ref_bonus || 0);
        u[invIdx].refs = (u[invIdx].refs || 0) + 1;
        u[invIdx].refBonus = (u[invIdx].refBonus || 0) + Number(s.ref_bonus || 0);
        u[userIdx].refClaimed = true;

        const referredName = u[userIdx].name || "Seseorang";
        // FIX: Konversi inviterId ke Number agar sendMessage bekerja benar
        bot.telegram
          .sendMessage(
            Number(inviterId),
            `🎉 *BONUS REFERRAL DITERIMA!*\n━━━━━━━━━━━━━━━━━━━━━\n👤 *${referredName}* baru saja bergabung menggunakan link referral Anda!\n💰 Saldo Anda bertambah: *+Rp ${Number(s.ref_bonus || 0).toLocaleString("id-ID")}*\n💵 Total Saldo: *Rp ${u[invIdx].balance.toLocaleString("id-ID")}*\n━━━━━━━━━━━━━━━━━━━━━\n🔗 Terus bagikan link referral Anda untuk mendapat lebih banyak bonus!`,
            { parse_mode: "Markdown" },
          )
          .catch(() => { });
      }
    }
  }
}

function updateSetting(key, val) {
  const s = getSettings();
  s[key] = val;
  require("fs").writeFileSync(db_path.settings, JSON.stringify(s, null, 2));
}

const THUMBNAIL = global.thumbnail || "./options/image/thumbnail.jpg";

const bot = new Telegraf(global.BOT_TOKEN);
const userState = new Map();
const activeChats = new Map();

// === HELPER: Parse Channel/Group URL dengan Topic ID ===
function parseChannelTarget(url) {
  if (!url || url.trim() === "") return { chatId: null, threadId: null };
  const str = url.trim();
  // Format: https://t.me/username/topicId
  const match = str.match(/t\.me\/([^\/]+)\/(\d+)/);
  if (match) {
    return { chatId: "@" + match[1], threadId: parseInt(match[2]) };
  }
  // Format: https://t.me/username
  const match2 = str.match(/t\.me\/([^\/]+)/);
  if (match2) {
    return { chatId: "@" + match2[1], threadId: null };
  }
  // Jika sudah berupa chatId langsung (misal -100xxx atau @username)
  return { chatId: str, threadId: null };
}

const locales = require("./database/messages.json");
const getText = (langCode, key, params = {}) => {
  const lang = langCode || "id";
  let text = locales[lang]?.[key] || locales["id"]?.[key] || key;
  for (const [k, v] of Object.entries(params)) {
    text = text.replace(new RegExp(`{${k}}`, "g"), v);
  }
  return text;
};

/**
 * FUNGSI KIRIM STIKER SUKSES
 */
async function sendSuccessSticker(userId) {
  const settings = readDB(db_path.settings);
  if (settings.success_sticker) {
    try {
      if (getSettings().sticker)
        await bot.telegram
          .sendSticker(userId, settings.success_sticker)
          .catch(() => { });
    } catch (e) {
      log.error("Gagal mengirim stiker sukses", e);
    }
  }
}

/**
 * FUNGSI KIRIM STIKER BATAL
 */
async function sendCancelSticker(userId) {
  const settings = readDB(db_path.settings);
  if (settings.cancel_sticker) {
    try {
      if (getSettings().sticker)
        await bot.telegram
          .sendSticker(userId, settings.cancel_sticker)
          .catch(() => { });
    } catch (e) {
      log.error("Gagal mengirim stiker batal", e);
    }
  }
}

/**
 * PAKASIR API CORE
 */


async function checkStatusPakasir(orderId, amount) {
  try {
    const url = `https://app.pakasir.com/api/transactiondetail?project=${PAKASIR_SLUG}&order_id=${orderId}&amount=${amount}&api_key=${PAKASIR_KEY}`;
    const res = await axios.get(url, { timeout: 10000 });

    if (res.data && res.data.transaction) {
      const status = res.data.transaction.status.toLowerCase();
      if (status === "completed" || status === "success" || status === "paid" || status === "settlement") {
        return "PAID";
      }
    }
    return "UNPAID";
  } catch (e) {
    return "ERROR";
  }
}

/**
 * FUNGSI MENGIRIM NOTIFIKASI CATATAN PEMBELI KHUSUS
 */
async function sendCatatanNotif(tx, users) {
  if (!global.CATATAN || global.CATATAN.trim() === "") return;
  if (!tx.note || tx.note.trim() === "") return;

  try {
    const { chatId: chUsername, threadId: chThreadId } = parseChannelTarget(global.CATATAN);
    if (!chUsername) return;

    const uIdx = users.findIndex((u) => String(u.id) === String(tx.userId));
    const b_user = uIdx !== -1 ? users[uIdx] : null;
    const b_name = b_user ? b_user.name : "User";
    const b_username = b_user && b_user.username ? ` (@${b_user.username})` : "";
    const safeNameStr = sanitizeMD(b_name + b_username);
    
    const isSaldo = tx.orderId ? tx.orderId.startsWith("BAL") : false;
    const paymentMethod = isSaldo ? "SALDO" : "QRIS";
    const invId = tx.orderId || `INV${moment().format("YYYYMMDDHHmmss")}`;

    const chMsg = `📝 *CATATAN PEMBELI BARU* 📝
━━━━━━━━━━━━━━━━━━━━━
🛍️ Produk    : ${tx.productName}
📦 Jumlah    : ${tx.qty}x
🧾 Order ID  : #${invId}
💰 Total     : Rp ${tx.amount.toLocaleString("id-ID")}
💳 Metode    : ${paymentMethod}
━━━━━━━━━━━━━━━━━━━━━
👤 Pembeli   : ${safeNameStr}
🔗 Profil    : [Link Profil](tg://user?id=${tx.userId})
━━━━━━━━━━━━━━━━━━━━━
📋 ISI CATATAN:
\`${tx.note}\`
━━━━━━━━━━━━━━━━━━━━━`;

    await bot.telegram.sendMessage(chUsername, chMsg, {
      parse_mode: "Markdown",
      ...(chThreadId ? { message_thread_id: chThreadId } : {}),
    });
  } catch (err) {
    log.error("Gagal kirim notifikasi catatan khusus", err);
  }
}

/**
 * FUNGSI PROSES PEMBAYARAN / PENGIRIMAN (VERSI FIXED)
 */
async function processDelivery(tx, users, store) {
  let handled = false;
  try {
    if (tx.type === "topup") {
      const uIdx = users.findIndex((u) => String(u.id) === String(tx.userId));
      if (uIdx !== -1) {
        users[uIdx].balance = Number(users[uIdx].balance || 0) + parseInt(tx.amount);
        tx.status = "success";
        tx.completed_at = moment().format();
        try {
          await bot.telegram.sendMessage(
            tx.userId,
            `✅ *TOPUP BERHASIL*\n━━━━━━━━━━━━━━━━━━━━━\n💰 Saldo: *+Rp ${parseInt(tx.amount).toLocaleString()}*\n💳 Total Saldo Sekarang: *Rp ${users[uIdx].balance.toLocaleString()}*\n\nTerima kasih telah melakukan pengisian saldo.`,
            { parse_mode: "Markdown" },
          );

          // Hapus pesan invoice QRIS jika ada
          if (tx.chatId && tx.invoiceMsgId) {
            await bot.telegram.deleteMessage(tx.chatId, tx.invoiceMsgId).catch(() => {});
          }

          await sendSuccessSticker(tx.userId);
        } catch (msgErr) {
          log.error("Gagal mengirim pesan sukses topup ke user", msgErr);
        }

        // --- KIRIM PESAN SUKSES KE CHANNEL (TOPUP) ---
        try {
          const targetChannel = global.CHANNEL;
          if (targetChannel && targetChannel.trim() !== "") {
            const { chatId: chUsername, threadId: chThreadId } = parseChannelTarget(targetChannel);

            if (chUsername) {
              const b_user = users[uIdx];
              const b_name = b_user ? b_user.name : "User";
              const safeNameStr = sanitizeMD(b_name);
              const invId = tx.orderId
                ? tx.orderId
                : `TOP${moment().format("YYYYMMDDHHmmss")}`;

              const chMsg = `✅ *Notifikasi Topup Berhasil* ✅\n\nPembeli: *${safeNameStr}*\nID Pesanan: \`${invId}\`\nMetode Bayar: _QRIS_\nTotal Topup: *Rp${tx.amount.toLocaleString("id-ID")}*\n\n_Terima kasih telah mempercayakan transaksi Anda kepada kami!_ 🚀\n\n#TopupBerhasil #BuktiPembayaran #AutoBot`;
              await bot.telegram.sendMessage(chUsername, chMsg, {
                parse_mode: "Markdown",
                ...(chThreadId ? { message_thread_id: chThreadId } : {}),
              });
            }
          }
        } catch (errChannel) {
          log.error("Gagal kirim notif topup ke channel", errChannel);
        }

        handled = true;
      }
    } else if (tx.type === "direct") {
      const pIdx = store.products.findIndex((p) => p.id === tx.productId);
      if (pIdx !== -1) {
        const product = store.products[pIdx];
        if (product.stocks.length >= tx.qty) {
          const items = product.stocks.splice(0, tx.qty);
          tx.status = "success";
          tx.completed_at = moment().format();

          const detail = items
            .map((it, i) => {
              let obj = it;
              if (typeof it === "string") {
                const parts = it.split("|");
                // Format: email|password|2fa|pin|profile
                obj = {
                  email: (parts[0] || it).trim(),
                  pw: (parts[1] || "").trim(),
                  twoFA: (parts[2] || "").trim(),
                  pin: (parts[3] || "").trim(),
                  profile: (parts[4] || "").trim(),
                  isLink: !parts[1] || parts[1].trim() === ""
                };
              }

              if (obj.isLink || !obj.pw) {
                let content = obj.email;
                if (content.startsWith("http")) {
                  return `Data ${i + 1}:\n🔗 ${content}`;
                } else {
                  return `Data ${i + 1}:\n${content}`;
                }
              } else {
                let str = `Data ${i + 1}:\nEmail : ${obj.email}\nPassword : ${obj.pw}`;
                if (obj.twoFA) str += `\n2FA/Recovery : ${obj.twoFA}`;
                if (obj.pin) str += `\nPIN : ${obj.pin}`;
                if (obj.profile) str += `\nProfile : ${obj.profile}`;
                return str;
              }
            })
            .join("\n\n");

          // --- LOGIKA PESAN SUKSES DINAMIS & RATING ---
          let extraText = product.success_msg
            ? `\n\n${product.success_msg}`
            : "";

          let u = readDB(db_path.user).find(
            (x) => String(x.id) === String(tx.userId),
          );
          let lang = u ? u.lang_code || "id" : "id";

          const msg1_summary =
            getText(lang, "msg_success", {
              name: tx.productName,
              qty: tx.qty,
              total: tx.amount.toLocaleString("id-ID"),
              date: moment.tz("Asia/Jakarta").format("DD/MM/YYYY HH:mm:ss [WIB]"),
            });

          const msg2_data = getText(lang, "msg_order_data", { data: detail }) + extraText;

          const msg3_rating = getText(lang, "msg_rating");

          const kbRating = Markup.inlineKeyboard([
            [
              Markup.button.callback("⭐", "rate_1"),
              Markup.button.callback("⭐⭐", "rate_2"),
              Markup.button.callback("⭐⭐⭐", "rate_3"),
            ],
            [
              Markup.button.callback("⭐⭐⭐⭐", "rate_4"),
              Markup.button.callback("⭐⭐⭐⭐⭐", "rate_5"),
            ],
          ]);

          // KIRIM PESAN 1: Summary
          await bot.telegram.sendMessage(tx.userId, msg1_summary, {
            parse_mode: "Markdown",
          });

          // Hapus pesan invoice QRIS jika ada
          if (tx.chatId && tx.invoiceMsgId) {
            await bot.telegram.deleteMessage(tx.chatId, tx.invoiceMsgId).catch(() => {});
          }

          // Jeda 3 detik sebelum kirim data akun
          await new Promise(r => setTimeout(r, 3000));

          // KIRIM PESAN 2: Data + Tutorial (Custom Video jika ada)
          // Jika qty > 5, kirim data sebagai file .txt
          if (tx.qty > 5) {
            const txtContent = items
              .map((it, i) => {
                let obj = it;
                if (typeof it === "string") {
                  const parts = it.split("|");
                  obj = {
                    email: (parts[0] || it).trim(),
                    pw: (parts[1] || "").trim(),
                    twoFA: (parts[2] || "").trim(),
                    pin: (parts[3] || "").trim(),
                    profile: (parts[4] || "").trim(),
                    isLink: !parts[1] || parts[1].trim() === "",
                  };
                }
                if (obj.isLink || !obj.pw) {
                  return `Data ${i + 1}:\n${obj.email}`;
                } else {
                  let str = `Data ${i + 1}:\nEmail : ${obj.email}\nPassword : ${obj.pw}`;
                  if (obj.twoFA) str += `\n2FA/Recovery : ${obj.twoFA}`;
                  if (obj.pin) str += `\nPIN : ${obj.pin}`;
                  if (obj.profile) str += `\nProfile : ${obj.profile}`;
                  return str;
                }
              })
              .join("\n\n");

            const fileBuffer = Buffer.from(txtContent, "utf-8");
            const fileName = `${tx.productName.replace(/[^a-zA-Z0-9]/g, "_")}_${tx.qty}x_${moment().format("YYYYMMDDHHmmss")}.txt`;
            const captionTxt = getText(lang, "msg_order_data_file", { name: tx.productName, qty: tx.qty });

            try {
              if (product.mediaId) {
                // Kirim media tutorial dulu
                try {
                  await bot.telegram.sendVideo(tx.userId, product.mediaId, {
                    caption: captionTxt,
                    parse_mode: "Markdown",
                  });
                } catch (e) {
                  try {
                    await bot.telegram.sendPhoto(tx.userId, product.mediaId, {
                      caption: captionTxt,
                      parse_mode: "Markdown",
                    });
                  } catch (err) {
                    await bot.telegram.sendMessage(tx.userId, captionTxt, {
                      parse_mode: "Markdown",
                    });
                  }
                }
              } else {
                await bot.telegram.sendMessage(tx.userId, captionTxt, {
                  parse_mode: "Markdown",
                });
              }
              // Kirim file .txt data akun
              await bot.telegram.sendDocument(tx.userId, {
                source: fileBuffer,
                filename: fileName,
              }, {
                caption: `📎 *File Data Akun* — ${tx.qty} item${extraText}`,
                parse_mode: "Markdown",
              });
            } catch (fileErr) {
              log.error("Gagal kirim file data akun, fallback ke pesan teks", fileErr);
              // Fallback: kirim sebagai teks jika gagal kirim file
              await bot.telegram.sendMessage(tx.userId, msg2_data, {
                parse_mode: "Markdown",
              });
            }
          } else if (product.mediaId) {
            try {
              // Coba kirim sebagai video, jika gagal coba photo/dokumen
              await bot.telegram.sendVideo(tx.userId, product.mediaId, {
                caption: msg2_data,
                parse_mode: "Markdown",
              });
            } catch (e) {
              try {
                await bot.telegram.sendPhoto(tx.userId, product.mediaId, {
                  caption: msg2_data,
                  parse_mode: "Markdown",
                });
              } catch (err) {
                await bot.telegram.sendMessage(tx.userId, msg2_data, {
                  parse_mode: "Markdown",
                });
              }
            }
          } else {
            await bot.telegram.sendMessage(tx.userId, msg2_data, {
              parse_mode: "Markdown",
            });
          }

          // KIRIM PESAN 3: Rating
          await bot.telegram.sendMessage(tx.userId, msg3_rating, {
            parse_mode: "Markdown",
            ...kbRating,
          });

           // --- KIRIM PESAN SUKSES KE CHANNEL ---
          try {
            const targetChannel = global.CHANNEL;
            if (targetChannel && targetChannel.trim() !== "") {
              const { chatId: chUsername, threadId: chThreadId } = parseChannelTarget(targetChannel);

              if (chUsername) {
                const b_user = users.find(
                  (u) => String(u.id) === String(tx.userId),
                );
                
                // Gunakan username jika ada, fallback ke nama jika tidak punya username
                const targetName = (b_user && b_user.username) ? b_user.username : (b_user ? b_user.name : "User");
                const isUsername = b_user && b_user.username;

                const invId = tx.orderId
                  ? tx.orderId
                  : `INV${moment().format("YYYYMMDDHHmmss")}`;

                // Sensor nama: huruf pertama + xxx + huruf terakhir (Aman untuk emoji)
                const censorName = (name) => {
                  if (!name) return "xxx";
                  const chars = Array.from(name);
                  if (chars.length <= 2) return name;
                  return chars[0] + "x".repeat(Math.min(chars.length - 2, 3)) + chars[chars.length - 1];
                };
                
                let censoredNameText = censorName(sanitizeMD(targetName));
                let formattedPembeli = "";
                if (isUsername) {
                  // Username: format mono
                  formattedPembeli = `\`@${censoredNameText}\``;
                } else {
                  // Display name: format bold
                  formattedPembeli = `*${censoredNameText}*`;
                }

                const isSaldo = invId.startsWith("BAL");
                const paymentMethod = isSaldo ? "💵 SALDO" : "🏦 QRIS";
                const orderTime = moment().tz("Asia/Jakarta").format("DD/MM/YYYY • HH:mm [WIB]");
                const categoryName = product.category || tx.productName;
                const variantName = product.name || tx.productName;
                const chMsg = `🎉 *NEW ORDER RECEIVED!* 🎉
━━━━━━━━━━━━━━━━━━━━━━━
🛍️ *DETAIL PESANAN*
├ Pembeli   : ${formattedPembeli}
├ Produk    : *${sanitizeMD(categoryName)}*
├ Variant   : *${sanitizeMD(variantName)}*
├ Jumlah    : *${tx.qty}x*
├ Total     : *Rp ${tx.amount.toLocaleString("id-ID")}*
├ Metode    : ${paymentMethod}
└ Order ID  : \`#${invId}\`
━━━━━━━━━━━━━━━━━━━━━━━
🕐 ${orderTime}
━━━━━━━━━━━━━━━━━━━━━━━`;

                await bot.telegram.sendMessage(chUsername, chMsg, {
                  parse_mode: "Markdown",
                  ...(chThreadId ? { message_thread_id: chThreadId } : {}),
                });
              }
            }

            // --- KIRIM NOTIF CATATAN KHUSUS ---
            if (tx.note) {
              await sendCatatanNotif(tx, users);
            }
          } catch (errChannel) {
            log.error("Gagal kirim notif ke channel", errChannel);
          }

          handled = true;
        } else {
          await bot.telegram.sendMessage(
            tx.userId,
            `⚠️ *PEMBAYARAN SUKSES* tapi stok *${tx.productName}* baru saja habis. Mohon hubungi Admin untuk klaim manual.`,
          );
          tx.status = "error_stok";
          handled = true;
        }
      }
    }
  } catch (e) {
    console.log("Delivery Error", e);
  }
  return handled;
}

/**
 * LOGIKA PENGAJUAN TOPUP
 */


async function createTopupRequest(ctx, amount) {
  let user = readDB(db_path.user).find(
    (x) => String(x.id) === String(ctx.from.id),
  );
  let lang = user ? user.lang_code || "id" : "id";

  if (isNaN(amount) || amount < 1000) {
    return ctx.reply(getText(lang, "tu_err_min"));
  }

  const orderId = `TOP${Date.now()}`;
  const waitMsg = await ctx.reply(getText(lang, "tu_wait"));

  const unlock = await dbMutex.lock();
  try {
    const payload = {
      project: PAKASIR_SLUG,
      order_id: orderId,
      amount: parseInt(amount),
      api_key: PAKASIR_KEY
    };
    const res = await axios.post(
      "https://app.pakasir.com/api/transactioncreate/qris",
      payload,
      { headers: { "Content-Type": "application/json" }, timeout: 10000 },
    );

    if (res.data && res.data.payment) {
      const qr = await QRCode.toBuffer(res.data.payment.payment_number);
      let txs = readDB(db_path.trx);
      txs.push({
        orderId,
        invoiceId: res.data.payment.order_id,
        userId: ctx.from.id,
        amount,
        total_amount: res.data.payment.total_payment,
        status: "pending",
        type: "topup",
        date: moment().format(),
        chatId: ctx.chat.id,
      });
      writeDB(db_path.trx, txs);

      try {
        await bot.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id);
      } catch (e) { }

      const invoiceMsg = await ctx.replyWithPhoto(
        { source: qr },
        {
          caption: getText(lang, "tu_invoice", {
            id: orderId,
            total: res.data.payment.total_payment.toLocaleString("id-ID"),
          }),
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                getText(lang, "btn_check_manual"),
                `check_trx_${orderId}`,
              ),
            ],
            [
              Markup.button.callback(
                getText(lang, "btn_cancel_pay"),
                `cancel_trx_${orderId}`,
              ),
            ],
          ]),
        },
      );

      // Simpan message ID invoice ke transaksi agar bisa dihapus saat sukses
      const txIdx = txs.findIndex(t => t.orderId === orderId);
      if (txIdx !== -1) {
        txs[txIdx].invoiceMsgId = invoiceMsg.message_id;
        writeDB(db_path.trx, txs);
      }
    } else {
      throw new Error("Gagal membuat QRIS: " + JSON.stringify(res.data));
    }
  } catch (e) {
    console.error(e);
    ctx.reply("❌ Gagal membuat permintaan topup.");
  } finally {
    unlock();
  }
}

function revertKuota(tx) {
  if (tx.voucherApplied) {
    let promos = readDB(db_path.promo);
    const vIdx = promos.findIndex((p) => p.code === tx.voucherApplied);
    if (vIdx !== -1 && promos[vIdx].usedBy) {
      const uIdx = promos[vIdx].usedBy.indexOf(tx.userId);
      if (uIdx !== -1) {
        promos[vIdx].usedBy.splice(uIdx, 1);
        writeDB(db_path.promo, promos);
      }
    }
  }
}

/**
 * LOOP PENGECEKAN TRANSAKSI
 */
async function paymentLoop() {
  const unlock = await dbMutex.lock();
  try {
    let trxs = readDB(db_path.trx);
    let users = readDB(db_path.user);
    let store = readDB(db_path.store);
    let changed = false;

    for (let tx of trxs) {
      if (tx.status === "pending") {
        const txTime = moment(tx.date);
        if (moment().diff(txTime, "minutes") > 6) {
          tx.status = "expired";
          revertKuota(tx);
          changed = true;
          continue;
        }

        let status = "UNPAID";
        status = await checkStatusPakasir(tx.orderId, tx.amount);

        if (status === "PAID") {
          if (await processDelivery(tx, users, store)) changed = true;
        }
      }
    }

    if (changed) {
      writeDB(db_path.trx, trxs);
      writeDB(db_path.user, users);
      writeDB(db_path.store, store);
    }
  } finally {
    unlock();
  }
}

// === KEYBOARDS ===
const kbMain = (id) => Markup.removeKeyboard();

const kbAdmin = {
  reply_markup: {
    keyboard: [
      [{ text: "➕ Tambah Data" }, { text: "✏️ Edit Data" }],
      [{ text: "📦 Kelola Stok" }, { text: "🗑️ Hapus Data" }],
      [{ text: "🎟️ Promo & Diskon" }, { text: "💰 Kelola Saldo" }],
      [{ text: "📂 Backup Data" }, { text: "📢 Broadcast" }],
      [{ text: "⚙️ Fitur & Pengaturan" }, { text: "⚙️ Set Sticker" }],
      [{ text: "🌐 Web Dashboard" }, { text: "🔙 Menu Utama" }],
    ],
    resize_keyboard: true,
  },
};

const kbUser = (lang) => ({
  reply_markup: {
    keyboard: [
      [
        { text: getText(lang, "btn_home") },
        { text: getText(lang, "btn_catalog") },
      ],
    ],
    resize_keyboard: true,
  },
});

const kbOwner = (lang) => ({
  reply_markup: {
    keyboard: [
      [
        { text: getText(lang, "btn_home") },
        { text: getText(lang, "btn_catalog") },
      ],
      [{ text: getText(lang, "btn_admin") }],
    ],
    resize_keyboard: true,
  },
});

const kbAddMenu = {
  reply_markup: {
    keyboard: [
      [{ text: "➕ Kategori" }, { text: "➕ Produk" }],
      [{ text: "🔙 Menu Admin" }],
    ],
    resize_keyboard: true,
  },
};

const kbEditMenu = {
  reply_markup: {
    keyboard: [
      [{ text: "✏️ Edit Kategori" }, { text: "✏️ Edit Produk" }],
      [{ text: "🔙 Menu Admin" }],
    ],
    resize_keyboard: true,
  },
};

const kbStockMenu = {
  reply_markup: {
    keyboard: [
      [{ text: "➕ Isi Stok" }, { text: "🔑 Ambil Stok" }],
      [{ text: "🔙 Menu Admin" }],
    ],
    resize_keyboard: true,
  },
};

const kbPromoMenu = {
  reply_markup: {
    keyboard: [
      [{ text: "🎟️ Voucher & Promo" }],

      [{ text: "🔙 Menu Admin" }],
    ],
    resize_keyboard: true,
  },
};

const kbDeleteMenu = {
  reply_markup: {
    keyboard: [
      [{ text: "➖ Hapus Kategori" }, { text: "➖ Hapus Produk" }],
      [{ text: "➖ Kosongkan Stok" }],
      [{ text: "🔙 Menu Admin" }],
    ],
    resize_keyboard: true,
  },
};

const kbChat = {
  reply_markup: {
    keyboard: [[{ text: "🛑 AKHIRI CHAT" }]],
    resize_keyboard: true,
  },
};

// === CACHE SYSTEM FOR FORCE SUBSCRIBE ===
const joinCache = new Map();
const JOIN_CACHE_TTL = 5 * 60 * 1000; // 5 menit cache

// === MIDDLEWARE FORCE SUBSCRIBE ===
bot.use(async (ctx, next) => {
  // TAMBAHKAN BARIS INI: Abaikan jika tidak ada konteks user (misal: sistem update/bot diblokir)
  if (!ctx.from || !ctx.from.id) return next();

  // TAMBAHKAN BARIS INI: Abaikan pesan dari grup/channel agar bot tidak merespon di grup
  if (ctx.chat && ctx.chat.type !== "private") return;

  const settings = getSettings();
  if (settings.maintenance && String(ctx.from.id) !== OWNER_ID) {
    if (ctx.callbackQuery) {
      return ctx.answerCbQuery("⚙️ Sistem sedang maintenance.", true).catch(()=>{});
    } else {
      return ctx.reply("⚙️ *MAINTENANCE PROTOCOL ACTIVATED*\n\nSistem sedang dalam perbaikan rutin. Mohon tunggu beberapa saat dan coba lagi nanti.", { parse_mode: "Markdown" }).catch(()=>{});
    }
  }

  if (ctx.message && ctx.message.text && ctx.message.text.startsWith("/start")) {
    let u = readDB(db_path.user);
    let user = u.find((x) => String(x.id) === String(ctx.from.id));
    if (!user) {
      const payload = ctx.message.text.split(" ")[1];
      user = {
        id: ctx.from.id,
        name: ctx.from.first_name,
        balance: 0,
        joined: tanggal(),
        lang_code: "",
      };
      u.push(user);
      if (payload && payload.startsWith("ref_")) {
        const inviterId = payload.split("_")[1];
        if (inviterId !== String(ctx.from.id)) {
          const s = getSettings();
          if (s.referral) {
            user.referredBy = inviterId;
            user.refClaimed = false;
          }
        }
      }
      writeDB(db_path.user, u);
    }
  }

  if (String(ctx.from.id) === OWNER_ID) return next();
  if (ctx.callbackQuery && ctx.callbackQuery.data === "cek_join") return next();

  if (
    ctx.callbackQuery &&
    (ctx.callbackQuery.data === "lang_id" ||
      ctx.callbackQuery.data === "lang_eng")
  )
    return next();

  if (!ctx.message && !ctx.callbackQuery) return next();

  let uList = readDB(db_path.user);
  let userObj = uList.find((x) => String(x.id) === String(ctx.from.id));
  let lang = userObj ? userObj.lang_code || "id" : "id";

  if (global.CHANNEL && global.CHANNEL.trim() !== "") {
    try {
      let targetChat = global.CHANNEL;
      if (targetChat.includes("t.me/") && !targetChat.includes("t.me/+")) {
        targetChat = "@" + targetChat.split("t.me/")[1].split("/")[0];
      } else if (targetChat.includes("t.me/+")) {
        targetChat = null;
      }
      if (targetChat && !isNaN(Number(targetChat)))
        targetChat = Number(targetChat);

      if (targetChat) {
        let isJoined = false;
        const cacheKey = `${ctx.from.id}_${targetChat}`;
        
        if (joinCache.has(cacheKey) && (Date.now() - joinCache.get(cacheKey).time < JOIN_CACHE_TTL)) {
            isJoined = joinCache.get(cacheKey).status;
        } else {
            try {
                const member = await bot.telegram.getChatMember(targetChat, ctx.from.id);
                isJoined = (member.status !== "left" && member.status !== "kicked");
                joinCache.set(cacheKey, { status: isJoined, time: Date.now() });
            } catch (err) {
                isJoined = true; // Anggap sudah join untuk mencegah nge-block semua user jika terjadi error API
            }
        }

        if (!isJoined) {
          const safeNameHtml = sanitizeHTML(ctx.from.first_name || "Kak");
          const textLock = getText(lang, "fs_lock", { name: safeNameHtml });
          const btnLink = global.CHANNEL.includes("t.me")
            ? global.CHANNEL
            : `https://t.me/c/${global.CHANNEL.replace("-100", "")}/1`;

          const kbLock = Markup.inlineKeyboard([
            [Markup.button.url(getText(lang, "fs_btn_join"), btnLink)],
            [Markup.button.callback(getText(lang, "fs_btn_check"), "cek_join")],
          ]);

          if (ctx.callbackQuery) {
            return ctx
              .answerCbQuery(getText(lang, "fs_alert_lock"), {
                show_alert: true,
              })
              .catch(() => { });
          } else {
            return ctx.reply(textLock, {
              parse_mode: "HTML",
              ...kbLock,
              disable_web_page_preview: true,
            });
          }
        }
      }
    } catch (e) {
      console.log("Error Force Join:", e.message);
    }
  }

  return next();
});

bot.action("cek_join", async (ctx) => {
  let uList = readDB(db_path.user);
  let userObj = uList.find((x) => String(x.id) === String(ctx.from.id));
  let lang = userObj ? userObj.lang_code || "id" : "id";

  try {
    let targetChat = global.CHANNEL;
    if (targetChat.includes("t.me/") && !targetChat.includes("t.me/+")) {
      targetChat = "@" + targetChat.split("t.me/")[1].split("/")[0];
    } else if (targetChat.includes("t.me/+")) {
      targetChat = null;
    }
    if (targetChat && !isNaN(Number(targetChat)))
      targetChat = Number(targetChat);

    if (targetChat) {
      const member = await bot.telegram.getChatMember(targetChat, ctx.from.id);
      const isJoined = member.status !== "left" && member.status !== "kicked";
      
      const cacheKey = `${ctx.from.id}_${targetChat}`;
      joinCache.set(cacheKey, { status: isJoined, time: Date.now() });

      if (isJoined) {
        await ctx.deleteMessage().catch(() => { });
        return ctx.reply(getText(lang, "fs_success"), { parse_mode: "HTML" });
      } else {
        return ctx.answerCbQuery(getText(lang, "fs_alert_fail"), {
          show_alert: true,
        });
      }
    }
  } catch (e) {
    ctx
      .answerCbQuery(
        "Gagal memverifikasi. Pastikan bot adalah admin di channel/grup.",
      )
      .catch(() => { });
  }
});

// === COMMANDS ===
const getStartMessage = (ctx, user, uLen, trxs) => {
  const hour = moment.tz("Asia/Jakarta").hour();
  const lang = user.lang_code || "id";

  const timeStr = moment
    .tz("Asia/Jakarta")
    .format("dddd, D MMMM YYYY [pukul] HH.mm.ss [WIB]");
  const successTrxs = trxs.filter((x) => x.status === "success");
  const userTrxCount = trxs.filter(
    (x) => String(x.userId) === String(ctx.from?.id) && x.status === "success",
  ).length;
  const botName = (global.BOT_NAME || "STORE").toUpperCase();

  const settings = readDB(db_path.settings);
  const ratings = settings.ratings || [];
  let avgRating = 5.0;
  if (ratings.length > 0) {
    const sum = ratings.reduce((a, b) => a + b.score, 0);
    avgRating = (sum / ratings.length).toFixed(1);
  }
  const reviewCount = ratings.length > 0 ? ratings.length : 0;

  const safeNameHTML = sanitizeHTML(ctx.from?.first_name || "Visitor");
  const username = ctx.from?.username ? `@${ctx.from.username}` : "-";
  const userId = ctx.from?.id || "-";

  const textGreeting = getText(lang, "start_greeting", {
    name: safeNameHTML,
    time: timeStr,
  });
  const textAccount = getText(lang, "start_account", {
    id: userId,
    username,
    balance: user.balance.toLocaleString("id-ID"),
    trx_count: userTrxCount,
  });
  const textStats = getText(lang, "start_stats", {
    rating: avgRating,
    review: reviewCount,
    users: uLen.toLocaleString("id-ID"),
    sold: successTrxs.length.toLocaleString("id-ID"),
  });
  const textQuick = getText(lang, "start_quick");
  const textFooter = getText(lang, "start_footer");

  let text = `🍁 <b>${botName}</b> 🍁
━━━━━━━━━━━━━━━━━━━
${textGreeting}

${textAccount}

${textStats}

${textQuick}

${textFooter}`;

  const kbRows = [];

  kbRows.push([
    Markup.button.callback(getText(lang, "btn_catalog"), "menu_belanja"),
    Markup.button.callback(getText(lang, "btn_topup"), "menu_topup"),
  ]);
  
  const secondRow = [Markup.button.callback(getText(lang, "btn_populer"), "menu_populer")];
  if (getSettings().language) {
      secondRow.push(Markup.button.callback(getText(lang, "btn_change_lang"), "change_lang"));
  }
  kbRows.push(secondRow);

  if (getSettings().referral) {
      kbRows.push([Markup.button.callback("🔗 Kode Referral", "menu_referral")]);
  }
  const kb = Markup.inlineKeyboard(kbRows);

  return { text, kb };
};

bot.command("start", async (ctx) => {
  let u = readDB(db_path.user);
  let user = u.find((x) => String(x.id) === String(ctx.from.id));

  const payload = ctx.message.text?.split(" ")[1];
  if (payload && payload.startsWith("buy_")) {
    const pid = payload.replace("buy_", "");
    if (!user) {
      user = { id: ctx.from.id, name: ctx.from.first_name, balance: 0, joined: tanggal(), lang_code: "" };
      u.push(user);
      writeDB(db_path.user, u);
    }
    ctx.callbackQuery = { message: ctx.message };
    await showCheckoutMenu(ctx, pid, 1, false);
    return;
  }

  userState.delete(ctx.from.id);
  activeChats.delete(ctx.from.id);

  if (getSettings().language && !user.lang_code) {
    const langKb = Markup.inlineKeyboard([
      [
        Markup.button.callback("🇮🇩 Bahasa Indonesia", "lang_id"),
        Markup.button.callback("🇬🇧 English", "lang_eng"),
      ],
    ]);
    return ctx.reply(getText("id", "lang_select"), {
      parse_mode: "HTML",
      ...langKb,
    });
  }

  const userIdx = u.findIndex((x) => String(x.id) === String(ctx.from.id));
  if (userIdx !== -1) {
    processReferralClaim(u, userIdx);
    writeDB(db_path.user, u);
  }

  // --- TAMBAHAN: Set Keyboard Bawah Sesuai Role ---
  const userKb =
    String(ctx.from.id) === OWNER_ID
      ? kbOwner(user.lang_code)
      : kbUser(user.lang_code);
  // Menampilkan keyboard secara permanen (menghapus pesan akan menghilangkan keyboard di Telegram versi terbaru)
  await ctx.reply(getText(user.lang_code, "start_loading"), userKb);
  // ------------------------------------------------

  const { text, kb } = getStartMessage(
    ctx,
    user,
    u.length,
    readDB(db_path.trx),
  );
  try {
    await ctx.replyWithPhoto(
      { source: THUMBNAIL },
      { caption: text, parse_mode: "HTML", ...kb },
    );
  } catch (e) {
    try {
      await ctx.reply(text, { parse_mode: "HTML", ...kb });
    } catch (err) {
      console.error("Error start msg:", err);
      await ctx.reply("Sistem Bot Siap Digunakan. Ketik /produk", kb);
    }
  }
});

bot.action(/lang_(id|eng)/, async (ctx) => {
  const lang = ctx.match[1];
  let u = readDB(db_path.user);
  let userIdx = u.findIndex((x) => String(x.id) === String(ctx.from.id));
  if (userIdx !== -1) {
    u[userIdx].lang_code = lang;
    processReferralClaim(u, userIdx);
    writeDB(db_path.user, u);
    await ctx.deleteMessage().catch(() => { });
    await ctx.reply(getText(lang, "lang_changed"));

    // Continue to start flow
    const userKb =
      String(ctx.from.id) === OWNER_ID ? kbOwner(lang) : kbUser(lang);
    await ctx.reply(getText(lang, "start_loading"), userKb);
    const { text, kb } = getStartMessage(
      ctx,
      u[userIdx],
      u.length,
      readDB(db_path.trx),
    );
    try {
      await ctx.replyWithPhoto(
        { source: THUMBNAIL },
        { caption: text, parse_mode: "HTML", ...kb },
      );
    } catch (e) {
      await ctx.reply(text, { parse_mode: "HTML", ...kb });
    }
  }
});

bot.command("backupdb", async (ctx) => {
  if (String(ctx.from.id) !== OWNER_ID) return;
  const waitMsg = await ctx.reply("⏳ Menyiapkan backup sistem via ZIP...");
  await sendBackupToOwner(ctx);
  await ctx.deleteMessage(waitMsg.message_id).catch(() => { });
});

bot.command("topup", async (ctx) => {
  const amountStr = ctx.message.text.split(" ")[1];
  if (!amountStr)
    return ctx.reply("❌ Format salah. Contoh: `/topup 10000`", {
      parse_mode: "Markdown",
    });
  const amount = parseInt(amountStr);
  await createTopupRequest(ctx, amount);
});


/**
 * COMMAND BALAS UNTUK ADMIN
 * Format: /balas [ID_USER] [PESAN]
 */
bot.command("balas", async (ctx) => {
  if (String(ctx.from.id) !== OWNER_ID) return;
  const args = ctx.message.text.split(" ");
  if (args.length < 3)
    return ctx.reply(
      "❌ Format salah!\nContoh: `/balas 1234567 Halo ada yang bisa dibantu?`",
      { parse_mode: "Markdown" },
    );

  const targetId = args[1];
  const message = args.slice(2).join(" ");

  try {
    await bot.telegram.sendMessage(
      targetId,
      `💬 *PESAN DARI ADMIN:*\n\n${message}`,
      { parse_mode: "Markdown" },
    );
    ctx.reply(`✅ Pesan berhasil terkirim ke user \`${targetId}\`.`, {
      parse_mode: "Markdown",
    });
  } catch (e) {
    ctx.reply(
      `❌ Gagal mengirim pesan ke \`${targetId}\`. User mungkin memblokir bot.`,
    );
  }
});

// === MENU HEARS ===

bot.command(["produk", "daftarproduk", "katalog"], async (ctx) => {
  userState.delete(ctx.from.id);
  const s = readDB(db_path.store);
  const cats = [...new Set(s.categories)].sort();
  const { text, kb } = getCatalogPage(1, cats, s.products);
  try {
    await ctx.replyWithPhoto(
      { source: THUMBNAIL },
      { caption: text, parse_mode: "Markdown", ...kb },
    );
  } catch (e) {
    await ctx.reply(text, { parse_mode: "Markdown", ...kb });
  }
});

bot.hears([/🛒 Belanja/i, /🛒 Shopping/i], async (ctx) => {
  userState.delete(ctx.from.id);
  const s = readDB(db_path.store);
  const cats = [...new Set(s.categories)].sort();
  let user = readDB(db_path.user).find(
    (x) => String(x.id) === String(ctx.from.id),
  );
  let lang = user ? user.lang_code || "id" : "id";
  const { text, kb } = getCatalogPage(1, cats, s.products, lang);
  try {
    await ctx.replyWithPhoto(
      { source: THUMBNAIL },
      { caption: text, parse_mode: "Markdown", ...kb },
    );
  } catch (e) {
    await ctx.reply(text, { parse_mode: "Markdown", ...kb });
  }
});

bot.hears([/🏠 Laman Utama/i, /🏠 Home/i], async (ctx) => {
  userState.delete(ctx.from.id);
  const u = readDB(db_path.user);
  const user = u.find((x) => String(x.id) === String(ctx.from.id));
  if (user) {
    const { text, kb } = getStartMessage(
      ctx,
      user,
      u.length,
      readDB(db_path.trx),
    );
    try {
      await ctx.replyWithPhoto(
        { source: THUMBNAIL },
        { caption: text, parse_mode: "HTML", ...kb },
      );
    } catch (e) {
      await ctx.reply(text, { parse_mode: "HTML", ...kb });
    }
  } else {
    ctx.reply(getText("id", "msg_notfound"));
  }
});

bot.hears(
  [/🛒 Katalog/i, /🛒 Catalog/i, /Katalog/i, /Catalog/i],
  async (ctx) => {
    userState.delete(ctx.from.id);
    const s = readDB(db_path.store);
    const cats = [...new Set(s.categories)].sort();
    let user = readDB(db_path.user).find(
      (x) => String(x.id) === String(ctx.from.id),
    );
    let lang = user ? user.lang_code || "id" : "id";
    const { text, kb } = getCatalogPage(1, cats, s.products, lang);
    try {
      await ctx.replyWithPhoto(
        { source: THUMBNAIL },
        { caption: text, parse_mode: "Markdown", ...kb },
      );
    } catch (e) {
      await ctx.reply(text, { parse_mode: "Markdown", ...kb });
    }
  },
);



bot.hears([/👤 Profil/i, /👤 Profile/i, /Profil/i, /Profile/i], (ctx) => {
  userState.delete(ctx.from.id);
  const u = readDB(db_path.user).find(
    (x) => String(x.id) === String(ctx.from.id),
  );
  if (!u) return ctx.reply(getText("id", "msg_notfound"));

  const lang = u.lang_code || "id";
  const safeNameHtml = sanitizeHTML(u.name);
  const username = ctx.from?.username ? `@${ctx.from.username}` : "-";

  let rank = "Bronze 🥉";
  if (u.balance >= 1000000) rank = "Sultan 👑";
  else if (u.balance >= 500000) rank = "Gold 🥇";
  else if (u.balance >= 100000) rank = "Silver 🥈";

  const trxs = readDB(db_path.trx);
  const userTrxCount = trxs.filter(
    (x) => String(x.userId) === String(u.id) && x.status === "success",
  ).length;

  const text = getText(lang, "prof_card", {
    id: u.id,
    name: safeNameHtml,
    username,
    rank,
    balance: u.balance.toLocaleString("id-ID"),
    joined: u.joined,
    trx_count: userTrxCount,
  });

  const kbRows = [];
  if (getSettings().language)
    kbRows.push([
      Markup.button.callback(getText(lang, "btn_change_lang"), "change_lang"),
    ]);
  if (getSettings().referral)
    kbRows.push([Markup.button.callback("🔗 Kode Referral", "menu_referral")]);
  kbRows.push([
    Markup.button.callback(getText(lang, "btn_bc_home"), "back_to_home"),
  ]);
  const kb = Markup.inlineKeyboard(kbRows);

  ctx.reply(text, { parse_mode: "HTML", ...kb });
});
bot.hears("📊 Stok Produk", (ctx) => {
  userState.delete(ctx.from.id);
  const s = readDB(db_path.store);
  if (s.categories.length === 0) return ctx.reply("Gudang kosong.");
  let t = "📊 *STOK PRODUK TERSEDIA*\n━━━━━━━━━━━━━━━━━━━━━\n\n";
  let sortedCats = [...s.categories].sort((a, b) => {
    const stockA = s.products
      .filter((p) => p.category === a)
      .reduce((sum, p) => sum + p.stocks.length, 0);
    const stockB = s.products
      .filter((p) => p.category === b)
      .reduce((sum, p) => sum + p.stocks.length, 0);
    if (stockA > 0 && stockB === 0) return -1;
    if (stockA === 0 && stockB > 0) return 1;
    return a.localeCompare(b);
  });

  sortedCats.forEach((c) => {
    const prodInCategory = s.products.filter((p) => p.category === c);
    if (prodInCategory.length > 0) {
      t += `📁 *${c.toUpperCase()}*\n`;
      prodInCategory.forEach(
        (p) => (t += `  - ${p.name}: *${p.stocks.length}*\n`),
      );
      t += "\n";
    }
  });
  ctx.reply(t, { parse_mode: "Markdown" });
});

bot.hears("📈 Statistik", (ctx) => {
  userState.delete(ctx.from.id);
  const trxs = readDB(db_path.trx);
  const successTrxs = trxs.filter((x) => x.status === "success");
  const users = readDB(db_path.user);

  let totalRevenue = 0;
  successTrxs.forEach((t) => (totalRevenue += t.amount || 0));

  let res = "📈 *STATISTIK TOKO*\n━━━━━━━━━━━━━━━━━━━━━\n\n";
  res += `👥 Total User: *${users.length}*\n`;
  res += `🧾 Total Transaksi: *${trxs.length}*\n`;
  res += `✅ Transaksi Sukses: *${successTrxs.length}*\n`;
  res += `💰 Total Omset: *Rp ${totalRevenue.toLocaleString()}*\n`;
  res += `━━━━━━━━━━━━━━━━━━━━━`;

  ctx.reply(res, { parse_mode: "Markdown" });
});
bot.hears("🎟️ Voucher & Promo", (ctx) => {
  if (String(ctx.from.id) !== OWNER_ID) return;
  userState.delete(ctx.from.id);
  ctx.reply(
    "🎟 *Pusat Voucher & Promosi*\nSilahkan pilih menu manajemen voucher di bawah ini:",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("➕ Buat Voucher Baru", "adm_vouch_add")],
        [Markup.button.callback("📋 Kelola Voucher Aktif", "adm_vouch_list")],
      ]),
    },
  );
});


bot.hears("📜 Riwayat", async (ctx) => {
  try {
    userState.delete(ctx.from.id);
    const allTrx = readDB(db_path.trx);
    if (!Array.isArray(allTrx))
      return ctx.reply("❌ Database riwayat bermasalah.");
    const tx = allTrx
      .filter((x) => String(x.userId) === String(ctx.from.id))
      .slice(-10)
      .reverse();
    if (tx.length === 0)
      return ctx.reply(
        "📜 *RIWAYAT TRANSAKSI*\n━━━━━━━━━━━━━━━━━━━━━\n\nBelum ada riwayat transaksi.",
        { parse_mode: "Markdown" },
      );
    let res = "📜 *10 RIWAYAT TERAKHIR*\n━━━━━━━━━━━━━━━━━━━━━\n\n";
    tx.forEach((t) => {
      const orderId = t.orderId || "N/A";
      const status = (t.status || "UNKNOWN").toUpperCase();
      const amount =
        typeof t.amount === "number" ? t.amount.toLocaleString() : "0";
      const type = (t.type || "N/A").toUpperCase();
      res += `▫️ \`${orderId}\` | ${status}\n   💰 Rp ${amount} | 💳 ${type}\n\n`;
    });
    await ctx.reply(res, { parse_mode: "Markdown" });
  } catch (e) {
    log.error("Gagal memuat Riwayat", e);
    ctx.reply("❌ Terjadi kesalahan saat mengambil data riwayat.");
  }
});

bot.hears("💳 Isi Saldo", (ctx) => {
  userState.delete(ctx.from.id);
  ctx.reply(
    "Silahkan pilih nominal di bawah atau ketik perintah:\n`/topup [nominal]` (QRIS)\nContoh: `/topup 50000`",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("Rp 5.000", "tu_5000"),
          Markup.button.callback("Rp 10.000", "tu_10000"),
        ],
        [
          Markup.button.callback("Rp 20.000", "tu_20000"),
          Markup.button.callback("Rp 50.000", "tu_50000"),
        ],
      ]),
    },
  );
});

bot.hears("📞 Hubungi Admin", (ctx) => {
  userState.set(ctx.from.id, { step: "ask_support" });
  ctx.reply(
    "☎️ *LAYANAN BANTUAN LIVE*\n\nSilahkan ketik pesan/kendala Anda di bawah ini.\nAdmin akan segera merespon secara langsung.",
    {
      parse_mode: "Markdown",
      ...Markup.keyboard([["🔙 Menu Utama"]]).resize(),
    },
  );
});

bot.hears(["🛠 Menu Admin", "🛠 Admin Menu"], (ctx) => {
  if (String(ctx.from.id) !== OWNER_ID) return;
  userState.delete(ctx.from.id);
  ctx.reply("🛠 *ADMIN PANEL*", kbAdmin);
});

bot.hears("🌐 Web Dashboard", async (ctx) => {
  if (String(ctx.from.id) !== OWNER_ID) return;
  userState.delete(ctx.from.id);
  const s = getSettings();
  const webUser = s.web?.default_user || "admin";
  const webPass = s.web?.default_pass || "password123";
  const webPort = global.WEB_PORT || process.env.SERVER_PORT || 2195;

  let publicIp = "localhost";
  try {
    const axios = require("axios");
    const res = await axios.get("https://api.ipify.org?format=json", { timeout: 3000 });
    if (res.data && res.data.ip) publicIp = res.data.ip;
  } catch (e) {
    // Abaikan jika gagal mengambil IP (bisa fallback ke localhost)
  }

  const link = publicIp === "localhost" ? `http://localhost:${webPort}` : `http://${publicIp}:${webPort}`;

  const msg = `🌐 *AKSES WEB DASHBOARD*\n\nSilakan buka tautan berikut di browser Anda:\n🔗 ${link}\n\n*Kredensial Login:*\n👤 Username: \`${webUser}\`\n🔑 Password: \`${webPass}\`\n\n_Catatan: Jika Anda menggunakan VPS/Panel, salin tautan IP Publik di atas ke browser Anda._`;
  ctx.reply(msg, { parse_mode: "Markdown" });
});

bot.hears("🔙 Menu Admin", (ctx) => {
  if (String(ctx.from.id) !== OWNER_ID) return;
  userState.delete(ctx.from.id);
  ctx.reply("Kembali ke Panel Admin:", kbAdmin);
});

bot.hears("➕ Tambah Data", (ctx) => {
  if (String(ctx.from.id) !== OWNER_ID) return;
  userState.delete(ctx.from.id);
  ctx.reply("Pusat Tambah Data:\nSilakan pilih opsi yang tersedia.", kbAddMenu);
});

bot.hears("✏️ Edit Data", (ctx) => {
  if (String(ctx.from.id) !== OWNER_ID) return;
  userState.delete(ctx.from.id);
  ctx.reply("Pusat Edit Data:\nSilakan pilih opsi yang tersedia.", kbEditMenu);
});

bot.hears("📦 Kelola Stok", (ctx) => {
  if (String(ctx.from.id) !== OWNER_ID) return;
  userState.delete(ctx.from.id);
  ctx.reply(
    "Pusat Manajemen Stok:\nSilakan pilih opsi yang tersedia.",
    kbStockMenu,
  );
});

bot.hears("🎟️ Promo & Diskon", (ctx) => {
  if (String(ctx.from.id) !== OWNER_ID) return;
  userState.delete(ctx.from.id);
  ctx.reply(
    "Pusat Promo dan Diskon:\nSilakan pilih opsi yang tersedia.",
    kbPromoMenu,
  );
});

bot.hears("➕ Kategori", (ctx) => {
  if (String(ctx.from.id) === OWNER_ID) {
    userState.set(ctx.from.id, { step: "adm_cat" });
    ctx.reply(
      "Ketik Nama Kategori Baru dan Deskripsi (Format: Nama Kategori|Deskripsi Kategori):",
    );
  }
});
bot.hears("➕ Produk", (ctx) => {
  if (String(ctx.from.id) === OWNER_ID) {
    userState.set(ctx.from.id, { step: "adm_prod" });
    ctx.reply(
      "Format: `Kategori|Nama|Harga|Deskripsi|Pesan_sukses|HargaGrosir|MinimalBeliGrosir`\n\n_Catatan:_ Dua bagian terakhir opsional.\nContoh Grosir:\n`Diamond|5 DM|5000||Terkirim|4000|5`",
      { parse_mode: "Markdown" },
    );
  }
});
bot.hears("➕ Isi Stok", (ctx) => {
  if (String(ctx.from.id) !== OWNER_ID) return;
  const store = readDB(db_path.store);
  const activeCats = [
    ...new Set(store.products.map((p) => p.category).filter(Boolean)),
  ].sort();
  if (activeCats.length === 0)
    return ctx.reply("❌ Belum ada kategori yang memiliki produk tersimpan.");

  let buttons = [];
  activeCats.forEach((c) => {
    const encodedCat = hashC(c);
    buttons.push([
      Markup.button.callback(`📁 ${c}`, `admstck_c_${encodedCat}`),
    ]);
  });

  ctx.reply("📦 *Pilih Kategori Produk untuk Isi Stok:*", {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(buttons),
  });
});
bot.hears("🔑 Ambil Stok", (ctx) => {
  if (String(ctx.from.id) !== OWNER_ID) return;
  const store = readDB(db_path.store);
  const activeCats = [
    ...new Set(store.products.map((p) => p.category).filter(Boolean)),
  ].sort();
  if (activeCats.length === 0)
    return ctx.reply("❌ Belum ada produk tersimpan.");
  let buttons = [];
  activeCats.forEach((c) => {
    const encodedCat = hashC(c);
    buttons.push([Markup.button.callback(`📁 ${c}`, `d_get_c_${encodedCat}`)]);
  });
  ctx.reply("🔑 *Pilih Kategori Produk untuk Ambil Stok:*", {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(buttons),
  });
});

// --- FITUR HAPUS BARU ---
bot.hears("🗑️ Hapus Data", (ctx) => {
  if (String(ctx.from.id) !== OWNER_ID) return;
  ctx.reply(
    "🗑️ *MENU PENGHAPUSAN DATA*\nSilahkan pilih data yang ingin dihapus:",
    { parse_mode: "Markdown", ...kbDeleteMenu },
  );
});

bot.hears("➖ Hapus Kategori", (ctx) => {
  if (String(ctx.from.id) !== OWNER_ID) return;
  const s = readDB(db_path.store);
  if (s.categories.length === 0) return ctx.reply("Belum ada kategori.");
  userState.set(ctx.from.id, { step: "adm_del_cat" });
  let text =
    "🗑️ *PILIH KATEGORI UNTUK DIHAPUS*\nKetik nama kategori yang ingin dihapus:\n\n";
  s.categories.forEach((c, i) => (text += `${i + 1}. \`${c}\`\n`));
  ctx.reply(text, { parse_mode: "Markdown" });
});

bot.hears("➖ Hapus Produk", (ctx) => {
  if (String(ctx.from.id) !== OWNER_ID) return;
  const store = readDB(db_path.store);
  const activeCats = [
    ...new Set(store.products.map((p) => p.category).filter(Boolean)),
  ].sort();
  if (activeCats.length === 0)
    return ctx.reply("❌ Belum ada produk tersimpan.");
  let buttons = [];
  activeCats.forEach((c) => {
    const encodedCat = hashC(c);
    buttons.push([Markup.button.callback(`📁 ${c}`, `d_delp_c_${encodedCat}`)]);
  });
  ctx.reply("🗑️ *Pilih Kategori dari Produk yang ingin dihapus:*", {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(buttons),
  });
});

bot.hears("✏️ Edit Kategori", (ctx) => {
  if (String(ctx.from.id) !== OWNER_ID) return;
  const store = readDB(db_path.store);
  if (!store.categories || store.categories.length === 0)
    return ctx.reply("❌ Belum ada kategori tersimpan.");

  let buttons = [];
  store.categories.forEach((c) => {
    buttons.push([Markup.button.callback(`✏️ ${c}`, `edit_c_${hashC(c)}`)]);
  });
  ctx.reply("✏️ *Pilih Kategori yang ingin diedit:*", {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(buttons),
  });
});

bot.action(/^edit_c_(.*)$/, async (ctx) => {
  if (String(ctx.from.id) !== OWNER_ID) return;
  const catName = findC(ctx.match[1], readDB(db_path.store).categories);
  userState.set(ctx.from.id, { step: "adm_edit_cat", catName: catName });
  await ctx.deleteMessage().catch(() => { });
  const s = readDB(db_path.store);
  const catDesc =
    s.category_details && s.category_details[catName]
      ? s.category_details[catName]
      : "Deskripsi Kosong";
  ctx.reply(
    `✏️ Masukkan Nama Kategori dan Deskripsi baru untuk *${catName}*\nFormat: \`NamaBaru|DeskripsiBaru\`\nContoh data yang ada:\n\`${catName}|${catDesc}\``,
    {
      parse_mode: "Markdown",
      ...Markup.keyboard([["🔙 Menu Admin"]]).resize(),
    },
  );
});

bot.hears("✏️ Edit Produk", (ctx) => {
  if (String(ctx.from.id) !== OWNER_ID) return;
  const store = readDB(db_path.store);
  const activeCats = [
    ...new Set(store.products.map((p) => p.category).filter(Boolean)),
  ].sort();
  if (activeCats.length === 0)
    return ctx.reply("❌ Belum ada produk tersimpan.");

  let buttons = [];
  activeCats.forEach((c) => {
    buttons.push([Markup.button.callback(`📁 ${c}`, `editp_c_${hashC(c)}`)]);
  });
  ctx.reply("✏️ *Pilih Kategori dari Produk yang ingin diedit:*", {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(buttons),
  });
});

bot.action(/^editp_c_(.*)$/, async (ctx) => {
  if (String(ctx.from.id) !== OWNER_ID) return;
  const store = readDB(db_path.store);
  const activeCats = [
    ...new Set(store.products.map((p) => p.category).filter(Boolean)),
  ];
  const catName = findC(ctx.match[1], activeCats);
  const prods = store.products.filter((p) => p.category === catName);

  if (prods.length === 0)
    return ctx.answerCbQuery("Kategori ini kosong.", true).catch(() => { });

  let buttons = [];
  prods.forEach((p) => {
    buttons.push([Markup.button.callback(`🏷 ${p.name}`, `editp_p_${p.id}`)]);
  });
  await ctx.editMessageText(
    `✏️ *Pilih Produk dalam kategori ${catName} yang ingin diedit:*`,
    { parse_mode: "Markdown", ...Markup.inlineKeyboard(buttons) },
  );
});

bot.action(/^editp_p_(.*)$/, async (ctx) => {
  if (String(ctx.from.id) !== OWNER_ID) return;
  const pId = ctx.match[1];
  const store = readDB(db_path.store);
  const p = store.products.find((x) => x.id === pId);
  if (!p)
    return ctx
      .answerCbQuery("❌ Produk tidak ditemukan.", true)
      .catch(() => { });

  userState.set(ctx.from.id, { step: "adm_edit_prod", pId: p.id });
  await ctx.deleteMessage().catch(() => { });
  ctx.reply(
    `✏️ Masukkan Data Baru untuk *${p.name}*\nFormat: \`Kategori|NamaBaru|HargaBaru|DeskripsiBaru|PesanSuksesBaru|HargaGrosir|MinimalGrosir\`\nContoh data yang ada:\n\`${p.category}|${p.name}|${p.price}|${p.desc}|${p.success_msg}|${p.grosir_price || ""}|${p.grosir_min || ""}\``,
    {
      parse_mode: "Markdown",
      ...Markup.keyboard([["🔙 Menu Admin"]]).resize(),
    },
  );
});

bot.hears("➖ Kosongkan Stok", (ctx) => {
  if (String(ctx.from.id) !== OWNER_ID) return;
  const store = readDB(db_path.store);
  if (!store.categories || store.categories.length === 0)
    return ctx.reply("❌ Belum ada kategori tersimpan.");
  let buttons = [];
  store.categories.forEach((c) => {
    const encodedCat = hashC(c);
    buttons.push([Markup.button.callback(`📁 ${c}`, `d_dels_c_${encodedCat}`)]);
  });
  ctx.reply("🧹 *Pilih Kategori dari Produk yang stoknya ingin dikosongkan:*", {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(buttons),
  });
});

bot.hears("⚙️ Fitur & Pengaturan", (ctx) => {
  if (String(ctx.from.id) !== OWNER_ID) return;
  userState.delete(ctx.from.id);
  const s = getSettings();
  const kb = Markup.inlineKeyboard([
    [
      Markup.button.callback(
        `${s.referral ? "✅" : "❌"} Referral`,
        "toggle_referral",
      ),

    ],
    [
      Markup.button.callback(
        `${s.language ? "✅" : "❌"} Multi Bahasa`,
        "toggle_language",
      ),
      Markup.button.callback(
        `${s.sticker ? "✅" : "❌"} Stiker`,
        "toggle_sticker",
      ),
    ],
    [
      Markup.button.callback(
        `💰 Set Bonus Referral (Rp ${s.ref_bonus.toLocaleString()})`,
        "set_ref_bonus",
      ),
    ],
  ]);
  ctx.reply(
    "⚙️ *Pengaturan Fitur & Toggles*\nSilakan nyalakan/matikan fitur di bawah ini:",
    { parse_mode: "Markdown", ...kb },
  );
});

bot.action(/^toggle_(.*)$/, async (ctx) => {
  if (String(ctx.from.id) !== OWNER_ID) return;
  const key = ctx.match[1];
  const s = getSettings();
  updateSetting(key, !s[key]);

  const ns = getSettings();
  const kb = Markup.inlineKeyboard([
    [
      Markup.button.callback(
        `${ns.referral ? "✅" : "❌"} Referral`,
        "toggle_referral",
      ),

    ],
    [
      Markup.button.callback(
        `${ns.language ? "✅" : "❌"} Multi Bahasa`,
        "toggle_language",
      ),
    ],
    [
      Markup.button.callback(
        `${ns.sticker ? "✅" : "❌"} Stiker`,
        "toggle_sticker",
      ),
    ],
    [
      Markup.button.callback(
        `💰 Set Bonus Referral (Rp ${ns.ref_bonus.toLocaleString()})`,
        "set_ref_bonus",
      ),
    ],
  ]);
  await ctx.editMessageReplyMarkup(kb.reply_markup).catch(() => { });
});

bot.action("set_ref_bonus", async (ctx) => {
  if (String(ctx.from.id) !== OWNER_ID) return;
  userState.set(ctx.from.id, { step: "adm_ref_bonus" });
  ctx.reply("Kirimkan nominal bonus referral baru (angka saja):");
});

bot.hears("⚙️ Set Sticker", (ctx) => {
  if (String(ctx.from.id) === OWNER_ID) {
    ctx.reply("⚙️ *PENGATURAN STIKER*", {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("✅ Stiker Sukses", "set_stk_success")],
        [Markup.button.callback("❌ Stiker Batal", "set_stk_cancel")],
      ]),
    });
  }
});

bot.hears("💰 Kelola Saldo", async (ctx) => {
  if (String(ctx.from.id) === OWNER_ID) {
    userState.delete(ctx.from.id);
    const kb = Markup.inlineKeyboard([
      [Markup.button.callback("➕ Tambah Saldo", "adm_saldo_ui_add")],
      [Markup.button.callback("➖ Kurangi Saldo", "adm_saldo_ui_sub")],
    ]);
    await ctx.reply("💰 *Kelola Saldo User*\nPilih aksi:", {
      parse_mode: "Markdown",
      ...kb,
    });
  }
});

bot.action(/^adm_saldo_ui_(.*)$/, (ctx) => {
  if (String(ctx.from.id) !== OWNER_ID) return;
  const type = ctx.match[1];
  userState.set(ctx.from.id, { step: "adm_saldo_target", type });
  ctx
    .editMessageText(
      "Kirimkan *ID User* yang ingin dikelola saldonya:\n\n_Contoh: 123456789_",
      { parse_mode: "Markdown" },
    )
    .catch(() => { });
});

bot.hears("📢 Broadcast", (ctx) => {
  if (String(ctx.from.id) === OWNER_ID) {
    userState.set(ctx.from.id, { step: "adm_bc" });
    ctx.reply("Kirim pesan yang ingin di-broadcast ke seluruh user:");
  }
});

bot.hears("📂 Backup Data", async (ctx) => {
  if (String(ctx.from.id) !== OWNER_ID) return;
  const waitMsg = await ctx.reply("⏳ Menyiapkan backup sistem via ZIP...");
  await sendBackupToOwner(ctx);
  await ctx.deleteMessage(waitMsg.message_id).catch(() => { });
});

bot.hears(["🔙 Menu Utama", "🏠 Laman Utama", "🏠 Home"], async (ctx) => {
  const id = ctx.from.id;
  const u = readDB(db_path.user);
  const user = u.find((x) => String(x.id) === String(id));
  const lang = user ? user.lang_code || "id" : "id";

  if (activeChats.has(id)) {
    const target = activeChats.get(id);
    activeChats.delete(id);
    activeChats.delete(target);
    const targetUser = u.find((x) => String(x.id) === String(target));
    const targetLang = targetUser ? targetUser.lang_code || "id" : "id";
    bot.telegram.sendMessage(
      target,
      "🛑 Sesi bantuan telah diakhiri oleh lawan bicara.\nKetik /start untuk membuka menu utama.",
      String(target) === OWNER_ID ? kbOwner(targetLang) : kbUser(targetLang),
    );
  }
  userState.delete(id);
  await ctx.reply(
    getText(lang, "msg_loading"),
    String(id) === OWNER_ID ? kbOwner(lang) : kbUser(lang),
  );
  if (user) {
    const { text, kb } = getStartMessage(
      ctx,
      user,
      u.length,
      readDB(db_path.trx),
    );
    try {
      await ctx.replyWithPhoto(
        { source: THUMBNAIL },
        { caption: text, parse_mode: "HTML", ...kb },
      );
    } catch (e) {
      await ctx.reply(text, { parse_mode: "HTML", ...kb });
    }
  }
});

// === ACTION CALLBACKS ===

const safeEditPhoto = async (ctx, source, text, kb, parseMode = "Markdown") => {
  const hasPhoto = ctx.callbackQuery?.message?.photo;
  if (hasPhoto) {
    try {
      await ctx.editMessageCaption(text, { parse_mode: parseMode, ...kb });
    } catch (e) { }
  } else {
    try { await ctx.deleteMessage(); } catch (e) { }
    try {
      await ctx.replyWithPhoto({ source }, { caption: text, parse_mode: parseMode, ...kb });
    } catch (e) {
      await ctx.reply(text, { parse_mode: parseMode, ...kb });
    }
  }
};

const safeEditText = async (ctx, text, kb, parseMode = "Markdown") => {
  const hasPhoto = ctx.callbackQuery?.message?.photo;
  if (hasPhoto) {
    try { await ctx.deleteMessage(); } catch (e) { }
    try { await ctx.reply(text, { parse_mode: parseMode, ...kb }); } catch (e) { }
  } else {
    try {
      await ctx.editMessageText(text, { parse_mode: parseMode, ...kb });
    } catch (e) { }
  }
};


const getCatalogPage = (pageStr, cats, products, langCode) => {
  const lang = langCode || "id";
  cats = [...cats].sort((a, b) => {
    const stockA = products
      .filter((p) => p.category === a)
      .reduce((sum, p) => sum + p.stocks.length, 0);
    const stockB = products
      .filter((p) => p.category === b)
      .reduce((sum, p) => sum + p.stocks.length, 0);
    if (stockA > 0 && stockB === 0) return -1;
    if (stockA === 0 && stockB > 0) return 1;
    return a.localeCompare(b);
  });
  const page = parseInt(pageStr) || 1;
  const limit = 10;
  const totalItems = cats.length;
  const totalPages = Math.ceil(totalItems / limit) || 1;
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const startIndex = (currentPage - 1) * limit;
  const endIndex = Math.min(startIndex + limit, totalItems);
  const pageCats = cats.slice(startIndex, endIndex);

  let text = getText(lang, "cat_title", {
    page: currentPage,
    totalPage: totalPages,
    totalItem: totalItems,
  });

  if (pageCats.length === 0) {
    text += getText(lang, "cat_empty");
  } else {
    let buttonsRow1 = [];
    let buttonsRow2 = [];

    text += `\`━━━━━━━━━━━━━━━━━━━━━\`\n`;
    pageCats.forEach((cName, idx) => {
      const globalNumber = startIndex + idx + 1;
      const localNumber = idx + 1;

      const prodsInCat = products.filter((p) => p.category === cName);
      let totalStock = 0;
      prodsInCat.forEach((p) => (totalStock += p.stocks.length));

      const availText =
        totalStock > 0
          ? `${getText(lang, "cat_stock_avail")}: ${totalStock}`
          : getText(lang, "cat_stock_empty");
      text += `${globalNumber}. ${cName.toUpperCase()}\n   ↳ ${availText}\n`;
      if (idx !== pageCats.length - 1) text += `\n`;

      const encodedName = hashC(cName);
      const btn = Markup.button.callback(
        String(globalNumber),
        `c_${encodedName}`,
      );
      if (localNumber <= 5) buttonsRow1.push(btn);
      else buttonsRow2.push(btn);
    });

    text += getText(lang, "cat_desc");

    let kbArray = [];
    if (buttonsRow1.length > 0) kbArray.push(buttonsRow1);
    if (buttonsRow2.length > 0) kbArray.push(buttonsRow2);

    let navRow = [];
    if (currentPage > 1)
      navRow.push(
        Markup.button.callback(
          getText(lang, "cat_btn_prev"),
          `katalog_page_${currentPage - 1}`,
        ),
      );
    if (currentPage < totalPages)
      navRow.push(
        Markup.button.callback(
          getText(lang, "cat_btn_next"),
          `katalog_page_${currentPage + 1}`,
        ),
      );
    if (navRow.length > 0) kbArray.push(navRow);

    kbArray.push([
      Markup.button.callback(getText(lang, "btn_refresh"), `katalog_page_${currentPage}`),
      Markup.button.callback(getText(lang, "btn_populer"), "menu_populer"),
    ]);
    kbArray.push([
      Markup.button.callback(getText(lang, "btn_bc_home"), "back_to_home"),
    ]);

    return { text, kb: Markup.inlineKeyboard(kbArray) };
  }

  const fallbackKb = Markup.inlineKeyboard([
    [
      Markup.button.callback(getText(lang, "btn_refresh"), `katalog_page_${currentPage}`),
      Markup.button.callback(getText(lang, "btn_populer"), "menu_populer"),
    ],
    [Markup.button.callback(getText(lang, "btn_bc_home"), "back_to_home")],
  ]);
  return { text, kb: fallbackKb };
};

bot.action("menu_belanja", async (ctx) => {
  userState.delete(ctx.from.id);
  const s = readDB(db_path.store);
  const cats = [...new Set(s.categories)].sort();
  let user = readDB(db_path.user).find(
    (x) => String(x.id) === String(ctx.from.id),
  );
  let lang = user ? user.lang_code || "id" : "id";
  const { text, kb } = getCatalogPage(1, cats, s.products, lang);
  await safeEditPhoto(ctx, THUMBNAIL, text, kb, "Markdown");
});

bot.action(/^katalog_page_(.*)$/, async (ctx) => {
  const page = ctx.match[1];
  const s = readDB(db_path.store);
  const cats = [...new Set(s.categories)].sort();
  let user = readDB(db_path.user).find(
    (x) => String(x.id) === String(ctx.from.id),
  );
  let lang = user ? user.lang_code || "id" : "id";
  const { text, kb } = getCatalogPage(page, cats, s.products, lang);
  try {
    await safeEditPhoto(ctx, THUMBNAIL, text, kb, "Markdown");
    await ctx.answerCbQuery();
  } catch (e) {
    await ctx.answerCbQuery("Sudah di halaman ini.", false).catch(() => { });
  }
});

bot.action(/^c_(.*)$/, async (ctx) => {
  try {
    let user = readDB(db_path.user).find(
      (x) => String(x.id) === String(ctx.from.id),
    );
    let lang = user ? user.lang_code || "id" : "id";

    const s = readDB(db_path.store);
    const catName = findC(ctx.match[1], s.categories);
    const trxs = readDB(db_path.trx);

    let prods = s.products.filter((p) => p.category === catName);
    if (prods.length === 0)
      return ctx.answerCbQuery("⚠️ Kategori ini kosong.", true);

    prods.sort((a, b) => {
      const stockA = a.stocks.length;
      const stockB = b.stocks.length;
      if (stockA > 0 && stockB === 0) return -1;
      if (stockA === 0 && stockB > 0) return 1;
      return a.name.localeCompare(b.name);
    });

    const successTrxs = trxs.filter((x) => x.status === "success");
    let totalSoldCat = 0;
    prods.forEach((p) => {
      const soldForProduct = successTrxs
        .filter((tx) => tx.productId === p.id)
        .reduce((sum, tx) => sum + (tx.qty || 1), 0);
      totalSoldCat += soldForProduct;
    });

    const timeStr = moment.tz("Asia/Jakarta").format("HH.mm.ss [WIB]");

    let catDesc = "-";
    if (
      catName &&
      s.category_details &&
      s.category_details[catName.toUpperCase()]
    ) {
      catDesc = s.category_details[catName.toUpperCase()];
    } else if (
      prods.length > 0 &&
      prods[0].desc &&
      prods[0].desc.trim() !== ""
    ) {
      catDesc = prods[0].desc;
    }

    let safeCatName = catName ? sanitizeMD(catName.toUpperCase()) : "KATEGORI";
    let safeCatDesc = sanitizeMD(catDesc).trim() || "-";

    let text = `🛍️ *PRODUK:* ${safeCatName}\n📈 *${getText(lang, "det_sold")}:* ${totalSoldCat}\n📝 *${getText(lang, "det_desc")}:* ${safeCatDesc}\n━━━━━━━━━━━━━━━━━━━━━\n✨ *${getText(lang, "det_variant")}:*\n\n`;

    let variantButtons = [];
    prods.forEach((p, i) => {
      const stock = p.stocks ? p.stocks.length : 0;
      const safePName = sanitizeMD(p.name ? p.name.toUpperCase() : "PRODUK");
      const price = p.price || 0;
      const availText = stock > 0 ? stock : getText(lang, "cat_stock_empty");

      text += `▫️ ${i + 1}. *${safePName}*\n   ↳ Rp ${price.toLocaleString("id-ID")} — Stok: ${availText}\n\n`;

      if (stock > 0) {
        variantButtons.push([
          Markup.button.callback(
            `${p.name.toUpperCase()} - Rp ${price.toLocaleString("id-ID")}`,
            `v_${p.id}_1`,
          ),
        ]);
      }
    });

    text += `━━━━━━━━━━━━━━━━━━━━━\n🕛 _${getText(lang, "det_refresh", { time: timeStr })}_\n`;

    let b = [...variantButtons];
    b.push([
      Markup.button.callback(getText(lang, "btn_refresh"), `c_${ctx.match[1]}`),
      Markup.button.callback(getText(lang, "btn_bc_shop"), "back_to_shop"),
    ]);

    await safeEditText(ctx, text, Markup.inlineKeyboard(b), "Markdown");
    await ctx.answerCbQuery().catch(() => { });
  } catch (err) {
    ctx.answerCbQuery("⚠️ Gagal memuat detail produk.", true).catch(() => { });
  }
});

const getPopularPage = (pageStr, products, trxs, langCode) => {
  const lang = langCode || "id";
  const page = parseInt(pageStr) || 1;
  const limit = 10;

  const successTrxs = trxs.filter(
    (x) => x.status === "success" && x.type === "direct",
  );

  let stats = products
    .map((p) => {
      let soldQty = 0;
      successTrxs
        .filter((tx) => tx.productId === p.id)
        .forEach((tx) => {
          soldQty += tx.qty || 1;
        });
      return { ...p, soldQty };
    })
    .filter((p) => p.soldQty > 0);

  stats.sort((a, b) => b.soldQty - a.soldQty);

  const totalItems = stats.length;
  const totalPages = Math.ceil(totalItems / limit) || 1;
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const startIndex = (currentPage - 1) * limit;
  const endIndex = Math.min(startIndex + limit, totalItems);
  const pageStats = stats.slice(startIndex, endIndex);

  let text = getText(lang, "pop_title", {
    page: currentPage,
    totalPage: totalPages,
  });

  if (pageStats.length === 0) {
    text += getText(lang, "pop_empty");
  } else {
    pageStats.forEach((p, idx) => {
      const globalNumber = startIndex + idx + 1;
      let rankIcon = "🔹";
      if (globalNumber === 1) rankIcon = "🥇";
      else if (globalNumber === 2) rankIcon = "🥈";
      else if (globalNumber === 3) rankIcon = "🥉";

      text += `${rankIcon} *RANK #${globalNumber} - ${p.name.toUpperCase()}*\n 📦 ${getText(lang, "pop_sold")}: ${p.soldQty.toLocaleString("id-ID")} ${getText(lang, "pop_unit")}\n`;
    });
    text += getText(lang, "pop_footer");
  }

  let kbArray = [];
  let navRow = [];
  if (currentPage > 1)
    navRow.push(
      Markup.button.callback(
        getText(lang, "pop_btn_prev"),
        `populer_page_${currentPage - 1}`,
      ),
    );
  if (currentPage < totalPages)
    navRow.push(
      Markup.button.callback(
        getText(lang, "pop_btn_next"),
        `populer_page_${currentPage + 1}`,
      ),
    );
  if (navRow.length > 0) kbArray.push(navRow);

  kbArray.push([
    Markup.button.callback(getText(lang, "btn_catalog"), "menu_belanja"),
  ]);
  kbArray.push([
    Markup.button.callback(getText(lang, "btn_bc_home"), "back_to_home"),
  ]);

  return { text, kb: Markup.inlineKeyboard(kbArray) };
};

bot.action("menu_populer", async (ctx) => {
  userState.delete(ctx.from.id);
  const s = readDB(db_path.store);
  const trxs = readDB(db_path.trx);
  let user = readDB(db_path.user).find(
    (x) => String(x.id) === String(ctx.from.id),
  );
  let lang = user ? user.lang_code || "id" : "id";
  const { text, kb } = getPopularPage(1, s.products, trxs, lang);
  await safeEditText(ctx, text, kb, "Markdown");
});

bot.action(/^populer_page_(.*)$/, async (ctx) => {
  const page = ctx.match[1];
  const s = readDB(db_path.store);
  const trxs = readDB(db_path.trx);
  let user = readDB(db_path.user).find(
    (x) => String(x.id) === String(ctx.from.id),
  );
  let lang = user ? user.lang_code || "id" : "id";
  const { text, kb } = getPopularPage(page, s.products, trxs, lang);
  await safeEditText(ctx, text, kb, "Markdown");
  await ctx.answerCbQuery().catch(() => { });
});

bot.action("menu_topup", async (ctx) => {
  userState.delete(ctx.from.id);
  let user = readDB(db_path.user).find(
    (x) => String(x.id) === String(ctx.from.id),
  );
  let lang = user ? user.lang_code || "id" : "id";
  const text = getText(lang, "tu_method_title", { cs: global.CS_USERNAME || "@oumanlin" });
  const topupRows = [
    [Markup.button.callback(getText(lang, "tu_btn_qris"), "tu_method_qris")],
  ];

  topupRows.push([Markup.button.callback(getText(lang, "btn_bc_home"), "back_to_home")]);
  const kb = Markup.inlineKeyboard(topupRows);
  await safeEditText(ctx, text, kb, "Markdown");
});

bot.action("tu_method_qris", async (ctx) => {
  let user = readDB(db_path.user).find(
    (x) => String(x.id) === String(ctx.from.id),
  );
  let lang = user ? user.lang_code || "id" : "id";
  const text = getText(lang, "tu_method_qris");
  const kb = Markup.inlineKeyboard([
    [
      Markup.button.callback("Rp 5.000", "tu_5000"),
      Markup.button.callback("Rp 10.000", "tu_10000"),
    ],
    [
      Markup.button.callback("Rp 20.000", "tu_20000"),
      Markup.button.callback("Rp 50.000", "tu_50000"),
    ],
    [
      Markup.button.callback(
        "⬅️ " + (lang === "eng" ? "Back" : "Kembali"),
        "menu_topup",
      ),
    ],
  ]);
  await safeEditText(ctx, text, kb, "Markdown");
});



// Removed duplicate menu_populer function

bot.action("menu_referral", async (ctx) => {
  userState.delete(ctx.from.id);
  const u = readDB(db_path.user).find(
    (x) => String(x.id) === String(ctx.from.id),
  );
  if (!u) return;
  const s = getSettings();
  const link = `https://t.me/${ctx.botInfo.username}?start=ref_${ctx.from.id}`;

  const text = `🔗 *SISTEM REFERRAL*\n━━━━━━━━━━━━━━━━━━━━━\nBagikan link ini ke teman Anda:\n\`${link}\`\n\nAnda akan mendapatkan bonus *Rp ${s.ref_bonus.toLocaleString()}* untuk setiap teman yang mendaftar melalui link tersebut!\n\n📊 *Statistik Anda:*\n👥 Teman Diundang: *${u.refs || 0}*\n💰 Total Bonus: *Rp ${(u.refBonus || 0).toLocaleString()}*`;

  const kb = Markup.inlineKeyboard([
    [
      Markup.button.url(
        "Bagikan Link",
        `https://t.me/share/url?url=${encodeURIComponent(link)}&text=Gabung%20sekarang!`,
      ),
    ],
    [Markup.button.callback("⬅️ Kembali", "back_to_home")],
  ]);

  await safeEditText(ctx, text, kb, "Markdown");
  if (ctx.answerCbQuery) await ctx.answerCbQuery().catch(()=>{});
});

bot.action("menu_profil", async (ctx) => {
  userState.delete(ctx.from.id);
  const u = readDB(db_path.user).find(
    (x) => String(x.id) === String(ctx.from.id),
  );
  if (!u) return ctx.answerCbQuery("User tidak ditemukan.", true);

  const lang = u.lang_code || "id";
  const safeNameHtml = sanitizeHTML(u.name);
  const username = ctx.from?.username ? `@${ctx.from.username}` : "-";

  let rank = "Bronze 🥉";
  if (u.balance >= 1000000) rank = "Sultan 👑";
  else if (u.balance >= 500000) rank = "Gold 🥇";
  else if (u.balance >= 100000) rank = "Silver 🥈";

  const trxs = readDB(db_path.trx);
  const userTrxCount = trxs.filter(
    (x) => String(x.userId) === String(u.id) && x.status === "success",
  ).length;

  const text = getText(lang, "prof_card", {
    id: u.id,
    name: safeNameHtml,
    username,
    rank,
    balance: u.balance.toLocaleString("id-ID"),
    joined: u.joined,
    trx_count: userTrxCount,
  });
  const kbRows = [];
  if (getSettings().language) kbRows.push([Markup.button.callback(getText(lang, "btn_change_lang"), "change_lang")]);
  if (getSettings().referral) kbRows.push([Markup.button.callback("🔗 Kode Referral", "menu_referral")]);
  kbRows.push([Markup.button.callback(getText(lang, "btn_bc_home"), "back_to_home")]);
  const kb = Markup.inlineKeyboard(kbRows);
  await safeEditText(ctx, text, kb, "HTML");
});

bot.action("change_lang", async (ctx) => {
  const u = readDB(db_path.user).find(
    (x) => String(x.id) === String(ctx.from.id),
  );
  const lang = u ? u.lang_code || "id" : "id";
  const langKb = Markup.inlineKeyboard([
    [
      Markup.button.callback("🇮🇩 Bahasa Indonesia", "lang_id"),
      Markup.button.callback("🇬🇧 English", "lang_eng"),
    ],
  ]);
  await safeEditText(ctx, getText(lang, "lang_select"), langKb, "HTML");
});

bot.action("menu_admin", async (ctx) => {
  if (String(ctx.from.id) !== OWNER_ID)
    return ctx.answerCbQuery("Akses ditolak.", true);
  userState.delete(ctx.from.id);
  await ctx.reply("🛠 *ADMIN PANEL*", kbAdmin);
});

bot.action("back_to_home", async (ctx) => {
  const u = readDB(db_path.user);
  const user = u.find((x) => String(x.id) === String(ctx.from.id));
  if (!user) return ctx.answerCbQuery("User tidak ditemukan.", true);

  const { text, kb } = getStartMessage(
    ctx,
    user,
    u.length,
    readDB(db_path.trx),
  );
  await safeEditPhoto(ctx, THUMBNAIL, text, kb, "HTML");
});

bot.action("back_to_shop", async (ctx) => {
  const s = readDB(db_path.store);
  const cats = [...new Set(s.categories)].sort();
  let user = readDB(db_path.user).find(
    (x) => String(x.id) === String(ctx.from.id),
  );
  let lang = user ? user.lang_code || "id" : "id";
  const { text, kb } = getCatalogPage(1, cats, s.products, lang);
  await safeEditPhoto(ctx, THUMBNAIL, text, kb, "Markdown");
});

bot.action(/^accept_chat_(.*)$/, async (ctx) => {
  const userId = ctx.match[1];
  if (String(ctx.from.id) !== OWNER_ID) return;

  activeChats.set(OWNER_ID, userId);
  activeChats.set(userId, OWNER_ID);
  userState.delete(userId);

  await ctx.answerCbQuery("✅ Chat terhubung!");
  await ctx.editMessageText(
    `✅ Terhubung dengan user \`${userId}\`.\nKetik apa saja untuk membalas, atau kirim media.`,
    { parse_mode: "Markdown" },
  );
  await bot.telegram.sendMessage(
    userId,
    "✅ Admin telah memasuki room chat. Sampaikan kendala Anda secara live sekarang.",
    kbChat,
  );
});

bot.action("set_stk_success", (ctx) => {
  userState.set(ctx.from.id, { step: "adm_set_sticker_success" });
  ctx.answerCbQuery();
  ctx.reply("Silahkan kirim stiker untuk notifikasi *SUKSES*.");
});

bot.action("set_stk_cancel", (ctx) => {
  userState.set(ctx.from.id, { step: "adm_set_sticker_cancel" });
  ctx.answerCbQuery();
  ctx.reply("Silahkan kirim stiker untuk notifikasi *BATAL*.");
});

bot.action(/^check_trx_(.*)$/, async (ctx) => {
  const unlock = await dbMutex.lock();
  try {
    const orderId = ctx.match[1];
    let trxs = readDB(db_path.trx);
    let users = readDB(db_path.user);
    let store = readDB(db_path.store);
    const tx = trxs.find((x) => x.orderId === orderId);
    if (!tx) return ctx.answerCbQuery("❌ Transaksi tidak ditemukan.", true);
    if (tx.status !== "pending")
      return ctx.answerCbQuery("✅ Transaksi ini sudah selesai.", true);

    let st = "UNPAID";
    st = await checkStatusPakasir(tx.orderId, tx.amount);
    if (st === "PAID") {
      await ctx.answerCbQuery("✅ Pembayaran terdeteksi!", true);
      if (await processDelivery(tx, users, store)) {
        writeDB(db_path.trx, trxs);
        writeDB(db_path.user, users);
        writeDB(db_path.store, store);
      }
    } else {
      ctx.answerCbQuery("⏳ Pembayaran belum terdeteksi.", true);
    }
  } finally {
    unlock();
  }
});

bot.action(/^tu_(.*)$/, async (ctx) => {
  const nominal = parseInt(ctx.match[1]);
  await ctx.answerCbQuery();
  await createTopupRequest(ctx, nominal);
});

// 1. Menu Detail Produk / Konfirmasi Pesanan
  async function showCheckoutMenu(ctx, pid, qty, editMode = true) {
  try {
    let user = readDB(db_path.user).find(
      (x) => String(x.id) === String(ctx.from.id),
    );
    let lang = user ? user.lang_code || "id" : "id";

    const s = readDB(db_path.store);
    const p = s.products.find((x) => x.id === pid);

    if (!p) {
        if (ctx.callbackQuery && !ctx.callbackQuery.message?.text?.startsWith('/start')) return ctx.answerCbQuery("❌ Produk tidak ditemukan.", true).catch(() => {});
        else return ctx.reply("❌ Produk tidak ditemukan.");
    }

    const stockCount = p.stocks.length;
    if (stockCount === 0) {
        if (ctx.callbackQuery && !ctx.callbackQuery.message?.text?.startsWith('/start')) return ctx.answerCbQuery("⚠️ Stok produk ini sedang kosong.", true).catch(() => {});
        else return ctx.reply("⚠️ Stok produk ini sedang kosong.");
    }

    if (qty > stockCount) qty = stockCount; // Cap quantity to max stock

    let currentPrice = p.price;
    let isGrosirActive = false;
    if (p.grosir_price && p.grosir_min && qty >= p.grosir_min) {
      currentPrice = p.grosir_price;
      isGrosirActive = true;
    }

    let totalPrice = currentPrice * qty;
    let originalPrice = totalPrice;

    let discountInfo = "";
    
    const uState = userState.get(ctx.from.id);
    const activeVoucher = uState?.activeVoucher;

    if (activeVoucher && activeVoucher.discount) {
      let discVal = 0;
      if (activeVoucher.discount.includes("%")) {
        const pct = parseFloat(activeVoucher.discount);
        discVal = Math.floor(originalPrice * (pct / 100));
      } else {
        discVal = parseInt(activeVoucher.discount) || 0;
      }
      totalPrice -= discVal;
      if (totalPrice < 0) totalPrice = 0;
      discountInfo = getText(lang, "chk_discount_vouch", {
        code: activeVoucher.code,
        disc: discVal.toLocaleString("id-ID"),
        ori: originalPrice.toLocaleString("id-ID"),
      });
    }

    const timeStr = moment.tz("Asia/Jakarta").format("HH.mm.ss [WIB]");

    let daftarHargaText = `1+ = Rp ${p.price.toLocaleString("id-ID")}/item ${!isGrosirActive ? "✅" : ""}`;
    if (p.grosir_price && p.grosir_min) {
      daftarHargaText += `\n${p.grosir_min}+ = Rp ${p.grosir_price.toLocaleString("id-ID")}/item ${isGrosirActive ? "✅" : ""}`;
    }

    let noteInfo = "";
    if (uState?.activeNote) {
      noteInfo = `📝 <b>CATATAN :</b>\n"${uState.activeNote}"\n\n`;
    }

    const text = getText(lang, "chk_title", {
      category: p.category.toUpperCase(),
      name: p.name.toUpperCase(),
      desc: p.desc || "-",
      pricelist: daftarHargaText,
      stock: stockCount,
      qty: qty,
      price: currentPrice.toLocaleString("id-ID"),
      discount: discountInfo,
      total: totalPrice.toLocaleString("id-ID"),
      note: noteInfo,
      time: timeStr,
    });

    let qtyButtons = [];

    // Dynamically build quantity adjustment buttons based on stock
    let topRow = [];
    let bottomRow = [];

    if (qty > 1)
      topRow.push(Markup.button.callback("-1", `v_${pid}_${qty - 1}`));
    if (qty >= 5)
      topRow.push(
        Markup.button.callback("-5", `v_${pid}_${qty > 5 ? qty - 5 : 1}`),
      );
    if (qty >= 10)
      topRow.push(
        Markup.button.callback("-10", `v_${pid}_${qty > 10 ? qty - 10 : 1}`),
      );

    if (stockCount > qty)
      topRow.push(Markup.button.callback("+1", `v_${pid}_${qty + 1}`));

    if (stockCount >= qty + 5)
      bottomRow.push(Markup.button.callback("+5", `v_${pid}_${qty + 5}`));
    if (stockCount >= qty + 10)
      bottomRow.push(Markup.button.callback("+10", `v_${pid}_${qty + 10}`));
    if (stockCount >= qty + 50)
      bottomRow.push(Markup.button.callback("+50", `v_${pid}_${qty + 50}`));

    if (topRow.length > 0) qtyButtons.push(topRow);
    if (bottomRow.length > 0) qtyButtons.push(bottomRow);

    const b = [...qtyButtons];
    const noteBtnText = uState?.activeNote ? getText(lang, "btn_edit_note") : getText(lang, "btn_add_note");
    b.push([
      Markup.button.callback(
        noteBtnText,
        `add_note_${pid}_${qty}`,
      ),
    ]);
    b.push([
        Markup.button.callback(
          getText(lang, "chk_btn_vouch"),
          `vouch_${pid}_${qty}`,
        ),
      ]);
    b.push([
      Markup.button.callback(
        getText(lang, "chk_btn_pay_bal", {
          total: totalPrice.toLocaleString("id-ID"),
        }),
        `pay_bal_${pid}_${qty}_${totalPrice}`,
      ),
    ]);
    b.push([
      Markup.button.callback(
        getText(lang, "chk_btn_pay_qris", {
          total: totalPrice.toLocaleString("id-ID"),
        }),
        `pay_qris_${pid}_${qty}_${totalPrice}`,
      ),
    ]);


    b.push([
      Markup.button.callback(getText(lang, "btn_refresh"), `v_${pid}_${qty}`),
      Markup.button.callback(
        getText(lang, "btn_bc_shop"),
        `c_${hashC(p.category)}`,
      ),
    ]);

    if (editMode && ctx.callbackQuery) {
      try {
        await ctx.editMessageText(text, {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard(b),
        });
      } catch (e) {
        await ctx.reply(text, {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard(b),
        }).catch(() => {});
      }
      if (ctx.answerCbQuery) await ctx.answerCbQuery().catch(() => {});
    } else {
      await ctx.reply(text, {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard(b),
      }).catch(() => {});
    }
  } catch (err) {
    if (ctx.callbackQuery && ctx.answerCbQuery) ctx.answerCbQuery("⚠️ Gagal memuat produk.", true).catch(() => {});
  }
}

bot.action(/^v_(.*)$/, async (ctx) => {
  try {
    const [_, payload] = ctx.match;
    const lastUnderscore = payload.lastIndexOf("_");
    const pid = payload.substring(0, lastUnderscore);
    const qtyStr = payload.substring(lastUnderscore + 1);
    let qty = parseInt(qtyStr) || 1;

    if (ctx.chat.type === "group" || ctx.chat.type === "supergroup") {
      let b = [
        [Markup.button.url("🛒 Lanjutkan ke Chat Pribadi", `https://t.me/${ctx.botInfo.username}?start=buy_${pid}`)]
      ];
      return ctx.reply("Untuk menjaga privasi, silakan lanjutkan proses pembelian di pesan pribadi dengan bot kami.", {
        reply_to_message_id: ctx.callbackQuery.message.message_id,
        ...Markup.inlineKeyboard(b)
      }).catch(() => {});
    }

    await showCheckoutMenu(ctx, pid, qty, true);
  } catch (err) {
    console.error(err);
  }
});

bot.action(/^add_note_(.*)_(.*)$/, async (ctx) => {
  const [_, pid, qty] = ctx.match;
  let user = readDB(db_path.user).find((x) => String(x.id) === String(ctx.from.id));
  let lang = user ? user.lang_code || "id" : "id";
  const st = userState.get(ctx.from.id) || {};
  const sentMsg = await ctx.reply(getText(lang, "ask_note"), { parse_mode: "Markdown" });
  userState.set(ctx.from.id, { ...st, step: "input_note", pid, qty: parseInt(qty), noteMsgId: sentMsg.message_id });
  await ctx.deleteMessage().catch(() => {});
  await ctx.answerCbQuery();
});

bot.action(/^vouch_(.*)$/, async (ctx) => {
  let user = readDB(db_path.user).find(
    (x) => String(x.id) === String(ctx.from.id),
  );
  let lang = user ? user.lang_code || "id" : "id";
  userState.set(ctx.from.id, { step: "input_voucher" });
  await ctx.reply(getText(lang, "vouch_prompt"), {
    parse_mode: "Markdown",
  });
  await ctx.answerCbQuery();
});

// 2. Checkout handlers (dipanggil langsung dari Confirm Menu)

bot.action(/^pay_bal_(.*)_(.*)_(.*)$/, async (ctx) => {
  const unlock = await dbMutex.lock();
  try {
    const [_, pid, qty, amount] = ctx.match;
    let users = readDB(db_path.user);
    let store = readDB(db_path.store);
    let trxs = readDB(db_path.trx);
    const uIdx = users.findIndex((u) => String(u.id) === String(ctx.from.id));
    const pIdx = store.products.findIndex((p) => p.id === pid);
    if (uIdx === -1 || users[uIdx].balance < parseInt(amount))
      return ctx.answerCbQuery("❌ Saldo tidak cukup!", true);
    if (pIdx === -1 || store.products[pIdx].stocks.length < parseInt(qty))
      return ctx.answerCbQuery("❌ Stok habis!", true);
    users[uIdx].balance -= parseInt(amount);

    const uState = userState.get(ctx.from.id);
    const activeVoucher = uState?.activeVoucher;

    const tx = {
      orderId: `BAL${Date.now()}`,
      userId: ctx.from.id,
      amount: parseInt(amount),
      type: "direct",
      productId: pid,
      productName: store.products[pIdx].name,
      qty: parseInt(qty),
      status: "pending",
      date: moment().format(),
      voucherApplied: null,
      note: uState?.activeNote || null,
    };
    if (await processDelivery(tx, users, store)) {
      if (tx.status === "success") {
        if (activeVoucher) {
          tx.voucherApplied = activeVoucher.code;
          let promos = readDB(db_path.promo);
          const vIdx = promos.findIndex((p) => p.code === activeVoucher.code);
          if (vIdx !== -1) {
            if (!promos[vIdx].usedBy) promos[vIdx].usedBy = [];
            promos[vIdx].usedBy.push(ctx.from.id);
            if (!promos[vIdx].used) promos[vIdx].used = 0;
            promos[vIdx].used += 1;
            if (promos[vIdx].limit && promos[vIdx].used >= parseInt(promos[vIdx].limit)) {
              promos.splice(vIdx, 1);
            }
            writeDB(db_path.promo, promos);
          }
          userState.set(ctx.from.id, { ...uState, activeVoucher: null });
        }
        addLog("SALE", "Transaksi Berhasil (Saldo)", `Pembeli ID: ${ctx.from.id}, Produk: ${tx.productName}, Jumlah: ${tx.qty}x, Total: Rp${tx.amount.toLocaleString()}`);
      }
      trxs.push(tx);
      writeDB(db_path.user, users);
      writeDB(db_path.store, store);
      writeDB(db_path.trx, trxs);

      await ctx.deleteMessage().catch(() => { });
      ctx.answerCbQuery("✅ Transaksi Berhasil!", true);
    } else ctx.answerCbQuery("❌ Terjadi kesalahan.", true);
  } finally {
    unlock();
  }
});


bot.action(/^pay_qris_(.*)_(.*)_(.*)$/, async (ctx) => {
  const unlock = await dbMutex.lock();
  try {
    const [_, pid, qty, amount] = ctx.match;
    const orderId = `INV${Date.now()}`;
    const p = readDB(db_path.store).products.find((x) => x.id === pid);
    if (!p || p.stocks.length < parseInt(qty))
      return ctx.answerCbQuery("Stok habis.", true);
    let user = readDB(db_path.user).find(
      (x) => String(x.id) === String(ctx.from.id),
    );
    let lang = user ? user.lang_code || "id" : "id";

    await ctx.deleteMessage();
    ctx.reply(getText(lang, "tu_wait"));

    const uState = userState.get(ctx.from.id);
    const activeVoucher = uState?.activeVoucher;

    try {
        const payload = {
        project: PAKASIR_SLUG,
        order_id: orderId,
        amount: parseInt(amount),
        api_key: PAKASIR_KEY
      };
      const res = await axios.post(
        "https://app.pakasir.com/api/transactioncreate/qris",
        payload,
        { headers: { "Content-Type": "application/json" }, timeout: 10000 },
      );
      if (res.data && res.data.payment) {
        const qr = await QRCode.toBuffer(res.data.payment.payment_number);

        let voucherApplied = null;

        if (activeVoucher) {
          let promos = readDB(db_path.promo);
          const vIdx = promos.findIndex((p) => p.code === activeVoucher.code);
          if (vIdx !== -1) {
            if (!promos[vIdx].usedBy) promos[vIdx].usedBy = [];
            promos[vIdx].usedBy.push(ctx.from.id);
            if (!promos[vIdx].used) promos[vIdx].used = 0;
            promos[vIdx].used += 1;
            if (promos[vIdx].limit && promos[vIdx].used >= parseInt(promos[vIdx].limit)) {
              promos.splice(vIdx, 1);
            }
            writeDB(db_path.promo, promos);
            voucherApplied = activeVoucher.code;
          }
          userState.set(ctx.from.id, { ...uState, activeVoucher: null });
        }

        let txs = readDB(db_path.trx);
        txs.push({
          orderId,
          invoiceId: res.data.payment.order_id,
          userId: ctx.from.id,
          amount: parseInt(amount),
          total_amount: res.data.payment.total_payment,
          type: "direct",
          productId: pid,
          productName: p.name,
          qty: parseInt(qty),
          status: "pending",
          date: moment().format(),
          voucherApplied,
          note: uState?.activeNote || null,
          chatId: ctx.chat.id,
        });
        writeDB(db_path.trx, txs);
        const invoiceMsg = await ctx.replyWithPhoto(
          { source: qr },
          {
            caption: getText(lang, "direct_qris", {
              total: res.data.payment.total_payment.toLocaleString("id-ID"),
            }),
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  getText(lang, "btn_check_manual"),
                  `check_trx_${orderId}`,
                ),
              ],
              [
                Markup.button.callback(
                  getText(lang, "btn_cancel_pay"),
                  `cancel_trx_${orderId}`,
                ),
              ],
            ]),
          },
        );

        // Simpan message ID invoice ke transaksi agar bisa dihapus saat sukses
        const txIdx = txs.findIndex(t => t.orderId === orderId);
        if (txIdx !== -1) {
          txs[txIdx].invoiceMsgId = invoiceMsg.message_id;
          writeDB(db_path.trx, txs);
        }
      }
    } catch (e) {
      console.error("PAY_QRIS ERROR:", e.response ? e.response.data : e);
      ctx.reply("❌ Gagal membuat QRIS.");
    }
  } finally {
    unlock();
  }
});

bot.action(/^cancel_trx_(.*)$/, async (ctx) => {
  let user = readDB(db_path.user).find(
    (x) => String(x.id) === String(ctx.from.id),
  );
  let lang = user ? user.lang_code || "id" : "id";
  const orderId = ctx.match[1];
  let txs = readDB(db_path.trx);
  const i = txs.findIndex((x) => x.orderId === orderId);
  if (i !== -1 && txs[i].status === "pending") {
    txs[i].status = "cancelled";
    revertKuota(txs[i]);
    writeDB(db_path.trx, txs);
    await ctx.deleteMessage().catch(() => { });
    await ctx.reply(getText(lang, "msg_cancel"));
    await sendCancelSticker(ctx.from.id);
  } else {
    await ctx.answerCbQuery("Pembayaran sudah diproses/dibatalkan.", true);
  }
});

bot.action(/^del_vouch_(.*)$/, async (ctx) => {
  if (String(ctx.from.id) !== OWNER_ID) return;
  const vCode = ctx.match[1];
  let promos = readDB(db_path.promo);
  const initialLen = promos.length;
  promos = promos.filter((p) => String(p.code) !== String(vCode));

  if (promos.length < initialLen) {
    writeDB(db_path.promo, promos);
    await ctx
      .answerCbQuery(`✅ Voucher ${vCode} dihapus!`, true)
      .catch(() => { });
    await ctx.deleteMessage().catch(() => { });
    ctx.reply(`✅ Berhasil menghapus voucher *${vCode}*.`, {
      parse_mode: "Markdown",
    });
  } else {
    await ctx
      .answerCbQuery(`❌ Voucher ${vCode} tidak ditemukan!`, true)
      .catch(() => { });
  }
});

bot.action("adm_vouch_add", async (ctx) => {
  if (String(ctx.from.id) !== OWNER_ID) return;
  userState.set(ctx.from.id, { step: "adm_promo" });
  await ctx.deleteMessage().catch(() => { });
  ctx.reply(
    "🎟 Masukkan pengaturan *Voucher Baru*:\nFormat: `KODE|DISKON|JAM_AKTIF` (Jam)\nContoh: `DISKON20|20%|24` (aktif 24 jam) atau `POTONG10K|10000|72` (aktif 3 hari)",
    {
      parse_mode: "Markdown",
      ...Markup.keyboard([["🔙 Menu Admin"]]).resize(),
    },
  );
});

bot.action("adm_vouch_list", async (ctx) => {
  if (String(ctx.from.id) !== OWNER_ID) return;
  await ctx.answerCbQuery().catch(() => { });
  let promos = readDB(db_path.promo) || [];
  let activePromos = promos.filter(p => !p.expiresAt || p.expiresAt > Date.now());
  if (activePromos.length !== promos.length) {
      promos = activePromos;
      writeDB(db_path.promo, promos);
  }
  if (!promos || promos.length === 0)
    return ctx.reply("Belum ada voucher yang aktif saat ini.");

  let t = "📋 *DAFTAR VOUCHER AKTIF*\n━━━━━━━━━━━━━━━━━━━━━\n\n";
  let buttons = [];

  promos.forEach((p, idx) => {
    let status = "Selamanya";
    if (p.expiresAt) {
      if (Date.now() > p.expiresAt) status = "🔴 KEDALUWARSA";
      else {
        const sisa = Math.floor((p.expiresAt - Date.now()) / 3600000);
        status = `🟢 Aktif (${sisa} Jam lagi)`;
      }
    }
    t += `${idx + 1}. *${p.code}*\n   📉 Diskon: ${p.discount}\n   ⏳ Status: ${status}\n   👥 Total Dipakai: ${p.usedBy ? p.usedBy.length : 0} kali\n\n`;
    buttons.push([
      Markup.button.callback(`🗑 Hapus ${p.code}`, `del_vouch_${p.code}`),
    ]);
  });

  await ctx
    .editMessageText(t, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(buttons),
    })
    .catch(() => { });
});


bot.action(/^admstck_c_(.*)$/, async (ctx) => {
  try {
    const catStrBase64 = ctx.match[1];
    const store = readDB(db_path.store);
    const activeCats = [
      ...new Set(store.products.map((p) => p.category).filter(Boolean)),
    ];
    const categoryExtracted = findC(catStrBase64, activeCats);
    const prods = store.products.filter(
      (p) => p.category === categoryExtracted,
    );

    if (prods.length === 0)
      return ctx.answerCbQuery("Kategori ini kosong.", true).catch(() => { });

    let buttons = [];
    prods.forEach((p) => {
      buttons.push([
        Markup.button.callback(`🏷 ${p.name}`, `admstck_p_${p.id}`),
      ]);
    });

    await ctx.editMessageText(
      `📦 *Produk dalam kategori ${categoryExtracted}:*\nPilih produk yang ingin diisi stoknya:`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard(buttons),
      },
    );
  } catch (e) {
    await ctx.answerCbQuery("Terjadi kesalahan.", true).catch(() => { });
  }
});

bot.action(/^admstck_p_(.*)$/, async (ctx) => {
  try {
    const pId = ctx.match[1];
    const store = readDB(db_path.store);
    const p = store.products.find((x) => x.id === pId);

    if (p) {
      userState.set(ctx.from.id, { step: "adm_stok_bulk", pId: p.id, totalAdded: 0 });
      await ctx.deleteMessage();
      await bot.telegram.sendMessage(
        ctx.from.id,
        `📦 *Isi stok ${p.name}*:\n\n` +
        `📝 *Format Input:*\n` +
        `- Akun: \`email|password|2fa|pin|profile|exp (hari)\`\n` +
        `- Link: Langsung tempel link per baris\n\n` +
        `📎 *Metode Input:*\n` +
        `1️⃣ Kirim langsung sebagai pesan teks\n` +
        `2️⃣ Upload file \`.txt\` (untuk stok massal 100+)\n` +
        `3️⃣ Bisa kirim berkali-kali, stok akan diakumulasi\n\n` +
        `Tekan *✅ Selesai* jika sudah selesai mengisi stok.`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("✅ Selesai Isi Stok", `done_stock_${p.id}`)]
          ]),
        },
      );
    } else {
      await ctx.answerCbQuery("Produk tidak ditemukan.", true).catch(() => { });
    }
  } catch (e) {
    await ctx.answerCbQuery("Terjadi kesalahan.", true).catch(() => { });
  }
});

bot.action(/^done_stock_(.*)$/, async (ctx) => {
  try {
    const pId = ctx.match[1];
    const st = userState.get(ctx.from.id);
    if (!st || st.step !== "adm_stok_bulk") {
      return ctx.answerCbQuery("Sesi isi stok sudah berakhir.", true).catch(() => {});
    }
    const store = readDB(db_path.store);
    const p = store.products.find((x) => x.id === pId);
    const totalAdded = st.totalAdded || 0;
    const productName = p ? p.name : "Produk";
    const currentStock = p ? p.stocks.length : 0;

    // Handle notifikasi restock
    if (p && p.notifyList && p.notifyList.length > 0 && totalAdded > 0) {
      const list = [...p.notifyList];
      p.notifyList = [];
      writeDB(db_path.store, store);
      await ctx.editMessageText(
        `✅ *SESI ISI STOK SELESAI*\n━━━━━━━━━━━━━━━━━━━━━\n📦 Produk: *${productName}*\n➕ Total Ditambahkan: *${totalAdded}* item\n📊 Stok Sekarang: *${currentStock}*\n━━━━━━━━━━━━━━━━━━━━━\n📢 Mengirim notifikasi ke *${list.length}* calon pembeli...`,
        { parse_mode: "Markdown" }
      );
      const botName = ctx.botInfo ? ctx.botInfo.username : "";
      list.forEach((userId) => {
        const msg = `📢 *RESTOCK ALERT!* 📢\n━━━━━━━━━━━━━━━━━━━━━\n\nProduk incaran Anda yaitu *${productName}* kini telah KEMBALI TERSEDIA dengan stok baru!\n\nBuruan order via @${botName} sebelum kehabisan lagi ya! 🚀`;
        bot.telegram.sendMessage(userId, msg, { parse_mode: "Markdown" }).catch(() => {});
      });
    } else {
      await ctx.editMessageText(
        `✅ *SESI ISI STOK SELESAI*\n━━━━━━━━━━━━━━━━━━━━━\n📦 Produk: *${productName}*\n➕ Total Ditambahkan: *${totalAdded}* item\n📊 Stok Sekarang: *${currentStock}*\n━━━━━━━━━━━━━━━━━━━━━`,
        { parse_mode: "Markdown" }
      );
    }
    userState.delete(ctx.from.id);
    await bot.telegram.sendMessage(ctx.from.id, "Kembali ke Panel Admin:", kbAdmin);
  } catch (e) {
    console.error("done_stock error:", e);
    userState.delete(ctx.from.id);
    ctx.reply("Kembali ke Panel Admin:", kbAdmin);
  }
});

bot.action(/^rate_(.*)$/, async (ctx) => {
  const uList = readDB(db_path.user);
  const u = uList.find((x) => String(x.id) === String(ctx.from.id));
  const lang = u ? u.lang_code || "id" : "id";
  try {
    const score = parseInt(ctx.match[1]);
    const userId = ctx.from.id;

    let settings = readDB(db_path.settings);
    if (!settings.ratings) settings.ratings = [];

    settings.ratings.push({ userId, score });
    writeDB(db_path.settings, settings);

    await ctx
      .editMessageText(getText(lang, "msg_rate_success"))
      .catch(() => { });
    await ctx
      .answerCbQuery(getText(lang, "msg_rate_thanks"), false)
      .catch(() => { });
    await sendSuccessSticker(userId);
  } catch (e) {
    await ctx
      .answerCbQuery(getText(lang, "msg_rate_already"), true)
      .catch(() => { });
  }
});

// === TAHAP 1: HANDLER KATEGORI (Ambil Stok, Hapus Produk, Kosongkan Stok) ===
const handleAdminCatSelect = async (ctx, prefixAction, titleLabel) => {
  try {
    const catStrBase64 = ctx.match[1];
    const store = readDB(db_path.store);
    const activeCats = [
      ...new Set(store.products.map((p) => p.category).filter(Boolean)),
    ];
    const categoryExtracted = findC(catStrBase64, activeCats);
    const prods = store.products.filter(
      (p) => p.category === categoryExtracted,
    );

    if (prods.length === 0)
      return ctx.answerCbQuery("Kategori ini kosong.", true).catch(() => { });

    let buttons = [];
    prods.forEach((p) => {
      buttons.push([
        Markup.button.callback(`🏷 ${p.name}`, `${prefixAction}${p.id}`),
      ]);
    });

    await ctx.editMessageText(
      `${titleLabel} dalam kategori *${categoryExtracted}*:`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard(buttons),
      },
    );
  } catch (e) {
    await ctx.answerCbQuery("Terjadi kesalahan.", true).catch(() => { });
  }
};

bot.action(/^d_get_c_(.*)$/, async (ctx) =>
  handleAdminCatSelect(
    ctx,
    "d_get_p_",
    "🔑 *Pilih Produk untuk Diambil Stoknya*",
  ),
);
bot.action(/^d_delp_c_(.*)$/, async (ctx) =>
  handleAdminCatSelect(
    ctx,
    "d_delp_p_",
    "🗑️ *Pilih Produk yang Ingin Dihapus*",
  ),
);
bot.action(/^d_dels_c_(.*)$/, async (ctx) =>
  handleAdminCatSelect(
    ctx,
    "d_dels_p_",
    "🧹 *Pilih Produk yang Stoknya Ingin Dikosongkan*",
  ),
);

// === TAHAP 2: HANDLER PRODUK (Eksekusi Aksi) ===

bot.action(/^d_get_p_(.*)$/, async (ctx) => {
  try {
    const pId = ctx.match[1];
    const store = readDB(db_path.store);
    const p = store.products.find((x) => x.id === pId);
    if (!p)
      return ctx
        .answerCbQuery("❌ Produk tidak ditemukan.", true)
        .catch(() => { });

    if (p.stocks.length === 0) {
      await ctx.answerCbQuery("Stok produk ini kosong.", true);
      return ctx.deleteMessage();
    }
    let txtInfo = `📦 *STOK PRODUK: ${p.name}*\nJumlah: ${p.stocks.length}\n━━━━━━━━━━━━━━━━━━━━━\n\n`;
    p.stocks.forEach((s, i) => {
      let obj = s;
      if (typeof s === "string") {
        const parts = s.split("|");
        obj = {
          email: (parts[0] || s).trim(),
          pw: (parts[1] || "").trim(),
          twoFA: (parts[2] || "").trim(),
          pin: (parts[3] || "").trim(),
          profile: (parts[4] || "").trim(),
          expDays: parseInt(parts[5]) || 0,
          addedAt: s.addedAt || Date.now()
        };
      }
      let expInfo = "";
      if (obj.expDays > 0) {
        const expiresAt = (obj.addedAt || Date.now()) + (obj.expDays * 86400000);
        const hoursLeft = Math.max(0, Math.floor((expiresAt - Date.now()) / 3600000));
        expInfo = ` (⏳ Exp dalam: ${hoursLeft} Jam)`;
      }
      const row = `${obj.email || ""}|${obj.pw || ""}|${obj.twoFA || ""}|${obj.pin || ""}|${obj.profile || ""}`.replace(/\|+$/, "");
      txtInfo += `${i + 1}. \`${row}\`${expInfo}\n`;
    });

    userState.set(ctx.from.id, { step: "adm_ambil_stok", pId: pId });
    await ctx.reply(
      txtInfo +
      "\n💡 *Balas dengan nomor urut* (contoh: `1`) untuk menghapus/mengambil stok tersebut.",
      {
        parse_mode: "Markdown",
        ...Markup.keyboard([["🔙 Menu Admin"]]).resize(),
      },
    );
    await ctx.deleteMessage().catch(() => { });
  } catch (e) {
    ctx.answerCbQuery("Error", true).catch(() => { });
  }
});

bot.action(/^d_delp_p_(.*)$/, async (ctx) => {
  try {
    const pId = ctx.match[1];
    let store = readDB(db_path.store);
    const pIdx = store.products.findIndex((x) => x.id === pId);
    if (pIdx === -1)
      return ctx
        .answerCbQuery("❌ Produk tidak ditemukan.", true)
        .catch(() => { });
    const pName = store.products[pIdx].name;

    store.products.splice(pIdx, 1);
    writeDB(db_path.store, store);



    await ctx.reply(
      `✅ *Produk ${pName}* (ID: ${pId}) berhasil dihapus beserta stoknya.`,
      { parse_mode: "Markdown" },
    );
    await ctx.deleteMessage().catch(() => { });
  } catch (e) {
    ctx.answerCbQuery("Error", true).catch(() => { });
  }
});

bot.action(/^d_dels_p_(.*)$/, async (ctx) => {
  try {
    const pId = ctx.match[1];
    let store = readDB(db_path.store);
    const pIdx = store.products.findIndex((x) => x.id === pId);
    if (pIdx === -1)
      return ctx
        .answerCbQuery("❌ Produk tidak ditemukan.", true)
        .catch(() => { });
    const pName = store.products[pIdx].name;

    store.products[pIdx].stocks = [];
    writeDB(db_path.store, store);
    await ctx.reply(`🧹 *Stok Produk ${pName}* berhasil dikosongkan.`, {
      parse_mode: "Markdown",
    });
    await ctx.deleteMessage().catch(() => { });
  } catch (e) {
    ctx.answerCbQuery("Error", true).catch(() => { });
  }
});


bot.action("batal_belanja", async (ctx) => {
  try {
    await ctx.deleteMessage();
  } catch (e) { }
  const u = readDB(db_path.user);
  const user = u.find((x) => String(x.id) === String(ctx.from.id));
  if (user) {
    const { text, kb } = getStartMessage(
      ctx,
      user,
      u.length,
      readDB(db_path.trx),
    );
    try {
      await ctx.replyWithPhoto(
        { source: THUMBNAIL },
        { caption: text, parse_mode: "HTML", ...kb },
      );
    } catch (e) {
      await ctx.reply(text, { parse_mode: "HTML", ...kb });
    }
  }
  await sendCancelSticker(ctx.from.id);
});

bot.hears("/rekap", async (ctx) => {
  if (String(ctx.from.id) !== OWNER_ID) return;
  const txs = readDB(db_path.trx);
  const successTxs = txs.filter((t) => t.status === "success");
  if (successTxs.length === 0)
    return ctx.reply("Belum ada riwayat transaksi yang sukses.");

  let csvData = "Order ID;Tanggal;Produk;Qty;Harga Satuan;Total Bayar\n";
  successTxs.forEach((tx) => {
    const qty = tx.qty || 1;
    const total = tx.amount || 0;
    const satuan = total / qty;
    csvData += `"${tx.orderId}";"${tx.date}";"${tx.productName}";${qty};${satuan};${total}\n`;
  });

  const buffer = Buffer.from(csvData, "utf-8");
  await ctx.replyWithDocument(
    { source: buffer, filename: `Rekap_Keuangan_${Date.now()}.csv` },
    {
      caption: "📊 *Ini adalah Laporan Rekap Keuangan Anda.*",
      parse_mode: "Markdown",
    },
  );
});

bot.action(/^notify_cat_(.*)$/, async (ctx) => {
  const catNameHash = ctx.match[1];
  let store = readDB(db_path.store);

  let actualCatName = null;
  const cats = [...new Set(store.products.map((p) => p.category))];
  for (let c of cats) {
    if (String(hashC(c)) === String(catNameHash)) {
      actualCatName = c;
      break;
    }
  }

  if (!actualCatName) {
    return ctx.answerCbQuery("Kategori tidak ditemukan.", true).catch(() => { });
  }

  let added = false;
  store.products.forEach((p) => {
    if (p.category === actualCatName && (!p.stocks || p.stocks.length === 0)) {
      if (!p.notifyList) p.notifyList = [];
      if (!p.notifyList.includes(ctx.from.id)) {
        p.notifyList.push(ctx.from.id);
        added = true;
      }
    }
  });

  if (added) {
    writeDB(db_path.store, store);
    ctx
      .answerCbQuery(
        "✅ Mengantre! Anda akan dinotifikasi untuk semua produk kosong di kategori ini.",
        true,
      )
      .catch(() => { });
  } else {
    ctx
      .answerCbQuery(
        "ℹ️ Anda sudah masuk antrean atau stok sudah tersedia.",
        true,
      )
      .catch(() => { });
  }
});



// === MESSAGE LISTENER ===
bot.on("message", async (ctx) => {
  if (!ctx.message || !ctx.from) return;
  const id = ctx.from.id;
  const txt = ctx.message.text || "";
  const st = userState.get(id);

  // 1. --- PRIORITAS: CEK AKHIRI CHAT ---
  if (txt.includes("🛑 AKHIRI CHAT")) {
    const u = readDB(db_path.user);
    const user = u.find((x) => String(x.id) === String(id));
    const lang = user ? user.lang_code || "id" : "id";

    if (activeChats.has(id)) {
      const target = activeChats.get(id);
      activeChats.delete(id);
      activeChats.delete(target);
      const targetUser = u.find((x) => String(x.id) === String(target));
      const targetLang = targetUser ? targetUser.lang_code || "id" : "id";

      await bot.telegram.sendMessage(
        id,
        "Sesi bantuan telah diakhiri.\nKetik /start untuk membuka menu utama.",
        String(id) === OWNER_ID ? kbOwner(lang) : kbUser(lang),
      );
      await bot.telegram.sendMessage(
        target,
        "🛑 Sesi bantuan telah diakhiri oleh lawan bicara.\nKetik /start untuk membuka menu utama.",
        String(target) === OWNER_ID ? kbOwner(targetLang) : kbUser(targetLang),
      );
      return;
    } else if (st && st.step === "ask_support") {
      userState.delete(id);
      await ctx.reply(
        "Permintaan bantuan dibatalkan.",
        Markup.removeKeyboard(),
      );
      const u = readDB(db_path.user);
      const user = u.find((x) => String(x.id) === String(id));
      if (user) {
        const { text, kb } = getStartMessage(
          ctx,
          user,
          u.length,
          readDB(db_path.trx),
        );
        try {
          await ctx.replyWithPhoto(
            { source: THUMBNAIL },
            { caption: text, parse_mode: "HTML", ...kb },
          );
        } catch (e) {
          await ctx.reply(text, { parse_mode: "HTML", ...kb });
        }
      }
      return;
    }
  }

  // 2. --- PRIORITAS: ADMIN QUICK REPLY (BALAS PESAN TERTENTU) ---
  if (String(id) === OWNER_ID && ctx.message.reply_to_message) {
    const replyMsg = ctx.message.reply_to_message;
    const targetMatch = (replyMsg.text || replyMsg.caption || "").match(
      /🆔 ID: `(\d+)`/,
    );
    if (targetMatch) {
      const targetUserId = targetMatch[1];
      try {
        if (txt) {
          await bot.telegram.sendMessage(
            targetUserId,
            `💬 *BALASAN ADMIN:*\n\n${txt}`,
            { parse_mode: "Markdown" },
          );
        } else {
          await bot.telegram.copyMessage(
            targetUserId,
            id,
            ctx.message.message_id,
          );
          await bot.telegram.sendMessage(
            targetUserId,
            `💬 *BALASAN ADMIN (MEDIA)*`,
            { parse_mode: "Markdown" },
          );
        }
        return ctx.reply(`✅ Balasan terkirim ke user \`${targetUserId}\`.`, {
          parse_mode: "Markdown",
        });
      } catch (e) {
        return ctx.reply(
          "❌ Gagal mengirim balasan. User mungkin memblokir bot.",
        );
      }
    }
  }

  // 3. --- LIVE CHAT MIRRORING ---
  if (activeChats.has(id)) {
    const target = activeChats.get(id);
    return bot.telegram.copyMessage(target, id, ctx.message.message_id);
  }

  // 4. --- PENGAJUAN LIVE CHAT (User Side) ---
  if (st && st.step === "ask_support") {
    if (txt === "🔙 Menu Utama") {
      userState.delete(id);
      await ctx.reply("Memuat Menu Utama...", Markup.removeKeyboard());
      const u = readDB(db_path.user);
      const user = u.find((x) => String(x.id) === String(id));
      if (user) {
        const { text, kb } = getStartMessage(
          ctx,
          user,
          u.length,
          readDB(db_path.trx),
        );
        try {
          await ctx.replyWithPhoto(
            { source: THUMBNAIL },
            { caption: text, parse_mode: "HTML", ...kb },
          );
        } catch (e) {
          await ctx.reply(text, { parse_mode: "HTML", ...kb });
        }
      }
      return;
    }
    const safeNameAdmin = sanitizeMD(ctx.from.first_name || "User");
    const safeMsgTxt = txt ? sanitizeMD(txt) : "[Media]";
    await bot.telegram.sendMessage(
      OWNER_ID,
      `💬 *PESAN BANTUAN BARU*\n━━━━━━━━━━━━━━━━━━━━━\n👤 User: ${safeNameAdmin}\n🆔 ID: \`${id}\`\n💬 Pesan: ${safeMsgTxt}\n━━━━━━━━━━━━━━━━━━━━━\n\n_Tips: Balas (reply) pesan ini untuk membalas user secara instan._`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("✅ Balas Chat (Live)", `accept_chat_${id}`)],
        ]),
      },
    );
    if (!txt)
      await bot.telegram.copyMessage(OWNER_ID, id, ctx.message.message_id);
    return ctx.reply(
      "✅ Pesan diteruskan. Admin akan segera membalas di sini. Anda bisa mengirim pesan tambahan jika perlu.",
    );
  }

  // 5. --- ADMIN STICKER SETTINGS ---
  if (st && st.step === "adm_set_sticker_success" && ctx.message.sticker) {
    let settings = readDB(db_path.settings);
    settings.success_sticker = ctx.message.sticker.file_id;
    writeDB(db_path.settings, settings);
    userState.delete(id);
    return ctx.reply("✅ Stiker sukses diperbarui!", kbAdmin);
  }
  if (st && st.step === "adm_set_sticker_cancel" && ctx.message.sticker) {
    let settings = readDB(db_path.settings);
    settings.cancel_sticker = ctx.message.sticker.file_id;
    writeDB(db_path.settings, settings);
    userState.delete(id);
    return ctx.reply("✅ Stiker batal diperbarui!", kbAdmin);
  }

  if (!st) return;

  // --- LOGIKA MENU LAINNYA ---
  if (st.step === "input_note" && txt) {
    let user = readDB(db_path.user).find((x) => String(x.id) === String(id));
    let lang = user ? user.lang_code || "id" : "id";
    if (txt.toLowerCase() === "/batal") {
      userState.set(id, { ...st, step: "" });
      if (st.noteMsgId) ctx.telegram.deleteMessage(ctx.chat.id, st.noteMsgId).catch(()=>{});
      ctx.deleteMessage().catch(()=>{});
      showCheckoutMenu(ctx, st.pid, st.qty, false);
      return;
    }
    const newState = { ...st, step: "", activeNote: txt };
    userState.set(id, newState);
    if (st.noteMsgId) ctx.telegram.deleteMessage(ctx.chat.id, st.noteMsgId).catch(()=>{});
    ctx.deleteMessage().catch(()=>{});
    showCheckoutMenu(ctx, st.pid, st.qty, false);
    return;
  }

  if (st.step === "input_voucher" && txt) {
    const code = txt.trim().toUpperCase();
    let promos = readDB(db_path.promo);
    const voucher = promos.find((p) => p.code === code);

    let user = readDB(db_path.user).find((x) => String(x.id) === String(id));
    let lang = user ? user.lang_code || "id" : "id";

    if (!voucher) {
      userState.set(id, { ...st, step: "" });
      return ctx.reply(getText(lang, "vouch_notfound"));
    }

    if (voucher.expiresAt && Date.now() > voucher.expiresAt) {
      // Auto-delete expired voucher
      promos = promos.filter((p) => p.code !== voucher.code);
      writeDB(db_path.promo, promos);
      userState.set(id, { ...st, step: "" });
      return ctx.reply(getText(lang, "vouch_expired"));
    }

    if (voucher.usedBy && voucher.usedBy.includes(id)) {
      userState.set(id, { ...st, step: "" });
      return ctx.reply(getText(lang, "vouch_used"));
    }

    // Simpan voucher ke dalam statenya sementara, belum dipakai sungguhan
    const newState = { ...st, step: "", activeVoucher: voucher };
    userState.set(id, newState);

    return ctx.reply(getText(lang, "vouch_success", { code: voucher.code }), {
      parse_mode: "Markdown",
    });
  }

  if (st.step === "cat" && /^\d+$/.test(txt)) {
    const s = readDB(db_path.store);
    const cats = [...new Set(s.categories)].sort();
    const catName = cats[parseInt(txt) - 1];

    if (catName) {
      const prods = s.products.filter((p) => p.category === catName);
      if (prods.length === 0) return ctx.reply("Kategori kosong.");

      userState.set(id, { step: "prod_select", prods: prods });
      let listText = `📁 KATEGORI: *${catName.toUpperCase()}*\n━━━━━━━━━━━━━━━━━━━━━\n\n`;
      let row = [];
      let rows = [];

      prods.forEach((p, i) => {
        listText += `${i + 1}. *${p.name}*\n💰 Harga: Rp ${p.price.toLocaleString()}\n📦 Stok: *${p.stocks.length}*\n\n`;
        row.push(`${i + 1}`);
        if (row.length === 5) {
          rows.push(row);
          row = [];
        }
      });

      if (row.length > 0) rows.push(row);
      rows.push(["🔙 Menu Utama"]);

      try {
        await ctx.replyWithPhoto(
          { source: THUMBNAIL },
          {
            caption: listText,
            parse_mode: "Markdown",
            ...Markup.keyboard(rows).resize(),
          },
        );
      } catch (e) {
        await ctx.reply(listText, {
          parse_mode: "Markdown",
          ...Markup.keyboard(rows).resize(),
        });
      }
    }
    return;
  }

  if (st.step === "prod_select" && /^\d+$/.test(txt)) {
    const idx = parseInt(txt) - 1;
    if (st.prods && st.prods[idx]) {
      const p = st.prods[idx];
      userState.delete(id);
      const detail = `📦 *${p.name.toUpperCase()}*\n━━━━━━━━━━━━━━━━━━━━━\n💰 Harga: *Rp ${p.price.toLocaleString()}*\n📦 Stok: *${p.stocks.length}*\n\n📝 Deskripsi:\n${p.desc || "-"}\n━━━━━━━━━━━━━━━━━━━━━`;
      const b = [];
      if (p.stocks.length > 0) {
        b.push([
          Markup.button.callback("1x", `qset_${p.id}_1`),
          Markup.button.callback("5x", `qset_${p.id}_5`),
        ]);
        b.push([Markup.button.callback("10x", `qset_${p.id}_10`)]);
      }
      b.push([Markup.button.callback("🔙 Kembali", "batal_belanja")]);

      try {
        await ctx.replyWithPhoto(
          { source: THUMBNAIL },
          {
            caption: detail,
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard(b),
          },
        );
      } catch (e) {
        await ctx.reply(detail, {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard(b),
        });
      }
    }
    return;
  }

  // --- LOGIKA KHUSUS OWNER/ADMIN ---
  if (String(id) === OWNER_ID) {
    let s = readDB(db_path.store);

    // Pengelolaan Saldo
    if (st.step === "adm_ref_bonus") {
      const amt = parseInt(txt);
      if (!isNaN(amt)) {
        updateSetting("ref_bonus", amt);
        ctx.reply(
          "✅ Bonus referral berhasil diubah menjadi Rp " +
          amt.toLocaleString(),
        );
      } else {
        ctx.reply("❌ Harus berupa angka!");
      }
      return userState.delete(id);
    }

    if (st.step === "adm_saldo_target") {
      userState.set(id, {
        step: "adm_saldo_nom",
        type: st.type,
        targetId: txt.trim(),
      });
      ctx.reply(
        "Kirimkan *Nominal* saldonya:\n\n_Kirimkan angka saja. (Contoh: 50000)_",
        { parse_mode: "Markdown" },
      );
      return;
    }

    if (st.step === "adm_saldo_nom") {
      const nominal = parseInt(txt);
      const targetId = st.targetId;
      const type = st.type;
      userState.delete(id);

      if (isNaN(nominal)) return ctx.reply("❌ Nominal harus angka.");

      let users = readDB(db_path.user);
      const idx = users.findIndex((u) => String(u.id) === targetId);
      if (idx === -1) return ctx.reply("❌ User tidak ditemukan.");

      if (type === "add") {
        users[idx].balance += nominal;
        ctx.reply(
          `✅ Berhasil menambahkan Rp ${nominal.toLocaleString()} ke ${targetId}.`,
        );
        bot.telegram
          .sendMessage(
            targetId,
            `💰 *SALDO DITAMBAHKAN*\nTotal: *Rp ${users[idx].balance.toLocaleString()}*`,
            { parse_mode: "Markdown" },
          )
          .catch(() => { });
      } else {
        users[idx].balance -= nominal;
        if (users[idx].balance < 0) users[idx].balance = 0;
        ctx.reply(
          `✅ Berhasil mengurangi Rp ${nominal.toLocaleString()} dari ${targetId}.`,
        );
        bot.telegram
          .sendMessage(
            targetId,
            `💰 *SALDO DIKURANGI*\nTotal: *Rp ${users[idx].balance.toLocaleString()}*`,
            { parse_mode: "Markdown" },
          )
          .catch(() => { });
      }
      writeDB(db_path.user, users);
      return;
    }

    // Tambah Kategori
    if (st.step === "adm_cat") {
      const parts = txt.split("|");
      const catName = parts[0].trim().toUpperCase();
      const catDesc = parts.slice(1).join("|").trim() || "-";

      if (!s.category_details) s.category_details = {};
      if (!s.categories.includes(catName)) {
        s.categories.push(catName);
      }
      s.category_details[catName] = catDesc;
      writeDB(db_path.store, s);
      ctx.reply("✅ Kategori Ditambah.", kbAdmin);
      return userState.delete(id);
    }

    // Tambah Promo Voucher (Dengan Waktu)
    if (st.step === "adm_promo") {
      const parts = txt.trim().split("|");
      if (parts.length < 3)
        return ctx.reply(
          "❌ Format salah! Harap gunakan format: KODE|DISKON|JAM_AKTIF\nContoh: DISKON50|50%|24 atau HEMAT10|10000|72",
        );

      const code = parts[0].trim().toUpperCase();
      const discount = parts[1].trim().replace(/[^\d%]/g, "");
      const hours = parseInt(parts[2].trim());

      if (isNaN(hours)) return ctx.reply("❌ Jumlah Jam harus berupa angka.");

      const expiresAt = Date.now() + hours * 3600000; // 1 jam = 3600000 ms

      let promos = readDB(db_path.promo);
      if (!promos || !Array.isArray(promos)) promos = [];
      promos.push({
        code: code,
        discount: discount,
        expiresAt: expiresAt,
        usedBy: [],
      });
      writeDB(db_path.promo, promos);

      try {
        if (global.CHANNEL) {
          const { chatId: chUsername, threadId: chThreadId } = parseChannelTarget(global.CHANNEL);
          if (chUsername) {
            const botName = ctx.botInfo ? ctx.botInfo.username : "";
            const botLink = botName ? `\n\nCek langsung di @${botName}` : "";
            const chMsg = `🎟 *VOUCHER & PROMO BARU* 🎟\n━━━━━━━━━━━━━━━━━━━━━\n\nKabar gembira! Ada voucher promosi yang baru saja dirilis!\n\n🔖 Kode Voucher: \`${code}\`\n📉 Diskon: *${discount}*\n⏳ Berlaku: *${hours} Jam*\n\nBuruan gunakan pada saat pemesanan sebelum expired! 🚀${botLink}`;
            bot.telegram
              .sendMessage(chUsername, chMsg, { parse_mode: "Markdown", ...(chThreadId ? { message_thread_id: chThreadId } : {}) })
              .catch(() => { });
          }
        }
      } catch (e) {
        console.log("Gagal broadcast voucher", e);
      }

      ctx.reply(
        `✅ Promo Voucher \`${code}\` berhasil ditambahkan!\nDiskon: ${discount}\nAktif selama: ${hours} Jam`,
        { parse_mode: "Markdown", ...kbAdmin },
      );
      return userState.delete(id);
    }


    // Tambah Produk
    if (st.step === "adm_prod") {
      // Format input: Kategori|Nama|Harga|Deskripsi|Pesan_Sukses|HargaGrosir|MinBeliGrosir
      const [c, n, pr, d, sm, gp, gm] = txt.split("|");
      if (!c || !n || !pr)
        return ctx.reply(
          "❌ Format: Kategori|Nama|Harga|Deskripsi|Pesan_Sukses (Grosir opsional)",
        );

      s.products.push({
        id: `P${Date.now()}`,
        category: c.trim(),
        name: n.trim(),
        price: parseInt(pr),
        desc: d || "",
        success_msg: sm || "",
        grosir_price: parseInt(gp) || null,
        grosir_min: parseInt(gm) || null,
        stocks: [],
      });
      writeDB(db_path.store, s);
      ctx.reply(`✅ Produk ${n} berhasil ditambah!`, kbAdmin);
      return userState.delete(id);
    }

    // --- FIX: INPUT STOK (KONSOLIDASI + MULTI-MESSAGE + FILE UPLOAD) ---
    if (st.step === "adm_stok_bulk") {
      const pIdx = s.products.findIndex((x) => x.id === st.pId);
      if (pIdx === -1) return ctx.reply("❌ Produk hilang dari database!");

      let lines = [];

      // Cek apakah admin mengirim file dokumen (.txt)
      if (ctx.message.document) {
        const doc = ctx.message.document;
        const fileName = doc.file_name || "";
        if (!fileName.toLowerCase().endsWith(".txt")) {
          return ctx.reply("❌ Hanya file \`.txt\` yang didukung.\nSilakan kirim ulang dalam format \`.txt\`.", { parse_mode: "Markdown" });
        }
        try {
          const fileLink = await bot.telegram.getFileLink(doc.file_id);
          const response = await axios.get(fileLink.href, { responseType: "text", timeout: 30000 });
          const fileContent = response.data;
          lines = fileContent.split("\n").filter((l) => l.trim().length > 0);
        } catch (dlErr) {
          log.error("Gagal download file stok", dlErr);
          return ctx.reply("❌ Gagal mengunduh file. Silakan coba lagi.");
        }
      } else if (txt && txt.trim().length > 0) {
        // Input dari pesan teks biasa
        lines = txt.split("\n").filter((l) => l.trim().length > 0);
      } else {
        return; // Tidak ada data yang bisa diproses
      }

      if (lines.length === 0) {
        return ctx.reply("⚠️ Tidak ada data stok yang terdeteksi dari input Anda.");
      }

      lines.forEach((l) => {
        const pData = l.split("|");
        s.products[pIdx].stocks.push({
          email: (pData[0] || l).trim(),
          pw: (pData[1] || "").trim(),
          twoFA: (pData[2] || "").trim(),
          pin: (pData[3] || "").trim(),
          profile: (pData[4] || "").trim(),
          isLink: !pData[1] || pData[1].trim() === "",
          expDays: parseInt(pData[5]) || 0,
          addedAt: Date.now()
        });
      });

      addLog("STOCK UPDATE", "Tambah Stok (Bot)", `Produk: ${s.products[pIdx].name}, Tambahan: ${lines.length} item`);
      writeDB(db_path.store, s);

      // Akumulasi total stok yang ditambahkan dalam sesi ini
      const newTotal = (st.totalAdded || 0) + lines.length;
      userState.set(id, { ...st, totalAdded: newTotal });

      // Kirim konfirmasi + tombol Selesai (JANGAN hapus userState, biarkan multi-message)
      ctx.reply(
        `✅ *+${lines.length}* stok ditambahkan!\n📊 Total sesi ini: *${newTotal}* item | Stok sekarang: *${s.products[pIdx].stocks.length}*\n\n_Kirim lagi untuk menambah, atau tekan tombol di bawah jika sudah selesai._`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("✅ Selesai Isi Stok", `done_stock_${st.pId}`)]
          ]),
        },
      );
      return; // JANGAN userState.delete — biarkan admin kirim lagi
    }

    // --- FIX: AMBIL STOK (HAPUS 1 PER MINTAAN) ---
    if (st.step === "adm_ambil_stok") {
      const pIdx = s.products.findIndex((x) => x.id === st.pId);
      if (pIdx === -1) return ctx.reply("❌ Produk hilang dari database!");

      const stockIdx = parseInt(txt) - 1;
      if (
        isNaN(stockIdx) ||
        stockIdx < 0 ||
        stockIdx >= s.products[pIdx].stocks.length
      ) {
        return ctx.reply("❌ Masukkan nomor urut yang valid!");
      }

      const removed = s.products[pIdx].stocks.splice(stockIdx, 1)[0];
      let obj = removed;
      if (typeof removed === "string") {
        const parts = removed.split("|");
        obj = {
          email: (parts[0] || removed).trim(),
          pw: (parts[1] || "").trim(),
          twoFA: (parts[2] || "").trim(),
          pin: (parts[3] || "").trim(),
          profile: (parts[4] || "").trim(),
          expDays: parseInt(parts[5]) || 0
        };
      }
      const row = `${obj.email || ""}|${obj.pw || ""}|${obj.twoFA || ""}|${obj.pin || ""}|${obj.profile || ""}`.replace(/\|+$/, "");
      addLog("STOCK UPDATE", "Ambil Stok (Bot)", `Produk: ${s.products[pIdx].name}, Item yang diambil: ${row}`);
      writeDB(db_path.store, s);

      ctx.reply(`✅ Stok berhasil dihapus/diambil:\n\`${row}\``, {
        parse_mode: "Markdown",
        ...kbAdmin,
      });
      return userState.delete(id);
    }

    if (st.step === "adm_bc") {
      const users = readDB(db_path.user);
      let successCount = 0;
      ctx.reply(`🚀 Broadcasting ke *${users.length}* user...`, { parse_mode: "Markdown" });

      // Kirim secara paralel dalam batch 25 user sekaligus untuk menghindari rate-limit
      const BATCH_SIZE = 25;
      for (let i = 0; i < users.length; i += BATCH_SIZE) {
        const batch = users.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(u => bot.telegram.copyMessage(u.id, id, ctx.message.message_id))
        );
        successCount += results.filter(r => r.status === "fulfilled").length;
        // Jeda kecil antar batch agar tidak kena rate-limit Telegram
        if (i + BATCH_SIZE < users.length) {
          await new Promise(r => setTimeout(r, 500));
        }
      }

      ctx.reply(`✅ Broadcast selesai!\n📨 Terkirim ke *${successCount}* dari *${users.length}* user.`, {
        parse_mode: "Markdown",
        ...kbAdmin,
      });
      return userState.delete(id);
    }

    // --- PROSES HAPUS DATA ---
    if (st.step === "adm_del_cat") {
      const catName = txt.trim();
      const idx = s.categories.indexOf(catName);
      if (idx !== -1) {
        s.categories.splice(idx, 1);
        if (s.category_details) delete s.category_details[catName];
        // Hapus juga semua produk yang ada di dalam kategori ini agar tidak nyangkut (orphaned)
        s.products = s.products.filter(p => p.category !== catName);
        
        writeDB(db_path.store, s);
        ctx.reply(`✅ Kategori \`${catName}\` berhasil dihapus.`, {
          parse_mode: "Markdown",
          ...kbDeleteMenu,
        });
      } else
        ctx.reply("❌ Kategori tidak ditemukan. Pastikan nama sama persis.");
      return userState.delete(id);
    }

    // --- PROSES EDIT DATA ---
    if (st.step === "adm_edit_cat") {
      const parts = txt.split("|");
      if (parts.length < 2)
        return ctx.reply("❌ Format Salah. Harus: NamaBaru|DeskripsiBaru");
      const newName = parts[0].trim().toUpperCase();
      const newDesc = parts.slice(1).join("|").trim();

      const oldName = st.catName;
      const idx = s.categories.indexOf(oldName);
      if (idx !== -1) {
        s.categories[idx] = newName;
        if (!s.category_details) s.category_details = {};
        s.category_details[newName] = newDesc;
        if (newName !== oldName) {
          delete s.category_details[oldName];
          s.products.forEach((p) => {
            if (p.category === oldName) p.category = newName;
          });
        }
        writeDB(db_path.store, s);
        ctx.reply(
          `✅ Kategori ${oldName} berhasil diubah menjadi ${newName}.`,
          kbAdmin,
        );
      } else {
        ctx.reply("❌ Kategori tidak ditemukan.", kbAdmin);
      }
      return userState.delete(id);
    }

    if (st.step === "adm_edit_prod") {
      const parts = txt.split("|");
      if (parts.length < 5)
        return ctx.reply(
          "❌ Format input minimum memiliki 5 bagian yang dipisah '|'.",
        );

      const pIdx = s.products.findIndex((x) => x.id === st.pId);
      if (pIdx === -1) return ctx.reply("❌ Produk tidak ditemukan.");

      s.products[pIdx].category = parts[0].trim().toUpperCase();
      s.products[pIdx].name = parts[1].trim();
      s.products[pIdx].price = parseInt(parts[2]);
      s.products[pIdx].desc = parts[3].trim();
      s.products[pIdx].success_msg = parts[4].trim();
      if (parts[5] !== undefined && parts[6] !== undefined) {
        s.products[pIdx].grosir_price = parseInt(parts[5]) || null;
        s.products[pIdx].grosir_min = parseInt(parts[6]) || null;
      }

      writeDB(db_path.store, s);
      ctx.reply(`✅ Produk berhasil diedit!`, kbAdmin);
      return userState.delete(id);
    }
  }
});

// Start loop
bot.catch((err, ctx) => {
  const errorMsg = err.description || err.message || "";

  // TAMBAHKAN BARIS INI: Filter error blokir user agar terminal tetap bersih
  if (errorMsg.includes("Forbidden: bot was blocked by the user")) {
    return; // Hentikan proses, jangan print log error
  }

  log.error(`Terjadi error pada update ${ctx.updateType}`, err);
});
async function start() {
  // Mencoba membersihkan layar (meskipun panel web kadang mengabaikannya)
  process.stdout.write('\x1Bc');
  process.stdout.write('\x1B[2J\x1B[3J\x1B[H');
  console.clear();
  setInterval(paymentLoop, 30000);
  startAutoLogClear();
  const initDashboard = require('./dashboard');
  initDashboard({ readDB, writeDB, db_path, chalk, bot, addLog, sendBackupToOwner, dbMutex });
  bot
    .launch()
    .catch((e) => log.error("Bot launch failed", e));
    
  setTimeout(() => {
    if (global.printBanner) global.printBanner();
  }, 1000);
}

start();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

// Trigger nodemon restart
