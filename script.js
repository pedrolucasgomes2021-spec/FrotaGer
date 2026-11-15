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
