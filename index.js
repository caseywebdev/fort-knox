const _ = require('underscore');
const fetch = require('node-fetch');

const getOrSet = (cache, key, fn) =>
  cache[key] && typeof cache[key].then === 'function' ? cache[key] :
  cache[key] ? Promise.resolve(cache[key]) :
  cache[key] = Promise.resolve().then(fn).then(val => cache[key] = val);

const getEphemeral = (cache, key, fn) => {
  const {[key]: {expiresAt = 0} = {}} = cache;
  if (_.now() > expiresAt) delete cache[key];
  return getOrSet(cache, key, fn).then(({value}) => value);
};

const toExpiresAt = duration => _.now() + ((duration - 60) * 1000);

const getToken = ({authData, authMethod, tokenCache, vaultUrl}) =>
  getEphemeral(tokenCache, 'token', () =>
    fetch(`${vaultUrl}/v1/auth/${authMethod}/login`, {
      method: 'POST',
      body: JSON.stringify(authData)
    }).then(res => res.json())
      .then(({auth: {client_token: value, lease_duration: duration}}) => ({
        value,
        expiresAt: toExpiresAt(duration)
      }))
  );

const get = ({authData, authMethod, pathCache, tokenCache, vaultUrl}, path) =>
  getEphemeral(pathCache, path, () =>
    getToken({authData, authMethod, tokenCache, vaultUrl}).then(token =>
      fetch(`${vaultUrl}/v1/${path}`, {headers: {'X-Vault-Token': token}})
        .then(res => res.json())
        .then(({data: value, lease_duration: duration}) => ({
          value,
          expiresAt: toExpiresAt(duration)
        }))
    )
  );

module.exports = class {
  constructor({authData, authMethod, vaultUrl}) {
    this.authData = authData;
    this.authMethod = authMethod;
    this.pathCache = {};
    this.tokenCache = {};
    this.vaultUrl = vaultUrl;
  }

  get(path) {
    return get(this, path);
  }
};
