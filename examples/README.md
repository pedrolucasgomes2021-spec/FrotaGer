# Exemplos de importação

As coordenadas destes arquivos são sintéticas e servem para testar a interface. **Não representam rotas viárias homologadas nem instruções de navegação.**

- `rota-demonstracao.kml`: um traçado contínuo com 16 pontos na região de São Paulo.
- `rota-multitrechos.kml`: dois traçados independentes, com seis pontos cada, para testar a seleção de candidatos.

No cadastro ou edição de uma rota, escolha o arquivo em **Traçado da rota**. Confira a prévia, a quantidade de pontos e a distância 2D. Quando houver mais de um traçado, selecione um deles e clique em **Aplicar traçado ao formulário**. Os segmentos são tratados separadamente e não são unidos por conexões artificiais.

A importação preserva a ordem da geometria e não altera as paradas automaticamente. **Usar extremos como pontos** é uma ação separada que substitui a lista de paradas por início e fim; revise nomes e horários antes de salvar a rota.

A distância é uma estimativa geodésica em 2D: altitude e trânsito não são considerados. O GPS do veículo permanece nas coordenadas brutas recebidas, sem ser deslocado para o traçado (*snap*). A tolerância de desvio, a precisão e a idade do GPS são informações distintas.
