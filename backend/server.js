import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const DB_FILE = path.resolve('db.json');

app.use(cors());
app.use(express.json());

// Helper to read database
async function readDB() {
  try {
    const data = await fs.readFile(DB_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      return {
        products: parsed,
        coupons: []
      };
    }
    return {
      products: parsed.products || [],
      coupons: parsed.coupons || []
    };
  } catch (error) {
    console.error('Erro ao ler db.json, reiniciando banco:', error);
    return { products: [], coupons: [] };
  }
}

// Helper to write database
async function writeDB(data) {
  await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
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

// API: Listar todos os produtos
app.get('/api/products', async (req, res) => {
  const db = await readDB();
  res.json(db.products);
});

// API: Adicionar um produto
app.post('/api/products', async (req, res) => {
  const { title, image, price, originalPrice, url, category, store, coupon } = req.body;
  
  if (!title || !image || price === undefined || !url) {
    return res.status(400).json({ error: 'Título, imagem, preço e link são obrigatórios.' });
  }

  const db = await readDB();
  const newProduct = {
    id: Date.now().toString(),
    title,
    image,
    price: parseFloat(price),
    originalPrice: originalPrice ? parseFloat(originalPrice) : null,
    url,
    category: category || 'Geral',
    store: store || 'Loja Externa',
    coupon: coupon ? coupon.trim().toUpperCase() : null,
    createdAt: new Date().toISOString()
  };

  db.products.unshift(newProduct); // Adiciona no início da lista
  await writeDB(db);
  
  res.status(201).json(newProduct);
});

// API: Adicionar vários produtos em lote (Bulk Import)
app.post('/api/products/bulk', async (req, res) => {
  const items = req.body;
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'Os dados devem ser uma lista de produtos.' });
  }

  const db = await readDB();
  const addedProducts = [];
  const timestamp = Date.now();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const { title, image, price, originalPrice, url, category, store, coupon } = item;
    if (!title || !image || price === undefined || !url) {
      continue;
    }

    const newProduct = {
      id: (timestamp + i).toString(),
      title: title.trim(),
      image: image.trim(),
      price: parseFloat(price),
      originalPrice: originalPrice ? parseFloat(originalPrice) : null,
      url: url.trim(),
      category: category || 'Geral',
      store: store || 'Loja Externa',
      coupon: coupon && coupon !== '-' ? coupon.trim().toUpperCase() : null,
      createdAt: new Date(timestamp + i).toISOString()
    };
    db.products.unshift(newProduct);
    addedProducts.push(newProduct);
  }

  await writeDB(db);
  res.status(201).json(addedProducts);
});

// API: Deletar um produto
app.delete('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  let db = await readDB();
  const index = db.products.findIndex(p => p.id === id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Produto não encontrado.' });
  }

  db.products.splice(index, 1);
  await writeDB(db);
  
  res.json({ message: 'Produto deletado com sucesso.' });
});

// API: Listar todos os cupons
app.get('/api/coupons', async (req, res) => {
  const db = await readDB();
  res.json(db.coupons);
});

// API: Adicionar ou atualizar um cupom e seus produtos vinculados
app.post('/api/coupons', async (req, res) => {
  const { code, type, value, maxDiscount, productIds } = req.body;
  
  if (!code || !type || value === undefined) {
    return res.status(400).json({ error: 'Código, tipo e valor do cupom são obrigatórios.' });
  }

  const normalizedCode = code.trim().toUpperCase();
  const db = await readDB();

  // 1. Criar ou atualizar o cupom
  const newCoupon = {
    code: normalizedCode,
    type, // 'fixed' ou 'percentage'
    value: parseFloat(value),
    maxDiscount: maxDiscount !== undefined && maxDiscount !== '' && maxDiscount !== null ? parseFloat(maxDiscount) : null
  };

  const existingIndex = db.coupons.findIndex(c => c.code === normalizedCode);
  if (existingIndex !== -1) {
    db.coupons[existingIndex] = newCoupon;
  } else {
    db.coupons.push(newCoupon);
  }

  // 2. Atualizar vínculos com produtos
  if (Array.isArray(productIds)) {
    db.products.forEach(p => {
      if (productIds.includes(p.id)) {
        p.coupon = normalizedCode;
      } else if (p.coupon === normalizedCode) {
        p.coupon = null;
      }
    });
  }

  await writeDB(db);
  res.status(201).json(newCoupon);
});

// API: Deletar um cupom e remover vínculos de produtos
app.delete('/api/coupons/:code', async (req, res) => {
  const { code } = req.params;
  const normalizedCode = code.trim().toUpperCase();
  let db = await readDB();

  // 1. Remover o cupom
  const index = db.coupons.findIndex(c => c.code === normalizedCode);
  if (index === -1) {
    return res.status(404).json({ error: 'Cupom não encontrado.' });
  }
  db.coupons.splice(index, 1);

  // 2. Remover o cupom dos produtos associados
  db.products.forEach(p => {
    if (p.coupon === normalizedCode) {
      p.coupon = null;
    }
  });

  await writeDB(db);
  res.json({ message: 'Cupom e seus vínculos removidos com sucesso.' });
});

// API: Scraper de link de produto
app.get('/api/scrape', async (req, res) => {
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

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
