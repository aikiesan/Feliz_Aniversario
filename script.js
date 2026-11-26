(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const raiz = getComputedStyle(document.documentElement);
  const token = (n) => raiz.getPropertyValue(n).trim();
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const fmt = (n, d = 1) => n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const vibrar = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* sem vibração */ } };
  const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

  // ---------------- elementos ----------------
  const planta = $("#planta"), cena = $("#cena"), camada = $("#bolhas");
  const titulo = $("#titulo"), instrucao = $("#instrucao"), statusEl = $("#status");
  const btnAcao = $("#btn-acao"), btnSom = $("#btn-som"), btnAlimentar = $("#btn-alimentar");
  const botoesPasso = [...document.querySelectorAll(".btn-passo")];
  const contador = $("#contador"), ponteiro = $("#ponteiro"), rotulo = $("#rotulo");
  const tubosEl = $("#tubos");
  const amostras = [...document.querySelectorAll("#amostras .amostra")];
  const total = amostras.length;
  const caps = amostras.map((li) => li.style.getPropertyValue("--cap").trim());
  const capCor = (i) => token(caps[i].replace(/^var\((.+)\)$/, "$1"));

  // ---------------- estado ----------------
  const sim = { T: 24, alvo: 24, carga: 0, pH: 7.2, P: 0, taxa: 0 };
  let fase = "parado"; // parado → coleta → cheio → aceso → assoprado
  const coletadas = new Set();
  let somLigado = true;

  // ---------------- som sintetizado ----------------
  let ctx = null;
  const audio = () => {
    if (!somLigado) return null;
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  };
  function tom(f0, f1, dur, vol = 0.2, tipo = "sine") {
    const a = audio(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = tipo;
    o.frequency.setValueAtTime(f0, a.currentTime);
    o.frequency.exponentialRampToValueAtTime(f1, a.currentTime + dur);
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur + 0.02);
    o.connect(g).connect(a.destination);
    o.start(); o.stop(a.currentTime + dur + 0.05);
  }
  const pop = (i) => { tom(520 + i * 70, 1400 + i * 90, 0.07, 0.18); setTimeout(() => tom(900, 200, 0.1, 0.12), 40); };
  const glug = () => { tom(180, 90, 0.18, 0.22); setTimeout(() => tom(150, 70, 0.2, 0.18), 160); };
  function sopro(dur, freq, vol) {
    const a = audio(); if (!a) return;
    const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq;
    const g = a.createGain(); g.gain.value = vol;
    src.connect(f).connect(g).connect(a.destination);
    src.start();
  }
  function acorde(raizHz, inicio, dur) {
    const a = audio(); if (!a) return;
    const dist = a.createWaveShaper();
    const n = 2048, curva = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; curva[i] = Math.tanh(x * 6); }
    dist.curve = curva;
    const g = a.createGain(), t = a.currentTime + inicio;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2400;
    dist.connect(lp).connect(g).connect(a.destination);
    [1, 1.5, 2].forEach((m) => {
      const o = a.createOscillator();
      o.type = "sawtooth"; o.frequency.value = raizHz * m; o.detune.value = (Math.random() - 0.5) * 12;
      o.connect(dist); o.start(t); o.stop(t + dur + 0.05);
    });
  }
  const fanfarra = () => { const E = 82.41, G = 98, A = 110; acorde(E, 0, 0.25); acorde(E, 0.28, 0.25); acorde(G, 0.56, 0.3); acorde(A, 0.9, 0.35); acorde(E, 1.3, 1.6); };

  btnSom.addEventListener("click", () => {
    somLigado = !somLigado;
    btnSom.setAttribute("aria-pressed", String(somLigado));
    btnSom.textContent = somLigado ? "Som ligado" : "Som desligado";
  });

  // ---------------- tubos de ensaio (progresso) ----------------
  const tubos = amostras.map((_, i) => {
    const t = document.createElement("span");
    t.className = "tubo";
    t.style.setProperty("--cap", caps[i]);
    t.innerHTML = '<span class="tampa"></span><span class="vidro"><span class="liquido"></span></span>';
    tubosEl.appendChild(t);
    return t;
  });
  function ondaTubos() {
    if (reduzido) return;
    tubos.forEach((t, i) => t.animate(
      [{ transform: "translateY(0)" }, { transform: "translateY(-10px)" }, { transform: "translateY(0)" }],
      { duration: 520, delay: i * 70, easing: "ease-in-out" }
    ));
  }

  // ---------------- modelo do processo ----------------
  // temperatura: mesofílica 35 a 40 °C, termofílica 50 a 57 °C
  function fT(T) {
    if (T < 20) return 0;
    if (T < 30) return 0.04 * (T - 20);
    if (T < 35) return 0.4 + 0.12 * (T - 30);
    if (T <= 40) return 1;
    if (T < 45) return 1 - 0.14 * (T - 40);
    if (T < 50) return 0.3 + 0.12 * (T - 45);
    if (T <= 57) return 0.9;
    return Math.max(0.1, 0.9 - 0.2 * (T - 57));
  }
  // carga orgânica (kg SV/m³·d): ideal de 2 a 4,5
  function fC(c) {
    if (c < 0.4) return 0.05;
    if (c < 2) return 0.3 + 0.44 * (c - 0.4);
    if (c <= 4.5) return 1;
    return Math.max(0.4, 1 - 0.15 * (c - 4.5));
  }
  // pH: ideal de 6,8 a 7,5
  function fPH(p) {
    if (p >= 6.8) return 1;
    if (p >= 6.4) return 0.2 + 2 * (p - 6.4);
    return 0.03;
  }

  function passoSim(dt) {
    sim.T += (sim.alvo - sim.T) * (1 - Math.exp(-dt / 3.5));
    sim.carga *= Math.exp(-dt / 16);
    const alvoPH = 7.25 - Math.max(0, sim.carga - 4.5) * 0.45;
    sim.pH += (alvoPH - sim.pH) * (1 - Math.exp(-dt / 4));
    sim.pH = clamp(sim.pH, 5.8, 7.6);
    sim.taxa = fT(sim.T) * fC(sim.carga) * fPH(sim.pH);
    const alvoP = (coletadas.size / total) * 4.5;
    sim.P += (alvoP - sim.P) * (1 - Math.exp(-dt / 0.6));
  }

  // ---------------- leituras ----------------
  const marcas = { temp: $("#m-temp"), carga: $("#m-carga"), ph: $("#m-ph") };
  const medidas = { temp: marcas.temp.closest(".medida"), carga: marcas.carga.closest(".medida"), ph: marcas.ph.closest(".medida") };
  function marcar(el, frac) { el.style.setProperty("--pos", `${clamp(frac, 0, 1) * el.parentElement.clientWidth}px`); }

  let ultimoStatus = "";
  function dizer(html) {
    if (html === ultimoStatus) return;
    ultimoStatus = html;
    statusEl.innerHTML = html;
  }

  function diagnostico() {
    const T = Math.round(sim.T), prod = `<strong>Produção ${Math.round(sim.taxa * 100)}%.</strong> `;
    if (fase === "cheio") return `<strong>Gasômetro cheio, ${fmt(sim.P)} mbar.</strong> Abra a válvula para acender a vela.`;
    if (sim.pH < 6.6) return `${prod}Acidificação: os ácidos graxos voláteis acumularam e o pH caiu para ${fmt(sim.pH)}. Pare de alimentar e espere o reator se recuperar.`;
    if (T < 30) return `${prod}Reator frio, ${T} °C. As arqueias metanogênicas mesofílicas preferem de 35 a 40 °C: suba o aquecimento.`;
    if (T < 35) return `${prod}Esquentando. Falta pouco para a faixa mesofílica, de 35 a 40 °C.`;
    if (T > 57) return `${prod}Quente demais: acima de 57 °C até as termofílicas reclamam.`;
    if (T > 40 && T < 50) return `${prod}Entre as faixas mesofílica e termofílica a comunidade microbiana sofre. Volte para 35 a 40 °C ou suba para 50 a 57 °C.`;
    if (sim.carga < 1) return `${prod}Os microrganismos estão com fome: alimente o reator.`;
    if (sim.carga > 4.5) return `${prod}Carga orgânica alta. Mais comida agora pode azedar o reator.`;
    if (T >= 50) return `${prod}Regime termofílico: produz bem, mas gasta mais energia para aquecer. Estoure as bolhas de CH₄.`;
    return `${prod}Processo estável, metanogênese a todo vapor. Estoure as bolhas de CH₄.`;
  }

  let acumLeitura = 0;
  function atualizarLeituras(dt, forcar = false) {
    acumLeitura += dt;
    if (!forcar && acumLeitura < 0.15) return;
    acumLeitura = 0;
    $("#v-temp").textContent = Math.round(sim.T);
    $("#v-alvo").textContent = sim.alvo;
    $("#v-carga").textContent = fmt(sim.carga);
    $("#v-ph").textContent = fmt(sim.pH);
    $("#t-temp").textContent = `${Math.round(sim.T)} °C`;
    $("#t-ph").textContent = `pH ${fmt(sim.pH)}`;
    $("#t-pressao").textContent = `${fmt(sim.P)} mbar`;
    marcar(marcas.temp, (sim.T - 20) / 40);
    marcar(marcas.carga, sim.carga / 8);
    marcar(marcas.ph, (sim.pH - 5.8) / 2);
    medidas.temp.classList.toggle("alerta", fase !== "parado" && fT(sim.T) < 0.6);
    medidas.carga.classList.toggle("alerta", fase !== "parado" && (sim.carga > 4.5 || sim.carga < 1));
    medidas.ph.classList.toggle("alerta", sim.pH < 6.8);
    ponteiro.style.transform = `rotate(${-60 + (sim.P / 4.5) * 120}deg)`;
    const calor = clamp((sim.T - 24) / 16, 0, 1);
    $("#serpentina").style.setProperty("--cor-aquec", `color-mix(in oklab, var(--color-accent) ${Math.round(calor * 100)}%, var(--color-cold))`);
    $("#acidez").style.setProperty("--acidez", clamp((7.0 - sim.pH) / 0.8, 0, 0.6).toFixed(2));
    $("#nivel").style.setProperty("--nivel", `${(-sim.carga * 3).toFixed(1)}px`);
    contador.textContent = `${coletadas.size} de ${total}`;
    if (fase === "coleta" || fase === "cheio") dizer(diagnostico());
  }

  // ---------------- controles ----------------
  function habilitarControles(on) {
    btnAlimentar.disabled = !on;
    botoesPasso.forEach((b) => (b.disabled = !on));
  }
  habilitarControles(false);

  botoesPasso.forEach((b) => b.addEventListener("click", () => {
    sim.alvo = clamp(sim.alvo + Number(b.dataset.passo), 20, 60);
    tom(sim.alvo * 14, sim.alvo * 15, 0.05, 0.08, "triangle");
    vibrar(6);
    atualizarLeituras(0, true);
  }));

  const substratos = ["+ vinhaça", "+ torta de filtro", "+ dejetos suínos", "+ resíduo de alimentos", "+ glicerina", "+ farelo de bolo"];
  let nSub = 0;
  btnAlimentar.addEventListener("click", () => {
    if (fase !== "coleta") return;
    sim.carga = Math.min(9, sim.carga + 1.1);
    glug(); vibrar(10);
    if (!reduzido) {
      $("#bomba").animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], { duration: 700, easing: EASE });
      const f = $("#fluxo-alim"); f.classList.add("ligado");
      clearTimeout(f._t); f._t = setTimeout(() => f.classList.remove("ligado"), 1300);
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", "62"); t.setAttribute("y", "168"); t.setAttribute("class", "rotulo-alim");
      t.textContent = substratos[nSub++ % substratos.length];
      $("#rotulos-alim").appendChild(t);
      t.animate([{ transform: "translateY(6px)", opacity: 0 }, { transform: "translateY(0)", opacity: 1, offset: 0.2 }, { transform: "translateY(-22px)", opacity: 0 }],
        { duration: 1600, easing: "ease-out" }).onfinish = () => t.remove();
    }
    atualizarLeituras(0, true);
  });

  // ---------------- geometria ----------------
  let G = null;
  function medir() {
    const p = planta.getBoundingClientRect(), s = cena.getBoundingClientRect();
    G = { ox: s.left - p.left, oy: s.top - p.top, k: s.width / 640 };
  }
  addEventListener("resize", () => { medir(); atualizarLeituras(0, true); redimensionarConfete(); });

  // ---------------- bolhas (física em requestAnimationFrame) ----------------
  const bolhas = [];
  let lado = 0, acumMsg = 0.7, acumDeco = 0;

  function livres() { return amostras.map((_, i) => i).filter((i) => !coletadas.has(i) && !bolhas.some((b) => b.i === i)); }

  function criarBolha(i) {
    const deco = i === null;
    const rpx = deco ? (3 + Math.random() * 4) * G.k : Math.max(22, 23 * G.k);
    const r = rpx / G.k; // em unidades do desenho
    const el = document.createElement(deco ? "span" : "button");
    el.className = deco ? "bolha deco" : "bolha";
    el.style.width = el.style.height = `${rpx * 2}px`;
    let x;
    if (deco) x = 74 + r + Math.random() * (172 - 2 * r);
    else { lado = 1 - lado; x = 74 + r + lado * 88 + Math.random() * Math.max(0, 88 - 2 * r); }
    const b = { el, i, deco, r, x0: x, y: 392 - r, vy: deco ? 40 + Math.random() * 30 : 24 + Math.random() * 6, idade: 0, fase: Math.random() * 6.28, sumindo: false };
    if (!deco) {
      el.type = "button";
      el.textContent = "CH₄";
      el.style.setProperty("--cap", caps[i]);
      el.setAttribute("aria-label", `Bolha de metano: abrir a amostra ${amostras[i].querySelector(".amostra-tag").textContent.trim()}`);
      el.addEventListener("pointerdown", (e) => { e.preventDefault(); estourar(b); });
      el.addEventListener("click", (e) => { if (e.detail === 0) estourar(b); });
      if (reduzido) { b.y = 160 + Math.random() * 60; b.vy = 0; }
    }
    camada.appendChild(el);
    bolhas.push(b);
    desenharBolha(b);
  }

  function desenharBolha(b) {
    const topo = b.deco ? 262 - sim.carga * 3 + b.r : 152 + b.r;
    const ondula = reduzido ? 0 : Math.sin(b.idade * 1.7 + b.fase) * (b.deco ? 2 : 6);
    const x = b.x0 + ondula, y = b.y;
    const cresce = reduzido ? 1 : 1 - Math.pow(1 - Math.min(1, b.idade / 0.45), 3);
    const sq = reduzido ? 0 : Math.sin(b.idade * 5 + b.fase) * 0.05;
    const fadeTopo = clamp((y - topo) / 18, 0, 1);
    const px = G.ox + x * G.k, py = G.oy + y * G.k, rpx = b.r * G.k;
    b.el.style.transform = `translate3d(${(px - rpx).toFixed(1)}px, ${(py - rpx).toFixed(1)}px, 0) scale(${(cresce * (1 + sq)).toFixed(3)}, ${(cresce * (1 - sq)).toFixed(3)})`;
    b.el.style.opacity = (reduzido ? 1 : Math.min(1, b.idade / 0.25) * fadeTopo).toFixed(3);
    return !reduzido && y <= topo;
  }

  function passoBolhas(dt) {
    if (fase === "coleta") {
      const t = sim.taxa;
      if (t > 0.2) acumMsg += (dt * t) / 1.6;
      if (acumMsg >= 1) {
        const l = livres();
        const naTela = bolhas.filter((b) => !b.deco).length;
        if (l.length && naTela < (reduzido ? 1 : 2)) { criarBolha(l[Math.floor(Math.random() * l.length)]); acumMsg = 0; }
      }
      if (!reduzido) { acumDeco += dt * (0.4 + t * 4); while (acumDeco >= 1) { acumDeco -= 1; criarBolha(null); } }
    }
    for (let k = bolhas.length - 1; k >= 0; k--) {
      const b = bolhas[k];
      b.idade += dt;
      b.y -= b.vy * dt;
      if (desenharBolha(b)) { b.el.remove(); bolhas.splice(k, 1); }
    }
  }

  function estourar(b) {
    if (b.sumindo || fase !== "coleta" || rotulo.open) return;
    b.sumindo = true;
    const k = bolhas.indexOf(b); if (k >= 0) bolhas.splice(k, 1);
    const i = b.i, cor = caps[i];
    const cx = G.ox + (b.x0 + (reduzido ? 0 : Math.sin(b.idade * 1.7 + b.fase) * 6)) * G.k, cy = G.oy + b.y * G.k;
    pop(coletadas.size); vibrar(14);

    if (reduzido) b.el.remove();
    else {
      b.el.animate([{ transform: b.el.style.transform, opacity: 1 }, { transform: `${b.el.style.transform} scale(1.35)`, opacity: 0 }], { duration: 160, easing: "ease-out", fill: "forwards" }).onfinish = () => b.el.remove();
      const e = document.createElement("div");
      e.className = "estouro";
      e.style.setProperty("--cap", cor);
      e.style.transform = `translate(${cx}px, ${cy}px)`;
      const anel = document.createElement("span"); anel.className = "anel"; e.appendChild(anel);
      anel.animate([{ transform: "scale(0.5)", opacity: 1 }, { transform: "scale(2.1)", opacity: 0 }], { duration: 420, easing: EASE, fill: "forwards" });
      for (let n = 0; n < 10; n++) {
        const g = document.createElement("span"); g.className = "gota"; e.appendChild(g);
        const ang = (n / 10) * Math.PI * 2 + Math.random() * 0.4, d = 36 + Math.random() * 26;
        g.animate([{ transform: "translate(0,0) scale(1)" }, { transform: `translate(${Math.cos(ang) * d}px, ${Math.sin(ang) * d}px) scale(0)` }],
          { duration: 520 + Math.random() * 160, easing: EASE, fill: "forwards" });
      }
      const et = document.createElement("span"); et.className = "etiqueta-voo";
      et.textContent = amostras[i].querySelector(".amostra-tag").textContent.trim();
      e.appendChild(et);
      et.animate([{ transform: "translateY(0) scale(0.6)", opacity: 0 }, { transform: "translateY(-30px) scale(1.1)", opacity: 1, offset: 0.35 }, { transform: "translateY(-56px) scale(1)", opacity: 0 }],
        { duration: 950, easing: "ease-out", fill: "forwards" }).onfinish = () => e.remove();
      planta.appendChild(e);
    }

    coletadas.add(i);
    amostras[i].classList.add("coletada");
    tubos[i].classList.add("cheio");
    if (!reduzido) tubos[i].animate([{ transform: "scale(1)" }, { transform: "scale(1.25)" }, { transform: "scale(1)" }], { duration: 420, easing: EASE });
    atualizarLeituras(0, true);
    setTimeout(() => abrirRotulo(i), reduzido ? 0 : 380);
  }

  // ---------------- rótulo (diálogo / gaveta) ----------------
  const ehCelular = () => window.matchMedia("(max-width: 40rem)").matches;
  let fechando = false;

  function abrirRotulo(i) {
    const li = amostras[i];
    rotulo.style.setProperty("--cap", caps[i]);
    $("#rotulo-tag").textContent = li.querySelector(".amostra-tag").textContent.trim();
    $("#rotulo-titulo").textContent = li.querySelector("h3").textContent;
    $("#rotulo-texto").textContent = li.querySelector("p:not(.amostra-tag)").textContent;
    rotulo.style.transform = "";
    rotulo.showModal();
    $("#rotulo-guardar").focus({ preventScroll: true });
    if (reduzido) return;
    const quadros = ehCelular()
      ? [{ transform: "translateY(100%)" }, { transform: "translateY(0)" }]
      : [{ transform: "translateY(16px) scale(0.94)", opacity: 0 }, { transform: "translateY(0) scale(1)", opacity: 1 }];
    rotulo.animate(quadros, { duration: 460, easing: EASE });
    try { rotulo.animate({ opacity: [0, 1] }, { duration: 300, pseudoElement: "::backdrop" }); } catch (e) { /* sem suporte */ }
    rotulo.querySelector(".amostra-tag").animate(
      [{ transform: "rotate(-10deg) scale(1.4)", opacity: 0 }, { transform: "rotate(2deg) scale(0.96)", opacity: 1, offset: 0.7 }, { transform: "rotate(0) scale(1)" }],
      { duration: 520, delay: 140, easing: "ease-out", fill: "backwards" }
    );
  }

  function fecharRotulo(arrasto = 0) {
    if (fechando || !rotulo.open) return;
    fechando = true;
    const fim = () => { rotulo.close(); rotulo.style.transform = ""; fechando = false; aposFechar(); };
    if (reduzido) return fim();
    const quadros = ehCelular()
      ? [{ transform: `translateY(${arrasto}px)` }, { transform: "translateY(100%)" }]
      : [{ transform: "scale(1)", opacity: 1 }, { transform: "translateY(10px) scale(0.96)", opacity: 0 }];
    try { rotulo.animate({ opacity: [1, 0] }, { duration: 260, pseudoElement: "::backdrop", fill: "forwards" }); } catch (e) { /* sem suporte */ }
    rotulo.animate(quadros, { duration: 280, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" }).onfinish = fim;
  }

  function aposFechar() {
    rotulo.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    if (fase === "coleta" && coletadas.size === total) cheio();
  }

  $("#rotulo-guardar").addEventListener("click", () => fecharRotulo());
  rotulo.addEventListener("cancel", (e) => { e.preventDefault(); fecharRotulo(); });
  rotulo.addEventListener("click", (e) => {
    if (e.target !== rotulo) return;
    const r = rotulo.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) fecharRotulo();
  });
  // arrastar a gaveta para baixo para guardar
  let y0 = null, dy = 0;
  rotulo.addEventListener("pointerdown", (e) => { if (!ehCelular() || e.target.closest("button")) return; y0 = e.clientY; dy = 0; rotulo.setPointerCapture(e.pointerId); });
  rotulo.addEventListener("pointermove", (e) => { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); rotulo.style.transform = `translateY(${dy}px)`; });
  const soltar = () => {
    if (y0 === null) return;
    y0 = null;
    if (dy > 80) fecharRotulo(dy);
    else if (dy > 0) rotulo.animate([{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }], { duration: 260, easing: EASE }).onfinish = () => (rotulo.style.transform = "");
  };
  rotulo.addEventListener("pointerup", soltar);
  rotulo.addEventListener("pointercancel", soltar);

  // ---------------- título que comemora ----------------
  function trocarTitulo(texto) {
    titulo.textContent = "";
    texto.split(" ").forEach((p, n, arr) => {
      const s = document.createElement("span");
      s.className = "palavra"; s.textContent = p;
      titulo.appendChild(s);
      if (n < arr.length - 1) titulo.appendChild(document.createTextNode(" "));
      if (!reduzido) s.animate([{ transform: "translateY(0.6em) rotate(4deg)", opacity: 0 }, { transform: "translateY(0) rotate(0)", opacity: 1 }],
        { duration: 600, delay: n * 90, easing: "cubic-bezier(0.34, 1.4, 0.64, 1)", fill: "backwards" });
    });
  }

  // ---------------- fases ----------------
  function ligar() {
    fase = "coleta";
    btnAcao.hidden = true;
    habilitarControles(true);
    instrucao.textContent = "Aqueça, alimente e mantenha o pH. Cada bolha de CH₄ traz uma amostra.";
    medir();
    atualizarLeituras(0, true);
  }

  function cheio() {
    fase = "cheio";
    habilitarControles(false);
    bolhas.forEach((b) => b.el.remove());
    bolhas.length = 0;
    atualizarLeituras(0, true);
    btnAcao.textContent = "Abrir a válvula V-102";
    btnAcao.hidden = false;
    btnAcao.focus({ preventScroll: true });
    ondaTubos();
    vibrar([10, 40, 10]);
  }

  function acender() {
    fase = "aceso";
    btnAcao.disabled = true;
    $("#valvula").classList.add("aberta");
    $("#fluxo").classList.add("ligado");
    sopro(1.2, 1800, 0.1);
    dizer("Biometano a caminho do queimador.");
    setTimeout(() => {
      sopro(0.35, 600, 0.45);
      $("#chama").classList.add("acesa");
      if (!reduzido) $("#chama-corpo").animate([{ transform: "scale(0.1)" }, { transform: "scale(1.3)", offset: 0.55 }, { transform: "scale(1)" }], { duration: 700, easing: "ease-out" });
      trocarTitulo("Feliz aniversário, Renata!");
      instrucao.textContent = "Vela acesa com biometano. Faça um pedido e toque na chama para assoprar.";
      if (ehCelular()) $(".heroi").scrollIntoView({ behavior: reduzido ? "auto" : "smooth", block: "start" });
      dizer("Combustão estável. Chama azul na base, como manda o figurino.");
      fanfarra(); vibrar([20, 60, 20, 60, 40]);
      confeteDe("chama", 160); confeteDe("cantos", 140);
      ondaTubos();
      $("#laudo").classList.add("revelado");
      btnAcao.textContent = "Assoprar a vela";
      btnAcao.disabled = false;
      btnAcao.focus({ preventScroll: true });
    }, reduzido ? 200 : 1400);
  }

  function assoprar() {
    fase = "assoprado";
    sopro(0.6, 400, 0.3); vibrar(30);
    $("#chama").classList.remove("acesa");
    $("#fumaca").classList.add("ativa");
    $("#fluxo").classList.remove("ligado");
    $("#valvula").classList.remove("aberta");
    confeteDe("cantos", 220);
    ondaTubos();
    instrucao.textContent = "Pedido registrado no caderno de laboratório. Que se realize com rendimento máximo.";
    dizer("Reator em repouso. Bom trabalho, operadora.");
    btnAcao.textContent = "Ler o laudo final";
  }

  $("#chama").addEventListener("click", () => { if (fase === "aceso") assoprar(); });

  btnAcao.addEventListener("click", () => {
    if (fase === "cheio") acender();
    else if (fase === "aceso") assoprar();
    else if (fase === "assoprado") $("#laudo").scrollIntoView({ behavior: reduzido ? "auto" : "smooth", block: "center" });
  });

  // ---------------- confete ----------------
  const canvas = $("#confete"), c2d = canvas.getContext("2d");
  let pedacos = [];
  const coresConfete = () => caps.map((_, i) => capCor(i)).concat([token("--color-accent"), token("--color-ink")]);
  function redimensionarConfete() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
    c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  redimensionarConfete();

  function confeteDe(origem, n) {
    if (reduzido) return;
    const cores = coresConfete();
    const novo = (x, y, ang, vel) => ({
      x, y, vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel,
      rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 10,
      tilt: Math.random() * 6.28, vt: 6 + Math.random() * 8,
      w: 6 + Math.random() * 6, h: 9 + Math.random() * 8,
      redondo: Math.random() < 0.25, cor: cores[Math.floor(Math.random() * cores.length)], vida: 0
    });
    if (origem === "chama") {
      const r = $("#chama").getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      for (let k = 0; k < n; k++) pedacos.push(novo(x, y, -Math.PI / 2 + (Math.random() - 0.5) * 2.4, 300 + Math.random() * 500));
    } else {
      for (let k = 0; k < n; k++) {
        const esq = k % 2 === 0;
        pedacos.push(novo(esq ? -10 : innerWidth + 10, innerHeight * 0.85, esq ? -1.05 - Math.random() * 0.4 : -Math.PI + 1.05 + Math.random() * 0.4, 600 + Math.random() * 520));
      }
    }
  }

  function passoConfete(dt) {
    if (!pedacos.length) return;
    c2d.clearRect(0, 0, innerWidth, innerHeight);
    pedacos = pedacos.filter((p) => p.y < innerHeight + 40 && p.vida < 5);
    for (const p of pedacos) {
      p.vida += dt;
      p.vy += 900 * dt;
      const arrasto = Math.exp(-dt * 1.6);
      p.vx *= arrasto; p.vy = p.vy * arrasto + 120 * dt;
      p.tilt += p.vt * dt; p.rot += p.vr * dt;
      p.x += (p.vx + Math.sin(p.tilt) * 40) * dt; p.y += p.vy * dt;
      c2d.save(); c2d.translate(p.x, p.y); c2d.rotate(p.rot);
      c2d.globalAlpha = clamp(5 - p.vida, 0, 1);
      c2d.fillStyle = p.cor;
      const esc = Math.cos(p.tilt);
      if (p.redondo) { c2d.beginPath(); c2d.ellipse(0, 0, p.w / 2, Math.abs((p.w / 2) * esc) + 0.5, 0, 0, 6.29); c2d.fill(); }
      else c2d.fillRect(-p.w / 2, (-p.h / 2) * esc, p.w, p.h * esc);
      c2d.restore();
    }
    if (!pedacos.length) c2d.clearRect(0, 0, innerWidth, innerHeight);
  }

  // ---------------- laço principal ----------------
  let ultimo = performance.now();
  function quadro(t) {
    const dt = Math.min(0.05, Math.max(0, (t - ultimo) / 1000));
    ultimo = t;
    if (fase !== "parado") passoSim(dt);
    if (G) passoBolhas(dt);
    atualizarLeituras(dt);
    passoConfete(dt);
    requestAnimationFrame(quadro);
  }

  medir();
  ligar(); // o reator já começa em operação
  requestAnimationFrame(quadro);
})();
