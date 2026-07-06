import React, { useState, useEffect } from 'react';
import { Search, Share2, ExternalLink, Sun, Moon, RefreshCw, ShoppingBag, Tag } from 'lucide-react';

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5000/api'
  : '/api';

function App() {
  const [products, setProducts] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [selectedCoupon, setSelectedCoupon] = useState('Todos'); // 'Todos' means no coupon filter
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  // Fetch products and coupons from backend
  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [prodRes, coupRes] = await Promise.all([
        fetch(`${API_BASE}/products`),
        fetch(`${API_BASE}/coupons`)
      ]);
      if (!prodRes.ok || !coupRes.ok) throw new Error('Não foi possível carregar os dados do servidor.');
      
      const prodData = await prodRes.json();
      const coupData = await coupRes.json();
      
      setProducts(prodData);
      setCoupons(coupData);
    } catch (err) {
      console.error(err);
      setError('Erro ao conectar com o backend. Verifique se o servidor está rodando.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Helper to calculate promotional price
  const getPromoPrice = (product) => {
    if (!product.coupon) return product.price;
    const linkedCoupon = coupons.find(c => c.code === product.coupon);
    if (linkedCoupon) {
      if (linkedCoupon.minProductPrice !== null && product.price < linkedCoupon.minProductPrice) {
        return product.price;
      }
      let discount = 0;
      if (linkedCoupon.type === 'percentage') {
        discount = product.price * (linkedCoupon.value / 100);
      } else {
        discount = linkedCoupon.value;
      }
      if (linkedCoupon.maxDiscount != null && discount > linkedCoupon.maxDiscount) {
        discount = linkedCoupon.maxDiscount;
      }
      return Math.max(0, product.price - discount);
    }
    return product.price;
  };

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
    const promoPrice = getPromoPrice(product);
    let shareText = `Confira esta promoção: ${product.title} por apenas R$ ${promoPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}!`;
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
              <button className="btn-buy" onClick={fetchData} style={{ margin: '16px auto 0', maxWidth: '200px' }}>
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
                        {(() => {
                          const linkedCoupon = coupons.find(c => c.code === product.coupon);
                          const promoPrice = getPromoPrice(product);
                          const hasCoupon = !!linkedCoupon;
                          
                          if (hasCoupon) {
                            const originalVal = product.price;
                            const couponDiscount = originalVal - promoPrice;
                            const discountPercentage = Math.round((couponDiscount / originalVal) * 100);
                            
                            return (
                              <>
                                <span className="card-original-price">
                                  R$ {originalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <div className="price-row">
                                  <span className="card-current-price" style={{ color: 'var(--accent-green)' }}>
                                    R$ {promoPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                  {discountPercentage > 0 && (
                                    <span className="card-discount-tag">
                                      {discountPercentage}% OFF
                                    </span>
                                  )}
                                </div>
                                <div className="card-coupon-badge" style={{ backgroundColor: '#e6f7ed', borderColor: 'rgba(0, 166, 80, 0.15)', color: 'var(--accent-green)', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 700, padding: '3px 8px', borderRadius: '3px', marginTop: '6px' }}>
                                  <Tag size={10} style={{ transform: 'rotate(-45deg)' }} />
                                  Cupom: {product.coupon} ({linkedCoupon.type === 'percentage' ? `${linkedCoupon.value}%` : `R$ ${linkedCoupon.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} OFF)
                                </div>
                                {couponDiscount > 0 && (
                                  <div style={{ backgroundColor: '#fff3e0', color: '#e65100', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 700, padding: '3px 8px', borderRadius: '3px', marginTop: '4px' }}>
                                    💰 Você economiza R$ {couponDiscount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </div>
                                )}
                              </>
                            );
                          } else {
                            return (
                              <div className="price-row">
                                <span className="card-current-price">
                                  R$ {product.price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                            );
                          }
                        })()}
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
