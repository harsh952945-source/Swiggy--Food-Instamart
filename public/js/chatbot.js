(function () {
  const style = document.createElement('style');
  style.textContent = `
    #zc-bubble {
      position: fixed; bottom: 22px; right: 22px; z-index: 999;
      width: 58px; height: 58px; border-radius: 50%;
      background: var(--brand, #C62B2B); color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-size: 1.6rem; cursor: pointer; border: none;
      box-shadow: 0 10px 24px -8px rgba(46,15,41,0.5);
    }
    #zc-window {
      position: fixed; bottom: 90px; right: 22px; z-index: 999;
      width: 320px; max-width: calc(100vw - 40px); height: 420px;
      background: var(--bg-card, #fff); border-radius: 16px; overflow: hidden;
      box-shadow: 0 20px 50px -12px rgba(46,15,41,0.4);
      display: none; flex-direction: column;
      font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
      border: 1px solid var(--line, #F1DAD6);
    }
    #zc-window.open { display: flex; }
    #zc-head {
      background: var(--brand, #C62B2B); color: #fff; padding: 14px 16px;
      font-weight: 700; display: flex; justify-content: space-between; align-items: center;
    }
    #zc-close { cursor: pointer; background: none; border: none; color: #fff; font-size: 1.1rem; }
    #zc-body { flex: 1; overflow-y: auto; padding: 14px; background: var(--bg, #FFF7F5); }
    .zc-msg { margin-bottom: 10px; max-width: 85%; padding: 9px 13px; border-radius: 12px; font-size: 0.9rem; line-height: 1.4; }
    .zc-bot { background: #fff; border: 1px solid var(--line, #F1DAD6); color: #271420; border-bottom-left-radius: 2px; }
    .zc-user { background: var(--accent, #FFC13B); color: #4A0D0D; margin-left: auto; border-bottom-right-radius: 2px; font-weight: 600; }
    .zc-msg { white-space: pre-line; word-wrap: break-word; }
    .zc-links { display: flex; flex-direction: column; gap: 6px; margin: -4px 0 10px; max-width: 92%; }
    .zc-links a { background: var(--bg-card, #fff); border: 1.5px solid var(--brand, #C62B2B); color: var(--ink, #2A1212); border-radius: 10px; padding: 7px 11px; font-size: 0.85rem; font-weight: 600; text-decoration: none; }
    .zc-links a:hover { background: var(--brand, #C62B2B); color: #fff; }
    .zc-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
    .zc-chips button { background: var(--chip, #FFE9C2); color: var(--ink, #2A1212); border: 0; border-radius: 999px; padding: 6px 11px; font-size: 0.8rem; font-weight: 600; cursor: pointer; }
    .zc-chips button:hover { filter: brightness(0.95); }
    #zc-inputrow { display: flex; border-top: 1px solid var(--line, #F1DAD6); }
    #zc-input { flex: 1; border: none; background: var(--bg-card, #fff); color: var(--ink, #2A1212); padding: 12px 14px; font-size: 0.9rem; outline: none; }
    #zc-send { background: var(--accent, #FFC13B); border: none; padding: 0 18px; font-weight: 700; cursor: pointer; color: #4A0D0D; }
  `;
  document.head.appendChild(style);

  const bubble = document.createElement('button');
  bubble.id = 'zc-bubble';
  bubble.setAttribute('aria-label', 'Open chat assistant');
  bubble.textContent = '💬';
  document.body.appendChild(bubble);

  const win = document.createElement('div');
  win.id = 'zc-window';
  win.innerHTML = `
    <div id="zc-head"><span>ZappyEats Assistant</span><button id="zc-close" aria-label="Close chat">✕</button></div>
    <div id="zc-body"></div>
    <div id="zc-inputrow">
      <input id="zc-input" type="text" placeholder="Ask me anything...">
      <button id="zc-send">Send</button>
    </div>
  `;
  document.body.appendChild(win);

  const body = win.querySelector('#zc-body');
  const input = win.querySelector('#zc-input');

  function addMsg(text, who, items) {
    const div = document.createElement('div');
    div.className = 'zc-msg ' + (who === 'user' ? 'zc-user' : 'zc-bot');
    div.textContent = text;
    body.appendChild(div);
    if (items && items.length) {
      const box = document.createElement('div');
      box.className = 'zc-links';
      items.forEach(function (it) {
        const a = document.createElement('a');
        a.href = it.url; a.textContent = it.text;
        box.appendChild(a);
      });
      body.appendChild(box);
    }
    body.scrollTop = body.scrollHeight;
  }

  let greeted = false;
  bubble.addEventListener('click', () => {
    win.classList.toggle('open');
    if (win.classList.contains('open') && !greeted) {
      addMsg("Hi! I'm the ZappyEats assistant 👋 I can suggest dishes, track your order and share coupons.", 'bot');
      const chips = document.createElement('div');
      chips.className = 'zc-chips';
      ['Veg under ₹200', 'Recommend a pizza', 'My order status', 'Coupons'].forEach(function (c) {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = c;
        b.addEventListener('click', function () { chips.remove(); send(c); });
        chips.appendChild(b);
      });
      body.appendChild(chips);
      greeted = true;
    }
  });
  win.querySelector('#zc-close').addEventListener('click', () => win.classList.remove('open'));

  async function send(preset) {
    const text = (typeof preset === 'string' ? preset : input.value).trim();
    if (!text) return;
    addMsg(text, 'user');
    input.value = '';
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      const data = await res.json();
      addMsg(data.reply, 'bot', data.items);
    } catch (e) {
      addMsg("Sorry, something went wrong reaching the assistant.", 'bot');
    }
  }

  win.querySelector('#zc-send').addEventListener('click', function () { send(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
})();
