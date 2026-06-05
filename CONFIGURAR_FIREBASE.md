# Como configurar o Firebase

## 1. Criar o projeto no Firebase

1. Acesse https://console.firebase.google.com
2. Clique em "Adicionar projeto"
3. Dê um nome (ex: `controle-gastos`) e siga os passos

## 2. Ativar o Authentication

1. No menu lateral: **Authentication → Primeiros passos**
2. Clique em **Provedores de login → E-mail/senha**
3. Ative a opção e salve

## 3. Criar o Firestore

1. No menu lateral: **Firestore Database → Criar banco de dados**
2. Escolha o modo **Produção** (ou Teste durante desenvolvimento)
3. Selecione a região mais próxima (ex: `us-central`)

## 4. Regras de segurança do Firestore

Vá em **Firestore → Regras** e cole:

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

Isso garante que cada usuário só acessa os próprios gastos.

## 5. Obter as credenciais

1. Em **Configurações do projeto → Seus aplicativos**
2. Clique em **</>** (Web)
3. Registre o app e copie o objeto `firebaseConfig`

## 6. Colar no app.js

Abra `app.js` e substitua os valores em `firebaseConfig` (linhas iniciais):

```js
const firebaseConfig = {
  apiKey:            "AIzaSy...",
  authDomain:        "meu-projeto.firebaseapp.com",
  projectId:         "meu-projeto",
  storageBucket:     "meu-projeto.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abc...",
};
```

## 7. Rodar o site

Por ser um módulo ES6 (`type="module"`), o site precisa de um servidor local.
Use uma extensão como **Live Server** no VS Code, ou rode:

```
npx serve .
```

Não abra o `index.html` diretamente pelo explorador de arquivos (file://).
