// =========================================================
// CONFIGURAÇÃO: troque pelos dados reais da Izadora
// =========================================================
const CONFIG = {
  whatsapp: "5522999999999", // DDI + DDD + número, só dígitos (placeholder)
  instagram: "https://instagram.com/", // link do perfil (placeholder)
};

const waLink = (msg) =>
  `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(msg)}`;

// Links de WhatsApp com mensagem pronta
document.querySelectorAll("[data-wa]").forEach((el) => {
  el.href = waLink(el.dataset.wa);
  el.target = "_blank";
  el.rel = "noopener";
});
document.querySelectorAll("[data-ig]").forEach((el) => {
  el.href = CONFIG.instagram;
  el.target = "_blank";
  el.rel = "noopener";
});

// Nav: fundo ao rolar + menu mobile
const nav = document.querySelector(".nav");
const toggle = document.querySelector(".nav__toggle");
const menu = document.getElementById("menu");

const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 24);
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });

const setMenu = (open) => {
  menu.hidden = !open;
  nav.classList.toggle("is-open", open);
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
};
toggle.addEventListener("click", () => setMenu(menu.hidden));
menu.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setMenu(false)));
document.addEventListener("keydown", (e) => e.key === "Escape" && setMenu(false));

// FAQ: um aberto por vez
const details = document.querySelectorAll(".faq details");
details.forEach((d) =>
  d.addEventListener("toggle", () => {
    if (d.open) details.forEach((o) => o !== d && (o.open = false));
  })
);

// Formulário → WhatsApp
const form = document.getElementById("form-orcamento");
const err = form.querySelector(".form__error");
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  if (!data.nome.trim()) {
    err.hidden = false;
    form.nome.focus();
    return;
  }
  err.hidden = true;
  const msg = [
    `Olá, Izadora! Me chamo ${data.nome.trim()}.`,
    data.empresa.trim() && `Empresa/evento: ${data.empresa.trim()}`,
    `Interesse: ${data.servico}`,
    `Cidade: ${data.cidade}`,
    "Vim pelo site e gostaria de um orçamento.",
  ]
    .filter(Boolean)
    .join("\n");
  window.open(waLink(msg), "_blank", "noopener");
});

// Animação de entrada
const targets = document.querySelectorAll(
  ".section__head, .value__list article, .plan, .audience__list li, .steps li, .about__photos, .about__copy, .faq__list details, .cta__card"
);
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add("is-in");
          io.unobserve(en.target);
        }
      }),
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );
  targets.forEach((t, i) => {
    t.classList.add("reveal");
    t.style.transitionDelay = `${(i % 4) * 70}ms`;
    io.observe(t);
  });
}

document.getElementById("ano").textContent = new Date().getFullYear();

// =========================================================
// Animações
// =========================================================
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Quebra texto em palavras (.w), mantendo <em> e outros elementos
let wordIndex = 0;
const splitWords = (node) => {
  [...node.childNodes].forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const frag = document.createDocumentFragment();
      child.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) {
          frag.appendChild(document.createTextNode(part));
        } else {
          const s = document.createElement("span");
          s.className = "w";
          s.textContent = part;
          s.style.setProperty("--i", wordIndex++);
          frag.appendChild(s);
        }
      });
      child.replaceWith(frag);
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      splitWords(child);
    }
  });
};
document.querySelectorAll(".split, .scrub").forEach((el) => {
  wordIndex = 0;
  splitWords(el);
});

// Scroll: palavras do título de valor acendem conforme a seção passa
const scrub = document.querySelector(".scrub");
const scrubWords = scrub ? [...scrub.querySelectorAll(".w")] : [];
const updateScrub = () => {
  if (!scrub) return;
  const r = scrub.getBoundingClientRect();
  const total = r.height + window.innerHeight * 0.6;
  const p = Math.min(1, Math.max(0, (window.innerHeight * 0.8 - r.top) / total));
  const lit = Math.round(p * scrubWords.length);
  scrubWords.forEach((w, i) => w.classList.toggle("on", i < lit));
};

// Parallax leve nas fotos da seção sobre e spotlight do hero
const parallaxEls = [...document.querySelectorAll("[data-parallax]")];
const hero = document.querySelector(".hero");
const onFrame = () => {
  updateScrub();
  if (!reduceMotion) {
    parallaxEls.forEach((el) => {
      const r = el.parentElement.getBoundingClientRect();
      const center = (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight;
      el.style.setProperty("--py", `${(center * Number(el.dataset.parallax)).toFixed(1)}px`);
    });
  }
};
let ticking = false;
window.addEventListener("scroll", () => {
  if (!ticking) {
    requestAnimationFrame(() => { onFrame(); ticking = false; });
    ticking = true;
  }
}, { passive: true });
onFrame();

if (hero && !reduceMotion && window.matchMedia("(pointer: fine)").matches) {
  hero.addEventListener("pointermove", (e) => {
    const r = hero.getBoundingClientRect();
    hero.style.setProperty("--mx", `${e.clientX - r.left}px`);
    hero.style.setProperty("--my", `${e.clientY - r.top}px`);
  });
}
