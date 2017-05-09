const _ = require('underscore');
const {default: Promise} = require('better-promise');
const fetch = require('node-fetch');

const getOrSet = (cache, key, fn) =>
  cache[key] || (cache[key] = Promise.resolve()).then(fn).catch(er => {
    delete cache[key];
    throw er;
  });

const getEphemeral = (cache, key, fn) =>
  getOrSet(cache, key, fn).then(({expiresAt, value}) => {
    if (Date.now() < expiresAt) return value;

    delete cache[key];
    return getEphemeral(cache, key, fn);
  });

// Expire cached values at at 90% of duration.
const toExpiresAt = duration =>
  new Date(_.now() + Math.floor(0.9 * duration * 1000));

const checkForError = res =>
  res.status < 400 ?
  res.json() :
  res.text().then(text => {
    let error;
    try {
      error = new Error(JSON.parse(text).errors.join('\n'));
    } catch (er) {
      error = new Error(text || res.statusText || 'Unknown');
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
  constructor({auth, url}) {
    this.options = {auth, pathCache: {}, tokenCache: {}, url};
  }

  get(path) {
    return get(this.options, path);
  }
};
