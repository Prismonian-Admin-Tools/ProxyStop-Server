'use strict';

// Talks to GUS's app-facing contract (see the "Global Admin Account
// System" README, section "The app-facing contract (/api/v1/*)").
// Every call is authenticated as THIS APPLICATION via X-App-Id/X-App-Secret
// (issued once by `npm run bootstrap -- --app <slug>` on the GUS side) —
// separate from the admin's own username/password, which travels in the
// request body and is verified by GUS, never by us.

function baseUrl() {
  return (process.env.GUS_BASE_URL || '').replace(/\/+$/, '');
}

function isConfigured() {
  return Boolean(baseUrl() && process.env.GUS_APP_ID && process.env.GUS_APP_SECRET);
}

async function callGus(path, body) {
  if (!isConfigured()) {
    throw new Error('GUS_BASE_URL, GUS_APP_ID, and GUS_APP_SECRET must be set — see .env.example.');
  }

  const response = await fetch(`${baseUrl()}/api/v1${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Id': process.env.GUS_APP_ID,
      'X-App-Secret': process.env.GUS_APP_SECRET,
    },
    body: JSON.stringify(body || {}),
  });

  let data = {};
  try { data = await response.json(); } catch (e) { /* empty body */ }
  return { httpStatus: response.status, data };
}

function login(username, password) {
  return callGus('/login', { username, password });
}

function validate(token) {
  return callGus('/validate', { token });
}

function logout(token) {
  return callGus('/logout', { token });
}

function changePassword(token, currentPassword, newPassword, confirmPassword) {
  return callGus('/change-password', { token, currentPassword, newPassword, confirmPassword });
}

module.exports = { isConfigured, login, validate, logout, changePassword };
