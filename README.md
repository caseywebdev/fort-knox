# FortKnox

Get secrets from Vault.

```js
const FortKnox = require('fort-knox');

const vault = new FortKnox({
  authMethod: 'approle',
  authData: {
    role_id: '...',
    secret_id: '...'
  },
  vaultUrl: '...'
});

vault.get('secret/my/database/password').then(value => console.log(value));
```
