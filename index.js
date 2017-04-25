const _ = require('underscore');
const {default: Promise} = require('better-promise');
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

const checkForError = res =>
  res.status < 400 ?
  res.json() :
  res.text().then(text => {
    let error;
    try {
      error = new Error(JSON.parse(text).errors.join('\n'));
    } catch (er) {
      error = new Error(text || res.statusText);
    }

    throw error;
  });

const getToken = ({auth: {data, method}, tokenCache, url}) =>
  getEphemeral(tokenCache, 'token', () =>
    fetch(`${url}/v1/auth/${method}/login`, {
      method: 'POST',
      body: JSON.stringify(data)
    }).then(checkForError)
      .then(({auth: {client_token: value, lease_duration: duration}}) => ({
        value,
        expiresAt: toExpiresAt(duration)
      }))
  );

const get = ({auth, pathCache, tokenCache, url}, path) =>
  getEphemeral(pathCache, path, () =>
    getToken({auth, tokenCache, url})
      .then(token =>
        fetch(`${url}/v1/${path}`, {headers: {'X-Vault-Token': token}})
      )
      .then(checkForError)
      .then(({data: value, lease_duration: duration}) => ({
        value,
        expiresAt: toExpiresAt(duration)
      }))
  );

module.exports = class {
  constructor({auth: {data, method}, url}) {
    this.auth = {data, method};
    this.pathCache = {};
    this.tokenCache = {};
    this.url = url;
  }

  get(path) {
    return get(this, path);
  }
};
