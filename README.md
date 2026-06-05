# FinanceFlow — Controle de Gastos

Site pessoal para controle de gastos ao longo do ano, com login individual para até duas pessoas.

## Funcionalidades

- **Autenticação** — login e cadastro por e-mail e senha (Firebase Auth)
- **Dados individuais** — cada usuário vê apenas os próprios gastos
- **Dashboard mensal** — total do mês, maior gasto, média diária e total anual
- **Gráfico de categorias** — doughnut interativo com distribuição dos gastos
- **Visão anual** — gráfico de barras mês a mês + cards navegáveis por mês
- **Lista de gastos** — filtros por mês, categoria e texto livre
- **CRUD completo** — adicionar, editar e excluir gastos
- **9 categorias** — Alimentação, Transporte, Moradia, Lazer, Saúde, Vestuário, Educação, Contas e Outros

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Frontend | HTML5, CSS3, JavaScript (ES Modules) |
| Autenticação | Firebase Authentication |
| Banco de dados | Cloud Firestore |
| Gráficos | Chart.js 4 |

## Estrutura dos arquivos

```
CalculoGastos/
├── index.html               # Estrutura HTML (login + app)
├── style.css                # Estilo completo e responsivo
├── app.js                   # Lógica da aplicação + Firebase
├── README.md                # Este arquivo
└── CONFIGURAR_FIREBASE.md   # Guia de configuração do Firebase
```

## Estrutura no Firestore

```
users/
  {userId}/
    expenses/
      {expenseId}/
        amount       : number
        category     : string
        description  : string
        date         : string (YYYY-MM-DD)
        createdAt    : timestamp
```

Cada usuário acessa exclusivamente a própria subcoleção de gastos.

## Configuração

### 1. Firebase

Siga o passo a passo em `CONFIGURAR_FIREBASE.md`. Em resumo:

1. Crie um projeto em [console.firebase.google.com](https://console.firebase.google.com)
2. Ative **Authentication → E-mail/senha**
3. Crie o **Firestore Database**
4. Configure as regras de segurança:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/expenses/{expenseId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

5. Cole suas credenciais no topo de `app.js`

### 2. Rodar localmente

O site usa ES Modules e requer um servidor HTTP local — não funciona abrindo o arquivo diretamente.

**Opção A — VS Code:**
Instale a extensão [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) e clique em "Go Live".

**Opção B — Node.js:**
```bash
npx serve .
```

**Opção C — Python:**
```bash
python -m http.server 8000
```

Acesse `http://localhost:PORT` no navegador.

## Uso

1. Acesse o site e crie uma conta na aba **Cadastrar**
2. Faça login com e-mail e senha
3. Use o botão **+ Novo Gasto** para registrar despesas
4. Navegue pelos meses usando as setas no Dashboard
5. Acesse **Visão Anual** para ver o panorama do ano
6. Use a aba **Gastos** para filtrar e gerenciar todos os registros

Cada pessoa cria a própria conta — os dados ficam completamente separados no banco.
