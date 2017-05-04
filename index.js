const _ = require('underscore');
const {default: Promise} = require('better-promise');
const fetch = require('node-fetch');

const getOrSet = (cache, key, fn) =>
  cache[key] || (cache[key] = Promise.resolve().then(fn).catch(er => {
    delete cache[key];
    throw er;
  }));

const getEphemeral = (cache, key, padding, fn) =>
  getOrSet(cache, key, fn).then(({expiresAt, value}) => {
    const expired = _.now() > expiresAt - (padding * 1000);
    if (!expired) return value;

    delete cache[key];
    return getEphemeral(cache, key, padding, fn);
  });

const toExpiresAt = duration => new Date(_.now() + (duration * 1000));

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

const getToken = ({auth: {data, method}, padding, tokenCache, url}) =>
  getEphemeral(tokenCache, 'token', padding, () =>
    fetch(`${url}/v1/auth/${method}/login`, {
      method: 'POST',
      body: JSON.stringify(data)
    }).then(checkForError)
      .then(({auth: {client_token: value, lease_duration: duration}}) => ({
        value,
        expiresAt: toExpiresAt(duration)
      }))
  );

const get = ({auth, padding, pathCache, tokenCache, url}, path) =>
  getEphemeral(pathCache, path, padding, () =>
    getToken({auth, padding, tokenCache, url})
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
  constructor({auth, padding = 0, url}) {
    this.options = {auth, padding, pathCache: {}, tokenCache: {}, url};
  }

  get(path, padding = this.padding) {
    return get(_.extend({}, this.options, {padding}), path);
  }
};
