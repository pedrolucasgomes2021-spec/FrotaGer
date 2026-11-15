# Análise estratégica da landing page

Objetivo do site: fazer um dono de negócio da Região dos Lagos **pedir um orçamento pelo WhatsApp** com o menor esforço possível.

Tudo na página foi avaliado por uma pergunta: isso aproxima ou afasta o cliente dessa mensagem?

---

## 1. Diagnóstico da versão anterior

**O que já funcionava**
- Uma única ação principal (orçamento pelo WhatsApp), repetida ao longo da página.
- O formulário abria o WhatsApp com a mensagem pronta, sem cadastro nem e-mail.
- A Izadora aparecia em fotos reais. Rosto humano gera confiança em serviço pessoal.
- O FAQ já respondia dúvidas de cidade, prazo e reserva.

**O que atrapalhava**

| Problema | Por que pesa | O que foi feito |
|---|---|---|
| Quatro pacotes sem orientação de escolha | Mais opções sem guia aumentam o tempo de decisão (Lei de Hick) e geram "vou pensar" | Seletor **"Qual é o seu momento?"** que destaca o pacote certo |
| Nenhum exemplo do resultado | O cliente compra o que consegue imaginar: "me mostre como fica" | Galeria **em formato stories**, que avança sozinha ou com um toque |
| Botão de ação só no topo e no fim | No celular, o polegar alcança a parte de baixo da tela | **Barra fixa inferior** com "Pedir orçamento" e WhatsApp |
| Formulário com listas suspensas | Uma lista exige dois toques e esconde as opções | **Pílulas de um toque** para escolher o serviço; empresa marcada como opcional |
| Nenhuma frase reduzindo o risco perto do CTA | O medo de "se eu perguntar, vou ter que fechar" trava o primeiro contato | **"Orçamento sem compromisso · Direto no WhatsApp"** abaixo do botão |
| Objeções comuns sem resposta | "Preciso aparecer?" e "Meu perfil é pequeno" impedem contatos | Duas perguntas novas no FAQ |

---

## 2. Psicologia aplicada, princípio por princípio

1. **Lei de Hick (menos escolhas, decisão mais rápida).** O seletor de momento reduz quatro opções para uma recomendação. No formulário, a escolha é visual e leva um toque.
2. **Tornar o resultado tangível.** A galeria em stories mostra o produto final no formato em que o cliente vai usá-lo, e a barra de progresso imita o Instagram, que todo cliente já conhece.
3. **Reversão de risco.** "Sem compromisso" e "direto no WhatsApp" diminuem o custo percebido de mandar a primeira mensagem.
4. **Efeito de chamariz e ancoragem.** O pacote de 100 mídias aparece em destaque escuro ("Mais escolhido"), o que torna o de 50 a porta de entrada e o de 100 a escolha natural.
5. **Facilidade de execução no celular.** A barra fixa fica na área do polegar, aparece depois do topo e some quando o formulário está na tela, para não competir com ele.
6. **Canal que o cliente já usa.** O WhatsApp é o principal meio de contato entre pequenos negócios e clientes no Brasil, e a mensagem pré-preenchida elimina a "página em branco".
7. **Coerência visual = confiança.** A paleta saiu da própria logo (vinho, cobre e off-white). Fotos, logo e site contam a mesma história.
8. **Prova social (pendente).** É o gatilho mais forte que ainda falta. Veja a seção 5.

---

## 3. A jornada do cliente: 3 toques até a conversa

1. **Entra pelo Instagram ou Google** → vê o título, a foto e a garantia "sem compromisso".
2. **Rola** → vê exemplos em formato stories e escolhe o momento → o pacote certo acende.
3. **Toca no botão do pacote** (ou na barra fixa) → o WhatsApp abre com a mensagem pronta.

Quem prefere o formulário escreve o nome e faz 2 toques, e a mensagem chega organizada para a Izadora (nome, empresa, serviço e cidade).

---

## 4. Animações: o que entrou e por quê

As animações seguem uma regra: **cada movimento precisa conduzir o olhar para a próxima ação**, nunca só enfeitar.

| Animação | Função |
|---|---|
| Título aparece palavra por palavra | Prende a atenção nos primeiros segundos |
| Blobs de luz, grade e grão no fundo | Atmosfera de estúdio e de "luz dourada", sem pesar |
| Spotlight que segue o cursor (desktop) | Sensação de interatividade logo no topo |
| Palavras que acendem com o scroll ("Quem aparece todo dia...") | Leitura guiada da mensagem central |
| Galeria em stories com progresso | Mostra o produto e convida a tocar |
| Cards de processo que empilham no scroll (celular) | Transforma 4 passos em sequência visual |
| Barra de progresso de leitura no topo | Mostra quanto falta, o que incentiva a terminar |
| Brilho passando no botão principal | Puxa o olho para o CTA |

Cuidados técnicos:
- Tudo respeita a configuração de **"reduzir movimento"** do celular.
- A barra de progresso e o zoom da galeria usam **CSS scroll-driven animations** (nativas, sem biblioteca), com fallback para navegadores antigos.
- O site continua estático e leve, sem frameworks.

---

## 5. O que falta e depende de vocês

Em ordem de impacto na conversão:

1. **Nome correto.** A logo diz "Izadora Salomão" e o texto do site diz "Izadora Souza".
2. **Número do WhatsApp e link do Instagram** (hoje são exemplos, em `script.js`).
3. **Portfólio real.** Troque as fotos da galeria por 4 a 8 vídeos verticais curtos de trabalhos reais. É a maior alavanca da página.
4. **Depoimentos reais** (nome, negócio, cidade, de preferência com print ou vídeo). Não inventei nenhum.
5. **Preço "a partir de".** "Sob consulta" filtra menos e gera conversas que não fecham. Mostrar "a partir de R$ X" qualifica o lead e passa transparência.
6. **Tempo de resposta real** (ex.: "respondo em até 2h em dias úteis"). Só use se for verdade.
7. **Confirmar o conteúdo dos pacotes e do FAQ.** Os itens de cada pacote e as respostas novas ("Preciso aparecer?") são propostas e precisam bater com o que ela realmente faz.
8. **Perfil da Empresa no Google** com o link do site. Busca local ("storymaker Cabo Frio") é uma fonte importante de clientes.

---

## 6. Como medir depois de publicar

- Usar links com **UTM** na bio do Instagram (`?utm_source=instagram`) para saber de onde vêm os contatos.
- Contar cliques nos botões de WhatsApp com Google Analytics 4 ou Meta Pixel.
- Primeiro teste A/B sugerido: **"Sob consulta" vs. "A partir de R$ X"** nos pacotes.

---

## Fontes consultadas

- Lei de Hick e vieses cognitivos em landing pages: [Instapage](https://instapage.com/blog/cognitive-biases/), [Thrive Agency](https://thriveagency.com/news/ux-ui-and-cro-the-psychology-behind-high-converting-landing-pages/), [UX Planet](https://uxplanet.org/what-every-designer-should-know-to-improve-the-efficiency-of-websites-fb9573623efc), [Kit](https://wearekit.com/journal/4-psychology-tips-to-increase-landing-page-conversions)
- WhatsApp como canal principal dos pequenos negócios: [Agência Sebrae](https://agenciasebrae.com.br/cultura-empreendedora/whatsapp-e-o-principal-meio-de-comunicacao-para-80-dos-negocios-de-servico/), [Diário do Comércio](https://diariodocomercio.com.br/negocios/whatsapp-principal-meio-comunicacao/), [Olhar Digital](https://olhardigital.com.br/pro/noticia/pequenas-empresas-ja-usam-mais-whatsapp-do-que-sites-e-facebook/77520), [Central do Varejo](https://centraldovarejo.com.br/whatsapp-lidera-conversoes-no-brasil-mas-falta-de-integracao-de-dados-limita-avanco-das-vendas/)
- Tendências de animação e scroll: [Line25](https://line25.com/articles/web-design-trends-2026/), [SaaSFrame](https://www.saasframe.io/blog/10-saas-landing-page-trends-for-2026-with-real-examples), [Framer](https://www.framer.com/blog/web-design-trends/), [Figma](https://www.figma.com/resource-library/web-design-trends/)

Observação: boa parte dos números de conversão divulgados nessas fontes vem de agências e fornecedores, sem metodologia publicada. Use-os como direção, não como promessa.
