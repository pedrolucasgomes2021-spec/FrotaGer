# API local do piloto Vértice

`GET /api/state` retorna `{state}`. `POST /api/action` recebe JSON e retorna `{state,...extra}`; erros retornam `{error}` com status HTTP. Todas as operações passam por Zod no servidor. A origem é validada, o body tem limite de 1 MB e o documento persistido de 1,8 MB. Dados acima desses limites são recusados sem truncar geometria, eventos ou GPS.

O vínculo Cloudflare D1 `DB` armazena um documento por dono em `workspace_state`. A coluna `version` e a atualização compare-and-swap com até oito tentativas revalidam operações concorrentes sobre o estado vencedor. Assim, duas abas não duplicam embarques, reservas ou lotes. Não houve nova migração SQL: os campos novos ficam no JSON e `loadWorkspace` normaliza documentos antigos na leitura, persistindo essa normalização na próxima mutação bem-sucedida.

O dono vem exclusivamente do header confiável `oai-authenticated-user-id` fornecido pela plataforma. Sem ele, somente `NODE_ENV=development`, URL loopback e origem loopback permitem `development:local-preview` (ou `x-vertice-dev-owner` local). A produção não possui fallback anônimo. Este trabalho e seus testes são locais; nenhuma publicação é necessária para testar o domínio.

## Perfis e matrículas de demonstração

`x-vertice-role: admin | driver | passenger` seleciona um perfil **operado pelo mesmo dono no piloto**. `x-vertice-registration` opcional seleciona um cadastro ativo por matrícula dentro desse perfil. Sem ele, continuam os padrões motorista `d1`/`MOT-001` e passageiro `p1`/`NX-1001`. Um motorista só opera viagens vinculadas ao seu ID; um passageiro só opera seu próprio embarque/reservas. Matrículas são únicas dentro de cada perfil e comparadas sem distinguir maiúsculas/minúsculas.

**Matrícula é seleção de cadastro DEMO, não senha, prova de identidade, autenticação individual ou RBAC multiusuário.** Todos os perfis veem o workspace do mesmo dono. Produção com motoristas e passageiros independentes exige contas individuais, organizações e autorização real no servidor. Não use esses headers como login empresarial.

## QR do motorista para o passageiro

- Motorista/admin chama `trip.qr.issue {tripId}` na viagem em andamento. Retorno `{state,token,expiresAt}`. O token opaco tem 256 bits aleatórios e validade de 120 segundos. Emitir outro revoga o anterior daquela viagem. Token e auditoria nunca aparecem em `state`.
- Passageiro lê o QR da viagem e chama `boarding.scan {token}`. O cadastro vem da matrícula selecionada. Admin pode usar `boarding.scan {token,passengerId?}`; sem ID usa `p1`.
- Um mesmo QR embarca vários passageiros distintos. Repetir a leitura por um passageiro já embarcado é recusado. O servidor exige reserva ativa, rota autorizada, passageiro ativo, viagem em andamento e vaga conforme capacidade congelada na viagem. Não é possível refazer a reserva ou cancelar após embarque.
- `qr.issue` e `qr.validate` do fluxo antigo são recusados com status 410 e orientação para o novo fluxo. Tokens antigos persistidos são invalidados durante a normalização.

O QR da viagem não prova presença física por si só: ele pode ser fotografado e compartilhado durante sua curta validade. O piloto não acrescenta biometria nem atestado de proximidade do dispositivo do passageiro.

## Desembarque em lote

`alighting.batch {tripId,stopId,passengerIds,confirmation:true,note?}` é permitido para motorista/admin. Todos os IDs devem ser únicos, estar efetivamente a bordo e ter reserva. O ponto precisa pertencer ao snapshot da rota. O lote é inteiro: qualquer passageiro inválido faz a operação falhar sem salvar nenhum evento. Passageiros não selecionados permanecem a bordo; aproximar o GPS nunca registra desembarque automaticamente.

Sem justificativa, é necessário o último GPS real da viagem com recebimento e medição até 90 segundos, precisão até 60 m, velocidade conhecida até 2 m/s e posição até 120 m do ponto. Posição simulada, salto detectado, GPS antigo, impreciso, veículo em movimento ou velocidade desconhecida exigem justificativa com ao menos dez caracteres. Destino diferente da reserva também exige justificativa. Cada evento recebe `source:'driver_batch'`, `batchId`, `stopId`, `verification:'gps_at_stop'|'manual_override'`, nome/matrícula do passageiro e matrícula/ID do motorista. O horário e a verificação são calculados pelo servidor.

## Snapshots, distância e GPS

`trip.create` congela `routeSnapshot`, `driverSnapshot` e `vehicleSnapshot`. Atualizar um cadastro não reescreve snapshots anteriores. Viagens antigas sem snapshot recebem uma cópia do cadastro atual e `legacySnapshot:true`: isso é uma reconstrução inferida e não comprova a configuração histórica. A normalização não inventa `createdAt` de passageiros, veículos ou motoristas antigos. Motoristas antigos recebem `MOT-001…` livres, `active:true`; passageiros antigos recebem o ponto final como destino padrão e reservas antigas recebem esse destino inferido. Relatórios devem explicitar essas lacunas.

`route.save` admite `geometry:[lat,lng][]` com 2–5.000 pontos, `geometrySource:'kml'|'gpx'|'geojson'|'stops'`, `geometryName`, `gpsToleranceMeters` (10–1.000 m) e `revision`. Com geometria, a distância planejada é calculada no servidor pelos segmentos geográficos. A revisão é incrementada pelo servidor. Rota em viagem ativa não pode ser editada. Importação de KML/GPX/GeoJSON ocorre na UI, que envia pontos validados; altitude não entra na distância. As rotas do seed usam segmentos demonstrativos entre paradas e não equivalem a vias reais.

`location.update {tripId,lat,lng,accuracy,speed?,heading?,deviceAt?}` preserva coordenadas brutas e data do dispositivo, grava recebimento no servidor e `simulated:false`. Precisão acima de 60 m recebe `quality:'poor_accuracy'`; deslocamento incompatível recebe `quality:'jump'`; a distância ao traçado e `offRoute` usam o snapshot sem reposicionar marcador sobre a linha. Velocidade é m/s; precisão é metros; heading é graus. Dados GPS vêm do navegador e não possuem certificação antifraude. Até 10.000 amostras são aceitas no piloto; o limite rejeita novas amostras em vez de apagar o histórico.

`trip.start {tripId,odometerKm?}` e `trip.finish {tripId,odometerKm?}` aceitam leituras opcionais declaradas pelo operador, sem inventar medida ausente. Final não pode ser inferior ao inicial. Encerrar exige todos desembarcados. Distância planejada da geometria, estimativa GPS filtrada e diferença de hodômetro são medidas distintas; ausência de GPS ou hodômetro não equivale a zero medido.

## Outras ações

- `route.save {route}`, `route.toggle {id}`; rota completa conforme `app/types.ts`, pontos únicos e destinos posteriores ao embarque.
- `passenger.save {passenger}`, `passenger.toggle {id}`; e-mail/matrícula únicos, `destinationStopId` posterior a `stopId`. Cadastro novo recebe `createdAt` do servidor; edição preserva a criação conhecida.
- `vehicle.save {vehicle}`; placa única, capacidade 1–80 e criação do servidor para novos registros.
- `driver.save {driver}`; matrícula obrigatória para novo cadastro, `active` padrão true. Edição legada sem matrícula usa a normalizada; não inativa motorista em viagem.
- `trip.create {trip:{routeId,driverId,vehicleId,date,departure}}`; detecta conflito de agenda por motorista/veículo e duração prevista.
- `booking.create {tripId,passengerId}`, `booking.cancel {id}`; reserva congela `destinationStopId`.
- `boarding.manual {tripId,passengerId,kind:'boarding'|'alighting',note}`; exceção individual explícita com justificativa mínima de cinco caracteres e mesmas regras de reserva/duplicação.
- `incident.create {tripId,note}`.
- `message.send {title,body,audience:'all'|'drivers'|'passengers'}`; mensagens internas sem envio externo.
- `settings.save {settings:{emailAlerts,approachAlerts,defaultCapacity,name?}}`; nome atualiza `workspace.name`. Alertas são preferências, sem integração push/e-mail.
- `report.save {report:{id?,name,filters,metrics,groupBy,chart,createdAt?,updatedAt?}}` cria/edita definição; datas novas são do servidor e criação existente é preservada. `report.delete {id}` exclui. Somente admin. `filters` contém `from,to,routeId,company,driverId,vehicleId,status,source`; datas vazias e IDs vazios significam sem filtro. `status` aceita vazio/all/scheduled/in_progress/completed; `source` vazio/all/qr/manual/system/driver_batch. `metrics` aceita somente as chaves `MetricKey` de `types.ts`; `groupBy` route/day/company/driver/vehicle e `chart` bar/line/table. Máximo de 100 definições.

O seed tem 6 rotas, 6 veículos, 4 motoristas, 32 passageiros, 9 viagens hoje/amanhã e 42 viagens históricas sintéticas de sete dias. `workspace.demo:true` e `simulated:true` distinguem demonstração de GPS enviado. Não há movimento automático, GPS nativo em segundo plano, roteirização por trânsito, autenticação individual ou envio push/e-mail.

Testes: `node tests/backend.test.mjs`. Cobrem migração legada, inversão do QR, múltiplos passageiros, atores por matrícula, geofence/lote/exclusões, concorrência CAS, snapshots, hodômetro, validação de geometria, GPS bruto e relatórios.
