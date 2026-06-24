// function/imageUtils.js
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');
const moment = require("moment-timezone"); // Impor moment-timezone di imageUtils.js

// Asumsikan global.toRupiah sudah didefinisikan di main.js dan bisa diakses secara global
// Jika tidak, Anda perlu mengimpor atau mendefinisikannya di sini juga
function toRupiah(angka) {
    let num = Number(angka);
    if (isNaN(num) || num === null || num === undefined) return 'N/A';
    var saldo = '';
    var angkarev = num.toString().split('').reverse().join('');
    for (var i = 0; i < angkarev.length; i++)
        if (i % 3 == 0) saldo += angkarev.substr(i, 3) + '.';
    return '' + saldo.split('', saldo.length - 1).reverse().join('');
}


async function createDynamicInvoiceImage(invoiceData, outputFileName) {
    const templatePath = './IMG-20250622-WA0011.jpg'; // Path ke gambar template Anda
    const canvas = createCanvas(1280, 720); // Sesuaikan ukuran canvas dengan gambar Anda (lebar, tinggi)
    const ctx = canvas.getContext('2d');

    try {
        const image = await loadImage(templatePath);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

        // --- Atur Font dan Warna untuk Teks ---
        ctx.fillStyle = '#FFFFFF'; // Warna teks putih
        ctx.font = '32px Arial Bold'; // Jenis dan ukuran font, sesuaikan (misal: "32px Arial Bold")

        // --- Tambahkan Tanggal Pembelian (Posisi harus disesuaikan) ---
        // Anda perlu menyesuaikan koordinat X, Y ini agar sesuai dengan desain gambar Anda
        ctx.fillText(`${invoiceData.tanggal}`, 430, 290); // Contoh posisi untuk "TANGGAL PEMBELIAN"
        // --- Tambahkan Invoice Pembelian (Reff ID) (Posisi harus disesuaikan) ---
        ctx.fillText(`${invoiceData.reffId}`, 780, 290); // Contoh posisi untuk "INVOICE PEMBELIAN"

        // --- Tambahkan Detail Pesanan ---
        ctx.font = '30px Arial'; // Sesuaikan font untuk detail
        ctx.fillStyle = '#FFFFFF'; // Warna teks

        // Posisi untuk "PRODUK :"
        ctx.fillText(`${invoiceData.productName}`, 280, 480);
        // Posisi untuk "TUJUAN :"
        ctx.fillText(`${invoiceData.quantity} Unit`, 280, 560);
        // Posisi untuk "SN :"
        ctx.fillText(`${invoiceData.snDetails}`, 280, 640);


        const buffer = canvas.toBuffer('image/jpeg'); // Simpan sebagai JPEG
        const outputPath = path.join('./options/image', outputFileName); // Sesuaikan path penyimpanan
        fs.writeFileSync(outputPath, buffer);

        return outputPath;
    } catch (error) {
        console.error('Error creating dynamic invoice image:', error);
        return null;
    }
}

module.exports = { createDynamicInvoiceImage };