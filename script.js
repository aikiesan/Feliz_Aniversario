(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const css = getComputedStyle(document.documentElement);
  const cor = (nome) => css.getPropertyValue(nome).trim();

  const planta = $("#planta");
  const camada = $("#bolhas");
  const area = $("#area-bolhas");
  const titulo = $("#titulo");
  const instrucao = $("#instrucao");
  const leitura = $("#leitura");
  const btnAcao = $("#btn-acao");
  const btnSom = $("#btn-som");
  const contador = $("#contador");
  const ponteiro = $("#ponteiro");
  const rotulo = $("#rotulo");

  const amostras = [...document.querySelectorAll("#amostras .amostra")];
  const total = amostras.length;
  const coletadas = new Set();
  const naTela = new Set();
  let fase = "parado"; // parado → coleta → cheio → aceso → assoprado
  let somLigado = true;

  // ---------------- som sintetizado ----------------
  let ctx = null;
  const audio = () => {
    if (!somLigado) return null;
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  };

  function pop() {
    const a = audio(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(700 + Math.random() * 300, a.currentTime);
    o.frequency.exponentialRampToValueAtTime(160, a.currentTime + 0.12);
    g.gain.setValueAtTime(0.22, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.14);
    o.connect(g).connect(a.destination);
    o.start(); o.stop(a.currentTime + 0.15);
  }

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

  // acorde de quinta distorcido, o momento rock 'n' roll
  function acorde(raiz, inicio, dur) {
    const a = audio(); if (!a) return;
    const dist = a.createWaveShaper();
    const n = 2048, curva = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; curva[i] = Math.tanh(x * 6); }
    dist.curve = curva;
    const g = a.createGain();
    const t = a.currentTime + inicio;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2400;
    dist.connect(lp).connect(g).connect(a.destination);
    [1, 1.5, 2].forEach((m) => {
      const o = a.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = raiz * m;
      o.detune.value = (Math.random() - 0.5) * 12;
      o.connect(dist);
      o.start(t); o.stop(t + dur + 0.05);
    });
  }
  function fanfarra() {
    const E = 82.41, G = 98.0, A = 110.0;
    acorde(E, 0, 0.25); acorde(E, 0.28, 0.25); acorde(G, 0.56, 0.3); acorde(A, 0.9, 0.35); acorde(E, 1.3, 1.6);
  }

  btnSom.addEventListener("click", () => {
    somLigado = !somLigado;
    btnSom.setAttribute("aria-pressed", String(somLigado));
    btnSom.textContent = somLigado ? "Som ligado" : "Som desligado";
  });

  // ---------------- leitura do gasômetro ----------------
  function atualizar() {
    contador.textContent = `${coletadas.size} de ${total}`;
    const frac = coletadas.size / total;
    ponteiro.style.transform = `rotate(${-60 + frac * 120}deg)`;
    if (fase === "coleta") leitura.textContent = `Gasômetro em ${Math.round(frac * 100)}%`;
  }

  // ---------------- bolhas ----------------
  function geometria() {
    const p = planta.getBoundingClientRect();
    const r = area.getBoundingClientRect();
    return { x: r.left - p.left, y: r.top - p.top, w: r.width, h: r.height, escala: r.width / 176 };
  }

  function criarBolha(i) {
    const g = geometria();
    const deco = i === null;
    const tam = deco ? (6 + Math.random() * 8) * g.escala : Math.max(44, 46 * g.escala);
    const b = document.createElement(deco ? "span" : "button");
    b.className = deco ? "bolha deco" : "bolha";
    b.style.width = b.style.height = `${tam}px`;
    let x = g.x + Math.random() * (g.w - tam);
    if (!deco && g.w / 2 > tam) {
      lado = 1 - lado; // alterna os lados para as bolhas não se sobreporem
      x = g.x + lado * (g.w / 2) + Math.random() * (g.w / 2 - tam);
    }
    b.style.left = `${x}px`;

    if (!deco) {
      b.type = "button";
      b.textContent = "CH₄";
      b.setAttribute("aria-label", `Bolha de metano: abrir a amostra ${amostras[i].querySelector(".amostra-tag").textContent}`);
      naTela.add(i);
      b.addEventListener("click", () => estourar(b, i));
    }

    if (reduzido) {
      if (deco) return;
      b.classList.add("parada");
      b.style.top = `${g.y + Math.random() * (g.h - tam)}px`;
    } else {
      b.style.top = `${g.y + g.h - tam}px`;
      // sobe do fundo do substrato até a cúpula
      const sobe = deco ? -(g.h * 0.55) : -(g.h + 70 * g.escala);
      b.style.setProperty("--sobe", `${sobe}px`);
      b.style.setProperty("--dur", `${deco ? 2.5 + Math.random() * 2 : 7 + Math.random() * 3}s`);
      b.addEventListener("animationend", (e) => {
        if (e.animationName !== "subir" && e.animationName !== "subir-curto") return;
        if (!deco) naTela.delete(i);
        b.remove();
      });
    }
    camada.appendChild(b);
  }

  let timerMsg = null, timerDeco = null;
  let lado = 0;
  function soltar() {
    if (fase !== "coleta") return;
    const livres = amostras.map((_, i) => i).filter((i) => !coletadas.has(i) && !naTela.has(i));
    if (!livres.length) return;
    if (reduzido) { if (naTela.size < 2) criarBolha(livres[0]); return; }
    if (naTela.size < 2) criarBolha(livres[Math.floor(Math.random() * livres.length)]);
  }

  function ligar() {
    fase = "coleta";
    btnAcao.disabled = true;
    btnAcao.textContent = "Reator ligado";
    instrucao.textContent = "Toque nas bolhas de CH₄ para coletar cada amostra.";
    audio();
    atualizar();
    soltar();
    timerMsg = setInterval(soltar, reduzido ? 400 : 1600);
    if (!reduzido) timerDeco = setInterval(() => criarBolha(null), 380);
  }

  function estourar(b, i) {
    if (coletadas.has(i)) return;
    coletadas.add(i);
    naTela.delete(i);
    b.classList.add("estourou");
    b.addEventListener("animationend", () => b.remove(), { once: true });
    if (reduzido) b.remove();
    pop();
    const item = amostras[i];
    item.classList.add("coletada");
    atualizar();
    $("#rotulo-tag").textContent = item.querySelector(".amostra-tag").textContent;
    $("#rotulo-titulo").textContent = item.querySelector("h3").textContent;
    $("#rotulo-texto").textContent = item.querySelector("p:not(.amostra-tag)").textContent;
    rotulo.showModal();
  }

  rotulo.addEventListener("close", () => {
    if (fase === "coleta" && coletadas.size === total) cheio();
    else if (fase === "coleta" && reduzido) soltar();
  });

  // ---------------- fases finais ----------------
  function cheio() {
    fase = "cheio";
    clearInterval(timerMsg);
    leitura.textContent = "Gasômetro em 100%";
    instrucao.textContent = "Gasômetro cheio. Abra a válvula para acender a vela.";
    btnAcao.textContent = "Abrir a válvula V-102";
    btnAcao.disabled = false;
    btnAcao.focus();
  }

  function acender() {
    fase = "aceso";
    btnAcao.disabled = true;
    $("#valvula").classList.add("aberta");
    $("#fluxo").classList.add("ligado");
    sopro(1.2, 1800, 0.1);
    instrucao.textContent = "Biometano a caminho do queimador.";
    setTimeout(() => {
      sopro(0.35, 600, 0.45);
      $("#chama").classList.add("acesa");
      titulo.textContent = "Feliz aniversário, Renata!";
      instrucao.textContent = "Vela acesa com biometano. Faça um pedido antes de assoprar.";
      leitura.textContent = "";
      fanfarra();
      confete(200);
      const laudo = $("#laudo");
      laudo.classList.add("revelado");
      btnAcao.textContent = "Assoprar a vela";
      btnAcao.disabled = false;
      btnAcao.focus();
    }, reduzido ? 200 : 1400);
  }

  function assoprar() {
    fase = "assoprado";
    sopro(0.6, 400, 0.3);
    $("#chama").classList.remove("acesa");
    $("#fumaca").classList.add("ativa");
    $("#fluxo").classList.remove("ligado");
    $("#valvula").classList.remove("aberta");
    clearInterval(timerDeco);
    confete(280);
    instrucao.textContent = "Pedido registrado no caderno de laboratório. Que se realize com rendimento máximo.";
    btnAcao.textContent = "Ler o laudo final";
  }

  btnAcao.addEventListener("click", () => {
    if (fase === "parado") ligar();
    else if (fase === "cheio") acender();
    else if (fase === "aceso") assoprar();
    else if (fase === "assoprado") $("#laudo").scrollIntoView({ behavior: reduzido ? "auto" : "smooth", block: "center" });
  });

  // ---------------- confete ----------------
  const canvas = $("#confete");
  const c2d = canvas.getContext("2d");
  let pedacos = [], animando = false;
  const cores = ["--color-accent", "--color-gas", "--color-ink", "--color-flame-core", "--color-accent-deep"].map(cor);

  function redimensionar() {
    canvas.width = innerWidth * devicePixelRatio;
    canvas.height = innerHeight * devicePixelRatio;
    c2d.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }
  addEventListener("resize", redimensionar);
  redimensionar();

  function confete(n) {
    if (reduzido) return;
    const r = $("#chama").getBoundingClientRect();
    const ox = r.width ? r.left + r.width / 2 : innerWidth / 2;
    const oy = r.height ? r.top : innerHeight / 3;
    for (let i = 0; i < n; i++) {
      pedacos.push({
        x: ox, y: oy,
        vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 14 - 3,
        r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
        w: 5 + Math.random() * 5, h: 7 + Math.random() * 7,
        cor: cores[Math.floor(Math.random() * cores.length)], vida: 0
      });
    }
    if (!animando) { animando = true; requestAnimationFrame(quadro); }
  }

  function quadro() {
    c2d.clearRect(0, 0, innerWidth, innerHeight);
    pedacos = pedacos.filter((p) => p.y < innerHeight + 40 && p.vida < 500);
    for (const p of pedacos) {
      p.vy += 0.3; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.vida++;
      c2d.save(); c2d.translate(p.x, p.y); c2d.rotate(p.r);
      c2d.fillStyle = p.cor;
      c2d.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.cos(p.vida * 0.1));
      c2d.restore();
    }
    if (pedacos.length) requestAnimationFrame(quadro);
    else { animando = false; c2d.clearRect(0, 0, innerWidth, innerHeight); }
  }

  atualizar();
})();
