import React, { useState, useEffect } from 'react';
import { Link as LinkIcon, Tag, DollarSign, ImageIcon, FileText, Sparkles, Trash2, Plus, RefreshCw, Sun, Moon, ExternalLink, ShoppingBag, Download, Upload, MessageSquare, Send, Bot, Terminal } from 'lucide-react';

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5000/api'
  : '/api';

const CLIENT_PORTAL_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5174/'
  : '/';

const secureFetch = (url, options = {}) => {
  options.credentials = 'include';
  return fetch(url, options);
};

function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginRememberMe, setLoginRememberMe] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const [products, setProducts] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  
  // Scraper Input
  const [urlInput, setUrlInput] = useState('');
  
  // Product Form Fields
  const [title, setTitle] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [price, setPrice] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [category, setCategory] = useState('Molinete');
  const [store, setStore] = useState('Mercado Livre');
    // Tabs & Coupon state
  const [activeTab, setActiveTab] = useState('products'); // 'products' ou 'coupons'
  const [coupons, setCoupons] = useState([]);
  const [loadingCoupons, setLoadingCoupons] = useState(true);
  const [couponCode, setCouponCode] = useState('');
  const [couponType, setCouponType] = useState('percentage'); // 'percentage' ou 'fixed'
  const [couponValue, setCouponValue] = useState('');
  const [submittingCoupon, setSubmittingCoupon] = useState(false);
  const [couponMaxDiscount, setCouponMaxDiscount] = useState('');
  const [couponMinProductPrice, setCouponMinProductPrice] = useState('');

  // Chat Assistant state
  const [chatMessages, setChatMessages] = useState([
    { role: 'model', content: 'Olá! Sou o Assistente Inteligente da Fishering. Como posso te ajudar hoje? Posso listar produtos, cadastrar ou excluir cupons, cadastrar novos itens via link ou tirar dúvidas.' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const [chatApiKey, setChatApiKey] = useState('');
  const [isApiKeyConfigured, setIsApiKeyConfigured] = useState(false);
  const [chatLogs, setChatLogs] = useState([]);

  const handleSendChat = async (e) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || sendingChat) return;

    const userText = chatInput.trim();
    setChatInput('');
    setSendingChat(true);
    setChatLogs([]);

    const newMessages = [...chatMessages, { role: 'user', content: userText }];
    setChatMessages(newMessages);

    try {
      const response = await secureFetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: newMessages,
          apiKey: chatApiKey || undefined
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro desconhecido');
      }

      setChatMessages(prev => [...prev, { role: 'model', content: data.content }]);
      if (data.logs && data.logs.length > 0) {
        setChatLogs(data.logs);
      }
      
      // Refresh database lists since the AI may have added/deleted something
      fetchProducts();
      fetchCoupons();
      
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'model', content: `❌ Erro: ${err.message}` }]);
    } finally {
      setSendingChat(false);
    }
  };

  const handleSaveApiKey = async (key) => {
    try {
      const response = await secureFetch(`${API_BASE}/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ key: 'gemini_api_key', value: key })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao salvar no banco');
      }

      setIsApiKeyConfigured(!!key);
      setChatApiKey(''); // Clear the input field after successful saving
      showToast(key ? 'Chave de API salva no banco de dados!' : 'Chave de API removida do banco!');
    } catch (err) {
      showToast('Erro ao salvar no banco: ' + err.message);
    }
  };

  // Helper to calculate coupon discount in admin
  const getCouponDiscount = (productPrice, coupon) => {
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
  };

  // Helper to find the best coupon in admin
  const getBestCouponForPrice = (productPrice) => {
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
  };

  // Fetch all products
  const fetchProducts = async () => {
    setLoadingList(true);
    try {
      const response = await secureFetch(`${API_BASE}/products`);
      if (response.ok) {
        const data = await response.json();
        setProducts(data);
      }
    } catch (err) {
      console.error('Erro ao buscar produtos:', err);
      showToast('Erro ao se conectar com o backend. Certifique-se de que ele está rodando.');
    } finally {
      setLoadingList(false);
    }
  };

  // Fetch all coupons
  const fetchCoupons = async () => {
    setLoadingCoupons(true);
    try {
      const response = await secureFetch(`${API_BASE}/coupons`);
      if (response.ok) {
        const data = await response.json();
        setCoupons(data);
      }
    } catch (err) {
      console.error('Erro ao buscar cupons:', err);
    } finally {
      setLoadingCoupons(false);
    }
  };

  // Fetch Gemini API Key setting from database
  const fetchGeminiKey = async () => {
    try {
      const response = await secureFetch(`${API_BASE}/settings/gemini_api_key`);
      if (response.ok) {
        const data = await response.json();
        setIsApiKeyConfigured(!!data.isConfigured);
      }
    } catch (err) {
      console.error('Erro ao buscar token do banco:', err);
    }
  };

  const verifySession = async () => {
    try {
      const response = await secureFetch(`${API_BASE}/auth/me`);
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        
        // Load data since authenticated
        fetchProducts();
        fetchCoupons();
        fetchGeminiKey();
      }
    } catch (err) {
      console.error('Erro de autenticação:', err);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword || loggingIn) return;

    setLoggingIn(true);
    setLoginError('');

    try {
      const response = await secureFetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginEmail.trim(),
          password: loginPassword,
          rememberMe: loginRememberMe
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Falha ao autenticar.');
      }

      setUser(data.user);
      
      // Load data
      fetchProducts();
      fetchCoupons();
      fetchGeminiKey();
      
      showToast('Login realizado com sucesso!');
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await secureFetch(`${API_BASE}/auth/logout`, { method: 'POST' });
      setUser(null);
      showToast('Sessão encerrada.');
    } catch (err) {
      console.error('Erro ao deslogar:', err);
    }
  };

  useEffect(() => {
    verifySession();
  }, []);

  const showToast = (message) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage('');
    }, 3000);
  };

  // Call scraper endpoint
  const handleScrape = async (e) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    setScraping(true);
    setShowForm(false);
    try {
      const response = await secureFetch(`${API_BASE}/scrape?url=${encodeURIComponent(urlInput.trim())}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao extrair metadados');
      }

      // Populate Form Fields
      setTitle(data.title || '');
      setImageUrl(data.image || '');
      setPrice(data.price ? data.price.toString() : '');
      setOriginalPrice(data.originalPrice ? data.originalPrice.toString() : '');
      setStore(data.store || 'Mercado Livre');
      setCoupon(''); // Reset coupon for new product
      
      setShowForm(true);
      showToast('Dados extraídos com sucesso! ✨ Valide as informações nos campos abaixo.');
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Falha ao extrair dados. Preenchendo campos manualmente.');
      
      // Fallback para campos em branco
      setTitle('');
      setImageUrl('');
      setPrice('');
      setOriginalPrice('');
      setCoupon('');
      
      try {
        const parsedUrl = new URL(urlInput);
        const hostParts = parsedUrl.hostname.replace('www.', '').split('.');
        setStore(hostParts[0].charAt(0).toUpperCase() + hostParts[0].slice(1));
      } catch (e) {
        setStore('Mercado Livre');
      }

      setShowForm(true);
    } finally {
      setScraping(false);
    }
  };

  // Submit product to API
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!title.trim() || !imageUrl.trim() || !price || !urlInput.trim()) {
      showToast('Título, imagem, preço e link do produto são obrigatórios.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await secureFetch(`${API_BASE}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          image: imageUrl.trim(),
          price: parseFloat(price),
          originalPrice: originalPrice ? parseFloat(originalPrice) : null,
          url: urlInput.trim(),
          category,
          store: store.trim() || 'Mercado Livre'
        })
      });

      if (response.ok) {
        showToast('Produto de pesca cadastrado com sucesso! 🎣');
        // Reset Form & Input
        setUrlInput('');
        setTitle('');
        setImageUrl('');
        setPrice('');
        setOriginalPrice('');
        setShowForm(false);
        fetchProducts();
      } else {
        const data = await response.json();
        showToast(`Erro: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
      showToast('Erro ao cadastrar produto no servidor.');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete product
  const handleDelete = async (id) => {
    if (!window.confirm('Tem certeza que deseja remover esta promoção?')) return;

    try {
      const response = await secureFetch(`${API_BASE}/products/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        showToast('Produto removido da lista.');
        fetchProducts();
      } else {
        showToast('Não foi possível remover o produto.');
      }
    } catch (err) {
      console.error(err);
      showToast('Erro ao tentar excluir produto.');
    }
  };

  // Create or update a coupon
  const handleCreateCoupon = async (e) => {
    e.preventDefault();
    if (!couponCode.trim() || !couponType || couponValue === '') {
      showToast('Código, tipo e valor do cupom são obrigatórios.');
      return;
    }

    setSubmittingCoupon(true);
    try {
      const response = await secureFetch(`${API_BASE}/coupons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: couponCode.trim().toUpperCase(),
          type: couponType,
          value: parseFloat(couponValue),
          maxDiscount: couponMaxDiscount !== '' ? parseFloat(couponMaxDiscount) : null,
          minProductPrice: couponMinProductPrice !== '' ? parseFloat(couponMinProductPrice) : 0
        })
      });

      if (response.ok) {
        showToast('Cupom gravado com sucesso! 🎟️');
        setCouponCode('');
        setCouponValue('');
        setCouponMaxDiscount('');
        setCouponMinProductPrice('');
        fetchCoupons();
        fetchProducts(); // Refresh products to show updated coupon code
      } else {
        const data = await response.json();
        showToast(`Erro: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
      showToast('Erro ao cadastrar cupom no servidor.');
    } finally {
      setSubmittingCoupon(false);
    }
  };

  // Delete a coupon
  const handleDeleteCoupon = async (code) => {
    if (!window.confirm(`Tem certeza que deseja excluir o cupom ${code}? Todos os produtos vinculados perderão este cupom.`)) return;

    try {
      const response = await secureFetch(`${API_BASE}/coupons/${code}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        showToast('Cupom excluído com sucesso.');
        fetchCoupons();
        fetchProducts(); // Refresh products to clear deleted coupon
      } else {
        showToast('Não foi possível excluir o cupom.');
      }
    } catch (err) {
      console.error(err);
      showToast('Erro ao tentar excluir o cupom.');
    }
  };

  // Export all products to a CSV file (Brazilian style with semicolon separator and Excel BOM)
  const handleExportCSV = () => {
    if (products.length === 0) {
      showToast('Nenhum produto para exportar.');
      return;
    }
    
    let csvContent = "\uFEFFID;Título;Preço (R$);Categoria;Loja;Cupom;URL;Imagem;Criado Em\n";
    
    products.forEach(p => {
      const priceStr = p.price ? p.price.toString().replace('.', ',') : '0,00';
      const titleClean = p.title ? p.title.replace(/"/g, '""') : '';
      const categoryClean = p.category ? p.category.replace(/"/g, '""') : '';
      const storeClean = p.store ? p.store.replace(/"/g, '""') : '';
      const couponClean = p.coupon ? p.coupon.replace(/"/g, '""') : '-';
      const urlClean = p.url ? p.url.replace(/"/g, '""') : '';
      const imageClean = p.image ? p.image.replace(/"/g, '""') : '';
      const dateStr = p.createdAt ? new Date(p.createdAt).toLocaleString('pt-BR') : '-';
      
      csvContent += `"${p.id}";"${titleClean}";"${priceStr}";"${categoryClean}";"${storeClean}";"${couponClean}";"${urlClean}";"${imageClean}";"${dateStr}"\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "produtos_fishering.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Produtos exportados com sucesso! 📊');
  };

  // Import products from a CSV file
  const handleImportCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target.result;
      
      try {
        const lines = [];
        const linesRaw = text.split(/\r?\n/);
        
        // Skip header line
        for (let i = 1; i < linesRaw.length; i++) {
          const line = linesRaw[i].trim();
          if (!line) continue;
          
          const fields = [];
          let currentField = '';
          let inQuotes = false;
          
          for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
              if (inQuotes && line[j+1] === '"') {
                currentField += '"';
                j++;
              } else {
                inQuotes = !inQuotes;
              }
            } else if (char === ';' && !inQuotes) {
              fields.push(currentField);
              currentField = '';
            } else {
              currentField += char;
            }
          }
          fields.push(currentField);
          
          // Map to backend fields if valid row
          if (fields.length >= 8) {
            const price = parseFloat(fields[2].replace(',', '.'));
            if (!isNaN(price) && fields[1] && fields[7] && fields[6]) {
              lines.push({
                title: fields[1],
                price: price,
                category: fields[3] || 'Geral',
                store: fields[4] || 'Mercado Livre',
                coupon: fields[5] === '-' || !fields[5] ? null : fields[5],
                url: fields[6],
                image: fields[7]
              });
            }
          }
        }

        if (lines.length === 0) {
          showToast('Nenhum produto válido encontrado no arquivo CSV.');
          return;
        }

        const confirmImport = window.confirm(`Deseja importar ${lines.length} produtos do arquivo selecionado?`);
        if (!confirmImport) return;

        setLoadingList(true);
        const response = await secureFetch(`${API_BASE}/products/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(lines)
        });

        if (response.ok) {
          showToast(`${lines.length} produtos importados com sucesso! 📥🎣`);
          fetchProducts();
        } else {
          const data = await response.json();
          showToast(`Erro ao importar: ${data.error}`);
          setLoadingList(false);
        }
      } catch (err) {
        console.error(err);
        showToast('Erro ao ler ou processar o arquivo CSV: ' + err.message);
        setLoadingList(false);
      }
    };
    
    reader.readAsText(file, 'utf-8');
    e.target.value = ''; // Reset input
  };

  // Show editor form after scrape
  const [showForm, setShowForm] = useState(false);

  if (authLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f5f5f5', color: '#333', fontFamily: 'sans-serif' }}>
        <RefreshCw size={36} className="animate-spin" style={{ animation: 'spin 1.5s linear infinite', color: '#1565c0', marginBottom: '16px' }} />
        <span style={{ fontSize: '1rem', fontWeight: 600 }}>Verificando sessão segura...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
        fontFamily: 'sans-serif',
        padding: '20px'
      }}>
        <div style={{
          width: '100%',
          maxWidth: '420px',
          background: 'rgba(255, 255, 255, 0.95)',
          borderRadius: '12px',
          padding: '40px 30px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.2)'
        }}>
          <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <h1 style={{ fontSize: '2rem', margin: '0 0 10px 0', color: '#1e3c72', fontWeight: 700 }}>
              🎣 Fishering Admin
            </h1>
            <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>
              Faça login para acessar o painel de controle seguro
            </p>
          </div>

          {loginError && (
            <div style={{
              background: '#ffebee',
              borderLeft: '4px solid #f44336',
              color: '#c62828',
              padding: '12px',
              borderRadius: '4px',
              fontSize: '0.85rem',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              fontWeight: 500
            }}>
              ⚠️ {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#333' }}>E-mail / Usuário</label>
              <input
                type="email"
                placeholder="Ex: admin@fishering.top"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
                style={{
                  padding: '12px',
                  borderRadius: '6px',
                  border: '1px solid #ccc',
                  fontSize: '0.95rem',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#333' }}>Senha</label>
              <input
                type="password"
                placeholder="Insira sua senha..."
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
                style={{
                  padding: '12px',
                  borderRadius: '6px',
                  border: '1px solid #ccc',
                  fontSize: '0.95rem',
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#555' }}>
                <input
                  type="checkbox"
                  checked={loginRememberMe}
                  onChange={(e) => setLoginRememberMe(e.target.checked)}
                />
                Lembrar-me
              </label>
              <a 
                href="#forgot" 
                onClick={(e) => { e.preventDefault(); showToast('Entre em contato com o suporte de TI para redefinir sua senha.'); }}
                style={{ color: '#1e3c72', textDecoration: 'none', fontWeight: 600 }}
              >
                Esqueceu a senha?
              </a>
            </div>

            <button
              type="submit"
              disabled={loggingIn}
              style={{
                background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
                color: '#fff',
                padding: '14px',
                border: 'none',
                borderRadius: '6px',
                fontSize: '1rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 15px rgba(30, 60, 114, 0.3)',
                transition: 'transform 0.1s, opacity 0.2s',
                width: '100%'
              }}
            >
              {loggingIn ? (
                <>
                  <RefreshCw size={18} className="animate-spin" style={{ animation: 'spin 1.5s linear infinite' }} />
                  Autenticando...
                </>
              ) : (
                'Entrar no Painel'
              )}
            </button>
          </form>
        </div>

        {/* Toast Notification */}
        {toastMessage && (
          <div className="toast">
            <span>{toastMessage}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Full-width Yellow Header (Mercado Livre Style) */}
      <header className="app-header">
        <div className="header-content">
          <div className="logo-section">
            <h1>🎣 Fishering Admin</h1>
            <div className="header-tabs">
              <button 
                className={`tab-btn ${activeTab === 'products' ? 'active' : ''}`}
                onClick={() => setActiveTab('products')}
              >
                <ShoppingBag size={16} />
                Produtos
              </button>
              <button 
                className={`tab-btn ${activeTab === 'coupons' ? 'active' : ''}`}
                onClick={() => setActiveTab('coupons')}
              >
                <Tag size={16} />
                Cupons
              </button>
              <button 
                className={`tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
                onClick={() => setActiveTab('chat')}
              >
                <MessageSquare size={16} />
                Assistente IA
              </button>
            </div>
          </div>
          
          <div className="header-actions" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Olá, <strong>{user?.email}</strong>
            </span>
            <a href={CLIENT_PORTAL_URL} className="btn-header-action-primary" target="_blank" rel="noopener noreferrer">
              <ExternalLink size={15} />
              Ver Portal de Clientes
            </a>
            <button 
              onClick={handleLogout} 
              className="btn-danger" 
              style={{ padding: '8px 14px', fontSize: '0.85rem', fontWeight: 600 }}
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout Area */}
      <div className="app-wrapper">
        {activeTab === 'products' && (
          <>
            {/* Scraper Input Panel */}
            <div className="form-card">
              <h2 className="form-title">
                <Sparkles size={20} style={{ color: 'var(--accent-blue)' }} />
                Cadastrar Produto via Link do Mercado Livre
              </h2>
              
              <form onSubmit={handleScrape} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '280px' }}>
                  <input
                    type="url"
                    placeholder="Cole o link do produto do Mercado Livre (ou outra loja) aqui..."
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                      fontSize: '0.95rem'
                    }}
                  />
                </div>
                <button 
                  type="submit" 
                  className="btn-action-primary" 
                  disabled={scraping}
                  style={{ minWidth: '160px', padding: '10px 20px' }}
                >
                  {scraping ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" style={{ animation: 'spin 1.5s linear infinite', marginRight: '6px' }} />
                      Processando...
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} style={{ marginRight: '6px' }} />
                      Extrair Dados
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Editor & Preview Form */}
            {showForm && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '24px', alignItems: 'start' }} className="form-row">
                {/* Edit Form */}
                <div className="form-card" style={{ marginBottom: 0 }}>
                  <h3 className="form-title" style={{ fontSize: '1.1rem', marginBottom: '16px' }}>
                    <FileText size={16} /> Ajustar Detalhes do Produto
                  </h3>
                  
                  <form onSubmit={handleSubmit}>
                    <div className="form-group">
                      <label>Título do Produto</label>
                      <input 
                        type="text" 
                        value={title} 
                        onChange={(e) => setTitle(e.target.value)} 
                        required 
                      />
                    </div>

                    <div className="form-group">
                      <label>URL da Imagem</label>
                      <input 
                        type="url" 
                        value={imageUrl} 
                        onChange={(e) => setImageUrl(e.target.value)} 
                        required 
                      />
                    </div>

                    <div className="form-group">
                      <label>Preço do Produto (R$)</label>
                      <input 
                        type="number" 
                        step="0.01" 
                        placeholder="Ex: 99.90" 
                        value={price} 
                        onChange={(e) => setPrice(e.target.value)} 
                        required 
                      />
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>Loja/Vendedor</label>
                        <input 
                          type="text" 
                          value={store} 
                          onChange={(e) => setStore(e.target.value)} 
                        />
                      </div>

                      <div className="form-group">
                        <label>Categoria de Pesca</label>
                        <select value={category} onChange={(e) => setCategory(e.target.value)}>
                          <option value="Molinete">Molinete</option>
                          <option value="Varas">Varas</option>
                          <option value="Iscas">Iscas</option>
                          <option value="Carretilhas">Carretilhas</option>
                          <option value="Embarcações">Embarcações</option>
                          <option value="Organizadores">Organizadores</option>
                          <option value="Acessórios">Acessórios</option>
                          <option value="Geral">Geral</option>
                        </select>
                      </div>
                    </div>

                    <button 
                      type="submit" 
                      className="btn-action-primary" 
                      disabled={submitting} 
                      style={{ width: '100%', marginTop: '12px' }}
                    >
                      {submitting ? (
                        <>
                          <RefreshCw size={16} className="animate-spin" style={{ animation: 'spin 1.5s linear infinite', marginRight: '6px' }} />
                          Publicando no Fishering...
                        </>
                      ) : (
                        <>
                          <Plus size={16} style={{ marginRight: '6px' }} />
                          Cadastrar e Publicar
                        </>
                      )}
                    </button>
                  </form>
                </div>

                {/* Live Preview Card */}
                <div className="preview-pane">
                  <span className="preview-badge">PRÉVIA DO CARD</span>
                  
                  <div className="product-card preview-mode">
                    <div className="card-img-wrapper">
                      <img 
                        src={imageUrl || 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=600&q=80'} 
                        alt="Prévia" 
                        className="product-card-img"
                        onError={(e) => {
                          e.target.src = 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=600&q=80';
                        }}
                      />
                      <span className="card-badge">{category}</span>
                      <span className="card-store-badge">{store}</span>
                    </div>

                    <div className="card-info">
                      <h2 className="card-title">
                        {title || 'Título do Produto'}
                      </h2>

                      <div className="card-price-section">
                        {(() => {
                          const origVal = parseFloat(price || 0);
                          const bestCoupon = getBestCouponForPrice(origVal);
                          if (bestCoupon) {
                            const discount = getCouponDiscount(origVal, bestCoupon);
                            const promoVal = Math.max(0, origVal - discount);
                            return (
                              <>
                                <span className="card-original-price">
                                  R$ {origVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <div className="price-row">
                                  <span className="card-current-price">
                                    R$ {promoVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                </div>
                                <span className="card-coupon-badge">
                                  🎟️ Cupom: {bestCoupon.code}
                                </span>
                              </>
                            );
                          } else {
                            return (
                              <div className="price-row">
                                <span className="card-current-price">
                                  R$ {origVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                            );
                          }
                        })()}
                      </div>

                      <div className="card-actions">
                        <span className="btn-buy" style={{ fontSize: '0.8rem', padding: '6px 10px' }}>
                          Ver produto
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Registered Products List */}
            <div className="admin-table-container">
              <div className="admin-table-title" style={{ justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Tag size={16} style={{ color: 'var(--accent-blue)' }} />
                  Produtos Cadastrados ({products.length})
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <label
                    className="btn-header-action-primary"
                    style={{ padding: '6px 12px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px', height: 'auto', backgroundColor: '#3483fa', cursor: 'pointer', margin: 0 }}
                  >
                    <Upload size={14} />
                    Importar CSV
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleImportCSV}
                      style={{ display: 'none' }}
                    />
                  </label>
                  <button
                    onClick={handleExportCSV}
                    className="btn-header-action-primary"
                    style={{ padding: '6px 12px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px', height: 'auto', backgroundColor: '#00a650' }}
                  >
                    <Download size={14} />
                    Exportar CSV
                  </button>
                </div>
              </div>
              
              {loadingList ? (
                <div style={{ textAlign: 'center', padding: '30px' }}>
                  <RefreshCw className="animate-spin" size={20} style={{ margin: '0 auto 8px', animation: 'spin 1.5s linear infinite' }} />
                  <p>Carregando lista...</p>
                </div>
              ) : products.length === 0 ? (
                <div style={{ padding: '30px', color: 'var(--text-muted)', textAlign: 'center' }}>
                  Nenhum produto de pesca cadastrado ainda.
                </div>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Preço Original</th>
                      <th>Categoria</th>
                      <th>Loja</th>
                      <th style={{ textAlign: 'right' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map(p => (
                      <tr key={p.id}>
                        <td>
                          <div className="admin-prod-cell">
                            <img 
                              src={p.image} 
                              alt="" 
                              className="admin-prod-thumb" 
                              onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=600&q=80'; }} 
                            />
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span className="admin-prod-title" title={p.title}>{p.title}</span>
                              {p.coupon && (
                                <span className="card-coupon-badge">
                                  🎟️ Cupom: {p.coupon}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ fontWeight: 600, color: '#333' }}>
                          R$ {p.price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td>{p.category}</td>
                        <td>{p.store}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button 
                            className="btn-danger"
                            onClick={() => handleDelete(p.id)}
                            title="Excluir produto"
                            style={{ marginLeft: 'auto' }}
                          >
                            <Trash2 size={13} />
                            Excluir
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {activeTab === 'coupons' && (
          /* Coupons Management Tab content */
          <>
            {/* Coupon Creation Panel */}
            <div className="form-card">
              <h2 className="form-title">
                <Tag size={20} style={{ color: 'var(--accent-blue)' }} />
                Cadastrar Novo Cupom de Desconto
              </h2>
              
              <form onSubmit={handleCreateCoupon}>
                <div className="form-row">
                  <div className="form-group" style={{ flex: 1, minWidth: '150px' }}>
                    <label>Código do Cupom</label>
                    <input
                      type="text"
                      placeholder="Ex: PESCA20"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group" style={{ flex: 1, minWidth: '150px' }}>
                    <label>Tipo de Desconto</label>
                    <select
                      value={couponType}
                      onChange={(e) => setCouponType(e.target.value)}
                    >
                      <option value="percentage">Percentual (%)</option>
                      <option value="fixed">Valor Fixo (R$)</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ flex: 1, minWidth: '150px' }}>
                    <label>Valor do Desconto</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder={couponType === 'percentage' ? 'Ex: 15' : 'Ex: 20.00'}
                      value={couponValue}
                      onChange={(e) => setCouponValue(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group" style={{ flex: 1, minWidth: '180px' }}>
                    <label>Valor Máximo do Desconto (R$ - Opcional)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Ex: 40.00 (vazio = sem limite)"
                      value={couponMaxDiscount}
                      onChange={(e) => setCouponMaxDiscount(e.target.value)}
                    />
                  </div>

                  <div className="form-group" style={{ flex: 1, minWidth: '180px' }}>
                    <label>Valor Mínimo do Produto (R$ - Opcional)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Ex: 100.00 (vazio = sem mínimo)"
                      value={couponMinProductPrice}
                      onChange={(e) => setCouponMinProductPrice(e.target.value)}
                    />
                  </div>
                </div>

                <button 
                  type="submit" 
                  className="btn-action-primary" 
                  disabled={submittingCoupon}
                  style={{ width: '100%', marginTop: '16px', padding: '12px' }}
                >
                  {submittingCoupon ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" style={{ animation: 'spin 1.5s linear infinite', marginRight: '6px' }} />
                      Gravando Cupom...
                    </>
                  ) : (
                    <>
                      <Plus size={16} style={{ marginRight: '6px' }} />
                      Cadastrar Cupom
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Coupons List Table */}
            <div className="admin-table-container">
              <div className="admin-table-title">
                <Tag size={16} style={{ color: 'var(--accent-blue)' }} />
                Cupons Cadastrados ({coupons.length})
              </div>

              {loadingCoupons ? (
                <div style={{ textAlign: 'center', padding: '30px' }}>
                  <RefreshCw className="animate-spin" size={20} style={{ margin: '0 auto 8px', animation: 'spin 1.5s linear infinite' }} />
                  <p>Carregando cupons...</p>
                </div>
              ) : coupons.length === 0 ? (
                <div style={{ padding: '30px', color: 'var(--text-muted)', textAlign: 'center' }}>
                  Nenhum cupom cadastrado ainda.
                </div>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Tipo</th>
                      <th>Valor</th>
                      <th>Máx. Desconto</th>
                      <th>Valor Mín. Produto</th>
                      <th style={{ textAlign: 'right' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coupons.map(c => {
                      return (
                        <tr key={c.code}>
                          <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                            🎟️ {c.code}
                          </td>
                          <td>
                            <span className={`badge-coupon-type ${c.type}`}>
                              {c.type === 'percentage' ? 'Percentual (%)' : 'Fixo (R$)'}
                            </span>
                          </td>
                          <td style={{ fontWeight: 600 }}>
                            {c.type === 'percentage' ? `${c.value}%` : `R$ ${c.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                          </td>
                          <td style={{ color: 'var(--text-secondary)' }}>
                            {c.maxDiscount != null ? `R$ ${c.maxDiscount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Sem limite'}
                          </td>
                          <td style={{ color: 'var(--text-secondary)' }}>
                            {c.minProductPrice > 0 ? `R$ ${c.minProductPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Sem mínimo'}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              className="btn-danger"
                              onClick={() => handleDeleteCoupon(c.code)}
                              title="Excluir cupom"
                              style={{ marginLeft: 'auto' }}
                            >
                              <Trash2 size={13} />
                              Excluir
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {activeTab === 'chat' && (
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', width: '100%', alignItems: 'stretch' }}>
            {/* Main Chat Box */}
            <div className="form-card" style={{ flex: 2, minWidth: '320px', display: 'flex', flexDirection: 'column', height: '650px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #eee', paddingBottom: '12px', marginBottom: '12px' }}>
                <h2 className="form-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Bot size={22} style={{ color: 'var(--accent-blue)' }} />
                  Assistente Inteligente (Gemini 2.5)
                </h2>
                <span style={{ fontSize: '0.8rem', padding: '4px 8px', background: '#e3f2fd', color: '#1565c0', borderRadius: '12px', fontWeight: 600 }}>
                  Conectado à Base Fishering
                </span>
              </div>

              {/* API Key Configuration Input */}
              <div style={{ background: '#f5f5f5', padding: '10px 14px', borderRadius: '6px', marginBottom: '12px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Chave de API Gemini:</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({isApiKeyConfigured ? 'Salva no banco' : 'Usando padrão do servidor .env'})</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', flex: 1, minWidth: '200px', justifyContent: 'flex-end' }}>
                  <input
                    type="password"
                    placeholder={isApiKeyConfigured ? "Chave configurada. Digite para substituir..." : "Cole sua API Key (opcional)..."}
                    value={chatApiKey}
                    onChange={(e) => setChatApiKey(e.target.value)}
                    style={{ padding: '6px 10px', fontSize: '0.85rem', border: '1px solid #ccc', borderRadius: '4px', flex: 1, maxWidth: '250px' }}
                  />
                  <button
                    onClick={() => handleSaveApiKey(chatApiKey)}
                    className="btn-action-primary"
                    style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                  >
                    Salvar
                  </button>
                  {isApiKeyConfigured && (
                    <button
                      onClick={() => handleSaveApiKey('')}
                      style={{ background: 'transparent', border: 'none', color: '#f73f55', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                    >
                      Limpar
                    </button>
                  )}
                </div>
              </div>

              {/* Message Feed */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: '12px', border: '1px solid #eee', borderRadius: '6px', background: '#fafafa', marginBottom: '12px' }}>
                {chatMessages.map((m, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', width: '100%' }}>
                    <div style={{ 
                      maxWidth: '80%', 
                      padding: '12px 16px', 
                      borderRadius: '12px', 
                      fontSize: '0.95rem',
                      lineHeight: '1.4',
                      background: m.role === 'user' ? 'var(--accent-blue)' : '#ffffff',
                      color: m.role === 'user' ? '#ffffff' : 'var(--text-primary)',
                      border: m.role === 'user' ? 'none' : '1px solid #e0e0e0',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                      whiteSpace: 'pre-wrap'
                    }}>
                      {m.role === 'model' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-blue)', textTransform: 'uppercase' }}>
                          <Bot size={13} />
                          Assistente
                        </div>
                      )}
                      {m.content}
                    </div>
                  </div>
                ))}
                {sendingChat && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start', width: '100%' }}>
                    <div style={{ padding: '12px 16px', borderRadius: '12px', background: '#ffffff', border: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <RefreshCw size={14} className="animate-spin" style={{ animation: 'spin 1.5s linear infinite', color: 'var(--accent-blue)' }} />
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Pensando e executando operações...</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Input form */}
              <form onSubmit={handleSendChat} style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Ex: 'Quais cupons estão cadastrados?', 'Exclua o produto X', 'Cadastre o cupom OFF50'..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  disabled={sendingChat}
                  style={{ flex: 1, padding: '12px 16px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '0.95rem' }}
                />
                <button
                  type="submit"
                  disabled={sendingChat || !chatInput.trim()}
                  className="btn-action-primary"
                  style={{ padding: '0 20px', display: 'flex', alignItems: 'center', gap: '6px', height: 'auto' }}
                >
                  <Send size={16} />
                  Enviar
                </button>
              </form>
            </div>

            {/* Side Operations logs */}
            <div className="form-card" style={{ flex: 1, minWidth: '280px', display: 'flex', flexDirection: 'column', height: '650px', overflowY: 'auto' }}>
              <h2 className="form-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #eee', paddingBottom: '12px', marginBottom: '12px' }}>
                <Terminal size={20} style={{ color: 'var(--accent-blue)' }} />
                Logs de Operações (MCP)
              </h2>
              
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                Veja em tempo real as ferramentas de banco de dados que a IA aciona para responder às suas solicitações.
              </p>

              <div style={{ flex: 1, background: '#1e1e1e', color: '#a6accd', fontFamily: 'monospace', padding: '12px', borderRadius: '6px', overflowY: 'auto', fontSize: '0.85rem' }}>
                {chatLogs.length === 0 ? (
                  <span style={{ color: '#5c6370' }}>Nenhuma operação executada ainda nesta chamada.</span>
                ) : (
                  chatLogs.map((log, idx) => (
                    <div key={idx} style={{ marginBottom: '6px', color: '#4fc3f7' }}>
                      {log}
                    </div>
                  ))
                )}
              </div>

              {/* Suggestions chips */}
              <div style={{ marginTop: '16px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>Sugestões de Comandos:</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button 
                    onClick={() => setChatInput('Quais produtos estão cadastrados?')} 
                    style={{ textAlign: 'left', background: 'transparent', border: '1px solid #ddd', padding: '8px 12px', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}
                  >
                    🔍 "Quais produtos estão cadastrados?"
                  </button>
                  <button 
                    onClick={() => setChatInput('Listar cupons ativos')} 
                    style={{ textAlign: 'left', background: 'transparent', border: '1px solid #ddd', padding: '8px 12px', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}
                  >
                    🎟️ "Listar cupons ativos"
                  </button>
                  <button 
                    onClick={() => setChatInput('Cadastre o cupom BRASIL10 com 10% de desconto e preço mínimo R$100')} 
                    style={{ textAlign: 'left', background: 'transparent', border: '1px solid #ddd', padding: '8px 12px', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}
                  >
                    ✍️ "Cadastre o cupom BRASIL10..."
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="toast">
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}

export default App;
