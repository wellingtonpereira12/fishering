import React, { useState, useEffect } from 'react';
import { Link as LinkIcon, Tag, DollarSign, ImageIcon, FileText, Sparkles, Trash2, Plus, RefreshCw, Sun, Moon, ExternalLink, ShoppingBag } from 'lucide-react';

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5000/api'
  : '/api';

function App() {
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
  const [coupon, setCoupon] = useState('');
  
  // Show editor form after scrape
  const [showForm, setShowForm] = useState(false);

  // Fetch all products
  const fetchProducts = async () => {
    setLoadingList(true);
    try {
      const response = await fetch(`${API_BASE}/products`);
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

  useEffect(() => {
    fetchProducts();
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
      const response = await fetch(`${API_BASE}/scrape?url=${encodeURIComponent(urlInput.trim())}`);
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
      const response = await fetch(`${API_BASE}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          image: imageUrl.trim(),
          price: parseFloat(price),
          originalPrice: originalPrice ? parseFloat(originalPrice) : null,
          url: urlInput.trim(),
          category,
          store: store.trim() || 'Mercado Livre',
          coupon: coupon.trim() ? coupon.trim().toUpperCase() : null
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
        setCoupon('');
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
      const response = await fetch(`${API_BASE}/products/${id}`, {
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

  return (
    <div className="app-container">
      {/* Full-width Yellow Header (Mercado Livre Style) */}
      <header className="app-header">
        <div className="header-content">
          <div className="logo-section">
            <h1>🎣 Fishering Admin</h1>
          </div>
          
          <div className="header-actions">
            <a href="http://localhost:5174/" className="btn-header-action-primary" target="_blank" rel="noopener noreferrer">
              <ExternalLink size={15} />
              Ver Portal de Clientes
            </a>
          </div>
        </div>
      </header>

      {/* Main Layout Area */}
      <div className="app-wrapper">
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

                <div className="form-row">
                  <div className="form-group">
                    <label>Preço Promocional (R$)</label>
                    <input 
                      type="number" 
                      step="0.01" 
                      placeholder="Ex: 99.90" 
                      value={price} 
                      onChange={(e) => setPrice(e.target.value)} 
                      required 
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>Preço Original (R$)</label>
                    <input 
                      type="number" 
                      step="0.01" 
                      placeholder="Opcional" 
                      value={originalPrice} 
                      onChange={(e) => setOriginalPrice(e.target.value)} 
                    />
                  </div>
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

                {/* Cupom Field */}
                <div className="form-group">
                  <label>Cupom de Desconto Vincular (Opcional)</label>
                  <input 
                    type="text" 
                    placeholder="Ex: PESCA10, FRETEGRATIS" 
                    value={coupon} 
                    onChange={(e) => setCoupon(e.target.value)} 
                  />
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
                    {originalPrice && parseFloat(originalPrice) > parseFloat(price || 0) ? (
                      <>
                        <span className="card-original-price">
                          R$ {parseFloat(originalPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                        <div className="price-row">
                          <span className="card-current-price">
                            R$ {parseFloat(price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="price-row">
                        <span className="card-current-price">
                          R$ {parseFloat(price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}

                    {coupon && (
                      <div className="card-coupon-badge">
                        <Tag size={10} />
                        Cupom: {coupon.toUpperCase()}
                      </div>
                    )}
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
          <div className="admin-table-title">
            <Tag size={16} style={{ color: 'var(--accent-blue)' }} />
            Produtos Cadastrados ({products.length})
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
                  <th>Preço</th>
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
                            <span style={{ fontSize: '0.75rem', color: '#f73f55', fontWeight: 700 }}>
                              🎟️ Cupom: {p.coupon}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ fontWeight: 600, color: '#333' }}>
                      R$ {p.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
