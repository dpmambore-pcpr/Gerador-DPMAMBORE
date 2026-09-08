CENTRAL PCPR — ATUALIZAÇÃO v2.1 — 08/09/2026
MÓDULO: OFÍCIO DE SOLICITAÇÃO DE DIÁRIAS

ARQUIVOS DESTA ATUALIZAÇÃO
1. index.html
   - Atualiza a Central para v2.1.
   - Inclui “DIÁRIAS” no cartão de Ofícios.
   - Atualiza o carregamento de Ofícios e Atualizações.

2. oficios.html
   - Adiciona a aba “Diárias” à Central de Ofícios.
   - Mantém as abas Ofícios, Oitiva em Penitenciária e Perícia.

3. oficio-diaria.html
   - Novo gerador de Ofício de Solicitação de Diárias.
   - Servidores dinâmicos.
   - Cadastro reutilizável de nome/cargo.
   - CPF e protocolo da Central de Viagens informados somente na diária.
   - Configurações de cabeçalho, brasão, rodapé, autoridade e destinatário.
   - Persistência local das configurações.
   - Geração de ODT e impressão/Salvar PDF.

4. oficios-core.html
   - Gerador de Ofícios existente preservado.
   - Apenas identificação visual/metadado interno atualizado de v2.0 para v2.1.

5. atualizacoes.html
   - Adiciona o registro da versão v2.1 e do novo módulo de Diárias.

INSTALAÇÃO NO REPOSITÓRIO
- Copie/substitua os cinco arquivos acima na mesma pasta em que estão os demais HTMLs da Central.
- NÃO remova os arquivos já existentes oitiva-penitenciaria.html e pericia.html: o arquivo oficios.html continua usando ambos.
- Faça o commit/push normalmente. O deploy da Cloudflare deverá publicar a nova versão usando os mesmos nomes de arquivo.

ARMAZENAMENTO
- As configurações do módulo de Diárias são gravadas somente no localStorage do navegador/dispositivo.
- CPF, protocolos e dados de cada viagem não são salvos automaticamente como configuração permanente.

TESTES REALIZADOS
- Validação sintática dos JavaScripts dos arquivos alterados.
- Geração com quatro servidores.
- ODT validado como arquivo ZIP/ODF e aberto/converterido pelo LibreOffice.
- ODT e impressão/PDF verificados em uma página A4 no cenário do modelo institucional.
