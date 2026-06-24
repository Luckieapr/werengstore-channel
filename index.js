// index.js

require("./setting");
const chalk = require('chalk');
const moment = require('moment-timezone');
const fs = require('fs');
const os = require('os');
const speed = require('performance-now');
const util = require('util');
const { exec, execSync } = require('child_process');
const { sizeFormatter } = require('human-readable');
const axios = require('axios');
const crypto = require("crypto");

const { addResponTesti, delResponTesti, isAlreadyResponTesti, updateResponTesti, getDataResponTesti } = require('./function/respon-testi');
const { simple } = require('./function/myfunc');

//Waktu
moment.tz.setDefault("Asia/Jakarta").locale("id");
const d = new Date;
const tanggal = d.toLocaleDateString('id', {
  day: 'numeric',
  month: 'long',
  year: 'numeric'
});
const jamwib = moment.tz('Asia/Jakarta').format('HH:mm:ss');
const dnew = new Date(new Date + 3600000);
const dateIslamic = Intl.DateTimeFormat('id' + '-TN-u-ca-islamic', { day: 'numeric', month: 'long', year: 'numeric' }).format(dnew);

// Fungsi untuk meng-escape karakter Markdown
function escapeMarkdown(text) {
  if (typeof text !== 'string') {
    text = String(text);
  }
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

module.exports = balz = async (balz, bot) => {
  try {
    const body = balz.message.text || balz.message.caption || '';
    const budy = (typeof balz.message.text == 'string' ? balz.message.text : '');
    const isCmd = /^[°•π÷×¶∆£¢€¥®™✓_=|~!?#/$%^&.+-,\\\©^]/.test(body);
    const prefa = [""];
    const prefix = prefa ? /^[°•π÷×¶∆£¢€¥®=????+✓_/=|~!?@#%^&.©^]/gi.test(body) ? body.match(/^[°•π÷×¶∆£¢€¥®=????+✓_/=|~!?@#%^&.©^]/gi)[0] : "" : prefa ?? '#';
    const commands = body.replace(prefix, '').trim().split(/ +/).shift().toLowerCase();
    const command = (commands.split("@")[1] !== undefined && commands.split("@")[1].toLowerCase() == balz.botInfo.username.toLowerCase()) ? commands.split("@")[0] : commands;
    const args = body.trim().split(/ +/).slice(1);
    const q = args.join(" ");
    const user = simple.getUserName(balz.message.from);
    const pushname = user.full_name;
    const user_id = balz.message.from.id.toString();
    const username = user.username ? user.username : "balzyt";
    const isOwner = [...OWNER].map(v => v.replace("https://t.me/", '')).includes(balz.update.message.from.username);
    const from = balz.message.chat.id;

    const isGroup = balz.chat.type.includes('group');
    const groupName = isGroup ? balz.chat.title : '';

    const isImage = balz.message.hasOwnProperty('photo');
    const isVideo = balz.message.hasOwnProperty('video');
    const isAudio = balz.message.hasOwnProperty('audio');
    const isSticker = balz.message.hasOwnProperty('sticker');
    const isContact = balz.message.hasOwnProperty('contact');
    const isLocation = balz.message.hasOwnProperty('location');
    const isDocument = balz.message.hasOwnProperty('document');
    const isAnimation = balz.message.hasOwnProperty('animation');
    const isMedia = isImage || isVideo || isAudio || isSticker || isContact || isLocation || isDocument || isAnimation;
    const quotedMessage = balz.message.reply_to_message || {};
    const isQuotedImage = quotedMessage.hasOwnProperty('photo');
    const isQuotedVideo = quotedMessage.hasOwnProperty('video');
    const isQuotedAudio = quotedMessage.hasOwnProperty('audio');
    const isQuotedSticker = quotedMessage.hasOwnProperty('sticker');
    const isQuotedContact = quotedMessage.hasOwnProperty('contact');
    const isQuotedLocation = quotedMessage.hasOwnProperty('location');
    const isQuotedDocument = quotedMessage.hasOwnProperty('document');
    const isQuotedAnimation = quotedMessage.hasOwnProperty('animation');
    const isQuoted = balz.message.hasOwnProperty('reply_to_message');

    if (!db.data.user.includes(user_id)) db.data.user.push(user_id);
    if (isGroup && !db.data.chat[from]) db.data.chat[from] = {
      welcome: false,
      goodbye: false,
      sDone: "",
      sProses: ""
    };

    const reply = async (text) => {
      for (var x of simple.range(0, text.length, 4096)) {
        return await balz.replyWithMarkdown(text.substr(x, 4096), {
          disable_web_page_preview: true
        });
      }
    };

    const formatp = sizeFormatter({
      std: 'JEDEC',
      decimalPlaces: 2,
      keepTrailingZeroes: false,
      render: (literal, symbol) => `${literal} ${symbol}B`,
    });

    var typeMessage = body.substr(0, 50).replace(/\n/g, '');
    if (isImage) typeMessage = 'Image';
    else if (isVideo) typeMessage = 'Video';
    else if (isAudio) typeMessage = 'Audio';
    else if (isSticker) typeMessage = 'Sticker';
    else if (isContact) typeMessage = 'Contact';
    else if (isLocation) typeMessage = 'Location';
    else if (isDocument) typeMessage = 'Document';
    else if (isAnimation) typeMessage = 'Animation';

    if (isAlreadyResponTesti(body.toLowerCase())) {
      let get_data_respon = getDataResponTesti(body.toLowerCase());
      await balz.replyWithPhoto({
        url: get_data_respon.image_url
      }, {
        caption: get_data_respon.response,
        parse_mode: "MARKDOWN",
        disable_web_page_preview: true
      });
    }

    if (balz.message) console.log('->[\x1b[1;32mCMD\x1b[1;37m]', chalk.yellow(moment.tz('Asia/Jakarta').format('DD-MM-YYYY HH:mm:ss')), chalk.green(`${prefix + command.split("@")[1] ? command.split("@")[0] : command} [${args.length}]`), 'from', chalk.green(pushname), isGroup ? 'in ' + chalk.green(groupName) : '');

    // --- Penanganan pesan dari Reply Keyboard ---
if (budy === 'List Produk') {
    if (Object.keys(db.data.kategori).length === 0) return reply("Belum ada kategori produk di database. Silakan tambahkan kategori terlebih dahulu.");

    let teks = `*╭────〔 DAFTAR KATEGORI PRODUK 〕─* \n*╰┈┈┈┈┈┈┈┈*\n\nSilakan pilih kategori produk yang ingin Anda lihat:\n\n`;
    let buttons = [];
    let row = [];
    const categories = Object.keys(db.data.kategori);
    const maxButtonsPerRow = 2; // Anda bisa mengubah angka ini sesuai keinginan

    categories.forEach((catId, index) => {
        row.push({ text: `📂 ${simple.escapeMarkdown(db.data.kategori[catId].name)}`, callback_data: `show_products_in_category ${catId} ${user_id}` });

        // Jika row sudah mencapai batas maxButtonsPerRow atau ini adalah tombol terakhir
        if (row.length === maxButtonsPerRow || index === categories.length - 1) {
            buttons.push(row);
            row = []; // Reset row untuk baris berikutnya
        }
    });

    await balz.replyWithMarkdown(teks, {
        disable_web_page_preview: true,
        reply_markup: {
            inline_keyboard: buttons
        }
    });
    return;
    } else if (budy === 'Statistik Transaksi') {
        const uniqueUsers = new Set();
        let totalItemsOrdered = 0;

        db.data.transaksi.forEach(trx => {
            if (trx.user_id) {
                uniqueUsers.add(trx.user_id);
            }
            if (trx.jumlah) {
                totalItemsOrdered += trx.jumlah;
            }
        });

        const totalUniqueUsers = uniqueUsers.size;

        let teks = `*Statistik Transaksi:*\n\n`;
        teks += `*👥 Jumlah Pengguna yang Sudah Order:* ${totalUniqueUsers} Pengguna\n`;
        teks += `*📦 Jumlah Total Produk Terorder:* ${totalItemsOrdered} Item\n\n`;
        teks += `_Data ini mencakup seluruh riwayat transaksi bot._`;

        await reply(teks);
        return;
    } else if (budy === 'Cara Order') {
        let teks = `*Panduan Cara Order:*\n\n` +
                   `1. Tekan tombol "List Produk" untuk melihat daftar produk yang tersedia dan kodenya.\n` +
                   `2. Tekan tombol "🛒 Beli [Nama Produk]" di bawah setiap produk yang ingin Anda beli.\n` +
                   `3. Atur jumlah pembelian menggunakan tombol "+" atau "-" .\n` +
                   `4. Tekan "✅ Lanjutkan Pembelian" untuk memproses pembayaran dan mendapatkan QR Code.\n` +
                   `5. Setelah pembayaran berhasil, akun Anda akan dikirimkan melalui file teks.\n` +
                   `6. Jika ada masalah atau ingin membatalkan, gunakan perintah \\/batal\\.\n\n` +
                   `Jika Anda butuh bantuan lebih lanjut, silakan hubungi Owner kami.`;
        await reply(teks);
        return;
    } else if (budy === 'Menu Admin') {
        if (!isOwner) return reply(mess.owner);
        let teks = `*🤖 INFO BOT 🤖*
• Nama Bot: ${BOT_NAME}
• Runtime: ${simple.runtime(process.uptime())}
• Pengguna: ${db.data.user.length} Pengguna
• Owner: [@${OWNER_NAME}](${OWNER[0]})

*👤 INFO PENGGUNA 👤*
• Tag: [@${pushname}](https://t.me/${username})
• Username: ${username}
• Nama: ${pushname}

╭─────╼「 *MENU OWNER* 」
│☛ /addproduk
│☛ /delproduk
│☛ /setkode
│☛ /setjudul
│☛ /setdesk
│☛ /setsnk
│☛ /setharga
│☛ /setprofit
│☛ /addstok
│☛ /delstok
│☛ /addpromocode
│☛ /delpromocode
│☛ /listpromocode
│☛ /rekap
│☛ /backup
│☛ /broadcast
│☛ /setprodukformat
│☛ /topup
│☛ /review
│☛ /listreviews
│☛ /setnotifstok (Fitur 10)
│☛ /addkategori (NEW!)
│☛ /delkategori (NEW!)
│☛ /listkategori (NEW!)
│☛ /setmerchant (NEW!)
│☛ /setapikeyorkut (NEW!)
│☛ /setcodeqr (NEW!)
╰─────╼`;
    await reply(teks);
        return;
    }
    // --- Akhir penanganan pesan dari Reply Keyboard ---

    switch (command) {
      case "tes": case 'runtime': {
        reply(`*STATUS: BOT ONLINE*\n_Runtime: ${simple.runtime(process.uptime())}_`);
      }
        break;

      case 'ping': {
        let timestamp = speed();
        let latensi = speed() - timestamp;
        reply(`Kecepatan respon ${latensi.toFixed(4)} 𝘚𝘦𝘤𝘰𝘯𝘥\n\n💻 *INFO SERVER*\nHostname: ${simple.escapeMarkdown(os.hostname())}\nRAM: ${formatp(os.totalmem() - os.freemem())} / ${formatp(os.totalmem())}\nCPUs: ${os.cpus().length} Core`);
      }
        break;

      case 'owner': {
        await balz.sendContact(OWNER_NUMBER, OWNER_NAME);
        reply(`Owner saya [${simple.escapeMarkdown(OWNER_NAME)}](${OWNER[0]}) 👑`);
      }
        break;

      case "menu": {
        let button = [[{ text: '💰 MENU ORDER', callback_data: 'ordercmd ' + user_id }], [{ text: '📒 INFO BOT', callback_data: 'infocmd ' + user_id }, { text: 'MENU OWNER 🧒🏻', callback_data: 'ownercmd ' + user_id }]];
        let teks = `*🤖 INFO BOT 🤖*
• Nama Bot: ${simple.escapeMarkdown(BOT_NAME)}
• Runtime: ${simple.runtime(process.uptime())}
• Pengguna: ${db.data.user.length} Pengguna
• Owner: [@${simple.escapeMarkdown(OWNER_NAME)}](${OWNER[0]})

*👤 INFO PENGGUNA 👤*
• Tag: [@${simple.escapeMarkdown(pushname)}](https://t.me/${simple.escapeMarkdown(username)})
• Username: ${simple.escapeMarkdown(username)}
• Nama: ${simple.escapeMarkdown(pushname)}

_Silahkan pilih menu di bawah ini._`;
        try {
          await balz.editMessageMedia({
            type: "photo",
            media: {
              source: thumbnail
            },
            caption: teks,
            parse_mode: "MARKDOWN",
            disable_web_page_preview: true
          }, {
            reply_markup: {
              inline_keyboard: button
            }
          });
        } catch (e) {
          console.error("Error in menu command:", e);
          await balz.replyWithPhoto({
            source: thumbnail
          }, {
            caption: teks,
            parse_mode: "MARKDOWN",
            disable_web_page_preview: true,
            reply_markup: {
              inline_keyboard: button
            }
          });
        }
      }
        break;

      case 'stok': {
        if (Object.keys(db.data.kategori).length === 0) return reply("Belum ada kategori produk di database. Silakan tambahkan kategori terlebih dahulu.");

        let teks = `*╭────〔 DAFTAR KATEGORI PRODUK 〕─* \n*╰┈┈┈┈┈┈┈┈*\n\nSilakan pilih kategori produk yang ingin Anda lihat:\n\n`;
        let buttons = [];

        Object.keys(db.data.kategori).forEach(catId => {
            buttons.push([{ text: `📂 ${simple.escapeMarkdown(db.data.kategori[catId].name)}`, callback_data: `show_products_in_category ${catId} ${user_id}` }]);
        });

        await balz.replyWithMarkdown(teks, {
            disable_web_page_preview: true,
            reply_markup: {
                inline_keyboard: buttons
            }
        });
        return;
      }

      case 'addproduk': {
        if (!isOwner) return reply(mess.owner);
        let data = q.split("|");
        if (data.length < 7) return reply(`Contoh: \`/${command} id|namaproduk|deskripsi|snk|harga|profit|idkategori\`\n\n*Contoh:*\n\`/${command} idproduk|Nama Produk|Deskripsi|SNK|10000|2000|DIGITAL\``);
        if (db.data.produk[data[0]]) return reply(`Produk dengan ID *${simple.escapeMarkdown(data[0])}* sudah ada di database`);
        if (!db.data.kategori[data[6]]) return reply(`Kategori dengan ID *${simple.escapeMarkdown(data[6])}* tidak ditemukan. Silakan buat kategori terlebih dahulu dengan /addkategori.`);

        db.data.produk[data[0]] = {
          id: data[0],
          name: data[1],
          desc: data[2],
          snk: data[3],
          price: Number(data[4]),
          profit: Number(data[5]),
          terjual: 0,
          stok: [],
          stock_format: 'akun',
          category_id: data[6]
        };

        reply(`Berhasil menambahkan produk *${simple.escapeMarkdown(data[1])}* ke kategori *${simple.escapeMarkdown(db.data.kategori[data[6]].name)}*`);
      }
        break;

      case 'delproduk': {
        if (!isOwner) return reply(mess.owner);
        if (!q) return reply(`Contoh: \`/${command} idproduk\``);
        if (!db.data.produk[q]) return reply(`Produk dengan ID *${simple.escapeMarkdown(q)}* tidak ada di database`);

        delete db.data.produk[q];

        reply(`Berhasil menghapus produk *${simple.escapeMarkdown(q)}*`);
      }
        break;

      case 'setharga': {
        if (!isOwner) return reply(mess.owner);
        let data = q.split("|");
        if (!data[1]) return reply(`Contoh: \`/${command} idproduk|harga\``);
        if (!db.data.produk[data[0]]) return reply(`Produk dengan ID *${simple.escapeMarkdown(data[0])}* tidak ada di database`);

        db.data.produk[data[0]].price = Number(data[1]);
        reply(`Berhasil mengatur harga produk dengan ID *${simple.escapeMarkdown(data[0])}* menjadi Rp${global.toRupiah(Number(data[1]))}`);
      }
        break;

      case 'setjudul': {
        if (!isOwner) return reply(mess.owner);
        let data = q.split("|");
        if (!data[1]) return reply(`Contoh: \`/${command} idproduk|namaproduk\``);
        if (!db.data.produk[data[0]]) return reply(`Produk dengan ID *${simple.escapeMarkdown(data[0])}* tidak ada di database`);

        db.data.produk[data[0]].name = data[1];
        reply(`Berhasil mengatur judul produk dengan ID *${simple.escapeMarkdown(data[0])}* menjadi *${simple.escapeMarkdown(data[1])}*`);
      }
        break;

      case 'setdesk': {
        if (!isOwner) return reply(mess.owner);
        let data = q.split("|");
        if (!data[1]) return reply(`Contoh: \`/${command} idproduk|deskripsi\``);
        if (!db.data.produk[data[0]]) return reply(`Produk dengan ID *${simple.escapeMarkdown(data[0])}* tidak ada di database`);

        db.data.produk[data[0]].desc = data[1];
        reply(`Berhasil mengatur deskripsi produk dengan ID *${simple.escapeMarkdown(data[0])}*`);
      }
        break;

      case 'setsnk': {
        if (!isOwner) return reply(mess.owner);
        let data = q.split("|");
        if (!data[1]) return reply(`Contoh: \`/${command} idproduk|snk\``);
        if (!db.data.produk[data[0]]) return reply(`Produk dengan ID *${simple.escapeMarkdown(data[0])}* tidak ada di database`);

        db.data.produk[data[0]].snk = data[1];
        reply(`Berhasil mengatur SNK produk dengan ID *${simple.escapeMarkdown(data[0])}*`);
      }
        break;

      case 'setprofit': {
        if (!isOwner) return reply(mess.owner);
        let data = q.split("|");
        if (!data[1]) return reply(`Contoh: \`/${command} idproduk|profit\``);
        if (!db.data.produk[data[0]]) return reply(`Produk dengan ID *${simple.escapeMarkdown(data[0])}* tidak ada di database`);

        db.data.produk[data[0]].profit = Number(data[1]);
        reply(`Berhasil mengatur profit produk dengan ID *${simple.escapeMarkdown(data[0])}*`);
      }
        break;

      case 'setkode': {
        if (!isOwner) return reply(mess.owner);
        let data = q.split("|");
        if (!data[1]) return reply(`Contoh: \`/${command} idlama|idbaru\``);
        if (!db.data.produk[data[0]]) return reply(`Produk dengan ID *${simple.escapeMarkdown(data[0])}* tidak ada di database`);

        db.data.produk[data[1]] = { ...db.data.produk[data[0]], id: data[1] };
        reply(`Berhasil mengatur kode produk dengan ID *${simple.escapeMarkdown(data[0])}* menjadi *${simple.escapeMarkdown(data[1])}*`);
        delete db.data.produk[data[0]];
      }
        break;

      case 'addstok': {
        if (!isOwner) return reply(mess.owner);
        let data = q.split(",");
        if (!data[1]) return reply(`Contoh:\n\`/${command} idproduk,email1|password1|profil1|pin1|2fa1\nemail2|password2|profil2|pin2|2fa2\`\n\n*NOTE*\nJika tidak ada Profil, Pin, 2FA, kosongkan saja atau dikasih tanda strip (-)`);
        if (!db.data.produk[data[0]]) return reply(`Produk dengan ID *${simple.escapeMarkdown(data[0])}* tidak ada`);

        if (db.data.produk[data[0]].stock_format && db.data.produk[data[0]].stock_format !== 'akun') {
            return reply(`Produk dengan ID *${simple.escapeMarkdown(data[0])}* memiliki format stok '${db.data.produk[data[0]].stock_format}'. Perintah ini hanya untuk format 'akun'.`);
        }

        let dataStok = data[1].split("\n").map(i => i.trim());
        db.data.produk[data[0]].stok.push(...dataStok);

        reply(`Berhasil menambahkan stok sebanyak ${dataStok.length}`);
      }
        break;

      case 'delstok': {
        if (!isOwner) return reply(mess.owner);
        if (!q) return reply(`Contoh: \`/${command} idproduk\``);
        if (!db.data.produk[q]) return reply(`Produk dengan ID *${simple.escapeMarkdown(q)}* tidak ada`);

        db.data.produk[q].stok = [];

        reply(`Berhasil menghapus stok produk *${simple.escapeMarkdown(q)}*`);
      }
        break;

      case 'addpromocode': {
        if (!isOwner) return reply(mess.owner);
        let data = q.split("|");
        if (data.length < 4) return reply(`Contoh: \`/${command} KODEMU|tipe|nilai|kuota|max_diskon(opsional)\`\n\n*Tipe Diskon:*\n- *persen* (nilai dalam persen)\n- *fixed* (nilai dalam rupiah)\n\n*Contoh:*\n\`/${command} NEWUSER|persen|10|100\`\n\`/${command} CASHBACK5K|fixed|5000|50|10000 (maks diskon 10rb)\``);

        const code = data[0].toUpperCase();
        const type = data[1].toLowerCase();
        const value = Number(data[2]);
        const uses_left = Number(data[3]);
        const max_discount = data[4] ? Number(data[4]) : null;

        if (db.data.promo[code]) return reply(`Kode promo *${simple.escapeMarkdown(code)}* sudah ada.`);
        if (!['persen', 'fixed'].includes(type)) return reply(`Tipe diskon tidak valid. Gunakan 'persen' atau 'fixed'.`);
        if (isNaN(value) || value <= 0) return reply(`Nilai diskon harus angka positif.`);
        if (isNaN(uses_left) || uses_left <= 0) return reply(`Kuota penggunaan harus angka positif.`);
        if (max_discount !== null && (isNaN(max_discount) || max_discount < 0)) return reply(`Maksimal diskon harus angka positif atau 0.`);

        db.data.promo[code] = {
          type: type,
          value: value,
          uses_left: uses_left,
          max_discount: max_discount,
          created_at: Date.now()
        };
        reply(`Berhasil menambahkan kode promo *${simple.escapeMarkdown(code)}* (Tipe: ${simple.escapeMarkdown(type)}, Nilai: ${simple.escapeMarkdown(String(value))}, Kuota: ${simple.escapeMarkdown(String(uses_left))}${max_discount !== null ? `, Max Diskon: Rp${global.toRupiah(max_discount)}` : ''})`);
      }
        break;

      case 'delpromocode': {
        if (!isOwner) return reply(mess.owner);
        if (!q) return reply(`Contoh: \`/${command} KODEMU\``);
        const code = q.toUpperCase();
        if (!db.data.promo[code]) return reply(`Kode promo *${simple.escapeMarkdown(code)}* tidak ditemukan.`);
        delete db.data.promo[code];
        reply(`Berhasil menghapus kode promo *${simple.escapeMarkdown(code)}*.`);
      }
        break;

      case 'listpromocode': {
          if (!isOwner) return reply(mess.owner);
          const promoCodes = Object.keys(db.data.promo);
          if (promoCodes.length === 0) return reply("Belum ada kode promo di database.");

          let teks = `*╭────〔 DAFTAR KODE PROMO 🎟️ 〕─*\n*╰┈┈┈┈┈┈┈┈*\n\n`;
          promoCodes.forEach(code => {
              const promo = db.data.promo[code];
              teks += `*🏷️ Kode:* ${simple.escapeMarkdown(code)}\n`;
              const typeValue = promo.type === 'persen' ? `${promo.value}%` : `Rp${global.toRupiah(promo.value)}`;
              teks += `*💡 Tipe:* ${simple.escapeMarkdown(typeValue)}\n`;
              teks += `*📦 Kuota Sisa:* ${simple.escapeMarkdown(String(promo.uses_left))}\n`;
              if (promo.max_discount !== null) {
                  teks += `*⬆️ Maks Diskon:* Rp${global.toRupiah(promo.max_discount)}\n`;
              }
              teks += `*📅 Dibuat:* ${moment(promo.created_at).format('DD-MM-YYYY HH:mm:ss')}\n\n`;
          });
          reply(teks);
      }
          break;

      case 'setprodukformat': {
        if (!isOwner) return reply(mess.owner);
        let data = q.split("|");
        if (!data[1]) return reply(`Contoh: \`/${command} idproduk|format_stok\`\n\n*Format Stok:*\n- *akun* (email|pass|profil|pin|2fa)\n- *plain* (teks mentah per baris)`);

        const productId = data[0];
        const newFormat = data[1].toLowerCase();

        if (!db.data.produk[productId]) return reply(`Produk dengan ID *${simple.escapeMarkdown(productId)}* tidak ada.`);
        if (!['akun', 'plain'].includes(newFormat)) return reply(`Format stok tidak valid. Gunakan 'akun' atau 'plain'.`);

        db.data.produk[productId].stock_format = newFormat;
        reply(`Berhasil mengubah format stok produk *${simple.escapeMarkdown(productId)}* menjadi *${simple.escapeMarkdown(newFormat)}*.`);
      }
        break;

      case 'buy': {
        if (db.data.order[user_id] !== undefined) return reply(`Kamu sedang melakukan order, harap tunggu sampai proses selesai. Atau ketik /batal untuk membatalkan pembayaran.`);
        let data = q.split(" ");
        if (!data[1]) return reply(`Contoh: \`/${command} idproduk jumlah\``);
        if (!db.data.produk[data[0]]) return reply(`Produk dengan ID *${simple.escapeMarkdown(data[0])}* tidak ada`);

        let stok = db.data.produk[data[0]].stok;
        if (stok.length <= 0) return reply("Stok habis, silahkan hubungi Owner untuk restok");
        if (stok.length < data[1]) return reply(`Stok tersedia ${stok.length}, jadi harap jumlah tidak melebihi stok`);

        db.data.temp_order[user_id] = {
            product_id: data[0],
            quantity: Number(data[1]),
            promo_code: null,
            applied_discount: 0,
            is_deposit: false
        };

        let amount = Number(db.data.produk[data[0]].price) * Number(data[1]);
        let applied_discount = db.data.temp_order[user_id].applied_discount || 0;
        let fee = global.digit();
        let subtotal_after_discount = Number(amount) - Number(applied_discount);
        if (subtotal_after_discount < 0) subtotal_after_discount = 0;
        let totalAmount = subtotal_after_discount + Number(fee);

        const user_data_current = db.data.user.find(u => u.id === user_id);
        const user_balance_current = user_data_current ? user_data_current.balance : 0;
        let buy_buttons = [];

        if (user_balance_current >= totalAmount) {
            buy_buttons.push([{ text: `💳 Bayar dengan Saldo (Rp${global.toRupiah(user_balance_current)})`, callback_data: `buy_via_balance ${data[0]} ${user_id} ${totalAmount}` }]);
        }
        buy_buttons.push([{ text: `💰 Bayar via QRIS (Rp${global.toRupiah(totalAmount)})`, callback_data: `deposit_via_qris ${data[0]} ${user_id} ${totalAmount}` }]);

        await balz.reply(`*Pilih Metode Pembayaran:*\n\nProduk: *${simple.escapeMarkdown(db.data.produk[data[0]].name)}*\nTotal Pembayaran: *Rp${global.toRupiah(totalAmount)}*\n\nSaldo Anda saat ini: *Rp${global.toRupiah(user_balance_current)}*\n`, {
            parse_mode: "MARKDOWN",
            reply_markup: {
                inline_keyboard: buy_buttons
            }
        });
      }
        break;

      case 'deposit': {
        if (db.data.temp_deposit_order[user_id] !== undefined) return reply(`Kamu sedang melakukan deposit, harap selesaikan deposit sebelumnya atau ketik /batal untuk membatalkan.`);

        const user_data_deposit = db.data.user.find(u => u.id === user_id);
        const user_balance_deposit = user_data_deposit ? user_data_deposit.balance : 0;

        if (!q || isNaN(Number(q)) || Number(q) <= 0) {
            return reply(`*Deposit Saldo*\n\nSaldo Anda saat ini: *Rp${global.toRupiah(user_balance_deposit)}*\n\nSilakan masukkan jumlah yang ingin Anda depositkan. Contoh: \`/deposit 10000\``);
        }

        const deposit_amount = Number(q);

        balz.reply(`*Konfirmasi Deposit:*\n\nJumlah Deposit: *Rp${global.toRupiah(deposit_amount)}*\n\nSilakan lanjutkan untuk mendapatkan QRIS.`, {
            parse_mode: "MARKDOWN",
            reply_markup: {
                inline_keyboard: [[{ text: `✅ Lanjutkan Deposit`, callback_data: `confirm_deposit ${deposit_amount} ${user_id}` }]]
            }
        });
      }
        break;

      case 'saldo': {
        const user_data_saldo = db.data.user.find(u => u.id === user_id);
        const current_balance = user_data_saldo ? user_data_saldo.balance : 0;
        await reply(`Saldo Anda saat ini: *Rp${global.toRupiah(current_balance)}*`);
      }
        break;

      case 'topup': {
        if (!isOwner) return reply(mess.owner);
        let parts = q.split(" ");
        if (parts.length < 2 || !parts[0] || isNaN(Number(parts[1])) || Number(parts[1]) <= 0) {
            return reply(`Contoh: \`/${command} [user_id] [jumlah]\`\n\nContoh: \`/${command} 123456789 50000\``);
        }

        const target_user_id = parts[0];
        const amount_to_add = Number(parts[1]);

        const user_index = db.data.user.findIndex(u => u.id === target_user_id);
        if (user_index === -1) {
            return reply(`User dengan ID *${simple.escapeMarkdown(target_user_id)}* tidak ditemukan.`);
        }

        db.data.user[user_index].balance += amount_to_add;
        const updated_balance = db.data.user[user_index].balance;

        await reply(`Berhasil topup Rp${global.toRupiah(amount_to_add)} ke user *${simple.escapeMarkdown(target_user_id)}*. Saldo baru: Rp${global.toRupiah(updated_balance)}`);
        await bot.telegram.sendMessage(target_user_id, `Saldo Anda telah ditambahkan sebesar Rp${global.toRupiah(amount_to_add)} oleh Owner. Saldo Anda sekarang: Rp${global.toRupiah(updated_balance)}`, { parse_mode: "MARKDOWN" }).catch(e => console.error(`Failed to notify user ${target_user_id} about topup:`, e));
      }
        break;

      case 'batal': {
        if (db.data.order[user_id] !== undefined) {
            if (db.data.order[user_id].promo_code_used && db.data.promo[db.data.order[user_id].promo_code_used]) {
                db.data.promo[db.data.order[user_id].promo_code_used].uses_left++;
                await bot.telegram.sendMessage(OWNER_ID, `Kuota kode promo *${db.data.order[user_id].promo_code_used}* telah dikembalikan karena user membatalkan pembayaran. Sisa kuota: ${db.data.promo[db.data.order[user_id].promo_code_used].uses_left}`, { parse_mode: "MARKDOWN" });
            }
            reply("Berhasil membatalkan pembayaran");
            try { fs.unlinkSync(db.data.order[user_id].qris_path); } catch(e) {}
            delete db.data.order[user_id];
        } else if (db.data.temp_deposit_order[user_id] !== undefined) {
            reply("Berhasil membatalkan deposit");
            try { fs.unlinkSync(db.data.temp_deposit_order[user_id].qris_path); } catch(e) {}
            delete db.data.temp_deposit_order[user_id];
        } else if (db.data.temp_order[user_id] !== undefined) {
            if (db.data.temp_order[user_id].promo_code && db.data.promo[db.data.temp_order[user_id].promo_code]) {
                db.data.promo[db.data.temp_order[user_id].promo_code].uses_left++;
                await bot.telegram.sendMessage(OWNER_ID, `Kuota kode promo *${db.data.temp_order[user_id].promo_code}* telah dikembalikan karena pengguna membatalkan pembelian (temp_order). Sisa kuota: ${db.data.promo[db.data.temp_order[user_id].promo_code].uses_left}`, { parse_mode: "MARKDOWN" });
            }
            reply("Sesi pembelian dibatalkan.");
            delete db.data.temp_order[user_id];
        }
        else {
            reply("Tidak ada transaksi atau deposit yang aktif untuk dibatalkan.");
        }
      }
        break;

      case 'rekap': {
        if (!isOwner) return reply(mess.owner);
        balz.reply(`Hai Owner\nIngin melihat rekap transaksi? Silahkan pilih jenis rekap di bawah ini.`, {
          parse_mode: "MARKDOWN",
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [{
                text: 'Rekap Mingguan',
                callback_data: 'rekapminggu ' + user.id.toString()
              }, {
                text: 'Rekap Bulanan',
                callback_data: 'rekapbulan ' + user.id.toString()
              }],
              [{
                text: 'Rekap Harian',
                callback_data: 'rekap_harian ' + user.id.toString()
              },{
                text: 'Statistik Lanjutan',
                callback_data: 'statistik_lanjutan ' + user.id.toString()
              }]
            ]
          }
        });
      }
        break;

      case 'kalkulator': {
        let numbers = q.split(" ").map(Number);
        if (numbers.length < 2 || isNaN(numbers[0]) || isNaN(numbers[1])) {
            return reply(`Contoh: \`/${command} 5 7\``);
        }

        let num1 = numbers[0];
        let num2 = numbers[1];

        balz.reply("Silahkan pilih kalkulator dibawah", {
          reply_markup: {
            inline_keyboard: [
              [{
                text: '+',
                callback_data: `tambah ${user.id.toString()} ${num1} ${num2}`
              }, {
                text: '-',
                callback_data: `kurang ${user.id.toString()} ${num1} ${num2}`
              }], [{
                text: '÷',
                callback_data: `bagi ${user.id.toString()} ${num1} ${num2}`
              }, {
                text: '×',
                callback_data: `kali ${user.id.toString()} ${num1} ${num2}`
              }]
            ]
          }
        });
      }
        break;

      case 'setdone':
        if (!isGroup) return reply(mess.group);
        if (!isOwner) return reply(mess.owner);
        if (db.data.chat[from].sDone.length !== 0) return reply(`Set done sudah ada di group ini.`);
        if (!q) return reply(`Gunakan dengan cara \`/${command} teks\`\n\nList function:\n@tag : untuk tag orang\n@tanggal\n@jam\n@status`);
        db.data.chat[from].sDone = q;
        reply(`Sukses set done`);
        break;

      case 'deldone':
        if (!isGroup) return reply(mess.group);
        if (!isOwner) return reply(mess.owner);
        if (db.data.chat[from].sDone.length == 0) return reply(`Belum ada set done di sini.`);
        db.data.chat[from].sDone = "";
        reply(`Sukses menghapus set done`);
        break;

      case 'changedone':
        if (!isGroup) return reply(mess.group);
        if (!isOwner) return reply(mess.owner);
        if (!q) return reply(`Gunakan dengan cara \`/${command} teks\`\n\nList function:\n@tag : untuk tag orang\n@tanggal\n@jam\n@status`);
        db.data.chat[from].sDone = q;
        reply(`Sukses mengganti teks set done`);
        break;

      case 'setproses':
        if (!isGroup) return reply(mess.group);
        if (!isOwner) return reply(mess.owner);
        if (db.data.chat[from].sProses.length !== 0) return reply(`Set proses sudah ada di group ini.`);
        if (!q) return reply(`Gunakan dengan cara \`/${command} teks\`\n\nList function:\n@tag : untuk tag orang\n@tanggal\n@jam\n@status`);
        db.data.chat[from].sProses = q;
        reply(`Sukses set proses`);
        break;

      case 'delproses':
        if (!isGroup) return reply(mess.group);
        if (!isOwner) return reply(mess.owner);
        if (db.data.chat[from].sProses.length == 0) return reply(`Belum ada set proses di sini.`);
        db.data.chat[from].sProses = "";
        reply(`Sukses menghapus set proses`);
        break;

      case 'changeproses':
        if (!isGroup) return reply(mess.group);
        if (!isOwner) return reply(mess.owner);
        if (!q) return reply(`Gunakan dengan cara \`/${command} teks\`\n\nList function:\n@tag : untuk tag orang\n@tanggal\n@jam\n@status`);
        db.data.chat[from].sProses = q;
        reply(`Sukses mengganti teks set proses`);
        break;

      case 'done': {
        if (!isGroup) return reply(mess.group);
        if (!isOwner) return reply(mess.owner);
        if (isQuoted) {
          if (db.data.chat[from].sDone.length !== 0) {
            let textDone = db.data.chat[from].sDone;
            reply(textDone.replace('@tag', `[@${simple.escapeMarkdown(pushname)}](https://t.me/${simple.escapeMarkdown(username)})`).replace('@jam', jamwib).replace('@tanggal', tanggal).replace('@status', 'Berhasil'));
          } else {
            reply(`「 *TRANSAKSI BERHASIL* 」\n\n📆 TANGGAL : ${tanggal}\n⌚ JAM : ${jamwib}\n✨ STATUS: Berhasil\n\nTerimakasih [@${simple.escapeMarkdown(pushname)}](https://t.me/${simple.escapeMarkdown(username)}) next order yaa🙏`);
          }
        } else {
          reply('Reply orangnya');
        }
      }
        break;

      case 'proses': {
        if (!isGroup) return reply(mess.group);
        if (!isOwner) return reply(mess.owner);
        if (isQuoted) {
          if (db.data.chat[from].sProses.length !== 0) {
            let textProses = db.data.chat[from].sProses;
            reply(textProses.replace('@tag', `[@${simple.escapeMarkdown(pushname)}](https://t.me/${simple.escapeMarkdown(username)})`).replace('@jam', jamwib).replace('@tanggal', tanggal).replace('@status', 'Pending'));
          } else {
            reply(`「 *TRANSAKSI PENDING* 」\n\n📆 TANGGAL : ${tanggal}\n⌚ JAM : ${jamwib}\n✨ STATUS: Pending\n\nPesanan [@${simple.escapeMarkdown(pushname)}](https://t.me/${simple.escapeMarkdown(username)}) sedang diproses🙏`);
          }
        } else {
          reply('Reply orangnya');
        }
      }
        break;

      case 'testi': {
        if (Object.keys(db.data.testi).length === 0) return reply(`Belum ada daftar testi di database`);
        let teks = `Hai [@${simple.escapeMarkdown(pushname)}](https://t.me/${simple.escapeMarkdown(username)})\nBerikut daftar testi Owner saya\n\n`;
        for (let x of db.data.testi) {
          teks += `*LIST KEY:* ${simple.escapeMarkdown(x.key)}\n\n`;
        }
        teks += `_Ingin melihat daftarnya?_\n_Ketik key saja_\n\n_Contoh:_\n${simple.escapeMarkdown(db.data.testi[0].key)}`;
        reply(teks);
      }
        break;

      case 'addtesti': {
        if (!isOwner) return reply(mess.owner);
        if (isImage || isQuotedImage) {
          if (!q.includes("@")) return reply(`Gunakan dengan cara \`/${command} key@response\`\n\n_Contoh_\n\n\`/${command} test@apa\``);
          if (isAlreadyResponTesti(q.split("@")[0])) return reply(`Daftar respon dengan key *${simple.escapeMarkdown(q.split("@")[0])}* sudah ada.`);
          let media = await balz.download();
          addResponTesti(q.split("@")[0], q.split("@")[1], true, media);
          reply(`Berhasil menambah daftar testi *${simple.escapeMarkdown(q.split("@")[0])}*`);
        } else {
          reply(`Kirim gambar dengan caption \`/${command} key@response\` atau reply gambar yang sudah ada dengan caption \`/${command} key@response\``);
        }
      }
        break;

      case 'deltesti': {
        if (!isOwner) return reply(mess.owner);
        if (db.data.testi.length === 0) return reply(`Belum ada daftar testi di database`);
        if (!q) return reply(`Gunakan dengan cara \`/${command} key\`\n\n_Contoh_\n\n\`/${command} hello\``);
        if (!isAlreadyResponTesti(q)) return reply(`Daftar testi dengan key *${simple.escapeMarkdown(q)}* tidak ada di database!`);
        delResponTesti(q);
        reply(`Sukses menghapus daftar testi dengan key *${simple.escapeMarkdown(q)}*`);
      }
        break;

      case 'settesti': {
        if (!isOwner) return reply(mess.owner);
        if (!q.includes("@")) return reply(`Gunakan dengan cara \`/${command} key@response\`\n\n_Contoh_\n\n\`/${command} test@apa\``);
        if (!isAlreadyResponTesti(q.split("@")[0])) return reply(`Daftar testi dengan key *${simple.escapeMarkdown(q.split("@")[0])}* tidak ada di database.`);
        if (isImage || isQuotedImage) {
          let media = await balz.download();
          updateResponTesti(q.split("@")[0], q.split("@")[1], true, media);
          reply(`Berhasil mengganti daftar testi *${simple.escapeMarkdown(q.split("@")[0])}*`);
        } else {
          reply(`Kirim gambar dengan caption \`/${command} key@response\` atau reply gambar yang sudah ada dengan caption \`/${command} key@response\``);
        }
      }
        break;

      case 'review': {
        if (!q) return reply(`Gunakan dengan format: \`/review [reff_id]|[rating (1-5)]|[ulasan]\`\nContoh: \`/review ABCDE|5|Produknya bagus banget!\``);
        const [reffId, rating, reviewText] = q.split('|').map(s => s.trim());

        if (!reffId || !rating || !reviewText) {
            return reply(`Format salah. Gunakan: \`/review [reff_id]|[rating (1-5)]|[ulasan]\``);
        }

        const parsedRating = parseInt(rating);
        if (isNaN(parsedRating) || parsedRating < 1 || parsedRating > 5) {
            return reply(`Rating harus angka antara 1 sampai 5.`);
        }

        const transactionIndex = db.data.transaksi.findIndex(t => t.reff_id === reffId && t.user_id === user_id);

        if (transactionIndex === -1) {
            return reply(`Transaksi dengan Reff ID *${simple.escapeMarkdown(reffId)}* tidak ditemukan atau Anda bukan pemilik transaksi ini.`);
        }

        if (db.data.transaksi[transactionIndex].review || db.data.transaksi[transactionIndex].rating) {
            return reply(`Anda sudah memberikan ulasan untuk transaksi ini.`);
        }

        db.data.transaksi[transactionIndex].rating = parsedRating;
        db.data.transaksi[transactionIndex].review = reviewText;

        if (!db.data.reviews[db.data.transaksi[transactionIndex].id]) {
            db.data.reviews[db.data.transaksi[transactionIndex].id] = [];
        }
        db.data.reviews[db.data.transaksi[transactionIndex].id].push({
            user_id: user_id,
            username: username,
            full_name: pushname,
            reff_id: reffId,
            product_id: db.data.transaksi[transactionIndex].id,
            rating: parsedRating,
            review: reviewText,
            timestamp: Date.now()
        });

        reply(`Terima kasih atas ulasan Anda untuk transaksi *${simple.escapeMarkdown(reffId)}*! Rating: ${parsedRating}/5.`);

        await bot.telegram.sendMessage(OWNER_ID, `*Ulasan Baru Diterima!*
Reff ID: *${simple.escapeMarkdown(reffId)}*
Produk: *${simple.escapeMarkdown(db.data.transaksi[transactionIndex].name)}*
Dari: [@${simple.escapeMarkdown(username)}](https://t.me/${simple.escapeMarkdown(username)}) (${simple.escapeMarkdown(pushname)})
Rating: ${parsedRating}/5
Ulasan: ${simple.escapeMarkdown(reviewText)}`, { parse_mode: "MARKDOWN", disable_web_page_preview: true });

      }
        break;

      case 'listreviews': {
        if (!q) {
            const allProductIds = Object.keys(db.data.produk);
            if (allProductIds.length === 0) return reply("Belum ada produk di database.");

            let buttons = [];
            allProductIds.forEach(productId => {
                const productName = simple.escapeMarkdown(db.data.produk[productId].name);
                buttons.push([{ text: `Lihat Ulasan ${productName}`, callback_data: `check_product_reviews ${productId} ${user_id}` }]);
            });

            await balz.replyWithMarkdown(`*Pilih produk untuk melihat ulasannya:*\n\n_Atau gunakan perintah \`/listreviews all\` untuk melihat semua ulasan terbaru._`, {
                disable_web_page_preview: true,
                reply_markup: {
                    inline_keyboard: buttons
                }
            });
            return;
        }

        if (q.toLowerCase() === 'all') {
            let allReviews = [];
            Object.values(db.data.reviews).forEach(productReviews => {
                allReviews.push(...productReviews);
            });

            if (allReviews.length === 0) {
                return reply(`Belum ada ulasan di database.`);
            }

            allReviews.sort((a, b) => b.timestamp - a.timestamp);

            let teks_all_reviews = `*╭────〔 SEMUA ULASAN TERBARU 📝 〕─*\n*╰┈┈┈┈┈┈┈┈*\n\n`;
            const reviewsToShow = allReviews.slice(0, 10);

            reviewsToShow.forEach(reviewItem => {
                const product_name = db.data.produk[reviewItem.product_id]?.name || 'Produk Tidak Ditemukan';
                teks_all_reviews += `*📦 Produk:* ${simple.escapeMarkdown(product_name)}\n`;
                teks_all_reviews += `*🧾 Reff ID:* ${simple.escapeMarkdown(reviewItem.reff_id)}\n`;
                teks_all_reviews += `*👤 Dari:* [@${simple.escapeMarkdown(reviewItem.username || 'N/A')}](${reviewItem.username ? `https://t.me/${reviewItem.username}` : ''})\n`;
                teks_all_reviews += `*⭐ Rating:* ${reviewItem.rating}/5\n`;
                teks_all_reviews += `*💬 Ulasan:* ${simple.escapeMarkdown(reviewItem.review)}\n`;
                teks_all_reviews += `*📅 Tanggal:* ${moment(reviewItem.timestamp).format('DD-MM-YYYY HH:mm:ss')}\n\n`;
            });
            if (allReviews.length > 10) {
                teks_all_reviews += `_... dan ${allReviews.length - 10} ulasan lainnya._`;
            }
            reply(teks_all_reviews);

        } else {
            await simple.displayProductReviews(balz, q, user_id, false);
        }
      }
        break;

      case 'welcome': {
        if (!isGroup) return reply(mess.group);
        if (!isOwner) return reply(mess.owner);
        balz.reply(`Hai Owner\nSilahkan pilih fitur Welcome di bawah ini.`, {
          parse_mode: "MARKDOWN",
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [{
                text: 'Welcome Aktif',
                callback_data: 'welcome ' + user.id.toString() + " on " + from
              }, {
                text: 'Welcome Nonaktif',
                callback_data: 'welcome ' + user.id.toString() + " off " + from
              }]
            ]
          }
        });
      }
        break;

      case 'goodbye': {
        if (!isGroup) return reply(mess.group);
        if (!isOwner) return reply(mess.owner);
        balz.reply(`Hai Owner\nSilahkan pilih fitur Good Bye di bawah ini.`, {
          parse_mode: "MARKDOWN",
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [{
                text: 'Good Bye Aktif',
                callback_data: 'goodbye ' + user.id.toString() + " on " + from
              }, {
                text: 'Good Bye Nonaktif',
                callback_data: 'goodbye ' + user.id.toString() + " off " + from
              }]
            ]
          }
        });
      }
        break;

      case 'backup': {
        if (!isOwner) return reply(mess.owner);
        await reply('Mengumpulkan semua file ke folder...');
        let ls = (await execSync("ls")).toString().split("\n").filter((pe) =>
          pe != "node_modules" &&
          pe != "session" &&
          pe != "package-lock.json" &&
          pe != "yarn.lock" &&
          pe != ".npm" &&
          pe != ".cache" &&
          pe != ""
        );
        await simple.sleep(100);
        if (isGroup) await reply('Script akan dikirim lewat PC!');
        await execSync(`zip -r SC-AUTO-ORDER.zip ${ls.join(" ")}`);
        await balz.sendDocument({
          source: "./SC-AUTO-ORDER.zip"
        }, {
          chat_id: OWNER_ID,
          caption: "Sukses backup Script",
          parse_mode: "MARKDOWN",
          disable_web_page_preview: true
        });
        await execSync("rm -rf SC-AUTO-ORDER.zip");
      }
        break;

      case 'broadcast': case 'bc': {
        if (!isOwner) return reply(mess.owner);
        if (!q) return reply(`Contoh: \`/${command} teks broadcast\``);
        if (isImage) {
          let media = await balz.download();
          for (let i of db.data.user) {
            bot.telegram.sendPhoto(i, { url: media }, {
              caption: q,
              parse_mode: "MARKDOWN",
              disable_web_page_preview: true
            }).catch(e => console.error(`Gagal mengirim broadcast foto ke user ${i}:`, e));
          }
          reply(`Berhasil Broadcast ke ${db.data.user.length} Pengguna`);
        } else {
          for (let i of db.data.user) {
            bot.telegram.sendMessage(i, q, {
              parse_mode: "MARKDOWN",
              disable_web_page_preview: true
            }).catch(e => console.error(`Gagal mengirim broadcast teks ke user ${i}:`, e));
            await simple.sleep(300);
          }
          reply(`Berhasil Broadcast ke ${db.data.user.length} Pengguna`);
        }
      }
        break;

      case 'id': case 'myid': {
        balz.reply(simple.escapeMarkdown(user_id));
      }
        break;

      case 'setnotifstok': {
          if (!isOwner) return reply(mess.owner);
          if (!q) return reply(`Gunakan dengan cara: \`/${command} [idproduk]|[jumlah_minimum]\` atau \`/${command} off [idproduk]\`\nContoh: \`/${command} ID_PRODUK_A|5\``);

          const parts = q.split("|");
          const productId = parts[0].trim();
          const threshold = parseInt(parts[1]);

          if (productId.toLowerCase() === 'off') {
              const productToDisable = parts[1].trim();
              if (!db.data.produk[productToDisable]) return reply(`Produk dengan ID *${simple.escapeMarkdown(productToDisable)}* tidak ditemukan.`);
              if (!db.data.produk[productToDisable].stock_notification) return reply(`Notifikasi stok untuk produk *${simple.escapeMarkdown(productToDisable)}* belum diatur.`);

              delete db.data.produk[productToDisable].stock_notification;
              reply(`Notifikasi stok rendah untuk produk *${simple.escapeMarkdown(productToDisable)}* berhasil dinonaktifkan.`);
          } else {
              if (!db.data.produk[productId]) return reply(`Produk dengan ID *${simple.escapeMarkdown(productId)}* tidak ditemukan.`);
              if (isNaN(threshold) || threshold < 0) return reply(`Jumlah minimum harus angka positif atau nol.`);

              db.data.produk[productId].stock_notification = threshold;
              reply(`Notifikasi stok rendah untuk produk *${simple.escapeMarkdown(productId)}* berhasil diatur ke *${threshold}*.`);
          }
      }
        break;

      case 'addkategori': {
          if (!isOwner) return reply(mess.owner);
          let data = q.split("|");
          if (data.length < 3) return reply(`Contoh: \`/${command} idkategori|Nama Kategori|Deskripsi Kategori\`\n\n*Contoh:*\n\`/${command} DIGITAL|Produk Digital|Akun game, lisensi, dll.\``);

          const categoryId = data[0].toUpperCase();
          const categoryName = data[1];
          const categoryDesc = data[2];

          if (db.data.kategori[categoryId]) return reply(`Kategori dengan ID *${simple.escapeMarkdown(categoryId)}* sudah ada di database.`);

          db.data.kategori[categoryId] = {
              id: categoryId,
              name: categoryName,
              desc: categoryDesc
          };
          reply(`Berhasil menambahkan kategori *${simple.escapeMarkdown(categoryName)}* dengan ID *${simple.escapeMarkdown(categoryId)}*.`);
      }
        break;

      case 'delkategori': {
          if (!isOwner) return reply(mess.owner);
          if (!q) return reply(`Contoh: \`/${command} idkategori\``);

          const categoryId = q.toUpperCase();
          if (!db.data.kategori[categoryId]) return reply(`Kategori dengan ID *${simple.escapeMarkdown(categoryId)}* tidak ditemukan.`);

          const productsInCategory = Object.values(db.data.produk).filter(p => p.category_id === categoryId);
          if (productsInCategory.length > 0) {
              return reply(`Tidak bisa menghapus kategori *${simple.escapeMarkdown(categoryId)}* karena masih ada ${productsInCategory.length} produk yang terhubung dengannya. Harap hapus atau pindahkan produk-produk tersebut terlebih dahulu.`);
          }

          delete db.data.kategori[categoryId];
          reply(`Berhasil menghapus kategori *${simple.escapeMarkdown(categoryId)}*.`);
      }
        break;

      case 'listkategori': {
          if (!isOwner) return reply(mess.owner);
          const categories = Object.keys(db.data.kategori);
          if (categories.length === 0) return reply("Belum ada kategori di database.");

          let teks = `*╭────〔 DAFTAR KATEGORI 📂 〕─*\n*╰┈┈┈┈┈┈┈┈*\n\n`;
          categories.forEach(catId => {
              const category = db.data.kategori[catId];
              const productCount = Object.values(db.data.produk).filter(p => p.category_id === catId).length;
              teks += `*🗂️ ID:* ${simple.escapeMarkdown(category.id)}\n`;
              teks += `*🏷️ Nama:* ${simple.escapeMarkdown(category.name)}\n`;
              teks += `*📄 Deskripsi:* ${simple.escapeMarkdown(category.desc)}\n`;
              teks += `*📦 Jumlah Produk:* ${productCount}\n\n`;
          });
          reply(teks);
      }
        break;

      // HAPUS PERINTAH INI DARI INDEX.JS:
      // case 'setmerchant': {
      //   if (!isOwner) return reply(mess.owner);
      //   if (!q) return reply(`Contoh: \`/${command} YOUR_MERCHANT_ID\``);
      //   dborkut.data.settings.merchantId = q; // Simpan ke database
      //   reply(`Merchant ID berhasil diatur menjadi: *${simple.escapeMarkdown(q)}*`);
      // }
      //   break;

      // case 'setapikeyorkut': {
      //   if (!isOwner) return reply(mess.owner);
      //   if (!q) return reply(`Contoh: \`/${command} YOUR_API_KEY_ORKUT\``);
      //   dborkut.data.settings.apikey_orkut = q; // Simpan ke database
      //   reply(`API Key Orkut berhasil diatur menjadi: *${simple.escapeMarkdown(q)}*`);
      // }
      //   break;

      // case 'setcodeqr': {
      //   if (!isOwner) return reply(mess.owner);
      //   if (!q) return reply(`Contoh: \`/${command} YOUR_CODE_QR\``);
      //   dborkut.data.settings.codeqr = q; // Simpan ke database
      //   reply(`Code QR berhasil diatur menjadi: *${simple.escapeMarkdown(q)}*`);
      // }
      //   break;
      // AKHIR HAPUS

      default:
        if (budy.startsWith('=>')) {
          if (!isOwner) return;
          function Return(sul) {
            sat = JSON.stringify(sul, null, 2);
            bang = util.format(sat);
            if (sat == undefined) {
              bang = util.format(sul);
            }
            return balz.reply(simple.escapeMarkdown(bang));
          }
          try {
            balz.reply(simple.escapeMarkdown(util.format(eval(`(async () => { ${budy.slice(3)} })()`))));
          } catch (e) {
            balz.reply(simple.escapeMarkdown(String(e)));
          }
        }
        if (budy.startsWith('>')) {
          if (!isOwner) return;
          try {
            let evaled = await eval(budy.slice(2));
            if (typeof evaled !== 'string') evaled = require('util').inspect(evaled);
            await balz.reply(simple.escapeMarkdown(evaled));
          } catch (err) {
            balz.reply(simple.escapeMarkdown(String(err)));
          }
        }
        if (budy.startsWith('$')) {
          if (!isOwner) return;
          let qur = budy.slice(2);
          exec(qur, (err, stdout) => {
            if (err) return reply(simple.escapeMarkdown(String(err)));
            if (stdout) {
              balz.reply(simple.escapeMarkdown(stdout));
            }
          });
        }
    }
  } catch (e) {
    balz.reply(util.format(e));
    console.log('[ ERROR ] ' + e);
  }
};

let time = moment(new Date()).format('HH:mm:ss DD/MM/YYYY');
let file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  console.log(chalk.greenBright(`[ ${BOT_NAME} ]  `) + time + chalk.cyanBright(` "${file}" Telah diupdate!`));
  delete require.cache[file];
  require(file);
});