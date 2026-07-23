# Monitor do Portal da Transparência — Santo Antônio de Pádua–RJ

Avisa por **e-mail** e **WhatsApp** sempre que um **documento novo** for publicado
em qualquer uma das seções/secretarias do portal da transparência da prefeitura.

- Roda sozinho **1x por dia** (08h no horário de Brasília) no **GitHub Actions** — grátis, sem servidor.
- Varre **todas as seções** (auto-descoberta + lista fixa de 34).
- Guarda o histórico do que já viu em `state/seen.json` (commitado no próprio repo).
- No **primeiro run** só registra a "baseline" — não te enche de alerta com tudo que já existe.
- Se o **site cair ou mudar de estrutura**, ele te avisa disso em vez de ficar mudo.

---

## Como funciona (resumo)

1. O script acessa `https://santoantoniodepadua.rj.gov.br/portal/arquivo/{id}/{ano}` para cada seção.
2. Extrai os links de arquivos (PDF, DOC, XLS, etc.).
3. Compara com o que já tinha visto na última vez.
4. Se tem link novo → manda e-mail + WhatsApp com título, seção e link direto.

O portal é HTML estático com URL previsível, então o monitoramento é leve e confiável.

---

## Passo a passo de instalação (do zero, ~15 min)

### 1. Criar o repositório no GitHub

- Crie um repositório **privado** novo (ex.: `monitor-transparencia-padua`).
- Suba todos os arquivos desta pasta para ele (pode arrastar no site do GitHub em
  "Add file → Upload files", ou via git).

> A pasta já vem com `state/seen.json` zerado. Não apague esse arquivo.

### 2. Gerar a senha de app do Gmail (para o e-mail)

O Gmail não deixa usar sua senha normal em scripts. Você precisa de uma **App Password**:

1. Ative a verificação em 2 etapas na sua conta Google (se ainda não tiver):
   https://myaccount.google.com/security
2. Acesse https://myaccount.google.com/apppasswords
3. Crie uma senha de app (nome livre, ex.: "monitor padua").
4. Copie os **16 caracteres** gerados (sem espaços). É isso que vai em `SMTP_PASS`.

### 3. Ativar o WhatsApp (CallMeBot — grátis)

O CallMeBot manda mensagem no **seu próprio** WhatsApp com uma chamada simples:

1. Adicione o número **+34 644 44 21 48** aos seus contatos (nome livre, ex.: "CallMeBot").
2. Envie por WhatsApp para esse número a mensagem exata:
   **`I allow callmebot to send me messages`**
3. Você recebe de volta uma **API key** (um número). Guarde.
   - Site oficial das instruções: https://www.callmebot.com/blog/free-api-whatsapp-messages/
4. Seu telefone no formato internacional, ex.: `+5522999998888`.

> Se um dia quiser trocar por Telegram (mais robusto que o CallMeBot), me avisa que eu adapto — é meia dúzia de linhas.

### 4. Cadastrar as credenciais no GitHub

No repositório: **Settings → Secrets and variables → Actions**.

Em **"Secrets"** (aba _Secrets_), clique em _New repository secret_ e crie:

| Nome              | Valor                                            |
|-------------------|--------------------------------------------------|
| `SMTP_USER`       | seu e-mail Gmail (ex.: `inthahouzz@gmail.com`)   |
| `SMTP_PASS`       | a App Password de 16 caracteres do passo 2       |
| `CALLMEBOT_PHONE` | seu telefone (ex.: `+5522999998888`)             |
| `CALLMEBOT_APIKEY`| a API key que o CallMeBot te mandou              |

Em **"Variables"** (aba _Variables_), clique em _New repository variable_ e crie:

| Nome               | Valor                        |
|--------------------|------------------------------|
| `EMAIL_ENABLED`    | `true`                       |
| `SMTP_HOST`        | `smtp.gmail.com`             |
| `SMTP_PORT`        | `587`                        |
| `EMAIL_TO`         | e-mail que vai RECEBER (pode ser o mesmo do `SMTP_USER`) |
| `WHATSAPP_ENABLED` | `true`                       |

> Por que uns em "Secrets" e outros em "Variables"? Secrets são escondidos
> (senha, telefone, apikey). Variables são só configuração não-sensível.

### 5. Rodar pela primeira vez

- Vá na aba **Actions** do repositório.
- Se aparecer um aviso pedindo para habilitar workflows, clique em habilitar.
- Selecione o workflow **"Monitor Transparência Pádua"** → **Run workflow**.
- O primeiro run registra a baseline e te manda um "Monitor ativado" (e-mail + WhatsApp).
- A partir daí ele roda sozinho todo dia às 08h (Brasília).

Pronto. Você não precisa mais abrir o site.

---

## Rodar localmente (opcional, para testar)

```bash
pip install -r requirements.txt

export EMAIL_ENABLED=true
export SMTP_HOST=smtp.gmail.com
export SMTP_PORT=587
export SMTP_USER=seuemail@gmail.com
export SMTP_PASS=app_password_16_digitos
export EMAIL_TO=seuemail@gmail.com
export WHATSAPP_ENABLED=true
export CALLMEBOT_PHONE=+5522999998888
export CALLMEBOT_APIKEY=123456

python monitor.py
```

Para testar sem mandar nada, deixe `EMAIL_ENABLED=false` e `WHATSAPP_ENABLED=false`
— ele só imprime na tela o que encontrou.

---

## Ajustes rápidos

- **Frequência:** edite o `cron` em `.github/workflows/monitor.yml`.
  Ex.: de hora em hora → `"0 * * * *"`; a cada 6h → `"0 */6 * * *"`.
  (Cron do GitHub é sempre em **UTC** — Brasília é UTC-3.)
- **Anos monitorados:** a variável `YEARS` no `monitor.py` (padrão: ano atual + anterior).
- **Só algumas seções:** edite/reduza o dicionário `SECTIONS` no `monitor.py`.
- **Trocar WhatsApp por Telegram/e-mail-só:** me chama que eu adapto.

---

## Manutenção e resiliência

- **Site fora do ar:** o script detecta que nenhuma seção respondeu e te avisa,
  sem apagar o histórico. No próximo run ele retoma.
- **Prefeitura muda o layout:** se ele acessar o site mas não achar mais nenhum
  documento (quando antes havia), manda um alerta de "provável mudança de estrutura".
  Aí é só me chamar para ajustar o parser (costuma ser rápido).
- **Nova secretaria criada:** a auto-descoberta pega sozinha, sem mexer no código.
- **Custo:** GitHub Actions no plano gratuito cobre de sobra um run diário. Zero servidor.

---

## Estrutura dos arquivos

```
monitor-transparencia-padua/
├── monitor.py                     # o script principal
├── requirements.txt               # dependências (requests, beautifulsoup4)
├── state/
│   └── seen.json                  # memória do que já foi visto (não apagar)
├── .github/workflows/monitor.yml  # agendamento diário no GitHub Actions
├── .gitignore
└── README.md                      # este arquivo
```
