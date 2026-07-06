import express from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'fishering_super_secret_key_12345';

app.use(cors({
  origin: true,
  credentials: true // Allow receiving secure cookies from the frontend
}));
app.use(express.json());

// Custom cookie parsing middleware
app.use((req, res, next) => {
  const rawCookies = req.headers.cookie || '';
  req.cookies = {};
  rawCookies.split(';').forEach(c => {
    const parts = c.split('=');
    if (parts.length === 2) {
      req.cookies[parts[0].trim()] = decodeURIComponent(parts[1].trim());
    }
  });
  next();
});


// Simple memory-based IP rate limiter for login
const loginAttempts = new Map();
const loginRateLimiter = (req, res, next) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const now = Date.now();
  const attempt = loginAttempts.get(ip);
  
  if (attempt && attempt.lockUntil > now) {
    const remainingMin = Math.ceil((attempt.lockUntil - now) / 60000);
    return res.status(429).json({ error: `Muitas tentativas de login. Tente novamente em ${remainingMin} minuto(s).` });
  }
  next();
};

// JWT Authentication Middleware
const authenticate = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: 'Não autorizado. Faça login para acessar este recurso.' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
  }
};

// MySQL connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT || '3306'),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Helper to calculate coupon discount for a product price
function getCouponDiscount(productPrice, coupon) {
  if (coupon.minProductPrice !== null && productPrice < coupon.minProductPrice) {
    return 0;
  }
  
  let discount = 0;
  if (coupon.type === 'percentage') {
    discount = productPrice * (coupon.value / 100);
  } else if (coupon.type === 'fixed') {
    discount = coupon.value;
  }
  
  if (coupon.maxDiscount !== null && discount > coupon.maxDiscount) {
    discount = coupon.maxDiscount;
  }
  
  return Math.min(discount, productPrice);
}

// Helper to find the coupon that gives the highest discount
function getBestCouponForProduct(productPrice, coupons) {
  let bestCoupon = null;
  let maxDiscount = 0;
  
  for (const coupon of coupons) {
    const discount = getCouponDiscount(productPrice, coupon);
    if (discount > maxDiscount) {
      maxDiscount = discount;
      bestCoupon = coupon;
    }
  }
  
  return bestCoupon;
}

// Helper to scrape metadata from a URL
async function scrapeProduct(url) {
  try {
    // Configura headers do User-Agent para evitar ser bloqueado
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      timeout: 10000 // 10 segundos timeout
    });

    const $ = cheerio.load(response.data);
    let title = '';
    let image = '';
    let price = null;
    let originalPrice = null;

    // 1. Extrair Título
    title = $('meta[property="og:title"]').attr('content') ||
            $('meta[name="twitter:title"]').attr('content') ||
            $('title').text() ||
            '';
    title = title.trim();

    // 2. Extrair Imagem
    image = $('meta[property="og:image"]').attr('content') ||
            $('meta[name="twitter:image"]').attr('content') ||
            $('link[rel="image_src"]').attr('href') ||
            '';

    // Se for URL relativa, tenta juntar com o host
    if (image && !image.startsWith('http')) {
      const parsedUrl = new URL(url);
      image = `${parsedUrl.origin}${image.startsWith('/') ? '' : '/'}${image}`;
    }

    // 3. Extrair Preço do JSON-LD (Schema.org)
    $('script[type="application/ld+json"]').each((_, elem) => {
      try {
        const jsonText = $(elem).html();
        if (!jsonText) return;
        const data = JSON.parse(jsonText.trim());

        const extractFromOffers = (offers) => {
          if (!offers) return;
          if (Array.isArray(offers)) {
            for (const offer of offers) {
              if (offer.price) {
                price = parseFloat(offer.price);
                return;
              }
            }
          } else if (offers.price) {
            price = parseFloat(offers.price);
          }
        };

        const searchObj = (obj) => {
          if (!obj || typeof obj !== 'object') return;
          if (obj['@type'] === 'Product') {
            if (obj.offers) {
              extractFromOffers(obj.offers);
            }
            if (obj.price && !price) {
              price = parseFloat(obj.price);
            }
          }
          if (obj.offers && !price) {
            extractFromOffers(obj.offers);
          }
          // Recursividade para arrays ou objetos aninhados
          for (const k in obj) {
            if (typeof obj[k] === 'object') {
              searchObj(obj[k]);
            }
          }
        };

        if (Array.isArray(data)) {
          data.forEach(searchObj);
        } else {
          searchObj(data);
        }
      } catch (e) {
        // Ignora erros de parsing
      }
    });

    // 4. Fallback de Preço por Meta Tags Comuns
    if (!price) {
      const priceMeta = $('meta[property="og:price:amount"]').attr('content') ||
                        $('meta[property="product:price:amount"]').attr('content') ||
                        $('meta[property="product:sale_price:amount"]').attr('content') ||
                        $('meta[name="twitter:data1"]').attr('content');
      
      if (priceMeta) {
        // Limpar strings de preço (ex: "R$ 150,00" ou "150.00")
        const cleaned = priceMeta.replace(/[^\d.,]/g, '').replace(',', '.');
        const num = parseFloat(cleaned);
        if (!isNaN(num)) {
          price = num;
        }
      }
    }

    // 5. Fallback de Preço por varredura de seletores comuns ou texto na página
    if (!price) {
      // Se não encontrou preço, busca texto no corpo que pareça preço em R$
      const regexReal = /R\$\s*(\d{1,3}(\.\d{3})*,\d{2})/g;
      const bodyText = $('body').text();
      let match;
      let pricesFound = [];
      while ((match = regexReal.exec(bodyText)) !== null) {
        const valueStr = match[1].replace(/\./g, '').replace(',', '.');
        const val = parseFloat(valueStr);
        if (!isNaN(val) && val > 0) {
          pricesFound.push(val);
        }
      }
      if (pricesFound.length > 0) {
        // Assume o menor preço encontrado (geralmente à vista ou com desconto)
        price = Math.min(...pricesFound);
        // Se encontrou mais de um preço, o maior pode ser o preço original
        if (pricesFound.length > 1) {
          const maxVal = Math.max(...pricesFound);
          if (maxVal > price) {
            originalPrice = maxVal;
          }
        }
      }
    }

    // Limpar o título de termos como "Loja X | Produto...", "Comprar..."
    if (title) {
      title = title.replace(/| Mercado Livre.*/i, '')
                   .replace(/| Amazon.com.br.*/i, '')
                   .replace(/| Shopee Brasil.*/i, '')
                   .trim();
    }

    // Tentar inferir o nome da loja pelo domínio
    let store = 'Loja Externa';
    try {
      const parsedUrl = new URL(url);
      const hostParts = parsedUrl.hostname.replace('www.', '').split('.');
      if (hostParts.length > 1) {
        store = hostParts[0].charAt(0).toUpperCase() + hostParts[0].slice(1);
      }
    } catch (e) {}

    return {
      title: title || 'Produto sem título',
      image: image || 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&w=600&q=80',
      price: price || 0,
      originalPrice: originalPrice || null,
      store,
      url
    };
  } catch (error) {
    console.error('Erro durante o scraping:', error.message);
    throw new Error('Não foi possível obter dados do link fornecido. Você pode preenchê-los manualmente.');
  }
}

// API: Realizar login do administrador
app.post('/api/auth/login', loginRateLimiter, async (req, res) => {
  const { email, password, rememberMe } = req.body;
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }
  
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email.trim()]);
    const now = Date.now();
    
    if (rows.length === 0) {
      const attempt = loginAttempts.get(ip) || { count: 0, lockUntil: 0 };
      attempt.count += 1;
      if (attempt.count >= 5) {
        attempt.lockUntil = now + 15 * 60 * 1000;
        loginAttempts.set(ip, attempt);
        return res.status(429).json({ error: 'Muitas tentativas de login. Bloqueado por 15 minutos.' });
      }
      loginAttempts.set(ip, attempt);
      
      console.warn(`[AUTH] Falha de login para ${email} (IP: ${ip})`);
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }
    
    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    
    if (!match) {
      const attempt = loginAttempts.get(ip) || { count: 0, lockUntil: 0 };
      attempt.count += 1;
      if (attempt.count >= 5) {
        attempt.lockUntil = now + 15 * 60 * 1000;
        loginAttempts.set(ip, attempt);
        return res.status(429).json({ error: 'Muitas tentativas de login. Bloqueado por 15 minutos.' });
      }
      loginAttempts.set(ip, attempt);
      
      console.warn(`[AUTH] Falha de login para ${email} (IP: ${ip})`);
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }
    
    loginAttempts.delete(ip);
    console.log(`[AUTH] Login com sucesso: ${email} (IP: ${ip})`);
    
    const maxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000;
    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: rememberMe ? '30d' : '2h' }
    );
    
    res.cookie('token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: maxAge
    });
    
    res.json({
      user: {
        id: user.id,
        email: user.email
      }
    });
  } catch (error) {
    console.error('[AUTH] Erro ao fazer login:', error);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

// API: Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict'
  });
  res.json({ success: true, message: 'Logout realizado com sucesso.' });
});

// API: Obter dados do usuário logado
app.get('/api/auth/me', (req, res) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ user: { id: decoded.id, email: decoded.email } });
  } catch (err) {
    res.status(401).json({ error: 'Sessão inválida.' });
  }
});

// API: Listar todos os produtos
app.get('/api/products', async (req, res) => {
  try {
    const [productRows] = await pool.query('SELECT * FROM products ORDER BY createdAt DESC');
    const [couponRows] = await pool.query('SELECT * FROM coupons');
    
    const coupons = couponRows.map(r => ({
      ...r,
      value: parseFloat(r.value),
      maxDiscount: r.maxDiscount !== null ? parseFloat(r.maxDiscount) : null,
      minProductPrice: r.minProductPrice !== null ? parseFloat(r.minProductPrice) : 0.00
    }));

    const products = productRows.map(r => {
      const price = parseFloat(r.price);
      const originalPrice = r.originalPrice !== null ? parseFloat(r.originalPrice) : null;
      
      // Dynamically find the coupon offering the highest discount
      const bestCoupon = getBestCouponForProduct(price, coupons);
      
      return {
        ...r,
        price,
        originalPrice,
        coupon: bestCoupon ? bestCoupon.code : null
      };
    });

    res.json(products);
  } catch (error) {
    console.error('Erro ao buscar produtos:', error);
    res.status(500).json({ error: 'Erro no banco de dados.' });
  }
});

// API: Adicionar um produto
app.post('/api/products', authenticate, async (req, res) => {
  const { title, image, price, originalPrice, url, category, store, coupon } = req.body;
  
  if (!title || !image || price === undefined || !url) {
    return res.status(400).json({ error: 'Título, imagem, preço e link são obrigatórios.' });
  }

  const id = Date.now().toString();
  const cleanPrice = parseFloat(price);
  const cleanOriginalPrice = originalPrice ? parseFloat(originalPrice) : null;
  const cleanCategory = category || 'Geral';
  const cleanStore = store || 'Loja Externa';
  const cleanCoupon = coupon ? coupon.trim().toUpperCase() : null;
  const createdAt = new Date();

  try {
    await pool.query(
      'INSERT INTO products (id, title, image, price, originalPrice, url, category, store, coupon, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, title, image, cleanPrice, cleanOriginalPrice, url, cleanCategory, cleanStore, cleanCoupon, createdAt]
    );

    const newProduct = {
      id,
      title,
      image,
      price: cleanPrice,
      originalPrice: cleanOriginalPrice,
      url,
      category: cleanCategory,
      store: cleanStore,
      coupon: cleanCoupon,
      createdAt: createdAt.toISOString()
    };
    res.status(201).json(newProduct);
  } catch (error) {
    console.error('Erro ao adicionar produto:', error);
    res.status(500).json({ error: 'Erro no banco de dados.' });
  }
});

// API: Adicionar vários produtos em lote (Bulk Import)
app.post('/api/products/bulk', async (req, res) => {
  const items = req.body;
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'Os dados devem ser uma lista de produtos.' });
  }

  const addedProducts = [];
  const timestamp = Date.now();
  
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const { title, image, price, originalPrice, url, category, store, coupon } = item;
      if (!title || !image || price === undefined || !url) {
        continue;
      }

      const id = (timestamp + i).toString();
      const cleanPrice = parseFloat(price);
      const cleanOriginalPrice = originalPrice ? parseFloat(originalPrice) : null;
      const cleanCategory = category || 'Geral';
      const cleanStore = store || 'Loja Externa';
      const cleanCoupon = coupon && coupon !== '-' ? coupon.trim().toUpperCase() : null;
      const createdAt = new Date(timestamp + i);

      await connection.query(
        'INSERT INTO products (id, title, image, price, originalPrice, url, category, store, coupon, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, title.trim(), image.trim(), cleanPrice, cleanOriginalPrice, url.trim(), cleanCategory, cleanStore, cleanCoupon, createdAt]
      );

      addedProducts.push({
        id,
        title: title.trim(),
        image: image.trim(),
        price: cleanPrice,
        originalPrice: cleanOriginalPrice,
        url: url.trim(),
        category: cleanCategory,
        store: cleanStore,
        coupon: cleanCoupon,
        createdAt: createdAt.toISOString()
      });
    }

    await connection.commit();
    res.status(201).json(addedProducts);
  } catch (error) {
    await connection.rollback();
    console.error('Erro no bulk import:', error);
    res.status(500).json({ error: 'Erro no banco de dados.' });
  } finally {
    connection.release();
  }
});

// API: Deletar um produto
app.delete('/api/products/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await pool.query('DELETE FROM products WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Produto não encontrado.' });
    }
    res.json({ message: 'Produto deletado com sucesso.' });
  } catch (error) {
    console.error('Erro ao deletar produto:', error);
    res.status(500).json({ error: 'Erro no banco de dados.' });
  }
});

// API: Listar todos os cupons
app.get('/api/coupons', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM coupons');
    const coupons = rows.map(r => ({
      ...r,
      value: parseFloat(r.value),
      maxDiscount: r.maxDiscount !== null ? parseFloat(r.maxDiscount) : null,
      minProductPrice: r.minProductPrice !== null ? parseFloat(r.minProductPrice) : 0.00
    }));
    res.json(coupons);
  } catch (error) {
    console.error('Erro ao buscar cupons:', error);
    res.status(500).json({ error: 'Erro no banco de dados.' });
  }
});

// API: Adicionar ou atualizar um cupom
app.post('/api/coupons', authenticate, async (req, res) => {
  const { code, type, value, maxDiscount, minProductPrice } = req.body;
  
  if (!code || !type || value === undefined) {
    return res.status(400).json({ error: 'Código, tipo e valor do cupom são obrigatórios.' });
  }

  const normalizedCode = code.trim().toUpperCase();
  const cleanValue = parseFloat(value);
  const cleanMaxDiscount = maxDiscount !== undefined && maxDiscount !== '' && maxDiscount !== null ? parseFloat(maxDiscount) : null;
  const cleanMinProductPrice = minProductPrice !== undefined && minProductPrice !== '' && minProductPrice !== null ? parseFloat(minProductPrice) : 0.00;

  try {
    // Adicionar/Atualizar cupom
    await pool.query(
      'INSERT INTO coupons (code, type, value, maxDiscount, minProductPrice) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE type = ?, value = ?, maxDiscount = ?, minProductPrice = ?',
      [normalizedCode, type, cleanValue, cleanMaxDiscount, cleanMinProductPrice, type, cleanValue, cleanMaxDiscount, cleanMinProductPrice]
    );

    res.status(201).json({
      code: normalizedCode,
      type,
      value: cleanValue,
      maxDiscount: cleanMaxDiscount,
      minProductPrice: cleanMinProductPrice
    });
  } catch (error) {
    console.error('Erro ao salvar cupom:', error);
    res.status(500).json({ error: 'Erro no banco de dados.' });
  }
});

// API: Deletar um cupom e remover vínculos de produtos
app.delete('/api/coupons/:code', authenticate, async (req, res) => {
  const { code } = req.params;
  const normalizedCode = code.trim().toUpperCase();

  try {
    const [result] = await pool.query('DELETE FROM coupons WHERE code = ?', [normalizedCode]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Cupom não encontrado.' });
    }
    res.json({ message: 'Cupom e seus vínculos removidos com sucesso.' });
  } catch (error) {
    console.error('Erro ao deletar cupom:', error);
    res.status(500).json({ error: 'Erro no banco de dados.' });
  }
});

// API: Scraper de link de produto
app.get('/api/scrape', authenticate, async (req, res) => {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'Parâmetro url é obrigatório.' });
  }

  try {
    const scrapedData = await scrapeProduct(url);
    res.json(scrapedData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Obter valor de configuração do banco
app.get('/api/settings/:key', authenticate, async (req, res) => {
  const { key } = req.params;
  try {
    const [rows] = await pool.query('SELECT value FROM settings WHERE `key` = ?', [key]);
    if (rows.length === 0) {
      return res.json({ key, value: null });
    }
    
    let val = rows[0].value;
    if (key === 'gemini_api_key' && val) {
      if (val.length > 8) {
        val = val.substring(0, 8) + '...' + val.substring(val.length - 4);
      } else {
        val = 'configured';
      }
    }
    
    res.json({ key, value: val });
  } catch (error) {
    console.error('Erro ao ler configuração:', error);
    res.status(500).json({ error: 'Erro no banco de dados.' });
  }
});

// API: Salvar/Atualizar configuração no banco
app.post('/api/settings', authenticate, async (req, res) => {
  const { key, value } = req.body;
  if (!key) {
    return res.status(400).json({ error: 'Chave de configuração é obrigatória.' });
  }
  
  try {
    const cleanValue = value === undefined || value === null ? null : value.toString().trim();
    if (cleanValue === null || cleanValue === '') {
      await pool.query('DELETE FROM settings WHERE `key` = ?', [key]);
    } else {
      await pool.query(
        'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
        [key, cleanValue, cleanValue]
      );
    }
    res.json({ success: true, key, value: cleanValue ? 'updated' : 'removed' });
  } catch (error) {
    console.error('Erro ao salvar configuração:', error);
    res.status(500).json({ error: 'Erro no banco de dados.' });
  }
});

// Gemini API Tools Declaration
const geminiTools = [
  {
    functionDeclarations: [
      {
        name: 'list_products',
        description: 'Lists all products in the database with their prices, original prices, store, category, and active coupon codes.'
      },
      {
        name: 'add_product',
        description: 'Adds a new product to the database. All string parameters must be trimmed.',
        parameters: {
          type: 'OBJECT',
          properties: {
            title: { type: 'STRING', description: 'Title of the product' },
            image: { type: 'STRING', description: 'Image URL of the product' },
            price: { type: 'NUMBER', description: 'Current price of the product' },
            originalPrice: { type: 'NUMBER', description: 'Original price (optional)' },
            url: { type: 'STRING', description: 'Product page URL link' },
            category: { type: 'STRING', description: 'Product category (optional)' },
            store: { type: 'STRING', description: 'Store name (optional)' }
          },
          required: ['title', 'image', 'price', 'url']
        }
      },
      {
        name: 'delete_product',
        description: 'Deletes a product by its ID.',
        parameters: {
          type: 'OBJECT',
          properties: {
            id: { type: 'STRING', description: 'Product ID' }
          },
          required: ['id']
        }
      },
      {
        name: 'list_coupons',
        description: 'Lists all available coupons in the database.'
      },
      {
        name: 'add_coupon',
        description: 'Creates or updates a discount coupon in the database.',
        parameters: {
          type: 'OBJECT',
          properties: {
            code: { type: 'STRING', description: 'Coupon code (e.g., BLACKFRIDAY)' },
            type: { type: 'STRING', description: 'Coupon type: "fixed" or "percentage"' },
            value: { type: 'NUMBER', description: 'Discount value (fixed amount or percentage number)' },
            maxDiscount: { type: 'NUMBER', description: 'Maximum discount limit (optional)' },
            minProductPrice: { type: 'NUMBER', description: 'Minimum product price threshold (optional)' }
          },
          required: ['code', 'type', 'value']
        }
      },
      {
        name: 'delete_coupon',
        description: 'Deletes a coupon by its code.',
        parameters: {
          type: 'OBJECT',
          properties: {
            code: { type: 'STRING', description: 'Coupon code' }
          },
          required: ['code']
        }
      }
    ]
  }
];

// API: AI Chat Assistant with Gemini 2.5 Function Calling
app.post('/api/chat', authenticate, async (req, res) => {
  const { messages, apiKey: clientKey } = req.body;
  
  let apiKey = clientKey;
  if (!apiKey) {
    try {
      const [rows] = await pool.query('SELECT value FROM settings WHERE `key` = ?', ['gemini_api_key']);
      if (rows.length > 0 && rows[0].value) {
        apiKey = rows[0].value;
      }
    } catch (dbErr) {
      console.error('Erro ao ler gemini_api_key do banco:', dbErr);
    }
  }

  if (!apiKey) {
    apiKey = process.env.GEMINI_API_KEY;
  }

  if (!apiKey) {
    return res.status(400).json({ error: 'Chave de API do Gemini não configurada. Defina no banco de dados, no .env do backend ou informe no chat.' });
  }

  // Format messages to match the Gemini API schema
  let geminiMessages = (messages || []).map(m => ({
    role: m.role === 'model' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const executionLogs = [];
  let loopCount = 0;
  const maxLoops = 5;

  try {
    while (loopCount < maxLoops) {
      loopCount++;
      const payload = {
        contents: geminiMessages,
        tools: geminiTools,
        systemInstruction: {
          parts: [{ text: "Você é o Assistente Inteligente da Fishering. Você tem acesso direto ao banco de dados do site através de ferramentas. Use-as para listar, adicionar ou deletar produtos e cupons conforme solicitado pelo usuário. Se uma ferramenta retornar dados brutos em JSON, formate-os de maneira amigável em markdown em português (como tabelas ou listas). Seja conciso, responda em português e seja prestativo." }]
        }
      };

      const response = await axios.post(url, payload);
      const candidate = response.data.candidates?.[0];
      const content = candidate?.content;
      const part = content?.parts?.[0];

      if (part?.functionCall) {
        const { name, args } = part.functionCall;
        executionLogs.push(`🔧 Rodando ferramenta: ${name}`);

        // Add assistant's call request to history
        geminiMessages.push(content);

        // Execute local database operations
        let toolResponseData;
        try {
          if (name === 'list_products') {
            const [productRows] = await pool.query("SELECT * FROM products ORDER BY createdAt DESC");
            const [couponRows] = await pool.query("SELECT * FROM coupons");

            const coupons = couponRows.map(r => ({
              ...r,
              value: parseFloat(r.value),
              maxDiscount: r.maxDiscount !== null ? parseFloat(r.maxDiscount) : null,
              minProductPrice: r.minProductPrice !== null ? parseFloat(r.minProductPrice) : 0.00
            }));

            toolResponseData = productRows.map(r => {
              const price = parseFloat(r.price);
              const originalPrice = r.originalPrice !== null ? parseFloat(r.originalPrice) : null;
              const bestCoupon = getBestCouponForProduct(price, coupons);

              return {
                ...r,
                price,
                originalPrice,
                coupon: bestCoupon ? bestCoupon.code : null
              };
            });
          } else if (name === 'add_product') {
            const id = Date.now().toString();
            const price = parseFloat(args.price);
            const originalPrice = args.originalPrice ? parseFloat(args.originalPrice) : null;
            const category = args.category || "Geral";
            const store = args.store || "Loja Externa";
            const createdAt = new Date();

            await pool.query(
              "INSERT INTO products (id, title, image, price, originalPrice, url, category, store, coupon, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)",
              [id, args.title, args.image, price, originalPrice, args.url, category, store, createdAt]
            );
            toolResponseData = { success: true, message: `Produto cadastrado com sucesso com ID: ${id}` };
          } else if (name === 'delete_product') {
            const [result] = await pool.query("DELETE FROM products WHERE id = ?", [args.id]);
            if (result.affectedRows === 0) {
              toolResponseData = { error: `Produto com ID ${args.id} não encontrado.` };
            } else {
              toolResponseData = { success: true, message: `Produto com ID ${args.id} excluído com sucesso.` };
            }
          } else if (name === 'list_coupons') {
            const [rows] = await pool.query("SELECT * FROM coupons");
            toolResponseData = rows.map(r => ({
              ...r,
              value: parseFloat(r.value),
              maxDiscount: r.maxDiscount !== null ? parseFloat(r.maxDiscount) : null,
              minProductPrice: r.minProductPrice !== null ? parseFloat(r.minProductPrice) : 0.00
            }));
          } else if (name === 'add_coupon') {
            const code = args.code.trim().toUpperCase();
            const value = parseFloat(args.value);
            const maxDiscount = args.maxDiscount ? parseFloat(args.maxDiscount) : null;
            const minProductPrice = args.minProductPrice ? parseFloat(args.minProductPrice) : 0.00;

            await pool.query(
              "INSERT INTO coupons (code, type, value, maxDiscount, minProductPrice) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE type = ?, value = ?, maxDiscount = ?, minProductPrice = ?",
              [code, args.type, value, maxDiscount, minProductPrice, args.type, value, maxDiscount, minProductPrice]
            );
            toolResponseData = { success: true, message: `Cupom '${code}' cadastrado/atualizado com sucesso.` };
          } else if (name === 'delete_coupon') {
            const code = args.code.trim().toUpperCase();
            const [result] = await pool.query("DELETE FROM coupons WHERE code = ?", [code]);
            if (result.affectedRows === 0) {
              toolResponseData = { error: `Cupom '${code}' não encontrado.` };
            } else {
              toolResponseData = { success: true, message: `Cupom '${code}' excluído com sucesso.` };
            }
          } else {
            toolResponseData = { error: `Ferramenta desconhecida: ${name}` };
          }
        } catch (dbErr) {
          toolResponseData = { error: `Erro de banco de dados executando ${name}: ${dbErr.message}` };
        }

        // Add tool response to history
        geminiMessages.push({
          role: 'user',
          parts: [{
            functionResponse: {
              name: name,
              response: {
                output: toolResponseData
              }
            }
          }]
        });

        // Continue loop to let Gemini process the tool response
        continue;
      }

      // Final conversational text response
      const textResponse = part?.text || "Desculpe, não consegui processar a resposta.";
      return res.json({
        content: textResponse,
        logs: executionLogs
      });
    }

    res.status(500).json({ error: 'Número máximo de execuções de ferramentas atingido.' });
  } catch (error) {
    console.error('Erro na rota /api/chat:', error.response?.data || error.message);
    res.status(500).json({ error: 'Erro ao se comunicar com o Gemini API: ' + (error.response?.data?.error?.message || error.message) });
  }
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
