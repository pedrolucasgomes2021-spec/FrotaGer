# Validação da demonstração local

Revisão de 24/10/2026. Os dados operacionais usados na demonstração são sintéticos.

## Verificações automatizadas

- TypeScript: `npm run typecheck`, sem erros.
- Backend: 20 testes aprovados (QR, matrículas, autorização, lotação, reservas, estados da viagem, lote atômico, GPS, snapshots, relatórios salvos e concorrência).
- Geografia: 9 aprovados; 1 conjunto XML ignorado no Node por ausência de DOMParser.
- Relatórios: 13 aprovados (intervalos em São Paulo, filtros, snapshots, ausência de medição, pessoas distintas, ocupação, ausências, cadastro por data conhecida, GPS e CSV).
- Total: **42 aprovados, nenhum reprovado, 1 ignorado no Node**.
- Build de produção: compilação concluída. Aviso de bundle acima de 500 kB; não impede a demonstração.

## Verificações pela interface local

- Motorista exibiu um QR de viagem. Duas matrículas distintas registraram embarques com o mesmo código.
- A troca de matrícula do passageiro selecionou o cadastro correto.
- Quatro passageiros foram desembarcados em uma confirmação com justificativa; a passageira desmarcada permaneceu a bordo.
- O relatório por origem “Lote do motorista” exibiu exatamente quatro eventos individuais de desembarque, com justificativa e ponto.
- Uma visão com quatro KPIs, agrupamento por dia e visualização em tabela foi salva e reaberta.
- O CSV agregado foi baixado com filtros, números brutos e campos vazios para medições ausentes.
- KML com dois traçados apresentou seleção separada; um KML contínuo de 16 coordenadas foi aplicado, salvo e reaberto com os 16 pontos e distância calculada preservados.
- Os gráficos de operação renderizaram barras e dimensões válidas.
- Experiência do motorista em 390 × 844: sem transbordamento horizontal; QR e manifesto acessíveis.
- `npm run demo` inicializou o banco local de forma idempotente e iniciou o preview no loopback.

## Limites dessa validação

Câmera, permissão GPS e comportamento contínuo em aparelhos físicos não foram homologados. Os testes de GPS exercitam as regras com amostras controladas; não comprovam precisão de um telefone em campo. GPX e gx:Track têm implementação e fixtures, mas seu conjunto XML permanece ignorado no Node; a validação de importação pela interface nesta revisão usou KML LineString.

A seleção de matrícula é uma identidade demonstrativa dentro do mesmo workspace, sem autenticação empresarial. Apps são web/PWA com coleta em primeiro plano. A revisão foi executada localmente, sem republicar o site.
