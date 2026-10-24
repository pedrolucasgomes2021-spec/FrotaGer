# FrotaGer / Vértice — demonstração de gestão de fretamento

Demonstração funcional **local** com painel gerencial e experiências web/PWA de passageiro e motorista. Interface em português, tema escuro, vidro translúcido, transições, gráficos e mapa. O código está no [FrotaGer](https://github.com/pedrolucasgomes2021-spec/FrotaGer). Esta revisão não publica o site.

A implementação foi construída de forma independente a partir das funcionalidades públicas da Beezer e da referência visual fornecida. Código, APIs e banco proprietários da Beezer não foram acessados. O REA indicado pelo usuário foi uma referência de análise, não o código desta plataforma.

## Executar localmente

Requisitos: Node.js **22.13 ou superior** e npm. Na raiz do projeto:

```sh
npm ci
npm run demo
```

Abra **http://127.0.0.1:5173/**. O comando prepara o build quando necessário, inicializa a tabela do banco local de forma idempotente e inicia o servidor no loopback. Não publica nem envia os dados operacionais para uma hospedagem. `Ctrl+C` encerra a demonstração.

Os dados persistem em `.wrangler/state`, separado de qualquer banco hospedado. `node_modules`, banco local, builds, variáveis de ambiente e arquivos de trabalho são ignorados pelo Git. Depois da primeira preparação, `npm run dev -- --hostname 127.0.0.1` inicia diretamente o desenvolvimento. `npm start` usa o Worker compilado e suas regras de autenticação de produção; para a demonstração, use `npm run demo`.

## Embarque: QR no motorista, leitura pelo passageiro

1. Escolha **Motorista**, matrícula de exemplo **MOT-001** (Carlos Silva), e uma viagem em andamento. Viagens programadas precisam ser iniciadas.
2. Abra **QR / Embarques → Exibir QR da viagem**. O motorista apresenta o QR; o passageiro faz a leitura.
3. Para testar em um único computador, use **Ver código de teste** ou **Copiar código**.
4. Alterne para **Passageiro**, matrícula **NX-1001** (Marina Costa), selecione a viagem e reserve um lugar quando necessário.
5. Abra **Ler QR → Usar código da viagem**, cole o código e confirme o embarque. A câmera é a alternativa de leitura em um aparelho compatível.
6. Consulte o manifesto e o diário do motorista, ou o painel gerencial. Repetir o embarque da mesma pessoa é recusado.

O token opaco tem 256 bits aleatórios e **120 segundos** de validade. Um QR permite embarcar vários passageiros distintos autorizados; renovar revoga o anterior. O servidor valida matrícula ativa, reserva, rota, estado da viagem, duplicação e capacidade. O QR não contém dados pessoais e não comprova presença física por si só: uma fotografia pode ser compartilhada durante sua validade.

**Trocar matrícula** seleciona outros cadastros de exemplo. A gestão registra matrícula tanto de passageiros quanto de motoristas; passageiros têm ponto de embarque e destino posterior. Matrículas são únicas em cada perfil.

## Desembarque sem celular do passageiro

No app do motorista, abra **Desembarques**, selecione o ponto, revise os passageiros previstos e desmarque quem continua a bordo. Uma confirmação registra todas as saídas selecionadas, criando **um evento individual por passageiro**, com ponto, horário do servidor, lote e responsável. Quem não foi selecionado permanece no manifesto.

A validação pelo GPS exige posição real medida e recebida há até 90 segundos, precisão de até 60 m, velocidade conhecida de até 2 m/s e proximidade de até 120 m do ponto, sem salto detectado. Sem essas condições, ou para um destino diferente do reservado, o motorista precisa justificar a exceção com ao menos dez caracteres. A proximidade do GPS nunca desembarca alguém sozinha. Encerrar a viagem exige que todos tenham desembarcado.

## Rotas importadas e acompanhamento

Em **Rotas e pontos**, importe **KML, GPX ou GeoJSON**, confira a prévia, escolha o trecho e aplique o traçado. Arquivos com vários trechos mantêm candidatos separados; não são concatenados por linhas artificiais. Limites: 2 MB e 5.000 pontos. KMZ, XML malformado, DTD/entidades e coordenadas inválidas são recusados. Altitude não participa do cálculo de distância.

Os arquivos em [examples](examples/README.md) são demonstrações sintéticas, sem homologação viária. Pontos de embarque/desembarque continuam ordenados e editáveis; usar os extremos do traçado como pontos é uma ação explícita.

O mapa usa a geometria importada como percurso planejado e preserva as **coordenadas GPS brutas**. Desvios são sinalizados pela tolerância configurada na rota (10–1.000 m); o marcador não é movido artificialmente para cima da linha. Cada viagem nova congela rota, motorista e veículo em snapshots, preservando o planejamento histórico. Rotas em viagem ativa não podem ser editadas.

O motorista ativa o GPS com permissão do navegador. Envios ocorrem no máximo a cada dez segundos, com horário do dispositivo, recebimento, precisão e qualidade. Mantenha o app aberto. Sem sinal adequado, o sistema exibe a lacuna; não inventa deslocamento nem garante que o veículo seguiu o planejamento.

## Relatórios e precisão dos dados

As abas **Operação**, **Quilometragem**, **Passageiros** e **Construtor** compartilham filtros por período, rota, empresa, motorista, veículo, status da viagem e origem dos eventos. Datas são inclusivas em `America/Sao_Paulo`. A data operacional seleciona as viagens; eventos e amostras GPS dessas viagens também respeitam o intervalo pelo horário local de cada registro.

No construtor, selecione KPIs, agrupamento por dia/rota/empresa/motorista/veículo e visualização em barras, linhas ou tabela. Salve filtros e configuração como uma visão reutilizável. Indicadores incluem viagens, embarques, desembarques, passageiros distintos, novos cadastros, ausências, ocupação, ocorrências e desvios do traçado.

A quilometragem mantém três fontes distintas:

| Fonte | Significado |
| --- | --- |
| Planejada | Soma dos segmentos geográficos da geometria; referência do planejamento, sem trânsito ou roteamento viário automático. |
| Hodômetro informado | Diferença entre leituras inicial e final declaradas pelo operador; não é telemetria certificada. |
| GPS estimado | Soma apenas dos segmentos válidos capturados; pode ser parcial e não preenche trechos ausentes. |

Amostras simuladas, imprecisas e saltos incompatíveis são excluídos da estimativa GPS; lacunas acima de 120 segundos separam segmentos. Falta de GPS ou hodômetro aparece como **Sem medição**, não zero. A tela informa cobertura, amostras rejeitadas e lacunas. Não compara fontes com coberturas diferentes como se fossem equivalentes.

Ocupação é reconstruída por IDs de passageiros ao longo dos eventos, usando a capacidade histórica. Ausências consideram reservas não canceladas de viagens concluídas sem embarque. Cadastros contam como novos apenas quando têm data de criação conhecida. Históricos legados sem snapshots completos são identificados como limitados, sem inventar datas ou afirmar que cadastros atuais comprovam o passado.

O filtro de origem restringe eventos e pessoas; mantém a coorte de viagens e suas medições. Nesse recorte, ocupação e ausências ficam sem medição, pois os eventos seriam insuficientes para reconstruí-las corretamente. Contagens distintas por motorista/veículo não devem ser somadas entre grupos.

**Exportações CSV:** indicadores agregados, viagens e medições, eventos detalhados, passageiros da coorte e amostras GPS brutas. Os arquivos aplicam os filtros, usam UTF-8 com BOM, separador `;`, horários UTC/São Paulo, precisão numérica bruta e proteção contra fórmulas em células de texto. GPS bruto conserva amostras rejeitadas/simuladas sinalizadas para auditoria. A definição de uma visão também pode ser exportada em JSON. Arredondamento ocorre apenas na exibição.

## Outros recursos

- Gestão de frota/capacidade, motoristas, passageiros, rotas e pontos.
- Escalas com detecção de conflitos de motorista e veículo pelo tempo planejado.
- Reserva/cancelamento, controle de lotação e validação de regras no servidor.
- Painel inicial com gráficos derivados dos eventos, mapa e registros recentes.
- Ocorrências por viagem, comunicados internos e preferências persistidas.
- Persistência D1 com controle de concorrência por versão e validação de entrada com Zod.
- Manifests PWA e página sem conexão; operações exigem conexão e não entram no cache do service worker.

## Escopo e limites da demonstração

**Matrícula seleciona um cadastro de demonstração; não é senha nem autenticação individual.** Os três perfis compartilham o mesmo dono/workspace. Headers de perfil/matrícula não substituem contas próprias, organizações ou autorização empresarial. O fallback local só é permitido em desenvolvimento no loopback; a produção exige identidade de um proxy confiável. Detalhes em [app/server/README.md](app/server/README.md).

O seed contém 6 rotas, 6 veículos, 4 motoristas, 32 passageiros, 9 viagens atuais/futuras e 42 viagens históricas sintéticas. Exemplos são identificados; não há animação artificial de veículos. Como o banco persiste, as datas do seed correspondem à sua primeira abertura. Cadastre novas viagens para dias posteriores.

Os apps são **web/PWA**, sem APK/IPA publicado. GPS contínuo em segundo plano, notificações push, e-mail/SMS, operação offline, ETA/trânsito, otimização automática de rotas e integração de hodômetro não estão implementados. Câmera e GPS dependem de permissões e ainda precisam de validação nos aparelhos reais da operação. `localhost` em um telefone se refere ao próprio telefone, não a este computador.

A persistência em um documento D1 por dono é apropriada ao piloto. Uso empresarial requer autenticação individual, modelo de organizações/permissões, auditoria com retenção definida, backups e validação operacional. O mapa usa tiles públicos OSM, sem SLA ou download offline. Esta demonstração não certifica equivalência integral com a Beezer nem precisão de telemetria de campo.

## Tecnologia e verificações

React 19, TypeScript, Vinext/Vite, Cloudflare Worker/D1, Zod, Leaflet/OpenStreetMap, Recharts, qrcode, jsQR e lucide-react. Schema/migração em `db/` e `drizzle/`; domínio/API em `app/server/`; cálculos de relatórios em `app/reporting.ts`; geometria em `app/geo.ts`.

```sh
npm test
npm run typecheck
npm run build
```

Os testes cobrem domínio/backend, geometria e cálculos/exportações dos relatórios: QR, matrículas, concorrência, desembarque em lote, snapshots, hodômetro, GPS, datas, filtros e CSV. O caso XML que depende de `DOMParser` é pulado no Node e deve ser verificado na importação do navegador. O build apenas compila; não publica.

## Fontes públicas de comportamento

- [Funcionalidades Beezer](https://beezer.com.br/funcionalidades/)
- [Vantagens Beezer](https://beezer.com.br/vantagens/)
- [Suporte Beezer](https://beezer.com.br/suporte/)
- [Beezer](https://beezer.com.br/)
- [REA](https://github.com/morluto/rea)
- [Política dos tiles OSM](https://operations.osmfoundation.org/policies/tiles/)

QR no motorista, seleção por matrícula e desembarque em lote são decisões desta implementação a pedido do usuário, não funcionalidades proprietárias confirmadas da Beezer.
