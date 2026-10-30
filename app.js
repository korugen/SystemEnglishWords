(() => {
  'use strict';

  const LS = {
    pos: 'sei.pos',
    order: 'sei.order',
    memo: 'sei.memo',
    opts: 'sei.opts',
  };

  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    },
  };

  const $ = (id) => document.getElementById(id);

  let dict = new Map();   // headword -> entry
  let entries = [];       // [{no, label, entry}]
  let orderIsOfficial = false;
  let index = 0;
  let memos = store.get(LS.memo, {});
  let opts = Object.assign({ hideJa: false, hideWord: false }, store.get(LS.opts, {}));
  let revealedJa = false;
  let revealedWord = false;

  // ---------- data ----------

  function normalize(s) {
    return s.toLowerCase()
      .replace(/[’']/g, "'")
      .replace(/[()［］\[\]〈〉<>{}「」]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Look up an order line like "agree", "agree with A", "be aware of A" in the dictionary.
  function lookup(label) {
    const n = normalize(label);
    if (dict.has(n)) return dict.get(n);
    const tokens = n.split(/[\s,/;・]+/).filter(Boolean);
    const skip = new Set(['be', 'a', 'an', 'the', 'to', 'one\'s', 'oneself', 'a\'s', 'b', '~', '…', 'do', 'doing', 'sth', 'sb']);
    for (const t of tokens) {
      const w = t.replace(/[^a-z'-]/g, '');
      if (!w || skip.has(w)) continue;
      if (dict.has(w)) return dict.get(w);
    }
    return null;
  }

  function parseOrder(text) {
    const out = [];
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const m = line.match(/^(\d+)[\s.,:、\t]+(.+)$/);
      if (!m) continue;
      out.push({ no: parseInt(m[1], 10), label: m[2].trim() });
    }
    out.sort((a, b) => a.no - b.no);
    return out;
  }

  function buildEntries(orderText) {
    const order = orderText ? parseOrder(orderText) : [];
    if (order.length) {
      orderIsOfficial = true;
      entries = order.map((o) => ({ no: o.no, label: o.label, entry: lookup(o.label) }));
    } else {
      orderIsOfficial = false;
      const all = [...dict.values()].sort((a, b) => a.w.localeCompare(b.w));
      entries = all.map((e, i) => ({ no: i + 1, label: e.w, entry: e }));
    }
  }

  async function fetchText(url) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      return res.ok ? await res.text() : '';
    } catch (e) {
      return '';
    }
  }

  async function load() {
    const wordsText = await fetchText('data/words.json');
    let words = [];
    try { words = JSON.parse(wordsText); } catch (e) { words = []; }
    dict = new Map(words.map((w) => [normalize(w.w), w]));

    const localOrder = store.get(LS.order, '');
    const orderText = localOrder || await fetchText('data/order.txt');
    buildEntries(orderText);

    const saved = store.get(LS.pos, 0);
    index = Math.min(Math.max(0, saved), Math.max(0, entries.length - 1));
    $('order-text').value = localOrder || orderText;
    updateBanner();
    updateStats();
    render();
  }

  // ---------- render ----------

  function updateBanner() {
    const b = $('banner');
    if (!entries.length) {
      b.textContent = '単語データを読み込めませんでした。GitHub Pages 上で開いているか確認してください。';
      b.hidden = false;
    } else if (!orderIsOfficial) {
      b.innerHTML = 'シス単の順番データが未登録のため、<b>アルファベット順（番号は仮）</b>で表示しています。⚙設定 から順番を登録できます。';
      b.hidden = false;
    } else {
      b.hidden = true;
    }
  }

  function updateStats() {
    const missing = entries.filter((e) => !e.entry).length;
    $('stats').textContent =
      `イメージ登録済みの単語: ${dict.size}語 / 表示中: ${entries.length}項目` +
      (orderIsOfficial ? ` / イメージ未登録: ${missing}項目` : '');
  }

  function render() {
    const item = entries[index];
    if (!item) return;
    const e = item.entry;
    revealedJa = false;
    revealedWord = false;

    $('c-no').textContent = orderIsOfficial ? `No. ${item.no}` : `#${item.no}（仮）`;
    $('c-word').textContent = item.label;
    $('c-pos').textContent = e ? e.pos : '';
    $('c-emoji').textContent = e ? e.em : '🖼️';
    $('c-img').textContent = e ? e.img : 'この単語のイメージはまだ登録されていません。画像検索や「自分のイメージ」を使ってください。';
    $('c-img').classList.toggle('missing', !e);
    $('c-search').href = 'https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(item.label);

    const memo = memos[item.label];
    $('c-memo').textContent = memo || '';
    $('c-memo').hidden = !memo;

    renderMeaning();
    renderWord();

    $('jump-no').value = item.no;
    $('total').textContent = `/ ${entries[entries.length - 1].no}`;
    $('prev').disabled = index === 0;
    $('next').disabled = index === entries.length - 1;
    store.set(LS.pos, index);
  }

  function renderMeaning() {
    const e = entries[index].entry;
    const btn = $('c-ja');
    const conceal = opts.hideJa && !revealedJa;
    btn.classList.toggle('concealed', conceal);
    btn.textContent = conceal ? 'タップして意味を表示' : (e ? e.ja : '—');
  }

  function renderWord() {
    $('c-word').classList.toggle('concealed', opts.hideWord && !revealedWord);
  }

  function go(i) {
    if (!entries.length) return;
    index = Math.min(Math.max(0, i), entries.length - 1);
    render();
  }

  function goToNo(no) {
    const i = entries.findIndex((e) => e.no >= no);
    go(i === -1 ? entries.length - 1 : i);
  }

  // ---------- list ----------

  function renderList() {
    const q = normalize($('search').value);
    const ol = $('list');
    const frag = document.createDocumentFragment();
    let currentLi = null;
    entries.forEach((item, i) => {
      const e = item.entry;
      if (q) {
        const hay = `${item.no} ${normalize(item.label)} ${e ? e.ja : ''}`;
        if (!hay.includes(q)) return;
      }
      const li = document.createElement('li');
      li.dataset.i = i;
      if (i === index) { li.className = 'current'; currentLi = li; }
      li.innerHTML = '<span class="l-no"></span><span class="l-em"></span><span class="l-w"></span>';
      li.children[0].textContent = item.no;
      li.children[1].textContent = e ? [...e.em][0] : '·';
      li.children[2].textContent = item.label;
      const ja = document.createElement('span');
      ja.className = 'l-ja';
      ja.textContent = e ? e.ja : 'イメージ未登録';
      li.children[2].appendChild(ja);
      frag.appendChild(li);
    });
    ol.replaceChildren(frag);
    if (currentLi && !q) currentLi.scrollIntoView({ block: 'center' });
  }

  // ---------- views ----------

  function show(view) {
    $('view-card').hidden = view !== 'card';
    $('view-list').hidden = view !== 'list';
    $('view-settings').hidden = view !== 'settings';
    $('pager').hidden = view !== 'card';
    $('btn-list').classList.toggle('active', view === 'list');
    $('btn-settings').classList.toggle('active', view === 'settings');
    if (view === 'list') renderList();
  }

  function current() {
    return $('view-list').hidden ? ($('view-settings').hidden ? 'card' : 'settings') : 'list';
  }

  // ---------- events ----------

  $('btn-list').addEventListener('click', () => show(current() === 'list' ? 'card' : 'list'));
  $('btn-settings').addEventListener('click', () => show(current() === 'settings' ? 'card' : 'settings'));
  $('prev').addEventListener('click', () => go(index - 1));
  $('next').addEventListener('click', () => go(index + 1));
  $('jump').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const n = parseInt($('jump-no').value, 10);
    if (!isNaN(n)) goToNo(n);
    $('jump-no').blur();
  });
  $('jump-no').addEventListener('change', () => {
    const n = parseInt($('jump-no').value, 10);
    if (!isNaN(n)) goToNo(n);
  });

  $('c-ja').addEventListener('click', () => { revealedJa = !revealedJa; renderMeaning(); });
  $('c-word').addEventListener('click', () => { revealedWord = !revealedWord; renderWord(); });

  $('list').addEventListener('click', (ev) => {
    const li = ev.target.closest('li');
    if (!li) return;
    go(parseInt(li.dataset.i, 10));
    show('card');
  });
  $('search').addEventListener('input', renderList);

  document.addEventListener('keydown', (ev) => {
    if (current() !== 'card' || ev.target.matches('input, textarea')) return;
    if (ev.key === 'ArrowRight') go(index + 1);
    else if (ev.key === 'ArrowLeft') go(index - 1);
    else if (ev.key === ' ') { ev.preventDefault(); revealedJa = !revealedJa; renderMeaning(); }
  });

  // swipe left/right on the card
  let touchX = null, touchY = null;
  const cardView = $('view-card');
  cardView.addEventListener('touchstart', (ev) => {
    touchX = ev.touches[0].clientX;
    touchY = ev.touches[0].clientY;
  }, { passive: true });
  cardView.addEventListener('touchend', (ev) => {
    if (touchX === null) return;
    const dx = ev.changedTouches[0].clientX - touchX;
    const dy = ev.changedTouches[0].clientY - touchY;
    touchX = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(index + (dx < 0 ? 1 : -1));
  });

  // options
  $('opt-hide-ja').checked = opts.hideJa;
  $('opt-hide-word').checked = opts.hideWord;
  $('opt-hide-ja').addEventListener('change', (ev) => { opts.hideJa = ev.target.checked; store.set(LS.opts, opts); renderMeaning(); });
  $('opt-hide-word').addEventListener('change', (ev) => { opts.hideWord = ev.target.checked; store.set(LS.opts, opts); renderWord(); });

  // order editor
  $('order-save').addEventListener('click', () => {
    const text = $('order-text').value;
    const parsed = parseOrder(text);
    if (!parsed.length) {
      $('order-status').textContent = '「番号 単語」の行が見つかりませんでした。';
      return;
    }
    store.set(LS.order, text);
    buildEntries(text);
    index = 0;
    updateBanner();
    updateStats();
    render();
    const missing = entries.filter((e) => !e.entry).map((e) => e.label);
    $('order-status').textContent = `${parsed.length}項目を保存しました。` +
      (missing.length ? ` イメージ未登録: ${missing.length}項目（${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ' …' : ''}）` : '');
  });
  $('order-reset').addEventListener('click', async () => {
    store.remove(LS.order);
    const text = await fetchText('data/order.txt');
    $('order-text').value = text;
    buildEntries(text);
    index = 0;
    updateBanner();
    updateStats();
    render();
    $('order-status').textContent = '端末の保存を消しました。';
  });

  // memo
  $('c-memo-btn').addEventListener('click', () => {
    const item = entries[index];
    $('memo-title').textContent = item.label;
    $('memo-text').value = memos[item.label] || '';
    $('memo-dialog').returnValue = '';
    $('memo-dialog').showModal();
  });
  $('memo-dialog').addEventListener('close', () => {
    if ($('memo-dialog').returnValue !== 'save') return;
    const item = entries[index];
    const text = $('memo-text').value.trim();
    if (text) memos[item.label] = text; else delete memos[item.label];
    store.set(LS.memo, memos);
    render();
  });

  load();
})();
