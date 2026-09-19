# ANALISADOR GOOGLE FORENSE

Ferramenta policial local para análise de **quebras de sigilo / produções Google LERS** (Takeout e arquivos de resposta do provedor).

Não envia o conteúdo da produção a servidores externos. O ZIP original é copiado e hasheado; a extração ocorre em pasta separada.

## Requisitos

- Python 3.11+
- Dependências em `requirements.txt`

## Execução

```bash
cd analisador-google-forense
python3 -m pip install -r requirements.txt
python3 app.py
```

Abra http://127.0.0.1:5050

## Módulos

1. Importação de ZIP, hash SHA-256/SHA-1/MD5 e identificação de produtos Google
2. Painel da conta (nome, e-mails, telefones, criação, última atividade, status, exclusão)
3. Dispositivos / IMEI, com alerta de mesmo aparelho vinculado a múltiplas contas
4. Linha do tempo investigativa
5. Mapa Google Maps (Folium) com DATA DO CRIME
6. Google Fotos + EXIF
7. Google Drive + palavras PIX, CPF, BANCO, ARMA, DROGA, NOME, TELEFONE, VALOR
8. Gmail (MBOX)
9. Google Pay
10. Histórico de pesquisa
11. Backup WhatsApp no Drive (somente identificação — sem quebra de cifra)
12. Correlação investigativa
13. Relatório policial DOCX e PDF

## Testes

```bash
cd analisador-google-forense
python3 -m unittest tests.test_pipeline -v
```

A produção de demonstração usa dados **fictícios** e serve apenas para treino e verificação da ferramenta.
