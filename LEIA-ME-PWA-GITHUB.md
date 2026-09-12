# Central PCPR v2.8.2 — PWA

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

A Central v2.8.2 incorpora o módulo **ERB / Antenas v9.7.0** e atualiza o cache do PWA para distribuição da nova versão aos dispositivos instalados.
