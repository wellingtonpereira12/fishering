import React, { useState, useEffect } from 'react';
import { Search, Share2, ExternalLink, Sun, Moon, RefreshCw, ShoppingBag, Tag } from 'lucide-react';

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5000/api'
  : '/api';

function App() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [selectedCoupon, setSelectedCoupon] = useState('Todos'); // 'Todos' means no coupon filter
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  // Fetch products from backend
  const fetchProducts = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/products`);
      if (!response.ok) throw new Error('Não foi possível carregar os produtos.');
      const data = await response.json();
      setProducts(data);
    } catch (err) {
      console.error(err);
      setError('Erro ao conectar com o backend. Verifique se o servidor está rodando.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // Extract all unique categories
  const categories = ['Todos', ...new Set(products.map(p => p.category || 'Geral'))];

  // Extract all unique coupons that are active
  const activeCoupons = [...new Set(products.filter(p => p.coupon).map(p => p.coupon))];

  // Filtered products
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(search.toLowerCase()) || 
                          p.store.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === 'Todos' || p.category === selectedCategory;
    const matchesCoupon = selectedCoupon === 'Todos' || p.coupon === selectedCoupon;
    return matchesSearch && matchesCategory && matchesCoupon;
  });

  const showToast = (message) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage('');
    }, 2500);
  };

  const handleShare = (e, product) => {
    e.stopPropagation(); // Evita navegar ao clicar em compartilhar
    e.preventDefault();
    let shareText = `Confira esta promoção: ${product.title} por apenas R$ ${product.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}!`;
    if (product.coupon) {
      shareText += ` Use o cupom ${product.coupon} para garantir o desconto!`;
    }
    shareText += ` Acesse em: ${product.url}`;
    
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareText);
      showToast('Link da promoção copiado! 📋');
    } else {
      const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
      window.open(url, '_blank');
    }
  };

  return (
    <div className="app-container">
      {/* Full-width Yellow Header (Mercado Livre Style) */}
      <header className="app-header">
        <div className="header-content">
          <div className="logo-section">
            <h1>🎣 Fishering</h1>
          </div>
          
          {/* Search bar inside header */}
          <div className="search-box-header">
            <input 
              type="text" 
              placeholder="Buscar produtos, marcas e muito mais..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="search-icon-btn" aria-label="Buscar">
              <Search size={18} />
            </button>
          </div>

        </div>
      </header>

      {/* Main Layout Area */}
      <div className="app-wrapper">
        {/* Navigation Categories Row */}
        <nav className="nav-filters-row">
          <span className="nav-filters-title">CATEGORIAS:</span>
          {categories.map(cat => (
            <button
              key={cat}
              className={`filter-chip ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => {
                setSelectedCategory(cat);
                setSelectedCoupon('Todos'); // Clear coupon filter when changing category for better UX
              }}
            >
              {cat}
            </button>
          ))}
        </nav>

        {/* Coupons List Section below Categories */}
        {activeCoupons.length > 0 && (
          <section className="coupons-container">
            <h3 className="coupons-title">🎟️ Cupons Disponíveis no Momento</h3>
            <div className="coupons-list">
              <button 
                className={`coupon-ticket ${selectedCoupon === 'Todos' ? 'active' : ''}`}
                onClick={() => setSelectedCoupon('Todos')}
              >
                Todos os Cupons
              </button>
              {activeCoupons.map(cp => (
                <button
                  key={cp}
                  className={`coupon-ticket ${selectedCoupon === cp ? 'active' : ''}`}
                  onClick={() => setSelectedCoupon(cp)}
                >
                  <Tag size={12} style={{ transform: 'rotate(-45deg)', marginRight: '2px' }} />
                  {cp}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Main Grid */}
        <main>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-secondary)' }}>
              <RefreshCw className="animate-spin" size={32} style={{ margin: '0 auto 16px', animation: 'spin 1.5s linear infinite' }} />
              <p>Carregando produtos de pesca...</p>
            </div>
          ) : error ? (
            <div className="empty-state">
              <p style={{ color: 'var(--danger)', fontWeight: 600 }}>{error}</p>
              <button className="btn-buy" onClick={fetchProducts} style={{ margin: '16px auto 0', maxWidth: '200px' }}>
                <RefreshCw size={14} style={{ marginRight: '6px' }} /> Tentar Novamente
              </button>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="empty-state">
              <h3>Nenhum resultado encontrado</h3>
              <p>Tente refinar sua busca utilizando termos diferentes ou alterando os filtros.</p>
              <button className="btn-buy" onClick={() => { setSearch(''); setSelectedCategory('Todos'); setSelectedCoupon('Todos'); }} style={{ margin: '0 auto', maxWidth: '200px' }}>
                Limpar Filtros
              </button>
            </div>
          ) : (
            <div className="products-grid">
              {filteredProducts.map(product => {
                const discount = product.originalPrice 
                  ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100) 
                  : 0;

                const isFreeShipping = product.price >= 79.0;

                return (
                  <a 
                    key={product.id} 
                    href={product.url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="product-card"
                  >
                    <div className="card-img-wrapper">
                      <img 
                        src={product.image} 
                        alt={product.title} 
                        className="product-card-img"
                        onError={(e) => {
                          e.target.src = 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=600&q=80';
                        }}
                      />
                      <span className="card-badge">{product.category || 'Geral'}</span>
                      <span className="card-store-badge">{product.store}</span>
                    </div>

                    <div className="card-info">
                      <h2 className="card-title" title={product.title}>
                        {product.title}
                      </h2>

                      <div className="card-price-section">
                        {product.originalPrice && product.originalPrice > product.price ? (
                          <>
                            <span className="card-original-price">
                              R$ {product.originalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                            <div className="price-row">
                              <span className="card-current-price">
                                R$ {product.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                              <span className="card-discount-tag">
                                {discount}% OFF
                              </span>
                            </div>
                          </>
                        ) : (
                          <div className="price-row">
                            <span className="card-current-price">
                              R$ {product.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        )}

                        {isFreeShipping && (
                          <span className="free-shipping-text">
                            Frete grátis
                          </span>
                        )}

                        {/* Coupon Tag below prices */}
                        {product.coupon && (
                          <div className="card-coupon-badge">
                            <Tag size={10} style={{ transform: 'rotate(-45deg)' }} />
                            Cupom: {product.coupon}
                          </div>
                        )}
                      </div>

                      <div className="card-actions">
                        <span className="btn-buy">
                          Ver produto
                        </span>
                        <button 
                          className="btn-share" 
                          onClick={(e) => handleShare(e, product)}
                          title="Copiar link"
                        >
                          <Share2 size={15} />
                        </button>
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </main>
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
