# Central PCPR v3.0.0 — PWA

Esta versão preserva os módulos existentes e acrescenta duas melhorias estruturais: **núcleo compartilhado único** e **Histórico de Documentos**.

## Publicação no GitHub Pages

1. Envie o conteúdo desta pasta para a raiz do repositório.
2. No GitHub, abra **Settings → Pages**.
3. Em **Build and deployment**, escolha **Deploy from a branch**.
4. Selecione **main** e **/(root)**.
5. Abra o endereço HTTPS do GitHub Pages.
6. Se a Central já estiver instalada como PWA, aceite **Atualizar agora** quando aparecer.

## v3.0.0 — Núcleo compartilhado

Os helpers da Central foram consolidados. Os módulos passam a usar a mesma geração:

- `pcpr-core.js` — versão, utilitários e histórico local;
- `pcpr-config.js` — Configuração Geral;
- `pcpr-drive.js` — Google Drive e envio para assinatura;
- `pcpr-documento.js` — NOME DOC, saída de arquivos e registro de geração;
- `pwa.js` — instalação e atualização do aplicativo.

Arquivos antigos paralelos de Drive, PWA e NOME DOC não são mais utilizados. Se estiver atualizando um repositório antigo, exclua os arquivos listados em `ARQUIVOS_PARA_EXCLUIR_V3.txt`.

## Histórico de Documentos

A Central ganhou o módulo **Histórico de Documentos**. O registro fica somente no navegador e guarda metadados operacionais, não o conteúdo dos documentos.

São registrados, quando disponíveis: data/hora, tipo do documento, NOME DOC, autoridade, ação, formato, pasta de assinatura e resultado. Envios concluídos ao Google Drive são registrados como **ENVIADO**; falhas de envio também podem aparecer como **ERRO**.

O histórico possui pesquisa, filtros e exportação em CSV/JSON. Limpar o histórico não apaga documentos nem configurações da Central.

## Google Drive / assinatura

A integração continua usando OAuth no navegador. Cada DP pode importar `INTEGRACAO_GOOGLE_CENTRAL_PCPR.json`, cadastrar a própria pasta e autorizar com a própria conta Google. Senhas, Client Secret e tokens de acesso não devem ser colocados no GitHub.

## Offline e dados locais

Os arquivos locais da Central são armazenados pelo Service Worker após o primeiro carregamento. Recursos externos continuam exigindo internet. Configurações, projetos, preferências e histórico permanecem no `localStorage`/`IndexedDB` do dispositivo.
