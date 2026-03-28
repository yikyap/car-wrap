// === Haus of Wraps Chat Widget ===
// Guided conversation: service → vehicle → name → phone → email → done
(function() {
  const services = [
    { keywords: ['color change', 'full wrap', 'car wrap', 'vehicle wrap', 'wrap my car', 'wrap my'], service: 'Full Color Change Wrap', range: '$2,500–$6,000+' },
    { keywords: ['partial wrap', 'hood', 'roof', 'mirror', 'accent'], service: 'Partial Wrap', range: '$800–$2,000' },
    { keywords: ['ppf', 'paint protection', 'clear bra', 'xpel', 'suntek', 'protect'], service: 'Paint Protection Film', range: '$800–$6,500' },
    { keywords: ['tint', 'window tint', 'ceramic tint', 'window film'], service: 'Window Tint', range: '$200–$600' },
    { keywords: ['chrome delete', 'chrome', 'de-chrome', 'blackout'], service: 'Chrome Delete', range: '$400–$1,200' },
    { keywords: ['powder coat', 'powder', 'wheels', 'rims', 'caliper'], service: 'Powder Coating', range: '$400–$1,500' },
    { keywords: ['body kit', 'widebody', 'spoiler', 'diffuser', 'lip'], service: 'Body Kit', range: '$1,500–$8,000+' },
    { keywords: ['ceramic coat', 'ceramic pro', 'coating', 'nano'], service: 'Ceramic Coating', range: '$500–$2,000' },
    { keywords: ['commercial', 'fleet', 'business', 'company', 'van wrap', 'truck wrap'], service: 'Commercial / Fleet Wrap', range: '$1,500–$4,000 per vehicle' },
  ];

  function matchService(text) {
    const lower = text.toLowerCase();
    for (const svc of services) {
      if (svc.keywords.some(kw => lower.includes(kw))) return svc;
    }
    return null;
  }

  let isOpen = false;
  let step = 'greeting'; // greeting → service → vehicle → name → phone → email → done
  let messages = [];
  let lead = { service: '', vehicle: '', name: '', phone: '', email: '', matchedService: null };

  // Inject CSS
  const style = document.createElement('style');
  style.textContent = `
    .cw-fab { position:fixed; bottom:24px; right:16px; z-index:9999; display:flex; align-items:center; gap:8px; padding:0 20px; height:48px; border-radius:24px; background:var(--navy, #0B1526); color:#fff; border:1px solid rgba(255,255,255,0.1); box-shadow:0 4px 20px rgba(0,0,0,0.3); cursor:pointer; font-family:var(--font, 'Inter', sans-serif); font-size:14px; font-weight:600; transition:transform 0.15s; }
    .cw-fab:hover { transform:scale(1.05); }
    .cw-fab svg { width:20px; height:20px; fill:#fff; }
    .cw-panel { position:fixed; bottom:80px; right:16px; left:16px; z-index:9999; border-radius:16px; overflow:hidden; box-shadow:0 10px 40px rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.08); background:#fff; display:none; flex-direction:column; max-height:480px; }
    @media(min-width:640px) { .cw-panel { left:auto; width:340px; } }
    .cw-panel.open { display:flex; }
    .cw-header { display:flex; align-items:center; gap:10px; padding:14px 16px; background:var(--navy, #0B1526); }
    .cw-header-icon { width:32px; height:32px; border-radius:50%; background:rgba(255,255,255,0.15); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .cw-header-icon svg { width:16px; height:16px; fill:#fff; }
    .cw-header-text { flex:1; }
    .cw-header-title { font-size:14px; font-weight:600; color:#fff; }
    .cw-header-sub { font-size:11px; color:rgba(255,255,255,0.5); }
    .cw-close { background:none; border:none; color:rgba(255,255,255,0.5); font-size:20px; cursor:pointer; padding:0 4px; line-height:1; }
    .cw-close:hover { color:#fff; }
    .cw-messages { flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:10px; min-height:180px; max-height:320px; background:#fafafa; }
    .cw-msg { max-width:85%; padding:8px 12px; border-radius:12px; font-size:13px; line-height:1.5; word-wrap:break-word; }
    .cw-msg.bot { align-self:flex-start; background:#fff; border:1px solid #eee; color:#333; border-bottom-left-radius:4px; }
    .cw-msg.user { align-self:flex-end; background:var(--navy, #0B1526); color:#fff; border-bottom-right-radius:4px; }
    .cw-input-row { display:flex; gap:8px; padding:10px 12px; border-top:1px solid #eee; background:#fff; }
    .cw-input { flex:1; padding:8px 14px; font-size:13px; border:1px solid #e0e0e0; border-radius:20px; background:#fafafa; color:#111; font-family:inherit; outline:none; }
    .cw-input:focus { border-color:var(--gold, #D4A832); }
    .cw-input::placeholder { color:#aaa; }
    .cw-send { width:32px; height:32px; border-radius:50%; background:var(--navy, #0B1526); border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:opacity 0.15s; }
    .cw-send:hover { opacity:0.85; }
    .cw-send svg { width:14px; height:14px; fill:#fff; }
    .cw-quick { display:flex; flex-wrap:wrap; gap:6px; padding:8px 12px; border-top:1px solid #f0f0f0; background:#fff; }
    .cw-quick-btn { font-size:11px; padding:5px 10px; border-radius:12px; border:1px solid #e0e0e0; background:#fff; color:#666; cursor:pointer; font-family:inherit; transition:all 0.15s; }
    .cw-quick-btn:hover { border-color:#999; color:#333; }
  `;
  document.head.appendChild(style);

  // Chat icon SVG
  const chatSvg = '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  const closeSvg = '<svg viewBox="0 0 24 24" style="width:20px;height:20px"><line x1="18" y1="6" x2="6" y2="18" stroke="white" stroke-width="2.5"/><line x1="6" y1="6" x2="18" y2="18" stroke="white" stroke-width="2.5"/></svg>';
  const sendSvg = '<svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13" stroke="white" stroke-width="2" fill="none"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';

  // Create FAB
  const fab = document.createElement('button');
  fab.className = 'cw-fab';
  fab.innerHTML = chatSvg + '<span>Chat</span>';
  document.body.appendChild(fab);

  // Create panel
  const panel = document.createElement('div');
  panel.className = 'cw-panel';
  panel.innerHTML = `
    <div class="cw-header">
      <div class="cw-header-icon">${chatSvg}</div>
      <div class="cw-header-text">
        <div class="cw-header-title">Haus of Wraps</div>
        <div class="cw-header-sub">Get an instant estimate</div>
      </div>
      <button class="cw-close" id="cw-close">&times;</button>
    </div>
    <div class="cw-messages" id="cw-messages"></div>
    <div class="cw-quick" id="cw-quick"></div>
    <div class="cw-input-row">
      <input type="text" class="cw-input" id="cw-input" placeholder="Describe what you're looking for...">
      <button class="cw-send" id="cw-send">${sendSvg}</button>
    </div>
  `;
  document.body.appendChild(panel);

  const msgContainer = document.getElementById('cw-messages');
  const input = document.getElementById('cw-input');
  const sendBtn = document.getElementById('cw-send');
  const quickContainer = document.getElementById('cw-quick');

  function addMsg(text, from, delay) {
    if (delay) {
      setTimeout(() => addMsg(text, from), delay);
      return;
    }
    const div = document.createElement('div');
    div.className = 'cw-msg ' + from;
    div.textContent = text;
    msgContainer.appendChild(div);
    msgContainer.scrollTop = msgContainer.scrollHeight;
  }

  function setPlaceholder(text) {
    input.placeholder = text;
  }

  function showQuickButtons(buttons) {
    quickContainer.innerHTML = '';
    buttons.forEach(b => {
      const btn = document.createElement('button');
      btn.className = 'cw-quick-btn';
      btn.textContent = b.label;
      btn.onclick = () => {
        quickContainer.innerHTML = '';
        handleInput(b.value || b.label);
      };
      quickContainer.appendChild(btn);
    });
  }

  function initChat() {
    messages = [];
    step = 'service';
    lead = { service: '', vehicle: '', name: '', phone: '', email: '', matchedService: null };
    msgContainer.innerHTML = '';

    addMsg("Hey! 👋 What are you looking to get done? I can help with wraps, PPF, tint, chrome delete, powder coating, and more.", 'bot');
    setPlaceholder('Describe what you\'re looking for...');

    showQuickButtons([
      { label: 'Color Change Wrap' },
      { label: 'Window Tint' },
      { label: 'PPF' },
      { label: 'Chrome Delete' },
      { label: 'Powder Coating' },
    ]);
  }

  function handleInput(text) {
    if (!text.trim()) return;
    addMsg(text, 'user');
    input.value = '';

    if (step === 'service') {
      const match = matchService(text);
      lead.service = match ? match.service : text;
      lead.matchedService = match;

      if (match) {
        addMsg(match.service + ' typically runs ' + match.range + ' depending on the vehicle. What year/make/model do you have?', 'bot', 500);
      } else {
        addMsg("Got it! Let me connect you with the team for a custom quote. What year/make/model is your vehicle?", 'bot', 500);
      }
      step = 'vehicle';
      setPlaceholder('e.g. 2024 Tesla Model 3');
      quickContainer.innerHTML = '';

    } else if (step === 'vehicle') {
      lead.vehicle = text;
      addMsg("Nice ride! What's your name so we can put together your quote?", 'bot', 500);
      step = 'name';
      setPlaceholder('Your name...');

    } else if (step === 'name') {
      lead.name = text;
      addMsg('Thanks, ' + text.split(' ')[0] + '! Best phone number to reach you?', 'bot', 500);
      step = 'phone';
      setPlaceholder('Phone number...');

    } else if (step === 'phone') {
      lead.phone = text;
      addMsg('And your email so we can send details? (or type "skip")', 'bot', 500);
      step = 'email';
      setPlaceholder('Email address...');

    } else if (step === 'email') {
      lead.email = text.toLowerCase() === 'skip' ? '' : text;
      step = 'done';

      // Submit lead
      const urlParams = new URLSearchParams(window.location.search);
      fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: lead.name,
          phone: lead.phone,
          email: lead.email || null,
          service: lead.service || null,
          vehicle: lead.vehicle || null,
          message: null,
          source: 'chat_widget',
          referral: urlParams.get('ref') || null,
        }),
      }).catch(() => {});

      const firstName = lead.name.split(' ')[0];
      if (lead.matchedService) {
        addMsg("You're all set, " + firstName + "! " + lead.matchedService.service + " for your " + lead.vehicle + " typically runs " + lead.matchedService.range + ". A wrap specialist will reach out to " + lead.phone + " shortly with your exact quote.", 'bot', 500);
      } else {
        addMsg("You're all set, " + firstName + "! A wrap specialist will reach out to " + lead.phone + " shortly with a quote for your " + lead.vehicle + ". You can also call us anytime at (619) 512-9727.", 'bot', 500);
      }
      setPlaceholder('Type a message...');

    } else if (step === 'done') {
      addMsg("Our team has your info and will be in touch! You can also call us at (619) 512-9727 or stop by the shop.", 'bot', 500);
    }
  }

  // Events
  fab.onclick = () => {
    isOpen = !isOpen;
    panel.classList.toggle('open', isOpen);
    fab.innerHTML = isOpen ? closeSvg : (chatSvg + '<span>Chat</span>');
    if (isOpen && step === 'greeting') initChat();
    if (isOpen) setTimeout(() => input.focus(), 100);
  };

  document.getElementById('cw-close').onclick = () => {
    isOpen = false;
    panel.classList.remove('open');
    fab.innerHTML = chatSvg + '<span>Chat</span>';
  };

  sendBtn.onclick = () => handleInput(input.value.trim());
  input.onkeydown = (e) => { if (e.key === 'Enter') handleInput(input.value.trim()); };
})();
