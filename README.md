# Fort Knox

Get secrets from Vault.

```js
const FortKnox = require('fort-knox');

const vault = new FortKnox({
  auth: {
    data: {
      role_id: '...',
      secret_id: '...'
    },
    method: 'approle'
  },
  url: '...'
});

vault.get('secret/my/database/password').then(value => console.log(value));
```
