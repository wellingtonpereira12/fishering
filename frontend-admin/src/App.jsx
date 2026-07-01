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

  // Tabs & Coupon state
  const [activeTab, setActiveTab] = useState('products'); // 'products' ou 'coupons'
  const [coupons, setCoupons] = useState([]);
  const [loadingCoupons, setLoadingCoupons] = useState(true);
  const [couponCode, setCouponCode] = useState('');
  const [couponType, setCouponType] = useState('percentage'); // 'percentage' ou 'fixed'
  const [couponValue, setCouponValue] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [submittingCoupon, setSubmittingCoupon] = useState(false);
  const [minPriceFilter, setMinPriceFilter] = useState('');
  const [maxPriceFilter, setMaxPriceFilter] = useState('');

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

  // Fetch all coupons
  const fetchCoupons = async () => {
    setLoadingCoupons(true);
    try {
      const response = await fetch(`${API_BASE}/coupons`);
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

  useEffect(() => {
    fetchProducts();
    fetchCoupons();
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

  // Create or update a coupon
  const handleCreateCoupon = async (e) => {
    e.preventDefault();
    if (!couponCode.trim() || !couponType || couponValue === '') {
      showToast('Código, tipo e valor do cupom são obrigatórios.');
      return;
    }

    setSubmittingCoupon(true);
    try {
      const response = await fetch(`${API_BASE}/coupons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: couponCode.trim().toUpperCase(),
          type: couponType,
          value: parseFloat(couponValue),
          productIds: selectedProductIds
        })
      });

      if (response.ok) {
        showToast('Cupom gravado e produtos vinculados com sucesso! 🎟️');
        setCouponCode('');
        setCouponValue('');
        setSelectedProductIds([]);
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
      const response = await fetch(`${API_BASE}/coupons/${code}`, {
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

  // Toggle checkbox for linking products to coupon
  const handleProductCheckboxChange = (productId) => {
    setSelectedProductIds(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  // Filter products for the coupon checklist based on price
  const filteredChecklistProducts = products.filter(p => {
    const price = parseFloat(p.price);
    const min = minPriceFilter !== '' ? parseFloat(minPriceFilter) : null;
    const max = maxPriceFilter !== '' ? parseFloat(maxPriceFilter) : null;
    
    if (min !== null && isNaN(min)) return true;
    if (max !== null && isNaN(max)) return true;

    if (min !== null && price < min) return false;
    if (max !== null && price > max) return false;
    return true;
  });

  // Select all products currently visible in the checklist
  const handleSelectAllFiltered = (e) => {
    e.preventDefault();
    const filteredIds = filteredChecklistProducts.map(p => p.id);
    setSelectedProductIds(prev => {
      const newSelection = [...prev];
      filteredIds.forEach(id => {
        if (!newSelection.includes(id)) {
          newSelection.push(id);
        }
      });
      return newSelection;
    });
  };

  // Deselect all products currently visible in the checklist
  const handleDeselectAllFiltered = (e) => {
    e.preventDefault();
    const filteredIds = filteredChecklistProducts.map(p => p.id);
    setSelectedProductIds(prev => prev.filter(id => !filteredIds.includes(id)));
  };

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
            </div>
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
        {activeTab === 'products' ? (
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

                    <div className="form-row">
                      <div className="form-group">
                        <label>Preço Original (R$)</label>
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
                        <label>Preço Sem Desconto (R$ - Opcional)</label>
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
                      <select 
                        value={coupon} 
                        onChange={(e) => setCoupon(e.target.value)}
                      >
                        <option value="">Sem Cupom</option>
                        {coupons.map(c => (
                          <option key={c.code} value={c.code}>
                            {c.code} ({c.type === 'percentage' ? `${c.value}%` : `R$ ${c.value}`} OFF)
                          </option>
                        ))}
                      </select>
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
                        {/* Se houver um cupom de desconto vinculado e ele existir cadastrado */}
                        {(() => {
                          const linkedCoupon = coupons.find(c => c.code === coupon);
                          if (linkedCoupon) {
                            const origVal = parseFloat(price || 0);
                            let promoVal = origVal;
                            if (linkedCoupon.type === 'percentage') {
                              promoVal = origVal * (1 - linkedCoupon.value / 100);
                            } else {
                              promoVal = Math.max(0, origVal - linkedCoupon.value);
                            }
                            return (
                              <>
                                <span className="card-original-price">
                                  R$ {origVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                                <div className="price-row">
                                  <span className="card-current-price">
                                    R$ {promoVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                                <span className="card-coupon-badge">
                                  🎟️ Cupom: {coupon}
                                </span>
                              </>
                            );
                          } else {
                            // Senão, cálculo clássico de originalPrice vs price
                            return (
                              <>
                                {originalPrice && parseFloat(originalPrice) > parseFloat(price || 0) && (
                                  <span className="card-original-price">
                                    R$ {parseFloat(originalPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </span>
                                )}
                                <div className="price-row">
                                  <span className="card-current-price">
                                    R$ {parseFloat(price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                              </>
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
          </>
        ) : (
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
                </div>

                <div className="form-group" style={{ marginTop: '12px' }}>
                  <label>Vincular Produtos a este Cupom</label>
                  
                  {/* Filter and Selection buttons row */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginBottom: '10px', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Preço de:</span>
                      <input
                        type="number"
                        placeholder="Mínimo"
                        value={minPriceFilter}
                        onChange={(e) => setMinPriceFilter(e.target.value)}
                        style={{ padding: '6px 8px', width: '90px', fontSize: '0.85rem', border: '1px solid #ccc', borderRadius: '4px' }}
                      />
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>até</span>
                      <input
                        type="number"
                        placeholder="Máximo"
                        value={maxPriceFilter}
                        onChange={(e) => setMaxPriceFilter(e.target.value)}
                        style={{ padding: '6px 8px', width: '90px', fontSize: '0.85rem', border: '1px solid #ccc', borderRadius: '4px' }}
                      />
                      {(minPriceFilter || maxPriceFilter) && (
                        <button
                          type="button"
                          onClick={() => { setMinPriceFilter(''); setMaxPriceFilter(''); }}
                          style={{ background: 'transparent', border: 'none', color: '#f73f55', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, padding: '4px' }}
                        >
                          Limpar
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={handleSelectAllFiltered}
                        style={{ 
                          fontSize: '0.75rem', 
                          padding: '6px 12px', 
                          background: 'transparent', 
                          border: '1px solid var(--accent-blue)', 
                          color: 'var(--accent-blue)',
                          borderRadius: '4px',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        Selecionar Todos ({filteredChecklistProducts.length})
                      </button>
                      <button
                        type="button"
                        onClick={handleDeselectAllFiltered}
                        style={{ 
                          fontSize: '0.75rem', 
                          padding: '6px 12px', 
                          background: 'transparent', 
                          border: '1px solid var(--danger)', 
                          color: 'var(--danger)',
                          borderRadius: '4px',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        Deselecionar Todos
                      </button>
                    </div>
                  </div>

                  <div className="checklist-container">
                    {filteredChecklistProducts.length === 0 ? (
                      <p style={{ padding: '10px', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                        Nenhum produto corresponde aos filtros aplicados.
                      </p>
                    ) : (
                      filteredChecklistProducts.map(p => (
                        <label key={p.id} className="checklist-item">
                          <input
                            type="checkbox"
                            checked={selectedProductIds.includes(p.id)}
                            onChange={() => handleProductCheckboxChange(p.id)}
                          />
                          <span style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                            <span>{p.title} ({p.store})</span>
                            <strong style={{ marginLeft: '10px', whiteSpace: 'nowrap' }}>R$ {p.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                          </span>
                        </label>
                      ))
                    )}
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
                      Cadastrar e Vincular Cupom
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
                      <th>Produtos Vinculados</th>
                      <th style={{ textAlign: 'right' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coupons.map(c => {
                      const linkedCount = products.filter(p => p.coupon === c.code).length;
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
                            {c.type === 'percentage' ? `${c.value}%` : `R$ ${c.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                          </td>
                          <td style={{ color: 'var(--text-secondary)' }}>
                            {linkedCount} {linkedCount === 1 ? 'produto' : 'produtos'}
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
