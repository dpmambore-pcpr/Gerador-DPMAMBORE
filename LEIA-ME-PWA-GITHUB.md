# Central PCPR v2.8.5 — PWA

Esta versão está preparada para instalação como Progressive Web App (PWA).

## Publicação no GitHub Pages

1. Envie todo o conteúdo desta pasta para a raiz do repositório.
2. No GitHub, abra **Settings → Pages**.
3. Em **Build and deployment**, escolha **Deploy from a branch**.
4. Selecione **main** e **/(root)** e salve.
5. Abra o endereço HTTPS fornecido pelo GitHub Pages.
6. Chrome/Edge/Android: use **Instalar Central PCPR** quando aparecer.
7. iPhone/iPad (Safari): **Compartilhar → Adicionar à Tela de Início**.

## Atualizações

Ao publicar uma nova versão, o Service Worker detecta a atualização e a Central pode exibir um aviso para recarregar.

## Offline

Os arquivos locais da Central são armazenados no dispositivo após o primeiro carregamento. Recursos que dependem de serviços externos, mapas, bases online ou formulários continuam exigindo internet. Respostas de APIs externas não são armazenadas pelo Service Worker.

## Dados locais

As preferências e dados salvos pelos módulos continuam no armazenamento local do navegador (localStorage/IndexedDB). Instalar a PWA não cria banco remoto. Faça backup antes de limpar dados do navegador ou remover o aplicativo.


## Conteúdo desta versão

A Central v2.8.5 preserva o módulo **ERB / Antenas v9.7.0** e atualiza o cache do PWA para distribuição da nova versão aos dispositivos instalados.

## v2.8.5 — correção de envio ao Google Drive

Corrige o carregamento de uma versão antiga de `pcpr-drive.js` pelo cache do PWA, que causava `uploadElementsPdfForAuthority is not a function`. O helper do Drive ganhou nome versionado (`pcpr-drive-v285.js`) e o Service Worker passou a priorizar a rede para HTML/JS quando online.


## Google Drive / assinatura

A v2.8.3 acrescentou configuração local por autoridade para pasta de assinatura no Google Drive. O HTML distribuído não contém pasta de nenhuma Delegacia. Cada instalação cola o próprio link e autoriza a pasta pelo Google Picker. O envio direto de PDF usa OAuth no navegador e não salva senha nem token de acesso. Para ativar, preencha na Configuração Geral o OAuth Client ID, a API Key do Google Picker e, opcionalmente, o Project Number/App ID do projeto Google Cloud.


## v2.8.4 — envio para assinatura em todos os documentos da Autoridade Policial

A v2.8.4 amplia o botão **Enviar para pasta** aos geradores de Coffee Break, Ofício de Diária, Oitiva em Penitenciária, Perícia e Justificativa do Fundo Rotativo. O gerador de Ofícios mantém a integração já existente. Módulos assinados somente por APJ/servidor não recebem esse botão. As pastas continuam sendo configuradas localmente por autoridade na Configuração Geral.


## v2.8.7
- Corrige identificação da autoridade de assinatura no Google Drive, inclusive para módulos antigos que enviavam o nome da unidade.
- A autorização e o link da pasta passam a ser persistidos imediatamente.
- A seção 6 da Configuração Geral ganhou botão visível “SALVAR CONFIGURAÇÃO GERAL”.


## v2.8.8 — Nome obrigatório dos documentos

Todos os geradores de documentos exibem o campo **NOME DOC** antes das ações de saída. Sem preenchê-lo, a Central bloqueia salvar/baixar, imprimir em PDF e enviar para a nuvem. O nome digitado é usado no arquivo final e a extensão é acrescentada automaticamente.
