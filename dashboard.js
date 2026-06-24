const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const os = require('os');

module.exports = function initDashboard(dependencies) {
    const { readDB, writeDB, db_path, chalk, bot, addLog, sendBackupToOwner, dbMutex } = dependencies;
    
    const app = express();
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(bodyParser.json());
    app.use(express.static(path.join(__dirname, 'public')));

    const loginHtml = fs.readFileSync(path.join(__dirname, 'public', 'login.html'), 'utf-8');
    const dashboardHtml = fs.readFileSync(path.join(__dirname, 'public', 'dashboard.html'), 'utf-8');
    const myProdukHtml = fs.readFileSync(path.join(__dirname, 'public', 'my_produk.html'), 'utf-8');
    const kelolaStockHtml = fs.readFileSync(path.join(__dirname, 'public', 'kelola_stock.html'), 'utf-8');
    let placeholderHtml = '';
    try { placeholderHtml = fs.readFileSync(path.join(__dirname, 'public', 'placeholder.html'), 'utf-8'); } catch(e) {}

    const renderPlaceholder = (res, title, icon, activeKey) => {
        let html = placeholderHtml
            .replace(/\{\{TITLE\}\}/g, title)
            .replace(/\{\{ICON\}\}/g, icon);
        const keys = ['dashboard', 'manajemen_pesanan', 'my_produk', 'kelola_stock', 'voucher_promo', 'broadcast', 'log_aktivitas', 'add_saldo', 'users', 'settings'];
        keys.forEach(k => {
            html = html.replace(new RegExp(`\\{\\{ACT_${k}\\}\\}`, 'g'), k === activeKey ? 'active' : '');
        });
        res.send(html);
    };

    // Simple Cookie Middleware
    const checkAuth = (req, res, next) => {
        const cookieHeader = req.headers.cookie;
        if (!cookieHeader) return res.redirect('/?error=2');
        const cookies = Object.fromEntries(cookieHeader.split('; ').map(c => c.split('=')));
        if (cookies.admin_session) {
            req.adminUser = cookies.admin_session;
            next();
        } else {
            res.redirect('/?error=2');
        }
    };

    app.get('/', (req, res) => {
        // Auto-login jika cookie valid
        const cookieHeader = req.headers.cookie;
        if (cookieHeader) {
            const cookies = Object.fromEntries(cookieHeader.split('; ').map(c => c.split('=')));
            if (cookies.admin_session) return res.redirect('/dashboard');
        }
        
        let errorDisplay = req.query.error ? 'block' : 'none';
        let page = loginHtml.replace(/\{\{error_display\}\}/g, errorDisplay);
        res.send(page);
    });

    app.post('/login', (req, res) => {
        const { user, pass } = req.body;
        let settings = readDB(db_path.settings);
        let webUser = settings.web?.default_user || "admin";
        let webPass = settings.web?.default_pass || "password123";

        if (user === webUser && pass === webPass) {
            // Set cookie 1 hari
            if (addLog) addLog("LOGIN", "Admin login ke dashboard", `Akses dari IP: ${req.ip}`);
            res.setHeader('Set-Cookie', `admin_session=${user}; HttpOnly; Path=/; Max-Age=86400`);
            res.redirect('/dashboard');
        } else {
            res.redirect('/?error=1');
        }
    });

    app.get('/dashboard', checkAuth, (req, res) => {
        let users = readDB(db_path.user) || [];
        let store = readDB(db_path.store) || { products: [] };
        let trxs = readDB(db_path.trx) || [];

        let totalUsers = users.length;
        let totalProducts = store.products ? store.products.length : 0;
        let totalSales = trxs.filter(tx => tx.status === "success" && tx.type !== "topup").length;

        const uptime = os.uptime();
        const days = Math.floor(uptime / (3600*24));
        const hours = Math.floor(uptime % (3600*24) / 3600);
        
        let html = dashboardHtml
            .replace(/\{\{USER\}\}/g, req.adminUser)
            .replace(/\{\{TOTAL_USER\}\}/g, totalUsers.toLocaleString())
            .replace(/\{\{TOTAL_PRODUK\}\}/g, totalProducts.toLocaleString())
            .replace(/\{\{TOTAL_SALES\}\}/g, totalSales.toLocaleString())
            .replace(/\{\{BOT_STATUS\}\}/g, 'Online & Respon Cepat')
            .replace(/\{\{UPTIME\}\}/g, `${days} Hari, ${hours} Jam`)
            .replace(/\{\{PORT\}\}/g, global.WEB_PORT || process.env.SERVER_PORT || 2195);
        res.send(html);
    });

    app.get('/my_produk', checkAuth, (req, res) => {
        let store = readDB(db_path.store) || { products: [], categories: [] };
        let catalogs = {};
        
        if (store.categories) {
            store.categories.forEach(c => { catalogs[c] = []; });
        }
        
        store.products.forEach(p => {
            let cat = p.category;
            if (!catalogs[cat]) catalogs[cat] = [];
            catalogs[cat].push(p);
        });

        let rows = '';
        const escapeHtml = (str) => {
            return (str || '').toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
        };

        if (Object.keys(catalogs).length > 0) {
            for (let cat in catalogs) {
                let prods = catalogs[cat];
                let varCount = prods.length;
                let minH = Math.min(...prods.map(p => p.price));
                let maxH = Math.max(...prods.map(p => p.price));
                let hargaRange = (minH === maxH) ? `Rp ${minH.toLocaleString()}` : `Rp ${minH.toLocaleString()} - Rp ${maxH.toLocaleString()}`;
                
                let catDesc = "";
                if (store.category_details && store.category_details[cat.toUpperCase()]) {
                    catDesc = store.category_details[cat.toUpperCase()];
                } else if (prods.length > 0 && prods[0].desc) {
                    catDesc = prods[0].desc;
                }
                let encodedDesc = escapeHtml(catDesc);
                let encodedProds = escapeHtml(JSON.stringify(prods));

                rows += `
                <div class="product-card">
                    <div class="pc-header">
                        <input type="checkbox" class="pc-checkbox chk-row" value="${cat}" onchange="checkHapusMassal()">
                        <div class="pc-actions">
                            <button class="pc-btn" data-prods="${encodedProds}" data-desc="${encodedDesc}" onclick="openModal('modalAdd', '${cat}', this.dataset.desc, this.dataset.prods)"><i class="fa-solid fa-pen"></i></button>
                            <button class="pc-btn" onclick="hapusKatalog('${cat}')"><i class="fa-regular fa-trash-can"></i></button>
                        </div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px;">
                        <div>
                            <div class="pc-title">${cat}</div>
                            <div class="pc-subtitle">Katalog Produk</div>
                        </div>
                        <div class="pc-var-pill"><i class="fa-solid fa-layer-group"></i> ${varCount} Model</div>
                    </div>
                    
                    <div style="flex: 1;"></div>
                    
                    <div class="pc-footer">
                        <div>
                            <div class="pc-price-lbl">STARTING FROM</div>
                            <div class="pc-price-val">${hargaRange}</div>
                        </div>
                        <button class="pc-go" data-prods="${encodedProds}" data-desc="${encodedDesc}" onclick="openModal('modalAdd', '${cat}', this.dataset.desc, this.dataset.prods)"><i class="fa-solid fa-chevron-right"></i></button>
                    </div>
                </div>
                `;
            }
        } else {
            rows = `<div style="grid-column: 1 / -1; text-align:center; color:#9CA3AF; padding:50px;">Belum ada katalog. Silahkan buat baru.</div>`;
        }

        let html = myProdukHtml.replace(/\{\{KATALOG_ROWS\}\}/g, rows);
        res.send(html);
    });

    app.get('/kelola_stock', checkAuth, (req, res) => {
        let store = readDB(db_path.store) || { products: [] };
        let kelolaStockHtml = fs.readFileSync(path.join(__dirname, 'public', 'kelola_stock.html'), 'utf8');

        let catalogs = {};
        let lowStockAlert = 0;

        store.products.forEach(p => {
            if (!catalogs[p.category]) catalogs[p.category] = [];
            catalogs[p.category].push(p);
            if (p.stocks && p.stocks.length < 5) {
                lowStockAlert++;
            }
        });

        let html = kelolaStockHtml
            .replace(/\{\{LOW_STOCK_COUNT\}\}/g, lowStockAlert)
            .replace(/\{\{CATALOG_DATA\}\}/g, encodeURIComponent(JSON.stringify(catalogs)));
        res.send(html);
    });

    app.post('/api/stock/add', checkAuth, async (req, res) => {
        let unlock;
        try {
            unlock = await dbMutex.lock();
            const { productId, stockLines } = req.body;
            let store = readDB(db_path.store);
            let product = store.products.find(p => p.id === productId);
            if(!product) {
                if (unlock) unlock();
                return res.json({success: false, error: 'Produk tidak ditemukan'});
            }
            
            if(!product.stocks) product.stocks = [];
            
            let validLines = stockLines.map(s => s.trim()).filter(s => s.length > 0).map(l => {
                const parts = l.split("|");
                return {
                    email: (parts[0] || l).trim(),
                    pw: (parts[1] || "").trim(),
                    twoFA: (parts[2] || "").trim(),
                    pin: (parts[3] || "").trim(),
                    profile: (parts[4] || "").trim(),
                    isLink: !parts[1] || parts[1].trim() === "",
                    expDays: parseInt(parts[5]) || 0,
                    addedAt: Date.now()
                };
            });
            product.stocks.push(...validLines);
            if (addLog) addLog("STOCK UPDATE", "Tambah Stok (Dashboard)", `Produk: ${product.name}, Tambahan: ${validLines.length} item`);
            
            writeDB(db_path.store, store);
            if (unlock) unlock();
            res.json({success: true, added: validLines.length});
        } catch(e) {
            if (unlock) unlock();
            res.json({success: false, error: e.message});
        }
    });

    app.post('/api/stock/delete', checkAuth, async (req, res) => {
        let unlock;
        try {
            unlock = await dbMutex.lock();
            const { productId, linesToDelete } = req.body;
            let store = readDB(db_path.store);
            let product = store.products.find(p => p.id === productId);
            if(!product) {
                if (unlock) unlock();
                return res.json({success: false, error: 'Produk tidak ditemukan'});
            }
            
            if(!product.stocks) product.stocks = [];
            
            let deletedCount = 0;
            let indexes = linesToDelete.map(i => parseInt(i)).filter(i => !isNaN(i)).sort((a,b) => b - a);
            indexes.forEach(idx => {
                if (idx >= 0 && idx < product.stocks.length) {
                    product.stocks.splice(idx, 1);
                    deletedCount++;
                }
            });
            if (addLog) addLog("STOCK UPDATE", "Hapus Stok (Dashboard)", `Produk: ${product.name}, Dihapus: ${deletedCount} item`);
            
            writeDB(db_path.store, store);
            if (unlock) unlock();
            res.json({success: true, deleted: deletedCount});
        } catch(e) {
            if (unlock) unlock();
            res.json({success: false, error: e.message});
        }
    });


    app.get('/voucher_promo', checkAuth, (req, res) => {
        let promos = readDB(db_path.promo) || [];
        let activePromos = promos.filter(p => !p.expiresAt || p.expiresAt > Date.now());
        if (activePromos.length !== promos.length) {
            promos = activePromos;
            fs.writeFileSync(db_path.promo, JSON.stringify(promos, null, 2));
        }
        let html = fs.readFileSync(path.join(__dirname, 'public', 'voucher_promo.html'), 'utf8');
        html = html.replace(/\{\{PROMOS_DATA\}\}/g, encodeURIComponent(JSON.stringify(promos)));
        res.send(html);
    });

    app.get('/log', checkAuth, (req, res) => {
        let html = fs.readFileSync(path.join(__dirname, 'public', 'log.html'), 'utf8');
        res.send(html);
    });

    app.get('/api/logs', checkAuth, (req, res) => {
        try {
            if (fs.existsSync(db_path.activity_log)) {
                res.json({ success: true, logs: JSON.parse(fs.readFileSync(db_path.activity_log, 'utf8')) });
            } else {
                res.json({ success: true, logs: [] });
            }
        } catch(e) {
            res.json({ success: false, error: e.message });
        }
    });

    app.delete('/api/logs', checkAuth, (req, res) => {
        try {
            if (fs.existsSync(db_path.activity_log)) {
                fs.writeFileSync(db_path.activity_log, '[]');
            }
            res.json({ success: true });
        } catch(e) {
            res.json({ success: false, error: e.message });
        }
    });

    app.post('/api/backup', checkAuth, async (req, res) => {
        try {
            if (sendBackupToOwner) {
                await sendBackupToOwner(null);
                res.json({ success: true, message: 'Backup system has been compiled and sent to your Telegram.' });
            } else {
                res.json({ success: false, error: 'Backup feature not available.' });
            }
        } catch(e) {
            res.json({ success: false, error: e.message });
        }
    });

    app.get('/api/chart', checkAuth, (req, res) => {
        try {
            let trxs = readDB(db_path.trx) || [];
            let chartData = {};
            
            // Inisialisasi 30 hari ke belakang
            for (let i = 29; i >= 0; i--) {
                let d = new Date();
                d.setDate(d.getDate() - i);
                let dateStr = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }); // "14 Mei"
                chartData[dateStr] = 0;
            }

            // Agregasi penjualan
            trxs.forEach(tx => {
                if (tx.status === "success" && tx.date && tx.type !== "topup") {
                    let txDate = new Date(tx.date);
                    let dateStr = txDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                    if (chartData[dateStr] !== undefined) {
                        chartData[dateStr] += (tx.amount || 0);
                    }
                }
            });

            let labels = Object.keys(chartData);
            let values = Object.values(chartData);

            res.json({ success: true, labels, values });
        } catch(e) {
            res.json({ success: false, error: e.message });
        }
    });

    app.post('/api/promo/simpan', checkAuth, (req, res) => {
        try {
            const payload = req.body;
            let promos = readDB(db_path.promo) || [];
            let pIdx = promos.findIndex(p => p.code === payload.code);
            
            // Transform payload to include fields needed by main.js
            let discountStr = payload.type === 'percent' ? `${payload.value}%` : `${payload.value}`;
            let expiresAt = payload.exp ? new Date(payload.exp).getTime() : 0;
            
            let voucher = {
                code: payload.code,
                discount: discountStr, // used by main.js
                expiresAt: expiresAt,  // used by main.js
                type: payload.type,
                value: payload.value,
                min_spend: payload.min_spend,
                limit: payload.limit,
                exp: payload.exp,
                active: payload.active,
                usedBy: [], // used by main.js
                used: 0
            };
            
            if (pIdx !== -1) {
                voucher.usedBy = promos[pIdx].usedBy || [];
                voucher.used = promos[pIdx].used || 0; 
                promos[pIdx] = voucher;
            } else {
                promos.push(voucher);
            }
            
            fs.writeFileSync(db_path.promo, JSON.stringify(promos, null, 2));
            res.json({success: true});
        } catch(e) {
            res.json({success: false, error: e.message});
        }
    });

    app.post('/api/promo/hapus', checkAuth, (req, res) => {
        try {
            let { code } = req.body;
            let promos = readDB(db_path.promo) || [];
            promos = promos.filter(p => p.code !== code);
            fs.writeFileSync(db_path.promo, JSON.stringify(promos, null, 2));
            res.json({success: true});
        } catch(e) {
            res.json({success: false, error: e.message});
        }
    });
    app.get('/broadcast', checkAuth, (req, res) => {
        let u = readDB(db_path.user) || [];
        let html = fs.readFileSync(path.join(__dirname, 'public', 'broadcast.html'), 'utf8');
        html = html.replace(/\{\{TOTAL_USER\}\}/g, u.length.toLocaleString());
        res.send(html);
    });

    app.post('/api/broadcast/send', checkAuth, async (req, res) => {
        try {
            const { message } = req.body;
            if(!message) return res.json({success: false, error: 'Pesan kosong'});
            
            let users = readDB(db_path.user) || [];
            if(users.length === 0) return res.json({success: false, error: 'Belum ada pengguna bot'});

            res.json({success: true, targetCount: users.length});
            
            // Kirim secara paralel dalam batch 25 user agar cepat tanpa kena rate-limit
            setTimeout(async () => {
                let successCount = 0;
                let failCount = 0;
                const BATCH_SIZE = 25;

                for (let i = 0; i < users.length; i += BATCH_SIZE) {
                    const batch = users.slice(i, i + BATCH_SIZE);
                    const results = await Promise.allSettled(
                        batch.map(u => bot.telegram.sendMessage(u.id, message, { parse_mode: 'HTML' })
                            .catch(() => bot.telegram.sendMessage(u.id, message, { parse_mode: 'Markdown' }))
                        )
                    );
                    successCount += results.filter(r => r.status === 'fulfilled').length;
                    failCount += results.filter(r => r.status === 'rejected').length;

                    // Jeda 500ms antar batch agar tidak kena rate-limit Telegram
                    if (i + BATCH_SIZE < users.length) {
                        await new Promise(r => setTimeout(r, 500));
                    }
                }
                console.log(chalk.green(`[BROADCAST SELESAI] Sukses: ${successCount}, Gagal: ${failCount}`));
            }, 500);
            
        } catch(e) {
            res.json({success: false, error: e.message});
        }
    });
    app.get('/users', checkAuth, (req, res) => {
        let users = readDB(db_path.user) || [];
        let html = fs.readFileSync(path.join(__dirname, 'public', 'users.html'), 'utf8');
        html = html.replace(/\{\{USERS_DATA\}\}/g, encodeURIComponent(JSON.stringify(users)));
        res.send(html);
    });

    app.post('/api/saldo/add', checkAuth, async (req, res) => {
        try {
            const { id, amount } = req.body;
            if(!id || !amount || amount <= 0) return res.json({success: false, error: 'Input tidak valid'});
            
            let users = readDB(db_path.user) || [];
            let uIdx = users.findIndex(u => String(u.id) === String(id));
            if(uIdx === -1) return res.json({success: false, error: 'Pengguna tidak ditemukan di database'});
            
            users[uIdx].balance = (users[uIdx].balance || 0) + parseInt(amount);
            fs.writeFileSync(db_path.user, JSON.stringify(users, null, 2));

            // Kirim notifikasi bot
            let msg = `🎉 *SALDO DITAMBAHKAN*\n\nBerhasil menambahkan Saldo sebesar *Rp ${parseInt(amount).toLocaleString()}* ke akun Anda.\nTotal Saldo Anda sekarang: *Rp ${users[uIdx].balance.toLocaleString()}*`;
            try {
                await bot.telegram.sendMessage(id, msg, { parse_mode: 'Markdown' });
            } catch(e) {
                console.log(chalk.red(`[Web Console] Gagal mengirim pesan saldo ke ${id}: ${e.message}`));
            }

            res.json({success: true, newSaldo: users[uIdx].balance});
        } catch(e) {
            res.json({success: false, error: e.message});
        }
    });

    app.post('/api/saldo/cut', checkAuth, async (req, res) => {
        try {
            const { id, amount } = req.body;
            if(!id || !amount || amount <= 0) return res.json({success: false, error: 'Input tidak valid'});
            
            let users = readDB(db_path.user) || [];
            let uIdx = users.findIndex(u => String(u.id) === String(id));
            if(uIdx === -1) return res.json({success: false, error: 'Pengguna tidak ditemukan di database'});
            
            users[uIdx].balance = (users[uIdx].balance || 0) - parseInt(amount);
            if (users[uIdx].balance < 0) users[uIdx].balance = 0;

            fs.writeFileSync(db_path.user, JSON.stringify(users, null, 2));

            // Kirim notifikasi bot
            let msg = `⚠️ *SALDO DIPOTONG*\n\nSaldo sebesar *Rp ${parseInt(amount).toLocaleString()}* telah ditarik dari akun Anda.\nSisa Saldo Anda sekarang: *Rp ${users[uIdx].balance.toLocaleString()}*`;
            try {
                await bot.telegram.sendMessage(id, msg, { parse_mode: 'Markdown' });
            } catch(e) {
                console.log(chalk.red(`[Web Console] Gagal mengirim pesan pemotongan saldo ke ${id}: ${e.message}`));
            }

            res.json({success: true, newSaldo: users[uIdx].balance});
        } catch(e) {
            res.json({success: false, error: e.message});
        }
    });

    app.get('/settings', checkAuth, (req, res) => {
        let html = fs.readFileSync(path.join(__dirname, 'public', 'settings.html'), 'utf8');
        res.send(html);
    });

    app.get('/api/settings', checkAuth, (req, res) => {
        let s = readDB(db_path.settings) || {};
        res.json({ success: true, settings: s });
    });

    app.post('/api/settings', checkAuth, (req, res) => {
        try {
            let s = readDB(db_path.settings) || {};
            const newSettings = req.body;
            s = { ...s, ...newSettings };
            fs.writeFileSync(db_path.settings, JSON.stringify(s, null, 2));
            res.json({ success: true });
        } catch (e) {
            res.json({ success: false, error: e.message });
        }
    });

    app.post('/api/katalog/simpan', checkAuth, async (req, res) => {
        let unlock;
        try {
            unlock = await dbMutex.lock();
            const { catalogName, oldCatalogName, catalogDesc, variants } = req.body;
            if (!catalogName || !variants || variants.length === 0) {
                if (unlock) unlock();
                return res.json({ success: false, error: 'Data tidak lengkap' });
            }
            let store = readDB(db_path.store) || { products: [], categories: [] };
            
            let targetCategory = oldCatalogName || catalogName;
            
            if (oldCatalogName && oldCatalogName !== catalogName) {
                if (store.categories) {
                    store.categories = store.categories.filter(c => c !== oldCatalogName);
                }
                if (store.category_details && store.category_details[oldCatalogName.toUpperCase()]) {
                    let oldDesc = store.category_details[oldCatalogName.toUpperCase()];
                    delete store.category_details[oldCatalogName.toUpperCase()];
                    if (!store.category_details) store.category_details = {};
                    store.category_details[catalogName.toUpperCase()] = oldDesc;
                }
            }

            if (!store.categories) store.categories = [];
            if (!store.categories.includes(catalogName)) {
                store.categories.push(catalogName);
            }

            if (!store.category_details) store.category_details = {};
            if (catalogDesc !== undefined) {
                store.category_details[catalogName.toUpperCase()] = catalogDesc;
            }

            let existingProds = store.products.filter(p => p.category === targetCategory);
            store.products = store.products.filter(p => p.category !== targetCategory);

            let timestamp = Date.now();
            variants.forEach((v, index) => {
                let pId = v.id || `P${timestamp}_${index}`;
                let oldProd = existingProds.find(op => op.id === pId);
                let preservedStocks = oldProd ? oldProd.stocks : [];

                store.products.push({
                    id: pId,
                    category: catalogName,
                    name: v.name,
                    desc: v.desc || '',
                    price: v.price || 0,
                    grosir_price: v.grosirPrice || null,
                    grosir_min: v.grosirMin || null,
                    success_msg: v.msg || '',
                    stocks: preservedStocks,
                    linked_product_id: v.linkedProductId || null
                });
            });

            writeDB(db_path.store, store);
            if (unlock) unlock();
            res.json({ success: true });
        } catch (error) {
            if (unlock) unlock();
            console.error('Error saving katalog:', error);
            res.json({ success: false, error: error.message });
        }
    });

    app.post('/api/katalog/hapus', checkAuth, async (req, res) => {
        let unlock;
        try {
            unlock = await dbMutex.lock();
            let store = readDB(db_path.store) || { products: [], categories: [], category_details: {} };
            if (req.body.ids && req.body.ids.length > 0) {
                // hapus produk berdasarkan kategorinya
                store.products = store.products.filter(p => !req.body.ids.includes(p.category));
                
                // hapus juga dari daftar categories dan category_details
                if (store.categories) {
                    store.categories = store.categories.filter(c => !req.body.ids.includes(c));
                }
                if (store.category_details) {
                    req.body.ids.forEach(catId => {
                        delete store.category_details[catId];
                    });
                }
                
                writeDB(db_path.store, store);
            }
            if (unlock) unlock();
            res.json({ success: true });
        } catch (e) {
            if (unlock) unlock();
            res.json({ success: false, error: e.message });
        }
    });

    app.get('/logout', (req, res) => {
        res.setHeader('Set-Cookie', 'admin_session=; HttpOnly; Path=/; Max-Age=0');
        res.redirect('/');
    });

    const PORT = global.WEB_PORT || process.env.SERVER_PORT || 2195;
    app.listen(PORT, '0.0.0.0', () => {
        console.log(chalk.green(`🌐 Web Dashboard berjalan di port ${PORT}`));
    });

    return app;
};
