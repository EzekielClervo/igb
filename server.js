// server.js
const express = require('express');
const axios = require('axios');
const tough = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');

const app = express();
// Use the PORT environment variable if set (Railway), otherwise default to 3000
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get('/', (req, res) => {
  res.send(`
    <h1>Instagram Cookie Generator</h1>
    <form method="POST" action="/login">
      <input name="username" placeholder="Username or Email" required /><br><br>
      <input name="password" type="password" placeholder="Password" required /><br><br>
      <button type="submit">Generate Cookies</button>
    </form>
  `);
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const jar = new tough.CookieJar();
  const client = wrapper(axios.create({ jar }));

  try {
    // 1) Fetch login page to get initial csrftoken
    const homeRes = await client.get('https://www.instagram.com/accounts/login/', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const rawCookies = homeRes.headers['set-cookie'] || [];
    const csrfCookie = rawCookies.find(c => c.startsWith('csrftoken='));
    const csrfToken = csrfCookie.split('=')[1].split(';')[0];

    // 2) Send AJAX login request
    const loginRes = await client.post(
      'https://www.instagram.com/accounts/login/ajax/',
      new URLSearchParams({
        username,
        enc_password: `#PWD_INSTAGRAM_BROWSER:0:${Math.floor(Date.now() / 1000)}:${password}`,
        queryParams: '{}',
        optIntoOneTap: 'false'
      }),
      {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'X-CSRFToken': csrfToken,
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': 'https://www.instagram.com/accounts/login/',
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    if (loginRes.data.authenticated) {
      // 3) Extract the five cookies you need
      const cookies = await jar.getCookies('https://www.instagram.com');
      const needed = cookies.filter(c =>
        ['csrftoken', 'sessionid', 'ds_user_id', 'mid', 'ig_did'].includes(c.key)
      );
      const cookieString = needed.map(c => `${c.key}=${c.value}`).join('; ');
      return res.send(`<h2>Your Cookies:</h2><pre>${cookieString}</pre>`);
    } else {
      return res.send('<h2>Login failed:</h2> Check your username/password and try again.');
    }
  } catch (err) {
    console.error('Login error:', err.message);
    return res.send(`<h2>Error:</h2><pre>${err.message}</pre>`);
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
