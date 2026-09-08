CENTRAL PCPR — ATUALIZAÇÃO v2.4
Data: 08/09/2026

NOVO MÓDULO: DIÁRIO DE BORDO – VEÍCULO

Arquivos desta atualização:
- diario-bordo.html        -> novo gerador do Diário de Bordo
- oficios.html             -> Central de Ofícios com nova aba “Diário de Bordo”
- index.html               -> versão da Central atualizada para v2.4
- atualizacoes.html        -> histórico da versão v2.4

COMO ATUALIZAR NO GIT
1. Faça backup da pasta atual da Central.
2. Copie os quatro arquivos acima para a mesma pasta onde já ficam os demais HTMLs.
3. Substitua index.html, oficios.html e atualizacoes.html quando solicitado.
4. Mantenha os demais módulos existentes (oficios-core.html, oficio-diaria.html, relatorio-viagem.html, oitiva-penitenciaria.html, pericia.html etc.).
5. Publique normalmente a pasta atualizada.

FUNCIONAMENTO DO NOVO GERADOR
- duas linhas de deslocamento por padrão;
- botão “+ ADICIONAR DESLOCAMENTO”;
- exclusão somente das linhas adicionais;
- datas no padrão DD/MM/AAAA e horas no padrão HH:MM;
- placa reservada por seleção SIM/NÃO;
- necessidade de abastecimento marcada automaticamente com X;
- servidor por menu; RG manual;
- assinatura permanece sempre em branco;
- tabela centralizada horizontalmente em todas as situações;
- linhas adicionais expandem somente a tabela verticalmente;
- tamanho da fonte não é reduzido para caber em uma página;
- se necessário, o documento continua em nova página;
- geração em ODT e impressão/Salvar PDF;
- aba Configurações com cabeçalho, brasão e lista de servidores;
- configurações salvas localmente no navegador.

VALIDAÇÕES REALIZADAS
- JavaScript verificado sem erros de sintaxe;
- geração com duas linhas validada;
- ODT aberto no LibreOffice e convertido para PDF em A4 paisagem;
- teste com 12 deslocamentos gerou 2 páginas, sem redução do tamanho da fonte.
