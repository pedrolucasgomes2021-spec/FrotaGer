# Planejamento do desembarque

Cada cadastro de passageiro informa um ponto de embarque e um destino posterior. A reserva preserva o destino para a viagem. Ao chegar, o motorista escolhe o ponto e vê os passageiros a bordo previstos ali. A lista começa marcada para revisão; ele desmarca quem continua e confirma o lote. Não há leitura de QR nem interação obrigatória do passageiro no desembarque.

Atualizações em segundo plano preservam as desmarcações do motorista. Novos embarques não são acrescentados silenciosamente à seleção em andamento. Passageiros que deixam de estar a bordo são retirados da seleção. Trocar o ponto ou a viagem abre uma nova seleção explícita para revisão.

Um GPS real recente pode validar a parada: medição e recebimento com até 90 segundos, precisão até 60 metros, velocidade conhecida até 2 metros por segundo e distância até 120 metros do ponto, sem salto detectado. Esses critérios reduzem erros; a confirmação de saída continua sendo humana. Não inferimos desembarque apenas por proximidade ou porque o celular deixou de transmitir.

Sem GPS adequado, o motorista justifica a confirmação em pelo menos dez caracteres. Incluir alguém reservado para outro destino também exige justificativa. O sistema mostra o método de validação no histórico. Cada pessoa selecionada recebe seu próprio evento com horário do servidor, matrícula, viagem, ponto, lote e motorista responsável. A gravação é atômica: uma lista inválida não produz um lote parcial. Quem permanece continua a bordo e impede o encerramento da viagem até ter a saída confirmada.

O traçado importado é a referência planejada. A posição GPS permanece bruta, mesmo quando está fora dele. Relatórios separam quilômetros planejados, diferença de hodômetro informada e estimativa parcial do GPS. Ausência de sinal não é preenchida com distância inventada.
