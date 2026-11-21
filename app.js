/* HairsbyDinma · Try-on prototype */
(() => {
  // ---------------- Data ----------------
  // Each wig needs: a single-wig thumbnail (assets/wigs/<id>.jpg)
  // and three photos of the model wearing it (assets/views/<id>-front|side|back.jpg).
  const WIGS = [
    { id: 'bodywave', short: 'Body Wave', name: 'Rich Bounce Body Wave', price: 50000, lace: 'HD lace', spec: '13×4 HD lace · 180% density', cats: ['frontal'], lengths: ['16″', '20″', '22″', '26″'], defLen: '22″' },
    { id: 'straight', short: 'Bone Straight', name: 'Bone Straight Bust Down', price: 55000, lace: '13×4 HD lace', spec: '13×4 HD lace · 200% density', cats: ['bustdown', 'frontal'], lengths: ['18″', '22″', '26″', '30″'], defLen: '26″' },
    { id: 'deep', short: 'Deep Wave', name: 'Deep Wave Frontal', price: 50000, lace: 'HD lace', spec: '13×4 HD lace · 180% density', cats: ['frontal'], lengths: ['16″', '20″', '22″', '26″'], defLen: '22″' },
    { id: 'curly', short: 'Kinky Curly', name: 'Kinky Curly Frontal', price: 55000, lace: '13×4 HD lace', spec: '13×4 HD lace · 200% density', cats: ['frontal', 'coily'], lengths: ['16″', '20″', '22″', '26″'], defLen: '22″' },
    { id: 'bob', short: 'Sassy Bob', name: 'Sassy Bob Bust Down', price: 40000, lace: '5×5 closure', spec: '5×5 HD closure · 180% density', cats: ['bustdown'], lengths: ['10″', '12″', '14″'], defLen: '12″' },
    { id: 'afro', short: 'Afro Coily', name: 'Afro Coily Unit', price: 45000, lace: 'HD lace', spec: 'HD lace · 250% density', cats: ['coily'], lengths: ['12″', '14″', '16″'], defLen: '14″' },
  ];
  const COLOURS = [
    { name: 'Natural Black', hex: '#1b1410' },
    { name: 'Dark Brown Highlight', hex: '#4a2e22' },
    { name: 'Light Brown Highlight', hex: '#8b5a3c' },
    { name: 'Blonde', hex: '#d8b27a' },
    { name: 'Ginger', hex: '#b5562a' },
  ];
  // How length shows on the model: pivot = line (fraction of photo height) the hair grows from,
  // k = change in hair length below that line per inch.
  const LENGTH_FX = {
    bodywave: { pivot: 0.46, k: 0.05 },
    straight: { pivot: 0.46, k: 0.04 },
    deep: { pivot: 0.46, k: 0.05 },
    curly: { pivot: 0.46, k: 0.05 },
    bob: { pivot: 0.4, k: 0.22, relax: 0.62 }, // relax: neck line in the photo (no colour on skin above it)
    afro: { pivot: 0.4, k: 0.12, relax: 0.62 },
  };
  const GIFT = { name: 'Branded Gift Box + Hair Tag', price: 15000 };
  const VIEWS = ['front', 'side', 'back', 'side']; // 0°, 90°, 180°, 270° (270° = side, mirrored)
  const byId = Object.fromEntries(WIGS.map(w => [w.id, w]));

  // ---------------- State ----------------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  };
  const state = {
    cat: 'all',
    wig: 'bodywave',
    len: Object.fromEntries(WIGS.map(w => [w.id, w.defLen])),
    colour: 'Natural Black',
    angle: 0,
    cart: store.get('hbd-cart', []),
    gift: store.get('hbd-gift', false),
    saved: new Set(store.get('hbd-saved', [])),
  };

  // ---------------- Helpers ----------------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const naira = n => '₦' + n.toLocaleString('en-NG');
  const viewSrc = (id, view) => `assets/views/${id}-${view}.jpg`;
  const thumbSrc = id => `assets/wigs/${id}.jpg`;
  const norm = a => ((a % 360) + 360) % 360;
  const quad = a => Math.round(norm(a) / 90) % 4;
  const viewName = a => ['Front', 'Side', 'Back', 'Side'][quad(a)];
  const ICON_CHECK = '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>';

  // Preload every view so rotating and swapping is instant
  WIGS.forEach(w => ['front', 'side', 'back'].forEach(v => HairEngine.loadImg(viewSrc(w.id, v))));

  // Hair colour + length rendering
  const lengthScale = (id, len) => {
    const w = byId[id], fx = LENGTH_FX[id];
    const s = 1 + (parseFloat(len) - parseFloat(w.defLen)) * fx.k;
    return Math.max(0.6, Math.min(1.8, s));
  };
  const CURLY = { deep: 1, curly: 1, afro: 1 };
  const texture = id => (CURLY[id] ? 'curly' : id === 'bodywave' ? 'wavy' : 'straight');
  const modelSrc = (id, view, len = state.len[id], colour = state.colour) =>
    HairEngine.render(viewSrc(id, view), { colour, scale: lengthScale(id, len), pivot: LENGTH_FX[id].pivot, texture: texture(id), relax: LENGTH_FX[id].relax || 0.52 });
  const tintedThumb = (id, colour) => HairEngine.render(thumbSrc(id), { colour, texture: texture(id) });
  // Render the other views in the background so turning stays instant
  const warmViews = () => ['front', 'side', 'back'].forEach(v => modelSrc(state.wig, v));

  // ---------------- Cards ----------------
  const colLeft = $('#colLeft'), colRight = $('#colRight'), mobileCards = $('#mobileCards');

  function cardHTML(w) {
    return `<button class="card${w.id === state.wig ? ' is-selected' : ''}" data-wig="${w.id}" aria-pressed="${w.id === state.wig}" aria-label="Try on ${w.name}">
      <span class="card__badge">${ICON_CHECK}Trying on</span>
      <img class="card__thumb" src="${thumbSrc(w.id)}" alt="${w.short} wig" loading="lazy" />
      <div class="card__name">${w.short}</div>
      <div class="card__meta"><b>${naira(w.price)}</b><i></i>${w.lace}</div>
    </button>`;
  }
  function renderCards() {
    const list = WIGS.filter(w => state.cat === 'all' || w.cats.includes(state.cat));
    colLeft.innerHTML = list.filter((_, i) => i % 2 === 0).map(cardHTML).join('');
    colRight.innerHTML = list.filter((_, i) => i % 2 === 1).map(cardHTML).join('');
    mobileCards.innerHTML = list.map(cardHTML).join('');
    $$('.card').forEach((c, i) => { c.style.animationDelay = (i % 6) * 40 + 'ms'; });
  }
  document.addEventListener('click', e => {
    const card = e.target.closest('.card');
    if (card) selectWig(card.dataset.wig);
  });

  // Tabs
  $('#tabs').addEventListener('click', e => {
    const t = e.target.closest('.tab'); if (!t) return;
    state.cat = t.dataset.cat;
    $$('.tab').forEach(b => { const on = b === t; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', on); });
    renderCards();
  });

  // ---------------- Model / stage ----------------
  const arch = $('#arch');
  const imgs = [$('#viewA'), $('#viewB')];
  let front = 0; // index of visible img
  let shown = { src: '', mirror: false };

  let paintToken = 0;
  async function paintModel({ swap = false } = {}) {
    const token = ++paintToken;
    const q = quad(state.angle);
    const src = await modelSrc(state.wig, VIEWS[q]);
    if (token !== paintToken) return; // a newer paint is on its way
    const mirror = q === 3;
    const tilt = norm(state.angle) - q * 90 - (q === 0 && norm(state.angle) > 270 ? 360 : 0);
    const tiltDeg = Math.max(-28, Math.min(28, -tilt * 0.35));
    const tf = `${mirror ? 'scaleX(-1) ' : ''}rotateY(${mirror ? -tiltDeg : tiltDeg}deg)`;

    if (src !== shown.src || mirror !== shown.mirror) {
      const next = imgs[1 - front];
      next.style.transform = tf;
      next.src = src;
      const reveal = () => {
        next.classList.add('is-on'); imgs[front].classList.remove('is-on'); front = 1 - front;
        if (swap) { arch.classList.remove('is-swapping'); void arch.offsetWidth; arch.classList.add('is-swapping'); }
      };
      next.complete ? reveal() : next.addEventListener('load', reveal, { once: true });
      shown = { src, mirror };
    } else {
      imgs[front].style.transform = tf;
    }
    updateViewUI();
    renderViewThumbs();
  }

  function updateViewUI() {
    const q = quad(state.angle);
    $$('.view-btn').forEach(b => {
      const a = +b.dataset.angle;
      const on = a === 90 ? (q === 1 || q === 3) : quad(a) === q;
      b.classList.toggle('is-active', on); b.setAttribute('aria-checked', on);
    });
    const w = byId[state.wig];
    $('#wearName').textContent = w.name;
    $('#wearMeta').textContent = `${state.len[w.id]} · ${state.colour} · ${viewName(state.angle)} view`;
  }

  function setAngle(a, snap = true) {
    state.angle = snap ? Math.round(a / 90) * 90 : a;
    paintModel();
  }

  // Drag to rotate (mouse + touch)
  let drag = null;
  arch.addEventListener('pointerdown', e => {
    drag = { x: e.clientX, start: state.angle, moved: false };
    arch.setPointerCapture(e.pointerId);
    arch.classList.add('is-dragging');
  });
  arch.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 3) drag.moved = true;
    setAngle(drag.start - dx * 0.6, false);
  });
  const endDrag = () => {
    if (!drag) return;
    drag = null; arch.classList.remove('is-dragging');
    setAngle(state.angle, true);
  };
  arch.addEventListener('pointerup', endDrag);
  arch.addEventListener('pointercancel', endDrag);
  arch.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); setAngle(state.angle - 90); }
    if (e.key === 'ArrowRight') { e.preventDefault(); setAngle(state.angle + 90); }
  });
  $('#rotLeft').addEventListener('click', () => setAngle(state.angle - 90));
  $('#rotRight').addEventListener('click', () => setAngle(state.angle + 90));
  $('#views').addEventListener('click', e => {
    const b = e.target.closest('.view-btn'); if (!b) return;
    const target = +b.dataset.angle;
    // turn the shortest way to the chosen view
    let diff = norm(target - state.angle); if (diff > 180) diff -= 360;
    if (target === 90 && quad(state.angle) === 3) diff = 0; // already on a side view
    setAngle(state.angle + diff);
  });

  // ---------------- Selection bar ----------------
  function renderBar() {
    const w = byId[state.wig];
    $('#barThumb').alt = w.short;
    tintedThumb(w.id, state.colour).then(u => { if (state.wig === w.id) $('#barThumb').src = u; });
    $('#barName').textContent = w.name;
    $('#barSpec').textContent = `${w.cats.includes('frontal') ? 'Frontal' : w.cats.includes('bustdown') ? 'Bust Down' : 'Coily'} · ${w.spec}`;
    $('#barPrice').textContent = naira(w.price);
    $('#lengths').innerHTML = w.lengths.map(l => `<button class="chip${l === state.len[w.id] ? ' is-active' : ''}" data-len="${l}">${l}</button>`).join('');
    $('#colours').innerHTML = COLOURS.map(c => `<button class="swatch${c.name === state.colour ? ' is-active' : ''}" data-colour="${c.name}" aria-label="${c.name}" title="${c.name}"><span style="background:${c.hex}"></span></button>`).join('');
    $('#colourLabel').textContent = 'COLOUR · ' + state.colour.toUpperCase();
    $('#saveBtn').classList.toggle('is-saved', state.saved.has(w.id));
  }
  $('#lengths').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    if (state.len[state.wig] === b.dataset.len) return;
    state.len[state.wig] = b.dataset.len; renderBar(); paintModel({ swap: true }); warmViews();
  });
  $('#colours').addEventListener('click', e => {
    const b = e.target.closest('.swatch'); if (!b) return;
    if (state.colour === b.dataset.colour) return;
    state.colour = b.dataset.colour; renderBar(); paintModel({ swap: true }); warmViews();
  });

  function selectWig(id) {
    if (id === state.wig) return;
    state.wig = id;
    $$('.card').forEach(c => { const on = c.dataset.wig === id; c.classList.toggle('is-selected', on); c.setAttribute('aria-pressed', on); });
    paintModel({ swap: true });
    renderBar();
    warmViews();
    if (window.matchMedia('(max-width: 1080px)').matches) arch.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Saved
  $('#saveBtn').addEventListener('click', () => {
    const id = state.wig;
    state.saved.has(id) ? state.saved.delete(id) : state.saved.add(id);
    store.set('hbd-saved', [...state.saved]);
    renderBar();
    toast(state.saved.has(id) ? `Saved ${byId[id].short}` : `Removed ${byId[id].short} from saved`);
  });

  // ---------------- Bag ----------------
  const drawer = $('#drawer'), scrim = $('#scrim');
  const lineKey = i => `${i.id}|${i.len}|${i.colour}`;

  function addCurrent() {
    const item = { id: state.wig, len: state.len[state.wig], colour: state.colour, qty: 1 };
    const found = state.cart.find(i => lineKey(i) === lineKey(item));
    found ? found.qty++ : state.cart.push(item);
    saveCart(); renderBag();
    const c = $('#bagCount'); c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');
  }
  function applyTints(root) {
    $$('img[data-tint]', root).forEach(img => {
      const [id, colour] = img.dataset.tint.split('|');
      tintedThumb(id, colour).then(u => { img.src = u; });
    });
  }
  function saveCart() { store.set('hbd-cart', state.cart); store.set('hbd-gift', state.gift); }
  const totals = () => state.cart.reduce((s, i) => s + byId[i.id].price * i.qty, 0) + (state.gift && state.cart.length ? GIFT.price : 0);
  const count = () => state.cart.reduce((s, i) => s + i.qty, 0);

  function renderBag() {
    const n = count();
    const c = $('#bagCount'); c.hidden = n === 0; c.textContent = n;
    $('#drawerCount').textContent = `(${n})`;
    drawer.classList.toggle('is-empty', n === 0);
    $('#bagItems').innerHTML = state.cart.map((i, idx) => {
      const w = byId[i.id];
      return `<div class="item">
        <img src="${thumbSrc(w.id)}" alt="${w.short}" data-tint="${w.id}|${i.colour}" />
        <div class="item__body">
          <div class="item__name">${w.name}</div>
          <div class="muted">${w.cats.includes('frontal') ? 'Frontal' : w.cats.includes('bustdown') ? 'Bust Down' : 'Coily'} · ${i.len} · ${i.colour}</div>
          <div class="item__row">
            <div class="stepper">
              <button data-dec="${idx}" aria-label="Decrease quantity"><svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg></button>
              <span>${i.qty}</span>
              <button data-inc="${idx}" aria-label="Increase quantity"><svg viewBox="0 0 24 24"><path d="M5 12h14"/><path d="M12 5v14"/></svg></button>
            </div>
            <span class="item__price">${naira(w.price * i.qty)}</span>
          </div>
          <button class="link" data-remove="${idx}">Remove</button>
        </div>
      </div>`;
    }).join('');
    applyTints($('#bagItems'));
    $('#upsell').classList.toggle('is-added', state.gift);
    $('#giftBtn').textContent = state.gift ? 'Added' : 'Add';
    $('#subtotal').textContent = naira(totals());
    $('#total').textContent = naira(totals());
  }
  $('#bagItems').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.inc) state.cart[+b.dataset.inc].qty++;
    if (b.dataset.dec) { const i = state.cart[+b.dataset.dec]; i.qty > 1 ? i.qty-- : state.cart.splice(+b.dataset.dec, 1); }
    if (b.dataset.remove) state.cart.splice(+b.dataset.remove, 1);
    saveCart(); renderBag();
  });
  $('#giftBtn').addEventListener('click', () => { state.gift = !state.gift; saveCart(); renderBag(); });

  function openBag() {
    scrim.hidden = false; requestAnimationFrame(() => scrim.classList.add('is-on'));
    drawer.classList.add('is-open'); drawer.setAttribute('aria-hidden', 'false');
    $('#closeBag').focus();
  }
  function closeBag() {
    scrim.classList.remove('is-on'); drawer.classList.remove('is-open'); drawer.setAttribute('aria-hidden', 'true');
    setTimeout(() => { if (!drawer.classList.contains('is-open')) scrim.hidden = true; }, 300);
  }
  $('#openBag').addEventListener('click', openBag);
  $$('[data-open-bag]').forEach(b => b.addEventListener('click', openBag));
  $('#closeBag').addEventListener('click', closeBag);
  scrim.addEventListener('click', closeBag);
  document.addEventListener('click', e => { if (e.target.closest('[data-close-bag]')) closeBag(); });

  $('#addToBag').addEventListener('click', () => {
    addCurrent();
    toast(`${byId[state.wig].short} added to your bag`, 'View bag', openBag);
  });
  $('#buyNow').addEventListener('click', () => {
    const k = lineKey({ id: state.wig, len: state.len[state.wig], colour: state.colour });
    if (!state.cart.some(i => lineKey(i) === k)) addCurrent();
    openCheckout();
  });
  $('#toCheckout').addEventListener('click', () => { closeBag(); openCheckout(); });

  // ---------------- Checkout (mock) ----------------
  const modal = $('#checkout'), form = $('#coForm');
  function openCheckout() {
    if (!state.cart.length) return;
    form.hidden = false; $('#coDone').hidden = true; form.classList.remove('was-validated');
    $('#coItems').innerHTML = state.cart.map(i => {
      const w = byId[i.id];
      return `<div class="co-item"><img src="${thumbSrc(w.id)}" alt="" data-tint="${w.id}|${i.colour}" /><div><strong>${w.name}</strong>${i.len} · ${i.colour} · Qty ${i.qty}</div><span>${naira(w.price * i.qty)}</span></div>`;
    }).join('') + (state.gift ? `<div class="co-item"><span class="upsell__icon co-item__gift"><svg viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/></svg></span><div><strong>${GIFT.name}</strong>Add-on</div><span>${naira(GIFT.price)}</span></div>` : '');
    applyTints($('#coItems'));
    $('#coTotal').textContent = naira(totals());
    modal.hidden = false;
    $('input', form).focus();
  }
  const closeCheckout = () => { modal.hidden = true; };
  $('#closeCheckout').addEventListener('click', closeCheckout);
  modal.addEventListener('click', e => { if (e.target === modal) closeCheckout(); });
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!form.checkValidity()) { form.classList.add('was-validated'); $(':invalid', form)?.focus(); return; }
    $('#orderNo').textContent = '#HBD-' + Math.floor(1000 + Math.random() * 9000);
    form.hidden = true; $('#coDone').hidden = false;
    state.cart = []; state.gift = false; saveCart(); renderBag(); form.reset();
  });
  $('#doneBtn').addEventListener('click', closeCheckout);

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!modal.hidden) closeCheckout(); else if (drawer.classList.contains('is-open')) closeBag();
  });

  // ---------------- Toast ----------------
  let toastTimer;
  function toast(msg, actionLabel, action) {
    const t = $('#toast');
    t.innerHTML = '';
    t.append(document.createTextNode(msg));
    if (actionLabel) { const b = document.createElement('button'); b.textContent = actionLabel; b.onclick = () => { action(); t.classList.remove('is-on'); }; t.append(b); }
    t.classList.add('is-on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('is-on'), 3200);
  }
  $$('[data-soon]').forEach(b => b.addEventListener('click', () => toast(`${b.dataset.soon} coming soon`)));

  // ---------------- View selector thumbs ----------------
  function renderViewThumbs() {
    const map = { 0: 'front', 90: 'side', 180: 'back' };
    const id = state.wig;
    $$('.view-btn').forEach(b => modelSrc(id, map[b.dataset.angle]).then(u => { if (state.wig === id) b.querySelector('img').src = u; }));
  }

  // ---------------- Init ----------------
  renderCards();
  renderBar();
  renderBag();
  paintModel();
  warmViews();
})();
